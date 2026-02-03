# Bug Fixes

## Critical Fixes
- **GW1 Elite Player Selection**: Fixed AI Manager skipping premium players (Haaland/Salah) in GW1.
  - *Root Cause*: Model underestimated points due to zero form data; Optimizer prioritized balanced squad over captaincy value; Ownership data (14%) disqualified Salah from captaincy.
  - *Fix*: Applied 1.5x boost to elite players for GW1-4; Added Captaincy term to optimization objective; Lowered "Safe Captain" threshold to 10% ownership.
  - *Result*: GW1 xP improved from 45.8 to 64.0. Salah selected as Captain.

- **AI Manager History Discrepancy**: Fixed simulation logic where Haaland was sold in GW19. (Previous)

- **AI History UI Issues**: Fixed missing transfers and duplicate bench labels.
  - *Root Cause*: Transfer cost field name mismatch between backend and frontend; Redundant bench section in `AiHistory.tsx`.
  - *Fix*: Added fallback for `event_transfers_cost`; Removed redundant `bench-section` in favor of more detailed squad view.
  - *Result*: History page correctly displays transfer costs and cleaner UI.

- **Branch/Bench Boost Logic Error**: Bench Boost applied when bench has weak links.
  - *Status*: Fixed
  - *Root Cause*: Logic checked average probability > 25% instead of ensuring all bench players met the threshold.
  - *Fix*: Require all bench players to have >25% probability of scoring >6 points. verified with `research/experiments/verify_bench_boost.py`.

- **Free Transfers Logic Error**: Free transfers were double-counted in simulation.
  - *Root Cause*: `fpl_manager.py` incremented free transfers when no transfers were made, while `ai_manager.py` also incremented them weekly.
  - *Fix*: Removed redundant increment in `fpl_manager.py`.

- **Captaincy Ownership Constraint**: Updated rule to require 50% ownership.
  - *Context*: User request to ensure safer captaincy choices.
  - *Fix*: Increased ownership threshold from 30% to 50% in `fpl_manager.py` and `ai_manager.py`.
