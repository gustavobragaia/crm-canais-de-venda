import { Repeat } from 'lucide-react'

export function RecurringBadge() {
  return (
    <span
      title="Cliente recorrente"
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium"
    >
      <Repeat size={10} />
      Recorrente
    </span>
  )
}
