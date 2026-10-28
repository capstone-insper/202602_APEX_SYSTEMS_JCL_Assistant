import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detect, findCodes, findJobAndStep } from '../src/detect.js'

// Same cases as rag-llm/tests/test_codes.py, so the chips match what the backend looks up.
test('codes in a pasted log, in order, no repeats', () => {
  assert.deepEqual(
    findCodes('IEF450I POSTTRAN STEP15 - ABEND=S0C7 U0000\nIEA995I SYMPTOM DUMP OUTPUT SYSTEM COMPLETION CODE=0C7'),
    ['IEF450I', 'S0C7', 'IEA995I'],
  )
})

test('typo, reason code and bare abend forms', () => {
  assert.deepEqual(findCodes('step ended SOC7'), ['S0C7'])
  assert.deepEqual(findCodes('got S806-04 again'), ['S806'])
  assert.deepEqual(findCodes('abend 0C4 in STEP02'), ['S0C4'])
})

test('words and return codes are not codes', () => {
  assert.deepEqual(findCodes('SADD SFED return code 100, abend bad'), [])
})

test('job and step from an IEF message, step alone otherwise', () => {
  assert.deepEqual(findJobAndStep('IEF450I CREASTMT STEP040 - ABEND=S322'), { job: 'CREASTMT', step: 'STEP040' })
  assert.deepEqual(findJobAndStep('why did STEP15 fail?'), { job: null, step: 'STEP15' })
})

test('job from the answer when it cites exactly one JCL member', () => {
  const jcl = (name) => ({ source: `carddemo/app/jcl/${name}.jcl`, locator: 'lines 1-2', snippet: '' })
  assert.equal(detect('S0C7 why?', [], [jcl('POSTTRAN')]).job, 'POSTTRAN')
  assert.equal(detect('S0C7 why?', [], [jcl('POSTTRAN'), jcl('INTCALC')]).job, null)
})
