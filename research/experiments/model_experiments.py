"""
Model Architecture Experimentation Framework
============================================
Systematic approach to iterate and improve FPL point prediction models.

Key Principles:
1. No data leakage - strict train/val/test splits by season and GW
2. Reproducible experiments with random seeds
3. Comprehensive metrics tracking
4. Position-specific evaluation
"""

import json
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import (
    Input, LSTM, GRU, Bidirectional, Dense, Concatenate, 
    Dropout, Embedding, Flatten, BatchNormalization, Attention
)
from tensorflow.keras.optimizers import Adam, RMSprop
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import os
import sys
from datetime import datetime

# Ensure reproducibility
np.random.seed(42)
tf.random.set_seed(42)

# Add parent to path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from research.lib.config import DATA_DIR, POSITIONS, SEQ_LEN, NUM_FEATURES

# Experiment Configuration
EXPERIMENTS_DIR = "research/experiments/results"
os.makedirs(EXPERIMENTS_DIR, exist_ok=True)

# Data Split Strategy (NO LEAKAGE)
# Train: Season 24/25 (all GWs)
# Val: Season 25/26 (GW 1-10)
# Test: Season 25/26 (GW 11+)

def load_data(pos):
    """Load dataset for a position"""
    filepath = os.path.join(DATA_DIR, f"dataset_{pos}.json")
    with open(filepath, "r") as f:
        return json.load(f)

def split_data(data):
    """
    Split data into train/val/test with NO LEAKAGE
    
    Returns:
        train_data: Season 24/25 (all GWs)
        val_data: Season 25/26 (GW 1-10)
        test_data: Season 25/26 (GW 11+)
    """
    train_data = []
    val_data = []
    test_data = []
    
    for d in data:
        season = d.get('season', '25/26')
        gw = d['gw']
        
        if season == '24/25':
            train_data.append(d)
        elif season == '25/26':
            if gw <= 10:
                val_data.append(d)
            else:
                test_data.append(d)
        else:
            # Unknown season - put in train
            train_data.append(d)
    
    return train_data, val_data, test_data

def prepare_arrays(batch):
    """Convert batch to numpy arrays"""
    if not batch:
        return None, None, None, None
    
    X_seq = np.array([d['history_sequence'] for d in batch], dtype=np.float32)
    X_ctx = np.array([
        [d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] 
        for d in batch
    ], dtype=np.float32)
    X_opp = np.array([d['ctx_opponent'] for d in batch], dtype=np.float32)
    y = np.array([d['target'] for d in batch], dtype=np.float32)
    
    return X_seq, X_ctx, X_opp, y

def clean_and_scale(X_seq, X_ctx, X_opp):
    """Clean and normalize inputs"""
    # Replace NaN/Inf
    X_seq = np.nan_to_num(X_seq, nan=0.0, posinf=0.0, neginf=0.0)
    X_ctx = np.nan_to_num(X_ctx, nan=0.0, posinf=0.0, neginf=0.0)
    X_opp = np.nan_to_num(X_opp, nan=1100.0, posinf=1350.0, neginf=1000.0)
    
    # Scale sequence features
    # [Minutes, xG, xA, Threat, Creativity, Influence, GC, Saves, log(Selected), Price, WasHome, Points]
    scales_seq = np.array([90, 2.0, 1.0, 100, 100, 100, 5, 5, 15, 15, 1, 20], dtype=np.float32)
    X_seq = X_seq / scales_seq.reshape(1, 1, -1)
    
    # Scale context: [Home, Difficulty, Price, Rest]
    scales_ctx = np.array([1, 5, 15, 200], dtype=np.float32)
    X_ctx = X_ctx / scales_ctx.reshape(1, -1)
    
    # Scale opponent strength
    X_opp = X_opp / 1350.0
    
    return X_seq, X_ctx, X_opp

def calculate_metrics(y_true, y_pred):
    """Calculate comprehensive metrics"""
    mae = mean_absolute_error(y_true, y_pred)
    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_true, y_pred)
    
    # Additional metrics
    mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-8))) * 100  # +1e-8 to avoid div by 0
    
    # Convert to native Python types for JSON serialization
    return {
        'mae': float(mae),
        'mse': float(mse),
        'rmse': float(rmse),
        'r2': float(r2),
        'mape': float(mape)
    }

# ============================================
# MODEL ARCHITECTURES
# ============================================

