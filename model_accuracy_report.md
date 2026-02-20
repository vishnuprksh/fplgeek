# Model Accuracy Report (Random Forest)

| Position | Train Acc | Val Acc | Train MAE | Val MAE | Log Loss |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GKP** | 0.7826 | 0.7541 | 0.6927 | 0.8424 | 0.9061 |
| **DEF** | 0.6213 | 0.6219 | 1.2224 | 1.2017 | 1.1524 |
| **MID** | 0.6089 | 0.5879 | 1.1225 | 1.1165 | 1.2365 |
| **FWD** | 0.6775 | 0.6011 | 1.1390 | 1.2624 | 1.2346 |

## Details
- **Model**: Random Forest Classifier (n_estimators=100, max_depth=8)
- **Input**: 21 Features (12 Context + 9 Aggregated, single 4-match window)
- **Scaling**: StandardScaler (per-position, fitted on training data only)
- **Training**: Full Retrain, 80/20 Split.
