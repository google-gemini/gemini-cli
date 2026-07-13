"""
Evaluation Judge Module for Gemini CLI Triage Worker.

Provides evaluation functions:
1. evaluate_categorization: Exact match string evaluation for quality & effort.
2. judge_workable_spec: LLM-as-a-Judge grading for Workable Specs matching Golden Spec fidelity (0-2 Rubric Scale) via Gemini API.
"""

import re
import os
import sys
import json
from os.path import abspath, dirname
from typing import Any, Dict
from dotenv import load_dotenv

# Ensure project root and triage_worker directory are in sys.path
PROJECT_ROOT = abspath(os.path.join(dirname(__file__), "..", ".."))
TRIAGE_WORKER_DIR = os.path.join(PROJECT_ROOT, "cloudrun", "triage_worker")

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if TRIAGE_WORKER_DIR not in sys.path:
    sys.path.insert(0, TRIAGE_WORKER_DIR)

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

from google import genai


# =====================================================================
# Categorization Evaluator
# =====================================================================

def evaluate_categorization(predicted: Dict[str, Any], expected: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates quality and effort categorization match against expected values.

    Rules:
    - Quality: Exact match between predicted quality and expected quality.
    - Effort: If expected quality is OK, predicted effort must match expected effort.
              If expected quality is non-OK (SPAM, NEEDS_INFO, FEATURE), predicted effort must be empty ("").
    """
    pred_quality = predicted.get("quality")
    exp_quality = expected.get("expected_quality")
    
    # 1. Quality match check
    quality_match = (pred_quality == exp_quality)

    # 2. Effort match check
    pred_effort = predicted.get("effort_estimate")
    exp_effort = expected.get("expected_effort")

    if exp_quality == "OK":
        effort_match = (pred_effort == exp_effort)
    else:
        effort_match = (pred_effort == "")

    return {
        "quality_match": quality_match,
        "predicted_quality": pred_quality,
        "expected_quality": exp_quality,
        "effort_match": effort_match,
        "predicted_effort": pred_effort,
        "expected_effort": exp_effort,
    }


# =====================================================================
# LLM-as-a-Judge Workable Spec Evaluator (Golden Spec Alignment Rubric)
# =====================================================================

def judge_workable_spec(predicted_spec: Dict[str, Any], golden_spec: Dict[str, Any]) -> Dict[str, Any]:
    """
    Uses direct Gemini API (gemini-flash-latest) to evaluate a candidate Workable Spec
    against a ground-truth Golden Workable Spec using a 4-criterion 0-2 Rubric measuring Golden Spec alignment.
    """
    default_reasoning = {
        "target_files": "Missing predicted or golden workable spec.",
        "root_cause": "Missing predicted or golden workable spec.",
        "implementation_plan": "Missing predicted or golden workable spec.",
        "testing_strategy": "Missing predicted or golden workable spec."
    }

    if not predicted_spec or not golden_spec:
        return {
            "target_files_score": 0,
            "root_cause_and_summary_score": 0,
            "implementation_plan_score": 0,
            "testing_strategy_score": 0,
            "total_points": 0,
            "max_points": 8,
            "spec_score_pct": 0.0,
            "reasoning": default_reasoning
        }

    system_instruction = """You are an impartial AI evaluation judge. Your task is to evaluate a candidate Workable Spec produced by an automated triage bot by comparing it against a curated, ground-truth Golden Workable Spec using a 4-criterion Rubric rated on a 0 to 2 scale.

SCALE DEFINITIONS:
- 0 (Not Met / Inaccurate / Missing): The candidate spec misses key target files, proposes an incorrect or hand-wavy solution (e.g., "explore index.ts"), or completely fails to match the Golden Spec.
- 1 (Partially Met / High-Level): The candidate spec identifies the correct general files and general solution, but lacks specific steps, clarity, or alignment present in the Golden Spec.
- 2 (Fully Met / Excellent Match): The candidate spec accurately identifies the target files, aligns closely with the root cause and step-by-step implementation plan in the Golden Spec, and provides clear, actionable instructions.

GENERIC FAIRNESS RULE: Human PRs often include additional refactoring or un-reported edge-case fixes. Do NOT penalize a candidate spec for omitting extra refactoring that goes beyond the reported issue scope. Evaluate based on whether the candidate correctly solves the reported issue problem and matches the Golden Spec's core targets.

STRICT GROUND-TRUTH RULE: You do NOT have access to the codebase. Evaluate the candidate spec STRICTLY by comparing its contents against the Golden Spec target.

EVALUATE ACROSS THESE 4 GOLDEN-SPEC MATCH CRITERIA (Score 0, 1, or 2 for each):

1. target_files_score (0-2): Does the candidate spec accurately identify the target source files to modify matching the Golden Spec (without missing key files, using generic placeholders like index.ts, or improperly leaking test files like *.test.ts into implementation_plan.files_to_modify)?
2. root_cause_and_summary_score (0-2): Does the candidate's problem statement and root cause analysis accurately identify the underlying defect or error? (Focus strictly on diagnostic accuracy, not fix design).
3. implementation_plan_score (0-2): Does the step-by-step implementation plan outline clear, actionable steps that align with the solution strategy in the Golden Spec?
4. testing_strategy_score (0-2): Does the testing strategy match the test file, expected behavior, and verification steps in the Golden Spec (or correctly identify that no automated test file is needed if the Golden Spec specifies N/A)?

Output ONLY a raw JSON object with concise explanations per criterion:
{
  "target_files_score": <0|1|2>,
  "root_cause_and_summary_score": <0|1|2>,
  "implementation_plan_score": <0|1|2>,
  "testing_strategy_score": <0|1|2>,
  "reasoning": {
    "target_files": "<Concise 1-sentence explanation of target_files_score>",
    "root_cause": "<Concise 1-sentence explanation of root_cause_and_summary_score>",
    "implementation_plan": "<Concise 1-sentence explanation of implementation_plan_score>",
    "testing_strategy": "<Concise 1-sentence explanation of testing_strategy_score>"
  }
}"""

    prompt = f"""Golden Spec Target:
{json.dumps(golden_spec, indent=2)}

Predicted Candidate Spec:
{json.dumps(predicted_spec, indent=2)}"""

    try:
        api_key = os.environ.get("GEMINI_API_KEY")
        client = genai.Client(api_key=api_key)
        
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config={
                "system_instruction": system_instruction,
                "response_mime_type": "application/json"
            }
        )

        raw_text = response.text.strip()
        try:
            res = json.loads(raw_text)
        except Exception:
            cleaned = re.sub(r"(?<!\\)\\'", "'", raw_text)
            res = json.loads(cleaned)

        tfs = int(res.get("target_files_score", 0))
        rcs = int(res.get("root_cause_and_summary_score", 0))
        ips = int(res.get("implementation_plan_score", 0))
        tss = int(res.get("testing_strategy_score", 0))

        total_points = tfs + rcs + ips + tss
        max_points = 8
        score_pct = round((total_points / float(max_points)) * 100.0, 1)

        reasoning = res.get("reasoning", {})
        if not isinstance(reasoning, dict):
            reasoning = {"summary": str(reasoning)}

        res["target_files_score"] = tfs
        res["root_cause_and_summary_score"] = rcs
        res["implementation_plan_score"] = ips
        res["testing_strategy_score"] = tss
        res["total_points"] = total_points
        res["max_points"] = max_points
        res["spec_score_pct"] = score_pct
        res["reasoning"] = reasoning
        return res

    except Exception as e:
        print(f"  ❌ [JUDGE ERROR] {e}")
        return {
            "target_files_score": 0,
            "root_cause_and_summary_score": 0,
            "implementation_plan_score": 0,
            "testing_strategy_score": 0,
            "total_points": 0,
            "max_points": 8,
            "spec_score_pct": 0.0,
            "reasoning": {
                "error": f"Judge execution error: {e}"
            }
        }
