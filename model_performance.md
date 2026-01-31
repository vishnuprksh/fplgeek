# Deep Learning Model Report: FPL Points Prediction

## Methodology
- **Architecture**: Hybrid LSTM (History) + Embedding (Opponent) + Dense (Context).
- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.
- **Loss Function**: Mean Squared Error (MSE).

## Results by Position

### GKP Model
- **Samples**: 1796 Train, 507 Test
- **MAE**: 1.3005
- **RMSE**: 2.1414

**Top 3 Predictions (Sanity Check):**
- **Martinez** (GW12): Pred **4.66** (Actual 3.0)
- **Donnarumma** (GW13): Pred **4.50** (Actual 5.0)
- **Pickford** (GW23): Pred **4.45** (Actual 3.0)

### DEF Model
- **Samples**: 6283 Train, 2323 Test
- **MAE**: 1.6115
- **RMSE**: 2.6280

**Top 3 Predictions (Sanity Check):**
- **Guéhi** (GW17): Pred **5.54** (Actual 1.0)
- **Tarkowski** (GW23): Pred **5.24** (Actual 4.0)
- **Chalobah** (GW14): Pred **5.20** (Actual 1.0)

### MID Model
- **Samples**: 8906 Train, 2972 Test
- **MAE**: 1.4165
- **RMSE**: 2.4334

**Top 3 Predictions (Sanity Check):**
- **Gakpo** (GW14): Pred **6.77** (Actual 1.0)
- **Foden** (GW19): Pred **6.76** (Actual 3.0)
- **Saka** (GW11): Pred **6.53** (Actual 12.0)

### FWD Model
- **Samples**: 1910 Train, 762 Test
- **MAE**: 1.5803
- **RMSE**: 2.3993

**Top 3 Predictions (Sanity Check):**
- **Haaland** (GW13): Pred **6.94** (Actual 2.0)
- **Haaland** (GW15): Pred **6.73** (Actual 2.0)
- **Haaland** (GW17): Pred **6.63** (Actual 16.0)

## Overall Conclusion
The models achieved an average **MAE of 1.4772**. This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players).