"""
Golden Workable Spec Generator Module.

Uses the Antigravity SDK (google.antigravity) to synthesize a clean, high-precision
Workable Spec JSON directly from Issue and PR Diff text using generate_golden_spec.md.
"""

import re
import os
import sys
import json
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Ensure project root is in sys.path for triage_worker imports
PROJECT_ROOT = str(Path(__file__).resolve().parents[4])
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

load_dotenv(Path(PROJECT_ROOT) / ".env")

from cloudrun.triage_worker.utils.validator import validate_triage_result
from cloudrun.triage_worker.utils.agent_logger import extract_final_output
from google.antigravity import Agent, LocalAgentConfig
from google.antigravity.hooks.policy import deny

PROMPT_FILE = Path(__file__).parent / "generate_golden_spec.md"


def load_system_instruction() -> str:
    """Loads prompt instructions from generate_golden_spec.md."""
    if not PROMPT_FILE.exists():
        raise FileNotFoundError(f"Required prompt file missing at: {PROMPT_FILE}")
    with open(PROMPT_FILE, "r", encoding="utf-8") as f:
        return f.read()


def generate_golden_spec(owner: str, repo: str, issue_number: int, issue_data: dict, pr_data: dict) -> dict:
    """
    Invokes the Antigravity SDK (google.antigravity) Agent using generate_golden_spec.md
    instructions to synthesize a clean, high-precision Workable Spec JSON and its rationale.
    Returns a dict with keys: 'workable_spec' and 'golden_spec_rationale'.
    """
    system_instruction = load_system_instruction()

    # Filter out lockfiles and non-code noise from diff preview
    raw_diff = pr_data.get("diff", "")
    filtered_diff_lines = []
    skip_file = False
    for line in raw_diff.split("\n"):
        if line.startswith("diff --git"):
            if any(x in line for x in ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]):
                skip_file = True
            else:
                skip_file = False
        if not skip_file:
            filtered_diff_lines.append(line)
    
    filtered_diff = "\n".join(filtered_diff_lines)

    prompt = f"""Target Issue & PR Data for {owner}/{repo}#{issue_number}:

Issue #{issue_number} Title: {issue_data.get('title', '')}
Issue Description / Body:
{issue_data.get('body', '')}

PR #{pr_data.get('number', '')} Title: {pr_data.get('title', '')}
PR Body:
{pr_data.get('body', '')}

PR Filtered Code Diff:
{filtered_diff}"""

    policies = [deny("*")]

    async def run_spec_agent():
        config = LocalAgentConfig(
            system_instructions=system_instruction,
            api_key=os.environ.get("GEMINI_API_KEY"),
            policies=policies,
        )

        print(f"[EVAL] Initializing Antigravity Spec Generator Agent for Issue #{issue_number}...")
        async with Agent(config) as agent:
            response = await agent.chat(prompt)
            resolved_chunks = await response.resolve()
            raw_text = extract_final_output(resolved_chunks).strip()

            # Clean json code block fences if present
            clean_text = raw_text
            if clean_text.startswith("```"):
                lines = clean_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                clean_text = "\n".join(lines).strip()

            try:
                data = json.loads(clean_text, strict=False)
            except Exception:
                cleaned = re.sub(r'\\(?![/"bfnrtu]|u[0-9a-fA-F]{4})', r'\\\\', clean_text)
                try:
                    data = json.loads(cleaned, strict=False)
                except Exception:
                    cleaned_quotes = re.sub(r"(?<!\\)\\'", "'", cleaned)
                    data = json.loads(cleaned_quotes, strict=False)

            golden_spec_rationale = data.get("golden_spec_rationale", "")
            workable_spec = data.get("workable_spec", data)

            payload_to_validate = {
                "triage_metadata": {"quality": "OK", "effort_estimate": "SMALL"},
                "workable_spec": workable_spec
            }
            validate_triage_result(payload_to_validate)
            print("Schema validation successful!")

            return {
                "workable_spec": workable_spec,
                "golden_spec_rationale": golden_spec_rationale
            }

    return asyncio.run(run_spec_agent())
