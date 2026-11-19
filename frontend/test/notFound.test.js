import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NOT_FOUND_TITLES, notFoundTitle } from '../src/notFound.js'

test('same turn, same line', () => {
  assert.equal(notFoundTitle('turn-42'), notFoundTitle('turn-42'))
  assert.ok(NOT_FOUND_TITLES.includes(notFoundTitle('')))
})

test('all three lines show up across turns', () => {
  const seen = new Set(Array.from({ length: 60 }, (_, i) => notFoundTitle(`t${i}`)))
  assert.equal(seen.size, NOT_FOUND_TITLES.length)
})
