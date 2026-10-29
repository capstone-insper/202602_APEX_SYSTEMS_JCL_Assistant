import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLogLine } from '../src/chats.js'
import { asText, runs } from '../src/format.js'

const shape = (text) => runs(text).map((r) => [r.type, r.lines.length])

test('paragraph, then a numbered list', () => {
  assert.deepEqual(shape('Cause [1].\n\nHow to fix:\n1. Find it.\n2. Fix it.'), [['p', 1], ['p', 1], ['ol', 2]])
})

test('fenced and bare JCL stay verbatim, blank lines kept inside a fence', () => {
  const r = runs('Change it:\n```\n//DD1 DD DISP=SHR\n\n//   DSN=A.B\n```\nDone.')
  assert.deepEqual(r.map((x) => x.type), ['p', 'pre', 'p'])
  assert.deepEqual(r[1].lines, ['//DD1 DD DISP=SHR', '', '//   DSN=A.B'])
  assert.deepEqual(shape('Use:\n//STEP15 EXEC PGM=X\n//SYSOUT DD SYSOUT=*'), [['p', 1], ['pre', 2]])
})

test('unclosed fence keeps its lines', () => {
  assert.deepEqual(shape('```\n//A DD *'), [['pre', 1]])
})

test('log lines are upper case system output, not prose', () => {
  assert.ok(isLogLine('IEF450I POSTTRAN STEP15 - ABEND=S0C7 U0000'))
  assert.ok(isLogLine('//* comment with lower case'))
  assert.ok(!isLogLine('IEF450I means what?'))
})

test('copy text has the question, the answer without bold and numbered sources', () => {
  const text = asText('S0C7?', {
    answer: '**Data exception** [1].',
    citations: [{ source: 'z/OS MVS System Codes', locator: '0Cx, p. 194', snippet: '' }],
  })
  assert.equal(text, 'Q: S0C7?\n\nData exception [1].\n\nSources:\n[1] z/OS MVS System Codes, 0Cx, p. 194')
})
