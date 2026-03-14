# UK Wind Forecast Monitoring App + Analysis

This repository contains:
1. A forecast monitoring web app for UK national wind generation (January 2024).
2. A Jupyter notebook analyzing forecast error characteristics and deriving a reliability recommendation for wind availability.

## AI Usage Disclosure
AI tooling was used during development for coding assistance and iteration (implementation support and drafting). Final outputs were reviewed and validated locally (data fetch checks, app build, notebook execution).

## Directory Structure
- `app/` : Next.js App Router frontend and API routes
- `lib/` : Shared server-side monitoring logic
- `scripts/` : Data ingestion and dataset validation scripts
- `data/` : Local January 2024 BMRS snapshots used by app + notebook
- `analysis/` : Jupyter notebook and notebook requirements
- `package.json` : Project scripts/dependencies

## Data Sources
- Actual generation (WIND fuel): BMRS `FUELHH`
- Forecast generation: BMRS `WINDFOR`

The ingestion script fetches January 2024 target times and filters forecast rows to horizon `[0, 48]` hours.

## How To Run Locally
### 1) Install dependencies
```bash
npm install
```

### 2) Fetch January 2024 data snapshot
```bash
npm run fetch:data
npm run check:data
```

### 3) Start app
```bash
npm run dev
```
Open `http://localhost:3000`.

### 4) Production build check
```bash
npm run build
npm start
```

## Notebook (Analysis)
Notebook path:
- `analysis/wind_forecast_analysis.ipynb`

Install notebook deps (if needed):
```bash
python -m pip install -r analysis/requirements.txt
```

Then open and run:
```bash
jupyter notebook analysis/wind_forecast_analysis.ipynb
```

## Deployment (Vercel)
### Option A: Vercel Dashboard
- Import this repo into Vercel.
- Build command: `npm run build`
- Output: default Next.js output

### Option B: CLI
```bash
npm i -g vercel
vercel
vercel --prod
```

## Submission Links
- App demo link (Vercel/Heroku): `ADD_YOUR_LINK_HERE`
- Demo video link (unlisted YouTube): `ADD_YOUR_LINK_HERE`
- Repo zip (Google Drive): `ADD_YOUR_LINK_HERE`

## Notes
- The app uses UTC controls and displays actual vs selected forecast for a configurable horizon.
- Forecast selection rule: latest forecast with `publishTime <= targetTime - horizon`.
- Missing forecasts are not imputed and are not plotted.
