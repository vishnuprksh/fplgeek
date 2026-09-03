# FPL Geek

FPL Geek is an advanced Fantasy Premier League analytics tool that helps you optimize your squad using data-driven insights. It features historical analysis, price change predictions, and AI-powered squad recommendations.

## Features
- **Pitch View**: Visualise your team with live data.
- **AI History**: Analyze past performance vs predicted points (xP).
- **Transfer Recommendations**: Smart value analysis for potential transfers.
- **Price Predictions**: Monitor potential price rises and falls.

## 🚀 Local Development

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/fplgeek.git
    cd fplgeek
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5173`.

---

## 🏗 Architecture

- **Frontend**: React + Vite SPA, deployed on **Vercel**. Team optimization runs entirely client-side (`frontend/src/hooks/useOptimization.ts`).
- **API**: TypeScript serverless functions in `api/` (Vercel functions). They read the active data version from **Neon Postgres** and proxy live FPL API requests (`/api/fpl/*`) to avoid CORS.
- **Database**: Neon Postgres with versioned rows (`data_versions` + `data_version_id` on all tables), so the site keeps serving the last good dataset while a new one is being published. Migrations live in `neon/migrations/`.
- **Weekly pipeline**: A scheduled GitHub Actions workflow runs `backend/scripts/` — `fetch_data.py` (staging SQLite) → `preprocess.py` → `train_predict.py` → `validate_data.py` → `import_neon.py` (publishes to Neon as a new version and activates it).

## 🔧 Local Development

```bash
npm install              # root deps (serverless API types + Neon client)
npm --prefix frontend install
npm run dev              # frontend dev server (Vite)
```

For full-stack local development, run `vercel dev` from the repo root — it serves both the SPA and the `api/` functions with `DATABASE_URL` / `NEON_DATABASE_URL` set in `.env`. Alternatively set `VITE_API_ORIGIN` in `frontend` to point the dev proxy at your deployed Vercel URL.

## 📦 Weekly Data Refresh

Trigger the GitHub Actions workflow (or run locally with `npm run pipeline:local`):

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python scripts/fetch_data.py      # fetch FPL data into staging SQLite
python scripts/preprocess.py      # feature engineering
python scripts/train_predict.py   # train model, generate predictions
python scripts/validate_data.py   # sanity checks
python scripts/import_neon.py --source data/fpl.sqlite   # publish + activate in Neon
```

## ☁️ Deployment (Vercel + Neon)

1. Import the repo into Vercel; the frontend builds with `npm --prefix frontend run build` and `api/` functions deploy automatically.
2. Set `DATABASE_URL` (or `NEON_DATABASE_URL`) as a Vercel env var, pointing at your Neon connection string.
3. Apply migrations in `neon/migrations/` to your Neon database before the first deploy.
4. Add the Neon connection string as a secret (`NEON_DATABASE_URL`) in the GitHub Actions repo secrets for the weekly pipeline.
