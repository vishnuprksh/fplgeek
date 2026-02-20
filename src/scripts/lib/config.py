# Configuration
DATA_DIR = "public/data/processed"
MODELS_DIR = "public/models/ai_manager_mlp"
DB_PATH = "public/data/fpl.sqlite"
OUTPUT_FILE = "public/data/ai_manager_history.json"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

# Model Params
BATCH_SIZE = 32
EPOCHS = 1000
LEARNING_RATE = 0.001

# Feature Params
# Static Context Features:
# [was_home, difficulty, price, hours_rest, all_time_avg_pts,
#  all_time_goals_per_90, all_time_xg_per_90, all_time_games_played,
#  ownership, opponent_strength, chance_of_playing]
NUM_CTX_FEATURES = 11

# Aggregated Features:
# Last 4:  [min, pts, xG, xA, inf, cre, thr, gc, saves] (9 features)
# Total Aggregated: 9 * 1 = 9
NUM_AGG_FEATURES = 9

# Total Input: 11 + 9 = 20
INPUT_DIM = NUM_CTX_FEATURES + NUM_AGG_FEATURES

# Constants
STARTING_BUDGET = 1000
EXPERIMENTS_DIR = "src/scripts/results"
FREE_TRANSFERS_LIMIT = 5
WILDCARD_1_DEADLINE = 20 # Approx
WILDCARD_2_START = 20
