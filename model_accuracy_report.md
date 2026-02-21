# Model Accuracy Report (Random Forest)

| Position | Train Acc | Val Acc | Train MAE | Val MAE | Log Loss |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GKP** | 0.7480 | 0.7482 | 0.8607 | 0.8883 | 0.8540 |
| **DEF** | 0.6062 | 0.6064 | 1.2781 | 1.2506 | 1.1906 |
| **MID** | 0.5883 | 0.5717 | 1.1820 | 1.2523 | 1.3032 |
| **FWD** | 0.6736 | 0.6136 | 1.1958 | 1.1755 | 1.2061 |

## Details
- **Model**: Random Forest Classifier (n_estimators=100, max_depth=8)
- **Input**: 21 Features (12 Context + 9 Aggregated, single 4-match window)
- **Scaling**: StandardScaler (per-position, fitted on training data only)
- **Training**: Full Retrain, 80/20 Split.
