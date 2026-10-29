import { useState } from 'react'
import { chatMeta } from '../chats.js'
import logo from '../assets/everforth-apex-white.png'
import { CodeTag } from './Tags.jsx'

export default function Sidebar({ user, onSignOut, chats, activeId, collapsed, onToggle, onOpen, onNew, onDelete, onClear }) {
  const [query, setQuery] = useState('')
  const [by, setBy] = useState('job')

  if (collapsed) {
    return (
      <aside className="sidebar rail">
        <button className="icon-btn" onClick={onToggle} title="Open sidebar" aria-label="Open sidebar">
          <PanelIcon />
        </button>
        <button className="icon-btn new" onClick={onNew} title="New chat" aria-label="New chat">
          +
        </button>
        <span className="avatar rail-avatar" title={`${user.name} (${user.email})`}>
          {initials(user.name)}
        </span>
      </aside>
    )
  }

  const q = query.trim().toUpperCase()
  const items = chats
    .map((c) => ({ chat: c, ...chatMeta(c) }))
    .filter(({ chat, title }) => !q || (title + ' ' + chat.turns.map((t) => t.question).join(' ')).toUpperCase().includes(q))

  const groups = new Map()
  for (const item of items) {
    const key = (by === 'job' ? item.job : item.code) || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  // Named groups A-Z, the catch-all last.
  const keys = [...groups.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b)))

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="brand">JCL Assistant</span>
        <button className="icon-btn" onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar">
          <PanelIcon />
        </button>
      </div>

      <button className="new-chat" onClick={onNew}>
        + New chat
      </button>
      <input
        className="search"
        type="search"
        aria-label="Filter chats"
        placeholder="Filter jobs, codes, chats"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="segmented" role="group" aria-label="Group chats">
        {['job', 'code'].map((k) => (
          <button key={k} aria-pressed={by === k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>
            By {k}
          </button>
        ))}
      </div>

      <nav className="chat-list">
        {!items.length && <p className="muted small pad">{chats.length ? 'No chat matches.' : 'No chats yet.'}</p>}
        {keys.map((key) => (
          <section key={key || '-'}>
            <h3 className="group">
              <span>{key || (by === 'job' ? 'No job' : 'No code')}</span>
              <span>{groups.get(key).length}</span>
            </h3>
            {groups.get(key).map(({ chat, title, code }) => (
              <div key={chat.id} className={'chat-item' + (chat.id === activeId ? ' active' : '')}>
                <button
                  className="chat-open"
                  aria-current={chat.id === activeId ? 'page' : undefined}
                  onClick={() => onOpen(chat.id)}
                  title={title}
                >
                  {code && <CodeTag code={code} small />}
                  <span className="ellipsis">{title}</span>
                </button>
                <button
                  className="chat-delete"
                  onClick={() => onDelete(chat.id, title)}
                  aria-label={`Delete chat: ${title}`}
                  title="Delete chat"
                >
                  ×
                </button>
              </div>
            ))}
          </section>
        ))}
        {chats.length > 0 && (
          <button className="side-btn" onClick={onClear}>
            Clear history
          </button>
        )}
      </nav>

      <img className="logo" src={logo} alt="Everforth Apex Systems" width="148" height="29" />
      <footer className="user">
        <span className="avatar">{initials(user.name)}</span>
        <div className="user-text">
          <span className="user-name ellipsis">{user.name}</span>
          <span className="user-role ellipsis">{user.email}</span>
        </div>
        <button className="icon-btn" onClick={onSignOut} title="Sign out" aria-label="Sign out">
          <SignOutIcon />
        </button>
      </footer>
    </aside>
  )
}

// "Alex Rivera" -> "AR"; one word -> its first letter.
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6.5 2.75h-3a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h3M10.5 11l3-3-3-3M13.25 8H6.5" />
    </svg>
  )
}

function PanelIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M6 3v10" />
    </svg>
  )
}
