export function computeDeterministicRiskScore({
  liquidityToMcapRatio,
  top10Pct,
  largestClusterPct,
  insiderSupplyPct,
  clusterToLiqRatio,
  lpStatus,
}) {
  let score = 5

  // Liquidity vs market cap (exit risk)
  if (Number.isFinite(liquidityToMcapRatio)) {
    if (liquidityToMcapRatio < 0.05) {
      score = 9
    } else if (liquidityToMcapRatio < 0.1) {
      score = Math.max(score, 7)
    } else if (liquidityToMcapRatio > 0.3) {
      score = Math.min(score, 4)
    }
  }

  // Top 10 holder concentration
  if (Number.isFinite(top10Pct)) {
    if (top10Pct > 35) {
      score = Math.max(score, 8)
    } else if (top10Pct > 30) {
      score = Math.max(score, 7)
    } else if (top10Pct < 20) {
      score = Math.min(score, 4)
    }
  }

  // Bundler / largest cluster control
  if (Number.isFinite(largestClusterPct) && largestClusterPct > 20) {
    score = Math.max(score, 8)
  }

  // Insider / team-linked supply
  if (Number.isFinite(insiderSupplyPct) && insiderSupplyPct > 15) {
    score = Math.max(score, 8)
  }

  // Cluster-to-liquidity dump risk
  if (Number.isFinite(clusterToLiqRatio) && clusterToLiqRatio > 1) {
    score = Math.max(score, 8)
  }

  // LP status – unlocked is severe, burned is safer
  const lp = String(lpStatus || 'UNKNOWN').toUpperCase()
  if (lp === 'UNLOCKED') {
    score = Math.max(score, 9)
  } else if (lp === 'BURNED') {
    score = Math.min(score, 3)
  }

  return Math.max(1, Math.min(10, Math.round(score)))
}
