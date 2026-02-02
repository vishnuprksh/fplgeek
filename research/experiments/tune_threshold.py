import sys
import os

# Add Research path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from research.experiments.ai_manager import run_simulation

def main():
    print("🧪 Starting Threshold Tuning Experiment...")
    
    thresholds = [4.0, 5.0, 6.0, 7.0, 8.0]
    results = {}
    
    best_score = -1
    best_thresh = -1
    
    for t in thresholds:
        print(f"\n👉 Testing Explosive Threshold: {t}")
        try:
            score = run_simulation(float(t))
            results[t] = score
            print(f"🎯 Threshold {t} Result: {score} points")
            
            if score > best_score:
                best_score = score
                best_thresh = t
        except Exception as e:
            print(f"❌ Failed for threshold {t}: {e}")
            
    print("\n\n📊 --- EXPERIMENT RESULTS ---")
    print("| Threshold | Total Points |")
    print("|-----------|--------------|")
    for t, s in results.items():
        print(f"| {t:<9} | {s:<12} |")
        
    print(f"\n🏆 Best Threshold: {best_thresh} (Points: {best_score})")

if __name__ == "__main__":
    main()
