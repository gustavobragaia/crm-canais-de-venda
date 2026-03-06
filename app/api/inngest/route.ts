import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import {
  processWhatsAppMessage,
  processInstagramMessage,
  processFacebookMessage,
} from '@/lib/inngest-functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processWhatsAppMessage, processInstagramMessage, processFacebookMessage],
})
