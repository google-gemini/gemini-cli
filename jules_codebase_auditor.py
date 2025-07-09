from colorama import init, Fore, Style
import json
import os
import subprocess

init()

# Path to the external AI script (e.g., a wrapper for Gemini API)
AI_SCRIPT_PATH = os.path.join(os.environ['HOME'], 'bin', 'ai-v4.0.sh')

# The core prompt configuration for Google Jules AI
JULES_PROMPT_JSON = {
    "version": "1.3",
    "ai_persona": "Google Jules, an elite AI codebase reviewer and improver optimized for Termux and Linux environments.",
    "interactive": False,
    "logging_level": "info",
    "language_support": ["bash", "python", "rust", "javascript", "yaml", "json"],
    "prompt": "Audit the provided codebase for correctness, security, performance, style, architecture, and DevOps readiness. Apply smart improvements automatically and generate any missing helper assets described below.",
    "preconditions": {
        "must_contain_root": True,
        "env_check": ".env or .env.example must exist",
        "entrypoints": ["main.py", "index.js", "src/main.rs", "bootstrap.sh"]
    },
    "sections": {
        "audit_criteria": [
            {"category": "Correctness", "description": "No runtime exceptions or logic errors."},
            {"category": "Security", "description": "Sanitise inputs, protect secrets, CVE‑free deps."},
            {"category": "Performance", "description": "Avoid blocking, redundant ops, O(N²) loops."},
            {"category": "Readability", "description": "Idiomatic style (PEP\n8, Clippy, Prettier)."},
            {"category": "Architecture", "description": "SOLID, modular, dead‑code removal."},
            {"category": "Dev-X", "description": "Reliable setup, docs, onboarding UX."},
            {"category": "CI/CD", "description": "Fast‑fail, cache‑aware workflows."},
            {"category": "Testing", "description": "Edge‑case coverage, no flakiness."
            }
        ],
        "code_modularity_rules": [
            "Split logic into focused functions & modules",
            "Use env vars over hard‑coded paths",
            "Keep each function small"
        ],
        "language_policies": {
            "bash": ["set -euo pipefail", "POSIX compliant", "shellcheck clean"],
            "python": ["type‑hints", "mypy strict", "structlog logging"],
            "rust": ["2024 edition", "clippy clean", "#![deny(warnings)]"],
            "js": ["ES6+", "Prettier", "async/await over callbacks"]
        },
        "requirement_pinning": True,
        "dependency_checks": ["requirements.txt", "Cargo.lock", "package.json"],
        "doc_update_policy": {
            "when_to_update": "New flags, APIs, or changed behaviour",
            "files": ["README.md", "USAGE.md"]
        },
        "output_spec": {
            "format": "markdown",
            "file_block_template": "#### {{path}}\n{{lang}}\n{{code}}\n\n Why it changed: {{reason}}",
            "changelog": {
                "format": ["✨ Feature", " Fix", " Refactor", " Perf", "️ Security"],
                "default_commit_message": "refactor: automated audit & improvement pass"
            }
        },
        "test_commands": [
            "pytest -q",
            "cargo test --release",
            "./scripts/test_all.sh",
            "ruff check .",
            "shellcheck **/.sh"
        ],
        "max_iterations": 3,
        "error_policy": {
            "on_error": "retry up to max_iterations",
            "on_final_failure": "report error, skip file"
        },
        "postconditions": {
            "all_tests_pass": True,
            "no_lint_errors": True,
            "all_outputs_documented": True
        },
        "security_filters": {
            "redact_keys": True,
            "patterns": ["(?i)api[_-]?key", "(?i)secret", "(?i)token"]
        },
        "license_check": {
            "allowed": ["MIT", "Apache-2.0"],
            "flag_incompatible": True
        },
        "exclude_paths": [".git", "node_modules", "venv", "dist", "pycache"],
        "formatting": {
            "neon": True,
            "termux_ux": True
        },
        "bootstrap_scripts": [
            {
                "path": "scripts/jules-audit.sh",
                "executable": True,
                "language": "bash",
                "content": "#!/data/data/com.termux/files/usr/bin/bash\nset -euo pipefail\n\n# === CONFIG ===\nPROMPT_FILE=\"${HOME}/jules_prompt.json\"\nJULES_API_SCRIPT=\"${HOME}/bin/ai-v4.0.sh\" # Adjust if needed\nPROJECT_ROOT=\"$(git rev-parse --show-toplevel 2>/dev/null || echo $PWD)\"\n\n# === STYLE ===\ncyan=\"\\033[1;36m\"\ngreen=\"\\033[1;32m\"\nred=\"\\033[1;31m\"\nreset=\"\\033[0m\"\n\necho -e \"${cyan} Google Jules AI - Autonomous Codebase Auditor${reset}\"\necho -e \"${green}→ Project Root: ${PROJECT_ROOT}${reset}\"\n\n# --- Checks ---\n[[ -f \"$PROMPT_FILE\" ]] || { echo -e \"${red}✖ Prompt file not found: $PROMPT_FILE${reset}\"; exit 1; }\n[[ -x \"$JULES_API_SCRIPT\" ]] || { echo -e \"${red}✖ Gemini API script not executable: $JULES_API_SCRIPT${reset}\"; exit 1; }\n\n# --- Build code payload ---\necho -e \"${cyan} Building input payload...${reset}\"\nCODE_PAYLOAD=$(find \"$PROJECT_ROOT\" \\\n -type f \\\n -not -path '/\\.' \\\n -not -path '/node_modules/' \\\n -not -path '/pycache/' \\\n -not -path '/dist/*' \\\n -exec echo -e \"\\n### {} ###\\n\" \\\n -exec cat {} \\\n | awk '{ printf \"%s\\n\", $0 }' | sed 's/\"/\\\\\"/g')\n\n# --- Final JSON ---\nFINAL_PAYLOAD=$(jq -n --argjson prompt \"$(cat \"$PROMPT_FILE\")\" --arg code \"$CODE_PAYLOAD\" '{prompt: $prompt, source_code: $code}')\n\n# --- Send to Gemini ---\necho -e \"${green} Auditing with Jules...${reset}\"\necho \"$FINAL_PAYLOAD\" | \"$JULES_API_SCRIPT\" --json --model gemini-pro\n\necho -e \"${green}✅ Audit complete.${reset}\n"
            }
        ],
        "example_usage": "chmod +x scripts/jules-audit.sh && scripts/jules-audit.sh"
    }
}

