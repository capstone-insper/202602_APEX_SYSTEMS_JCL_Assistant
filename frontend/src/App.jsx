import { useEffect, useState } from 'react'
import { ask } from './api.js'
import { chatMeta, loadChats, newId, saveChats } from './chats.js'
import Confirm from './components/Confirm.jsx'
import Sidebar from './components/Sidebar.jsx'
import Sources from './components/Sources.jsx'
import Thread from './components/Thread.jsx'

export default function App() {
  const [chats, setChats] = useState(loadChats)
  const [activeId, setActiveId] = useState(null) // null: a new, empty chat
  const [selection, setSelection] = useState(null) // {turnId, n}: citation open in the sources panel
  const [confirm, setConfirm] = useState(null) // {title, body, action, run}: a delete waiting for a yes
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches)

  useEffect(() => saveChats(chats), [chats])

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

  async function run(chatId, turnId, question) {
    const start = performance.now()
    try {
      const result = await ask(question)
      patchTurn(chatId, turnId, { status: 'done', result, error: null, ms: Math.round(performance.now() - start) })
    } catch (e) {
      patchTurn(chatId, turnId, { status: 'error', error: e.message })
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
    run(chatId, turn.id, question)
  }

  function retry(turn) {
    patchTurn(chat.id, turn.id, { status: 'loading', error: null })
    setSelection(null)
    run(chat.id, turn.id, turn.question)
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
