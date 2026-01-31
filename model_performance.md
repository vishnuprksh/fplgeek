# Deep Learning Model Report: FPL Points Prediction

## Methodology
- **Architecture**: Hybrid LSTM (History) + Dense (Context + Opp Strength).
- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.
- **Loss Function**: Mean Squared Error (MSE).

## Results by Position

### GKP Model
- **Samples**: 1796 Train, 507 Test
- **MAE**: 1.2431
- **RMSE**: 2.1008

**Top 3 Predictions (Sanity Check):**
- **Raya** (GW12): Pred **3.98** (Actual 2.0)
- **Raya** (GW16): Pred **3.83** (Actual 2.0)
- **Sánchez** (GW18): Pred **3.78** (Actual 3.0)

### DEF Model
- **Samples**: 6275 Train, 2330 Test
- **MAE**: 1.5888
- **RMSE**: 2.5779

**Top 3 Predictions (Sanity Check):**
- **Gvardiol** (GW17): Pred **3.99** (Actual 6.0)
- **Gabriel** (GW11): Pred **3.90** (Actual 1.0)
- **Gabriel** (GW12): Pred **3.85** (Actual 0.0)

### MID Model
- **Samples**: 8896 Train, 2978 Test
- **MAE**: 1.3553
- **RMSE**: 2.4241

**Top 3 Predictions (Sanity Check):**
- **Saka** (GW19): Pred **5.23** (Actual 6.0)
- **B.Fernandes** (GW16): Pred **5.17** (Actual 13.0)
- **Saka** (GW14): Pred **5.09** (Actual 6.0)

### FWD Model
- **Samples**: 1905 Train, 767 Test
- **MAE**: 1.4864
- **RMSE**: 2.3717

**Top 3 Predictions (Sanity Check):**
- **Haaland** (GW18): Pred **6.09** (Actual 2.0)
- **Haaland** (GW11): Pred **5.93** (Actual 4.0)
- **Haaland** (GW17): Pred **5.84** (Actual 16.0)

## Overall Conclusion
The models achieved an average **MAE of 1.4184**. This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players).