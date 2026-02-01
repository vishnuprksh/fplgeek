# Deep Learning Model Report: FPL Points Prediction

## Methodology
- **Architecture**: Hybrid LSTM (History) + Dense (Context + Opp Strength).
- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.
- **Loss Function**: Mean Squared Error (MSE).

## Results by Position

### GKP Model
- **Samples**: 3458 Train, 507 Test
- **MAE**: 1.2821
- **RMSE**: 2.1003

**Top 3 Predictions (Sanity Check):**
- **Raya** (GW13): Pred **4.22** (Actual 3.0)
- **Raya** (GW12): Pred **4.21** (Actual 2.0)
- **Raya** (GW15): Pred **4.15** (Actual 2.0)

### DEF Model
- **Samples**: 10596 Train, 2330 Test
- **MAE**: 1.6050
- **RMSE**: 2.5726

**Top 3 Predictions (Sanity Check):**
- **Gabriel** (GW12): Pred **3.89** (Actual 0.0)
- **Gvardiol** (GW17): Pred **3.86** (Actual 6.0)
- **Gabriel** (GW11): Pred **3.78** (Actual 1.0)

### MID Model
- **Samples**: 15248 Train, 2978 Test
- **MAE**: 1.4249
- **RMSE**: 2.3812

**Top 3 Predictions (Sanity Check):**
- **Saka** (GW19): Pred **6.21** (Actual 6.0)
- **M.Salah** (GW11): Pred **6.20** (Actual 2.0)
- **Foden** (GW17): Pred **6.02** (Actual 3.0)

### FWD Model
- **Samples**: 3210 Train, 767 Test
- **MAE**: 1.6740
- **RMSE**: 2.4030

**Top 3 Predictions (Sanity Check):**
- **Haaland** (GW11): Pred **7.04** (Actual 4.0)
- **Haaland** (GW17): Pred **6.97** (Actual 16.0)
- **Haaland** (GW18): Pred **6.87** (Actual 2.0)

## Overall Conclusion
The models achieved an average **MAE of 1.4965**. This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players).