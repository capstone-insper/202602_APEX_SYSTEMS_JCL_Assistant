// What Freddie says when the docs do not cover a question. The backend still answers
// "Not found in the docs." (api.js isNotFound); these lines are only what the user reads.
export const NOT_FOUND_TITLES = [
  'That’s outside my manuals.',
  'Nothing in the docs on this one.',
  'That one’s not in my catalog.', // IEF212I: data set not found in the catalog
]

// The same line for the same answer (seeded by the turn id), so it does not change on re-render.
export function notFoundTitle(seed = '') {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return NOT_FOUND_TITLES[h % NOT_FOUND_TITLES.length]
}
