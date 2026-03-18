'use client'

import { Package } from 'lucide-react'
import { PlansContent } from '@/components/billing/PlansContent'

export default function PlansPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center gap-3">
        <Package size={18} className="text-[var(--primary)]" />
        <h1 className="font-semibold text-gray-900">Planos</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <PlansContent />
      </div>
    </div>
  )
}
