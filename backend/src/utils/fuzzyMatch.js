
// Small dependency-free fuzzy matcher used to resolve a name mentioned in
// a chatbot message (e.g. "wash basin") against real records pulled live
// from the database (e.g. "Wash Basin White"), so the bot isn't limited to
// exact-string matches.

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();
  if (!aLower || !bLower) return 0;
  if (aLower === bLower) return 1;
  if (bLower.includes(aLower) || aLower.includes(bLower)) return 0.85;

  const distance = levenshtein(aLower, bLower);
  const maxLen = Math.max(aLower.length, bLower.length);
  return 1 - distance / maxLen;
}

/**
 * Finds the best match for `query` among `candidates` (array of {id, name}).
 * Returns null if nothing clears the minimum similarity threshold.
 */
function findBestMatch(query, candidates, { minScore = 0.45, key = 'name' } = {}) {
  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = similarity(query, candidate[key]);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= minScore ? { match: best, score: bestScore } : null;
}

module.exports = { similarity, findBestMatch };
