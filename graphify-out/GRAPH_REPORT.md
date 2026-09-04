# Graph Report - fplgeek  (2026-09-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 410 nodes · 676 edges · 30 communities (26 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `30f501f9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/fpl.ts
- App.tsx
- devDependencies
- compilerOptions
- compilerOptions
- FastAPI Backend
- main.py
- dependencies
- FixtureAnalysis.tsx
- gameweekValidation.ts
- fetch_data.py
- preprocess.py
- frontend/package.json
- SqliteProvider
- package.json
- train_predict.py
- recharts
- BottomNav.tsx
- dependencies
- SkeletonLoader.tsx
- setup.sh
- react-dnd
- react-dnd-html5-backend
- react-dom
- react-markdown
- tsconfig.json
- update_data.sh
- remark-gfm

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `UnifiedPlayer` - 18 edges
3. `compilerOptions` - 18 edges
4. `Team` - 15 edges
5. `FastAPI Backend` - 13 edges
6. `Player` - 11 edges
7. `IDataProvider` - 11 edges
8. `BootstrapStatic` - 11 edges
9. `SqliteProvider` - 11 edges
10. `optimizeWithAllowance()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Frontend App` ----> `Node.js`  [INFERRED]
  frontend/package.json → README.md
- `FPL Geek` ----> `Frontend App`  [INFERRED]
  README.md → frontend/package.json
- `FPL Geek` ----> `FastAPI Backend`  [INFERRED]
  README.md → backend/requirements.txt
- `PlayerHistoryModalProps` --references--> `Player`  [EXTRACTED]
  frontend/src/components/PlayerHistoryModal.tsx → frontend/src/types/fpl.ts
- `TeamCardProps` --references--> `TeamEntry`  [EXTRACTED]
  frontend/src/components/TeamCard.tsx → frontend/src/types/fpl.ts

## Import Cycles
- None detected.

## Communities (30 total, 4 thin omitted)

### Community 0 - "types/fpl.ts"
Cohesion: 0.06
Nodes (37): ItemTypes, PitchView(), PitchViewProps, PlayerAnalysis(), PlayerAnalysisProps, TODO: topHaulPlayers could be displayed in UI later, SortDirection, SortField (+29 more)

### Community 1 - "App.tsx"
Cohesion: 0.08
Nodes (38): App(), DataView(), ProcessedSample, TrainingDataResponse, GWData, LeagueAnalysis(), LeagueData, OwnedPlayer (+30 more)

### Community 2 - "devDependencies"
Cohesion: 0.05
Nodes (46): copy-webpack-plugin, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tsx (+38 more)

### Community 3 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 4 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 5 - "FastAPI Backend"
Cohesion: 0.09
Nodes (22): deploy_vps.py, AI History, FPL Geek, Pitch View, Price Predictions, Transfer Recommendations, Expected Points (xP), FPL Data (+14 more)

### Community 6 - "main.py"
Cohesion: 0.22
Nodes (16): data_file(), feature_importance(), fixtures(), gameweek_context(), health(), league_analysis(), load_app_data(), load_fixtures() (+8 more)

### Community 7 - "dependencies"
Cohesion: 0.12
Nodes (17): better-sqlite3, csv-parse, dotenv, node-fetch, dependencies, better-sqlite3, csv-parse, dotenv (+9 more)

### Community 8 - "FixtureAnalysis.tsx"
Cohesion: 0.26
Nodes (9): FixtureAnalysis(), FixtureAnalysisProps, Match, calculateTable(), getFixtureTicker(), ScoredFixture, TeamSchedule, TeamStats (+1 more)

### Community 9 - "gameweekValidation.ts"
Cohesion: 0.30
Nodes (10): CandidatePoolValidation, HaulCalculationResult, NormalizedPrediction, ValidatedProjection, calculateValidatedHaul(), isBlankGW(), isPastGW(), normalizePrediction() (+2 more)

### Community 10 - "fetch_data.py"
Cohesion: 0.40
Nodes (10): build_history_row(), fetch(), fetch_and_store_fixtures(), fetch_csv(), fetch_current_gw_history(), fetch_historical_seasons(), fetch_league_analysis(), init_db() (+2 more)

### Community 11 - "preprocess.py"
Cohesion: 0.40
Nodes (9): build_venue_table(), fixture_scores(), get_season(), main(), make_seq_row(), opp_strength(), rolling_agg(), safe_float() (+1 more)

### Community 12 - "frontend/package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 14 - "package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, dev, dev:backend, setup, update:data, type (+1 more)

### Community 15 - "train_predict.py"
Cohesion: 0.56
Nodes (8): analyze_feature_importance(), clean(), get_future_gws(), load_data(), main(), predict(), split_future(), train()

### Community 16 - "recharts"
Cohesion: 0.67
Nodes (3): recharts, recharts, recharts

### Community 17 - "BottomNav.tsx"
Cohesion: 0.22
Nodes (3): BottomNav(), BottomNavProps, iconMap

### Community 18 - "dependencies"
Cohesion: 0.25
Nodes (9): Frontend App, dependencies, react, sql.js, vite, sql.js, Node.js, React (+1 more)

### Community 20 - "setup.sh"
Cohesion: 0.83
Nodes (3): fail(), setup.sh script, warn()

### Community 21 - "react-dnd"
Cohesion: 0.67
Nodes (3): react-dnd, react-dnd, react-dnd

### Community 22 - "react-dnd-html5-backend"
Cohesion: 0.67
Nodes (3): react-dnd-html5-backend, react-dnd-html5-backend, react-dnd-html5-backend

### Community 23 - "react-dom"
Cohesion: 0.67
Nodes (3): react-dom, react-dom, react-dom

### Community 24 - "react-markdown"
Cohesion: 0.67
Nodes (3): react-markdown, react-markdown, react-markdown

### Community 29 - "remark-gfm"
Cohesion: 0.67
Nodes (3): remark-gfm, remark-gfm, remark-gfm

## Knowledge Gaps
- **116 isolated node(s):** `SortDirection`, `SortField`, `BacktestResult`, `PlayerHistory`, `PlayerSummary` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`, `recharts`, `react-dnd`, `react-dnd-html5-backend`, `react-dom`, `react-markdown`, `remark-gfm`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `dependencies`, `frontend/package.json`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `frontend/package.json`, `recharts`, `react-dnd`, `react-dnd-html5-backend`, `react-dom`, `react-markdown`, `remark-gfm`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `SortDirection`, `SortField`, `BacktestResult` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/fpl.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0624048706240487 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07568027210884354 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05410628019323672 - nodes in this community are weakly interconnected._