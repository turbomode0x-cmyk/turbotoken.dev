import './Dashboard.css'
import { useState, useEffect, useRef } from 'react'

function toFiniteNumber(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function mapPhaseToStage(phase) {
  if (!phase) return 'UNKNOWN'
  const upperPhase = String(phase).toUpperCase()
  if (upperPhase === 'PRE_BOND') return 'PRE-BOND'
  if (upperPhase === 'LAUNCH' || upperPhase === 'DISCOVERY') return 'EARLY'
  if (upperPhase === 'MARKUP' || upperPhase === 'REVIVAL') return 'RUNNING'
  if (upperPhase === 'EUPHORIA') return 'HOT (LATE)'
  if (upperPhase === 'DISTRIBUTION') return 'TOPPING'
  if (upperPhase === 'DEATH') return 'DEAD / RESET'
  return 'UNKNOWN'
}

function plainPhase(phase) {
  const p = String(phase || '').toUpperCase()
  if (p === 'PRE_BOND') return 'Not on DEX yet (pump.fun only)'
  if (p === 'LAUNCH') return 'Just launched — very early'
  if (p === 'DISCOVERY') return 'Finding buyers — still early'
  if (p === 'MARKUP') return 'Price going up 📈'
  if (p === 'EUPHORIA') return 'Peak hype 🚀 (probably late!)'
  if (p === 'DISTRIBUTION') return 'Big wallets selling 🚨'
  if (p === 'DEATH') return 'Price crashing 💀'
  if (p === 'REVIVAL') return 'Trying to bounce back'
  return 'Not enough data yet'
}

function plainTrend(trend) {
  const t = String(trend || '').toUpperCase()
  if (t === 'BULLISH') return 'Going up ↑'
  if (t === 'BEARISH') return 'Going down ↓'
  return 'Not moving much →'
}

function plainVolume(vol) {
  const v = String(vol || '').toUpperCase()
  if (v === 'CONFIRMED') return 'More buyers than sellers ✓'
  if (v === 'DIVERGENCE') return 'More sellers than buyers ⚠'
  if (v === 'WEAK') return 'Barely any trading'
  return 'No volume data'
}

function plainSignal(sig) {
  const s = String(sig || '').toUpperCase()
  if (s === 'APE_NOW') return 'Fast move, very risky'
  if (s === 'EARLY_ENTRY') return 'Early stage, still risky'
  if (s === 'AVOID') return 'Very risky zone'
  return 'Mixed, be careful'
}

export default function Dashboard({ selectedCA, tokenData, analysis, loading, error, llmPending }) {
  const prevLlmPendingRef = useRef(llmPending)
  const prevAnalysisRef = useRef(analysis)
  
  // #region agent log
  useEffect(() => {
    if (prevLlmPendingRef.current !== llmPending || prevAnalysisRef.current !== analysis) {
      fetch('http://127.0.0.1:7250/ingest/1be7fb10-c169-47d1-9471-7bf7726b9708',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dashboard.jsx:58',message:'Dashboard state change',data:{llmPending,prevLlmPending:prevLlmPendingRef.current,hasAnalysis:!!analysis,analysisRiskScore:analysis?.overall_risk_score,analysisRecommendation:analysis?.recommendation,prevAnalysisRiskScore:prevAnalysisRef.current?.overall_risk_score,selectedCA},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      prevLlmPendingRef.current = llmPending
      prevAnalysisRef.current = analysis
    }
  }, [llmPending, analysis, selectedCA]);
  // #endregion
  
  const [tipMessage, setTipMessage] = useState('')
  const [bubbleIframeError, setBubbleIframeError] = useState(false)
  const [bubbleIframeLoading, setBubbleIframeLoading] = useState(true)
  if (!selectedCA) {
    return (
      <section className="dashboard">
        <div className="metrics-panel">
          <p className="help-text">Select a token CA above to load X-Ray analysis.</p>
        </div>
      </section>
    )
  }

  if (loading && !analysis) {
    return null
  }

  // Show error if no analysis available
  if (error && !analysis) {
    return (
      <section className="dashboard">
        <div className="metrics-panel">
          <p className="error">⚠️ Error: {error}</p>
          <p className="help-text" style={{ marginTop: '8px' }}>
            Please check your network connection and try again. If the issue persists, the token address may be invalid or the service may be temporarily unavailable.
          </p>
        </div>
      </section>
    )
  }

  // If no analysis at all, show message
  if (!analysis) {
    return (
      <section className="dashboard">
        <div className="metrics-panel">
          <p className="help-text">No analysis data available. Please try selecting a token again.</p>
        </div>
      </section>
    )
  }

  // Render error banner if present (but continue to render analysis below)
  const errorBanner = error ? (
    <div className="metrics-panel" style={{ marginBottom: '16px', padding: '12px', border: '2px solid #ff0000', backgroundColor: '#ffe0e0' }}>
      <p className="error" style={{ margin: 0, fontWeight: 'bold' }}>⚠️ Error: {error}</p>
    </div>
  ) : null

  // Only calculate recommendation and timing score when LLM has completed
  // This prevents showing fallback values that will change when LLM finishes
  // IMPORTANT: Do NOT calculate these when llmPending is true - show loading instead
  const recommendationClass = llmPending === true ? null : (analysis?.recommendation || 'caution').toLowerCase()
  // #region agent log
  fetch('http://127.0.0.1:7250/ingest/1be7fb10-c169-47d1-9471-7bf7726b9708',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dashboard.jsx:122',message:'recommendationClass calculation',data:{llmPending,llmPendingType:typeof llmPending,llmPendingStrict:llmPending === true,recommendationClass,analysisRecommendation:analysis?.recommendation},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const pillars = analysis.three_pillars || {}
  const liquidity = analysis.liquidity_analysis || {}
  const security = analysis.security_checks || {}
  const chart = analysis.chart_lifecycle || {}
  // Prefer AI liquidity metrics, but never show 0 if DexScreener has real data.
  const dsPrimary = tokenData?.dexscreener?.primaryPair || {}
  const rawLiqFromAnalysis = toFiniteNumber(liquidity.liquidity)
  const rawMcFromAnalysis = toFiniteNumber(liquidity.market_cap)
  const rawLiqFromDex = toFiniteNumber(dsPrimary.liquidityUsd)
  const rawMcFromDex = toFiniteNumber(dsPrimary.marketCap)
  const effectiveLiquidityAmount = rawLiqFromAnalysis ?? rawLiqFromDex ?? 0
  const effectiveMarketCap = rawMcFromAnalysis ?? rawMcFromDex ?? 0
  const liquidityAmount = Number(effectiveLiquidityAmount || 0)
  const launchpadName = String(tokenData?.rugcheck?.launchpad?.name || '').toLowerCase()
  const marketType = String(tokenData?.rugcheck?.markets?.[0]?.marketType || '').toLowerCase()
  const isLikelyPreBond =
    liquidityAmount <= 0 && (launchpadName.includes('pump') || marketType.includes('pump_fun'))
  const liquidityParenNote = isLikelyPreBond ? ' (likely not bonded yet)' : ''
  const liquidityStatusText = isLikelyPreBond
    ? 'PRE-BOND (likely not bonded yet)'
    : liquidity.status || 'UNKNOWN'

  // Extract deterministic signals for UI display
  const bubblemapsSignals = tokenData?.bubblemapsSignals || {}
  const largestClusterPct = toFiniteNumber(bubblemapsSignals.largest_cluster_percentage)
  const insiderSupplyPct = toFiniteNumber(bubblemapsSignals.insider_supply_percentage)
  const clusterToLiqRatio = toFiniteNumber(bubblemapsSignals.cluster_to_liquidity_ratio)
  const top3ClustersPct = toFiniteNumber(bubblemapsSignals.top_3_clusters_percentage)
  const bundlerDetected = bubblemapsSignals.bundler_detected === true
  const bundlerRiskLevel = bubblemapsSignals.bundler_risk_level || 'UNKNOWN'
  const bundlerDetails = bubblemapsSignals.bundler_details || null
  
  // Extract sniper activity from DexScreener data
  const sniperActivity = tokenData?.dexscreener?.primaryPair?.sniper_activity || {}
  const sniperDetected = sniperActivity.detected === true
  const sniperRiskLevel = sniperActivity.risk_level || 'UNKNOWN'
  
  // Extract KOL info from LLM analysis
  const socialMomentum = analysis?.social_momentum || {}
  const kolInvolvement = socialMomentum.kol_involvement || socialMomentum.kols || null
  const kolList = Array.isArray(kolInvolvement) ? kolInvolvement : (kolInvolvement ? [kolInvolvement] : [])

  // Only calculate timing score when LLM has completed to prevent showing fallback values
  // Check both llmPending and analysis.summary to ensure TurboToken opinion has loaded
  // The fallback analysis has a specific summary message, so we check if it's the real LLM summary
  const fallbackSummaryPattern = /Live market data loaded|AI analysis is temporarily unavailable|Loading live on-chain data/
  const hasRealLLMSummary = analysis?.summary && !fallbackSummaryPattern.test(analysis.summary)
  const isAnalysisComplete = !llmPending && hasRealLLMSummary
  const riskScore = isAnalysisComplete ? Number(analysis.overall_risk_score ?? 0) : null
  const timingScore = riskScore !== null ? Math.max(0, Math.min(10, 10 - riskScore)) : null
  const timingScoreText = timingScore !== null ? `${timingScore}/10` : null
  // #region agent log
  fetch('http://127.0.0.1:7250/ingest/1be7fb10-c169-47d1-9471-7bf7726b9708',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dashboard.jsx:134',message:'timingScore calculation',data:{llmPending,riskScore,timingScore,timingScoreText,analysisRiskScore:analysis?.overall_risk_score},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const phaseIsPreBond = String(chart.phase || '').toUpperCase() === 'PRE_BOND'
  const cycleStage = mapPhaseToStage(chart.phase)
  const timingDisplay = phaseIsPreBond ? 'PRE-BOND' : cycleStage
  const holderCount = toFiniteNumber(tokenData?.rugcheck?.holderCount)
    ?? toFiniteNumber(tokenData?.rugcheck?.totalHolders)
    ?? (Array.isArray(tokenData?.rugcheck?.holders) ? tokenData.rugcheck.holders.length : null)
  const bubbleIframeReady =
    typeof selectedCA === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(selectedCA.trim())

  // Reset iframe error and loading when token changes
  useEffect(() => {
    setBubbleIframeError(false)
    setBubbleIframeLoading(true)
  }, [selectedCA])

  const summaryPillars = [
    { title: 'VOLUME', data: pillars.volume },
    { title: 'NARRATIVE', data: pillars.narrative },
    { title: 'DISTRIBUTION', data: pillars.distribution },
  ]
  const top10Pct = toFiniteNumber(pillars.distribution?.top_10_holder_percentage)
  const liqRatio = toFiniteNumber(liquidity.liquidity_to_mcap_ratio)
  const h24PriceChange = toFiniteNumber(tokenData?.dexscreener?.primaryPair?.priceChange?.h24)
  const whyNow = []
  if (h24PriceChange !== null && h24PriceChange <= -35) {
    whyNow.push(`Price dropped ${Math.abs(h24PriceChange).toFixed(1)}% in 24h.`)
  }
  if (top10Pct !== null && top10Pct >= 30) {
    whyNow.push(`Top 10 wallets control ${top10Pct.toFixed(1)}% of supply.`)
  }
  if (liqRatio !== null && liqRatio < 0.2) {
    whyNow.push(`Exit safety is low at ${(liqRatio * 100).toFixed(1)}%.`)
  }
  if (security.contract_renounced === false) {
    whyNow.push('Contract is not renounced.')
  }
  const whyNowTop = whyNow.slice(0, 3)

  const whatThisMeans =
    !llmPending && recommendationClass === 'avoid'
      ? 'This setup is high risk right now. A few wallets can move price hard, and exits can be painful.'
      : !llmPending && recommendationClass === 'caution'
        ? 'This setup is mixed. You can trade it, but keep size small and stay ready to exit fast.'
        : !llmPending
          ? 'This setup looks safer than most. Still use small size and watch for sudden changes.'
          : 'Waiting for AI analysis...'

  const flipConditions = [
    top10Pct === null || top10Pct >= 35 ? 'Top 10 holder concentration drops under 35%.' : null,
    liqRatio === null || liqRatio < 0.2 ? 'Exit safety rises above 20%.' : null,
    chart.phase === 'DEATH' || chart.ape_signal === 'AVOID' ? 'Chart moves to DISCOVERY or MARKUP.' : null,
    security.contract_renounced === false ? 'No new security red flags appear.' : null,
  ].filter(Boolean)

  return (
    <section className="dashboard">
      {errorBanner}
      <div className="disclaimer-banner">
        Not financial advice. Do your own research.
      </div>
      {/* Zone 1: Top action zone */}
      <div className="zone-block">
        <div className="header-section top-action-zone">
          <div className="token-info token-info-sunken">
            <h2>{analysis.token_symbol || tokenData?.tokenSymbol || 'UNKNOWN'}</h2>
            <div className="token-address-row">
              <p className="token-address">{analysis.token_address || selectedCA || 'N/A'}</p>
              <button
                className="win98-mini-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(analysis.token_address || selectedCA || '')
                    setTipMessage('Contract address copied.')
                  } catch {
                    setTipMessage('Copy failed. Please copy manually.')
                  }
                }}
              >
                COPY
              </button>
            </div>
          </div>
          <div className="risk-display">
            {(() => {
              // #region agent log
              fetch('http://127.0.0.1:7250/ingest/1be7fb10-c169-47d1-9471-7bf7726b9708',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dashboard.jsx:217',message:'Entry Timing render branch',data:{llmPending,timingScore,timingScoreText,showingLoading:!!llmPending,hasSummary:!!analysis?.summary},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              const fallbackSummaryPattern = /Live market data loaded|AI analysis is temporarily unavailable|Loading live on-chain data/
              const hasRealLLMSummary = analysis?.summary && !fallbackSummaryPattern.test(analysis.summary)
              const showLoading = llmPending || !hasRealLLMSummary
              return showLoading ? (
                <div className="win98-loading-dots">...</div>
              ) : (
                <div
                  className={`risk-score-large ${
                    timingScore >= 8 ? 'success' : timingScore >= 4 ? 'warning' : 'danger'
                  }`}
                >
                  {timingScoreText}
                </div>
              );
            })()}
            <div className="risk-label">ENTRY TIMING</div>
          </div>
          <div className="top-actions">
            <div className="action-status-block">
              <div className="action-status-label">ACTION STATUS</div>
              {(() => {
                // #region agent log
                fetch('http://127.0.0.1:7250/ingest/1be7fb10-c169-47d1-9471-7bf7726b9708',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Dashboard.jsx:233',message:'Action Status render branch',data:{llmPending,recommendationClass,analysisRecommendation:analysis?.recommendation,showingLoading:!!llmPending,hasSummary:!!analysis?.summary},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                const fallbackSummaryPattern = /Live market data loaded|AI analysis is temporarily unavailable|Loading live on-chain data/
                const hasRealLLMSummary = analysis?.summary && !fallbackSummaryPattern.test(analysis.summary)
                const showLoading = llmPending || !hasRealLLMSummary
                return showLoading ? (
                  <div className="win98-loading-small">LOADING...</div>
                ) : (
                  <div className={`recommendation-badge ${recommendationClass}`}>{analysis.recommendation || 'CAUTION'}</div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {(llmPending || analysis.summary) && (
        <div className="zone-block">
          <div className={`ai-summary-box ${llmPending ? 'ai-summary-loading' : ''}`}>
            <span className="ai-summary-label">TurboToken opinion:</span>
            {llmPending ? (
              <>
                <div className="ai-loading-bar">
                  <div className="ai-loading-bar-fill" />
                </div>
                <p className="ai-summary-loading-text">
                  Thinking about this token<span className="ai-ellipsis">...</span>
                </p>
              </>
            ) : (
              analysis.summary && <p>{analysis.summary}</p>
            )}
          </div>
        </div>
      )}

      <div className="zone-block">
        <div className="top-metric-grid">
          <div className="top-metric-item"><span>MC:</span> <strong>${formatNumber(effectiveMarketCap)}</strong></div>
          <div className="top-metric-item"><span>Liq:</span> <strong>${formatNumber(effectiveLiquidityAmount)}</strong></div>
          <div className="top-metric-item"><span>Holders:</span> <strong>{holderCount !== null ? formatNumber(holderCount) : 'N/A'}</strong></div>
          <div className="top-metric-item"><span>Timing:</span> <strong>{timingDisplay}</strong></div>
        </div>
      </div>

      {/* Zone 2: 3-second summary widget */}
      <div className="zone-block">
        <fieldset className="quick-summary-group">
          <legend>3-SECOND SUMMARY</legend>
          <div className="quick-summary-grid">
            {summaryPillars.map((item) => {
              const fallbackSummaryPattern = /Live market data loaded|AI analysis is temporarily unavailable|Loading live on-chain data/
              const hasRealLLMSummary = analysis?.summary && !fallbackSummaryPattern.test(analysis.summary)
              return (
                <QuickMeter key={item.title} title={item.title} analysis={item.data} showLoading={llmPending || !hasRealLLMSummary} />
              )
            })}
          </div>
        </fieldset>

        <details>
          <summary className="button">View Deep Audit</summary>
          <div className="sunken-panel">
            <div className="decision-brief">
              <div className="section-header">CURRENT STATUS</div>
              <ul>
                {whyNowTop.length > 0 ? whyNowTop.map((item, idx) => <li key={`why-${idx}`}>{item}</li>) : <li>No major red alerts in live data.</li>}
                {Number.isFinite(top10Pct) && (
                  <li>Top 10 holders control {top10Pct.toFixed(1)}% of supply{top10Pct > 30 ? ' (high concentration risk)' : top10Pct > 20 ? ' (moderate risk)' : ''}.</li>
                )}
              </ul>
              <div className="section-header">WHAT THIS MEANS</div>
              <p className="details-text">{whatThisMeans}</p>
              <div className="section-header">FLIP CONDITIONS</div>
              <ul>
                {flipConditions.length > 0 ? flipConditions.map((item, idx) => <li key={`flip-${idx}`}>{item}</li>) : <li>Setup already meets core safety checks. Keep monitoring.</li>}
              </ul>
            </div>
            <div className="flags-section">
              <FlagBlock title="⚠ RED FLAGS" className="red-flags" flags={analysis.all_red_flags} />
              <FlagBlock title="✓ GREEN FLAGS" className="green-flags" flags={analysis.all_green_flags} />
            </div>
          </div>
        </details>

        <div className="metrics-panel" style={{ marginTop: '12px' }}>
          <div className="section-header" style={{ fontSize: '12px', marginBottom: '8px' }}>
            COIN STATS
          </div>
          <Metric label="Phase (where the coin is)" value={plainPhase(chart.phase)} />
          <Metric
            label="Risk warning"
            value={plainSignal(chart.ape_signal)}
            className={
              chart.ape_signal === 'APE_NOW' || chart.ape_signal === 'EARLY_ENTRY'
                ? 'warning'
                : chart.ape_signal === 'AVOID'
                  ? 'danger'
                  : ''
            }
          />
          <Metric label="Trend (price path)" value={plainTrend(chart.trend_structure)} />
          <Metric label="Volume (trading activity)" value={plainVolume(chart.volume_confirmation)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <details>
              <summary className="button">View Deep Audit</summary>
              <div className="sunken-panel">
                <p className="details-text">{chart.details || 'Chart data is limited right now.'}</p>
                <p className="details-text">
                  <strong>Invalidation:</strong> {chart.invalidation || 'Wait for clearer trend.'}
                </p>
                <p className="details-text" style={{ fontSize: '11px', marginTop: '8px' }}>
                  Source: Live DexScreener price change and buy/sell flow data.
                </p>
              </div>
            </details>
            {chart.phase === 'MARKUP' && !llmPending && (chart.ape_signal === 'AVOID' || (timingScore !== null && timingScore < 4)) && (
              <div className="strategy-conflict-note-inline">
                Chart is going up (Markup phase), but rug risk is high.
              </div>
            )}
          </div>
        </div>

        <div className="metrics-panel" style={{ marginTop: '12px' }}>
          <div className="section-header" style={{ fontSize: '12px', marginBottom: '8px' }}>
            BUNDLER & INSIDER RISK
          </div>
          {bubbleIframeReady && bubbleIframeLoading && !bubbleIframeError && (
            <div className="bubble-iframe-loading" style={{
              width: '100%',
              height: '320px',
              border: '2px inset #c0c0c0',
              background: '#fff',
              margin: '6px 0 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'MS Sans Serif', sans-serif",
              fontSize: '12px',
              color: '#808080'
            }}>
              <div className="win98-loading" style={{ width: '200px', height: '20px', marginBottom: '12px' }}>
                <div className="win98-loading-bar" />
              </div>
              <div>Loading Bubble Maps visualization...</div>
            </div>
          )}
          {bubbleIframeReady && !bubbleIframeError && !bubbleIframeLoading && (
            <iframe
              title="Bubble Maps"
              className="bubble-iframe"
              src={`https://iframe.bubblemaps.io/map?chain=solana&address=${selectedCA}&partnerId=demo`}
              sandbox="allow-scripts allow-same-origin"
              allow="fullscreen"
              referrerPolicy="no-referrer-when-downgrade"
              loading="lazy"
              onError={() => {
                setBubbleIframeError(true)
                setBubbleIframeLoading(false)
              }}
              onLoad={(e) => {
                // Iframe load event fired - hide loading state
                // Note: onLoad fires even if content is blocked by CORS, so we hide loading
                setBubbleIframeLoading(false)
                
                // Additional check after a delay to see if iframe actually has content
                setTimeout(() => {
                  try {
                    const iframe = e.target
                    // Try to detect if iframe is actually blocked
                    // This is best-effort due to CORS restrictions
                    if (iframe.contentWindow === null) {
                      // Might be blocked, but onLoad already fired so assume it's working
                      // The iframe will show error state if it truly failed
                    }
                  } catch (err) {
                    // CORS restrictions prevent checking - this is normal
                    // Assume iframe loaded successfully since onLoad fired
                  }
                }, 1000)
              }}
            />
          )}
          {bubbleIframeReady && bubbleIframeError && (
            <div className="bubble-iframe-error" style={{
              width: '100%',
              height: '320px',
              border: '2px inset #c0c0c0',
              background: '#fff',
              margin: '6px 0 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'MS Sans Serif', sans-serif",
              fontSize: '12px',
              color: '#808080'
            }}>
              Bubblemaps visualization unavailable
            </div>
          )}
          {Number.isFinite(largestClusterPct) && (
            <Metric
              label="Largest Cluster %"
              value={`${largestClusterPct.toFixed(1)}%`}
              className={largestClusterPct > 20 ? 'danger' : largestClusterPct > 12 ? 'warning' : ''}
            />
          )}
          {Number.isFinite(top3ClustersPct) && (
            <Metric
              label="Top 3 Clusters %"
              value={`${top3ClustersPct.toFixed(1)}%`}
              className={top3ClustersPct > 40 ? 'danger' : top3ClustersPct > 30 ? 'warning' : ''}
            />
          )}
          {Number.isFinite(insiderSupplyPct) && (
            <Metric
              label="Insider Supply %"
              value={`${insiderSupplyPct.toFixed(1)}%`}
              className={insiderSupplyPct > 15 ? 'danger' : insiderSupplyPct > 10 ? 'warning' : ''}
            />
          )}
          {Number.isFinite(clusterToLiqRatio) && (
            <Metric
              label="Cluster/Liquidity Risk"
              value={clusterToLiqRatio > 1 ? 'CRITICAL' : clusterToLiqRatio > 0.5 ? 'HIGH' : 'MODERATE'}
              className={clusterToLiqRatio > 1 ? 'danger' : clusterToLiqRatio > 0.5 ? 'warning' : ''}
            />
          )}
          {bundlerDetected && (
            <Metric
              label="Bundler Detection"
              value={bundlerRiskLevel}
              className={bundlerRiskLevel === 'CRITICAL' ? 'danger' : bundlerRiskLevel === 'HIGH' ? 'warning' : ''}
            />
          )}
          {bundlerDetails && (
            <p className="details-text" style={{ fontSize: '11px', marginTop: '4px', fontStyle: 'italic' }}>
              {bundlerDetails}
            </p>
          )}
          {sniperDetected && (
            <Metric
              label="Sniper Activity"
              value={sniperRiskLevel}
              className={sniperRiskLevel === 'HIGH' ? 'warning' : ''}
            />
          )}
          {sniperDetected && sniperActivity.m5_buys && (
            <p className="details-text" style={{ fontSize: '11px', marginTop: '4px', fontStyle: 'italic' }}>
              {sniperActivity.m5_buys} buys in first 5 minutes ({((sniperActivity.ratio || 0) * 100).toFixed(0)}% of 24h buys) - likely snipers
            </p>
          )}
          {kolList.length > 0 && kolList[0] !== 'None detected' && kolList[0] !== 'None' && (
            <div style={{ marginTop: '12px', padding: '8px', background: '#f0f0f0', border: '1px inset #c0c0c0' }}>
              <div className="section-header" style={{ fontSize: '11px', marginBottom: '6px' }}>KOL INVOLVEMENT</div>
              {kolList.map((kol, idx) => (
                <p key={idx} className="details-text" style={{ fontSize: '11px', margin: '2px 0' }}>
                  {typeof kol === 'string' ? kol : JSON.stringify(kol)}
                </p>
              ))}
            </div>
          )}
          <p className="details-text" style={{ fontSize: '11px', marginTop: '8px' }}>
            Source: Bubblemaps cluster analysis. Clusters are groups of wallets that may be controlled by the same entity.
          </p>
        </div>

      </div>

      {/* Zone 3: metrics + action */}
      <div className="zone-block">
        <div className="section-header">LIQUIDITY CHECK</div>
        <div className="metrics-panel">
          <Metric label="Market Cap" value={`$${formatNumber(effectiveMarketCap)}`} />
          <Metric
            label="Liquidity"
            value={`$${formatNumber(effectiveLiquidityAmount)}${liquidityParenNote}`}
          />
          {Number.isFinite(liquidity.liquidity_to_mcap_ratio) && (
            <Metric
              label="Exit Safety (Liquidity/MC)"
              value={`${(liquidity.liquidity_to_mcap_ratio * 100).toFixed(2)}%`}
              className={
                liquidity.liquidity_to_mcap_ratio < 0.05
                  ? 'danger'
                  : liquidity.liquidity_to_mcap_ratio < 0.1
                    ? 'warning'
                    : ''
              }
            />
          )}
          {isLikelyPreBond && <Metric label="Data Confidence" value="LOW (pre-bond)" className="warning" />}
          <div className="status-badge">
            <strong>STATUS:</strong> {liquidityStatusText}
          </div>
          <details>
            <summary className="button">View Deep Audit</summary>
            <div className="sunken-panel">
              <p className="details-text">{liquidity.details || 'No liquidity details available.'}</p>
              {isLikelyPreBond && (
                <p className="details-text">
                  No public LP is visible yet. Wait for bonding/migration, then recheck before taking size.
                </p>
              )}
            </div>
          </details>
        </div>

        <div className="section-header">SECURITY AUDIT</div>
        <div className="metrics-panel">
          <Metric
            label="Contract Status (can dev change token rules?)"
            value={security.contract_renounced ? 'RENOUNCED' : 'NOT RENOUNCED'}
            className={security.contract_renounced ? 'success' : 'danger'}
          />
          <Metric
            label="Dev Wallet History (past projects from this wallet)"
            value={security.dev_wallet_history || 'Unknown'}
          />
          <Metric
            label="Creator Wallet (tracked creator wallet only)"
            value={
              security.creator_wallet_empty === true
                ? 'EMPTY'
                : security.creator_wallet_empty === false
                  ? 'HAS TOKENS'
                  : 'UNKNOWN'
            }
            className={
              security.creator_wallet_empty === true
                ? 'warning'
                : security.creator_wallet_empty === false
                  ? 'success'
                  : ''
            }
          />
          <Metric
            label="Dev Selling (is there proof creator sold?)"
            value={
              security.dev_selling_while_promoting === true
                ? 'YES (ON-CHAIN EVIDENCE)'
                : security.dev_selling_while_promoting === false
                  ? 'NO EVIDENCE FOUND'
                  : 'UNCONFIRMED'
            }
            className={
              security.dev_selling_while_promoting === true
                ? 'danger'
                : security.dev_selling_while_promoting === false
                  ? 'success'
                  : ''
            }
          />
          {security.lp_status && security.lp_status !== 'UNKNOWN' && (
            <Metric
              label="LP Status (can dev remove liquidity?)"
              value={security.lp_status}
              className={
                security.lp_status === 'UNLOCKED'
                  ? 'danger'
                  : security.lp_status === 'LOCKED'
                    ? 'warning'
                    : security.lp_status === 'BURNED'
                      ? 'success'
                      : ''
              }
            />
          )}
          {liquidity.lp_status && liquidity.lp_status !== 'UNKNOWN' && !security.lp_status && (
            <Metric
              label="LP Status (can dev remove liquidity?)"
              value={liquidity.lp_status}
              className={
                liquidity.lp_status === 'UNLOCKED'
                  ? 'danger'
                  : liquidity.lp_status === 'LOCKED'
                    ? 'warning'
                    : liquidity.lp_status === 'BURNED'
                      ? 'success'
                      : ''
              }
            />
          )}
          <div className="status-badge">
            <strong>STATUS:</strong> {security.status || 'UNKNOWN'}
          </div>
          <details>
            <summary className="button">View Deep Audit</summary>
            <div className="sunken-panel">
              <p className="details-text">
                Source: RugCheck + on-chain Solana RPC snapshots. This section is evidence-based and may lag slightly.
              </p>
              <p className="details-text">
                Disclaimer: Creator Wallet EMPTY is a red flag. It means the tracked creator wallet has 0 tokens now, but it does not prove a sell by itself.
              </p>
              <p className="details-text">{security.details || 'No security details available.'}</p>
            </div>
          </details>
        </div>

        <div className="section-header">QUICK ACTION</div>
        <div className="guidance-panel">
          <div className="action-strip">
            <ActionChip
              label="TIMING"
              value={timingDisplay}
              className={
                cycleStage === 'EARLY' || cycleStage === 'RUNNING'
                  ? 'success'
                  : cycleStage === 'HOT (LATE)' || cycleStage === 'TOPPING'
                    ? 'warning'
                    : 'danger'
              }
            />
            <ActionChip
              label="LIQUIDITY"
              value={liquidityStatusText}
              className={liquidity.status === 'DANGEROUS' ? 'danger' : liquidity.status === 'SAFE' ? 'success' : 'warning'}
            />
            <ActionChip
              label="RISK WARNING"
              value={plainSignal(chart.ape_signal)}
              className={
                chart.ape_signal === 'AVOID'
                  ? 'danger'
                  : chart.ape_signal === 'APE_NOW' || chart.ape_signal === 'EARLY_ENTRY'
                    ? 'warning'
                    : ''
              }
            />
          </div>

          {tipMessage && (
            <p className={tipMessage.includes('not configured') || tipMessage.includes('Failed') || tipMessage.includes('No token') ? 'error-text' : 'details-text'}>
              {tipMessage}
            </p>
          )}
        </div>

        <div className="compliance-disclaimer">
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px' }}>
              Legal & Tax Information
            </summary>
            <div style={{ padding: '12px', background: '#f0f0f0', border: '1px inset #c0c0c0', fontSize: '11px' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Not Financial, Legal, or Tax Advice:</strong> Turbo Token provides informational analysis only.
                This tool does not constitute financial, legal, or tax advice. Always conduct your own research and
                consult qualified professionals before making investment decisions.
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Risk Warning:</strong> Digital assets can lose value and may go to zero. Meme coins are highly
                speculative and carry extreme risk. Only invest what you can afford to lose entirely.
              </p>
              <p style={{ margin: '0' }}>
                <strong>Tax Responsibility (US):</strong> Cryptocurrency transactions may have tax implications. You are
                responsible for reporting gains/losses to the IRS. Consult a tax professional for guidance on your
                specific situation.
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value, className = '' }) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}:</span>
      <span className={`metric-value ${className}`}>{value}</span>
    </div>
  )
}

function QuickMeter({ title, analysis, showLoading = false }) {
  const safe = analysis || {}
  const score = Number(safe.score ?? 0)
  const pct = Math.max(0, Math.min(100, score * 10))
  const status = safe.status || 'UNKNOWN'

  if (showLoading) {
    return (
      <div className="quick-meter">
        <div className="quick-meter-title">{title}</div>
        <div className="win98-loading" style={{ height: '16px', marginBottom: '6px' }}>
          <div className="win98-loading-bar" />
        </div>
        <div className="quick-meter-row">
          <span className="win98-loading-small" style={{ fontSize: '11px', padding: '2px 4px', minWidth: 'auto' }}>LOADING...</span>
          <span className="win98-loading-small" style={{ fontSize: '11px', padding: '2px 4px', minWidth: 'auto' }}>...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="quick-meter">
      <div className="quick-meter-title">{title}</div>
      <progress className="win98-progress-meter" max="100" value={pct} />
      <div className="quick-meter-row">
        <span>{score}/10</span>
        <span>{status}</span>
      </div>
    </div>
  )
}

function ActionChip({ label, value, className = '' }) {
  return (
    <div className={`action-chip ${className}`}>
      <div className="action-chip-label">{label}</div>
      <div className="action-chip-value">{value}</div>
    </div>
  )
}

function FlagBlock({ title, className, flags }) {
  const items = Array.isArray(flags) ? flags : []
  return (
    <div className={className}>
      <h3>{title}</h3>
      <ul>
        {items.length === 0 ? <li>None</li> : items.map((flag, idx) => <li key={`${title}-${idx}`}>{flag}</li>)}
      </ul>
    </div>
  )
}

function PillarCard({ title, analysis }) {
  const safe = analysis || {}
  const status = safe.status || 'UNKNOWN'
  const statusClass =
    status === 'CRITICAL' || status === 'SUSPICIOUS' || status === 'WEAK'
      ? 'danger'
      : status === 'GOOD' || status === 'STRONG' || status === 'ORGANIC'
        ? 'success'
        : 'warning'

  return (
    <div className="pillar-card">
      <div className="pillar-header">{title}</div>
      <div className={`pillar-score ${statusClass}`}>{safe.score ?? 0}/10</div>
      <div className="pillar-status">{status}</div>
      <p className="pillar-details">{safe.details || 'No details available.'}</p>
      {Array.isArray(safe.red_flags) && safe.red_flags.length > 0 && (
        <div className="pillar-flags">
          <strong>Red:</strong> {safe.red_flags.slice(0, 2).join(', ')}
        </div>
      )}
      {Array.isArray(safe.green_flags) && safe.green_flags.length > 0 && (
        <div className="pillar-flags green">
          <strong>Green:</strong> {safe.green_flags.slice(0, 2).join(', ')}
        </div>
      )}
    </div>
  )
}

function formatNumber(value) {
  const num = Number(value || 0)
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(0)
}
