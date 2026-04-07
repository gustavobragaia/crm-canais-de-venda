import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

// DDD → State mapping
const DDD_STATE: Record<string, string> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA', '99': 'MA',
}

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const workspaceId = session.user.workspaceId
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Fetch all conversations with a contactPhone this month
    const conversations = await db.conversation.findMany({
      where: {
        workspaceId,
        contactPhone: { not: null },
        lastMessageAt: { gte: startOfMonth },
      },
      select: { contactPhone: true },
    })

    // Count by state using DDD
    const stateCounts: Record<string, number> = {}

    for (const conv of conversations) {
      const phone = conv.contactPhone?.replace(/\D/g, '') ?? ''
      // Brazilian numbers: 55 + DDD(2) + number OR just DDD(2) + number
      let ddd = ''
      if (phone.startsWith('55') && phone.length >= 4) {
        ddd = phone.slice(2, 4)
      } else if (phone.length >= 2) {
        ddd = phone.slice(0, 2)
      }
      const state = DDD_STATE[ddd]
      if (state) {
        stateCounts[state] = (stateCounts[state] ?? 0) + 1
      }
    }

    // Return sorted list + DDD breakdown
    const dddCounts: Record<string, number> = {}
    for (const conv of conversations) {
      const phone = conv.contactPhone?.replace(/\D/g, '') ?? ''
      let ddd = ''
      if (phone.startsWith('55') && phone.length >= 4) {
        ddd = phone.slice(2, 4)
      } else if (phone.length >= 2) {
        ddd = phone.slice(0, 2)
      }
      if (ddd && DDD_STATE[ddd]) {
        dddCounts[ddd] = (dddCounts[ddd] ?? 0) + 1
      }
    }

    const stateList = Object.entries(stateCounts)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)

    const dddList = Object.entries(dddCounts)
      .map(([ddd, count]) => ({ ddd, state: DDD_STATE[ddd] ?? '?', count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ states: stateList, ddds: dddList })
  } catch (err) {
    console.error('[/api/analytics/region GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
