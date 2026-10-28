import { isMessage } from '../detect.js'

// Abend codes in red, messages in blue, jobs and steps in grey.
export function CodeTag({ code, small }) {
  const kind = isMessage(code) ? 'msg' : 'abend'
  return <span className={`tag ${kind}${small ? ' small' : ''}`}>{code}</span>
}

export function Tag({ children, small }) {
  return <span className={'tag' + (small ? ' small' : '')}>{children}</span>
}

export function DetectedTags({ codes, job, step }) {
  if (!codes.length && !job && !step) return null
  return (
    <div className="tags">
      {codes.map((c) => (
        <CodeTag key={c} code={c} />
      ))}
      {job && <Tag>JOB {job}</Tag>}
      {step && <Tag>{step}</Tag>}
    </div>
  )
}
