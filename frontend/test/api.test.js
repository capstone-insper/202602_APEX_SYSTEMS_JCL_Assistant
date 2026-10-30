import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ask, historyFor, login, logout, me, NOT_FOUND, SignedOut } from '../src/api.js'

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

// fetch answers with the given status and JSON body (or an HTML page when body is a string).
const reply = (status, body) => async () => ({
  ok: status < 300,
  status,
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
})

test('/ask without a session throws SignedOut', async () => {
  globalThis.fetch = reply(401, { detail: 'Sign in to continue.' })
  await assert.rejects(ask('S0C7?'), SignedOut)
})

test('me() is null when signed out and the user when signed in', async () => {
  globalThis.fetch = reply(401, { detail: 'Sign in to continue.' })
  assert.equal(await me(), null)
  globalThis.fetch = reply(200, { email: 'alex@company.com', name: 'Alex Rivera' })
  assert.deepEqual(await me(), { email: 'alex@company.com', name: 'Alex Rivera' })
})

test('login shows the API message, and a plain message for nginx limits', async () => {
  globalThis.fetch = reply(401, { detail: 'Wrong email or password.' })
  await assert.rejects(login('a@b.c', 'x', false), { message: 'Wrong email or password.' })
  globalThis.fetch = reply(429, { detail: 'Too many failed attempts. Try again in 15 minutes.' })
  await assert.rejects(login('a@b.c', 'x', false), { message: 'Too many failed attempts. Try again in 15 minutes.' })
  globalThis.fetch = reply(429, '<html>')
  await assert.rejects(login('a@b.c', 'x', false), { message: 'Too many sign-in attempts. Wait a minute and try again.' })
  globalThis.fetch = async () => {
    throw new TypeError('network')
  }
  await assert.rejects(login('a@b.c', 'x', false), { message: 'The service did not respond.' })
})

test('logout() fails loudly when the server did not end the session', async () => {
  globalThis.fetch = reply(204, null)
  await logout() // resolves
  globalThis.fetch = reply(502, '<html>')
  await assert.rejects(logout(), { message: 'The service is not available right now. You are still signed in.' })
  globalThis.fetch = async () => {
    throw new TypeError('network')
  }
  await assert.rejects(logout(), /still signed in/)
})

test('a 502 from nginx while asking reads as service down', async () => {
  globalThis.fetch = reply(502, '<html>')
  await assert.rejects(ask('S0C7?'), { message: 'The service is not available right now.' })
})
