
import sys
import os

# Add root to python path to allow imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.scripts.ai_manager import run_simulation

def run_experiments(num_runs=3):
    # Configurations to test
    # (prob_thresholds, team_score_target, description)
    configs = [
        ([6, 10], 60.0, "Baseline (6, 10, 60)"),
        ([5, 9], 60.0, "Lower Probs (5, 9, 60)"),
        ([7, 11], 60.0, "Higher Probs (7, 11, 60)"),
        ([6, 10], 55.0, "Lower Target (6, 10, 55)"),
        ([6, 10], 65.0, "Higher Target (6, 10, 65)"),
        ([5, 9], 55.0, "Aggressive (5, 9, 55)"),
        ([7, 11], 65.0, "Conservative (7, 11, 65)")
    ]
    
    final_results = []
    
    print(f"🧪 Starting Optimization Sweep ({len(configs)} configs, {num_runs} runs each)...")
    print("="*60)
    
    best_avg_score = -float('inf')
    best_config = None
    
    for i, (probs, target, desc) in enumerate(configs):
        print(f"\n▶️ Testing Config {i+1}/{len(configs)}: {desc}")
        
        run_scores = []
        run_predicted = []
        
        for r in range(num_runs):
            print(f"  Running iteration {r+1}/{num_runs}...", end="", flush=True)
            # Run Simulation
            # We use a fixed captaincy threshold of 50.0 as requested
            total_points, history = run_simulation(
                prob_thresholds=probs, 
                team_score_target=target,
                captaincy_ownership_threshold=50.0,
                end_gw=24
            )
            
            predicted_max = sum(entry['total_xp'] for entry in history)
            run_scores.append(total_points)
            run_predicted.append(predicted_max)
            print(f" Done. ({total_points} pts)")

        avg_points = sum(run_scores) / len(run_scores)
        avg_predicted = sum(run_predicted) / len(run_predicted)
        avg_efficiency = (avg_points / avg_predicted * 100) if avg_predicted > 0 else 0
        
        result = {
            "config": desc,
            "probs": probs,
            "target": target,
            "avg_points": avg_points,
            "avg_predicted": avg_predicted,
            "avg_efficiency": avg_efficiency,
            "runs": run_scores
        }
        final_results.append(result)
        
        if avg_points > best_avg_score:
            best_avg_score = avg_points
            best_config = result
            
        print(f"  📊 Average: {avg_points:.1f} pts (Eff: {avg_efficiency:.1f}%)")
            
    # Print Summary Table
    print("\n" + "="*90)
    print(f"{'CONFIGURATION':<30} | {'AVG POINTS':<12} | {'PREDICTED':<10} | {'EFFICIENCY':<10} | {'STABILITY (Range)':<15}")
    print("-" * 90)
    
    for res in final_results:
        mark = "Result: "
        if res == best_config:
            mark = "BEST -> "
        
        points_range = f"{min(res['runs'])}-{max(res['runs'])}"
        
        print(f"{res['config']:<30} | {res['avg_points']:<12.1f} | {res['avg_predicted']:<10.1f} | {res['avg_efficiency']:5.1f}%     | {points_range:<15}")
        
    print("="*90)
    print(f"\n🏆 Best Configuration: {best_config['config']}")
    print(f"   Avg Points: {best_config['avg_points']:.1f}")
    print(f"   Predicted vs Attained: {best_config['avg_points']:.1f} / {best_config['avg_predicted']:.1f}")

if __name__ == "__main__":
    run_experiments(num_runs=3)
