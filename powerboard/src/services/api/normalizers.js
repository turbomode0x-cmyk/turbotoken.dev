// Helper functions for number normalization
export function toFiniteNumber(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export function toPercentNumber(value) {
  const num = toFiniteNumber(value)
  if (num == null) return null
  // Some sources/models return 0-1 fraction instead of 0-100 percent.
  if (num > 0 && num <= 1) return num * 100
  return num
}

export function firstFinite(...values) {
  for (const value of values) {
    const num = toFiniteNumber(value)
    if (num !== null) return num
  }
  return null
}

export function normalizeDexPair(pair) {
  return {
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    address: pair.baseToken?.address || '',
    chainId: pair.chainId || '',
    dexId: pair.dexId || '',
    pairAddress: pair.pairAddress || '',
    priceUsd: Number(pair.priceUsd || 0),
    marketCap: Number(pair.marketCap || 0),
    liquidityUsd: Number(pair.liquidity?.usd || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    volume: {
      m5: Number(pair.volume?.m5 || 0),
      h1: Number(pair.volume?.h1 || 0),
      h6: Number(pair.volume?.h6 || 0),
      h24: Number(pair.volume?.h24 || 0),
    },
    priceChange: {
      m5: Number(pair.priceChange?.m5 || 0),
      h1: Number(pair.priceChange?.h1 || 0),
      h6: Number(pair.priceChange?.h6 || 0),
      h24: Number(pair.priceChange?.h24 || 0),
    },
    txns: {
      m5: {
        buys: Number(pair.txns?.m5?.buys || 0),
        sells: Number(pair.txns?.m5?.sells || 0),
      },
      h1: {
        buys: Number(pair.txns?.h1?.buys || 0),
        sells: Number(pair.txns?.h1?.sells || 0),
      },
      h6: {
        buys: Number(pair.txns?.h6?.buys || 0),
        sells: Number(pair.txns?.h6?.sells || 0),
      },
      h24: {
        buys: Number(pair.txns?.h24?.buys || 0),
        sells: Number(pair.txns?.h24?.sells || 0),
      },
    },
    txns24h: {
      buys: Number(pair.txns?.h24?.buys || 0),
      sells: Number(pair.txns?.h24?.sells || 0),
    },
  }
}

export function uniqueByAddress(pairs) {
  const seen = new Set()
  return pairs.filter((pair) => {
    const key = `${pair.address}:${pair.pairAddress}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function normalizeRugcheckSignals(rugcheckPayload) {
  if (!rugcheckPayload || typeof rugcheckPayload !== 'object') {
    return {
      top_10_holder_percentage: null,
      lp_status: 'UNKNOWN',
      warnings: [],
      risk_flags: [],
      source_meta: { source: 'RugCheck', confidence: 'LOW', timestamp: new Date().toISOString() },
    }
  }

  const signals = {
    top_10_holder_percentage: null,
    lp_status: 'UNKNOWN',
    warnings: [],
    risk_flags: [],
    source_meta: { source: 'RugCheck', confidence: 'MEDIUM', timestamp: new Date().toISOString() },
  }

  // Extract top 10 holder percentage from holders data
  if (rugcheckPayload.holders && Array.isArray(rugcheckPayload.holders)) {
    const top10 = rugcheckPayload.holders.slice(0, 10)
    const top10Total = top10.reduce((sum, h) => {
      const pct = firstFinite(
        h.percentage,
        h.percent,
        h.supply_percentage,
        h.share,
      )
      return sum + (pct ?? 0)
    }, 0)
    if (Number.isFinite(top10Total) && top10Total > 0) {
      signals.top_10_holder_percentage = toPercentNumber(top10Total)
      signals.source_meta.confidence = 'HIGH'
    }
  }

  // Extract LP status from token/markets data
  const token = rugcheckPayload.token || {}
  const markets = rugcheckPayload.markets || []
  const primaryMarket = markets[0] || {}

  // Check for LP lock/burn status
  if (token.lpLocked === true || primaryMarket.lpLocked === true) {
    signals.lp_status = 'LOCKED'
  } else if (token.lpBurned === true || primaryMarket.lpBurned === true) {
    signals.lp_status = 'BURNED'
  } else if (token.mintAuthority != null || token.freezeAuthority != null) {
    // If authorities exist, LP is likely unlockable
    signals.lp_status = 'UNLOCKED'
  }

  // Extract warnings and risk flags
  if (Array.isArray(rugcheckPayload.warnings)) {
    signals.warnings = rugcheckPayload.warnings
  }
  if (Array.isArray(rugcheckPayload.riskFlags)) {
    signals.risk_flags = rugcheckPayload.riskFlags
  }

  return signals
}

export function normalizeBubblemapsSignals(bubblemapsPayload, liquidityUsd = 0) {
  if (!bubblemapsPayload || typeof bubblemapsPayload !== 'object') {
    return {
      largest_cluster_percentage: null,
      top_3_clusters_percentage: null,
      insider_supply_percentage: null,
      cluster_to_liquidity_ratio: null,
      source_meta: { source: 'Bubblemaps', confidence: 'LOW', timestamp: new Date().toISOString() },
    }
  }

  const signals = {
    largest_cluster_percentage: null,
    top_3_clusters_percentage: null,
    insider_supply_percentage: null,
    cluster_to_liquidity_ratio: null,
    source_meta: { source: 'Bubblemaps', confidence: 'MEDIUM', timestamp: new Date().toISOString() },
  }

  // Try multiple possible response structures
  // Structure 1: Direct clusters array
  let clusters = bubblemapsPayload.clusters || []
  let nodes = bubblemapsPayload.nodes || []

  // Structure 2: Data wrapper (e.g., { data: { clusters: [...] } })
  if (clusters.length === 0 && nodes.length === 0 && bubblemapsPayload.data) {
    clusters = bubblemapsPayload.data.clusters || []
    nodes = bubblemapsPayload.data.nodes || []
  }

  // Structure 3: Map data wrapper (e.g., { mapData: { clusters: [...] } })
  if (clusters.length === 0 && nodes.length === 0 && bubblemapsPayload.mapData) {
    clusters = bubblemapsPayload.mapData.clusters || []
    nodes = bubblemapsPayload.mapData.nodes || []
  }

  // Calculate cluster percentages from clusters array
  if (Array.isArray(clusters) && clusters.length > 0) {
    const sortedClusters = [...clusters]
      .map((c) => {
        // Try multiple field names for percentage
        return (
          firstFinite(
            c.percentage,
            c.percent,
            c.supply_percentage,
            c.supplyPercent,
            c.holdings_percentage,
            c.totalPercentage,
          ) ?? 0
        )
      })
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => b - a)

    if (sortedClusters.length > 0) {
      signals.largest_cluster_percentage = sortedClusters[0]
      signals.top_3_clusters_percentage = sortedClusters.slice(0, 3).reduce((sum, p) => sum + p, 0)
      signals.source_meta.confidence = 'HIGH'
    }
  }

  // Calculate cluster percentages from nodes (if clusters array not available)
  // Group nodes by cluster ID and sum their holdings
  if (Array.isArray(nodes) && nodes.length > 0 && !signals.largest_cluster_percentage) {
    const clusterMap = new Map()
    nodes.forEach((node) => {
      const clusterId = node.clusterId || node.cluster || node.group || 'default'
      const pct =
        firstFinite(
          node.percentage,
          node.percent,
          node.supply_percentage,
          node.balance_percentage,
        ) ?? 0
      if (Number.isFinite(pct) && pct > 0) {
        const current = clusterMap.get(clusterId) || 0
        clusterMap.set(clusterId, current + pct)
      }
    })

    if (clusterMap.size > 0) {
      const sortedClusters = Array.from(clusterMap.values())
        .filter((p) => Number.isFinite(p) && p > 0)
        .sort((a, b) => b - a)

      if (sortedClusters.length > 0) {
        signals.largest_cluster_percentage = sortedClusters[0]
        signals.top_3_clusters_percentage = sortedClusters.slice(0, 3).reduce((sum, p) => sum + p, 0)
        signals.source_meta.confidence = 'HIGH'
      }
    }
  }

  // Calculate insider supply from nodes (creator/team connections)
  if (Array.isArray(nodes) && nodes.length > 0) {
    const insiderNodes = nodes.filter(
      (n) =>
        n.insider === true ||
        n.isCreator === true ||
        n.isTeam === true ||
        n.creator === true ||
        n.team === true ||
        n.label?.toLowerCase().includes('creator') ||
        n.label?.toLowerCase().includes('team') ||
        n.type === 'creator' ||
        n.type === 'team',
    )

    if (insiderNodes.length > 0) {
      const insiderTotal = insiderNodes.reduce((sum, n) => {
        const pct =
          firstFinite(
            n.percentage,
            n.percent,
            n.supply_percentage,
            n.balance_percentage,
          ) ?? 0
        return sum + (Number.isFinite(pct) ? pct : 0)
      }, 0)

      if (Number.isFinite(insiderTotal) && insiderTotal > 0) {
        signals.insider_supply_percentage = insiderTotal
        if (signals.source_meta.confidence !== 'HIGH') {
          signals.source_meta.confidence = 'MEDIUM'
        }
      }
    }
  }

  // Calculate cluster-to-liquidity ratio (risk of coordinated dump)
  // This is a simplified calculation - actual would need market cap
  if (Number.isFinite(signals.largest_cluster_percentage) && signals.largest_cluster_percentage > 0) {
    // If we have liquidity, estimate risk ratio
    // Higher cluster % relative to liquidity = higher dump risk
    if (liquidityUsd > 0) {
      // Simplified: assume cluster can control this % of market cap
      // Actual calculation would need: (cluster_supply * price) / liquidity
      const clusterRiskRatio = signals.largest_cluster_percentage / 100
      signals.cluster_to_liquidity_ratio = clusterRiskRatio
    } else {
      // Without liquidity data, still flag high cluster % as risk
      signals.cluster_to_liquidity_ratio = signals.largest_cluster_percentage > 20 ? 1.5 : 0.5
    }
  }

  // Debug logging in development (remove in production)
  if (import.meta.env.DEV && Object.keys(bubblemapsPayload).length > 0) {
    console.log('[Bubblemaps Debug] Payload keys:', Object.keys(bubblemapsPayload))
    console.log('[Bubblemaps Debug] Clusters found:', clusters.length)
    console.log('[Bubblemaps Debug] Nodes found:', nodes.length)
    console.log('[Bubblemaps Debug] Signals extracted:', signals)
  }

  return signals
}
