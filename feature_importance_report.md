# Comprehensive Feature Importance Analysis

## Methodology

- **Method**: Permutation Importance
- **Metric**: Classification Accuracy Drop
- **Model**: 16-class Categorical (0-15+ points)
- **Validation Data**: 25/26 Season (unseen during training)

### How to Interpret

- **Positive values**: Feature is important (accuracy drops when shuffled)
- **Negative values**: Feature may be adding noise or redundancy
- **Zero values**: Feature has minimal impact

---

## GKP (Goalkeeper/Defender/Midfielder/Forward)

**Baseline Accuracy**: See individual position output

### Top 5 Most Important Features

| Rank | Feature | Importance | Description |
|------|---------|------------|-------------|
| 1 | `SEQ_was_home` | 0.0032 | Home/away status in recent matches |
| 2 | `SEQ_log_selected` | 0.0026 | Log of team selections (popularity) |
| 3 | `SEQ_minutes` | 0.0020 | Minutes played in recent matches |
| 4 | `CTX_all_time_games_played` | 0.0014 | Total career games played |
| 5 | `SEQ_influence` | 0.0011 | Influence index (overall game impact) |

### Complete Feature Rankings

| Rank | Feature | Importance (Acc Drop) | Category |
|------|---------|----------------------|----------|
| 1 | `SEQ_was_home` | 0.0032 | Sequence (Recent Form) |
| 2 | `SEQ_log_selected` | 0.0026 | Sequence (Recent Form) |
| 3 | `SEQ_minutes` | 0.0020 | Sequence (Recent Form) |
| 4 | `CTX_all_time_games_played` | 0.0014 | Context (Career Stats) |
| 5 | `SEQ_influence` | 0.0011 | Sequence (Recent Form) |
| 6 | `SEQ_goals_conceded` | 0.0011 | Sequence (Recent Form) |
| 7 | `SEQ_price` | 0.0011 | Sequence (Recent Form) |
| 8 | `CTX_ctx_difficulty` | 0.0009 | Context (Match Context) |
| 9 | `CTX_all_time_total_pts` | 0.0009 | Context (Career Stats) |
| 10 | `CTX_all_time_avg_pts` | 0.0003 | Context (Career Stats) |
| 11 | `SEQ_expected_goals` | 0.0000 | Sequence (Recent Form) |
| 12 | `SEQ_expected_assists` | 0.0000 | Sequence (Recent Form) |
| 13 | `SEQ_threat` | 0.0000 | Sequence (Recent Form) |
| 14 | `SEQ_creativity` | 0.0000 | Sequence (Recent Form) |
| 15 | `CTX_ctx_was_home` | 0.0000 | Context (Match Context) |
| 16 | `CTX_ctx_price` | 0.0000 | Context (Match Context) |
| 17 | `CTX_all_time_goals_per_90` | 0.0000 | Context (Career Stats) |
| 18 | `CTX_all_time_xg_per_90` | 0.0000 | Context (Career Stats) |
| 19 | `OPP_strength` | 0.0000 | Opponent |
| 20 | `CTX_ctx_hours_rest` | -0.0003 | Context (Match Context) |
| 21 | `SEQ_saves` | -0.0034 | Sequence (Recent Form) |
| 22 | `SEQ_total_points` | -0.0034 | Sequence (Recent Form) |

### Feature Category Summary

- **Sequence Features (12)**: Avg Importance = 0.0004
- **Context Features (9)**: Avg Importance = 0.0004
- **Opponent Features (1)**: Avg Importance = 0.0000

---

## DEF (Goalkeeper/Defender/Midfielder/Forward)

**Baseline Accuracy**: See individual position output

### Top 5 Most Important Features

| Rank | Feature | Importance | Description |
|------|---------|------------|-------------|
| 1 | `SEQ_minutes` | 0.0687 | Minutes played in recent matches |
| 2 | `SEQ_threat` | 0.0012 | Threat index (attacking threat metric) |
| 3 | `SEQ_price` | 0.0008 | Player price in recent matches |
| 4 | `SEQ_influence` | 0.0005 | Influence index (overall game impact) |
| 5 | `SEQ_expected_goals` | 0.0002 | Expected goals (xG) from recent matches |

### Complete Feature Rankings

