import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstName, GREETINGS, greeting, period } from '../src/greeting.js'

const at = (h) => new Date(2026, 10, 19, h, 30)

test('period follows the local hour', () => {
  assert.equal(period(at(2)), 'night')
  assert.equal(period(at(5)), 'morning')
  assert.equal(period(at(11)), 'morning')
  assert.equal(period(at(12)), 'afternoon')
  assert.equal(period(at(18)), 'evening')
  assert.equal(period(at(23)), 'evening')
})

test('first name only', () => {
  assert.equal(firstName('Alex Rivera'), 'Alex')
  assert.equal(firstName('  Sam  '), 'Sam')
  assert.equal(firstName(''), '')
})

test('greeting puts the first name in, from its period', () => {
  assert.equal(greeting({ date: at(9), random: () => 0, name: 'Alex' }), 'Morning, Alex. What broke overnight?')
  for (let i = 0; i < 50; i++) {
    const g = greeting({ date: at(3), name: 'Alex' })
    assert.ok(GREETINGS.night.map((t) => t.replace('{name}', 'Alex')).includes(g))
    assert.ok(!g.includes('{name}'))
  }
})

test('without a name, only greetings that do not need one', () => {
  for (let i = 0; i < 50; i++) assert.ok(!greeting({ date: at(15) }).includes('{name}'))
  assert.equal(greeting({ date: at(15), random: () => 0 }), 'Good afternoon. What needs a look?')
})
