# FPL Geek: Optimization Algorithm Report

This report explains the logic and mechanics of the **Transfer Optimization Engine** in FPL Geek. The engine is designed to maximize the predicted "Haul Probability" of a Fantasy Premier League squad while respecting budget, team limits, and transfer constraints.

## 1. Core Objective

The primary goal of the optimizer is to maximize the **Aggregated XI Haul Probability**.

- **Haul Probability**: The AI-predicted chance (0.0 to 1.0) that a player will score **6 or more points** in the upcoming gameweek.
- **Aggregated XI Haul**: The sum of haul probabilities for the 11 starters in the best possible formation.

**Example**: A squad with an XI Haul of `150%` means the starters are expected to produce `1.5` hauls collectively this gameweek.

---

## 2. The Algorithm: Greedy Best-Swap Search

For a given **Transfer Allowance (N)**, the optimizer follows an iterative greedy approach to find the best possible transfers.

### Step 1: Baseline Scoring
The optimizer first identifies the best possible Starting XI from the current 15 players using the `pickBestXI` logic (which tests all 8 valid FPL formations). The sum of their haul probabilities becomes the **Baseline Score**.

### Step 2: Swap Enumeration
For each transfer allowed:
1. It iterates through all 15 players in the current squad.
2. For each player, it calculates the **Available Budget**: `Bank + Selling Price of Player`.
3. It filters a global list of **Candidates** (all players in the game) based on:
   - **Position**: Must match the player being replaced.
   - **Cost**: Must be ≤ Available Budget.
   - **Team Limit**: Adding the candidate must not exceed 3 players from a single Premier League club.
   - **Unique**: Candidate must not already be in the squad.

### Step 3: Simulation & Selection
For every valid candidate swap:
- The optimizer simulates a new squad.
- It re-runs the formation optimizer (`pickBestXI`) to see if the new player changes the ideal starting lineup.
- It calculates the **New XI Haul Probability**.
- The swap with the **highest net gain** (New Score - Baseline Score) is selected.

### Step 4: Iteration
If the Transfer Allowance is > 1:
- The selected swap is applied to the squad.
- The bank is updated.
- The process repeats from Step 2 with the new squad as the baseline, until all allowances are used or no beneficial swaps remain.

---

## 3. Formation Optimization

FPL Geek doesn't just swap players; it optimizes the **layout** of those players. After any change, it re-evaluates which 11 players should start and which 4 should remain on the bench based on these rules:

1. **Mandatory Slots**: 1 GKP, 3 DEF, 1 FWD.
2. **Valid Formations**: All 8 FPL-legal structures are tested:
   - 3-5-2, 3-4-3, 4-4-2, 4-3-3, 4-5-1, 5-3-2, 5-4-1, 5-2-3.
3. **Selection**: The formation that yields the highest total haul probability among its starters is chosen.

---

## 4. Transfer Allowance Logic

The optimizer respects the user-defined **Allowance (0, 1, 2, or 3)**:

- **0 Transfers**: The optimizer only moves players between the pitch and the bench (and changes formation) to maximize the haul from the existing 15 players.
- **N Transfers**: The optimizer is allowed to perform up to N swaps. It will perform fewer than N if no swaps are found that provide a positive gain in haul probability.

---

## 5. Summary of Constraints

| Constraint | Enforcement |
|---|---|
| **Budget** | `(PlayerIn.cost - PlayerOut.cost)` must not exceed current `Bank`. |
| **Squad Size** | Always maintains 2 GKP, 5 DEF, 5 MID, 3 FWD. |
| **Club Limit** | Max 3 players from any one Premier League team. |
| **Formation** | Starting XI must satisfy FPL minimums (1/3/1). |

---

*This algorithm ensures that every transfer made is mathematically the most effective move for the next gameweek's hauling potential.*
