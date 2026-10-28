// What the user pasted, recognised as they type: abend codes and messages (same rules as
// rag-llm/rag/codes.py, which the backend uses) plus the job and step names of a job log.

const SYSTEM_RE = /\bS([0-9A-F]{3})(?:-[0-9A-F]{2})?\b/g // S0C7, S806-04
const TYPO_RE = /\bSOC([0-9A-F])\b/g // SOC7 typed with the letter O
const BARE_RE = /\b(?:ABEND(?:\s+CODE)?|COMPLETION\s+CODE)\s*[=:]?\s*S?((?=[0-9A-F]*\d)[0-9A-F]{3})\b/g
const MESSAGE_RE = /\b(I[EFG][A-Z]{1,3}\d{3,5}[A-Z])\b/g // IEF450I
// "IEF450I POSTTRAN STEP15 - ABEND=S0C7" and friends: message id, job name, step name.
const LOG_RE = /\bIEF\d{3}I\s+([A-Z@#$][A-Z0-9@#$]{0,7})\s+([A-Z@#$][A-Z0-9@#$]{0,7})\b/g
const STEP_RE = /\bSTEP[A-Z0-9@#$]{0,4}\d[A-Z0-9@#$]*\b/g // STEP15, STEP040

function all(re, text, fn) {
  return [...text.matchAll(re)].map((m) => [m.index, fn(m)])
}

export function findCodes(text) {
  const up = text.toUpperCase()
  const found = [
    ...all(SYSTEM_RE, up, (m) => (/\d/.test(m[1]) ? 'S' + m[1] : null)), // not SADD, SFED
    ...all(TYPO_RE, up, (m) => 'S0C' + m[1]),
    ...all(BARE_RE, up, (m) => 'S' + m[1]),
    ...all(MESSAGE_RE, up, (m) => m[1]),
  ]
  return unique(found)
}

export function findJobAndStep(text) {
  const up = text.toUpperCase()
  const log = [...up.matchAll(LOG_RE)][0]
  const step = log ? log[2] : (up.match(STEP_RE) || [])[0]
  return { job: log ? log[1] : null, step: step || null }
}

// Everything worth a chip: codes first, then job and step. Without a job log in the question,
// the job comes from the answer when it cites exactly one CardDemo JCL member.
export function detect(text, codes = [], citations = []) {
  const { job, step } = findJobAndStep(text)
  const members = new Set(
    citations.filter((c) => c.source.startsWith('carddemo/')).map((c) => c.source.split('/').pop().split('.')[0].toUpperCase()),
  )
  return {
    codes: [...new Set([...codes, ...findCodes(text)])],
    job: job || (members.size === 1 ? [...members][0] : null),
    step,
  }
}

export const isMessage = (code) => /^I[EFG]/.test(code)

function unique(found) {
  return [
    ...new Set(
      found
        .filter(([, v]) => v)
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v),
    ),
  ]
}
