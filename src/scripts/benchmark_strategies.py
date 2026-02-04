import sys
import os
import numpy as np

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from src.scripts.ai_manager import run_simulation

def run_benchmark():
    strategies = ['xp', 'prob_7']
    results = {s: [] for s in strategies}
    n_runs = 3
    
    print(f"🏆 Starting FPL Strategy Benchmark ({n_runs} runs each)")
    print("=" * 60)
    
    for strategy in strategies:
        print(f"\n👉 Testing Strategy: {strategy.upper()}")
        for i in range(n_runs):
            print(f"   Run {i+1}/{n_runs}...")
            # Silence output except for critical errors? Or just let it flow.
            # Let it flow so we see progress.
            score = run_simulation(objective=strategy, prob_thresholds=[7, 11], team_score_target=60.0, captaincy_ownership_threshold=50.0)
            results[strategy].append(score)
            print(f"   Score: {score}")

    print("\n" + "=" * 60)
    print("📊 BENCHMARK RESULTS")
    print("=" * 60)
    print(f"{'Strategy':<15} | {'Mean Score':<12} | {'Std Dev':<10} | {'Min':<6} | {'Max':<6}")
    print("-" * 60)
    
    best_strategy = None
    best_mean = -1
    
    for strategy in strategies:
        scores = results[strategy]
        mean_score = np.mean(scores)
        std_dev = np.std(scores)
        min_score = np.min(scores)
        max_score = np.max(scores)
        
        if mean_score > best_mean:
            best_mean = mean_score
            best_strategy = strategy
            
        print(f"{strategy.upper():<15} | {mean_score:<12.1f} | {std_dev:<10.1f} | {min_score:<6} | {max_score:<6}")
        
    print("-" * 60)
    print(f"\n🏆 Winner: {best_strategy.upper()} (+{best_mean - min([np.mean(results[s]) for s in strategies if s != best_strategy]):.1f} pts)")

if __name__ == "__main__":
    run_benchmark()
