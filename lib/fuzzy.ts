// Small, dependency-free fuzzy matching helpers used by search/"find case".
// Levenshtein edit distance + a couple of conveniences built on top of it.

/** Classic Levenshtein edit distance between two strings (case-insensitive). */
export function levenshtein(a: string, b: string): number {
  a = a.toLowerCase()
  b = b.toLowerCase()
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j

  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = temp
    }
  }
  return dp[n]
}

/**
 * How many typos we tolerate in a whole-word match, scaled to word length.
 * Deliberately strict for short words — a 2-edit budget on a 3-4 letter
 * word (like "avi" or "jain") lets it match almost anything, which is what
 * caused unrelated cases to outrank real ones.
 */
function editThreshold(len: number): number {
  if (len <= 5) return 1
  if (len <= 9) return 2
  return 3
}

/**
 * Scores how well `needle` matches `haystack`, lower = better, or `null`
 * if it doesn't match at all. Used both to filter (null = excluded) and to
 * rank results (sort ascending by score) so an exact/whole-word hit always
 * outranks a loose typo-tolerant one.
 *
 *   0        exact whole-word match          "avi"    == "Avi"
 *   1        a word starts with needle        "avi"    ~  "avinash"
 *   2        plain substring anywhere         "avi"    ~  "bhavari" (mid-word)
 *   3 + dist typo-tolerant whole-word match    "gitika" ~  "Geetika" (dist 2 -> 5)
 */
export function matchScore(needle: string, haystack: string): number | null {
  const n = needle.trim().toLowerCase()
  const h = haystack.trim().toLowerCase()
  if (!n) return null

  const words = h.split(/\s+/).map((w) => w.replace(/[(),.]/g, '')).filter(Boolean)

  if (words.includes(n)) return 0
  if (words.some((w) => w.startsWith(n))) return 1
  if (h.includes(n)) return 2

  const threshold = editThreshold(n.length)
  let best: number | null = null
  for (const w of words) {
    if (Math.abs(w.length - n.length) > threshold) continue
    const d = levenshtein(n, w)
    if (d <= threshold) {
      const score = 3 + d
      if (best === null || score < best) best = score
    }
  }
  return best
}

/** Does `needle` appear in `haystack` at all (exact, substring, or typo-tolerant)? */
export function fuzzyMatch(needle: string, haystack: string): boolean {
  return matchScore(needle, haystack) !== null
}

export interface SuggestOptions {
  maxDistanceRatio?: number
  limit?: number
}

/**
 * Given a query and a pool of candidate phrases, returns the closest
 * non-exact single words ("did you mean…"), ranked by edit distance.
 */
export function suggestCorrections(query: string, candidates: string[], opts: SuggestOptions = {}): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const maxRatio = opts.maxDistanceRatio ?? 0.4
  const limit = opts.limit ?? 3
  const threshold = Math.max(1, Math.ceil(q.length * maxRatio))

  const seen = new Set<string>()
  const scored: { word: string; dist: number }[] = []

  for (const candidate of candidates) {
    if (!candidate) continue
    for (const raw of candidate.split(/\s+/)) {
      const w = raw.replace(/[(),.]/g, '').trim()
      if (!w) continue
      const key = w.toLowerCase()
      if (key === q || seen.has(key)) continue
      if (Math.abs(w.length - q.length) > threshold) continue
      const dist = levenshtein(q, w)
      if (dist > 0 && dist <= threshold) {
        seen.add(key)
        scored.push({ word: w, dist })
      }
    }
  }

  scored.sort((a, b) => a.dist - b.dist || a.word.localeCompare(b.word))
  return scored.slice(0, limit).map((s) => s.word)
}
