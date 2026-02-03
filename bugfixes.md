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
