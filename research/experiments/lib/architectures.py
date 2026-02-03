from tensorflow.keras.models import Model
from tensorflow.keras.layers import (
    Input, LSTM, GRU, Bidirectional, Dense, Concatenate, 
    Dropout, Embedding, Flatten, BatchNormalization
)
from tensorflow.keras.optimizers import Adam
from research.lib.config import SEQ_LEN, NUM_FEATURES

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
