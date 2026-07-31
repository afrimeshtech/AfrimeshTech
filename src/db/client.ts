/**
 * Database access for the modular monolith.
 *
 * Everything above this file speaks one narrow interface (`Sql`), so the
 * physical database can change without touching a single module. Two drivers
 * are supported and both speak the same PostgreSQL dialect:
 *
 *   DATABASE_URL set    -> node-postgres against a real PostgreSQL server
 *   DATABASE_URL unset  -> PGlite, PostgreSQL 16 compiled to WASM, stored in
 *                          ./.pgdata. Zero install, for local development.
 *
 * We use parameterised SQL rather than an ORM because the platform's core
 * differentiator - proximity ranking over live stock - is a weighted SQL
 * expression that no ORM expresses well, and because the SAD calls for the
 * query layer to stay portable across future service extraction.
 */

export type Row = Record<string, unknown>

/**
 * The row type is an unconstrained generic on purpose. Constraining it to
 * `Record<string, unknown>` would reject every plain `interface` a module
 * declares for its query results, because interfaces do not carry an implicit
 * index signature - and those interfaces are the whole point of typing the
 * query layer.
 */
export interface Sql {
  /** Run a parameterised query and return all rows. */
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>
  /** Run a parameterised query and return the first row, or null. */
  one<T = Row>(text: string, params?: unknown[]): Promise<T | null>
  /** Run one or more statements with no parameters (DDL, migrations). */
  exec(text: string): Promise<void>
}

/**
 * PostgreSQL type OIDs that both drivers hand back as strings by default.
 * NUMERIC has arbitrary precision, so JS `number` is technically lossy - but
 * every column we declare NUMERIC is a small bounded value (ratings 0-5,
 * weights 0-100, percentages, distances). All *money* is BIGINT minor units,
 * which stays exact well beyond any realistic transaction value.
 */
const NUMERIC_OID = 1700
const INT8_OID = 20
const PGLITE_PARSERS = { [NUMERIC_OID]: (v: string) => Number(v) }

let sqlPromise: Promise<Sql> | null = null

// Reuse across Next.js hot reloads; a second PGlite instance would fail to
// take the lock on the data directory.
const globalForDb = globalThis as unknown as { __afrimeshSql?: Promise<Sql> }

export function getSql(): Promise<Sql> {
  if (globalForDb.__afrimeshSql) return globalForDb.__afrimeshSql
  if (!sqlPromise) {
    sqlPromise = process.env.DATABASE_URL ? createNodePostgres() : createPglite()
    globalForDb.__afrimeshSql = sqlPromise
  }
  return sqlPromise
}

export function databaseDriver(): 'postgres' | 'pglite' {
  return process.env.DATABASE_URL ? 'postgres' : 'pglite'
}

// ---------------------------------------------------------------------------
// PGlite (embedded PostgreSQL)
// ---------------------------------------------------------------------------

async function createPglite(): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite')
  const dir = process.env.PGLITE_DIR ?? '.pgdata'
  const pg = new PGlite(dir)
  await pg.waitReady

  const sql: Sql = {
    async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
      const res = await pg.query(text, params as never[], { parsers: PGLITE_PARSERS })
      return res.rows as T[]
    },
    async one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
      const rows = await sql.query<T>(text, params)
      return rows[0] ?? null
    },
    async exec(text: string) {
      await pg.exec(text)
    },
  }
  return withTransactionSupport(
    sql,
    (fn) =>
      pg.transaction(async (tx) => {
        const txSql: Sql = {
          async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
            const res = await tx.query(text, params as never[], { parsers: PGLITE_PARSERS })
            return res.rows as T[]
          },
          async one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
            const rows = await txSql.query<T>(text, params)
            return rows[0] ?? null
          },
          async exec(text: string) {
            await tx.exec(text)
          },
        }
        return fn(txSql)
      }) as Promise<unknown>,
  )
}

// ---------------------------------------------------------------------------
// node-postgres (real PostgreSQL server)
// ---------------------------------------------------------------------------

async function createNodePostgres(): Promise<Sql> {
  const pgModule = await import('pg')
  const pg = (pgModule as unknown as { default?: typeof pgModule }).default ?? pgModule

  // Match PGlite's behaviour so module code never sees driver differences.
  pg.types.setTypeParser(INT8_OID, (v: string) => Number(v))
  pg.types.setTypeParser(NUMERIC_OID, (v: string) => Number(v))

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
  })

  const sql: Sql = {
    async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
      const res = await pool.query(text, params)
      return res.rows as T[]
    },
    async one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
      const rows = await sql.query<T>(text, params)
      return rows[0] ?? null
    },
    async exec(text: string) {
      await pool.query(text)
    },
  }

  return withTransactionSupport(sql, async (fn) => {
    const client = await pool.connect()
    const txSql: Sql = {
      async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
        const res = await client.query(text, params)
        return res.rows as T[]
      },
      async one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
        const rows = await txSql.query<T>(text, params)
        return rows[0] ?? null
      },
      async exec(text: string) {
        await client.query(text)
      },
    }
    try {
      await client.query('BEGIN')
      const out = await fn(txSql)
      await client.query('COMMIT')
      return out
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

type TxRunner = (fn: (tx: Sql) => Promise<unknown>) => Promise<unknown>

const TX_RUNNER = Symbol.for('afrimesh.txRunner')

function withTransactionSupport(sql: Sql, runner: TxRunner): Sql {
  ;(sql as unknown as Record<symbol, TxRunner>)[TX_RUNNER] = runner
  return sql
}

/**
 * Run `fn` inside a database transaction. Used wherever an operation must be
 * atomic across module boundaries - placing an order reserves stock, debits a
 * wallet and writes ledger entries, and either all of it happens or none of it.
 */
export async function withTx<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  const sql = await getSql()
  const runner = (sql as unknown as Record<symbol, TxRunner | undefined>)[TX_RUNNER]
  if (!runner) throw new Error('Active database driver does not support transactions')
  return runner(fn as (tx: Sql) => Promise<unknown>) as Promise<T>
}
