// Freddie's brand: the name is written the way a JCL statement starts, with "//" in columns 1-2,
// followed by a blinking block cursor, because Freddie is someone you talk to.
// Named after Fred Brooks, who led the IBM OS/360 team that created JCL.

// Always on the dark (night) background: lime on white has too little contrast, so the brand has one look.
export function Wordmark({ size = 18, cursor = true }) {
  return (
    <span className="wordmark" style={{ fontSize: size }} aria-label="Freddie">
      <span className="wm-slash" aria-hidden="true">
        //
      </span>
      <span className="wm-name" aria-hidden="true">
        freddie
      </span>
      {cursor && <span className="wm-cursor" aria-hidden="true" />}
    </span>
  )
}

// The square mark: avatar of Freddie's answers, app icon and favicon.
export function Mark({ size = 24, title }) {
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      <rect width="32" height="32" rx="8" fill="var(--night)" />
      <path d="M11.5 8.5 7 23.5M18 8.5l-4.5 15" stroke="var(--phosphor)" strokeWidth="3" strokeLinecap="round" />
      <rect x="19.5" y="18.5" width="5.5" height="5" rx="1" fill="var(--phosphor)" />
    </svg>
  )
}
