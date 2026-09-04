# Graph Report - fplgeek  (2026-09-04)

## Corpus Check
- 47 files · ~23,972 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 448 nodes · 715 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a153c20b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- FixtureAnalysis.tsx
- devDependencies
- types/fpl.ts
- App.tsx
- compilerOptions
- useOptimization.ts
- compilerOptions
- FastAPI Backend
- main.py
- dependencies
- test_player_aggregates.py
- fetch_data.py
- preprocess.py
- dependencies
- SqliteProvider
- train_predict.py
- devDependencies
- SkeletonLoader.tsx
- setup.sh
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
- `ScoredFixture` --references--> `Match`  [EXTRACTED]
  frontend/src/utils/fixtures.ts → frontend/src/types/fpl.ts
- `App()` --calls--> `useOptimization()`  [EXTRACTED]
  frontend/src/App.tsx → frontend/src/hooks/useOptimization.ts

## Import Cycles
- None detected.

## Communities (24 total, 4 thin omitted)

### Community 0 - "FixtureAnalysis.tsx"
Cohesion: 0.27
Nodes (7): FixtureAnalysis(), calculateTable(), getFixtureTicker(), ScoredFixture, TeamSchedule, TeamStats, TickerMatch

### Community 1 - "devDependencies"
Cohesion: 0.06
Nodes (31): copy-webpack-plugin, devDependencies, copy-webpack-plugin, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+23 more)

### Community 2 - "types/fpl.ts"
Cohesion: 0.08
Nodes (25): FixtureAnalysisProps, PlayerAnalysis(), TODO: topHaulPlayers could be displayed in UI later, SortDirection, SortField, PlayerDetailModal(), PlayerDetailModalProps, TeamCard() (+17 more)

### Community 3 - "App.tsx"
Cohesion: 0.07
Nodes (27): App(), BottomNav(), BottomNavProps, iconMap, DataView(), ProcessedSample, TrainingDataResponse, GWData (+19 more)

### Community 4 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 5 - "useOptimization.ts"
Cohesion: 0.09
Nodes (40): OptimizationReport(), OptimizationReportProps, PlayerAnalysisProps, BacktestResult, PlayerHistoryModalProps, SortDirection, SortField, TransferModal() (+32 more)

### Community 6 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 7 - "FastAPI Backend"
Cohesion: 0.07
Nodes (28): deploy_vps.py, Frontend App, AI History, FPL Geek, Pitch View, Price Predictions, Transfer Recommendations, Expected Points (xP) (+20 more)

### Community 8 - "main.py"
Cohesion: 0.22
Nodes (16): data_file(), feature_importance(), fixtures(), gameweek_context(), health(), league_analysis(), load_app_data(), load_fixtures() (+8 more)

### Community 9 - "dependencies"
Cohesion: 0.05
Nodes (39): better-sqlite3, csv-parse, dotenv, node-fetch, dependencies, better-sqlite3, csv-parse, dotenv (+31 more)

### Community 10 - "test_player_aggregates.py"
Cohesion: 0.23
Nodes (12): check_player_aggregates(), dedup_current_season_history(), load_history_by_player(), load_season_totals(), main(), print_report(), Test script: verify that each player's aggregated per-gameweek history (stored…, Filter and deduplicate player_history rows to current-season matches.… (+4 more)

### Community 11 - "fetch_data.py"
Cohesion: 0.40
Nodes (10): build_history_row(), fetch(), fetch_and_store_fixtures(), fetch_csv(), fetch_current_gw_history(), fetch_historical_seasons(), fetch_league_analysis(), init_db() (+2 more)

### Community 12 - "preprocess.py"
Cohesion: 0.40
Nodes (9): build_venue_table(), fixture_scores(), get_season(), main(), make_seq_row(), opp_strength(), rolling_agg(), safe_float() (+1 more)

### Community 13 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, react, react-dnd, react-dnd-html5-backend, react-dom, react-markdown, recharts, remark-gfm (+16 more)

### Community 15 - "train_predict.py"
Cohesion: 0.56
Nodes (8): analyze_feature_importance(), clean(), get_future_gws(), load_data(), main(), predict(), split_future(), train()

### Community 17 - "devDependencies"
Cohesion: 0.07
Nodes (29): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tsx, @types/node (+21 more)

### Community 19 - "setup.sh"
Cohesion: 0.83
Nodes (3): fail(), setup.sh script, warn()

## Knowledge Gaps
- **156 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+151 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `FastAPI Backend`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `dependencies`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `dependencies`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _156 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `types/fpl.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08176100628930817 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06565656565656566 - nodes in this community are weakly interconnected._