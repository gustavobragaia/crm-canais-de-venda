import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'

// 10 mensagens/segundo por workspace (envio de mensagens manuais)
export const sendRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 s'),
  prefix: 'ratelimit:send',
})

// 5 disparos/minuto por workspace
export const dispatchRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:dispatch',
})