def get_project_root():
    """Determines the project root, preferring git top-level or current working directory."""
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--show-toplevel'],
            capture_output=True,
            text=True,
            check=True,
            cwd=os.getcwd()
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return os.getcwd()

def collect_code_files(root_dir, exclude_paths):
    """Collects code files from the project, excluding specified paths."""
    code_payload_parts = []
    abs_exclude_paths = [os.path.abspath(os.path.join(root_dir, p)) for p in exclude_paths]

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Filter out excluded directories in-place
        dirnames[:] = [d for d in dirnames if os.path.abspath(os.path.join(dirpath, d)) not in abs_exclude_paths]

        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            abs_file_path = os.path.abspath(file_path)

            # Skip files within excluded paths
            if any(abs_file_path.startswith(ex_path) for ex_path in abs_exclude_paths):
                continue

            _, ext = os.path.splitext(filename)
            lang = ext.lstrip('.').lower()
            if not lang:
                lang = 'plaintext' # Default to plaintext if no extension

            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    # Escape double quotes for JSON payload
                    escaped_content = content.replace('"', '\"')
                    # Append file content with metadata for the AI
                    code_payload_parts.append(f"\n### {os.path.relpath(file_path, root_dir)} ###\n{lang}\n{content}\n")
            except Exception as e:
                print(Fore.RED + f"✖ Error reading file {file_path}: {e}" + Style.RESET_ALL)
    return "".join(code_payload_parts)

