const trendScores = {
  rising: 25,
  stable: 15,
  declining: 5,
  unknown: 5
};

const difficultyScores = {
  low: 15,
  medium: 9,
  high: 3
};

const competitionScores = {
  low: 15,
  medium: 9,
  high: 3
};

export function scoreKeyword(keyword) {
  const firstSeen = new Date(keyword.first_seen_date);
  const ageDays = Number.isNaN(firstSeen.getTime())
    ? 999
    : Math.floor((Date.now() - firstSeen.getTime()) / 86400000);

  const freshness = ageDays <= 1 ? 30 : ageDays <= 7 ? 24 : ageDays <= 14 ? 18 : ageDays <= 30 ? 12 : 6;
  const trends = trendScores[keyword.google_trends_status] ?? trendScores.unknown;
  const production = difficultyScores[keyword.production_difficulty] ?? difficultyScores.medium;
  const serp = competitionScores[keyword.serp_competition] ?? competitionScores.medium;
  const variants = Math.min(10, Math.max(2, (keyword.variants?.length ?? 1) * 2));
  const risk = /\bunblocked\b|\bmod\b|\bhack\b/i.test(keyword.keyword) ? 2 : 5;

  const priority_score = freshness + trends + production + serp + variants + risk;
  const build_signal = priority_score >= 70 ? "should_build" : priority_score >= 50 ? "observe" : "reject";

  return {
    priority_score,
    build_signal,
    score_breakdown: {
      freshness,
      google_trends: trends,
      production_difficulty: production,
      serp_competition: serp,
      variant_space: variants,
      risk_control: risk
    }
  };
}
