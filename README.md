# FPL Geek

FPL Geek is an advanced Fantasy Premier League analytics tool that helps you optimize your squad using data-driven insights. It features historical analysis, price change predictions, and AI-powered squad recommendations.

## Features
- **Pitch View**: Visualise your team with live data.
- **AI History**: Analyze past performance vs predicted points (xP).
- **Transfer Recommendations**: Smart value analysis for potential transfers.
- **Price Predictions**: Monitor potential price rises and falls.

## Architecture

- The React/Vite frontend is deployed to Vercel.
- Root-level Vercel functions under `api/` proxy the official FPL API and query Databricks.
- `databricks_backend_pipeline.py` runs weekly as a Databricks Job and refreshes the catalog tables consumed by the API.
- Squad optimization runs in the browser using `frontend/src/utils/solver.ts`; no always-on application backend is required for it.

See `deployment.md` for the Vercel and Databricks deployment checklist.

## Local Development

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

