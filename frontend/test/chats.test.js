import assert from 'node:assert/strict'
import { test } from 'node:test'

const data = new Map()
globalThis.localStorage = {
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => data.set(k, String(v)),
}

const { loadChats, saveChats } = await import('../src/chats.js')

const chat = { id: 'c1', turns: [{ id: 't1', question: 'S0C7?', status: 'error', error: 'x' }] }

test('each user has their own chats in the same browser', () => {
  saveChats('alex@company.com', [chat])
  assert.equal(loadChats('alex@company.com').length, 1)
  assert.deepEqual(loadChats('sam@company.com'), [])
})

test('chats saved before sign-in existed are not shown to anyone', () => {
  data.set('jcl-assistant.chats.v1', JSON.stringify([chat]))
  assert.deepEqual(loadChats('new@company.com'), [])
})
