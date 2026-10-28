import { isNotFound } from '../api.js'
import { detect } from '../detect.js'

// Same commit the ingestion clones (rag-llm/ingest/jcl.py, CARDDEMO_SHA), so line anchors match.
const CARDDEMO = 'https://github.com/aws-samples/aws-mainframe-modernization-carddemo/blob/59cc6c2fd7ebd7ef7925cad552a01a4b8b6e4d5e/'
const IBM_PDFS = {
  'z/OS MVS System Codes': 'https://www.ibm.com/docs/en/SSLTBW_3.1.0/pdf/ieah700_v3r1.pdf',
  'z/OS MVS System Messages, Vol 8 (IEF-IGD)': 'https://www.ibm.com/docs/en/SSLTBW_3.1.0/pdf/ieam800_v3r1.pdf',
}

// {kind, name, where, href} for a citation's source and locator.
function describe({ source, locator }) {
  if (source.startsWith('carddemo/')) {
    const path = source.slice('carddemo/'.length)
    const lines = locator.match(/lines (\d+)-(\d+)/)
    return {
      kind: 'JCL',
      name: path.split('/').pop(),
      where: `${path.split('/').slice(0, -1).join('/')} · ${locator}`,
      href: CARDDEMO + path + (lines ? `#L${lines[1]}-L${lines[2]}` : ''),
    }
  }
  return {
    kind: 'IBM',
    name: source.replace(/^z\/OS MVS /, ''),
    where: `${source} · ${locator.replace(/^(\S+), p\. (\d+)$/, 'entry $1, page $2')}`,
    href: IBM_PDFS[source],
  }
}

export default function Sources({ turn, n, onSelect }) {
  const cites = turn?.status === 'done' ? turn.result.citations : []
  const count = turn?.status === 'done' ? `${cites.length} cited` : turn?.status === 'loading' ? 'loading' : ''

  let body
  if (!turn) body = <p className="muted center">Citations in an answer open here.</p>
  else if (turn.status === 'loading') body = <p className="muted center">Waiting for the answer...</p>
  else if (turn.status === 'error') body = <p className="muted center">No sources: the request failed.</p>
  else if (isNotFound(turn.result) || !cites.length) body = <p className="muted center">No matching source for this question.</p>
  else {
    const cite = cites[Math.min(n, cites.length) - 1]
    body = (
      <>
        <ol className="source-list">
          {cites.map((c, i) => {
            const d = describe(c)
            return (
              <li key={i}>
                <button
                  className={i + 1 === n ? 'on' : ''}
                  aria-current={i + 1 === n ? 'true' : undefined}
                  onClick={() => onSelect(i + 1)}
                >
                  <span className="cite static">{i + 1}</span>
                  <span className={`kind ${d.kind.toLowerCase()}`}>{d.kind}</span>
                  <span className="ellipsis">{d.name}</span>
                  <span className="muted small ellipsis locator">{c.locator}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <SourceDetail cite={cite} tokens={tokens(turn)} />
      </>
    )
  }

  return (
    <aside className={'sources' + (cites.length ? '' : ' idle')}>
      <header className="bar">
        <h2>Sources</h2>
        <span className="muted small">{count}</span>
      </header>
      <div className="sources-body">{body}</div>
    </aside>
  )
}

function SourceDetail({ cite, tokens }) {
  const d = describe(cite)
  return (
    <section className="source-detail">
      <div className="source-head">
        <div className="ellipsis">
          <strong>{d.name}</strong>
          <div className="muted small ellipsis">{d.where}</div>
        </div>
        {d.href && (
          <a href={d.href} target="_blank" rel="noreferrer">
            {d.kind === 'JCL' ? 'Open on GitHub' : 'Open PDF'}
          </a>
        )}
      </div>
      <pre className="snippet">
        {cite.snippet.split('\n').map((line, i) => (
          <span key={i} className={hits(line, tokens) ? 'hl' : undefined}>
            {line + '\n'}
          </span>
        ))}
      </pre>
      <p className="muted small">Excerpt sent to the model. The full entry is in the linked source.</p>
    </section>
  )
}

// Words worth highlighting in a snippet: codes (and their IBM form, 0C7 for S0C7), job and step.
function tokens(turn) {
  const { codes, job, step } = detect(turn.question, turn.result.codes, turn.result.citations)
  const t = codes.flatMap((c) => (/^S[0-9A-F]{3}$/.test(c) ? [c, c.slice(1)] : [c]))
  return [...t, job, step].filter(Boolean)
}

const escape = (s) => s.replace(/[$]/g, '\\$') // job names may hold $, # or @
const hits = (line, tokens) =>
  tokens.some((t) => new RegExp(`(^|[^A-Z0-9@#$])${escape(t)}($|[^A-Z0-9@#$])`).test(line.toUpperCase()))
