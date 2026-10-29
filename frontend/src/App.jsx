import { useEffect, useState } from 'react'
import { ask, historyFor, logout, me, SignedOut } from './api.js'
import { chatMeta, loadChats, newId, saveChats } from './chats.js'
import Confirm from './components/Confirm.jsx'
import Sidebar from './components/Sidebar.jsx'
import SignIn from './components/SignIn.jsx'
import Sources from './components/Sources.jsx'
import Thread from './components/Thread.jsx'

// The sign-in screen until there is a session, then the chat of that user.
export default function App() {
  const [user, setUser] = useState(undefined) // undefined: checking the session; null: signed out
  const [down, setDown] = useState(null) // the session could not be checked: the service is down
  const [notice, setNotice] = useState(null) // why the sign-in screen is back

  const check = () => me().then(setUser, (e) => setDown(e.message))

  useEffect(() => {
    check()
  }, [])

  // Another tab may have signed out, or signed in as someone else: check again on coming back.
  useEffect(() => {
    if (!user) return
    const recheck = () =>
      me().then(
        (u) => {
          if (u?.email === user.email) return
          if (!u) setNotice('You were signed out in another tab or window.')
          setUser(u)
        },
        () => {}, // service down: the next question will say so
      )
    window.addEventListener('focus', recheck)
    return () => window.removeEventListener('focus', recheck)
  }, [user])

  if (down) {
    return (
      <Unavailable
        message={down}
        onRetry={() => {
          setDown(null)
          check()
        }}
      />
    )
  }
  if (user === undefined) return <div className="boot" aria-busy="true" />
  if (user === null) {
    return (
      <SignIn
        notice={notice}
        onSignedIn={(u) => {
          setNotice(null)
          setUser(u)
        }}
      />
    )
  }
  return (
    <Chat
      key={user.email}
      user={user}
      onSignOut={() => logout().then(() => setUser(null))}
      onSessionEnded={() => {
        setNotice('Your session ended. Sign in again; your question is kept in its chat.')
        setUser(null)
      }}
    />
  )
}

function Unavailable({ message, onRetry }) {
  return (
    <main className="unavailable" role="alert">
      <span className="brand">JCL Assistant</span>
      <p>{message} Your session, if any, is kept.</p>
      <button className="btn primary" onClick={onRetry}>
        Try again
      </button>
    </main>
  )
}

function Chat({ user, onSignOut, onSessionEnded }) {
  const [chats, setChats] = useState(() => loadChats(user.email))
  const [activeId, setActiveId] = useState(null) // null: a new, empty chat
  const [selection, setSelection] = useState(null) // {turnId, n}: citation open in the sources panel
  const [confirm, setConfirm] = useState(null) // {title, body, action, run}: a delete waiting for a yes
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [ended, setEnded] = useState(false) // the session expired during a question

  // In this order: the failed turn is saved before the app goes back to the sign-in screen.
  useEffect(() => saveChats(user.email, chats), [user.email, chats])
  useEffect(() => {
    if (ended) onSessionEnded()
  }, [ended, onSessionEnded])

  const chat = chats.find((c) => c.id === activeId) || null
  const turns = chat?.turns || []
  const busy = turns.some((t) => t.status === 'loading')

  // The panel follows the last answer unless a citation in this chat was clicked.
  const selectedTurn =
    turns.find((t) => t.id === selection?.turnId) || turns[turns.length - 1] || null
  const selectedN = selection && selection.turnId === selectedTurn?.id ? selection.n : 1

  function patchTurn(chatId, turnId, patch) {
    setChats((cs) =>
      cs.map((c) =>
        c.id !== chatId ? c : { ...c, turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) },
      ),
    )
  }

  async function run(chatId, turnId, question, history) {
    const start = performance.now()
    try {
      const result = await ask(question, history)
      patchTurn(chatId, turnId, { status: 'done', result, error: null, ms: Math.round(performance.now() - start) })
    } catch (e) {
      patchTurn(chatId, turnId, { status: 'error', error: e.message })
      if (e instanceof SignedOut) setEnded(true) // "Try again" works after signing back in
    }
  }

  function send(question) {
    const turn = { id: newId(), question, status: 'loading' }
    const chatId = chat?.id || newId()
    setChats((cs) =>
      chat
        ? cs.map((c) => (c.id === chatId ? { ...c, turns: [...c.turns, turn] } : c))
        : [{ id: chatId, createdAt: Date.now(), turns: [turn] }, ...cs],
    )
    setActiveId(chatId)
    setSelection(null)
    run(chatId, turn.id, question, historyFor(turns))
  }

  // The history is what came before this question, not the turns asked after it.
  function retry(turn) {
    patchTurn(chat.id, turn.id, { status: 'loading', error: null })
    setSelection(null)
    run(chat.id, turn.id, turn.question, historyFor(turns.slice(0, turns.indexOf(turn))))
  }

  // A sign-out the server did not confirm keeps the user here, with the reason.
  function signOut() {
    onSignOut().catch((e) =>
      setConfirm({ title: 'Could not sign out', body: e.message, action: 'Try again', run: signOut }),
    )
  }

  function remove(id) {
    setChats((cs) => cs.filter((c) => c.id !== id))
    if (id === activeId) open(null)
  }

  function clear() {
    setChats([])
    open(null)
  }

  function open(id) {
    setActiveId(id)
    setSelection(null)
    if (window.matchMedia('(max-width: 760px)').matches) setCollapsed(true) // the sidebar covers the thread there
  }

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar
        user={user}
        onSignOut={() =>
          setConfirm({
            title: 'Sign out?',
            body: 'Your chats stay in this browser for the next time you sign in.',
            action: 'Sign out',
            run: signOut,
          })
        }
        chats={chats}
        activeId={activeId}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onOpen={open}
        onNew={() => open(null)}
        onDelete={(id, title) =>
          setConfirm({
            title: 'Delete this chat?',
            body: `"${title}" and its answers will be removed from this browser. This cannot be undone.`,
            action: 'Delete chat',
            run: () => remove(id),
          })
        }
        onClear={() =>
          setConfirm({
            title: 'Delete all chats?',
            body: `${chats.length === 1 ? 'The only chat' : `All ${chats.length} chats`} will be removed from this browser. This cannot be undone.`,
            action: 'Delete all',
            run: clear,
          })
        }
      />
      <Thread
        key={activeId || 'new'}
        chat={chat}
        meta={chat ? chatMeta(chat) : null}
        busy={busy}
        selection={selectedTurn && { turnId: selectedTurn.id, n: selectedN }}
        onSend={send}
        onRetry={retry}
        onCite={(turnId, n) => setSelection({ turnId, n })}
      />
      <Sources
        turn={selectedTurn}
        n={selectedN}
        onSelect={(n) => selectedTurn && setSelection({ turnId: selectedTurn.id, n })}
      />
      <Confirm
        request={confirm}
        onClose={(ok) => {
          if (ok) confirm?.run()
          setConfirm(null)
        }}
      />
    </div>
  )
}
