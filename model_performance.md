# Deep Learning Model Report: FPL Points Prediction

## Methodology
- **Architecture**: Hybrid LSTM (History) + Dense (Context + Opp Strength).
- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.
- **Loss Function**: Mean Squared Error (MSE).

## Results by Position

### GKP Model
- **Samples**: 1796 Train, 507 Test
- **MAE**: 1.3535
- **RMSE**: 2.1094

**Top 3 Predictions (Sanity Check):**
- **Raya** (GW12): Pred **4.34** (Actual 2.0)
- **Raya** (GW16): Pred **4.17** (Actual 2.0)
- **Sánchez** (GW18): Pred **4.12** (Actual 3.0)

### DEF Model
- **Samples**: 6275 Train, 2330 Test
- **MAE**: 1.5845
- **RMSE**: 2.5769

**Top 3 Predictions (Sanity Check):**
- **Van de Ven** (GW11): Pred **4.16** (Actual 1.0)
- **Gvardiol** (GW17): Pred **4.15** (Actual 6.0)
- **Gabriel** (GW11): Pred **3.99** (Actual 1.0)

### MID Model
- **Samples**: 8896 Train, 2978 Test
- **MAE**: 1.4997
- **RMSE**: 2.3768

**Top 3 Predictions (Sanity Check):**
- **B.Fernandes** (GW16): Pred **6.14** (Actual 13.0)
- **Foden** (GW17): Pred **5.95** (Actual 3.0)
- **Saka** (GW19): Pred **5.90** (Actual 6.0)

### FWD Model
- **Samples**: 1905 Train, 767 Test
- **MAE**: 1.6875
- **RMSE**: 2.4015

**Top 3 Predictions (Sanity Check):**
- **Haaland** (GW18): Pred **6.68** (Actual 2.0)
- **Haaland** (GW17): Pred **6.48** (Actual 16.0)
- **Haaland** (GW11): Pred **6.48** (Actual 4.0)

## Overall Conclusion
The models achieved an average **MAE of 1.5313**. This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players).