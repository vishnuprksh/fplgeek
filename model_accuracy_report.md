# Model Accuracy Report (Random Forest)

| Position | Train Acc | Val Acc | Train MAE | Val MAE | Log Loss |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GKP** | 0.7814 | 0.7573 | 0.7014 | 0.8392 | 0.8862 |
| **DEF** | 0.6212 | 0.6230 | 1.2240 | 1.1965 | 1.1579 |
| **MID** | 0.6134 | 0.5932 | 1.1150 | 1.1119 | 1.2402 |
| **FWD** | 0.6624 | 0.5895 | 1.1592 | 1.2651 | 1.2410 |

## Details
- **Model**: Random Forest Classifier (n_estimators=100, max_depth=8)
- **Input**: 21 Features (12 Context + 9 Aggregated, single 4-match window)
- **Scaling**: StandardScaler (per-position, fitted on training data only)
- **Training**: Full Retrain, 80/20 Split.
