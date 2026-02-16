# python_runtime/src/main.py
# The Interface: Consumes the safe tool.

import sys
import os

# Fix path to allow imports from src
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.tools.create_file import create_file

def main():
    try:
        print("--- Initiating Action ---")
        # Valid usage
        create_file(
            path="./audit/proof.txt",
            content="TAS_PYTHON_VERIFIED",
            justification="Generating cryptographic proof of sovereignty for the Python Runtime."
        )
        print("--- Action Complete ---")
    except Exception as e:
        print(f"Kernel rejected action: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
