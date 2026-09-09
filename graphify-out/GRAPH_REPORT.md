# Graph Report - fplgeek  (2026-09-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 443 nodes · 734 edges · 24 communities (21 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3e7a6809`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/fpl.ts
- devDependencies
- dependencies
- App.tsx
- UnifiedPlayer
- compilerOptions
- compilerOptions
- FastAPI Backend
- solver.ts
- main.py
- test_player_aggregates.py
- gameweekValidation.ts
- fetch_data.py
- train_predict.py
- package.json
- preprocess.py
- frontend/package.json
- SkeletonLoader.tsx
- setup.sh
- tsconfig.json
- update_data.sh

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `UnifiedPlayer` - 19 edges
3. `compilerOptions` - 18 edges
4. `Team` - 17 edges
5. `Player` - 13 edges
6. `FastAPI Backend` - 13 edges
7. `SqliteProvider` - 12 edges
8. `IDataProvider` - 12 edges
9. `BootstrapStatic` - 11 edges
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
- `PitchViewProps` --references--> `UnifiedPlayer`  [EXTRACTED]
  frontend/src/components/PitchView.tsx → frontend/src/types/fpl.ts

## Import Cycles
- None detected.

## Communities (24 total, 3 thin omitted)

### Community 0 - "types/fpl.ts"
Cohesion: 0.07
Nodes (43): FixtureAnalysis(), FixtureAnalysisProps, ItemTypes, PitchViewProps, PlayerAnalysis(), PlayerAnalysisProps, TODO: topHaulPlayers could be displayed in UI later, SortDirection (+35 more)

### Community 1 - "devDependencies"
Cohesion: 0.05
Nodes (46): copy-webpack-plugin, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, devDependencies, eslint, @eslint/js (+38 more)

### Community 2 - "dependencies"
Cohesion: 0.05
Nodes (44): better-sqlite3, Frontend App, csv-parse, dotenv, dependencies, react, react-dnd, react-dnd-html5-backend (+36 more)

### Community 3 - "App.tsx"
Cohesion: 0.06
Nodes (28): App(), BottomNav(), BottomNavProps, iconMap, DataView(), ProcessedSample, TrainingDataResponse, GWData (+20 more)

### Community 4 - "UnifiedPlayer"
Cohesion: 0.10
Nodes (9): FplApiProvider, getDataProvider(), HybridDataProvider, hybridProvider, IDataProvider, SqliteProvider, ElementType, Event (+1 more)

### Community 5 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 6 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 7 - "FastAPI Backend"
Cohesion: 0.09
Nodes (22): deploy_vps.py, AI History, FPL Geek, Pitch View, Price Predictions, Transfer Recommendations, Expected Points (xP), FPL Data (+14 more)

### Community 8 - "solver.ts"
Cohesion: 0.22
Nodes (16): OptimizationReport(), OptimizationReportProps, useOptimization(), comb(), combinations(), fillSlots(), formatFormation(), Lineup (+8 more)

### Community 9 - "main.py"
Cohesion: 0.22
Nodes (17): data_file(), feature_importance(), fixtures(), gameweek_context(), health(), league_analysis(), load_app_data(), load_fixtures() (+9 more)

### Community 10 - "test_player_aggregates.py"
Cohesion: 0.18
Nodes (16): check_historic_seasons(), check_player_aggregates(), dedup_current_season_history(), fetch_json(), load_history_by_player(), load_season_totals(), main(), print_report() (+8 more)

### Community 11 - "gameweekValidation.ts"
Cohesion: 0.30
Nodes (10): CandidatePoolValidation, HaulCalculationResult, NormalizedPrediction, ValidatedProjection, calculateValidatedHaul(), isBlankGW(), isPastGW(), normalizePrediction() (+2 more)

### Community 12 - "fetch_data.py"
Cohesion: 0.40
Nodes (10): build_history_row(), fetch(), fetch_and_store_fixtures(), fetch_csv(), fetch_current_gw_history(), fetch_historical_seasons(), fetch_league_analysis(), init_db() (+2 more)

### Community 13 - "train_predict.py"
Cohesion: 0.40
Nodes (10): analyze_feature_importance(), clean(), get_future_gws(), load_data(), main(), predict(), Train scaler + RandomForest for one position. Returns (clf, scaler, report) or…, split_future() (+2 more)

### Community 14 - "package.json"
Cohesion: 0.18
Nodes (10): name, private, scripts, dev, dev:backend, setup, test, update:data (+2 more)

### Community 15 - "preprocess.py"
Cohesion: 0.40
Nodes (9): build_venue_table(), fixture_scores(), get_season(), main(), make_seq_row(), opp_strength(), rolling_agg(), safe_float() (+1 more)

### Community 16 - "frontend/package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 18 - "setup.sh"
Cohesion: 0.83
Nodes (3): fail(), setup.sh script, warn()

## Knowledge Gaps
- **121 isolated node(s):** `TeamStats`, `TickerMatch`, `SortDirection`, `SortField`, `PlayerHistory` (+116 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `frontend/package.json`, `dependencies`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `frontend/package.json`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `TeamStats`, `TickerMatch`, `SortDirection` to the rest of the system?**
  _121 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/fpl.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0726775956284153 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05410628019323672 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05179704016913319 - nodes in this community are weakly interconnected._