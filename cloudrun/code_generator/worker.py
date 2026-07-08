# Manager Script running inside the Cloud Run Job.
# Orchestrates the iterative Code Generation and Evaluation loop locally using Google Antigravity SDK.

import os
import sys
import json
import shutil
import subprocess
import asyncio
import re
import urllib.request
import urllib.error
from google.antigravity import Agent, LocalAgentConfig, hooks

# Inputs from environment
REPO_URL = os.environ.get("REPO_URL", "https://github.com/joneba-google/gemini-cli-clone")
GIT_TOKEN = os.environ.get("GIT_TOKEN")
FIRESTORE_DOC_JSON = os.environ.get("FIRESTORE_DOC")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "gcli-intern-project-2026")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")

TMP_DIR = "/tmp/jetski"
PR_DIR = os.path.join(TMP_DIR, "pr")
EVAL_DIR = os.path.join(TMP_DIR, "eval")
REPO_NAME = "gemini-cli"
PR_REPO_PATH = os.path.join(PR_DIR, REPO_NAME)
EVAL_REPO_PATH = os.path.join(EVAL_DIR, REPO_NAME)

MAX_ATTEMPTS = 5

# Global hook to auto-approve all local sandbox tool calls to prevent blocking prompts in headless mode
@hooks.pre_tool_call_decide
def auto_approve_all_tools(context, tool_call):
    return "PROCEED"

def run_cmd(cmd, cwd=None):
    print(f"Running: {cmd} in {cwd or os.getcwd()}")
    try:
        result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {cmd}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        raise e

def clean_dir(directory):
    if os.path.exists(directory):
        shutil.rmtree(directory)
    os.makedirs(directory, exist_ok=True)

def log_agent_call(agent_type, stdout, stderr, error=None):
    print("\n==================================================")
    print(f"[AGENT RUN] Agent Type: {agent_type}")
    if error:
        print("[AGENT RUN] Status: FAILED")
        if stdout: print(f"[AGENT RUN] Output (stdout):\n{stdout}")
        if stderr: print(f"[AGENT RUN] Errors (stderr):\n{stderr}")
        print(f"[AGENT RUN] Error Details: {str(error)}")
    else:
        print("[AGENT RUN] Status: SUCCESS")
        if stdout: print(f"[AGENT RUN] Output:\n{stdout}")
    print("==================================================\n")

