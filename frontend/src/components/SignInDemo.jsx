import { useEffect, useRef, useState } from 'react'
import Typed from 'typed.js'

// Sign-in screen showcase: a question is typed, then its answer appears, through a few fixed
// examples. Illustrative text taken from the eval scenarios, not live answers.
const EXAMPLES = [
  {
    q: 'IEF450I POSTTRAN STEP15 - ABEND=S0C7',
    codes: ['S0C7', 'IEF450I'],
    a: 'Data exception: a numeric field holds invalid packed-decimal data. Fix the bad record in DALYTRAN and rerun STEP15.',
    source: 'z/OS MVS System Codes · 0C7',
  },
  {
    q: 'What does the INTCALC job do?',
    codes: ['JOB INTCALC'],
    a: 'STEP15 runs CBACT04C, the interest calculator. It reads the category balances and writes the interest transactions to SYSTRAN.',
    source: 'carddemo/app/jcl/INTCALC.jcl',
  },
  {
    q: 'IEF450I INTCALC STEP15 - ABEND=S806',
    codes: ['S806', 'IEF450I'],
    a: 'The program could not be found. Check PGM=CBACT04C and that the load module is in the STEPLIB library.',
    source: 'z/OS MVS System Codes · 806',
  },
  {
    q: 'IEF212I POSTTRAN STEP15 DALYTRAN - DATA SET NOT FOUND',
    codes: ['IEF212I'],
    a: 'The data set on the DALYTRAN DD is not in the catalog. Check its name or create it before POSTTRAN runs.',
    source: 'z/OS MVS System Messages, Vol 8 · IEF212I',
  },
  {
    q: 'How do I write a REXX exec that lists my data sets?',
    codes: [],
    a: 'Not found in the docs.',
    source: null,
  },
]

export default function SignInDemo() {
  const typedRef = useRef(null)
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [shown, setShown] = useState(still ? 0 : null) // index of the example whose answer is visible

  useEffect(() => {
    if (still) {
      typedRef.current.textContent = EXAMPLES[0].q // no animation: one example, already answered
      return
    }
    const READ_MS = 4200 // time to read the answer before the question is erased
    let hide
    const typed = new Typed(typedRef.current, {
      strings: EXAMPLES.map((e) => e.q),
      typeSpeed: 32,
      backSpeed: 12,
      startDelay: 400,
      backDelay: READ_MS,
      loop: true,
      smartBackspace: false,
      onStringTyped: (i) => {
        setShown(i)
        hide = setTimeout(() => setShown(null), READ_MS) // the answer leaves as the erasing starts
      },
    })
    return () => {
      clearTimeout(hide)
      typed.destroy()
    }
  }, [still])

  const ex = shown === null ? null : EXAMPLES[shown]
  return (
    <div className="demo" aria-hidden="true">
      <div className="demo-q">
        <span className="demo-role">Q</span>
        <span>
          {/* typed.js adds its cursor right after this span; the wrapper keeps it on the same line */}
          <span className="demo-typed" ref={typedRef} />
        </span>
      </div>
      <div className={'demo-a' + (ex ? ' on' : '')}>
        <span className="demo-role">A</span>
        {ex && (
          <div>
            {ex.codes.length > 0 && (
              <div className="demo-codes">
                {ex.codes.map((c) => (
                  <span key={c} className={'demo-code' + (/^S[0-9A-F]{3}$/.test(c) ? ' abend' : '')}>
                    {c}
                  </span>
                ))}
              </div>
            )}
            <p className={ex.source ? '' : 'demo-nf'}>
              {ex.a}
              {ex.source && <span className="demo-ref">1</span>}
            </p>
            {ex.source && <p className="demo-src">[1] {ex.source}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
