import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTokenBalance } from '@/lib/billing/tokenService'
import { TOKEN_PACKAGES } from '@/lib/billing/tokenPackages'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const workspaceId = session.user.workspaceId
    const balance = await getTokenBalance(workspaceId)

    const packages = TOKEN_PACKAGES.map((pkg) => ({
      slug: pkg.slug,
      name: pkg.name,
      tokenAmount: pkg.tokenAmount,
      priceCents: pkg.priceCents,
      recommended: pkg.recommended ?? false,
      checkoutUrl: pkg.checkoutUrl
        ? `${pkg.checkoutUrl}?utm_content=${workspaceId}&utm_source=tokens_${pkg.slug}&utm_medium=token_package`
        : null,
    }))

    return NextResponse.json({ balance, packages })
  } catch (error) {
    console.error('[TOKENS GET]', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
