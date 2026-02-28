import { toFiniteNumber } from '../api/normalizers.js'

export function computeChartLifecycle(xrayPayload, analysis) {
  const primary = xrayPayload?.dexscreener?.primaryPair || {}
  const liq = analysis?.liquidity_analysis || {}
  const recommendation = String(analysis?.recommendation || 'CAUTION').toUpperCase()

  const launchpadName = String(xrayPayload?.rugcheck?.launchpad?.name || '').toLowerCase()
  const marketType = String(xrayPayload?.rugcheck?.markets?.[0]?.marketType || '').toLowerCase()
  const primaryLiq = toFiniteNumber(primary.liquidityUsd)
  const isLikelyPreBond =
    (primaryLiq === null || primaryLiq <= 0) &&
    (launchpadName.includes('pump') || marketType.includes('pump_fun'))

  if (isLikelyPreBond) {
    return {
      phase: 'PRE_BOND',
      phase_confidence: 'HIGH',
      trend_structure: 'NEUTRAL',
      momentum_status: 'UNKNOWN',
      volume_confirmation: 'UNKNOWN',
      setup_quality_score: 3,
      ape_signal: 'AVOID',
      invalidation: 'Wait for bonding/migration and real DEX liquidity before acting.',
      details:
        'This coin looks pre-bond (on a bonding curve, not yet on a DEX). Wait for real DEX liquidity and volume before making big moves.',
    }
  }

  const pair = primary

  const m5 = toFiniteNumber(pair?.priceChange?.m5) ?? 0
  const h1 = toFiniteNumber(pair?.priceChange?.h1) ?? 0
  const h6 = toFiniteNumber(pair?.priceChange?.h6) ?? 0
  const h24 = toFiniteNumber(pair?.priceChange?.h24) ?? 0

  const h1Buys = toFiniteNumber(pair?.txns?.h1?.buys) ?? 0
  const h1Sells = toFiniteNumber(pair?.txns?.h1?.sells) ?? 0
  const h1Total = h1Buys + h1Sells
  const buyPressure = h1Total > 0 ? h1Buys / h1Total : 0.5

  const liqRatio = toFiniteNumber(liq?.liquidity_to_mcap_ratio)

  let trend_structure = 'NEUTRAL'
  if (h1 > 0 && h6 > 0) trend_structure = 'BULLISH'
  if (h1 < 0 && h6 < 0) trend_structure = 'BEARISH'

  let phase = 'DISCOVERY'
  if (h24 > 80 && h1 > 10) phase = 'EUPHORIA'
  else if (h24 > 20 && h1 >= 0) phase = 'MARKUP'
  else if (h24 > 60 && h1 < 0) phase = 'DISTRIBUTION'
  else if (h24 < -20 && h6 < 0) phase = 'DEATH'
  else if (h24 > 0 && h6 > 0 && h1 < 0) phase = 'REVIVAL'
  else if (Math.abs(h24) < 5 && Math.abs(h1) < 2) phase = 'LAUNCH'

  let momentum_status = 'COOLING'
  if (h1 > 8 && m5 > 0) momentum_status = 'ACCELERATING'
  if (h24 > 60 && h1 < 0) momentum_status = 'EXHAUSTED'
  if (Math.abs(h1) < 1) momentum_status = 'UNKNOWN'

  let volume_confirmation = 'WEAK'
  if (h1Total <= 0) volume_confirmation = 'UNKNOWN'
  else if (buyPressure >= 0.58) volume_confirmation = 'CONFIRMED'
  else if (buyPressure <= 0.42) volume_confirmation = 'DIVERGENCE'

  let setup_quality_score = 5
  if (trend_structure === 'BULLISH') setup_quality_score += 2
  if (trend_structure === 'BEARISH') setup_quality_score -= 2
  if (volume_confirmation === 'CONFIRMED') setup_quality_score += 1
  if (volume_confirmation === 'DIVERGENCE') setup_quality_score -= 1
  if (momentum_status === 'EXHAUSTED') setup_quality_score -= 2
  if (liqRatio !== null && liqRatio < 0.1) setup_quality_score -= 1
  setup_quality_score = Math.max(1, Math.min(10, setup_quality_score))

  let ape_signal = 'WAIT_PULLBACK'
  if (recommendation === 'AVOID') {
    ape_signal = 'AVOID'
  } else if (phase === 'MARKUP' && setup_quality_score >= 7 && volume_confirmation === 'CONFIRMED') {
    ape_signal = 'APE_NOW'
  } else if (phase === 'EUPHORIA' || phase === 'DISTRIBUTION' || phase === 'DEATH') {
    ape_signal = 'AVOID'
  }

  const phase_confidence =
    h1Total > 20 || Math.abs(h24) > 25
      ? 'HIGH'
      : h1Total > 8 || Math.abs(h6) > 10
        ? 'MEDIUM'
        : 'LOW'

  const invalidation =
    ape_signal === 'APE_NOW'
      ? 'If 1h trend turns red with heavy sells, stop and wait.'
      : ape_signal === 'WAIT_PULLBACK'
        ? 'Wait for a clean base and more buyer strength first.'
        : 'Do not chase. Wait for better structure and safer risk.'

  const details = `Phase looks like ${phase}. Trend is ${trend_structure.toLowerCase()} with ${volume_confirmation.toLowerCase()} volume. Best action now is ${ape_signal === 'APE_NOW' ? 'ape small' : ape_signal === 'WAIT_PULLBACK' ? 'wait for pullback' : 'avoid for now'}.`

  return {
    phase,
    phase_confidence,
    trend_structure,
    momentum_status,
    volume_confirmation,
    setup_quality_score,
    ape_signal,
    invalidation,
    details,
  }
}
