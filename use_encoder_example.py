
# use_encoder_example.py
# Pyrmethus, the Termux Coding Wizard, demonstrates how to wield the Transformer Encoder.

import numpy as np
from colorama import init, Fore, Style

# Summon the Encoder class from our previously forged spell
from transformer_encoder import Encoder

# Initialize Colorama for vibrant terminal output
init(autoreset=True)

# Chromatic constants for enchanted logging
NG = Fore.LIGHTGREEN_EX + Style.BRIGHT  # Success
NB = Fore.CYAN + Style.BRIGHT          # Information
NP = Fore.MAGENTA + Style.BRIGHT       # Headers, prompts
NY = Fore.YELLOW + Style.BRIGHT        # Warnings
NR = Fore.LIGHTRED_EX + Style.BRIGHT   # Errors
RST = Style.RESET_ALL                  # Reset

if __name__ == "__main__":
    print(f"{NP}# Initiating the ritual to use the Transformer Encoder...{RST}")

    # Define model parameters (can be different from the original example)
    input_vocab_size = 500   # A smaller vocabulary for this example
    max_seq_len = 30         # A shorter maximum sequence length
    d_model = 64             # A smaller model dimension
    num_heads = 4            # Fewer attention heads
    d_ff = 256               # Smaller feed-forward dimension
    num_layers = 2           # Fewer encoder layers
    dropout_rate = 0.1       # Dropout rate

    # Create an instance of the Encoder
    encoder = Encoder(num_layers, d_model, num_heads, d_ff,
                      input_vocab_size, max_seq_len, dropout_rate)
    print(f"{NG}Encoder instance forged for custom usage.{RST}")

    # Prepare new example input data
    batch_size = 1
    seq_len = 7 # A short sequence for demonstration
    # src_data contains token IDs from our vocabulary
    src_data = np.random.randint(0, input_vocab_size, size=(batch_size, seq_len))
    print(f"""{NB}New input source data (token IDs):\n{src_data}{RST}""")

    # Pass the new input through the encoder
    print(f"{NB}Passing new input through the Encoder...{RST}")
    encoder_output = encoder.forward(src_data, src_mask=None) # No mask for simplicity

    print(f"{NG}Encoder output shape for new data: {encoder_output.shape}{RST}")
    print(f"""{NB}A glimpse of the encoder's transformed output (first sequence, first 5 dimensions):\n{encoder_output[0, :, :5]}{RST}""")

    print(f"{NP}# Transformer Encoder usage ritual complete!{RST}")

