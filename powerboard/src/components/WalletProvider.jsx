export function buildSnipeUrl(tokenCA) {
  const ca = (tokenCA || '').trim()
  if (!ca) return null

  const template =
    import.meta.env.VITE_SNIPE_BOT_TEMPLATE ||
    'https://t.me/bonkbot_bot?start={ca}'

  return template.includes('{ca}')
    ? template.replace('{ca}', encodeURIComponent(ca))
    : `${template}${encodeURIComponent(ca)}`
}

export function buildPhotonUrl(tokenCA) {
  const ca = (tokenCA || '').trim()
  if (!ca) return null

  const template = (import.meta.env.VITE_PHOTON_BOT_TEMPLATE || '').trim()
  if (!template) return null

  return template.includes('{ca}')
    ? template.replace('{ca}', encodeURIComponent(ca))
    : `${template}${encodeURIComponent(ca)}`
}

function isValidSolAddress(address) {
  return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim())
}

export function getTipWallet() {
  const wallet = (import.meta.env.VITE_TIP_WALLET || '').trim()
  return isValidSolAddress(wallet) ? wallet : null
}

export function getTipUrl(amountSol) {
  const wallet = (import.meta.env.VITE_TIP_WALLET || '').trim()
  const amount = Number(amountSol)

  if (!isValidSolAddress(wallet)) return null
  if (!Number.isFinite(amount) || amount <= 0) return null

  const params = new URLSearchParams({
    amount: amount.toString(),
    label: 'Turbo Token Tip',
    message: 'Thanks for supporting Turbo Token',
  })

  // Solana Pay URI
  return `solana:${wallet}?${params.toString()}`
}
