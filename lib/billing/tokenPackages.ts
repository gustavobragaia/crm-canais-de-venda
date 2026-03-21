export interface TokenPackageConfig {
  slug: string
  name: string
  tokenAmount: number
  priceCents: number
  checkoutUrl: string
  recommended?: boolean
}

// 1 token = R$1,00
export const TOKEN_PACKAGES: TokenPackageConfig[] = [
  {
    slug: 'pack-50',
    name: '50 Tokens',
    tokenAmount: 50,
    priceCents: 5000,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_50 ?? '',
  },
  {
    slug: 'pack-75',
    name: '75 Tokens',
    tokenAmount: 75,
    priceCents: 7500,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_75 ?? '',
  },
  {
    slug: 'pack-100',
    name: '100 Tokens',
    tokenAmount: 100,
    priceCents: 10000,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_100 ?? '',
    recommended: true,
  },
  {
    slug: 'pack-150',
    name: '150 Tokens',
    tokenAmount: 150,
    priceCents: 15000,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_150 ?? '',
  },
  {
    slug: 'pack-200',
    name: '200 Tokens',
    tokenAmount: 200,
    priceCents: 20000,
    checkoutUrl: process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL_TOKENS_200 ?? '',
  },
]

export function findPackageBySlug(slug: string): TokenPackageConfig | undefined {
  return TOKEN_PACKAGES.find((pkg) => pkg.slug === slug)
}

// Conversão por agente
export const TOKEN_RATES = {
  buscador: { tokensPerUnit: 1, unitsPerToken: 2, unit: 'leads' },
  disparador: { tokensPerUnit: 1, unitsPerToken: 1, unit: 'disparo' },
  vendedor: { tokensPerUnit: 1, unitsPerToken: 10, unit: 'msgs' },
} as const
