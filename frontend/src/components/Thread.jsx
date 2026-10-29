import { useEffect, useRef, useState } from 'react'
import { isNotFound } from '../api.js'
import { isLogLine } from '../chats.js'
import { detect, findCodes } from '../detect.js'
import { asText, LIST_RE, runs, seconds } from '../format.js'
import { DetectedTags } from './Tags.jsx'

const EXAMPLES = [
  'IEF450I POSTTRAN STEP15 - ABEND=S0C7 U0000 REASON=00000000',
  'What does the INTCALC job do?',
  'S806 in a CardDemo batch job, how do I fix it?',
]

export default function Thread({ chat, meta, busy, selection, onSend, onRetry, onCite }) {
  const end = useRef(null)
  const [draft, setDraft] = useState('')
  const [focusTick, setFocusTick] = useState(0) // bumped to move the cursor to the composer
  const turns = chat?.turns || []
  const last = turns[turns.length - 1]

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, last?.status])

  return (
    <main className="thread">
      <header className="bar">
        <h1 className="ellipsis">{meta?.title || 'New chat'}</h1>
      </header>

      <div className="turns">
        {!turns.length && (
          <div className="empty">
            <p>Paste a job log, an abend code or a message id, or ask about a CardDemo job.</p>
            <p className="muted">Answers come only from the CardDemo JCL and the IBM MVS manuals, with citations.</p>
            <ul className="examples">
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <button
                    onClick={() => {
                      setDraft(e)
                      setFocusTick((n) => n + 1)
                    }}
                  >
                    {e}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {turns.map((t) => (
          <Turn
            key={t.id}
            turn={t}
            activeN={selection?.turnId === t.id ? selection.n : null}
            onCite={(n) => onCite(t.id, n)}
            onRetry={() => onRetry(t)}
          />
        ))}
        <div ref={end} />
      </div>

      <p className="sr-only" role="status">
        {status(last)}
      </p>
      <Composer focusTick={focusTick} busy={busy} hasTurns={turns.length > 0} text={draft} setText={setDraft} onSend={onSend} />
    </main>
  )
}

// One line for screen readers when the last turn changes state.
function status(turn) {
  if (!turn) return ''
  if (turn.status === 'loading') return 'Searching the docs.'
  if (turn.status === 'error') return 'No answer: ' + turn.error
  if (isNotFound(turn.result)) return 'Not found in the docs.'
  return `Answer ready, ${turn.result.citations.length} sources.`
}

function Turn({ turn, activeN, onCite, onRetry }) {
  const { status, question, result, error } = turn
  return (
    <article className="turn">
      <Question text={question} />
      {status === 'loading' && <Loading question={question} />}
      {status === 'error' && (
        <div className="notice error" role="alert">
          <div>
            <strong>No answer.</strong> {error}
          </div>
          <button className="btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {status === 'done' && <Answer question={question} result={result} activeN={activeN} onCite={onCite} />}
      {status === 'done' && <AnswerFoot question={question} result={result} ms={turn.ms} />}
    </article>
  )
}

function Question({ text }) {
  // Prose as text, pasted log lines in monospace, in their original order.
  const blocks = []
  for (const line of text.split('\n')) {
    const log = isLogLine(line)
    const prev = blocks[blocks.length - 1]
    if (prev && prev.log === log) prev.lines.push(line)
    else blocks.push({ log, lines: [line] })
  }
  return (
    <div className="question">
      <span className="role">Q</span>
      <div className="question-body">
        {blocks.map((b, i) =>
          b.log ? (
            <pre key={i} className="log">
              {b.lines.join('\n')}
            </pre>
          ) : (
            <p key={i}>{b.lines.join('\n').trim()}</p>
          ),
        )}
      </div>
    </div>
  )
}

function Loading({ question }) {
  const codes = findCodes(question)
  return (
    <div className="answer loading">
      <span className="role">A</span>
      <div>
        <span className="pulse" /> {codes.length ? `Searching the docs for ${codes.join(', ')}...` : 'Searching the docs...'}
      </div>
    </div>
  )
}

function Answer({ question, result, activeN, onCite }) {
  const found = detect(question, result.codes, result.citations)
  if (isNotFound(result)) {
    return (
      <div className="answer">
        <span className="role">A</span>
        <div className="answer-body">
          <DetectedTags {...found} />
          <div className="notice warn">
            <strong>Not found in the docs.</strong> The CardDemo JCL and the IBM MVS manuals do not cover this, so
            there is no answer rather than a guess.
          </div>
          <p className="muted small">Try the job log, an abend code (S0C7, S806, S322) or a message id (IEF450I).</p>
        </div>
      </div>
    )
  }
  return (
    <div className="answer">
      <span className="role">A</span>
      <div className="answer-body">
        <DetectedTags {...found} />
        <AnswerText text={result.answer} activeN={activeN} onCite={onCite} count={result.citations.length} />
      </div>
    </div>
  )
}

function AnswerFoot({ question, result, ms }) {
  const [copied, setCopied] = useState(false)
  const n = result.citations.length
  return (
    <footer className="answer-foot">
      {ms != null && <span>{seconds(ms)}</span>}
      <span>{n === 1 ? '1 source' : `${n} sources`}</span>
      <button
        className={'btn small' + (copied ? ' done' : '')}
        onClick={async () => {
          setCopied(await copy(asText(question, result)))
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? 'Copied' : 'Copy answer'}
      </button>
    </footer>
  )
}

// The Clipboard API needs HTTPS; the server is plain HTTP, so fall back to execCommand.
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.append(el)
    el.select()
    const ok = document.execCommand('copy')
    el.remove()
    return ok
  }
}

// The model writes plain text with [n] markers, short lists and the odd **bold** or `code`.
function AnswerText({ text, activeN, onCite, count }) {
  function inline(s) {
    return s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g).map((part, i) => {
      const cite = part.match(/^\[(\d+)\]$/)
      if (cite) {
        const n = Number(cite[1])
        if (n > count) return null
        return (
          <button
            key={i}
            className={'cite' + (n === activeN ? ' on' : '')}
            onClick={() => onCite(n)}
            aria-label={`Source ${n}`}
            aria-pressed={n === activeN}
          >
            {n}
          </button>
        )
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{inline(part.slice(2, -2))}</strong>
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
      return part
    })
  }

  const out = runs(text).map((run, i) => {
    if (run.type === 'pre') return <pre key={i} className="log">{run.lines.join('\n')}</pre>
    if (run.type === 'p') return <p key={i}>{inline(run.lines.join(' '))}</p>
    const items = run.lines.map((l, j) => <li key={j}>{inline(l.replace(LIST_RE, ''))}</li>)
    if (run.type === 'ul') return <ul key={i}>{items}</ul>
    return (
      <ol key={i} start={parseInt(run.lines[0], 10) || 1}>
        {items}
      </ol>
    )
  })

  return <div className="answer-text">{out}</div>
}

function Composer({ focusTick, busy, hasTurns, text, setText, onSend }) {
  const box = useRef(null)
  const found = detect(text)

  useEffect(() => {
    if (focusTick) box.current.focus()
  }, [focusTick])

  useEffect(() => {
    const el = box.current
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }, [text])

  function submit() {
    const q = text.trim()
    if (!q || busy) return
    onSend(q)
    setText('')
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        ref={box}
        rows={2}
        value={text}
        maxLength={4000}
        autoFocus
        aria-label="Question or job log"
        placeholder={busy ? 'Waiting for the answer...' : hasTurns ? 'Ask a follow-up or paste another log' : 'Paste a job log or ask a question'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="composer-foot">
        <div className="composer-tags">
          {found.codes.length || found.job || found.step ? (
            <>
              <span className="muted small">Detected</span>
              <DetectedTags {...found} />
            </>
          ) : (
            <span className="muted small">Enter to ask, Shift+Enter for a new line. Each question is answered on its own.</span>
          )}
        </div>
        <button className="btn primary" type="submit" disabled={busy || !text.trim()}>
          Ask
        </button>
      </div>
    </form>
  )
}
