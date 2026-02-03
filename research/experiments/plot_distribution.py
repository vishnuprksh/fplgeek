import json
import os
import matplotlib.pyplot as plt
import numpy as np

# Configuration
DATA_DIR = "public/data/processed"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]
SEASONS = ["23/24", "24/25"]
OUTPUT_IMAGE = "points_distribution.png"

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def generate_graph():
    all_points = []
    
    print("Loading data...")
    for pos in POSITIONS:
        file_path = os.path.join(DATA_DIR, f"dataset_{pos}.json")
        try:
            data = load_json(file_path)
            for record in data:
                if record.get('season') in SEASONS:
                    all_points.append(record['target'])
        except FileNotFoundError:
            print(f"Warning: {file_path} not found.")

    if not all_points:
        print("No data found for specified seasons.")
        return

    print(f"Total records found: {len(all_points)}")
    
    # Calculate Frequency
    points = np.array(all_points)
    unique, counts = np.unique(points, return_counts=True)
    
    # Filter for reasonable range for visualization (e.g., 0 to 20?)
    # User asked for "how many 5s 6s ..etc", so pure count
    
    # Plotting
    plt.figure(figsize=(12, 6))
    
    # Use a bar chart for discrete points
    # Limit x-axis to a reasonable max (e.g. max points or 25 if outliers exist)
    max_display_points = 25
    
    valid_indices = unique <= max_display_points
    x = unique[valid_indices]
    y = counts[valid_indices]
    
    bars = plt.bar(x, y, color='skyblue', edgecolor='black')
    
    # Add counts on top of bars
    for bar in bars:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height,
                 f'{int(height)}',
                 ha='center', va='bottom', fontsize=9, rotation=0)

    plt.xlabel('Points Scored in a Gameweek')
    plt.ylabel('Frequency (Count)')
    plt.title(f'FPL Points Distribution (23/24 - Present)')
    plt.xticks(x)
    plt.grid(axis='y', linestyle='--', alpha=0.7)
    
    plt.tight_layout()
    plt.savefig(OUTPUT_IMAGE)
    print(f"Graph saved to {OUTPUT_IMAGE}")

if __name__ == "__main__":
    generate_graph()