def build_baseline_model():
    """
    Baseline: Current production model
    LSTM(32) + Dense layers + Opponent Embedding
    """
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = LSTM(32, return_sequences=False)(seq_input)
    x = Dropout(0.2)(x)
    
    ctx_input = Input(shape=(4,), name="ctx_input")
    
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=4)(opp_input)
    opp_flat = Flatten()(opp_embed)
    
    concat = Concatenate()([x, ctx_input, opp_flat])
    
    dense = Dense(32, activation='relu')(concat)
    dense = Dense(16, activation='relu')(dense)
    output = Dense(1, activation='linear')(dense)
    
    model = Model(inputs=[seq_input, ctx_input, opp_input], outputs=output)
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse', metrics=['mae'])
    
    return model

def build_deeper_lstm_model():
    """
    Experiment 1: Deeper LSTM with more units
    """
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = LSTM(64, return_sequences=True)(seq_input)
    x = Dropout(0.3)(x)
    x = LSTM(32, return_sequences=False)(x)
    x = Dropout(0.2)(x)
    
    ctx_input = Input(shape=(4,), name="ctx_input")
    
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=8)(opp_input)
    opp_flat = Flatten()(opp_embed)
    
    concat = Concatenate()([x, ctx_input, opp_flat])
    
    dense = Dense(64, activation='relu')(concat)
    dense = Dropout(0.2)(dense)
    dense = Dense(32, activation='relu')(dense)
    output = Dense(1, activation='linear')(dense)
    
    model = Model(inputs=[seq_input, ctx_input, opp_input], outputs=output)
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse', metrics=['mae'])
    
    return model

def build_gru_model():
    """
    Experiment 2: GRU instead of LSTM (faster, sometimes better)
    """
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = GRU(64, return_sequences=False)(seq_input)
    x = Dropout(0.2)(x)
    
    ctx_input = Input(shape=(4,), name="ctx_input")
    
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=4)(opp_input)
    opp_flat = Flatten()(opp_embed)
    
    concat = Concatenate()([x, ctx_input, opp_flat])
    
    dense = Dense(32, activation='relu')(concat)
    dense = Dense(16, activation='relu')(dense)
    output = Dense(1, activation='linear')(dense)
    
    model = Model(inputs=[seq_input, ctx_input, opp_input], outputs=output)
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse', metrics=['mae'])
    
    return model

def build_bidirectional_model():
    """
    Experiment 3: Bidirectional LSTM
    """
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = Bidirectional(LSTM(32, return_sequences=False))(seq_input)
    x = Dropout(0.2)(x)
    
    ctx_input = Input(shape=(4,), name="ctx_input")
    
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=4)(opp_input)
    opp_flat = Flatten()(opp_embed)
    
    concat = Concatenate()([x, ctx_input, opp_flat])
    
    dense = Dense(32, activation='relu')(concat)
    dense = Dense(16, activation='relu')(dense)
    output = Dense(1, activation='linear')(dense)
    
    model = Model(inputs=[seq_input, ctx_input, opp_input], outputs=output)
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse', metrics=['mae'])
    
    return model

def build_batchnorm_model():
    """
    Experiment 4: Add BatchNormalization for better training stability
    """
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = LSTM(64, return_sequences=False)(seq_input)
    x = BatchNormalization()(x)
    x = Dropout(0.2)(x)
    
    ctx_input = Input(shape=(4,), name="ctx_input")
    ctx_norm = BatchNormalization()(ctx_input)
    
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=8)(opp_input)
    opp_flat = Flatten()(opp_embed)
    
    concat = Concatenate()([x, ctx_norm, opp_flat])
    
    dense = Dense(64, activation='relu')(concat)
    dense = BatchNormalization()(dense)
    dense = Dropout(0.2)(dense)
    dense = Dense(32, activation='relu')(dense)
    output = Dense(1, activation='linear')(dense)
    
    model = Model(inputs=[seq_input, ctx_input, opp_input], outputs=output)
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse', metrics=['mae'])
    
    return model

