import { useState, useEffect, useRef } from 'react'
import Header from './components/Header.jsx'
import Dashboard from './components/Dashboard.jsx'
import PaperTrading from './components/PaperTrading.jsx'
import { buildPhotonUrl, getTipWallet } from './components/WalletProvider.jsx'
import { useTokenData } from './hooks/useTokenData.js'
import './App.css'

function App() {
  const [selectedCA, setSelectedCA] = useState('')
  const [affiliateCAInput, setAffiliateCAInput] = useState('')
  const [activeTab, setActiveTab] = useState('analyzer')
  const { tokenData, analysis, loading, error, llmPending, runXRay } = useTokenData(selectedCA)
  const [tipMsg, setTipMsg] = useState('')

  const [affiliateStatus, setAffiliateStatus] = useState({ type: 'idle', message: '' })
  const affiliateTimeoutRef = useRef(null)

  // Auto-clear success messages after 2.5s, keep errors until next click
  useEffect(() => {
    if (affiliateStatus.type === 'success' && affiliateTimeoutRef.current === null) {
      affiliateTimeoutRef.current = setTimeout(() => {
        setAffiliateStatus({ type: 'idle', message: '' })
        affiliateTimeoutRef.current = null
      }, 2500)
    }
    return () => {
      if (affiliateTimeoutRef.current) {
        clearTimeout(affiliateTimeoutRef.current)
        affiliateTimeoutRef.current = null
      }
    }
  }, [affiliateStatus.type])

  async function onTipClick() {
    setTipMsg('')
    const wallet = getTipWallet()
    if (!wallet) {
      setTipMsg('Tip not configured. Set VITE_TIP_WALLET in .env.local')
      return
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(wallet)
        setTipMsg('Wallet address copied. Paste it into your Solana wallet to send a tip.')
      } else {
        setTipMsg(`Wallet address: ${wallet} (copy manually)`)
      }
    } catch (err) {
      setTipMsg(`Wallet address: ${wallet} (copy manually)`)
    }
  }

  useEffect(() => {
    if (selectedCA) {
      setAffiliateCAInput(selectedCA)
    }
  }, [selectedCA])

  async function onPhotonClick() {
    // Clear any existing timeout
    if (affiliateTimeoutRef.current) {
      clearTimeout(affiliateTimeoutRef.current)
      affiliateTimeoutRef.current = null
    }

    setAffiliateStatus({ type: 'idle', message: '' })

    const targetCA = (affiliateCAInput || selectedCA || '').trim()
    if (!targetCA) {
      setAffiliateStatus({ type: 'error', message: 'Select a token first, then use Photon.' })
      return
    }

    const url = buildPhotonUrl(targetCA)
    if (!url) {
      setAffiliateStatus({ type: 'error', message: 'Photon link not configured. Set VITE_PHOTON_BOT_TEMPLATE in .env.local' })
      return
    }

    try {
      // Attempt to copy CA to clipboard
      let clipboardSuccess = false
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(targetCA)
          clipboardSuccess = true
        }
      } catch (clipErr) {
        // Clipboard failed, but continue with opening Photon
        console.warn('Clipboard copy failed:', clipErr)
      }

      // Open Photon link
      window.open(url, '_blank', 'noopener,noreferrer')

      // Set success message based on clipboard outcome
      const successMsg = clipboardSuccess
        ? 'Copied CA to clipboard and opened Photon site'
        : 'Opened Photon site (clipboard unavailable)'
      setAffiliateStatus({ type: 'success', message: successMsg })
    } catch (err) {
      setAffiliateStatus({ type: 'error', message: 'Failed to open link. Please check your browser settings.' })
    }
  }

  return (
    <main className="app-shell">
      <aside className="support-rail">
        <div className="support-card">
          <h3>Keep TurboToken Free</h3>
          <p>
            TurboToken is completely free to use — including the paper trading sandbox — so you can learn and experiment without risking real SOL.
          </p>
          <p>
            If this tool helps you, one way to support it is by sending a small SOL tip to help cover server costs and keep it free for everyone.
          </p>
          <p>Good luck trading out there.</p>
          <button className="support-tip-btn" onClick={onTipClick}>
            TIP SOL
          </button>
          {tipMsg && (
            <p className={`support-tip-msg ${tipMsg.includes('not configured') || tipMsg.includes('Failed') ? 'error' : ''}`}>
              {tipMsg}
            </p>
          )}
        </div>
      </aside>

      <div className="window">
        <div className="title-bar">
          <div className="title-bar-text">Turbo Token</div>
          <div className="title-bar-right">
            <button
              className={`title-tab ${activeTab === 'analyzer' ? 'active' : ''}`}
              onClick={() => setActiveTab('analyzer')}
            >
              ANALYZER
            </button>
            <button
              className={`title-tab ${activeTab === 'paper' ? 'active' : ''}`}
              onClick={() => setActiveTab('paper')}
            >
              PAPER TRADING
            </button>
            <div className="title-bar-controls">
              <button aria-label="Minimize"></button>
              <button aria-label="Maximize"></button>
              <button aria-label="Close"></button>
            </div>
          </div>
        </div>
        <div className="window-body">
          {activeTab === 'analyzer' ? (
            <>
              <Header selectedCA={selectedCA} onSelectCA={setSelectedCA} tokenLoading={loading} onAnalyze={() => selectedCA && runXRay(selectedCA)} />
              <hr />
              <Dashboard
                selectedCA={selectedCA}
                tokenData={tokenData}
                analysis={analysis}
                loading={loading}
                error={error}
                llmPending={llmPending}
              />
            </>
          ) : (
            <PaperTrading />
          )}
        </div>
      </div>

      <aside className="affiliate-rail">
        <div className="affiliate-card">
          <h3>Quick Actions</h3>
          <input
            className="affiliate-ca-input"
            type="text"
            value={affiliateCAInput}
            onChange={(e) => setAffiliateCAInput(e.target.value)}
            placeholder="Contract address"
          />
          <button className="affiliate-btn photon" onClick={onPhotonClick}>
            BUY WITH PHOTON
          </button>
          <p className="affiliate-hint">Your contract address will be copied to your clipboard.</p>
          {affiliateStatus.type !== 'idle' && (
            <div className={`affiliate-status-box ${affiliateStatus.type === 'success' ? 'success' : 'error'}`}>
              <span className="affiliate-status-indicator"></span>
              <span className="affiliate-status-text">{affiliateStatus.message}</span>
            </div>
          )}
        </div>
      </aside>
    </main>
  )
}

export default App
