import json
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, LSTM, Dense, Concatenate, Dropout, Embedding, Flatten
from tensorflow.keras.optimizers import Adam
from sklearn.preprocessing import StandardScaler
import os

# --- Configuration ---
DATA_DIR = "public/data/processed"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]
OUTPUT_FILE = "model_performance.md"

# --- Findings from Analysis (Step 61) ---
# Sequence Features derived from generate_dataset.ts:
# [Minutes, xG, xA, Threat, Creativity, Influence, GC, Saves, log(Selected), SmartValue, Price, WasHome, Points]
SEQ_LEN = 5
NUM_FEATURES = 13 

def load_data(pos):
    filepath = os.path.join(DATA_DIR, f"dataset_{pos}.json")
    with open(filepath, "r") as f:
        data = json.load(f)
    return data

def prepare_tensors(data):
    # Filter based on GW for Train/Test Split
    # Requirement: Predict from 11th week onwards.
    # Means: Train on history (GW <= 10 of Season 2 OR All Season 1).
    # Since our dataset.json contains mixed history, we will trust the 'gw' field.
    # Note: 'gw' resets every season. If we have multiple seasons, we might have duplicate GW numbers.
    # However, generate_dataset.ts sorted by time.
    # We will assume a simple split: Last 30% of data is test, or explicitly GW > 15 if we want to follow typical mid-season split.
    # User said "predict... from 11th week onwards". 
    # Let's interpret this as: Test Set = GW >= 11 (Current Season). Train Set = Everything before.
    
    # Check max GW
    max_gw = max([d['gw'] for d in data])
    
    # Split based on Season and GW
    # User Request: Train = 24/25 + 25/26 (GW <= 10). Test = 25/26 (GW > 10).
    
    train_data = []
    test_data = []
    
    for d in data:
        season = d.get('season', '25/26') # Fallback if missing (shouldn't be)
        gw = d['gw']
        
        if season == '24/25':
            train_data.append(d)
        elif season == '25/26':
            if gw <= 10:
                train_data.append(d)
            else:
                test_data.append(d)
        else:
            # Fallback for unknown seasons (put in train)
            train_data.append(d)

    print(f"Split: Train={len(train_data)}, Test={len(test_data)}")

    # Extract Arrays
    def get_arrays(batch):
        X_seq = np.array([d['history_sequence'] for d in batch], dtype=np.float32)
        X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] for d in batch], dtype=np.float32)
        # Opponent ID for Embedding
        X_opp = np.array([d['ctx_opponent'] for d in batch], dtype=np.float32)
        y = np.array([d['target'] for d in batch], dtype=np.float32)
        names = [d['name'] for d in batch]
        gws = [d['gw'] for d in batch]
        return X_seq, X_ctx, X_opp, y, names, gws

    return get_arrays(train_data), get_arrays(test_data)

def build_model():
    # 1. Sequence Input (LSTM)
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = LSTM(32, return_sequences=False)(seq_input)
    x = Dropout(0.2)(x)
    
    # 2. Context Input (Dense)
    ctx_input = Input(shape=(4,), name="ctx_input")
    
    # 3. Opponent Embedding
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=4)(opp_input) # 20 teams + 1 buffer
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

