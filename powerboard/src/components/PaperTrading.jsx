import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import './PaperTrading.css'

const STARTING_BALANCE_SOL = 10

export default function PaperTrading() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const [trades, setTrades] = useState([])
  const [form, setForm] = useState({
    token_address: '',
    size_sol: '0.5',
    entry_price: '',
    slippage_pct: 1.0,
    priority_fee_sol: 0.005,
    slippage_custom: '',
    priority_fee_custom: '',
  })
  const [priceFetchStatus, setPriceFetchStatus] = useState('')
  const [activeTableTab, setActiveTableTab] = useState('performance')
  const liveQuoteCacheRef = useRef(new Map())
  const liveQuoteInFlightRef = useRef(new Map())

  const loadTrades = useCallback(async (userId) => {
    if (!supabase || !userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('paper_trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      setStatus(error.message)
      setTrades([])
    } else {
      setTrades(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      const currentSession = data.session ?? null
      setSession(currentSession)
      if (currentSession?.user?.id) {
        loadTrades(currentSession.user.id)
      } else {
        setTrades([])
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null)
      if (newSession?.user?.id) {
        loadTrades(newSession.user.id)
      } else {
        setTrades([])
      }
    })

    return () => subscription.unsubscribe()
  }, [loadTrades])

  async function sendMagicLink(e) {
    e.preventDefault()
    if (!supabase) {
      setStatus('Supabase not configured.')
      return
    }
    setLoading(true)
    setStatus('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    setLoading(false)
    if (error) {
      setStatus(error.message)
    } else {
      setStatus('Magic link sent. Check your email and click the link to sign in.')
    }
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setTrades([])
    setStatus('Signed out.')
  }

  function calcPnlSol(trade) {
    const size = Number(trade.size_sol || 0)
    const entry = Number(trade.entry_price || 0)
    // Use close_price if trade is closed, otherwise use current_price
    const current = trade.closed_at && trade.close_price 
      ? Number(trade.close_price) 
      : Number(trade.current_price || entry)
    const slippage = Number(trade.slippage_pct || 1.0)
    const priorityFee = Number(trade.priority_fee_sol || 0.005)
    if (size <= 0 || entry <= 0 || current <= 0) return 0
    
    // Apply slippage to effective entry price (you pay more on buy due to slippage)
    const effectiveEntry = entry * (1 + slippage / 100)
    const movePct = (current - effectiveEntry) / effectiveEntry
    const sideMult = trade.side === 'SHORT' ? -1 : 1
    const grossPnl = size * movePct * sideMult
    // Deduct priority fee (it's a real cost)
    return grossPnl - priorityFee
  }

  const totalPnlSol = useMemo(
    () => trades.reduce((sum, t) => sum + calcPnlSol(t), 0),
    [trades]
  )
  const equitySol = STARTING_BALANCE_SOL + totalPnlSol
  const openHoldings = useMemo(() => trades.filter((t) => !t.closed_at), [trades])

  const perfStats = useMemo(() => {
    const closed = trades.filter((t) => !!t.closed_at)
    const closedCount = closed.length
    const openCount = trades.length - closedCount

    let best = null
    let worst = null
    let totalClosedPnl = 0
    let winningCount = 0

    closed.forEach((t) => {
      const pnl = calcPnlSol(t)
      totalClosedPnl += pnl
      if (pnl > 0) winningCount += 1
      if (best === null || pnl > best) best = pnl
      if (worst === null || pnl < worst) worst = pnl
    })

    const winRate = closedCount > 0 ? (winningCount / closedCount) * 100 : null
    const avgPnl = closedCount > 0 ? totalClosedPnl / closedCount : null

    return {
      openCount,
      closedCount,
      winRate,
      bestTrade: best,
      worstTrade: worst,
      avgPnl,
    }
  }, [trades])

  async function addTrade(e) {
    e.preventDefault()
    if (!supabase || !session?.user?.id) {
      setStatus('Please log in first to track trades.')
      return
    }

    const slippageValue = form.slippage_custom ? Number(form.slippage_custom) : form.slippage_pct
    const priorityFeeValue = form.priority_fee_custom ? Number(form.priority_fee_custom) : form.priority_fee_sol
    const tokenAddress = form.token_address.trim()

    if (!tokenAddress) {
      setStatus('Please paste the token address first.')
      return
    }

    // Force a live quote at submit time so Add Trade still works if blur fetch lagged.
    let liveQuote = null
    let entryPrice = Number(form.entry_price)
    if (!entryPrice || entryPrice <= 0) {
      setStatus('Checking live price...')
      liveQuote = await fetchLiveQuote(tokenAddress)
      if (liveQuote?.timeout) {
        setStatus('Live price is taking too long. You can still press Add Trade to retry.')
        return
      } else if (liveQuote?.priceUsd) {
        entryPrice = liveQuote.priceUsd
        setForm((s) => ({ ...s, entry_price: liveQuote.priceUsd.toFixed(8) }))
        setPriceFetchStatus(`Live price loaded: $${liveQuote.priceUsd.toFixed(8)}`)
      }
    }

    if (!entryPrice || entryPrice <= 0) {
      setStatus('Could not load live price right now. Try again.')
      return
    }

    const fallbackSymbol =
      tokenAddress.length > 8
        ? `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`
        : tokenAddress
    const tokenSymbol = (liveQuote?.symbol || fallbackSymbol || 'UNKNOWN').toUpperCase()

    const payload = {
      user_id: session.user.id,
      token_symbol: tokenSymbol,
      token_address: tokenAddress || null,
      side: 'LONG', // Always LONG - everyone is just buying
      size_sol: Number(form.size_sol),
      entry_price: entryPrice,
      current_price: entryPrice, // Default to entry price on add
      slippage_pct: slippageValue,
      priority_fee_sol: priorityFeeValue,
    }

    if (!payload.size_sol) {
      setStatus('Please fill in "How much SOL?" and "Price I bought at"')
      return
    }

    setLoading(true)
    setStatus('')
    const { data, error } = await supabase.from('paper_trades').insert(payload).select().single()
    setLoading(false)

    if (error) {
      setStatus(error.message)
      return
    }

    setForm({
      token_address: '',
      size_sol: '0.5',
      entry_price: '',
      slippage_pct: 1.0,
      priority_fee_sol: 0.005,
      slippage_custom: '',
      priority_fee_custom: '',
    })
    setPriceFetchStatus('')
    setStatus('Trade added.')
    if (data) {
      setTrades((prev) => [data, ...prev])
    } else {
      loadTrades(session.user.id)
    }
  }

  async function updateCurrentPrice(id, current_price) {
    if (!supabase) return
    const value = Number(current_price)
    if (!value || value <= 0) return
    setLoading(true)
    const { error } = await supabase
      .from('paper_trades')
      .update({ current_price: value })
      .eq('id', id)
    setLoading(false)
    if (error) {
      setStatus(error.message)
    } else {
      setTrades((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                current_price: value,
              }
            : t
        )
      )
      setStatus('Price updated.')
    }
  }

  async function fetchLiveQuote(tokenAddress) {
    const normalizedAddress = String(tokenAddress || '').trim()
    if (!normalizedAddress) return null

    const cached = liveQuoteCacheRef.current.get(normalizedAddress)
    if (cached && Date.now() - cached.ts < 30000) {
      return { ...cached.quote, cached: true }
    }

    // De-duplicate in-flight requests so multiple callers share the same DexScreener hit.
    const inFlight = liveQuoteInFlightRef.current.get(normalizedAddress)
    if (inFlight) {
      return inFlight
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000) // 4 second timeout

    const fetchPromise = (async () => {
      try {
        const response = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(normalizedAddress)}`,
          { signal: controller.signal }
        )
        clearTimeout(timeoutId)
        if (!response.ok) return null
        const data = await response.json()
        const pairs = Array.isArray(data.pairs) ? data.pairs : []
        if (pairs.length === 0) return null
        const bestPair = pairs[0]
        const priceUsd = Number(bestPair.priceUsd)
        if (!priceUsd || priceUsd <= 0) return null
        const symbol = String(bestPair?.baseToken?.symbol || '').trim()
        const quote = { priceUsd, symbol }
        liveQuoteCacheRef.current.set(normalizedAddress, { quote, ts: Date.now() })
        return quote
      } catch (err) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          console.warn('Live price fetch timed out')
          return { timeout: true }
        }
        console.error('Failed to fetch live price:', err)
        return null
      } finally {
        liveQuoteInFlightRef.current.delete(normalizedAddress)
      }
    })()

    liveQuoteInFlightRef.current.set(normalizedAddress, fetchPromise)
    return fetchPromise
  }

  async function handleTokenAddressBlur() {
    const address = form.token_address.trim()
    if (!address) {
      setPriceFetchStatus('')
      return
    }
    setPriceFetchStatus('Checking live price...')
    const quote = await fetchLiveQuote(address)
    if (quote?.timeout) {
      setPriceFetchStatus('Live price is taking too long. You can still press Add Trade to retry.')
    } else if (quote?.priceUsd) {
      setForm((s) => ({ ...s, entry_price: quote.priceUsd.toFixed(8) }))
      setPriceFetchStatus(
        quote.cached
          ? `Live price loaded (cached): $${quote.priceUsd.toFixed(8)}`
          : `Live price loaded: $${quote.priceUsd.toFixed(8)}`
      )
    } else {
      setPriceFetchStatus('Could not load live price right now. Try again.')
    }
  }

  async function sellTrade(trade) {
    if (!supabase || !trade.token_address) {
      setStatus('Cannot sell: token address missing. Update the price manually instead.')
      return
    }
    setLoading(true)
    setStatus('Checking live price...')
    const quote = await fetchLiveQuote(trade.token_address)
    const livePrice = quote?.priceUsd
    setLoading(false)
    if (quote?.timeout) {
      setStatus('Live price is taking too long. Use "Update Price" to enter it manually.')
      return
    }
    if (!livePrice || livePrice <= 0) {
      setStatus('Could not load live price right now. Use "Update Price" to enter it manually.')
      return
    }
    const tempTrade = { ...trade, current_price: livePrice }
    const pnl = calcPnlSol(tempTrade)
    const pnlText = pnl >= 0 ? `+${pnl.toFixed(4)}` : pnl.toFixed(4)
    const confirmMsg = `Sell ${trade.token_symbol} at $${livePrice.toFixed(8)}?\nP&L: ${pnlText} SOL`
    if (!window.confirm(confirmMsg)) return
    setLoading(true)
    const { data: updatedTrade, error } = await supabase
      .from('paper_trades')
      .update({
        current_price: livePrice,
        close_price: livePrice,
        closed_at: new Date().toISOString(),
      })
      .eq('id', trade.id)
      .select()
      .single()
    setLoading(false)
    if (error) {
      setStatus(error.message)
    } else {
      setStatus(`Sold ${trade.token_symbol} at $${livePrice.toFixed(8)} | P&L: ${pnlText} SOL`)
      if (updatedTrade) {
        setTrades((prev) => prev.map((t) => (t.id === updatedTrade.id ? updatedTrade : t)))
      } else {
        loadTrades(session?.user?.id)
      }
    }
  }

  if (!session) {
    const notConfiguredMessage =
      !supabase
        ? 'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
        : ''

    return (
      <section className="paper-window">
        <h2>PAPER TRADING</h2>
        <p>Start with 10 SOL fake balance. No password needed — we'll email you a one-click sign-in link.</p>
        <form onSubmit={sendMagicLink} className="paper-form">
          <label htmlFor="paper-email">Email</label>
          <input
            id="paper-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Email me a login link'}
          </button>
        </form>
        {(status || notConfiguredMessage) && (
          <p className={`paper-status ${(status || notConfiguredMessage).includes('not configured') ? 'error' : ''}`}>
            {status || notConfiguredMessage}
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="paper-window">
      <div className="paper-top">
        <h2>PAPER TRADING</h2>
        <button className="paper-signout-btn" onClick={signOut} disabled={loading}>
          Sign Out
        </button>
      </div>

      <div className="paper-stats">
        <div className="paper-stat-item">
          <strong>Starting Balance:</strong> {STARTING_BALANCE_SOL.toFixed(2)} SOL
        </div>
        <div className="paper-stat-item">
          <strong>Profit / Loss:</strong>{' '}
          <span className={totalPnlSol >= 0 ? 'green' : 'red'}>
            {totalPnlSol >= 0 ? '+' : ''}
            {totalPnlSol.toFixed(3)} SOL
          </span>
        </div>
        <div className="paper-stat-item">
          <strong>My Balance:</strong> {equitySol.toFixed(3)} SOL
        </div>
        <div className="paper-stat-item">
          <strong>Total Trades:</strong> {trades.length}
        </div>
      </div>

      <form onSubmit={addTrade} className="paper-form-grid">
        <div className="paper-form-field">
          <label htmlFor="token-address">Token Address</label>
          <input
            id="token-address"
            placeholder="Contract address"
            value={form.token_address}
            onChange={(e) => setForm((s) => ({ ...s, token_address: e.target.value }))}
            onBlur={handleTokenAddressBlur}
            required
            disabled={loading}
          />
          <small>Paste token address to auto-fill live price</small>
          {priceFetchStatus && (
            <small className={priceFetchStatus.includes('loaded') ? 'green' : ''}>
              {priceFetchStatus}
            </small>
          )}
        </div>
        <div className="paper-form-field">
          <label htmlFor="size-sol">How much SOL?</label>
          <input
            id="size-sol"
            placeholder="0.5"
            type="number"
            min="0.01"
            step="0.01"
            value={form.size_sol}
            onChange={(e) => setForm((s) => ({ ...s, size_sol: e.target.value }))}
            required
            disabled={loading}
          />
          <small>How many SOL you're using for this trade</small>
        </div>
        <div className="paper-form-field">
          <label htmlFor="entry-price">Price I bought at</label>
          <input
            id="entry-price"
            placeholder={form.token_address ? "Fetching live price..." : "Enter token address above"}
            type="number"
            min="0.0000001"
            step="0.0000001"
            value={form.entry_price}
            readOnly
            disabled={loading || !form.token_address}
            className={!form.token_address ? "paper-readonly-empty" : ""}
          />
          <small>Auto-filled from live price when you enter a token address</small>
        </div>
        <div className="paper-form-field paper-form-field-full">
          <label htmlFor="slippage">Slippage Tolerance</label>
          <div className="paper-preset-buttons">
            <button
              type="button"
              className={form.slippage_custom ? '' : form.slippage_pct === 0.5 ? 'active' : ''}
              onClick={() => setForm((s) => ({ ...s, slippage_pct: 0.5, slippage_custom: '' }))}
              disabled={loading}
            >
              0.5%
            </button>
            <button
              type="button"
              className={form.slippage_custom ? '' : form.slippage_pct === 1.0 ? 'active' : ''}
              onClick={() => setForm((s) => ({ ...s, slippage_pct: 1.0, slippage_custom: '' }))}
              disabled={loading}
            >
              1%
            </button>
            <button
              type="button"
              className={form.slippage_custom ? '' : form.slippage_pct === 2.0 ? 'active' : ''}
              onClick={() => setForm((s) => ({ ...s, slippage_pct: 2.0, slippage_custom: '' }))}
              disabled={loading}
            >
              2%
            </button>
            <input
              type="number"
              placeholder="Custom %"
              min="0.1"
              max="50"
              step="0.1"
              value={form.slippage_custom}
              onChange={(e) => setForm((s) => ({ ...s, slippage_custom: e.target.value, slippage_pct: 1.0 }))}
              disabled={loading}
              className="paper-custom-input"
            />
          </div>
          <small>How much the price can move before your buy gets cancelled. Higher = safer but worse price.</small>
        </div>
        <div className="paper-form-field paper-form-field-full">
          <label htmlFor="priority-fee">Priority Fee (Validator Tip)</label>
          <div className="paper-preset-buttons">
            <button
              type="button"
              className={form.priority_fee_custom ? '' : form.priority_fee_sol === 0.001 ? 'active' : ''}
              onClick={() => setForm((s) => ({ ...s, priority_fee_sol: 0.001, priority_fee_custom: '' }))}
              disabled={loading}
            >
              Slow (0.001 SOL)
            </button>
            <button
              type="button"
              className={form.priority_fee_custom ? '' : form.priority_fee_sol === 0.005 ? 'active' : ''}
              onClick={() => setForm((s) => ({ ...s, priority_fee_sol: 0.005, priority_fee_custom: '' }))}
              disabled={loading}
            >
              Normal (0.005 SOL)
            </button>
            <button
              type="button"
              className={form.priority_fee_custom ? '' : form.priority_fee_sol === 0.01 ? 'active' : ''}
              onClick={() => setForm((s) => ({ ...s, priority_fee_sol: 0.01, priority_fee_custom: '' }))}
              disabled={loading}
            >
              Fast (0.01 SOL)
            </button>
            <input
              type="number"
              placeholder="Custom SOL"
              min="0.0001"
              max="1"
              step="0.0001"
              value={form.priority_fee_custom}
              onChange={(e) => setForm((s) => ({ ...s, priority_fee_custom: e.target.value, priority_fee_sol: 0.005 }))}
              disabled={loading}
              className="paper-custom-input"
            />
          </div>
          <small>Extra SOL paid to get your trade through faster. Fast = near-instant. Slow = might fail if busy.</small>
        </div>
        <button type="submit" className="paper-submit-btn" disabled={loading}>
          {loading ? 'Adding...' : 'Add Trade'}
        </button>
      </form>

      {status && <p className={`paper-status ${status.includes('error') || status.includes('not configured') ? 'error' : ''}`}>{status}</p>}

      <div className="paper-tabs">
        <button
          type="button"
          className={`paper-tab ${activeTableTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTableTab('performance')}
          disabled={loading}
        >
          PERFORMANCE
        </button>
        <button
          type="button"
          className={`paper-tab ${activeTableTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTableTab('history')}
          disabled={loading}
        >
          HISTORY
        </button>
      </div>

      {openHoldings.length > 0 && (
        <div className="paper-holdings">
          <div className="paper-holdings-header">Current Holdings</div>
          {openHoldings.map((t) => {
            const pnl = calcPnlSol(t)
            const addr = t.token_address || ''
            const shortAddr =
              addr && addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr || 'N/A'
            const photonUrl = t.token_address ? buildPhotonUrl(t.token_address) : null
            const symbolLabel = t.token_symbol
              ? `$${String(t.token_symbol).replace(/^\$/, '')}`
              : '$TOKEN'
            return (
              <div key={t.id} className="paper-holdings-row">
                <span className="paper-holdings-token">{symbolLabel}</span>
                <span className="paper-holdings-addr">{shortAddr}</span>
                <span className="paper-holdings-size">{Number(t.size_sol).toFixed(2)} SOL</span>
                <span className={`paper-holdings-pnl ${pnl >= 0 ? 'green' : 'red'}`}>
                  {pnl >= 0 ? '+' : ''}
                  {pnl.toFixed(4)} SOL
                </span>
                <button
                  type="button"
                  className="paper-holdings-sell-btn paper-sell-btn"
                  disabled={loading}
                  onClick={() => sellTrade(t)}
                >
                  SELL
                </button>
                <button
                  type="button"
                  className="paper-holdings-photon-btn"
                  disabled={!photonUrl || loading}
                  onClick={() => {
                    if (!photonUrl) return
                    window.open(photonUrl, '_blank', 'noopener,noreferrer')
                  }}
                >
                  PHOTON
                </button>
              </div>
            )
          })}
        </div>
      )}

      {activeTableTab === 'performance' && (
        <div className="perf-grid">
          <div className="perf-stat">
            <strong>Starting Balance</strong>
            <span>{STARTING_BALANCE_SOL.toFixed(2)} SOL</span>
          </div>
          <div className="perf-stat">
            <strong>My Balance</strong>
            <span>{equitySol.toFixed(3)} SOL</span>
          </div>
          <div className="perf-stat">
            <strong>Total Profit / Loss</strong>
            <span className={totalPnlSol >= 0 ? 'green' : 'red'}>
              {totalPnlSol >= 0 ? '+' : ''}
              {totalPnlSol.toFixed(3)} SOL
            </span>
          </div>
          <div className="perf-stat">
            <strong>Open Trades</strong>
            <span>{perfStats.openCount}</span>
          </div>
          <div className="perf-stat">
            <strong>Closed Trades</strong>
            <span>{perfStats.closedCount}</span>
          </div>
          <div className="perf-stat">
            <strong>Win Rate</strong>
            <span>{perfStats.winRate != null ? `${perfStats.winRate.toFixed(0)}%` : 'N/A'}</span>
          </div>
          <div className="perf-stat">
            <strong>Best Trade</strong>
            <span className={perfStats.bestTrade != null && perfStats.bestTrade >= 0 ? 'green' : 'red'}>
              {perfStats.bestTrade != null ? `${perfStats.bestTrade >= 0 ? '+' : ''}${perfStats.bestTrade.toFixed(4)} SOL` : 'N/A'}
            </span>
          </div>
          <div className="perf-stat">
            <strong>Worst Trade</strong>
            <span className={perfStats.worstTrade != null && perfStats.worstTrade >= 0 ? 'green' : 'red'}>
              {perfStats.worstTrade != null ? `${perfStats.worstTrade >= 0 ? '+' : ''}${perfStats.worstTrade.toFixed(4)} SOL` : 'N/A'}
            </span>
          </div>
          <div className="perf-stat">
            <strong>Average Trade P&L</strong>
            <span className={perfStats.avgPnl != null && perfStats.avgPnl >= 0 ? 'green' : 'red'}>
              {perfStats.avgPnl != null ? `${perfStats.avgPnl >= 0 ? '+' : ''}${perfStats.avgPnl.toFixed(4)} SOL` : 'N/A'}
            </span>
          </div>
        </div>
      )}

      {activeTableTab === 'history' && (
        <div className="paper-table-wrap">
          <table className="paper-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Size (SOL)</th>
                <th>Entry Price</th>
                <th>Current Price</th>
                <th>Profit / Loss</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && trades.length === 0 ? (
                <tr>
                  <td colSpan="6">Loading trades...</td>
                </tr>
              ) : trades.length === 0 ? (
                <tr>
                  <td colSpan="6">No trades yet. Use the form above to track your first one!</td>
                </tr>
              ) : (
                trades.map((t) => {
                  const isClosed = !!t.closed_at
                  const displayPrice = isClosed ? (t.close_price || t.current_price) : t.current_price
                  const pnl = calcPnlSol(t)
                  return (
                    <tr key={t.id} className={isClosed ? 'paper-trade-closed' : ''}>
                      <td>{t.token_symbol}</td>
                      <td>{Number(t.size_sol).toFixed(2)}</td>
                      <td>{Number(t.entry_price).toFixed(8)}</td>
                      <td>{Number(displayPrice).toFixed(8)}</td>
                      <td className={pnl >= 0 ? 'green' : 'red'}>
                        {pnl >= 0 ? '+' : ''}
                        {pnl.toFixed(4)}
                      </td>
                      <td>
                        {isClosed ? (
                          <span>—</span>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                const val = window.prompt('New current price?', String(t.current_price))
                                if (val == null) return
                                updateCurrentPrice(t.id, val)
                              }}
                              disabled={loading}
                            >
                              Update Price
                            </button>
                            <button
                              onClick={() => sellTrade(t)}
                              disabled={loading}
                              style={{ marginLeft: '4px' }}
                              className="paper-sell-btn"
                            >
                              SELL
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
