/**
 * 归一化 Levenshtein 比率，0~1，1 表示完全相同。
 */
export function stringSimilarity(a: string, b: string): number {
  const s1 = a.trim();
  const s2 = b.trim();
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const dist = levenshtein(s1, s2);
  return 1 - dist / Math.max(s1.length, s2.length);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n]!;
}
