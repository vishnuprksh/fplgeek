# Deep Learning Model Report: FPL Points Prediction

## Methodology
- **Architecture**: Hybrid LSTM (History) + Dense (Context + Opp Strength).
- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.
- **Loss Function**: Mean Squared Error (MSE).

## Results by Position

### GKP Model
- **Samples**: 1796 Train, 507 Test
- **MAE**: 1.2900
- **RMSE**: 2.0972

**Top 3 Predictions (Sanity Check):**
- **Raya** (GW12): Pred **4.11** (Actual 2.0)
- **Pickford** (GW21): Pred **4.02** (Actual 3.0)
- **Pickford** (GW20): Pred **3.97** (Actual 1.0)

### DEF Model
- **Samples**: 6275 Train, 2330 Test
- **MAE**: 1.5384
- **RMSE**: 2.6807

**Top 3 Predictions (Sanity Check):**
- **J.Timber** (GW16): Pred **3.78** (Actual 2.0)
- **Virgil** (GW12): Pred **3.74** (Actual 3.0)
- **Gvardiol** (GW17): Pred **3.74** (Actual 6.0)

### MID Model
- **Samples**: 8896 Train, 2978 Test
- **MAE**: 1.4173
- **RMSE**: 2.3857

**Top 3 Predictions (Sanity Check):**
- **B.Fernandes** (GW16): Pred **6.15** (Actual 13.0)
- **Saka** (GW19): Pred **5.81** (Actual 6.0)
- **B.Fernandes** (GW14): Pred **5.79** (Actual 4.0)

### FWD Model
- **Samples**: 1905 Train, 767 Test
- **MAE**: 1.4225
- **RMSE**: 2.4002

**Top 3 Predictions (Sanity Check):**
- **Haaland** (GW18): Pred **6.19** (Actual 2.0)
- **Haaland** (GW11): Pred **6.19** (Actual 4.0)
- **Haaland** (GW15): Pred **6.19** (Actual 2.0)

## Overall Conclusion
The models achieved an average **MAE of 1.4170**. This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players).