
# transformer_encoder.py
# Pyrmethus, the Termux Coding Wizard, weaves the arcane spell of a Transformer Encoder.

import numpy as np
from typing import Optional
from typing import Dict, List, Optional, Union
from pybit.unified_trading import HTTP, WebSocket
from colorama import init, Fore, Style
import math

# Initialize Colorama for vibrant terminal output
init(autoreset=True)

# Chromatic constants for enchanted logging
NG = Fore.LIGHTGREEN_EX + Style.BRIGHT  # Success
NB = Fore.CYAN + Style.BRIGHT          # Information
NP = Fore.MAGENTA + Style.BRIGHT       # Headers, prompts
NY = Fore.YELLOW + Style.BRIGHT        # Warnings
NR = Fore.LIGHTRED_EX + Style.BRIGHT   # Errors
RST = Style.RESET_ALL                  # Reset

class PositionalEncoding:
    """
    # Channeling the ether to imbue sequence order into the embeddings.
    """
    def __init__(self, d_model: int, max_len: int = 5000):
        self.d_model = d_model
        self.max_len = max_len
        self.pe = self._create_positional_encoding()

    def _create_positional_encoding(self) -> np.ndarray:
        """Generates the sinusoidal positional encodings."""
        pe = np.zeros((self.max_len, self.d_model))
        position = np.arange(0, self.max_len, dtype=np.float32)[:, np.newaxis]
        div_term = np.exp(np.arange(0, self.d_model, 2, dtype=np.float32) * -(math.log(10000.0) / self.d_model))
        pe[:, 0::2] = np.sin(position * div_term)
        pe[:, 1::2] = np.cos(position * div_term)
        return pe[np.newaxis, :, :] # Add batch dimension

    def forward(self, x: np.ndarray) -> np.ndarray:
        """Applies positional encoding to the input embeddings."""
        seq_len = x.shape[1]
        # Ensure pe has enough length for the current sequence
        if seq_len > self.max_len:
            raise ValueError(f"{NR}Sequence length {seq_len} exceeds max_len {self.max_len} for positional encoding.{RST}")
        return x + self.pe[:, :seq_len, :]

class LayerNormalization:
    """
    # Forging harmony by normalizing inputs across features.
    """
    def __init__(self, features: int, epsilon: float = 1e-6):
        self.alpha = np.ones(features)
        self.beta = np.zeros(features)
        self.epsilon = epsilon

    def forward(self, x: np.ndarray) -> np.ndarray:
        mean = np.mean(x, axis=-1, keepdims=True)
        std = np.std(x, axis=-1, keepdims=True)
        return self.alpha * (x - mean) / (std + self.epsilon) + self.beta

