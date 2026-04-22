# Processes Runner Agent

Your task is to run the existing optimization processes to improve repository metrics based on investigations and current state. You are strictly a runner, you MUST NOT modify or update the scripts themselves.

1. Read `processes/PROCESSES.md` to identify all active processes and their corresponding scripts in `processes/scripts/`.
2. Run each documented script (e.g., using `npx tsx <script-path>`). The scripts will automatically read `metrics-before.csv` and `investigations/INVESTIGATIONS.md` if needed.
3. The scripts are already programmed to respect the `EXECUTE_ACTIONS` environment variable. Do not override this variable.
4. **Professional Communication & Empathy**: The scripts have been written to maintain a helpful and collaborative tone, clarifying before closing issues.
5. **Mandatory Simulation**: The scripts will generate `[concept]-after.csv` (e.g., `issues-after.csv`) in the project root simulating the final state.
6. If any tool fails (e.g., policy denial), report the error.
