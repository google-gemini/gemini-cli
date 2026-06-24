import re

def _assert_keys(parent: dict, key: str, expected_keys: list[str]) -> None:
    """
    Asserts that parent[key] is a dict containing all expected_keys.
    """
    sub_obj = parent.get(key)
    if not isinstance(sub_obj, dict):
        raise ValueError(f"Missing or invalid object '{key}' in workable_spec")
    for subkey in expected_keys:
        if subkey not in sub_obj:
            raise ValueError(f"Missing '{key}' key: {subkey}")

def validate_triage_result(data: dict) -> None:
    """
    Validates the structure of the LLM triage result.
    Ensures required metadata, effort estimates, and nested workable spec schemas are present when quality is OK.
    """
    if "triage_metadata" not in data:
        raise ValueError("Missing 'triage_metadata'")
        
    meta = data["triage_metadata"]
    if meta.get("quality") not in ["SPAM", "EMPTY", "NEEDS_INFO", "FEATURE", "OK"]:
        raise ValueError(f"Invalid or missing 'quality': {meta.get('quality')}")

    if meta.get("quality") == "OK":
        effort = meta.get("effort_estimate")
        if effort not in ["SMALL", "MEDIUM", "LARGE"]:
            raise ValueError(f"Invalid or missing 'effort_estimate': {effort}")

        spec = data.get("workable_spec")
        if not isinstance(spec, dict):
            raise ValueError("Missing 'workable_spec'")
        
        issue_id = spec.get("issue_id")
        if not isinstance(issue_id, str) or not re.match(r"^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+#[0-9]+$", issue_id):
            raise ValueError(f"Invalid or missing 'issue_id' format: {issue_id}")

        _assert_keys(spec, "summary", ["problem", "root_cause", "context"])
        _assert_keys(spec, "implementation_plan", ["files_to_modify", "steps"])
        _assert_keys(spec, "testing_strategy", ["test_file", "expected_behavior", "verification_steps", "framework"])