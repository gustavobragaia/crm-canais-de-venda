export function ClosioIcon({ size = 32, color = '#2b7fff' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-label="Closio CRM"
    >
      <path
        d="M 28 8 A 12 12 0 0 1 34 20 A 12 12 0 0 1 28 32"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="20" r="12" stroke={color} strokeWidth="4" fill="none" />
    </svg>
  )
}
