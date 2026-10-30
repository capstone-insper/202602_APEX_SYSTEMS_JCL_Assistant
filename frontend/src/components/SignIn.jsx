import { useRef, useState } from 'react'
import { login } from '../api.js'
import logo from '../assets/everforth-apex-white.png'
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
          <h1 className="signin-name">JCL Assistant</h1>
          <p className="signin-tagline">Understand JCL jobs and abends in seconds.</p>
          <SignInDemo />
        </div>
        <img className="logo" src={logo} alt="Everforth Apex Systems" width="148" height="29" />
      </section>

      <main className="signin-main">
        <form className="signin-form" onSubmit={submit}>
          <span className="signin-name signin-small-name">JCL Assistant</span>
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
