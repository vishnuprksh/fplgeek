# Deep Learning Model Report: FPL Points Prediction

## Methodology
- **Architecture**: Hybrid LSTM (History) + Embedding (Opponent) + Dense (Context).
- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.
- **Loss Function**: Mean Squared Error (MSE).

## Results by Position

### GKP Model
- **Samples**: 1796 Train, 507 Test
- **MAE**: 1.3006
- **RMSE**: 2.1524

**Top 3 Predictions (Sanity Check):**
- **Martinez** (GW12): Pred **4.74** (Actual 3.0)
- **Pickford** (GW23): Pred **4.74** (Actual 3.0)
- **Roefs** (GW18): Pred **4.67** (Actual 3.0)

### DEF Model
- **Samples**: 6283 Train, 2323 Test
- **MAE**: 1.5948
- **RMSE**: 2.6395

**Top 3 Predictions (Sanity Check):**
- **Guéhi** (GW17): Pred **5.20** (Actual 1.0)
- **Tarkowski** (GW23): Pred **5.07** (Actual 4.0)
- **Thiaw** (GW21): Pred **5.04** (Actual -1.0)

### MID Model
- **Samples**: 8906 Train, 2972 Test
- **MAE**: 1.4738
- **RMSE**: 2.4154

**Top 3 Predictions (Sanity Check):**
- **Foden** (GW19): Pred **7.94** (Actual 3.0)
- **Saka** (GW11): Pred **7.91** (Actual 12.0)
- **Gakpo** (GW14): Pred **7.75** (Actual 1.0)

### FWD Model
- **Samples**: 1910 Train, 762 Test
- **MAE**: 1.5980
- **RMSE**: 2.4024

**Top 3 Predictions (Sanity Check):**
- **Haaland** (GW13): Pred **6.78** (Actual 2.0)
- **Haaland** (GW15): Pred **6.70** (Actual 2.0)
- **Haaland** (GW19): Pred **6.67** (Actual 2.0)

## Overall Conclusion
The models achieved an average **MAE of 1.4918**. This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players).