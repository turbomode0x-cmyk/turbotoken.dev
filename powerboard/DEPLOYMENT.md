# Deployment Guide

This guide explains how to deploy TurboToken to Vercel from any GitHub account.

## Prerequisites

- A GitHub account
- A Vercel account (free tier works)
- A Supabase account (free tier works)
- A Google Cloud account with Gemini API access

## Step 1: Fork/Clone the Repository

1. Fork this repository to your GitHub account, or clone it:
   ```bash
   git clone https://github.com/YOUR_USERNAME/turbotoken.dev.git
   cd turbotoken.dev/powerboard
   ```

## Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In your Supabase project, go to **SQL Editor**
3. Copy and run the contents of `supabase-schema.sql` to create the `paper_trades` table
4. Go to **Settings** → **API** and copy:
   - Your **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - Your **anon/public key**

## Step 3: Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key (you'll add it to Vercel later)

## Step 4: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in
2. **Connect GitHub** (if not already connected):
   - Click your profile → **Settings** → **Git**
   - Click **"Connect GitHub"** and authorize Vercel
   - Grant access to the repository (or all repos)
3. Click **"Add New..."** → **"Project"**
4. In the repository search, type: `turbotoken.dev` or `turbomode0x-cmyk/turbotoken.dev`
   - If the repo doesn't appear:
     - Check that your GitHub account has access to the repo
     - If it's a private repo, ensure Vercel has permission to access it
     - Try refreshing the page or disconnecting/reconnecting GitHub
5. Click **"Import"** on the repository
6. **Important**: Set the **Root Directory** to `powerboard`
5. Configure the project:
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `bun run build` (or `npm run build` if using npm)
   - **Output Directory**: `dist`
6. Click **"Environment Variables"** and add:

   **Client Variables (VITE_*):**
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   VITE_PHOTON_BOT_TEMPLATE=https://photon-sol.tinyastro.io/...{ca}
   VITE_TIP_WALLET=your-solana-wallet-address
   ```

   **Server Variables (no VITE_ prefix):**
   ```
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODELS=gemini-2.0-flash,gemini-2.5-flash,gemini-2.5-pro
   ```

7. Click **"Deploy"**

### Option B: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. From the `powerboard` directory:
   ```bash
   cd powerboard
   vercel
   ```

3. Follow the prompts:
   - Link to existing project or create new
   - Set root directory to `powerboard`
   - Add environment variables when prompted

4. Deploy to production:
   ```bash
   vercel --prod
   ```

## Step 5: Verify Deployment

After deployment, test:

1. **Analyzer Tab**: Paste a Solana token address and verify:
   - X-Ray data loads (DexScreener, RugCheck, Bubblemaps)
   - Deterministic analysis appears immediately
   - AI analysis loads after a few seconds (check browser console for `/api/gemini-eval` calls)

2. **Paper Trading Tab**: 
   - Sign in with email (magic link)
   - Create a test trade
   - Verify it saves and loads correctly

## Troubleshooting

### Build Fails

- Ensure **Root Directory** is set to `powerboard` in Vercel settings
- Check that `package.json` has correct build script
- Verify all dependencies are in `package.json` (not just devDependencies)

### API Route Not Working

- Verify `GEMINI_API_KEY` is set in Vercel (not `VITE_GEMINI_API_KEY`)
- Check Vercel function logs: **Deployments** → **Functions** → `api/gemini-eval`
- Ensure `api/gemini-eval.js` exists in the `powerboard/api/` directory

### Supabase Errors

- Verify RLS policies are enabled (run `supabase-schema.sql`)
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly
- Ensure you're using the **anon key**, not the service role key

### Environment Variables Not Loading

- Client variables must start with `VITE_` to be exposed to the browser
- Server variables (like `GEMINI_API_KEY`) should NOT have `VITE_` prefix
- After adding env vars, redeploy the project

## Local Development

To test locally with the same setup as production:

1. Create `.env.local` in the `powerboard` directory:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_PHOTON_BOT_TEMPLATE=https://photon-sol.tinyastro.io/...{ca}
   VITE_TIP_WALLET=your-wallet-address
   GEMINI_API_KEY=your-gemini-key
   GEMINI_MODELS=gemini-2.0-flash,gemini-2.5-flash,gemini-2.5-pro
   ```

2. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```

3. Run Vercel dev (to test serverless functions):
   ```bash
   vercel dev
   ```

   Or run Vite only (AI won't work, but UI will):
   ```bash
   bun run dev
   ```

## Custom Domain

After deployment, you can add a custom domain in Vercel:

1. Go to your project → **Settings** → **Domains**
2. Add your domain
3. Follow DNS configuration instructions

## Continuous Deployment

By default, Vercel automatically deploys:
- Every push to `main` branch → Production
- Pull requests → Preview deployments

You can configure this in **Settings** → **Git**.