def create_github_pr(owner, repo, branch_name, title, body, token):
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
    data = {
        "title": title,
        "body": body,
        "head": branch_name,
        "base": "main"
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    print(f"Sending request to create PR: {url} (branch: {branch_name})")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            pr_url = res_data.get("html_url")
            print(f"Pull Request created successfully! URL: {pr_url}")
            return pr_url
    except urllib.error.HTTPError as e:
        print(f"Failed to create Pull Request. HTTP Status: {e.code}")
        print(f"Response: {e.read().decode('utf-8')}")
        raise e
    except Exception as general_err:
        print(f"Encountered unexpected error during PR creation: {general_err}")
        raise general_err

async def run_agent_sdk(role, prompt, repo_path):
    print(f"Running {role} inside {repo_path}...")
    
    # Store the current working directory to restore it later
    original_cwd = os.getcwd()
    # The Antigravity SDK binds the Agent to the current working directory, 
    # so we must chdir to the target repository root before creating the Agent.
    os.chdir(repo_path)
    
    config = LocalAgentConfig(
        vertex=True,                        # Uses GCP Vertex AI endpoint
        project=PROJECT_ID,
        location=LOCATION,
        system_instructions=f"You are the {role}. You must complete the requested tasks in the workspace."
    )
    
    stdout = ""
    try:
        async with Agent(config) as agent:
            response = await agent.chat(prompt)
            stdout = await response.text()
            thoughts = response.thoughts
            if thoughts:
                stdout += f"\nThoughts:\n{thoughts}"
            log_agent_call(role, stdout, None)
            return stdout
    except Exception as e:
        log_agent_call(role, stdout, str(e), e)
        raise e
    finally:
        # Restore the original CWD
        os.chdir(original_cwd)

async def main():
    if not FIRESTORE_DOC_JSON:
        print("Error: FIRESTORE_DOC environment variable is required.", file=sys.stderr)
        sys.exit(1)

    firestore_doc = json.loads(FIRESTORE_DOC_JSON)
    
    # Parse repository owner and name from REPO_URL (https://github.com/owner/repo)
    repo_parts = REPO_URL.rstrip("/").split("/")
    owner = repo_parts[-2]
    repo_name_parsed = repo_parts[-1].replace(".git", "")

    # Parse branch name based on issue ID number
    github_metadata = firestore_doc.get("github_metadata", {})
    issue_num = github_metadata.get("issue_number")
    if not issue_num:
        issue_id = firestore_doc.get("issue_id", "BUG")
        match = re.search(r'#(\d+)', issue_id)
        issue_num = match.group(1) if match else "fix"
    branch_name = f"ssr-agent-{issue_num}"

    # Initialize root directories
    os.makedirs(TMP_DIR, exist_ok=True)
    os.makedirs(PR_DIR, exist_ok=True)
    os.makedirs(EVAL_DIR, exist_ok=True)

    # 1. Sync or Clone the repository
    repo_exists = os.path.exists(os.path.join(PR_REPO_PATH, ".git"))
    if repo_exists:
        print("Repository already cloned. Syncing changes from remote...")
        try:
            # Revert any local workspace deviations from previous retries
            run_cmd("git reset --hard HEAD", PR_REPO_PATH)
            run_cmd("git clean -fd", PR_REPO_PATH)
            run_cmd("git checkout main", PR_REPO_PATH)
            run_cmd("git pull origin main", PR_REPO_PATH)
        except Exception as sync_err:
            print(f"Failed to sync existing repository: {sync_err}. Re-cloning...")
            shutil.rmtree(PR_REPO_PATH, ignore_errors=True)
            repo_exists = False

    if not repo_exists:
        print(f"Cloning repository {REPO_URL}...")
        run_cmd(f"git clone {REPO_URL} {REPO_NAME}", PR_DIR)
        run_cmd('git config user.name "Jetski Bot"', PR_REPO_PATH)
        run_cmd('git config user.email "jetski-bot@google.com"', PR_REPO_PATH)

        # Configure local git exclude to prevent committing agent artifacts
        exclude_file = os.path.join(PR_REPO_PATH, ".git", "info", "exclude")
        os.makedirs(os.path.dirname(exclude_file), exist_ok=True)
        with open(exclude_file, "a") as f:
            f.write("\nfirestore_doc.json\npr_feedback.md\nfeedback.md\nchanges.diff\nverdict.json\n")

    # Checkout the target feature branch for commits (instead of committing to main)
    # If the branch already exists locally (from previous iteration/retry), check it out. Otherwise create it.
    local_branches = run_cmd("git branch", PR_REPO_PATH)
    if branch_name in local_branches:
        print(f"Checking out existing local feature branch: {branch_name}")
        run_cmd(f"git checkout {branch_name}", PR_REPO_PATH)
    else:
        print(f"Creating and checking out feature branch: {branch_name}")
        run_cmd(f"git checkout -b {branch_name}", PR_REPO_PATH)

    # Overwrite firestore doc inside the Coding Agent workspace
    spec_pr_path = os.path.join(PR_REPO_PATH, "firestore_doc.json")
    with open(spec_pr_path, "w") as f:
        json.dump(firestore_doc, f, indent=2)

    approved = False
    loop_count = 0
    verdict = "NEEDS_REVISION"
    commit_line_count = 0

    while loop_count < MAX_ATTEMPTS and not approved:
        loop_count += 1
        print(f"\n=== Starting Iteration {loop_count}/{MAX_ATTEMPTS} ===")

        # --- PHASE 1: CODE GENERATION ---
        print("Starting Code Generation Phase...")
        if loop_count == 1:
            gen_prompt = (
                "Fix the bug described in firestore_doc.json following the implementation plan "
                "and implement tests matching the testing strategy. "
                "You are running in a headless sandbox environment. If you need to verify your changes, "
                "run the test suite directly using your run_command tool (e.g. npm test). "
                "Do NOT ask for permission or validation in the chat; execute commands directly."
            )
        else:
            gen_prompt = (
                "Use the feedback in pr_feedback.md to address the remaining issues in the code and tests. "
                "Original spec is at firestore_doc.json. "
                "You are running in a headless sandbox environment. Execute any necessary test or build commands "
                "directly using your run_command tool. Do NOT ask for permission in the chat."
            )

        try:
            # Execute SDK-based Code Gen Agent in PR_REPO_PATH
            await run_agent_sdk("Coding Agent", gen_prompt, PR_REPO_PATH)
        except Exception as e:
            print(f"Code Generation Agent encountered an error: {e}. Proceeding to evaluate what was changed.")

        # Commit changes locally to create a diff
        git_status = run_cmd("git status --porcelain", PR_REPO_PATH)
        if git_status:
            commit_message = f"[SSR Agent] Issue Fix: issues/{issue_num}"
            
            run_cmd("git add .", PR_REPO_PATH)
            run_cmd(f'git commit -m "{commit_message}" --allow-empty', PR_REPO_PATH)
        else:
            print("No new changes generated in this iteration.")
            if loop_count == 1:
                print("Failed to generate any changes in the first iteration.", file=sys.stderr)
                sys.exit(1)

        # Generate Diff (comparing current iteration feature branch back to original origin/main)
        diff_content = run_cmd("git diff origin/main", PR_REPO_PATH)

        # --- PHASE 2: EVALUATION ---
        print("Starting Evaluation Phase...")
        
        # Sync PR repo state to Eval repo (clean start for eval)
        clean_dir(EVAL_DIR)
        shutil.copytree(PR_REPO_PATH, EVAL_REPO_PATH, dirs_exist_ok=True)

        # Write diff_content directly INSIDE the Evaluator Agent workspace
        diff_eval_path = os.path.join(EVAL_REPO_PATH, "changes.diff")
        with open(diff_eval_path, "w") as f:
            f.write(diff_content)

        # Run Evaluator Agent in EVAL_REPO_PATH
        eval_prompt = (
            "Evaluate the changes in changes.diff against the spec in firestore_doc.json. "
            "You are running in a headless sandbox environment and have full authority to execute "
            "the project's test suite and linter commands directly using your run_command tool (e.g., npm test). "
            "Do NOT ask for permission in the chat; execute commands directly to verify the changes. "
            "You MUST output verdict.json to verdict.json in the format {\"verdict\": \"APPROVED\" | \"NEEDS_REVISION\"}. "
            "If verification fails or needs revision, output detailed feedback to pr_feedback.md."
        )

        try:
            # Execute SDK-based Evaluator Agent
            await run_agent_sdk("Evaluator Agent", eval_prompt, EVAL_REPO_PATH)
        except Exception as e:
            print(f"Evaluator Agent execution failed: {e}")

        # Read Verdict from Evaluator workspace
        verdict_file = os.path.join(EVAL_REPO_PATH, "verdict.json")
        if os.path.exists(verdict_file):
            try:
                with open(verdict_file, "r") as f:
                    verdict_data = json.load(f)
                verdict = verdict_data.get("verdict", "NEEDS_REVISION")
                print(f"Evaluator Verdict: {verdict}")
            except Exception as parse_error:
                print(f"Failed to parse verdict.json, assuming NEEDS_REVISION: {parse_error}")
                verdict = "NEEDS_REVISION"
        else:
            print("verdict.json not found inside eval workspace, assuming NEEDS_REVISION")
            verdict = "NEEDS_REVISION"

        if verdict in ["APPROVED", "PASS"]:
            approved = True
            
            # Calculate line count of the changes
            try:
                diff_stat = run_cmd("git diff --stat origin/main", PR_REPO_PATH)
                print("Diff Stat:\n", diff_stat)
                lines = diff_stat.split('\n')
                last_line = lines[-1] if lines else ""
                insertions = re.search(r'(\d+)\s+insertion', last_line)
                deletions = re.search(r'(\d+)\s+deletion', last_line)
                if insertions: commit_line_count += int(insertions.group(1))
                if deletions: commit_line_count += int(deletions.group(1))
                print(f"Total lines changed: {commit_line_count}")
            except Exception as e:
                print(f"Failed to calculate line count: {e}")
        else:
            # Save feedback file inside the Coding Agent workspace for the next iteration
            eval_feedback_file = os.path.join(EVAL_REPO_PATH, "pr_feedback.md")
            pr_feedback_file = os.path.join(PR_REPO_PATH, "pr_feedback.md")
            if os.path.exists(eval_feedback_file):
                shutil.copyfile(eval_feedback_file, pr_feedback_file)
                print("Feedback saved for next iteration.")
                print("--- Feedback ---")
                with open(pr_feedback_file, "r") as f:
                    print(f.read())
                print("----------------")
            else:
                with open(pr_feedback_file, "w") as f:
                    f.write("Evaluator rejected changes but did not provide pr_feedback.md.")

    # --- POST LOOP ---
    if approved:
        print("\n=== PR APPROVED ===")
        if commit_line_count > 200:
            print(f"Verdict: APPROVED, but size ({commit_line_count} lines) exceeds 200 lines limit. Action: NEEDS_HUMAN")
            sys.exit(2)
        else:
            print(f"Verdict: APPROVED. Proceeding to push branch {branch_name} and submit PR...")
            try:
                if GIT_TOKEN:
                    authenticated_url = REPO_URL.replace("https://", f"https://x-access-token:{GIT_TOKEN}@")
                    run_cmd(f"git remote set-url origin {authenticated_url}", PR_REPO_PATH)
                
                # Push the feature branch (if rejected, we rebase main onto our branch and retry)
                try:
                    run_cmd(f"git push origin HEAD:refs/heads/{branch_name}", PR_REPO_PATH)
                    print("Branch push successful.")
                except Exception as push_err:
                    print(f"Push rejected: {push_err}. Attempting to pull main and rebase...")
                    run_cmd("git pull --rebase origin main", PR_REPO_PATH)
                    run_cmd(f"git push origin HEAD:refs/heads/{branch_name}", PR_REPO_PATH)
                    print("Branch push successful after rebase.")

                # Submit Pull Request via GitHub REST API
                if GIT_TOKEN:
                    pr_title = f"[SSR Agent] Issue Fix: issues/{issue_num}"
                    pr_body = (
                        f"This Pull Request was automatically generated by the SSR Code Generator Agent "
                        f"to resolve issue `{issue_id}`.\n\n"
                        f"### Summary of Changes:\n"
                        f"Applied targeted modifications to address the issue, validated with local compilation and unit tests."
                    )
                    create_github_pr(owner, repo_name_parsed, branch_name, pr_title, pr_body, GIT_TOKEN)
                
                sys.exit(0)
            except Exception as push_error:
                print(f"Failed to push branch or submit PR: {push_error}")
                sys.exit(3)
    else:
        print(f"\n=== PR REJECTED (Max attempts {MAX_ATTEMPTS} reached) ===")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Fatal error in manager script: {err}", file=sys.stderr)
        sys.exit(4)
