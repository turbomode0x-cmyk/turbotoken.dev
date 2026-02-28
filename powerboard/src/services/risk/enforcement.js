import { toFiniteNumber, toPercentNumber, firstFinite } from '../api/normalizers.js'
import { computeDeterministicRiskScore } from './scoring.js'
import { computeChartLifecycle } from './lifecycle.js'

export function normalizeSecurityEvidence(analysis, xrayPayload) {
  const output = analysis && typeof analysis === 'object' ? { ...analysis } : {}
  const security = output.security_checks && typeof output.security_checks === 'object'
    ? { ...output.security_checks }
    : {}

  const evidence = Array.isArray(security.dev_sell_evidence) ? security.dev_sell_evidence : []
  const hasEvidence = evidence.length > 0
  const creatorBalanceRaw = xrayPayload?.rugcheck?.creatorBalance
  const creatorBalance = Number(creatorBalanceRaw)
  const creatorWalletEmpty = Number.isFinite(creatorBalance) && creatorBalance === 0
  security.creator_wallet_empty = Number.isFinite(creatorBalance) ? creatorWalletEmpty : null

  // Hard rule: never claim creator sold without explicit evidence.
  if (security.dev_selling_while_promoting === true && !hasEvidence) {
    security.dev_selling_while_promoting = null
  }

  const notes = []
  if (creatorWalletEmpty) {
    notes.push('Creator wallet balance is currently 0 tokens.')
  }
  if (security.dev_selling_while_promoting !== true) {
    notes.push('No direct on-chain proof of creator selling was found in current data.')
  }
  notes.push(
    'Data source: RugCheck + Solana RPC snapshot. Empty creator wallet is a red flag, but not standalone proof of a creator sell.',
  )

  const existingDetails = typeof security.details === 'string' ? security.details.trim() : ''
  security.details = [existingDetails, ...notes].filter(Boolean).join(' ')

  output.security_checks = security
  return output
}

