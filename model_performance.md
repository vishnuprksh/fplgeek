# Deep Learning Model Report: FPL Points Prediction

## Methodology
- **Architecture**: Hybrid LSTM (History) + Dense (Context + Opp Strength).
- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.
- **Loss Function**: Mean Squared Error (MSE).

## Results by Position

### GKP Model
- **Samples**: 3458 Train, 507 Test
- **MAE**: 1.7497
- **RMSE**: 2.2825

**Top 3 Predictions (Sanity Check):**
- **Raya** (GW12): Pred **5.63** (Actual 2.0)
- **Raya** (GW13): Pred **5.52** (Actual 3.0)
- **Raya** (GW15): Pred **5.41** (Actual 2.0)

### DEF Model
- **Samples**: 10596 Train, 2330 Test
- **MAE**: 2.0313
- **RMSE**: 2.7151

**Top 3 Predictions (Sanity Check):**
- **Gvardiol** (GW17): Pred **5.74** (Actual 6.0)
- **Gabriel** (GW12): Pred **5.66** (Actual 0.0)
- **Muñoz** (GW11): Pred **5.59** (Actual 6.0)

### MID Model
- **Samples**: 15248 Train, 2978 Test
- **MAE**: 1.6781
- **RMSE**: 2.4320

**Top 3 Predictions (Sanity Check):**
- **M.Salah** (GW11): Pred **5.71** (Actual 2.0)
- **M.Salah** (GW13): Pred **5.59** (Actual 0.0)
- **Saka** (GW19): Pred **5.55** (Actual 6.0)

### FWD Model
- **Samples**: 3210 Train, 767 Test
- **MAE**: 1.9734
- **RMSE**: 2.5687

**Top 3 Predictions (Sanity Check):**
- **Haaland** (GW17): Pred **7.12** (Actual 16.0)
- **Haaland** (GW18): Pred **7.04** (Actual 2.0)
- **Haaland** (GW11): Pred **7.03** (Actual 4.0)

## Overall Conclusion
The models achieved an average **MAE of 1.8581**. This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players).