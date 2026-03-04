import os

# Data root: override with FPL_DATA_DIR env var (Docker sets /app/data; local defaults to <repo>/data/)
_DATA_ROOT = os.environ.get(
    'FPL_DATA_DIR',
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../data'))
)

# Configuration
DATA_DIR = os.path.join(_DATA_ROOT, 'processed')
MODELS_DIR = os.path.join(_DATA_ROOT, 'models/ai_manager_mlp')
DB_PATH = os.path.join(_DATA_ROOT, 'fpl.sqlite')
OUTPUT_FILE = os.path.join(_DATA_ROOT, 'ai_manager_history.json')
PREDICTIONS_FILE = os.path.join(_DATA_ROOT, 'ai_predictions.json')
REPORT_FILE = os.path.join(_DATA_ROOT, 'model_accuracy_report.md')
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

# Model Params
BATCH_SIZE = 32
EPOCHS = 1000
LEARNING_RATE = 0.001

# Feature Params
# Context Features (match-level, non-rolling):
# [was_home, difficulty, price, hours_rest, ownership, opponent_strength, chance_of_playing,
#  fixture_attack_raw, fixture_defense_raw, fixture_attack_scaled, fixture_defense_scaled]
NUM_CTX_FEATURES = 11

# Aggregated Features (dual rolling windows):
# Rolling-4:  [min, pts, xG, xA, inf, cre, thr, gc, saves]  (9 features)
# Rolling-10: [min, pts, xG, xA, inf, cre, thr, gc, saves]  (9 features)
# Total Aggregated: 9 * 2 = 18
NUM_AGG_FEATURES = 18

# Total Input: 11 + 18 = 29
INPUT_DIM = NUM_CTX_FEATURES + NUM_AGG_FEATURES  # 29

# Constants
STARTING_BUDGET = 1000
EXPERIMENTS_DIR = "scripts/results"
FREE_TRANSFERS_LIMIT = 5
WILDCARD_1_DEADLINE = 20  # Approx
WILDCARD_2_START = 20
