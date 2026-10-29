// Answer text -> blocks for rendering, and answer -> plain text for the clipboard.

import { isLogLine } from './chats.js'

export const LIST_RE = /^\s*(?:\d+[.)]|[-*•])\s+/

// Runs of lines of one kind: paragraph ('p'), numbered list ('ol'), bullet list ('ul') or code
// ('pre': ``` fences or JCL/log lines, kept verbatim). A blank line ends a run, except inside a fence.
export function runs(text) {
  const out = []
  let fence = null
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      if (fence) {
        out.push(fence, null)
        fence = null
      } else fence = { type: 'pre', lines: [] }
      continue
    }
    if (fence) {
      fence.lines.push(line)
      continue
    }
    if (!line.trim()) {
      out.push(null)
      continue
    }
    const type = isLogLine(line) ? 'pre' : LIST_RE.test(line) ? (/^\s*\d/.test(line) ? 'ol' : 'ul') : 'p'
    const prev = out[out.length - 1]
    if (prev && prev.type === type) prev.lines.push(type === 'pre' ? line : line.trim())
    else out.push({ type, lines: [type === 'pre' ? line : line.trim()] })
  }
  if (fence) out.push(fence) // unclosed fence: keep what was there
  return out.filter(Boolean)
}

// Question, answer and numbered sources, ready to paste into a ticket.
export function asText(question, result) {
  const sources = result.citations.map((c, i) => `[${i + 1}] ${c.source}, ${c.locator}`)
  return [`Q: ${question}`, '', result.answer.replace(/\*\*/g, ''), '', ...(sources.length ? ['Sources:', ...sources] : [])]
    .join('\n')
    .trim()
}

export const seconds = (ms) => (ms < 10000 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)) + ' s'
