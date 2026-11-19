import { useRef, useState } from 'react'
import { login } from '../api.js'
import logo from '../assets/everforth-apex-white.png'
import { Wordmark } from './Brand.jsx'
import SignInDemo from './SignInDemo.jsx'

// Sign-in screen (Figma mockups 0a and 0b). Accounts are created by an admin, so there is no
// sign-up link and no password reset by email: both go through the administrator.
// notice: why the user is here again (session ended, signed out in another tab), or null.
export default function SignIn({ notice, onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const passwordRef = useRef(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await login(email, password, remember))
    } catch (err) {
      setError(err.message)
      setPassword('')
      setBusy(false)
      passwordRef.current?.focus()
    }
  }

  return (
    <div className="signin">
      <section className="signin-brand">
        <div className="signin-pitch">
          <h1 className="signin-name">
            <Wordmark size={60} />
          </h1>
          <p className="signin-tagline">
            Every failed job, explained.
          </p>
          <p className="signin-sub">Paste the log line. Freddie finds the cause, the fix and the manual page it came from.</p>
          <SignInDemo />
        </div>
        <div className="signin-foot">
          <img className="logo" src={logo} alt="Everforth Apex Systems" width="132" height="26" />
        </div>
      </section>

      {/* phones: the brand panel is hidden, so the wordmark keeps its dark background in a top bar */}
      <header className="signin-bar">
        <Wordmark size={24} />
      </header>

      <main className="signin-main">
        <form className="signin-form" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="muted">Use the account your administrator created for you.</p>
          {notice && !error && (
            <div className="notice signin-info" role="status">
              {notice}
            </div>
          )}
          {error && (
            <div className="notice signin-error" role="alert">
              {error}
            </div>
          )}
          <label>
            Work email
            <input
              type="email"
              autoComplete="username"
              placeholder="name@company.com"
              required
              autoFocus
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              aria-invalid={error ? 'true' : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in for 30 days
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
          <p className="muted small">No account, or forgot your password? Ask your administrator.</p>
        </form>
      </main>
    </div>
  )
}
