# Model Accuracy Report (Random Forest)

| Position | Train Acc | Val Acc | Train MAE | Val MAE | Log Loss |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GKP** | 0.7456 | 0.7402 | 0.8687 | 0.9291 | 0.8729 |
| **DEF** | 0.5995 | 0.6079 | 1.2967 | 1.2596 | 1.2056 |
| **MID** | 0.5645 | 0.5468 | 1.3120 | 1.3839 | 1.3307 |
| **FWD** | 0.6338 | 0.5903 | 1.2846 | 1.2525 | 1.2460 |

## Details
- **Model**: Random Forest Classifier (n_estimators=100, max_depth=8)
- **Input**: 21 Features (12 Context + 9 Aggregated, single 4-match window)
- **Scaling**: StandardScaler (per-position, fitted on training data only)
- **Training**: Full Retrain, 80/20 Split.
