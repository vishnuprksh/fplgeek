# Configuration
DATA_DIR = "public/data/processed"
MODELS_DIR = "public/models/ai_manager"
DB_PATH = "public/data/fpl.sqlite"
OUTPUT_FILE = "public/data/ai_manager_history.json"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

# Feature Params
SEQ_LEN = 5
NUM_FEATURES = 12

# Constants
STARTING_BUDGET = 1000
EXPERIMENTS_DIR = "src/scripts/results"
FREE_TRANSFERS_LIMIT = 5
WILDCARD_1_DEADLINE = 20 # Approx
WILDCARD_2_START = 20
