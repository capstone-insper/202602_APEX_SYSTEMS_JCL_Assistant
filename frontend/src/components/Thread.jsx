import { useEffect, useRef, useState } from 'react'
import { isNotFound } from '../api.js'
import { isLogLine } from '../chats.js'
import { detect, findCodes } from '../detect.js'
import { asText, LIST_RE, runs, seconds } from '../format.js'
import { firstName, greeting } from '../greeting.js'
import { notFoundTitle } from '../notFound.js'
import { Mark } from './Brand.jsx'
import { DetectedTags } from './Tags.jsx'

// Example questions a user would type (a log line is pasted, not picked from a list).
// All three are evaluation scenarios the RAG answered correctly on Nov 4.
const EXAMPLES = [
  { text: 'What does the INTCALC job do?' },
  { text: 'CREASTMT abended S322 in STEP040. How do I fix it?' },
  { text: 'Why would I run CLOSEFIL before the batch?' },
]

// What Freddie is doing while the answer is built: the same steps the RAG runs, in order.
const STEPS = ['Spotting the codes', 'Opening the IBM manuals', 'Reading the job’s JCL', 'Checking every citation']

export default function Thread({ user, chat, meta, busy, selection, onSend, onRetry, onCite, sources }) {
  const end = useRef(null)
  const [draft, setDraft] = useState('')
  const [focusTick, setFocusTick] = useState(0) // bumped to move the cursor to the composer
  const [hello] = useState(() => greeting({ name: firstName(user?.name) })) // once per chat: stable while typing
  const turns = chat?.turns || []
  const last = turns[turns.length - 1]

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, last?.status])

  return (
    <main className="thread">
      <header className="bar">
        <h1 className="ellipsis">{meta?.title || 'New chat'}</h1>
        {sources?.count > 0 && (
          <button
            className={'sources-toggle' + (sources.open ? ' on' : '')}
            onClick={sources.toggle}
            aria-pressed={sources.open}
            title={sources.open ? 'Hide sources' : 'Show sources'}
          >
            <SourcesIcon />
            Sources <span className="sources-count">{sources.count}</span>
          </button>
        )}
      </header>

      <div className="turns">
        {!turns.length && (
          <div className="empty">
            <h2 className="hello">{hello}</h2>
            <p className="hello-sub">Paste a job log line or an abend code, or ask something like:</p>
            <ul className="suggestions">
              {EXAMPLES.map((e) => (
                <li key={e.text}>
                  <span className="suggestion-arrow" aria-hidden="true">
                    ↳
                  </span>
                  <button
                    className="bubble"
                    onClick={() => {
                      setDraft(e.text)
                      setFocusTick((n) => n + 1)
                    }}
                  >
                    {e.text}
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
  if (turn.status === 'loading') return 'Freddie is reading the docs.'
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
      {status === 'done' && <Answer id={turn.id} question={question} result={result} activeN={activeN} onCite={onCite} />}
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
      <span className="role you">you</span>
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
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1700)
    return () => clearInterval(t)
  }, [])
  const label = step === 0 && codes.length ? `Spotting the codes: ${codes.join(', ')}` : STEPS[step]
  return (
    <div className="answer loading">
      <span className="role">
        <Mark size={22} />
      </span>
      <div className="thinking">
        <span className="thinking-cursor" />
        <span key={step} className="thinking-step">
          {label}…
        </span>
      </div>
    </div>
  )
}

function Answer({ id, question, result, activeN, onCite }) {
  const found = detect(question, result.codes, result.citations)
  if (isNotFound(result)) {
    return (
      <div className="answer">
        <span className="role">
          <Mark size={22} />
        </span>
        <div className="answer-body">
          <DetectedTags {...found} />
          <div className="notice warn">
            <strong>{notFoundTitle(id)}</strong> The IBM MVS manuals and the CardDemo JCL don’t cover this.
          </div>
          <p className="muted small">Try the job log, an abend code (S0C7, S806, S322) or a message id (IEF450I).</p>
        </div>
      </div>
    )
  }
  return (
    <div className="answer">
      <span className="role">
        <Mark size={22} />
      </span>
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
        placeholder={busy ? 'Freddie is on it...' : hasTurns ? 'Ask Freddie a follow-up, or paste another log' : 'Paste a job log or ask Freddie a question'}
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
            <span className="muted small">Enter to send, Shift+Enter for a new line</span>
          )}
        </div>
        <button className="btn primary ask" type="submit" disabled={busy || !text.trim()}>
          Ask Freddie
        </button>
      </div>
    </form>
  )
}

function SourcesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M10 3v10" />
    </svg>
  )
}
