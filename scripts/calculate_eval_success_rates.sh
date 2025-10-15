#!/bin/bash

set -euo pipefail

SUMMARY_FILE="$1"

if [ ! -f "$SUMMARY_FILE" ]; then
    echo "Error: Summary file not found at $SUMMARY_FILE"
    exit 1
fi

echo "📊 Evaluation Success Rate Analysis"
echo "================================================================================"
echo ""

# Use awk to parse, print report, and set GitHub outputs
awk -v github_output="${GITHUB_OUTPUT:-}" ' 
BEGIN {
    in_results_section = 0
    resolution_rate = ""
    tool_success_rate = ""
}

# --- Evaluation Resolution Rate ---
/## 📝 Evaluation Results/ {
    in_results_section = 1
    next
}
in_results_section && /Resolution Rate/ {
    rate_str = $0
    sub(/.*: /, "", rate_str)
    print "### Evaluation Resolution Rate: " rate_str
    
    # Extract numeric value for GitHub output
    match(rate_str, /[0-9.]+/)
    resolution_rate = int(substr(rate_str, RSTART, RLENGTH))

    in_results_section = 0
}

# --- Overall Tool Success Rate ---
/Overall Calls/ {
    line = $0;
    sub(/.*Overall Calls\*\*: /, "", line);

    total_calls_str = line;
    sub(/ .*/, "", total_calls_str);

    successful_calls_str = line;
    sub(/.*Successful: /, "", successful_calls_str);
    sub(/,.*/, "", successful_calls_str);

    total_calls = total_calls_str + 0;
    successful_calls = successful_calls_str + 0;

    print ""
    if (total_calls > 0) {
        rate = (successful_calls / total_calls) * 100;
        printf("### Overall Tool Success Rate: %.2f%% (%d/%d)\n", rate, successful_calls, total_calls);
        tool_success_rate = sprintf("%d", rate)
    } else {
        print "### Overall Tool Success Rate: N/A (0 calls)";
        tool_success_rate = "0"
    }
    
    print ""
    print "### Tool-specific Success Rates"
    print "--------------------------------"
}

# --- Tool-specific Success Rates ---
/- \*\*Tool: `[^`]+`\*\*/ {
    line = $0;
    match(line, /`[^`]+`/);
    tool_name_raw = substr(line, RSTART, RLENGTH);
    tool_name = substr(tool_name_raw, 2, length(tool_name_raw) - 2);

    do { getline; } while ($0 !~ /Calls:/ && $0 != "");
    if ($0 == "") next;
    
    calls_line = $0;
    sub(/.*Calls:[[:space:]]*/, "", calls_line);
    calls = calls_line + 0;

    do { getline; } while ($0 !~ /Successful:/ && $0 != "");
    if ($0 == "") next;

    successful_line = $0;
    sub(/.*Successful:[[:space:]]*/, "", successful_line);
    successful = successful_line + 0;

    if (calls > 0) {
        rate = (successful / calls) * 100;
        printf("- **%s**: %.2f%% (%d/%d)\n", tool_name, rate, successful, calls);
    } else {
        printf("- **%s**: N/A (0 calls)\n", tool_name);
    }
}

# --- Write to GITHUB_OUTPUT at the end ---
END {
    if (github_output != "") {
        if (resolution_rate != "") {
            printf "resolution-rate=%s\n", resolution_rate >> github_output
        }
        if (tool_success_rate != "") {
            printf "tool-success-rate=%s\n", tool_success_rate >> github_output
        }
        close(github_output)
    }
}

' "$SUMMARY_FILE"
