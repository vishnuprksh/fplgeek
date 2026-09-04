# Graph Report - fplgeek  (2026-09-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 413 nodes · 696 edges · 28 communities (25 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9c60ebd6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/fpl.ts
- devDependencies
- dataFactory.ts
- App.tsx
- compilerOptions
- useOptimization.ts
- compilerOptions
- FastAPI Backend
- main.py
- dependencies
- gameweekValidation.ts
- fetch_data.py
- preprocess.py
- frontend/package.json
- package.json
- train_predict.py
- dependencies
- Frontend App
- SkeletonLoader.tsx
- setup.sh
- react-dnd
- react-dnd-html5-backend
- react-dom
- react-markdown
- tsconfig.json
- update_data.sh

## God Nodes (most connected - your core abstractions)
1. `UnifiedPlayer` - 20 edges
2. `compilerOptions` - 20 edges
3. `compilerOptions` - 18 edges
4. `Team` - 17 edges
5. `Player` - 13 edges
6. `FastAPI Backend` - 13 edges
7. `IDataProvider` - 12 edges
8. `SqliteProvider` - 12 edges
9. `BootstrapStatic` - 12 edges
10. `optimizeWithAllowance()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Frontend App` ----> `Node.js`  [INFERRED]
  frontend/package.json → README.md
- `FPL Geek` ----> `Frontend App`  [INFERRED]
  README.md → frontend/package.json
- `FPL Geek` ----> `FastAPI Backend`  [INFERRED]
  README.md → backend/requirements.txt
- `TeamCardProps` --references--> `TeamEntry`  [EXTRACTED]
  frontend/src/components/TeamCard.tsx → frontend/src/types/fpl.ts
- `ScoredFixture` --references--> `Match`  [EXTRACTED]
  frontend/src/utils/fixtures.ts → frontend/src/types/fpl.ts

## Import Cycles
- None detected.

## Communities (28 total, 3 thin omitted)

### Community 0 - "types/fpl.ts"
Cohesion: 0.08
Nodes (39): FixtureAnalysis(), FixtureAnalysisProps, ItemTypes, PitchViewProps, PlayerAnalysis(), PlayerAnalysisProps, TODO: topHaulPlayers could be displayed in UI later, SortDirection (+31 more)

### Community 1 - "devDependencies"
Cohesion: 0.05
Nodes (46): copy-webpack-plugin, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tsx (+38 more)

### Community 2 - "dataFactory.ts"
Cohesion: 0.10
Nodes (9): FplApiProvider, getDataProvider(), HybridDataProvider, hybridProvider, IDataProvider, SqliteProvider, BootstrapStatic, ElementType (+1 more)

### Community 3 - "App.tsx"
Cohesion: 0.07
Nodes (22): App(), BottomNav(), BottomNavProps, iconMap, DataView(), ProcessedSample, TrainingDataResponse, GWData (+14 more)

### Community 4 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 5 - "useOptimization.ts"
Cohesion: 0.18
Nodes (20): OptimizationReport(), OptimizationReportProps, TransferModal(), computeTotalForecast(), useOptimization(), getSelectedGameweeks(), comb(), combinations() (+12 more)

### Community 6 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 7 - "FastAPI Backend"
Cohesion: 0.09
Nodes (22): deploy_vps.py, AI History, FPL Geek, Pitch View, Price Predictions, Transfer Recommendations, Expected Points (xP), FPL Data (+14 more)

### Community 8 - "main.py"
Cohesion: 0.22
Nodes (16): data_file(), feature_importance(), fixtures(), gameweek_context(), health(), league_analysis(), load_app_data(), load_fixtures() (+8 more)

### Community 9 - "dependencies"
Cohesion: 0.12
Nodes (17): better-sqlite3, csv-parse, dotenv, node-fetch, dependencies, better-sqlite3, csv-parse, dotenv (+9 more)

### Community 10 - "gameweekValidation.ts"
Cohesion: 0.30
Nodes (10): CandidatePoolValidation, HaulCalculationResult, NormalizedPrediction, ValidatedProjection, calculateValidatedHaul(), isBlankGW(), isPastGW(), normalizePrediction() (+2 more)

### Community 11 - "fetch_data.py"
Cohesion: 0.40
Nodes (10): build_history_row(), fetch(), fetch_and_store_fixtures(), fetch_csv(), fetch_current_gw_history(), fetch_historical_seasons(), fetch_league_analysis(), init_db() (+2 more)

### Community 12 - "preprocess.py"
Cohesion: 0.40
Nodes (9): build_venue_table(), fixture_scores(), get_season(), main(), make_seq_row(), opp_strength(), rolling_agg(), safe_float() (+1 more)

### Community 13 - "frontend/package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 14 - "package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, dev, dev:backend, setup, update:data, type (+1 more)

### Community 15 - "train_predict.py"
Cohesion: 0.56
Nodes (8): analyze_feature_importance(), clean(), get_future_gws(), load_data(), main(), predict(), split_future(), train()

### Community 16 - "dependencies"
Cohesion: 0.22
Nodes (9): dependencies, recharts, remark-gfm, sql.js, sql.js, recharts, remark-gfm, recharts (+1 more)

### Community 17 - "Frontend App"
Cohesion: 0.33
Nodes (6): Frontend App, react, vite, Node.js, React, Vite

### Community 19 - "setup.sh"
Cohesion: 0.83
Nodes (3): fail(), setup.sh script, warn()

### Community 20 - "react-dnd"
Cohesion: 0.67
Nodes (3): react-dnd, react-dnd, react-dnd

### Community 21 - "react-dnd-html5-backend"
Cohesion: 0.67
Nodes (3): react-dnd-html5-backend, react-dnd-html5-backend, react-dnd-html5-backend

### Community 22 - "react-dom"
Cohesion: 0.67
Nodes (3): react-dom, react-dom, react-dom

### Community 23 - "react-markdown"
Cohesion: 0.67
Nodes (3): react-markdown, react-markdown, react-markdown

## Knowledge Gaps
- **115 isolated node(s):** `TeamStats`, `TickerMatch`, `SortDirection`, `SortField`, `PlayerHistory` (+110 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`, `dependencies`, `react-dnd`, `react-dnd-html5-backend`, `react-dom`, `react-markdown`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `Frontend App`, `frontend/package.json`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `frontend/package.json`, `Frontend App`, `react-dnd`, `react-dnd-html5-backend`, `react-dom`, `react-markdown`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `TeamStats`, `TickerMatch`, `SortDirection` to the rest of the system?**
  _115 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/fpl.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08051948051948052 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05410628019323672 - nodes in this community are weakly interconnected._
- **Should `dataFactory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1024390243902439 - nodes in this community are weakly interconnected._