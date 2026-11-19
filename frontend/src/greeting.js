// Greetings for the empty chat, from the browser's local time (the user's own time zone).
// Most failed jobs are found by the night or morning shift. One is drawn per new chat.
// {name} is the user's first name; those greetings are skipped when there is no name.
export const GREETINGS = {
  night: [
    'Up late, {name}? Let’s find what broke.',
    'Night shift. What failed?',
    'Still up, {name}? Let’s get that job running again.',
    'Quiet hours, loud abends. What happened?',
    'Burning the midnight oil? Let’s see that abend.',
  ],
  morning: [
    'Morning, {name}. What broke overnight?',
    'Good morning. How did the night run go?',
    'Morning. Anything fail in the batch window?',
    'Coffee first, {name}, then the job log.',
    'Morning. Which step went down?',
  ],
  afternoon: [
    'Afternoon, {name}. Which job is acting up?',
    'Good afternoon. What needs a look?',
    'Got an abend for me, {name}?',
    'Which step tripped up?',
    'Afternoon. Which abend is it this time?',
  ],
  evening: [
    'Evening, {name}. Which job needs a look?',
    'Good evening. Anything to check before the night run?',
    'Evening. What’s on the job log?',
    'Which abend are we chasing tonight, {name}?',
    'Wrapping up? Let’s clear that failed job first.',
  ],
}

export function period(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

// "Alex Rivera" -> "Alex". Only the first name, as people greet each other.
export const firstName = (fullName = '') => fullName.trim().split(/\s+/)[0] || ''

export function greeting({ date = new Date(), random = Math.random, name = '' } = {}) {
  const options = GREETINGS[period(date)].filter((g) => name || !g.includes('{name}'))
  return options[Math.floor(random() * options.length)].replace('{name}', name)
}
