export function validateAndCoerceAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') {
    return null
  }

  const output = { ...analysis }

  // Ensure required top-level fields
  if (typeof output.token_symbol !== 'string') output.token_symbol = 'UNKNOWN'
  if (typeof output.token_address !== 'string') output.token_address = 'N/A'
  if (typeof output.overall_risk_score !== 'number' || output.overall_risk_score < 1 || output.overall_risk_score > 10) {
    output.overall_risk_score = 5
  }
  if (!['BUY', 'CAUTION', 'AVOID'].includes(output.recommendation)) {
    output.recommendation = 'CAUTION'
  }
  if (typeof output.summary !== 'string') output.summary = 'Analysis unavailable.'

  // Validate three_pillars
  if (!output.three_pillars || typeof output.three_pillars !== 'object') {
    output.three_pillars = {
      volume: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [] },
      narrative: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [] },
      distribution: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [], top_10_holder_percentage: null },
    }
  } else {
    const pillars = output.three_pillars
    for (const key of ['volume', 'narrative', 'distribution']) {
      if (!pillars[key] || typeof pillars[key] !== 'object') {
        pillars[key] = key === 'distribution'
          ? { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [], top_10_holder_percentage: null }
          : { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [] }
      }
      const pillar = pillars[key]
      if (typeof pillar.score !== 'number' || pillar.score < 1 || pillar.score > 10) pillar.score = 5
      if (typeof pillar.status !== 'string') pillar.status = 'UNKNOWN'
      if (typeof pillar.details !== 'string') pillar.details = ''
      if (!Array.isArray(pillar.red_flags)) pillar.red_flags = []
      if (!Array.isArray(pillar.green_flags)) pillar.green_flags = []
      if (key === 'distribution') {
        if (!Number.isFinite(pillar.top_10_holder_percentage)) {
          pillar.top_10_holder_percentage = null
        }
        // Validate new insider/bundle fields if present
        if (!Number.isFinite(pillar.largest_cluster_percentage)) {
          pillar.largest_cluster_percentage = null
        }
        if (!Number.isFinite(pillar.insider_supply_percentage)) {
          pillar.insider_supply_percentage = null
        }
      }
    }
  }

  // Validate liquidity_analysis
  if (!output.liquidity_analysis || typeof output.liquidity_analysis !== 'object') {
    output.liquidity_analysis = {
      market_cap: 0,
      liquidity: 0,
      liquidity_ratio: 0,
      liquidity_to_mcap_ratio: null,
      lp_status: 'UNKNOWN',
      status: 'UNKNOWN',
      details: '',
      red_flags: [],
      green_flags: [],
    }
  } else {
    const liq = output.liquidity_analysis
    if (typeof liq.market_cap !== 'number') liq.market_cap = 0
    if (typeof liq.liquidity !== 'number') liq.liquidity = 0
    if (typeof liq.liquidity_ratio !== 'number') liq.liquidity_ratio = 0
    if (!Number.isFinite(liq.liquidity_to_mcap_ratio)) liq.liquidity_to_mcap_ratio = null
    const lpStatus = String(liq.lp_status || 'UNKNOWN').toUpperCase()
    if (!['BURNED', 'LOCKED', 'UNLOCKED', 'UNKNOWN'].includes(lpStatus)) {
      liq.lp_status = 'UNKNOWN'
    } else {
      liq.lp_status = lpStatus
    }
    if (typeof liq.status !== 'string') liq.status = 'UNKNOWN'
    if (typeof liq.details !== 'string') liq.details = ''
    if (!Array.isArray(liq.red_flags)) liq.red_flags = []
    if (!Array.isArray(liq.green_flags)) liq.green_flags = []
  }

  // Validate security_checks
  if (!output.security_checks || typeof output.security_checks !== 'object') {
    output.security_checks = {
      contract_renounced: false,
      dev_wallet_history: 'Unknown',
      dev_selling_while_promoting: null,
      dev_sell_evidence: [],
      creator_wallet_empty: null,
      lp_status: 'UNKNOWN',
      status: 'UNKNOWN',
      details: '',
      red_flags: [],
      green_flags: [],
    }
  } else {
    const sec = output.security_checks
    if (typeof sec.contract_renounced !== 'boolean') sec.contract_renounced = false
    if (typeof sec.dev_wallet_history !== 'string') sec.dev_wallet_history = 'Unknown'
    if (sec.dev_selling_while_promoting !== true && sec.dev_selling_while_promoting !== false) {
      sec.dev_selling_while_promoting = null
    }
    if (!Array.isArray(sec.dev_sell_evidence)) sec.dev_sell_evidence = []
    if (sec.creator_wallet_empty !== true && sec.creator_wallet_empty !== false) {
      sec.creator_wallet_empty = null
    }
    const lpStatus = String(sec.lp_status || 'UNKNOWN').toUpperCase()
    if (!['BURNED', 'LOCKED', 'UNLOCKED', 'UNKNOWN'].includes(lpStatus)) {
      sec.lp_status = 'UNKNOWN'
    } else {
      sec.lp_status = lpStatus
    }
    if (typeof sec.status !== 'string') sec.status = 'UNKNOWN'
    if (typeof sec.details !== 'string') sec.details = ''
    if (!Array.isArray(sec.red_flags)) sec.red_flags = []
    if (!Array.isArray(sec.green_flags)) sec.green_flags = []
  }

  // Validate chart_lifecycle
  if (!output.chart_lifecycle || typeof output.chart_lifecycle !== 'object') {
    output.chart_lifecycle = {
      phase: 'UNKNOWN',
      phase_confidence: 'LOW',
      trend_structure: 'NEUTRAL',
      momentum_status: 'UNKNOWN',
      volume_confirmation: 'UNKNOWN',
      setup_quality_score: 5,
      ape_signal: 'WAIT_PULLBACK',
      invalidation: 'Wait for clearer trend.',
      details: 'Chart data is limited right now.',
    }
  } else {
    const chart = output.chart_lifecycle
    if (!['LAUNCH', 'DISCOVERY', 'MARKUP', 'EUPHORIA', 'DISTRIBUTION', 'DEATH', 'REVIVAL', 'UNKNOWN'].includes(chart.phase)) {
      chart.phase = 'UNKNOWN'
    }
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(chart.phase_confidence)) chart.phase_confidence = 'LOW'
    if (!['BULLISH', 'NEUTRAL', 'BEARISH'].includes(chart.trend_structure)) chart.trend_structure = 'NEUTRAL'
    if (!['ACCELERATING', 'COOLING', 'EXHAUSTED', 'UNKNOWN'].includes(chart.momentum_status)) chart.momentum_status = 'UNKNOWN'
    if (!['CONFIRMED', 'WEAK', 'DIVERGENCE', 'UNKNOWN'].includes(chart.volume_confirmation)) chart.volume_confirmation = 'UNKNOWN'
    if (!Number.isFinite(chart.setup_quality_score)) chart.setup_quality_score = 5
    chart.setup_quality_score = Math.max(1, Math.min(10, chart.setup_quality_score))
    if (!['APE_NOW', 'WAIT_PULLBACK', 'AVOID'].includes(chart.ape_signal)) chart.ape_signal = 'WAIT_PULLBACK'
    if (typeof chart.invalidation !== 'string') chart.invalidation = 'Wait for clearer trend.'
    if (typeof chart.details !== 'string') chart.details = 'Chart data is limited right now.'
  }

  // Validate actionable_guidance
  if (!output.actionable_guidance || typeof output.actionable_guidance !== 'object') {
    output.actionable_guidance = {
      if_buying: { position_size: 'N/A', entry_strategy: 'N/A', profit_targets: 'N/A', stop_loss: 'N/A' },
      if_avoiding: { reason: 'N/A', alternative: 'N/A' },
    }
  } else {
    if (!output.actionable_guidance.if_buying || typeof output.actionable_guidance.if_buying !== 'object') {
      output.actionable_guidance.if_buying = {
        position_size: 'N/A',
        entry_strategy: 'N/A',
        profit_targets: 'N/A',
        stop_loss: 'N/A',
      }
    }
    if (!output.actionable_guidance.if_avoiding || typeof output.actionable_guidance.if_avoiding !== 'object') {
      output.actionable_guidance.if_avoiding = { reason: 'N/A', alternative: 'N/A' }
    }
  }

  // Validate flag arrays
  if (!Array.isArray(output.all_red_flags)) output.all_red_flags = []
  if (!Array.isArray(output.all_green_flags)) output.all_green_flags = []

  return output
}
