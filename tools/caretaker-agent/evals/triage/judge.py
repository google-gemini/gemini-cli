"""
Evaluation Judge Module for Gemini CLI Triage Worker.

Provides evaluation functions:
1. evaluate_categorization: Exact match string evaluation for quality & effort.
2. judge_workable_spec: LLM-as-a-Judge grading for Workable Specs matching Golden Spec fidelity (0-2 Rubric Scale) via Gemini API.
"""

import os
import json
from pathlib import Path
from typing import Any, Dict
from dotenv import load_dotenv

load_dotenv()

from google import genai

PROMPT_FILE = Path(__file__).parent / "judge.md"
if not PROMPT_FILE.exists():
    raise FileNotFoundError(f"Required judge.md prompt file missing from {PROMPT_FILE.parent}")

with open(PROMPT_FILE, "r", encoding="utf-8") as f:
    JUDGE_PROMPT = f.read()

_CLIENT: Any = None


def _get_client() -> genai.Client:
    """Returns thread-safe cached Gemini API client instance."""
    global _CLIENT
    if _CLIENT is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        _CLIENT = genai.Client(api_key=api_key)
    return _CLIENT


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

    system_instruction = JUDGE_PROMPT

    prompt = f"""Golden Spec Target:
{json.dumps(golden_spec, indent=2)}

Predicted Candidate Spec:
{json.dumps(predicted_spec, indent=2)}"""

    try:
        client = _get_client()
        
        response_schema = {
            "type": "OBJECT",
            "properties": {
                "target_files_score": {"type": "INTEGER"},
                "root_cause_and_summary_score": {"type": "INTEGER"},
                "implementation_plan_score": {"type": "INTEGER"},
                "testing_strategy_score": {"type": "INTEGER"},
                "reasoning": {
                    "type": "OBJECT",
                    "properties": {
                        "target_files": {"type": "STRING"},
                        "root_cause": {"type": "STRING"},
                        "implementation_plan": {"type": "STRING"},
                        "testing_strategy": {"type": "STRING"},
                    },
                    "required": ["target_files", "root_cause", "implementation_plan", "testing_strategy"],
                },
            },
            "required": [
                "target_files_score",
                "root_cause_and_summary_score",
                "implementation_plan_score",
                "testing_strategy_score",
                "reasoning",
            ],
        }

        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config={
                "system_instruction": system_instruction,
                "response_mime_type": "application/json",
                "response_schema": response_schema
            }
        )

        res = json.loads(response.text.strip())

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
