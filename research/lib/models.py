import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, LSTM, Dense, Concatenate, Dropout, Embedding, Flatten, Bidirectional
from tensorflow.keras.optimizers import Adam
from .config import SEQ_LEN, NUM_FEATURES

def clean_and_scale(X_seq, X_ctx):
    if len(X_seq) == 0:
        return X_seq, X_ctx

    # 1. Replace NaN/Inf
    X_seq = np.nan_to_num(X_seq, nan=0.0, posinf=0.0, neginf=0.0)
    X_ctx = np.nan_to_num(X_ctx, nan=0.0, posinf=0.0, neginf=0.0)
    
    # 2. Scale (Simple Global Scaling)
    scales_seq = np.array([90, 2.0, 1.0, 100, 100, 100, 5, 5, 15, 15, 1, 20], dtype=np.float32)
    X_seq = X_seq / scales_seq.reshape(1, 1, -1)
    
    # 9 context features: [was_home, difficulty, price, hours_rest,
    #                      all_time_avg_pts, all_time_total_pts, all_time_goals_per_90, all_time_xg_per_90, all_time_games_played]
    scales_ctx = np.array([1, 5, 15, 200, 10, 400, 1.0, 1.0, 50], dtype=np.float32)
    X_ctx = X_ctx / scales_ctx.reshape(1, -1)
    
    return X_seq, X_ctx

def build_model():
    """
    Build Bidirectional LSTM model for FPL point prediction
    
    Architecture based on systematic experimentation (2026-02-01):
    - Bidirectional LSTM achieves 0.46% average improvement over baseline
    - Consistent performance across all positions
    - Best balance of accuracy and maintainability
    """
    # 1. Sequence Input (Bidirectional LSTM)
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = Bidirectional(LSTM(32, return_sequences=False))(seq_input)
    x = Dropout(0.2)(x)
    
    # 2. Context Input (Dense) - 9 features including all-time stats
    ctx_input = Input(shape=(9,), name="ctx_input")
    
    # 3. Opponent Input (Embedding) - OPTIMIZED
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=4)(opp_input) 
    opp_flat = Flatten()(opp_embed)
    
    # Concatenate
    concat = Concatenate()([x, ctx_input, opp_flat])
    
    # Dense Layers
    dense = Dense(32, activation='relu')(concat)
    dense = Dense(16, activation='relu')(dense)
    output = Dense(1, activation='linear')(dense) # Regression
    
    model = Model(inputs=[seq_input, ctx_input, opp_input], outputs=output)
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse', metrics=['mae'])
    return model

