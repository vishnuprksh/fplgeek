# AI Model Feature Influence Analysis

Analysis using **Permutation Importance** on Test Data (GW 11+).
Metric: **Increase in MAE** when feature is corrupted (Higher is more important).

## GKP (Baseline MAE: 1.3535)

| Feature | Impact (+MAE) | Normalized |
| :--- | :--- | :--- |
| **Minutes** | +0.7210 | `██████████` |
| **Saves** | +0.0517 | `` |
| **Points** | +0.0504 | `` |
| **Log(Selected)** | +0.0244 | `` |
| **Influence** | +0.0128 | `` |
| **Home Adv** | +0.0084 | `` |
| **Price** | +0.0025 | `` |
| **Creativity** | +0.0019 | `` |
| **Difficulty** | +0.0013 | `` |
| **Rest** | +0.0010 | `` |
| **xA** | +0.0003 | `` |
| **xG** | +0.0000 | `` |
| **Threat** | +0.0000 | `` |
| **Opponent Strength** | +0.0000 | `` |
| **Goals Conceded** | +-0.0023 | `` |
| **Was Home** | +-0.0047 | `` |

## DEF (Baseline MAE: 1.5845)

| Feature | Impact (+MAE) | Normalized |
| :--- | :--- | :--- |
| **Minutes** | +0.3289 | `██████████` |
| **Points** | +0.0360 | `█` |
| **Threat** | +0.0120 | `` |
| **Difficulty** | +0.0069 | `` |
| **Log(Selected)** | +0.0067 | `` |
| **Influence** | +0.0036 | `` |
| **xG** | +0.0022 | `` |
| **Price** | +0.0019 | `` |
| **Rest** | +0.0018 | `` |
| **Home Adv** | +0.0012 | `` |
| **Creativity** | +0.0003 | `` |
| **Goals Conceded** | +0.0001 | `` |
| **Saves** | +0.0000 | `` |
| **Opponent Strength** | +0.0000 | `` |
| **xA** | +-0.0014 | `` |
| **Was Home** | +-0.0028 | `` |

## MID (Baseline MAE: 1.4997)

| Feature | Impact (+MAE) | Normalized |
| :--- | :--- | :--- |
| **Minutes** | +0.2520 | `██████████` |
| **Points** | +0.0657 | `██` |
| **Influence** | +0.0524 | `██` |
| **Creativity** | +0.0418 | `█` |
| **xA** | +0.0405 | `█` |
| **Threat** | +0.0328 | `█` |
| **xG** | +0.0161 | `` |
| **Log(Selected)** | +0.0148 | `` |
| **Goals Conceded** | +0.0110 | `` |
| **Price** | +0.0033 | `` |
| **Rest** | +0.0016 | `` |
| **Home Adv** | +0.0007 | `` |
| **Saves** | +0.0000 | `` |
| **Opponent Strength** | +0.0000 | `` |
| **Was Home** | +-0.0010 | `` |
| **Difficulty** | +-0.0020 | `` |

## FWD (Baseline MAE: 1.6875)

| Feature | Impact (+MAE) | Normalized |
| :--- | :--- | :--- |
| **Minutes** | +0.3329 | `██████████` |
| **Points** | +0.0653 | `█` |
| **Influence** | +0.0297 | `` |
| **xG** | +0.0268 | `` |
| **Goals Conceded** | +0.0104 | `` |
| **Price** | +0.0080 | `` |
| **Creativity** | +0.0027 | `` |
| **xA** | +0.0016 | `` |
| **Difficulty** | +0.0009 | `` |
| **Saves** | +0.0000 | `` |
| **Opponent Strength** | +0.0000 | `` |
| **Rest** | +-0.0005 | `` |
| **Was Home** | +-0.0018 | `` |
| **Home Adv** | +-0.0021 | `` |
| **Log(Selected)** | +-0.0034 | `` |
| **Threat** | +-0.0066 | `` |

