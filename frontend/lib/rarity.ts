// lib/rarity.ts
export type Attribute = {
  trait_type: string;
  value: string | number | boolean | null;
};
export type TokenLike = { token_id: number | string; attributes: Attribute[] };

type CountMap = Record<string, Record<string, number>>;
type ScoreMap = Record<string, Record<string, number>>;
export type RankInfo = { rank: number; score: number };

function normVal(v: unknown) {
  if (v === null || v === undefined || v === "") return "None";
  return String(v);
}

export function buildTraitCounts(tokens: TokenLike[]): CountMap {
  const counts: CountMap = {};
  for (const t of tokens) {
    for (const a of t.attributes || []) {
      const type = String(a?.trait_type ?? "Untyped");
      const val = normVal(a?.value);
      counts[type] ??= {};
      counts[type][val] = (counts[type][val] ?? 0) + 1;
    }
  }
  return counts;
}

export function buildTraitScores(counts: CountMap, total: number): ScoreMap {
  const scores: ScoreMap = {};
  for (const type of Object.keys(counts)) {
    scores[type] = {};
    for (const val of Object.keys(counts[type])) {
      const freq = counts[type][val] / total;
      scores[type][val] = freq > 0 ? 1 / freq : 0;
    }
  }
  return scores;
}

export function calcTokenScore(t: TokenLike, traitScores: ScoreMap): number {
  let sum = 0;
  for (const a of t.attributes || []) {
    const type = String(a?.trait_type ?? "Untyped");
    const val = normVal(a?.value);
    sum += traitScores[type]?.[val] ?? 0;
  }
  return sum;
}

/** breakdown skor per attribute (buat ditampilin di modal) */
export function calcTokenBreakdown(t: TokenLike, traitScores: ScoreMap) {
  return (t.attributes || []).map((a) => {
    const type = String(a?.trait_type ?? "Untyped");
    const val = normVal(a?.value);
    return {
      trait_type: type,
      value: val,
      score: traitScores[type]?.[val] ?? 0,
    };
  });
}

export function rankTokens<T extends TokenLike>(tokens: T[]) {
  const counts = buildTraitCounts(tokens);
  const scores = buildTraitScores(counts, tokens.length);

  const withScore = tokens.map((t) => ({
    token: t,
    score: calcTokenScore(t, scores),
  }));

  withScore.sort((a, b) => b.score - a.score);

  // NORMALISASI key ke STRING
  const rankById = new Map<string, RankInfo>();
  withScore.forEach((row, i) => {
    const key = String(row.token.token_id);
    rankById.set(key, { rank: i + 1, score: row.score });
  });

  return { rankById, total: tokens.length, traitScores: scores };
}
