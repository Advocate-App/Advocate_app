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
 * Does `needle` appear in `haystack`? Checks a plain substring first
 * (cheap and exact), then falls back to comparing `needle` against each
 * word in `haystack` so small typos still match ("gitika" ~ "Geetika").
 */
export function fuzzyMatch(needle: string, haystack: string, maxDistanceRatio = 0.34): boolean {
  const n = needle.trim().toLowerCase()
  const h = haystack.trim().toLowerCase()
  if (!n) return false
  if (h.includes(n)) return true

  const threshold = Math.max(1, Math.ceil(n.length * maxDistanceRatio))
  return h.split(/\s+/).some((word) => {
    const w = word.replace(/[(),.]/g, '')
    if (!w) return false
    // Skip words whose length is wildly different -- avoids a short query
    // "matching" every unrelated long word within the edit-distance budget.
    if (Math.abs(w.length - n.length) > threshold) return false
    return levenshtein(n, w) <= threshold
  })
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
