import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of PostgreSQL and `pg` uses node natives.
  // Neither may be bundled — they must be required at runtime on the server.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  experimental: {
    // The commerce, payment and inventory modules all run server-side only.
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig
