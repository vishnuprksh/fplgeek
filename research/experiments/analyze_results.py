"""
Quick analysis script to summarize experiment results
"""
import json
import pandas as pd

# Load results
with open('research/experiments/results/experiments_20260201_011957.json', 'r') as f:
    results = json.load(f)

# Create DataFrame
data = []
for r in results:
    data.append({
        'Model': r['model_name'],
        'Position': r['position'],
        'Test MAE': r['test_metrics']['mae'],
        'Test RMSE': r['test_metrics']['rmse'],
        'Test R²': r['test_metrics']['r2'],
        'Val MAE': r['val_metrics']['mae'],
        'Train MAE': r['train_metrics']['mae'],
        'Epochs': r['epochs_trained'],
        'Test Samples': r['test_samples']
    })

df = pd.DataFrame(data)

print("="*80)
print("EXPERIMENT RESULTS SUMMARY")
print("="*80)
print()

# Best model by position
print("BEST MODELS BY POSITION (Test MAE)")
print("-"*80)
for pos in ['GKP', 'DEF', 'MID', 'FWD']:
    pos_df = df[df['Position'] == pos].sort_values('Test MAE')
    if len(pos_df) > 0:
        best = pos_df.iloc[0]
        baseline = pos_df[pos_df['Model'] == 'baseline'].iloc[0] if len(pos_df[pos_df['Model'] == 'baseline']) > 0 else None
        
        improvement = ""
        if baseline is not None and best['Model'] != 'baseline':
            pct = ((baseline['Test MAE'] - best['Test MAE']) / baseline['Test MAE']) * 100
            improvement = f" ({pct:+.2f}% vs baseline)"
        
        print(f"{pos:4s}: {best['Model']:20s} - MAE: {best['Test MAE']:.4f}, R²: {best['Test R²']:.4f}{improvement}")

print()
print("AVERAGE PERFORMANCE BY MODEL")
print("-"*80)
model_avg = df.groupby('Model').agg({
    'Test MAE': 'mean',
    'Test RMSE': 'mean',
    'Test R²': 'mean'
}).round(4).sort_values('Test MAE')

for model, row in model_avg.iterrows():
    baseline_mae = df[df['Model'] == 'baseline']['Test MAE'].mean()
    improvement = ""
    if model != 'baseline':
        pct = ((baseline_mae - row['Test MAE']) / baseline_mae) * 100
        improvement = f" ({pct:+.2f}%)"
    print(f"{model:20s}: MAE={row['Test MAE']:.4f}, RMSE={row['Test RMSE']:.4f}, R²={row['Test R²']:.4f}{improvement}")

print()
print("DETAILED RESULTS BY POSITION")
print("-"*80)
for pos in ['GKP', 'DEF', 'MID', 'FWD']:
    print(f"\n{pos}:")
    pos_df = df[df['Position'] == pos].sort_values('Test MAE')
    for _, row in pos_df.iterrows():
        print(f"  {row['Model']:20s}: MAE={row['Test MAE']:.4f}, R²={row['Test R²']:.4f}, Epochs={int(row['Epochs'])}")

print()
print("="*80)
print("KEY FINDINGS:")
print("="*80)

# Find overall best
best_overall = df.sort_values('Test MAE').iloc[0]
print(f"1. Best overall model: {best_overall['Model']} for {best_overall['Position']} (MAE: {best_overall['Test MAE']:.4f})")

# Check if any model beats baseline across all positions
baseline_wins = 0
for pos in ['GKP', 'DEF', 'MID', 'FWD']:
    pos_df = df[df['Position'] == pos].sort_values('Test MAE')
    if pos_df.iloc[0]['Model'] != 'baseline':
        baseline_wins += 1

if baseline_wins == 4:
    print(f"2. Alternative architectures beat baseline in ALL positions!")
elif baseline_wins > 0:
    print(f"2. Alternative architectures beat baseline in {baseline_wins}/4 positions")
else:
    print(f"2. Baseline model is competitive across all positions")

# Average improvement
avg_improvement = ((df[df['Model'] == 'baseline']['Test MAE'].mean() - model_avg.iloc[0]['Test MAE']) / df[df['Model'] == 'baseline']['Test MAE'].mean()) * 100
print(f"3. Best architecture achieves {avg_improvement:.2f}% average improvement over baseline")

print()
