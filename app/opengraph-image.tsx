import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Closio CRM - Seu Centralizador de Vendas Unificado'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#2b7fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Logo icon */}
        <svg width="96" height="96" viewBox="0 0 40 40" fill="none">
          <path
            d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="16" cy="20" r="12" stroke="white" strokeWidth="4" fill="none" />
        </svg>

        {/* Title */}
        <div
          style={{
            marginTop: 32,
            fontSize: 64,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '-1px',
          }}
        >
          Closio CRM
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: 16,
            fontSize: 28,
            color: 'rgba(255,255,255,0.85)',
            fontWeight: 400,
          }}
        >
          Seu Centralizador de Vendas Unificado
        </div>
      </div>
    ),
    { ...size }
  )
}