def create_jules_payload(prompt_data, code_content):
    """Constructs the final JSON payload for the AI script."""
    payload = {
        "prompt": prompt_data,
        "source_code": code_content
    }
    return json.dumps(payload, indent=2)

def save_prompt_to_file(prompt_data, file_path):
    """Saves the Jules prompt configuration to a JSON file."""
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(prompt_data, f, indent=2)
        print(Fore.GREEN + f"✅ Prompt saved to {file_path}" + Style.RESET_ALL)
        return True
    except Exception as e:
        print(Fore.RED + f"✖ Failed to save prompt to {file_path}: {e}" + Style.RESET_ALL)
        return False

def execute_ai_script(payload):
    """Executes the external AI script with the prepared payload."""
    if not os.path.exists(AI_SCRIPT_PATH):
        print(Fore.RED + f"✖ AI script not found at: {AI_SCRIPT_PATH}" + Style.RESET_ALL)
        print(Fore.YELLOW + "Please ensure the AI script is in your PATH or update AI_SCRIPT_PATH." + Style.RESET_ALL)
        return

    if not os.access(AI_SCRIPT_PATH, os.X_OK):
        print(Fore.RED + f"✖ AI script is not executable: {AI_SCRIPT_PATH}" + Style.RESET_ALL)
        print(Fore.YELLOW + "Please make it executable with: chmod +x " + AI_SCRIPT_PATH + Style.RESET_ALL)
        return

    print(Fore.CYAN + " Invoking Jules with the codebase..." + Style.RESET_ALL)
    try:
        process = subprocess.Popen(
            [AI_SCRIPT_PATH, '--json', '--model', 'gemini-pro'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8'
        )
        stdout, stderr = process.communicate(input=payload)

        if process.returncode == 0:
            print(Fore.GREEN + "✅ Jules has completed its audit!" + Style.RESET_ALL)
            print(Fore.YELLOW + "--- Audit Output ---" + Style.RESET_ALL)
            print(stdout)
        else:
            print(Fore.RED + f"✖ Jules encountered an error (Exit Code: {process.returncode}):" + Style.RESET_ALL)
            print(Fore.RED + stderr + Style.RESET_ALL)

    except FileNotFoundError:
        print(Fore.RED + f"✖ Error: The AI script '{AI_SCRIPT_PATH}' was not found." + Style.RESET_ALL)
    except Exception as e:
        print(Fore.RED + f"✖ An unexpected error occurred while running the AI script: {e}" + Style.RESET_ALL)

if __name__ == "__main__":
    print(Fore.CYAN + "✨ Pyrmethus: Summoning Jules for Codebase Audit ✨" + Style.RESET_ALL)

    project_root = get_project_root()
    print(Fore.BLUE + f"→ Project Root Identified: {project_root}" + Style.RESET_ALL)

    exclude_paths = JULES_PROMPT_JSON['sections']['exclude_paths']
    print(Fore.CYAN + " Gathering codebase essence..." + Style.RESET_ALL)
    code_content = collect_code_files(project_root, exclude_paths)
    print(Fore.GREEN + f"✅ Collected {len(code_content.split('###')) - 1} files for audit." + Style.RESET_ALL)

    prompt_file_path = os.path.join(os.environ['HOME'], 'jules_prompt.json')
    if not save_prompt_to_file(JULES_PROMPT_JSON, prompt_file_path):
        print(Fore.RED + "✖ Aborting due to failure in saving prompt file." + Style.RESET_ALL)
        exit(1)

    print(Fore.CYAN + "Constructing the final payload for Jules..." + Style.RESET_ALL)
    final_payload_json = create_jules_payload(JULES_PROMPT_JSON, code_content)

    execute_ai_script(final_payload_json)

    print(Fore.MAGENTA + "\n Pyrmethus's work is done. May your code be ever luminous!" + Style.RESET_ALL)