| Rank | Feature | Importance (Acc Drop) | Category |
|------|---------|----------------------|----------|
| 1 | `SEQ_minutes` | 0.0687 | Sequence (Recent Form) |
| 2 | `SEQ_threat` | 0.0012 | Sequence (Recent Form) |
| 3 | `SEQ_price` | 0.0008 | Sequence (Recent Form) |
| 4 | `SEQ_influence` | 0.0005 | Sequence (Recent Form) |
| 5 | `SEQ_expected_goals` | 0.0002 | Sequence (Recent Form) |
| 6 | `SEQ_saves` | 0.0000 | Sequence (Recent Form) |
| 7 | `CTX_ctx_was_home` | 0.0000 | Context (Match Context) |
| 8 | `CTX_ctx_price` | 0.0000 | Context (Match Context) |
| 9 | `OPP_strength` | 0.0000 | Opponent |
| 10 | `SEQ_goals_conceded` | -0.0001 | Sequence (Recent Form) |
| 11 | `CTX_ctx_hours_rest` | -0.0001 | Context (Match Context) |
| 12 | `SEQ_was_home` | -0.0002 | Sequence (Recent Form) |
| 13 | `CTX_all_time_goals_per_90` | -0.0003 | Context (Career Stats) |
| 14 | `CTX_ctx_difficulty` | -0.0004 | Context (Match Context) |
| 15 | `CTX_all_time_games_played` | -0.0006 | Context (Career Stats) |
| 16 | `SEQ_total_points` | -0.0008 | Sequence (Recent Form) |
| 17 | `CTX_all_time_avg_pts` | -0.0008 | Context (Career Stats) |
| 18 | `CTX_all_time_xg_per_90` | -0.0008 | Context (Career Stats) |
| 19 | `SEQ_expected_assists` | -0.0010 | Sequence (Recent Form) |
| 20 | `SEQ_creativity` | -0.0013 | Sequence (Recent Form) |
| 21 | `CTX_all_time_total_pts` | -0.0014 | Context (Career Stats) |
| 22 | `SEQ_log_selected` | -0.0043 | Sequence (Recent Form) |

### Feature Category Summary

- **Sequence Features (12)**: Avg Importance = 0.0053
- **Context Features (9)**: Avg Importance = -0.0005
- **Opponent Features (1)**: Avg Importance = 0.0000

---

## MID (Goalkeeper/Defender/Midfielder/Forward)

**Baseline Accuracy**: See individual position output

### Top 5 Most Important Features

| Rank | Feature | Importance | Description |
|------|---------|------------|-------------|
| 1 | `SEQ_minutes` | 0.1544 | Minutes played in recent matches |
| 2 | `SEQ_total_points` | 0.0166 | Total points scored in recent matches |
| 3 | `SEQ_creativity` | 0.0058 | Creativity index (chance creation metric) |
| 4 | `SEQ_influence` | 0.0036 | Influence index (overall game impact) |
| 5 | `SEQ_threat` | 0.0030 | Threat index (attacking threat metric) |

### Complete Feature Rankings

| Rank | Feature | Importance (Acc Drop) | Category |
|------|---------|----------------------|----------|
| 1 | `SEQ_minutes` | 0.1544 | Sequence (Recent Form) |
| 2 | `SEQ_total_points` | 0.0166 | Sequence (Recent Form) |
| 3 | `SEQ_creativity` | 0.0058 | Sequence (Recent Form) |
| 4 | `SEQ_influence` | 0.0036 | Sequence (Recent Form) |
| 5 | `SEQ_threat` | 0.0030 | Sequence (Recent Form) |
| 6 | `SEQ_goals_conceded` | 0.0026 | Sequence (Recent Form) |
| 7 | `SEQ_was_home` | 0.0023 | Sequence (Recent Form) |
| 8 | `SEQ_expected_goals` | 0.0022 | Sequence (Recent Form) |
| 9 | `SEQ_expected_assists` | 0.0021 | Sequence (Recent Form) |
| 10 | `CTX_all_time_games_played` | 0.0008 | Context (Career Stats) |
| 11 | `CTX_ctx_price` | 0.0004 | Context (Match Context) |
| 12 | `CTX_ctx_was_home` | 0.0003 | Context (Match Context) |
| 13 | `SEQ_saves` | 0.0000 | Sequence (Recent Form) |
| 14 | `CTX_all_time_xg_per_90` | 0.0000 | Context (Career Stats) |
| 15 | `OPP_strength` | 0.0000 | Opponent |
| 16 | `SEQ_price` | -0.0001 | Sequence (Recent Form) |
| 17 | `CTX_all_time_goals_per_90` | -0.0004 | Context (Career Stats) |
| 18 | `CTX_ctx_hours_rest` | -0.0004 | Context (Match Context) |
| 19 | `CTX_ctx_difficulty` | -0.0009 | Context (Match Context) |
| 20 | `CTX_all_time_avg_pts` | -0.0020 | Context (Career Stats) |
| 21 | `CTX_all_time_total_pts` | -0.0021 | Context (Career Stats) |
| 22 | `SEQ_log_selected` | -0.0052 | Sequence (Recent Form) |

### Feature Category Summary

- **Sequence Features (12)**: Avg Importance = 0.0156
- **Context Features (9)**: Avg Importance = -0.0005
- **Opponent Features (1)**: Avg Importance = 0.0000

---

## FWD (Goalkeeper/Defender/Midfielder/Forward)

**Baseline Accuracy**: See individual position output

### Top 5 Most Important Features

