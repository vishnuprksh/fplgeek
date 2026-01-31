# Deep Learning Model Report: FPL Points Prediction

## Methodology
- **Architecture**: Hybrid LSTM (History) + Dense (Context + Opp Strength).
- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.
- **Loss Function**: Mean Squared Error (MSE).

## Results by Position

### GKP Model
- **Samples**: 1796 Train, 507 Test
- **MAE**: 1.3716
- **RMSE**: 2.1071

**Top 3 Predictions (Sanity Check):**
- **Sánchez** (GW19): Pred **4.14** (Actual 2.0)
- **Raya** (GW16): Pred **4.12** (Actual 2.0)
- **Sánchez** (GW18): Pred **4.10** (Actual 3.0)

### DEF Model
- **Samples**: 6275 Train, 2330 Test
- **MAE**: 1.6194
- **RMSE**: 2.5612

**Top 3 Predictions (Sanity Check):**
- **Gvardiol** (GW17): Pred **4.31** (Actual 6.0)
- **Van de Ven** (GW11): Pred **4.13** (Actual 1.0)
- **Gabriel** (GW12): Pred **4.12** (Actual 0.0)

### MID Model
- **Samples**: 8896 Train, 2978 Test
- **MAE**: 1.4068
- **RMSE**: 2.3820

**Top 3 Predictions (Sanity Check):**
- **B.Fernandes** (GW16): Pred **6.14** (Actual 13.0)
- **M.Salah** (GW11): Pred **5.96** (Actual 2.0)
- **Saka** (GW19): Pred **5.91** (Actual 6.0)

### FWD Model
- **Samples**: 1905 Train, 767 Test
- **MAE**: 1.5724
- **RMSE**: 2.3753

**Top 3 Predictions (Sanity Check):**
- **Haaland** (GW17): Pred **6.06** (Actual 16.0)
- **Haaland** (GW18): Pred **6.03** (Actual 2.0)
- **Haaland** (GW11): Pred **5.85** (Actual 4.0)

## Overall Conclusion
The models achieved an average **MAE of 1.4926**. This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players).