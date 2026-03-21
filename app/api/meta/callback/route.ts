import { NextRequest, NextResponse } from 'next/server'

const VALID_CHANNEL_TYPES = ['INSTAGRAM', 'FACEBOOK']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !VALID_CHANNEL_TYPES.includes(state ?? '')) {
    const html = `<!DOCTYPE html><html><body><script>
      window.opener && window.opener.postMessage({ error: 'invalid_callback' }, window.location.origin);
      window.close();
    </script></body></html>`
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
  }

  const html = `<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage(
      { code: ${JSON.stringify(code)}, channelType: ${JSON.stringify(state)} },
      window.location.origin
    );
    window.close();
  </script></body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