def build_larger_embedding_model():
    """
    Experiment 5: Larger opponent embedding dimension
    """
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = LSTM(32, return_sequences=False)(seq_input)
    x = Dropout(0.2)(x)
    
    ctx_input = Input(shape=(4,), name="ctx_input")
    
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=16)(opp_input)  # Larger embedding
    opp_flat = Flatten()(opp_embed)
    
    concat = Concatenate()([x, ctx_input, opp_flat])
    
    dense = Dense(64, activation='relu')(concat)
    dense = Dense(32, activation='relu')(dense)
    output = Dense(1, activation='linear')(dense)
    
    model = Model(inputs=[seq_input, ctx_input, opp_input], outputs=output)
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse', metrics=['mae'])
    
    return model

# Model registry
MODELS = {
    'baseline': build_baseline_model,
    'deeper_lstm': build_deeper_lstm_model,
    'gru': build_gru_model,
    'bidirectional': build_bidirectional_model,
    'batchnorm': build_batchnorm_model,
    'larger_embedding': build_larger_embedding_model,
}

# ============================================
# EXPERIMENT RUNNER
# ============================================

def run_experiment(model_name, model_builder, pos, train_data, val_data, test_data, 
                   epochs=30, batch_size=32, learning_rate=0.001):
    """
    Run a single experiment for a position
    
    Returns:
        dict with metrics and predictions
    """
    print(f"\n{'='*60}")
    print(f"Running: {model_name} for {pos}")
    print(f"{'='*60}")
    
    # Prepare data
    X_seq_train, X_ctx_train, X_opp_train, y_train = prepare_arrays(train_data)
    X_seq_val, X_ctx_val, X_opp_val, y_val = prepare_arrays(val_data)
    X_seq_test, X_ctx_test, X_opp_test, y_test = prepare_arrays(test_data)
    
    if X_seq_train is None or len(y_train) < 50:
        print(f"⚠️  Insufficient training data for {pos}: {len(train_data)} samples")
        return None
    
    # Clean and scale
    X_seq_train, X_ctx_train, X_opp_train = clean_and_scale(X_seq_train, X_ctx_train, X_opp_train)
    X_seq_val, X_ctx_val, X_opp_val = clean_and_scale(X_seq_val, X_ctx_val, X_opp_val)
    X_seq_test, X_ctx_test, X_opp_test = clean_and_scale(X_seq_test, X_ctx_test, X_opp_test)
    
    print(f"📊 Data: Train={len(y_train)}, Val={len(y_val)}, Test={len(y_test)}")
    
    # Build model
    model = model_builder()
    
    # Early stopping on validation loss
    early_stop = EarlyStopping(
        monitor='val_loss',
        patience=5,
        restore_best_weights=True,
        verbose=1
    )
    
    # Train
    history = model.fit(
        [X_seq_train, X_ctx_train, X_opp_train], y_train,
        validation_data=([X_seq_val, X_ctx_val, X_opp_val], y_val),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=[early_stop],
        verbose=1
    )
    
    # Evaluate on all sets
    y_train_pred = model.predict([X_seq_train, X_ctx_train, X_opp_train], verbose=0).flatten()
    y_val_pred = model.predict([X_seq_val, X_ctx_val, X_opp_val], verbose=0).flatten()
    y_test_pred = model.predict([X_seq_test, X_ctx_test, X_opp_test], verbose=0).flatten()
    
    train_metrics = calculate_metrics(y_train, y_train_pred)
    val_metrics = calculate_metrics(y_val, y_val_pred)
    test_metrics = calculate_metrics(y_test, y_test_pred)
    
    print(f"\n📈 Results for {pos}:")
    print(f"  Train MAE: {train_metrics['mae']:.4f} | RMSE: {train_metrics['rmse']:.4f} | R²: {train_metrics['r2']:.4f}")
    print(f"  Val   MAE: {val_metrics['mae']:.4f} | RMSE: {val_metrics['rmse']:.4f} | R²: {val_metrics['r2']:.4f}")
    print(f"  Test  MAE: {test_metrics['mae']:.4f} | RMSE: {test_metrics['rmse']:.4f} | R²: {test_metrics['r2']:.4f}")
    
    return {
        'model_name': model_name,
        'position': pos,
        'train_metrics': train_metrics,
        'val_metrics': val_metrics,
        'test_metrics': test_metrics,
        'history': {
            'loss': [float(x) for x in history.history['loss']],
            'val_loss': [float(x) for x in history.history['val_loss']],
            'mae': [float(x) for x in history.history['mae']],
            'val_mae': [float(x) for x in history.history['val_mae']]
        },
        'epochs_trained': len(history.history['loss']),
        'train_samples': len(y_train),
        'val_samples': len(y_val),
        'test_samples': len(y_test)
    }