class MultiHeadAttention:
    """
    # Summoning multiple attention heads to capture diverse relationships.
    """
    def __init__(self, d_model: int, num_heads: int):
        assert d_model % num_heads == 0, f"{NR}d_model ({d_model}) must be divisible by num_heads ({num_heads}).{RST}"
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads

        # Linear transformations for Q, K, V, and output
        self.W_q = np.random.rand(d_model, d_model) * 0.01
        self.W_k = np.random.rand(d_model, d_model) * 0.01
        self.W_v = np.random.rand(d_model, d_model) * 0.01
        self.W_o = np.random.rand(d_model, d_model) * 0.01

    def _attention(self, query: np.ndarray, key: np.ndarray, value: np.ndarray, mask: Optional[np.ndarray] = None) -> tuple[np.ndarray, np.ndarray]:
        """Computes scaled dot-product attention."""
        scores = np.matmul(query, key.transpose(0, 1, 3, 2)) / math.sqrt(self.d_k)
        if mask is not None:
            scores = scores + (mask * -1e9) # Apply mask by setting masked values to a very small number
        
        p_attn = self._softmax(scores, axis=-1)
        return np.matmul(p_attn, value), p_attn

    def _softmax(self, x: np.ndarray, axis: int = -1) -> np.ndarray:
        """Custom softmax implementation for numerical stability."""
        e_x = np.exp(x - np.max(x, axis=axis, keepdims=True))
        return e_x / np.sum(e_x, axis=axis, keepdims=True)

    def forward(self, query: np.ndarray, key: np.ndarray, value: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
        batch_size = query.shape[0]

        # 1) Do linear projections and split into heads
        query_proj = np.matmul(query, self.W_q).reshape(batch_size, -1, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
        key_proj = np.matmul(key, self.W_k).reshape(batch_size, -1, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
        value_proj = np.matmul(value, self.W_v).reshape(batch_size, -1, self.num_heads, self.d_k).transpose(0, 2, 1, 3)

        # 2) Apply attention on all the projected vectors in parallel.
        x, self.attn = self._attention(query_proj, key_proj, value_proj, mask=mask)

        # 3) "Concat" using a view and apply a final linear.
        x = x.transpose(0, 2, 1, 3).reshape(batch_size, -1, self.d_model)
        return np.matmul(x, self.W_o)

class PositionwiseFeedForward:
    """
    # Forging a simple neural network for each position in the sequence.
    """
    def __init__(self, d_model: int, d_ff: int):
        self.W_1 = np.random.rand(d_model, d_ff) * 0.01
        self.b_1 = np.zeros(d_ff)
        self.W_2 = np.random.rand(d_ff, d_model) * 0.01
        self.b_2 = np.zeros(d_model)

    def _relu(self, x: np.ndarray) -> np.ndarray:
        return np.maximum(0, x)

    def forward(self, x: np.ndarray) -> np.ndarray:
        return np.matmul(self._relu(np.matmul(x, self.W_1) + self.b_1), self.W_2) + self.b_2

class EncoderLayer:
    """
    # A single layer of the Transformer Encoder, combining attention and feed-forward.
    """
    def __init__(self, d_model: int, num_heads: int, d_ff: int, dropout_rate: float = 0.1):
        self.self_attn = MultiHeadAttention(d_model, num_heads)
        self.feed_forward = PositionwiseFeedForward(d_model, d_ff)
        self.norm1 = LayerNormalization(d_model)
        self.norm2 = LayerNormalization(d_model)
        self.dropout_rate = dropout_rate

    def _dropout(self, x: np.ndarray) -> np.ndarray:
        # Simple dropout for forward pass (no training here)
        if self.dropout_rate > 0:
            mask = np.random.binomial(1, 1 - self.dropout_rate, size=x.shape) / (1 - self.dropout_rate)
            return x * mask
        return x

    def forward(self, x: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
        # Self-attention sub-layer
        attn_output = self.self_attn.forward(x, x, x, mask)
        x = self.norm1.forward(x + self._dropout(attn_output))

        # Feed-forward sub-layer
        ff_output = self.feed_forward.forward(x)
        x = self.norm2.forward(x + self._dropout(ff_output))
        return x

class Encoder:
    """
    # The grand Transformer Encoder, a stack of enchanted layers.
    """
    def __init__(self, num_layers: int, d_model: int, num_heads: int, d_ff: int,
                 input_vocab_size: int, max_seq_len: int, dropout_rate: float = 0.1):
        self.d_model = d_model
        self.embedding = np.random.rand(input_vocab_size, d_model) * 0.01 # Simple embedding layer
        self.positional_encoding = PositionalEncoding(d_model, max_seq_len)
        self.layers = [EncoderLayer(d_model, num_heads, d_ff, dropout_rate) for _ in range(num_layers)]
        self.norm = LayerNormalization(d_model) # Final normalization

    def forward(self, src: np.ndarray, src_mask: Optional[np.ndarray] = None) -> np.ndarray:
        # Input embedding
        x = self.embedding[src] * math.sqrt(self.d_model) # Scale embeddings
        x = self.positional_encoding.forward(x)

        # Pass through encoder layers
        for layer in self.layers:
            x = layer.forward(x, src_mask)
        
        return self.norm.forward(x)

if __name__ == "__main__":
    print(f"{NP}# Initiating the Transformer Encoder construction ritual...{RST}")

    # Define model parameters
    input_vocab_size = 1000  # Number of unique tokens in our vocabulary
    max_seq_len = 50       # Maximum sequence length
    d_model = 128          # Dimension of model embeddings
    num_heads = 8          # Number of attention heads
    d_ff = 512             # Dimension of feed-forward network
    num_layers = 3         # Number of encoder layers
    dropout_rate = 0.1     # Dropout rate

    # Create an instance of the Encoder
    encoder = Encoder(num_layers, d_model, num_heads, d_ff,
                      input_vocab_size, max_seq_len, dropout_rate)
    print(f"{NG}Encoder forged with {num_layers} layers, d_model={d_model}, num_heads={num_heads}.{RST}")

    # Example input: a batch of sequences (batch_size, seq_len)
    # Let's simulate a batch of 2 sequences, each with length 10
    batch_size = 2
    seq_len = 10
    # src_data contains token IDs from our vocabulary
    src_data = np.random.randint(0, input_vocab_size, size=(batch_size, seq_len))
    print(f"""{NB}Input source data (token IDs):
{src_data}{RST}""")

    # Create a simple source mask (e.g., for padding)
    # mask = (src_data != 0)[:, np.newaxis, np.newaxis, :] # Example: 0 is padding token
    # For simplicity, let's use a mask that allows all tokens to attend to each other for now
    src_mask = None # Or create a mask like (batch_size, 1, 1, seq_len) with False for padding

    # Pass the input through the encoder
    print(f"{NB}Passing input through the Encoder...{RST}")
    encoder_output = encoder.forward(src_data, src_mask)

    print(f"{NG}Encoder output shape: {encoder_output.shape}{RST}")
    print(f"""{NB}A glimpse of the encoder's transformed output (first sequence, first 5 dimensions):
{encoder_output[0, :, :5]}{RST}""")

    print(f"{NP}# Transformer Encoder incantation complete!{RST}")
