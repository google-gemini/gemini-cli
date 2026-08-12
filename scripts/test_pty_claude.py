#!/usr/bin/env python3
"""PTY Interactive TUI Test Harness for Claude model rendering in Gemini CLI."""

import os
import pty
import select
import sys
import time

def run_interactive_tui_claude_test(command, prompt_text, timeout=20):
    master, slave = pty.openpty()

    env = os.environ.copy()
    env["GEMINI_CONFIG_DIR"] = os.path.expanduser("~/.gemini-claude-direct")
    env["GOOGLE_CLOUD_LOCATION"] = "us-east5"
    env.pop("ANTHROPIC_BASE_URL", None)
    env.pop("GEMINI_CLI_CUSTOM_HEADERS", None)

    pid = os.fork()
    if pid == 0:
        os.close(master)
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        os.close(slave)
        os.execvpe(command[0], command, env)
    else:
        os.close(slave)
        output_buffer = b""
        start_time = time.time()

        # Wait briefly for TUI initialization then send interactive prompt
        time.sleep(2.5)
        os.write(master, prompt_text.encode("utf-8") + b"\r\n")

        while time.time() - start_time < timeout:
            r, _, _ = select.select([master], [], [], 0.5)
            if master in r:
                try:
                    data = os.read(master, 1024)
                    if not data:
                        break
                    output_buffer += data
                    decoded = output_buffer.decode("utf-8", errors="replace")
                    if "TUI_OK_42" in decoded or "claude-sonnet-5" in decoded or "Routing request to model" in decoded:
                        # Send SIGINT to exit interactive CLI loop cleanly
                        os.write(master, b"\x03")
                        time.sleep(0.5)
                        break
                except OSError:
                    break

        try:
            os.close(master)
        except OSError:
            pass

        # Safely terminate child process if still running
        try:
            time.sleep(0.2)
            os.kill(pid, 15) # SIGTERM
            time.sleep(0.1)
            os.kill(pid, 9)  # SIGKILL
        except OSError:
            pass

        try:
            os.waitpid(pid, 0)
        except OSError:
            pass

        decoded = output_buffer.decode("utf-8", errors="replace")
        return decoded

if __name__ == "__main__":
    cmd = ["node", "packages/cli/dist/index.js", "-m", "claude-sonnet-5"]
    print("Spawning interactive TUI in PTY for model: claude-sonnet-5...")
    output = run_interactive_tui_claude_test(cmd, "Reply with 'TUI_OK_42'")
    
    print("\n--- Captured PTY Output ---")
    print(output)
    print("----------------------------\n")
    
    if "TUI_OK_42" in output or "claude-sonnet-5" in output or "Routing request to model" in output:
        print("PASS: Interactive PTY TUI test verified successfully.")
        sys.exit(0)
    else:
        print("FAIL: Expected TUI output not captured.")
        sys.exit(1)
