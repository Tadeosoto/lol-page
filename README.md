# LoL WinRate Stats

Modern React/Next.js site to:
- Enter a Riot ID (`GameName` + `TagLine`) and choose a Riot server/platform.
- Get your **top win-rate champions** and your **biggest personal counter** (based on your ranked Solo queue losses).
- Show **sample-based win-rates** for your current rank band (aggregated from ranked matches we’ve ingested from requests).

## Setup

1. Create a file named `.env.local` in this folder (do **not** commit it).
2. Put your Riot API key in:
   - `RIOT_API_KEY=...`
3. (Optional) Set:
   - `RIOT_DDRAGON_LOCALE=en_US`

## Run

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Notes about “rank band win-rates” (Option B)
Riot does not provide direct “Silver IV champion win-rate” aggregates via API. This app builds an approximation by ingesting ranked Solo queue match outcomes from the users you query (stored in `data/population.json`).