export function enforceDeterministicRiskRules(analysis, xrayPayload) {
  const output = analysis && typeof analysis === 'object' ? { ...analysis } : {}
  const liquidity = output.liquidity_analysis && typeof output.liquidity_analysis === 'object'
    ? { ...output.liquidity_analysis }
    : {}
  const distribution = output.three_pillars?.distribution && typeof output.three_pillars.distribution === 'object'
    ? { ...output.three_pillars.distribution }
    : {}
  const security = output.security_checks && typeof output.security_checks === 'object'
    ? { ...output.security_checks }
    : {}

  // Extract deterministic signals from xrayPayload
  const rugcheckSignals = xrayPayload?.rugcheckSignals || {}
  const bubblemapsSignals = xrayPayload?.bubblemapsSignals || {}

  // Calculate liquidity_to_mcap_ratio if missing
  const marketCap = Number(liquidity.market_cap || 0)
  const liquidityUsd = Number(liquidity.liquidity || 0)
  const liquidityToMcapRatio =
    marketCap > 0 ? liquidityUsd / marketCap : liquidity.liquidity_to_mcap_ratio || null
  liquidity.liquidity_to_mcap_ratio = liquidityToMcapRatio

  // Hard threshold: liquidity_to_mcap_ratio < 0.05 => mandatory high-risk
  if (Number.isFinite(liquidityToMcapRatio) && liquidityToMcapRatio < 0.05) {
    if (!Array.isArray(liquidity.red_flags)) liquidity.red_flags = []
    if (!liquidity.red_flags.includes('Liquidity too low relative to market cap (high exit risk)')) {
      liquidity.red_flags.push('Liquidity too low relative to market cap (high exit risk)')
    }
    if (liquidity.status !== 'DANGEROUS') {
      liquidity.status = 'DANGEROUS'
    }
  }

  // Hard threshold: top_10_holder_percentage > 30 => mandatory centralization red flag
  // Use source-derived value if available, otherwise fall back to LLM output
  const top10PctRaw = firstFinite(
    rugcheckSignals.top_10_holder_percentage,
    distribution.top_10_holder_percentage,
  )
  const top10Pct = toPercentNumber(top10PctRaw)
  if (Number.isFinite(top10Pct) && top10Pct > 30) {
    if (!Array.isArray(distribution.red_flags)) distribution.red_flags = []
    if (!distribution.red_flags.some((f) => f.includes('Top 10 holders control'))) {
      distribution.red_flags.push(
        `Top 10 holders control ${top10Pct.toFixed(1)}% of supply (severe centralization risk)`,
      )
    }
    if (distribution.status !== 'CRITICAL' && distribution.status !== 'SUSPICIOUS') {
      distribution.status = 'CRITICAL'
    }
  }
  if (Number.isFinite(top10Pct) && top10Pct < 20 && Array.isArray(distribution.red_flags)) {
    // Remove stale/high-concentration wording when normalized top10 data says concentration is low.
    distribution.red_flags = distribution.red_flags.filter(
      (flag) =>
        !/top\s*10 holders control|high concentration of tokens in top holders|high concentration of tokens in top wallets/i.test(
          String(flag),
        ),
    )
  }
  // Update distribution with source-derived value if available
  const sourceTop10Pct = toPercentNumber(rugcheckSignals.top_10_holder_percentage)
  if (sourceTop10Pct !== null) {
    distribution.top_10_holder_percentage = sourceTop10Pct
  } else if (top10Pct !== null) {
    distribution.top_10_holder_percentage = top10Pct
  }

  // Hard threshold: largest_cluster_percentage > 20 => force CRITICAL distribution + AVOID
  const largestClusterPct = toFiniteNumber(bubblemapsSignals.largest_cluster_percentage)
  if (Number.isFinite(largestClusterPct) && largestClusterPct > 20) {
    if (!Array.isArray(distribution.red_flags)) distribution.red_flags = []
    if (!distribution.red_flags.some((f) => f.includes('Largest cluster controls'))) {
      distribution.red_flags.push(
        `Largest cluster controls ${largestClusterPct.toFixed(1)}% of supply (bundler/coordinated control risk)`,
      )
    }
    distribution.status = 'CRITICAL'
    if (output.recommendation !== 'AVOID') {
      output.recommendation = 'AVOID'
    }
  }

  // Hard threshold: insider_supply_percentage > 15 => mandatory insider centralization red flag
  const insiderSupplyPct = toFiniteNumber(bubblemapsSignals.insider_supply_percentage)
  if (Number.isFinite(insiderSupplyPct) && insiderSupplyPct > 15) {
    if (!Array.isArray(distribution.red_flags)) distribution.red_flags = []
    if (!distribution.red_flags.some((f) => f.includes('Insider supply'))) {
      distribution.red_flags.push(
        `Insider/team-linked wallets control ${insiderSupplyPct.toFixed(1)}% of supply (insider centralization risk)`,
      )
    }
    if (distribution.status !== 'CRITICAL') {
      distribution.status = 'CRITICAL'
    }
  }

  // Hard threshold: cluster_to_liquidity_ratio > 1 => severe dump/exit-risk warning
  const clusterToLiqRatio = toFiniteNumber(bubblemapsSignals.cluster_to_liquidity_ratio)
  if (Number.isFinite(clusterToLiqRatio) && clusterToLiqRatio > 1) {
    if (!Array.isArray(liquidity.red_flags)) liquidity.red_flags = []
    if (!liquidity.red_flags.some((f) => f.includes('Cluster can dump more than liquidity'))) {
      liquidity.red_flags.push(
        'Largest cluster can dump more than available liquidity (severe exit risk)',
      )
    }
    if (liquidity.status !== 'DANGEROUS') {
      liquidity.status = 'DANGEROUS'
    }
  }

  // Hard threshold: lp_status = UNLOCKED => mandatory severe liquidity-rug warning
  // Use source-derived value if available, otherwise fall back to LLM output
  const lpStatusSource = rugcheckSignals.lp_status || security.lp_status || liquidity.lp_status || 'UNKNOWN'
  const lpStatus = String(lpStatusSource).toUpperCase()
  if (lpStatus === 'UNLOCKED') {
    if (!Array.isArray(security.red_flags)) security.red_flags = []
    if (!security.red_flags.some((f) => f.includes('Liquidity pool is unlocked'))) {
      security.red_flags.push('Liquidity pool is unlocked (developer can rug pull at any time)')
    }
    if (security.status !== 'CRITICAL') {
      security.status = 'CRITICAL'
    }
    // Force recommendation to AVOID if LP is unlocked
    if (output.recommendation !== 'AVOID') {
      output.recommendation = 'AVOID'
    }
  }

  // Update security/liquidity with source-derived LP status if available
  if (rugcheckSignals.lp_status && rugcheckSignals.lp_status !== 'UNKNOWN') {
    security.lp_status = rugcheckSignals.lp_status
    liquidity.lp_status = rugcheckSignals.lp_status
  }

  // Compute a fully deterministic overall risk score from hard signals only.
  let deterministicRiskScore = computeDeterministicRiskScore({
    liquidityToMcapRatio,
    top10Pct,
    largestClusterPct,
    insiderSupplyPct,
    clusterToLiqRatio,
    lpStatus,
  })

  // Reconcile recommendation with deterministic overrides (AI can be stricter, never looser)
  const hasCriticalRisk =
    (Number.isFinite(liquidityToMcapRatio) && liquidityToMcapRatio < 0.05) ||
    (Number.isFinite(top10Pct) && top10Pct > 30) ||
    (Number.isFinite(largestClusterPct) && largestClusterPct > 20) ||
    (Number.isFinite(insiderSupplyPct) && insiderSupplyPct > 15) ||
    lpStatus === 'UNLOCKED'

  if (hasCriticalRisk) {
    if (output.recommendation !== 'AVOID') {
      output.recommendation = 'AVOID'
    }
    if (deterministicRiskScore < 8) {
      deterministicRiskScore = 8
    }
  }

  output.overall_risk_score = deterministicRiskScore

  // Update nested objects
  if (output.three_pillars) {
    output.three_pillars.distribution = distribution
  }
  output.liquidity_analysis = liquidity
  output.security_checks = security
  output.chart_lifecycle = computeChartLifecycle(xrayPayload, output)

  // If this looks pre-bond, make sure the summary clearly says so.
  if (String(output.chart_lifecycle?.phase || '').toUpperCase() === 'PRE_BOND') {
    const prebondLine =
      'This coin looks pre-bond (not yet trading on a DEX). Always wait for real DEX liquidity and volume before making big moves.'
    if (typeof output.summary === 'string' && output.summary.trim()) {
      output.summary = `${output.summary.trim()} ${prebondLine}`
    } else {
      output.summary = prebondLine
    }
  }

  return output
}
