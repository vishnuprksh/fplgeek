# Graph Report - fplgeek  (2026-09-03)

## Corpus Check
- Corpus is ~21,778 words - fits in a single context window. You may not need a graph.

## Summary
- 434 nodes · 673 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Player Detail & Data Layer
- FPL Analytics Concepts
- Root Package Deps
- App Shell & Navigation
- Pitch & Player Analysis UI
- Root Package Dependencies
- Frontend Dev Dependencies
- Frontend Runtime Deps
- App TS Config
- Node TS Config
- Squad Optimization Solver
- FastAPI Backend Endpoints
- Fixture Analysis
- Gameweek Validation
- Root Package Scripts
- Data Fetching Pipeline
- Preprocessing Pipeline
- SQLite Data Provider
- ML Training & Prediction
- Skeleton Loaders
- TS Project References
- Update Shell Script

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
10. `optimizeWithAllowance()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Frontend App` ----> `Node.js`  [INFERRED]
  frontend/package.json → README.md
- `FPL Geek` ----> `Frontend App`  [INFERRED]
  README.md → frontend/package.json
- `FPL Geek` ----> `FastAPI Backend`  [INFERRED]
  README.md → backend/requirements.txt
- `App()` --calls--> `useOptimization()`  [EXTRACTED]
  frontend/src/App.tsx → frontend/src/hooks/useOptimization.ts
- `App()` --calls--> `useTransfers()`  [EXTRACTED]
  frontend/src/App.tsx → frontend/src/hooks/useTransfers.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **** — service:fastapi_backend, tech:scikit_learn, tech:joblib, data:ml_models, concept:xp_prediction [INFERRED]
- **** — component:frontend_app, tech:react, tech:vite, tech:typescript, tech:recharts [INFERRED]
- **** — concept:fpl_analytics, tech:docker, tech:nginx_proxy, component:deploy_vps_script [INFERRED]
- **** — concept:pitch_view, concept:ai_history, concept:transfer_recommendations, concept:price_predictions [INFERRED]

## Communities (24 total, 4 thin omitted)

### Community 0 - "Player Detail & Data Layer"
Cohesion: 0.09
Nodes (19): PlayerDetailModalProps, TeamCard(), TeamCardProps, AIPredictionMap, T100OwnershipMap, FplApiProvider, getDataProvider(), HybridDataProvider (+11 more)

### Community 1 - "FPL Analytics Concepts"
Cohesion: 0.06
Nodes (32): deploy_vps.py, Frontend App, AI History, FPL Geek, Pitch View, Price Predictions, Transfer Recommendations, Expected Points (xP) (+24 more)

### Community 2 - "Root Package Deps"
Cohesion: 0.06
Nodes (31): copy-webpack-plugin, devDependencies, copy-webpack-plugin, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+23 more)

### Community 3 - "App Shell & Navigation"
Cohesion: 0.08
Nodes (19): App(), BottomNav(), BottomNavProps, iconMap, DataView(), ProcessedSample, TrainingDataResponse, GWData (+11 more)

### Community 4 - "Pitch & Player Analysis UI"
Cohesion: 0.11
Nodes (21): ItemTypes, PitchViewProps, PlayerAnalysis(), PlayerAnalysisProps, TODO: topHaulPlayers could be displayed in UI later, SortDirection, SortField, PlayerDetailModal() (+13 more)

### Community 5 - "Root Package Dependencies"
Cohesion: 0.07
Nodes (29): better-sqlite3, csv-parse, dotenv, node-fetch, dependencies, better-sqlite3, csv-parse, dotenv (+21 more)

### Community 6 - "Frontend Dev Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tsx, @types/node (+21 more)

### Community 7 - "Frontend Runtime Deps"
Cohesion: 0.07
Nodes (26): dependencies, react, react-dnd, react-dnd-html5-backend, react-dom, react-markdown, recharts, remark-gfm (+18 more)

### Community 8 - "App TS Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 9 - "Node TS Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 10 - "Squad Optimization Solver"
Cohesion: 0.20
Nodes (17): OptimizationReport(), OptimizationReportProps, useOptimization(), comb(), combinations(), fillSlots(), formatFormation(), Lineup (+9 more)

### Community 11 - "FastAPI Backend Endpoints"
Cohesion: 0.22
Nodes (16): data_file(), feature_importance(), fixtures(), gameweek_context(), health(), league_analysis(), load_app_data(), load_fixtures() (+8 more)

### Community 12 - "Fixture Analysis"
Cohesion: 0.26
Nodes (9): FixtureAnalysis(), FixtureAnalysisProps, Match, calculateTable(), getFixtureTicker(), ScoredFixture, TeamSchedule, TeamStats (+1 more)

### Community 13 - "Gameweek Validation"
Cohesion: 0.27
Nodes (10): CandidatePoolValidation, HaulCalculationResult, NormalizedPrediction, ValidatedProjection, calculateValidatedHaul(), isBlankGW(), isPastGW(), normalizePrediction() (+2 more)

### Community 14 - "Root Package Scripts"
Cohesion: 0.15
Nodes (12): name, private, scripts, build, dev, dev:backend, ingest:local, lint (+4 more)

### Community 15 - "Data Fetching Pipeline"
Cohesion: 0.40
Nodes (10): build_history_row(), fetch(), fetch_and_store_fixtures(), fetch_csv(), fetch_current_gw_history(), fetch_historical_seasons(), fetch_league_analysis(), init_db() (+2 more)

### Community 16 - "Preprocessing Pipeline"
Cohesion: 0.40
Nodes (9): build_venue_table(), fixture_scores(), get_season(), main(), make_seq_row(), opp_strength(), rolling_agg(), safe_float() (+1 more)

### Community 18 - "ML Training & Prediction"
Cohesion: 0.56
Nodes (8): analyze_feature_importance(), clean(), get_future_gws(), load_data(), main(), predict(), split_future(), train()

## Knowledge Gaps
- **165 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+160 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Root Package Deps` to `Root Package Scripts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Root Package Dependencies` to `Root Package Scripts`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `UnifiedPlayer` connect `Player Detail & Data Layer` to `SQLite Data Provider`, `Squad Optimization Solver`, `Pitch & Player Analysis UI`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _165 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Player Detail & Data Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.08973172987974098 - nodes in this community are weakly interconnected._
- **Should `FPL Analytics Concepts` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `Root Package Deps` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._