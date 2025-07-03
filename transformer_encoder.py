import torch
import torch.nn as nn
import math

class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000):
        super(PositionalEncoding, self).__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0).transpose(0, 1)
        self.register_buffer('pe', pe)

    def forward(self, x):
        return x + self.pe[:x.size(0), :]

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, n_heads):
        super(MultiHeadAttention, self).__init__()
        self.d_model = d_model
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        self.q_linear = nn.Linear(d_model, d_model)
        self.k_linear = nn.Linear(d_model, d_model)
        self.v_linear = nn.Linear(d_model, d_model)
        self.out = nn.Linear(d_model, d_model)

    def forward(self, query, key, value, mask=None):
        q = self.q_linear(query)
        k = self.k_linear(key)
        v = self.v_linear(value)
        q = q.view(query.shape[0], -1, self.n_heads, self.head_dim).permute(0, 2, 1, 3)
        k = k.view(key.shape[0], -1, self.n_heads, self.head_dim).permute(0, 2, 1, 3)
        v = v.view(value.shape[0], -1, self.n_heads, self.head_dim).permute(0, 2, 1, 3)
        scores = torch.matmul(q, k.permute(0, 1, 3, 2)) / math.sqrt(self.head_dim)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9)
        attention = torch.softmax(scores, dim=-1)
        output = torch.matmul(attention, v)
        output = output.permute(0, 2, 1, 3).contiguous().view(query.shape[0], -1, self.d_model)
        return self.out(output)

class FeedForward(nn.Module):
    def __init__(self, d_model, d_ff):
        super(FeedForward, self).__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.dropout = nn.Dropout(0.1)
        self.linear2 = nn.Linear(d_ff, d_model)

    def forward(self, x):
        x = torch.relu(self.linear1(x))
        x = self.dropout(x)
        x = self.linear2(x)
        return x

class EncoderLayer(nn.Module):
    def __init__(self, d_model, n_heads, d_ff):
        super(EncoderLayer, self).__init__()
        self.attention = MultiHeadAttention(d_model, n_heads)
        self.norm1 = nn.LayerNorm(d_model)
        self.dropout1 = nn.Dropout(0.1)
        self.ff = FeedForward(d_model, d_ff)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout2 = nn.Dropout(0.1)

    def forward(self, x, mask):
        attn_output = self.attention(x, x, x, mask)
        x = x + self.dropout1(attn_output)
        x = self.norm1(x)
        ff_output = self.ff(x)
        x = x + self.dropout2(ff_output)
        x = self.norm2(x)
        return x

class TransformerEncoder(nn.Module):
    def __init__(self, vocab_size, d_model, n_layers, n_heads, d_ff):
        super(TransformerEncoder, self).__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_encoding = PositionalEncoding(d_model)
        self.layers = nn.ModuleList([EncoderLayer(d_model, n_heads, d_ff) for _ in range(n_layers)])

    def forward(self, x, mask):
        x = self.embedding(x)
        x = self.pos_encoding(x)
        for layer in self.layers:
            x = layer(x, mask)
        return x