def main():
    report = "# Deep Learning Model Report: FPL Points Prediction\n\n"
    report += "## Methodology\n"
    report += "- **Architecture**: Hybrid LSTM (History) + Embedding (Opponent) + Dense (Context).\n"
    report += "- **Training Split**: Train on historical data (GW < 11), Test on GW >= 11.\n"
    report += "- **Loss Function**: Mean Squared Error (MSE).\n\n"
    report += "## Results by Position\n\n"
    
    totals = {'mae': [], 'rmse': []}
    
    for pos in POSITIONS:
        print(f"\n--- Training {pos} Model ---")
        data = load_data(pos)
        
        # Scaling
        # Ideally fit scaler on Train only.
        # For simplicity in this script, we'll do simplistic global scaling or just let NN handle it (BatchNorm would be better).
        # We'll rely on our data being roughly normalized (Price/10, etc) in generate_dataset.ts
        # Preprocessing to avoid NaNs
        def clean_and_scale(X_seq, X_ctx):
            # 1. Replace NaN/Inf
            X_seq = np.nan_to_num(X_seq, nan=0.0, posinf=0.0, neginf=0.0)
            X_ctx = np.nan_to_num(X_ctx, nan=0.0, posinf=0.0, neginf=0.0)
            
            # 2. Scale (Simple Global Scaling for Stability)
            # Sequence: [Min, xG, xA, Thr, Cre, Inf, GC, Sav, Sel, SV, Price, Home, Pts]
            # Min(90), Sel(log~14), Price(~10), Inf(~30), Threat(~50)
            # We divide by rough max values to normalize to 0-1 range approx
            scales_seq = np.array([90, 2.0, 1.0, 100, 100, 100, 5, 5, 15, 100, 15, 1, 20], dtype=np.float32)
            X_seq = X_seq / scales_seq.reshape(1, 1, -1)
            
            # Context: [Home, Diff, Price, Rest]
            scales_ctx = np.array([1, 5, 15, 200], dtype=np.float32)
            X_ctx = X_ctx / scales_ctx.reshape(1, -1)
            
            return X_seq, X_ctx

        (X_seq_train, X_ctx_train, X_opp_train, y_train, _, _), \
        (X_seq_test, X_ctx_test, X_opp_test, y_test, names_test, gws_test) = prepare_tensors(data)
        
        X_seq_train, X_ctx_train = clean_and_scale(X_seq_train, X_ctx_train)
        X_seq_test, X_ctx_test = clean_and_scale(X_seq_test, X_ctx_test)
        
        if len(y_train) < 50:
            print(f"Skipping {pos}: Insufficient training data ({len(y_train)} samples)")
            continue
                
        model = build_model()
        history = model.fit(
            [X_seq_train, X_ctx_train, X_opp_train], y_train,
            validation_split=0.1,
            epochs=20,
            batch_size=32,
            verbose=0
        )
        
        # Evaluate
        loss, mae = model.evaluate([X_seq_test, X_ctx_test, X_opp_test], y_test, verbose=0)
        y_pred = model.predict([X_seq_test, X_ctx_test, X_opp_test], verbose=0).flatten()
        
        # Metrics
        rmse = np.sqrt(np.mean((y_test - y_pred)**2))
        totals['mae'].append(mae)
        totals['rmse'].append(rmse)
        
        # Save Model
        model_path = f"public/models/model_{pos}.keras"
        os.makedirs("public/models", exist_ok=True)
        model.save(model_path)
        print(f"Saved {pos} model to {model_path}")

        print(f"{pos} Results: MAE={mae:.4f}, RMSE={rmse:.4f}")
        
        report += f"### {pos} Model\n"
        report += f"- **Samples**: {len(y_train)} Train, {len(y_test)} Test\n"
        report += f"- **MAE**: {mae:.4f}\n"
        report += f"- **RMSE**: {rmse:.4f}\n"
        
        # Top Predictions Check
        report += "\n**Top 3 Predictions (Sanity Check):**\n"
        results_df = pd.DataFrame({'Name': names_test, 'GW': gws_test, 'Actual': y_test, 'Pred': y_pred})
        top_picks = results_df.sort_values('Pred', ascending=False).head(3)
        for _, row in top_picks.iterrows():
            report += f"- **{row['Name']}** (GW{row['GW']}): Pred **{row['Pred']:.2f}** (Actual {row['Actual']})\n"
        report += "\n"

    avg_mae = np.mean(totals['mae'])
    report += "## Overall Conclusion\n"
    report += f"The models achieved an average **MAE of {avg_mae:.4f}**. "
    if avg_mae < 2.5:
        report += "This is a strong baseline (typically FPL MAE is 2.0-3.0 for individual players)."
    else:
        report += "There is room for improvement, likely by adding more features or data."

    with open(OUTPUT_FILE, "w") as f:
        f.write(report)
    print(f"\nReport saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
