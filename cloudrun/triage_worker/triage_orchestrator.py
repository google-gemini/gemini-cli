import subprocess
import os
import json
from utils.gemini import upload_debug_log

def process_issue_triage(payload):
    """
    LLM inference via Gemini CLI.
    """
    issue_num = payload.get("issue_number")
    title = payload.get("title", "")
    body = payload.get("body", "")
    repo_name = payload.get("repository", "")
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    policy_path = os.path.join(current_dir, "policy.toml")
    system_prompt_path = os.path.join(current_dir, ".gemini", "triage_orchestrator.md")
    target_cwd = "/opt/gemini-cli"

    env = os.environ.copy()
    # Makes GCLI use the skills defined inside our .gemini folder.
    env["GEMINI_SYSTEM_MD"] = str(system_prompt_path) 
    env["GEMINI_CLI_HOME"] = current_dir
    # Force non interactive mode
    env["TERM"] = "dumb"
    env["COLORTERM"] = ""

    prompt = f"Repository: {repo_name}\nIssue Number: {issue_num}\nTitle: {title}\nDescription: {body}"

    try:
        print(f"[LOGIC] Running gemini-cli inside: {target_cwd}")
        result = subprocess.run(
            [
                "gemini",
                "-p", prompt,
                "--policy", str(policy_path),
                "--skip-trust",
                "--approval-mode", "yolo",
                "--debug"
            ],
            cwd=target_cwd,
            env=env,
            capture_output=True,
            text=True,
            check=True
        )
        
        print(f"[LOGIC] Gemini CLI Output:\n{result.stdout}")
        if result.stderr:
            print("[LOGIC] Gemini CLI Output End")
            upload_debug_log(repo_name, issue_num, result.stderr)
            
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        print(f"[LOGIC] Error: gemini-cli failed with code {e.returncode}")
        if e.stderr:
            upload_debug_log(repo_name, issue_num, e.stderr)
        print(f"[LOGIC] Stdout:\n{e.stdout}")
        return False, e.stderr
    except FileNotFoundError:
        print("[LOGIC] Error: 'gemini' command not found in the container path!")
        return False, "gemini command not found"
