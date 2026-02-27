import { useEffect, useMemo, useState } from 'react'
import { searchTokens } from '../services/apiService.js'
import './Header.css'

const DEBOUNCE_MS = 400

export default function Header({ selectedCA, onSelectCA, tokenLoading = false, onAnalyze }) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false

    async function runSearch() {
      if (!debouncedQuery) {
        setResults([])
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const data = await searchTokens(debouncedQuery)
        if (!cancelled) {
          setResults(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Search failed')
          setResults([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    runSearch()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const selectedValue = useMemo(() => selectedCA || '', [selectedCA])

  return (
    <header className="pb-header">
      <h1 className="pb-title">Turbo Token</h1>
      <div className="field-row-stacked">
        <label htmlFor="token-search">Search token (symbol/name/address)</label>
        <input
          id="token-search"
          className="search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. BONK, WIF, token CA"
        />
      </div>

      <div className="field-row-stacked">
        <label htmlFor="token-select">Select market pair</label>
        <select
          id="token-select"
          className="result-select"
          value={selectedValue}
          onChange={(e) => onSelectCA(e.target.value)}
        >
          <option value="">Choose token...</option>
          {results.map((item) => (
            <option key={`${item.address}:${item.pairAddress}`} value={item.address}>
              {item.symbol} | {item.name} | MC ${shortMoney(item.marketCap)} | LQ ${shortMoney(item.liquidityUsd)}
            </option>
          ))}
        </select>
      </div>

      {selectedCA && (
        <div className="field-row-stacked" style={{ marginTop: '8px' }}>
          <button
            type="button"
            className="analyze-btn"
            onClick={() => onAnalyze && onAnalyze()}
            disabled={!selectedCA || tokenLoading}
          >
            {tokenLoading ? 'ANALYZING...' : 'ANALYZE TOKEN'}
          </button>
        </div>
      )}

      {tokenLoading && (
        <div className="token-loading-row" aria-live="polite">
          <div className="token-loading-track">
            <div className="token-loading-bar" />
          </div>
          <span>Analyzing token...</span>
        </div>
      )}

      <div className="status-line">
        {loading && <span>Searching DexScreener...</span>}
        {!loading && error && <span className="error-text">{error}</span>}
        {!loading && !error && debouncedQuery && results.length === 0 && (
          <span>No pairs found.</span>
        )}
        {!loading && !error && !debouncedQuery && (
          <span>Type to search tokens.</span>
        )}
      </div>
    </header>
  )
}

function shortMoney(value) {
  const num = Number(value || 0)
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(0)
}