def run_all_experiments(positions=None, models_to_test=None):
    """
    Run all experiments across positions and models
    
    Args:
        positions: List of positions to test (default: all)
        models_to_test: List of model names to test (default: all)
    """
    if positions is None:
        positions = POSITIONS
    
    if models_to_test is None:
        models_to_test = list(MODELS.keys())
    
    all_results = []
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    for pos in positions:
        print(f"\n{'#'*60}")
        print(f"# POSITION: {pos}")
        print(f"{'#'*60}")
        
        # Load and split data
        data = load_data(pos)
        train_data, val_data, test_data = split_data(data)
        
        print(f"\n📦 Data split for {pos}:")
        print(f"   Train (24/25): {len(train_data)} samples")
        print(f"   Val (25/26 GW1-10): {len(val_data)} samples")
        print(f"   Test (25/26 GW11+): {len(test_data)} samples")
        
        for model_name in models_to_test:
            model_builder = MODELS[model_name]
            
            result = run_experiment(
                model_name=model_name,
                model_builder=model_builder,
                pos=pos,
                train_data=train_data,
                val_data=val_data,
                test_data=test_data,
                epochs=30,
                batch_size=32
            )
            
            if result:
                all_results.append(result)
    
    # Save results
    results_file = os.path.join(EXPERIMENTS_DIR, f"experiments_{timestamp}.json")
    with open(results_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    print(f"\n✅ All experiments complete! Results saved to: {results_file}")
    
    # Generate summary report
    generate_summary_report(all_results, timestamp)
    
    return all_results

def generate_summary_report(results, timestamp):
    """Generate a markdown summary of all experiments"""
    
    report_lines = [
        f"# Model Experimentation Results",
        f"**Timestamp:** {timestamp}",
        f"",
        f"## Methodology",
        f"- **Train Set:** Season 24/25 (all GWs)",
        f"- **Validation Set:** Season 25/26 (GW 1-10)",
        f"- **Test Set:** Season 25/26 (GW 11+)",
        f"- **Early Stopping:** Patience=5 on validation loss",
        f"- **Metrics:** MAE, RMSE, R², MAPE",
        f"",
        f"## Results Summary",
        f""
    ]
    
    # Create summary table
    df_results = []
    for r in results:
        df_results.append({
            'Model': r['model_name'],
            'Position': r['position'],
            'Test MAE': r['test_metrics']['mae'],
            'Test RMSE': r['test_metrics']['rmse'],
            'Test R²': r['test_metrics']['r2'],
            'Val MAE': r['val_metrics']['mae'],
            'Epochs': r['epochs_trained'],
            'Test Samples': r['test_samples']
        })
    
    df = pd.DataFrame(df_results)
    
    # Overall best models
    report_lines.append("### Best Models by Position (Test MAE)")
    report_lines.append("")
    
    for pos in POSITIONS:
        pos_results = df[df['Position'] == pos].sort_values('Test MAE')
        if len(pos_results) > 0:
            best = pos_results.iloc[0]
            report_lines.append(f"**{pos}:** `{best['Model']}` - MAE: {best['Test MAE']:.4f}, R²: {best['Test R²']:.4f}")
    
    report_lines.append("")
    report_lines.append("### Detailed Results")
    report_lines.append("")
    report_lines.append(df.to_markdown(index=False))
    
    # Average performance by model
    report_lines.append("")
    report_lines.append("### Average Performance by Model Architecture")
    report_lines.append("")
    
    model_avg = df.groupby('Model').agg({
        'Test MAE': 'mean',
        'Test RMSE': 'mean',
        'Test R²': 'mean'
    }).round(4).sort_values('Test MAE')
    
    report_lines.append(model_avg.to_markdown())
    
    # Save report
    report_file = os.path.join(EXPERIMENTS_DIR, f"summary_{timestamp}.md")
    with open(report_file, 'w') as f:
        f.write('\n'.join(report_lines))
    
    print(f"📄 Summary report saved to: {report_file}")
    
    # Print to console
    print("\n" + "\n".join(report_lines))

if __name__ == "__main__":
    # Run all experiments
    print("🚀 Starting Model Architecture Experiments")
    print("=" * 60)
    
    results = run_all_experiments()
    
    print("\n🎉 Experimentation complete!")
