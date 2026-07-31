'use client'

/**
 * Last line of defence: catches failures in the root layout itself, where the
 * normal error boundary has not mounted. It has to render its own <html> and
 * cannot rely on the app's stylesheet, so the styling here is inline on
 * purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#2d4a3a',
          color: '#fff',
          fontFamily: 'Inter, Arial, sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '26rem' }}>
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            AFRI<span style={{ color: '#FFA500' }}>MESH</span>
          </p>
          <h1 style={{ fontSize: '1.05rem', marginTop: '1.5rem' }}>AfriMesh is temporarily down</h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.75, lineHeight: 1.6 }}>
            Something failed before the page could load. Your orders, stock and wallet balance are
            unaffected.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.25rem',
              padding: '0.6rem 1.1rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: '#FFA500',
              color: '#1e3227',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '1rem' }}>
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
