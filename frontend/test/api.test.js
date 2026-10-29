import assert from 'node:assert/strict'
import { test } from 'node:test'
import { historyFor, NOT_FOUND } from '../src/api.js'

const done = (question, answer) => ({ question, status: 'done', result: { answer, codes: [], citations: [] } })

test('answered turns go oldest first; errors and pending turns are skipped', () => {
  const turns = [
    done('What does the INTCALC job do?', 'It computes interest [1].'),
    { question: 'And STEP15?', status: 'error', error: 'The service did not respond.' },
    done('Db2 bind?', NOT_FOUND),
    { question: 'what does line 41 do?', status: 'loading' },
  ]
  assert.deepEqual(historyFor(turns), [
    { question: 'What does the INTCALC job do?', answer: 'It computes interest [1].' },
    { question: 'Db2 bind?', answer: NOT_FOUND },
  ])
})

test('at most the last 10 turns, answers cut to the API limit', () => {
  const turns = Array.from({ length: 12 }, (_, i) => done(`q${i}`, 'x'.repeat(9000)))
  const h = historyFor(turns)
  assert.deepEqual(h.map((t) => t.question), ['q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11'])
  assert.equal(h[0].answer.length, 8000)
})

test('a new chat has no history', () => {
  assert.deepEqual(historyFor([]), [])
})