| Rank | Feature | Importance | Description |
|------|---------|------------|-------------|
| 1 | `SEQ_minutes` | 0.1119 | Minutes played in recent matches |
| 2 | `SEQ_was_home` | 0.0116 | Home/away status in recent matches |
| 3 | `SEQ_influence` | 0.0027 | Influence index (overall game impact) |
| 4 | `SEQ_total_points` | 0.0027 | Total points scored in recent matches |
| 5 | `SEQ_expected_goals` | 0.0024 | Expected goals (xG) from recent matches |

### Complete Feature Rankings

| Rank | Feature | Importance (Acc Drop) | Category |
|------|---------|----------------------|----------|
| 1 | `SEQ_minutes` | 0.1119 | Sequence (Recent Form) |
| 2 | `SEQ_was_home` | 0.0116 | Sequence (Recent Form) |
| 3 | `SEQ_influence` | 0.0027 | Sequence (Recent Form) |
| 4 | `SEQ_total_points` | 0.0027 | Sequence (Recent Form) |
| 5 | `SEQ_expected_goals` | 0.0024 | Sequence (Recent Form) |
| 6 | `SEQ_creativity` | 0.0021 | Sequence (Recent Form) |
| 7 | `SEQ_threat` | 0.0012 | Sequence (Recent Form) |
| 8 | `CTX_ctx_difficulty` | 0.0012 | Context (Match Context) |
| 9 | `SEQ_expected_assists` | 0.0009 | Sequence (Recent Form) |
| 10 | `SEQ_goals_conceded` | 0.0009 | Sequence (Recent Form) |
| 11 | `CTX_ctx_price` | 0.0009 | Context (Match Context) |
| 12 | `CTX_all_time_games_played` | 0.0006 | Context (Career Stats) |
| 13 | `CTX_ctx_was_home` | 0.0003 | Context (Match Context) |
| 14 | `CTX_all_time_xg_per_90` | 0.0003 | Context (Career Stats) |
| 15 | `SEQ_saves` | 0.0000 | Sequence (Recent Form) |
| 16 | `CTX_all_time_goals_per_90` | 0.0000 | Context (Career Stats) |
| 17 | `OPP_strength` | 0.0000 | Opponent |
| 18 | `SEQ_price` | -0.0003 | Sequence (Recent Form) |
| 19 | `CTX_all_time_avg_pts` | -0.0009 | Context (Career Stats) |
| 20 | `SEQ_log_selected` | -0.0012 | Sequence (Recent Form) |
| 21 | `CTX_all_time_total_pts` | -0.0012 | Context (Career Stats) |
| 22 | `CTX_ctx_hours_rest` | -0.0018 | Context (Match Context) |

### Feature Category Summary

- **Sequence Features (12)**: Avg Importance = 0.0112
- **Context Features (9)**: Avg Importance = -0.0001
- **Opponent Features (1)**: Avg Importance = 0.0000

---

## Cross-Position Insights

### Minutes Played Dominance

- **GKP**: 0.0020
- **DEF**: 0.0687
- **MID**: 0.1544
- **FWD**: 0.1119

### All-Time Stats Impact

Average importance of all-time statistical features across positions:

- `CTX_all_time_avg_pts`: -0.0009
- `CTX_all_time_total_pts`: -0.0010
- `CTX_all_time_goals_per_90`: -0.0002
- `CTX_all_time_xg_per_90`: -0.0001
- `CTX_all_time_games_played`: 0.0006

---

## Input Feature Reference

### Sequence Features (Historical 5-match window)

- `SEQ_minutes`: Minutes played in recent matches
- `SEQ_expected_goals`: Expected goals (xG) from recent matches
- `SEQ_expected_assists`: Expected assists (xA) from recent matches
- `SEQ_threat`: Threat index (attacking threat metric)
- `SEQ_creativity`: Creativity index (chance creation metric)
- `SEQ_influence`: Influence index (overall game impact)
- `SEQ_goals_conceded`: Goals conceded in recent matches
- `SEQ_saves`: Saves made (GKP-specific)
- `SEQ_log_selected`: Log of team selections (popularity)
- `SEQ_price`: Player price in recent matches
- `SEQ_was_home`: Home/away status in recent matches
- `SEQ_total_points`: Total points scored in recent matches

### Context Features (Current match context)

- `CTX_ctx_was_home`: Current match home/away status
- `CTX_ctx_difficulty`: Current opponent difficulty (1-5)
- `CTX_ctx_price`: Current player price
- `CTX_ctx_hours_rest`: Hours since last match
- `CTX_all_time_avg_pts`: Career average points per game
- `CTX_all_time_total_pts`: Career total points
- `CTX_all_time_goals_per_90`: Career goals per 90 minutes
- `CTX_all_time_xg_per_90`: Career xG per 90 minutes
- `CTX_all_time_games_played`: Total career games played

### Opponent Features

- `OPP_strength`: Opponent team strength rating
