import { useState } from 'react'
import { getTipUrl, buildSnipeUrl } from './WalletProvider.jsx'
import './SupportPage.css'

export default function SupportPage({ selectedCA, onBackToAnalyzer }) {
  const [status, setStatus] = useState('')

  const tipWallet = (import.meta.env.VITE_TIP_WALLET || '').trim()

  async function handleTip() {
    setStatus('')
    const input = window.prompt('Enter tip amount in SOL (example: 0.05)', '0.05')
    if (input == null) return

    const amount = Number(input)
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('Please enter a valid SOL amount greater than 0.')
      return
    }

    const url = getTipUrl(amount)
    if (!url) {
      setStatus('Tip not configured. Set VITE_TIP_WALLET in .env.local')
      return
    }

    try {
      window.open(url, '_blank', 'noopener,noreferrer')
      setStatus(`Opening wallet for ${amount} SOL tip...`)
    } catch {
      setStatus('Failed to open link. Please check your browser settings.')
    }
  }

  async function handleSnipe() {
    setStatus('')
    if (!selectedCA) {
      setStatus('No token selected. Please select a token in the Analyzer tab first.')
      return
    }

    const snipeUrl = buildSnipeUrl(selectedCA)
    if (!snipeUrl) {
      setStatus('Snipe link not configured. Set VITE_SNIPE_BOT_TEMPLATE in .env.local')
      return
    }

    try {
      window.open(snipeUrl, '_blank', 'noopener,noreferrer')
      setStatus('Opening Trojan snipe link...')
    } catch {
      setStatus('Failed to open link. Please check your browser settings.')
    }
  }

  async function handleCopyWallet() {
    setStatus('')
    if (!tipWallet) {
      setStatus('Tip wallet not configured. Set VITE_TIP_WALLET in .env.local')
      return
    }

    try {
      await navigator.clipboard.writeText(tipWallet)
      setStatus('Wallet address copied to clipboard.')
    } catch {
      setStatus('Copy failed. Please copy manually: ' + tipWallet)
    }
  }

  return (
    <section className="support-page">
      <div className="support-page-header">
        <h2>Support TurboToken</h2>
        <button onClick={onBackToAnalyzer} className="support-back-btn">
          Back to Analyzer
        </button>
      </div>

      <div className="support-page-content">
        <p>
          We love building this tool, and we want to keep it 100% free for everyone—including paper trading. If TurboToken is helping you make better moves and you want to chip in to help us cover server costs, any tip is hugely appreciated. If not, no sweat!
        </p>
        <p>Good luck trading out there.</p>

        <div className="support-actions">
          <button className="support-action-btn tip-btn" onClick={handleTip}>
            TIP (ANY AMOUNT)
          </button>
          <button className="support-action-btn snipe-btn" onClick={handleSnipe} disabled={!selectedCA}>
            SNIPE (TROJAN)
          </button>
          <button className="support-action-btn copy-btn" onClick={handleCopyWallet}>
            COPY WALLET ADDRESS
          </button>
        </div>

        {!selectedCA && (
          <p className="support-hint">
            <strong>Note:</strong> Select a token in the Analyzer tab to enable the SNIPE button.
          </p>
        )}

        {status && (
          <p className={`support-status ${status.includes('not configured') || status.includes('Failed') || status.includes('No token') ? 'error' : ''}`}>
            {status}
          </p>
        )}
      </div>
    </section>
  )
}
