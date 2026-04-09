'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function VendedorRedirect() {
  const router = useRouter()
  const { data: session } = useSession()
  const slug = session?.user?.workspaceSlug

  useEffect(() => {
    if (slug) {
      router.replace(`/${slug}/sora?tab=configurar`)
    }
  }, [slug, router])

  return null
}
