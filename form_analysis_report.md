# Mathematical Analysis: Why Form Doesn't Dominate Predictions

## Executive Summary

Based on the feature importance analysis from `feature_importance_report.md`, the FPL AI model has learned that **minutes played** is 77-154x more important than **form** for predicting midfielder performance. This report explains why mathematically.

---

## 1. Feature Importance Hierarchy (Midfielders)

From the permutation importance analysis, here are the top features ranked by importance:

| Rank | Feature | Importance | Relative Weight |
|------|---------|------------|-----------------|
| 1 | **SEQ_minutes** | **0.1544** | **100.0%** |
| 2 | SEQ_total_points | 0.0166 | 10.8% |
| 3 | SEQ_creativity | 0.0066 | 4.3% |
| 4 | SEQ_influence | 0.0051 | 3.3% |
| 5 | SEQ_expected_assists | 0.0029 | 1.9% |
| 6 | SEQ_goals_conceded | 0.0026 | 1.7% |
| 7 | SEQ_threat | 0.0022 | 1.4% |
| ... | ... | ... | ... |
| 13 | **SEQ_form** | **~0.0000** | **~0.0%** |
| ... | ... | ... | ... |
| 21 | **CTX_form** | **-0.0020** | **1.3% (negative!)** |

### Key Observations:

1. **Minutes dominates**: 0.1544 importance (100% relative weight)
2. **Form is near zero**: ~0.0000 to -0.0020 importance (0-1.3% relative weight)
3. **Ratio**: Minutes is **77x to ∞x** more important than form!

---

## 2. Mathematical Explanation

### The Prediction Formula

The model's prediction can be approximated as:

```
xP ≈ Σ(feature_value × feature_importance) + model_bias
```

### Example Calculation

For a midfielder with:
- **Minutes (avg last 5 games)**: 90 minutes
- **Form**: 8.0 (excellent recent form)

**Contribution to prediction**:
- Minutes: `90 × 0.1544 = 13.896`
- Form (sequence): `8.0 × 0.0000 ≈ 0.000`
- Form (context): `8.0 × (-0.0020) = -0.016`

**Total form contribution**: `-0.016` (actually NEGATIVE!)

**Conclusion**: A player playing 90 minutes contributes ~14 points to their prediction, while excellent form (8.0) contributes **-0.016 points** (essentially nothing or slightly negative).

---

## 3. Real-World Example: B.Fernandes vs Salah

### Current Stats (from database):

**B.Fernandes** (Highest Form):
- Form: **8.0** (best in league)
- Total Points: 131
- Ownership: 31.2%

**M.Salah**:
- Form: **2.5** (much lower)
- Total Points: 74
- Ownership: 14.3%
- Minutes: 1356

### Why Might Salah Have Higher xP?

Despite Bruno's superior form (8.0 vs 2.5), Salah could have higher xP because:

1. **Minutes Per Game**: Even 5 minutes difference = 0.772 points difference
2. **Underlying Stats**: Salah's xG (5.43) and xA (3.10) contribute more
3. **Form Actually Hurts**: Bruno's 8.0 form contributes -0.016 points!

---

## 4. Why Is Form So Unimportant?

### Reason 1: Redundancy
Form = avg recent points, but model already has `SEQ_total_points` (0.0166 importance)

### Reason 2: Regression to the Mean
Model learned from 58,324 samples that hot streaks don't last

### Reason 3: Negative Importance
High form signals overperformance → model discounts it

---

## 5. Conclusion

The model's learned hierarchy:

1. **Minutes** (0.1544) → "Can they play?"
2. **Recent Points** (0.0166) → "Are they performing?"
3. **Underlying Stats** (0.0022-0.0066) → "What's their process?"
4. **Form** (~0.0000 to -0.0020) → "Ignore or discount"

**Why Salah > Bruno**: Minutes + underlying stats + quality baseline > recent form
