# Graph Report - fplgeek  (2026-08-24)

## Corpus Check
- Corpus is ~21,733 words - fits in a single context window. You may not need a graph.

## Summary
- 434 nodes · 662 edges · 34 communities (21 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Frontend Application
- Backend Analytics
- Code Architecture
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31

## God Nodes (most connected - your core abstractions)
1. `UnifiedPlayer` - 20 edges
2. `compilerOptions` - 20 edges
3. `compilerOptions` - 18 edges
4. `Team` - 17 edges
5. `Player` - 13 edges
6. `IDataProvider` - 12 edges
7. `SqliteProvider` - 12 edges
8. `BootstrapStatic` - 12 edges
9. `optimizeWithAllowance()` - 10 edges
10. `main()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `FPL Geek` --semantically_similar_to--> `FPL Geek`  [INFERRED] [semantically similar]
  README.md → frontend/index.html
- `App()` --calls--> `useOptimization()`  [EXTRACTED]
  frontend/src/App.tsx → frontend/src/hooks/useOptimization.ts
- `FixtureAnalysisProps` --references--> `Team`  [EXTRACTED]
  frontend/src/components/FixtureAnalysis.tsx → frontend/src/types/fpl.ts
- `PitchViewProps` --references--> `Pick`  [EXTRACTED]
  frontend/src/components/PitchView.tsx → frontend/src/types/fpl.ts
- `PitchViewProps` --references--> `PredictionMetadata`  [EXTRACTED]
  frontend/src/components/PitchView.tsx → frontend/src/types/gameweek.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **FPL Geek Feature Set** — readme_fpl_geek, readme_pitch_view, readme_ai_history, readme_transfer_recommendations, readme_price_predictions [EXTRACTED 1.00]
- **Python Backend Dependency Stack** — backend_requirements_fastapi, backend_requirements_uvicorn, backend_requirements_python_dotenv, backend_requirements_pydantic, backend_requirements_aiofiles, backend_requirements_requests, backend_requirements_pandas, backend_requirements_numpy, backend_requirements_scikit_learn, backend_requirements_joblib, backend_requirements_python_dateutil [EXTRACTED 1.00]

## Communities (34 total, 13 thin omitted)

### Community 0 - "Frontend Application"
Cohesion: 0.10
Nodes (14): PitchViewProps, PlayerDetailModalProps, FplApiProvider, HybridDataProvider, hybridProvider, IDataProvider, SqliteProvider, BootstrapStatic (+6 more)

### Community 1 - "Backend Analytics"
Cohesion: 0.07
Nodes (26): App(), BottomNav(), BottomNavProps, iconMap, DataView(), ProcessedSample, TrainingDataResponse, GWData (+18 more)

### Community 2 - "Code Architecture"
Cohesion: 0.06
Nodes (31): copy-webpack-plugin, devDependencies, copy-webpack-plugin, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (29): better-sqlite3, csv-parse, dotenv, node-fetch, dependencies, better-sqlite3, csv-parse, dotenv (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (29): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tsx, @types/node (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (26): dependencies, react, react-dnd, react-dnd-html5-backend, react-dom, react-markdown, recharts, remark-gfm (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+18 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (20): OptimizationReport(), OptimizationReportProps, BacktestResult, PlayerHistoryModalProps, useOptimization(), Player, comb(), combinations() (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (19): ItemTypes, PitchView(), PlayerAnalysis(), PlayerAnalysisProps, TODO: topHaulPlayers could be displayed in UI later, SortDirection, SortField, PlayerDetailModal() (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (17): FixtureAnalysis(), FixtureAnalysisProps, TeamCard(), TeamCardProps, AIPredictionMap, T100OwnershipMap, getDataProvider(), fplService (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (16): data_file(), feature_importance(), fixtures(), gameweek_context(), health(), league_analysis(), load_app_data(), load_fixtures() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (12): name, private, scripts, build, dev, dev:backend, ingest:local, lint (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.40
Nodes (10): build_history_row(), fetch(), fetch_and_store_fixtures(), fetch_csv(), fetch_current_gw_history(), fetch_historical_seasons(), fetch_league_analysis(), init_db() (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (9): build_venue_table(), fixture_scores(), get_season(), main(), make_seq_row(), opp_strength(), rolling_agg(), safe_float() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (10): AI-Powered FPL Analytics, Fixture Tracker, FPL Geek, Team Optimizer, AI History, Fantasy Premier League Analytics Tool, FPL Geek, Pitch View (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.56
Nodes (8): analyze_feature_importance(), clean(), get_future_gws(), load_data(), main(), predict(), split_future(), train()

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (7): deploy_vps.py, Docker, Docker Compose, nginx-proxy, Self-Hosting, SSL, Virtual Private Server

### Community 19 - "Community 19"
Cohesion: 0.50
Nodes (4): Local Development, Node.js, npm, Yarn

## Knowledge Gaps
- **164 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+159 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Code Architecture` to `Community 12`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 3` to `Community 12`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `UnifiedPlayer` connect `Frontend Application` to `Community 8`, `Backend Analytics`, `Community 7`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _164 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Application` be split into smaller, more focused modules?**
  _Cohesion score 0.09929078014184398 - nodes in this community are weakly interconnected._
- **Should `Backend Analytics` be split into smaller, more focused modules?**
  _Cohesion score 0.07084785133565621 - nodes in this community are weakly interconnected._
- **Should `Code Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._