import Pusher from 'pusher'
import PusherClient from 'pusher-js'

// Server-side Pusher instance
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
})

// Client-side Pusher instance (singleton)
let pusherClientInstance: PusherClient | null = null

export function getPusherClient(): PusherClient {
  if (!pusherClientInstance) {
    pusherClientInstance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    })

    pusherClientInstance.connection.bind('connected', () => {
      console.log('[PUSHER] Connected — socketId:', pusherClientInstance?.connection.socket_id)
    })
    pusherClientInstance.connection.bind('error', (err: unknown) => {
      console.error('[PUSHER] Connection error:', err)
    })
    pusherClientInstance.connection.bind('failed', () => {
      console.error('[PUSHER] Connection FAILED — check credentials')
    })
    pusherClientInstance.connection.bind('disconnected', () => {
      console.warn('[PUSHER] Disconnected')
    })
    pusherClientInstance.connection.bind('state_change', (states: { previous: string; current: string }) => {
      console.log(`[PUSHER] State: ${states.previous} → ${states.current}`)
    })
  }
  return pusherClientInstance
}
