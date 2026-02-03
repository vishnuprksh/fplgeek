# AI Manager Rules & Logic

## 1. Squad Selection (Gameweek 1)
- **Algorithm**: Global Optimization (Linear Programming via PuLP).
- **Objective**: Maximize total predicted points (xP) for the starting 15.
- **Constraints**:
  - Budget: £100.0m max.
  - Team Size: Exactly 15 players.
  - Position Limits: 2 GKP, 5 DEF, 5 MID, 3 FWD.
  - Squad Limits: Max 3 players per Premier League team.
  - Differential Limit: Max 2 players with ownership < 10%.
  - **Template Requirement: Min 3 players with ownership ≥ 30%.**
  - Feature Boost: In GW 1, players with ownership > 30% get a 1.3x xP boost, > 15% get 1.15x boost (to correct for model cold start).
- **Availability**: Players with `status != 'a'` or `chance_of_playing < 100` are excluded.

## 2. Transfer Prioritization
- **Logic**: Processed before team selection for upcoming GW.
- **Priority**:
  1. Remove Injured/Suspended players (Chance < 100% or Status != 'a').
  2. **(New)** Remove Underperforming players (GW 3+):
     - Identify player with highest positive gap between Predicted (xP) and Actual points over last 3 GWs.
     - Prioritize selling if gap is significant.
  3. Remove players with poor predicted form.
  4. Improve squad xP within budget.
- The manager will take hits (-4 pts) if the predicted gain > 4 pts.
- **Underperformance Filter (GW 3+)**:
  - Excludes players with underperformance > 3.0 from incoming transfers.
  - Underperformance = Sum of (Predicted - Actual) over last 3 GWs.

## 3. Captain Selection
- **Ownership Constraint**: Captain must have **≥ 30% ownership**.
- **Fallback**: If no player meets the threshold, select the highest xP player.
- **Vice-Captain**: Also prefers 30%+ ownership, falls back to next highest xP.

## 4. Chip Usage Strategy (Probabilistic)
The manager uses probability thresholds to trigger chips.

- **Triple Captain**:
  - **Trigger**: Top player has `Prob(>= 10 pts) > 20%`.
  - Significance: Captures elite haul potential (Top 1% of predictions).

- **Bench Boost**:
  - **Trigger**: Bench players have Average `Prob(>= 6 pts) > 25%`.
  - Significance: Ensures the bench provides reliable returns, not just xP.

- **Crisis Management (Wildcard / Free Hit)**:
  - **Trigger**: Team `Prob(Score > 60)` falls below **25%**.
  - **Priority**:
    1. **Free Hit**: Used first to navigate a temporary crisis or blank gameweek.
    2. **Wildcard**: Used if Free Hit is unavailable or crisis persists.
  - Significance: Proactively fixes a team that has fallen behind the template (Median prob is ~34%).

## 4. Updates & Maintenance
- **Data**: Daily update via `npm run ingest:local`.
- **Model Training**: Retrain weekly with new data.
- **History**: Stored in `ai_manager_history.json`.

## 5. Constraints & Constants
- **Bank**: Starts at £0.
- **Free Transfers**: Cap at 5.
- **Selling Price**: (Current - Purchase) / 2 rounded down.
