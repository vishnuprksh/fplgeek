# Graph Report - fplgeek  (2026-09-04)

## Corpus Check
- 44 files · ~22,376 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 429 nodes · 673 edges · 22 communities (19 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `df71f17a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/fpl.ts
- dependencies
- App.tsx
- compilerOptions
- solver.ts
- compilerOptions
- FastAPI Backend
- main.py
- FixtureAnalysis.tsx
- PlayerAnalysis.tsx
- fetch_data.py
- preprocess.py
- dependencies
- train_predict.py
- devDependencies
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
- `FixtureAnalysisProps` --references--> `Team`  [EXTRACTED]
  frontend/src/components/FixtureAnalysis.tsx → frontend/src/types/fpl.ts

## Import Cycles
- None detected.

## Communities (22 total, 3 thin omitted)

### Community 0 - "types/fpl.ts"
Cohesion: 0.08
Nodes (22): PitchViewProps, PlayerDetailModalProps, TeamCard(), TeamCardProps, AIPredictionMap, T100OwnershipMap, FplApiProvider, getDataProvider() (+14 more)

### Community 1 - "dependencies"
Cohesion: 0.05
Nodes (38): better-sqlite3, csv-parse, dotenv, node-fetch, dependencies, better-sqlite3, csv-parse, dotenv (+30 more)

### Community 2 - "App.tsx"
Cohesion: 0.06
Nodes (28): App(), BottomNav(), BottomNavProps, iconMap, DataView(), ProcessedSample, TrainingDataResponse, GWData (+20 more)

### Community 3 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 4 - "solver.ts"
Cohesion: 0.15
Nodes (20): OptimizationReport(), OptimizationReportProps, BacktestResult, PlayerHistoryModalProps, useOptimization(), Player, comb(), combinations() (+12 more)

### Community 5 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 6 - "FastAPI Backend"
Cohesion: 0.07
Nodes (28): deploy_vps.py, Frontend App, AI History, FPL Geek, Pitch View, Price Predictions, Transfer Recommendations, Expected Points (xP) (+20 more)

### Community 7 - "main.py"
Cohesion: 0.22
Nodes (16): data_file(), feature_importance(), fixtures(), gameweek_context(), health(), league_analysis(), load_app_data(), load_fixtures() (+8 more)

### Community 8 - "FixtureAnalysis.tsx"
Cohesion: 0.26
Nodes (9): FixtureAnalysis(), FixtureAnalysisProps, Match, calculateTable(), getFixtureTicker(), ScoredFixture, TeamSchedule, TeamStats (+1 more)

### Community 9 - "PlayerAnalysis.tsx"
Cohesion: 0.15
Nodes (17): PlayerAnalysis(), PlayerAnalysisProps, TODO: topHaulPlayers could be displayed in UI later, SortDirection, SortField, PlayerDetailModal(), CandidatePoolValidation, HaulCalculationResult (+9 more)

### Community 10 - "fetch_data.py"
Cohesion: 0.40
Nodes (10): build_history_row(), fetch(), fetch_and_store_fixtures(), fetch_csv(), fetch_current_gw_history(), fetch_historical_seasons(), fetch_league_analysis(), init_db() (+2 more)

### Community 11 - "preprocess.py"
Cohesion: 0.40
Nodes (9): build_venue_table(), fixture_scores(), get_season(), main(), make_seq_row(), opp_strength(), rolling_agg(), safe_float() (+1 more)

### Community 12 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, react, react-dnd, react-dnd-html5-backend, react-dom, react-markdown, recharts, remark-gfm (+16 more)

### Community 15 - "train_predict.py"
Cohesion: 0.56
Nodes (8): analyze_feature_importance(), clean(), get_future_gws(), load_data(), main(), predict(), split_future(), train()

### Community 16 - "devDependencies"
Cohesion: 0.07
Nodes (29): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tsx, @types/node (+21 more)

### Community 17 - "devDependencies"
Cohesion: 0.06
Nodes (31): copy-webpack-plugin, devDependencies, copy-webpack-plugin, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+23 more)

### Community 19 - "setup.sh"
Cohesion: 0.83
Nodes (3): fail(), setup.sh script, warn()

## Knowledge Gaps
- **156 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+151 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `FastAPI Backend`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `dependencies`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `dependencies`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _156 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/fpl.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08065458796025717 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0647342995169082 - nodes in this community are weakly interconnected._