import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import {
  processInstagramMessage,
  processFacebookMessage,
  processEvolutionMessage,
  processEvolutionConnectionUpdate,
  processEvolutionQRCodeUpdated,
} from '@/lib/inngest-functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processInstagramMessage,
    processFacebookMessage,
    processEvolutionMessage,
    processEvolutionConnectionUpdate,
    processEvolutionQRCodeUpdated,
  ],
})
