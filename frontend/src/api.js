// POST /ask: {question} -> {answer, codes[], citations[{source, locator, snippet}]}.
// The [n] markers in answer point at citations[n-1].

export const NOT_FOUND = 'Not found in the docs.'

// A bit over nginx's proxy_read_timeout (120 s, infra/setup.sh), so its 504 normally comes first.
const TIMEOUT_MS = 130_000
const SLOW = 'The answer took too long (the model may be busy). Try again.'

export async function ask(question) {
  let r
  try {
    r = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? SLOW : 'The service did not respond.')
  }
  if (r.ok) return r.json()
  if (r.status === 429) throw new Error('Too many questions in a short time. Wait a moment.')
  if (r.status === 504) throw new Error(SLOW)
  let detail
  try {
    detail = (await r.json()).detail
  } catch {
    // nginx error pages are HTML
  }
  if (typeof detail === 'string') throw new Error(detail)
  // 502/503 with no detail: nginx could not reach the API (service down or restarting).
  throw new Error(r.status === 502 || r.status === 503 ? 'The service is not available right now.' : `The service answered ${r.status}.`)
}

export const isNotFound = (result) =>
  result.citations.length === 0 && result.answer.startsWith('Not found in the docs')
