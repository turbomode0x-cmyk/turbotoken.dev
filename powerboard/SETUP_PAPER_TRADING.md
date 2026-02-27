# Paper Trading Setup Guide

## 1. Create Supabase Project

1. Go to https://supabase.com and create a free account/project
2. Copy your project URL and anon key from Settings > API

## 2. Add Environment Variables

Add these to your `.env.local` file:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
VITE_TIP_WALLET=YOUR_SOLANA_WALLET_ADDRESS
VITE_SNIPE_BOT_TEMPLATE=https://t.me/YOUR_TROJAN_BOT?start=YOUR_AFF_CODE-{ca}
VITE_PHOTON_BOT_TEMPLATE=https://YOUR_PHOTON_LINK_WITH_{ca}
```

Replace:
- `YOUR_PROJECT_ID` with your Supabase project ID
- `YOUR_ANON_KEY_HERE` with your Supabase anon/public key
- `YOUR_SOLANA_WALLET_ADDRESS` with your actual Solana wallet address (for receiving tips)
- `YOUR_TROJAN_BOT` with your Trojan bot username
- `YOUR_AFF_CODE` with your affiliate code (the `{ca}` will be replaced with the token contract address)
- `VITE_PHOTON_BOT_TEMPLATE` with your Photon affiliate URL template that contains `{ca}`

## 3. Run SQL Schema

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `supabase-schema.sql`
4. Click "Run" to create the `paper_trades` table and RLS policies

## 4. Test It

1. Start your dev server: `bun run dev`
2. Click the "PAPER TRADING" tab in the top-right
3. Enter your email and click "Send Magic Link"
4. Check your email and click the magic link to sign in
5. Add a test trade and verify it saves

## Notes

- Each user starts with 10 SOL fake balance
- All trades are isolated per user (RLS ensures this)
- Magic link login is email-only (no passwords)
- Tips use Solana Pay URIs - make sure `VITE_TIP_WALLET` is set correctly
