# Binancetradesaas

An Angular + Vercel serverless app for an AI-assisted automated trading workflow.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start the dev app:

```bash
npm run start
```

3. (Optional) Run Vercel serverless locally:

```bash
npx vercel dev
```

The UI will be at `http://localhost:4200`.

## Environment Variables

Copy `.env.example` values into Vercel environment variables:

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `BINANCE_TESTNET`
- `BOT_SECRET`

## Project Structure

- `src/` Angular UI
- `api/` Vercel serverless endpoints
- `scripts/` GitHub Actions bot runner

## Scripts

- `npm run start` Start Angular dev server (proxying `/api`)
- `npm run build` Production build
- `npm run test` Unit tests

## Notes

- The UI uses `/api/market/*` endpoints to avoid Binance CORS issues.
- Bot cycles run in a Web Worker when the UI is open.
- GitHub Actions can call the bot endpoint on a schedule.