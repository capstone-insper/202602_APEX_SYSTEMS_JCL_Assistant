// POST /ask: {question, history?} -> {answer, codes[], citations[{source, locator, snippet}]}.
// The [n] markers in answer point at citations[n-1].
// /auth/login, /auth/logout and /auth/me: the session lives in an HttpOnly cookie the browser
// sends by itself (same origin), so nothing here touches the token.

export const NOT_FOUND = 'Not found in the docs.'

// history: earlier exchanges of the chat, oldest first. The API takes 10 (and uses the last 3).
const HISTORY_TURNS = 10
const ANSWER_CHARS = 8000

// Answered turns only: a network or service error has no answer to send; "Not found" does.
export const historyFor = (turns) =>
  turns
    .filter((t) => t.status === 'done' && t.result)
    .slice(-HISTORY_TURNS)
    .map((t) => ({ question: t.question, answer: t.result.answer.slice(0, ANSWER_CHARS) }))

// A bit over nginx's proxy_read_timeout (120 s, infra/setup.sh), so its 504 normally comes first.
const TIMEOUT_MS = 130_000
const SLOW = 'The answer took too long (the model may be busy). Try again.'
const DOWN = 'The service is not available right now.'

// The session is gone (expired, signed out in another tab, account disabled): sign in again.
export class SignedOut extends Error {
  constructor() {
    super('Your session ended. Sign in again to continue.')
  }
}

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// The API's own message when there is one; nginx error pages are HTML.
async function failure(r) {
  let detail
  try {
    detail = (await r.json()).detail
  } catch {
    // no JSON body
  }
  if (typeof detail === 'string') return new Error(detail)
  // 502/503 with no detail: nginx could not reach the API (service down or restarting).
  return new Error(r.status === 502 || r.status === 503 ? DOWN : `The service answered ${r.status}.`)
}

export async function ask(question, history = []) {
  let r
  try {
    r = await fetch('/ask', {
      ...json(history.length ? { question, history } : { question }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? SLOW : 'The service did not respond.')
  }
  if (r.ok) return r.json()
  if (r.status === 401) throw new SignedOut()
  if (r.status === 429) throw new Error('Too many questions in a short time. Wait a moment.')
  if (r.status === 504) throw new Error(SLOW)
  throw await failure(r)
}

// The signed-in user ({email, name}), or null when there is no valid session.
export async function me() {
  let r
  try {
    r = await fetch('/auth/me')
  } catch {
    throw new Error(DOWN)
  }
  if (r.ok) return r.json()
  if (r.status === 401) return null
  throw await failure(r)
}

export async function login(email, password, remember) {
  let r
  try {
    r = await fetch('/auth/login', json({ email, password, remember }))
  } catch {
    throw new Error('The service did not respond.')
  }
  if (r.ok) return r.json()
  const e = await failure(r)
  // nginx's own limit (HTML page) before the API's lockout message
  if (r.status === 429 && e.message.startsWith('The service answered')) {
    throw new Error('Too many sign-in attempts. Wait a minute and try again.')
  }
  throw e
}

// Throws when the server did not end the session: the HttpOnly cookie is out of the app's reach,
// so showing the sign-in screen anyway would sign the same user back in on the next load.
export async function logout() {
  let r
  try {
    r = await fetch('/auth/logout', { method: 'POST' })
  } catch {
    throw new Error('The service did not respond, so you are still signed in.')
  }
  if (!r.ok) throw new Error(`${(await failure(r)).message} You are still signed in.`)
}

export const isNotFound = (result) =>
  result.citations.length === 0 && result.answer.startsWith('Not found in the docs')
