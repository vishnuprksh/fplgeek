# AI Manager Rules & Logic

## 1. Squad Selection (Gameweek 1)
- **Algorithm**: Global Optimization (Linear Programming via PuLP).
- **Objective**: Maximize total predicted points (xP) for the starting 15.
- **Constraints**:
  - Budget: £100.0m max.
  - Team Size: Exactly 15 players.
  - Position Limits: 2 GKP, 5 DEF, 5 MID, 3 FWD.
  - Squad Limits: Max 3 players per Premier League team.
  - Feature Boost: In GW 1, players with ownership > 30% get a 1.3x xP boost, > 15% get 1.15x boost (to correct for model cold start).
- **Availability**: Players with `status != 'a'` or `chance_of_playing < 100` are excluded.

## 2. Team Management
- **Captaincy**: The captain (2x multiplier) must be a "safe" pick.
  - Constraint: **Ownership > 30%**.
  - If no player in the starting XI meets this, the highest xP player is chosen (with a warning).
- **Vice Captain**: Next best player also with **Ownership > 30%**.
- **Bench Order**: Sorted by xP.

## 3. Transfer Prioritization
- **Logic**: Processed before team selection for upcoming GW.
- **Priority**:
  1. Remove Injured/Suspended players (Chance < 100% or Status != 'a').
  2. **(New)** Remove Underperforming players (GW 3+):
     - Identify player with highest positive gap between Predicted (xP) and Actual points over last 3 GWs.
     - Prioritize selling if gap is significant.
  3. Remove players with poor predicted form.
  4. Improve squad xP within budget.
- The manager will take hits (-4 pts) if the predicted gain > 4 pts.

## 4. Chip Usage Strategy
The manager must use chips effectively.
- **Wildcard 1**:
  -Must be used by Gameweek 19.
  - **Trigger**: If predicted squad xP < 40 OR specifically scheduled (e.g., GW 19 if not used/needed).
  - *Correction*: Code ensures it is used if not already by deadline.
- **Triple Captain**:
  - **Trigger**: If a player's predicted xP > 10 (or significantly higher than average).
  - Must be used at least once in the season (usually double gameweeks, but AI decides based on xP).
- **Bench Boost**:
  - **Trigger**: Activates if **ALL** bench players have a >25% probability of scoring >6 points.
- **Free Hit**:
  - Typically saved for blank gameweeks (not strictly enforced by GW 19, usually later).

## 5. Updates & Maintenance
- **Data**: Daily update via `npm run ingest:local`.
- **Model Training**: Retrain weekly with new data.
- **History**: Stored in `ai_manager_history.json`.

## 6. Constraints & Constants
- **Bank**: Starts at £0.
- **Free Transfers**: Cap at 5.
- **Selling Price**: (Current - Purchase) / 2 rounded down.
