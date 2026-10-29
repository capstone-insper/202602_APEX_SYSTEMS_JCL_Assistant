// Chats live in this browser only (localStorage): the backend keeps no history.
// Each signed-in user has a separate list, so whoever signs in next on the same browser
// does not see the previous user's chats. The old key without a user is ignored.

import { detect } from './detect.js'

const store = (user) => `jcl-assistant.chats.v1.${user}`

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// A log line pasted from SDSF or the job output, shown in monospace.
// System output is upper case, so "IEF450I means what?" stays prose.
export const isLogLine = (line) =>
  /^\s*\/\//.test(line) || /^\s*(\$HASP\d|I[A-Z]{2,4}\d{3,5}[A-Z]?\b)[^a-z]*$/.test(line)

const MAX_CHATS = 50 // keeps the store well under the browser quota

// A stored turn that would not render (old or hand-edited data) is dropped, not trusted.
function validTurn(t) {
  if (!t || typeof t.id !== 'string' || typeof t.question !== 'string') return false
  if (t.status !== 'done') return true
  const r = t.result
  return r && typeof r.answer === 'string' && Array.isArray(r.codes) && Array.isArray(r.citations) &&
    r.citations.every((c) => c && typeof c.source === 'string' && typeof c.locator === 'string' && typeof c.snippet === 'string')
}

export function loadChats(user) {
  try {
    const chats = JSON.parse(localStorage.getItem(store(user)))
    if (!Array.isArray(chats)) return []
    return chats
      .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.turns))
      .map((c) => ({
        ...c,
        turns: c.turns.filter(validTurn).map((t) =>
          // A request cut by a reload never comes back.
          t.status === 'loading' ? { ...t, status: 'error', error: 'Interrupted before the answer arrived.' } : t,
        ),
      }))
      .filter((c) => c.turns.length)
  } catch {
    return []
  }
}

// Last writer wins: two open tabs each keep their own list. Fine for a single operator.
export function saveChats(user, chats) {
  try {
    localStorage.setItem(store(user), JSON.stringify(chats.slice(0, MAX_CHATS)))
  } catch {
    // private window or full storage: history just does not persist
  }
}

// Title, job and main code of a chat, from its first question (and answer, when there is one).
export function chatMeta(chat) {
  const first = chat.turns[0]
  if (!first) return { title: 'New chat', job: null, code: null }
  const lines = first.question.split('\n').map((l) => l.trim()).filter(Boolean)
  const prose = lines.find((l) => !isLogLine(l))
  const { codes, job, step } = detect(first.question, first.result?.codes, first.result?.citations)
  const system = codes.find((c) => c.startsWith('S'))
  let title = prose || [step, system].filter(Boolean).join(' ') || lines[0] || 'Untitled'
  if (title.length > 60) title = title.slice(0, 57) + '...'
  return { title, job, code: system || codes[0] || null }
}
