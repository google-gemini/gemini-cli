#!/bin/bash

# 1. Check if a command was provided
if [ -z "$1" ]; then
    echo "Usage: ./launch.sh <command>"
    exit 1
fi

# 2. Start the timer in the background
# This function handles the visual update
run_timer() {
    START_TIME=$(date +%s.%N)
    # Hide the cursor for a cleaner look
    tput civis 
    
    while true; do
        CURRENT_TIME=$(date +%s.%N)
        ELAPSED=$(echo "$CURRENT_TIME - $START_TIME" | bc -l)
        
        # Use printf to keep the timer on a single line with 3 decimal places
        printf "\r>> System Uptime: %0.3f seconds... " $ELAPSED
        sleep 0.01
    done
}

# Start the timer function and save its Process ID (PID)
run_timer &
TIMER_PID=$!

# 3. Run the actual command
# We use "$@" to capture everything you typed (gemini, node bundle/gemini.js, etc.)
"$@"

# 4. Once the command starts/finishes, kill the timer
kill $TIMER_PID
tput cnorm # Restore the cursor
echo -e "\n>> Handover complete."
