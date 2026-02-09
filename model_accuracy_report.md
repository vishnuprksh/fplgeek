# Model Accuracy Report (Random Forest)

| Position | Train Acc | Val Acc | Train MAE | Val MAE | Log Loss |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GKP** | 0.8358 | 0.7928 | 0.5294 | 0.6516 | 0.6905 |
| **DEF** | 0.7051 | 0.6683 | 0.9323 | 1.0295 | 0.9858 |
| **MID** | 0.6970 | 0.6856 | 0.8474 | 0.8521 | 0.9927 |
| **FWD** | 0.7394 | 0.6708 | 0.9306 | 1.1775 | 1.0554 |

## Details
- **Model**: Random Forest Classifier (n_estimators=200, max_depth=15)
- **Input**: 30 Features (12 Context + 18 Aggregated)
- **Training**: Full Retrain, 80/20 Split.
