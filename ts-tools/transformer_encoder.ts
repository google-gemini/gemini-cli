import * as torch from 'torch';
import { nn } from 'torch';
import * as math from 'math';

class PositionalEncoding extends nn.Module {
  private pe: torch.Tensor;

  constructor(d_model: number, max_len: number = 5000) {
    super();
    const pe = torch.zeros([max_len, d_model]);
    const position = torch
      .arange(0, max_len, { dtype: torch.float })
      .unsqueeze(1);
    const div_term = torch.exp(
      torch
        .arange(0, d_model, 2)
        .float()
        .mul(-math.log(10000.0) / d_model),
    );
    pe.slice(1, 0, undefined, 2).copy_(torch.sin(position.mul(div_term)));
    pe.slice(1, 1, undefined, 2).copy_(torch.cos(position.mul(div_term)));
    this.pe = pe.unsqueeze(0).transpose(0, 1);
    this.register_buffer('pe', this.pe);
  }

  forward(x: torch.Tensor): torch.Tensor {
    return x.add(this.pe.slice(0, x.size(0)));
  }
}

class MultiHeadAttention extends nn.Module {
  private d_model: number;
  private n_heads: number;
  private head_dim: number;
  private q_linear: nn.Linear;
  private k_linear: nn.Linear;
  private v_linear: nn.Linear;
  private out: nn.Linear;

  constructor(d_model: number, n_heads: number) {
    super();
    this.d_model = d_model;
    this.n_heads = n_heads;
    this.head_dim = d_model / n_heads;
    this.q_linear = new nn.Linear(d_model, d_model);
    this.k_linear = new nn.Linear(d_model, d_model);
    this.v_linear = new nn.Linear(d_model, d_model);
    this.out = new nn.Linear(d_model, d_model);
  }

  forward(
    query: torch.Tensor,
    key: torch.Tensor,
    value: torch.Tensor,
    mask?: torch.Tensor,
  ): torch.Tensor {
    let q = this.q_linear.forward(query);
    let k = this.k_linear.forward(key);
    let v = this.v_linear.forward(value);
    q = q
      .view(query.shape[0], -1, this.n_heads, this.head_dim)
      .permute(0, 2, 1, 3);
    k = k
      .view(key.shape[0], -1, this.n_heads, this.head_dim)
      .permute(0, 2, 1, 3);
    v = v
      .view(value.shape[0], -1, this.n_heads, this.head_dim)
      .permute(0, 2, 1, 3);
    const scores = torch
      .matmul(q, k.permute(0, 1, 3, 2))
      .div(math.sqrt(this.head_dim));
    if (mask) {
      scores.masked_fill_(mask.eq(0), -1e9);
    }
    const attention = torch.softmax(scores, -1);
    let output = torch.matmul(attention, v);
    output = output
      .permute(0, 2, 1, 3)
      .contiguous()
      .view(query.shape[0], -1, this.d_model);
    return this.out.forward(output);
  }
}

class FeedForward extends nn.Module {
  private linear1: nn.Linear;
  private dropout: nn.Dropout;
  private linear2: nn.Linear;

  constructor(d_model: number, d_ff: number) {
    super();
    this.linear1 = new nn.Linear(d_model, d_ff);
    this.dropout = new nn.Dropout(0.1);
    this.linear2 = new nn.Linear(d_ff, d_model);
  }

  forward(x: torch.Tensor): torch.Tensor {
    let x_out = torch.relu(this.linear1.forward(x));
    x_out = this.dropout.forward(x_out);
    x_out = this.linear2.forward(x_out);
    return x_out;
  }
}

class EncoderLayer extends nn.Module {
  private attention: MultiHeadAttention;
  private norm1: nn.LayerNorm;
  private dropout1: nn.Dropout;
  private ff: FeedForward;
  private norm2: nn.LayerNorm;
  private dropout2: nn.Dropout;

  constructor(d_model: number, n_heads: number, d_ff: number) {
    super();
    this.attention = new MultiHeadAttention(d_model, n_heads);
    this.norm1 = new nn.LayerNorm(d_model);
    this.dropout1 = new nn.Dropout(0.1);
    this.ff = new FeedForward(d_model, d_ff);
    this.norm2 = new nn.LayerNorm(d_model);
    this.dropout2 = new nn.Dropout(0.1);
  }

  forward(x: torch.Tensor, mask: torch.Tensor): torch.Tensor {
    const attn_output = this.attention.forward(x, x, x, mask);
    let x_out = x.add(this.dropout1.forward(attn_output));
    x_out = this.norm1.forward(x_out);
    const ff_output = this.ff.forward(x_out);
    x_out = x_out.add(this.dropout2.forward(ff_output));
    x_out = this.norm2.forward(x_out);
    return x_out;
  }
}

export class TransformerEncoder extends nn.Module {
  private embedding: nn.Embedding;
  private pos_encoding: PositionalEncoding;
  private layers: nn.ModuleList;

  constructor(
    vocab_size: number,
    d_model: number,
    n_layers: number,
    n_heads: number,
    d_ff: number,
  ) {
    super();
    this.embedding = new nn.Embedding(vocab_size, d_model);
    this.pos_encoding = new PositionalEncoding(d_model);
    this.layers = new nn.ModuleList(
      Array.from(
        { length: n_layers },
        () => new EncoderLayer(d_model, n_heads, d_ff),
      ),
    );
  }

  forward(x: torch.Tensor, mask: torch.Tensor): torch.Tensor {
    let x_out = this.embedding.forward(x);
    x_out = this.pos_encoding.forward(x_out);
    for (const layer of this.layers) {
      x_out = (layer as EncoderLayer).forward(x_out, mask);
    }
    return x_out;
  }
}
