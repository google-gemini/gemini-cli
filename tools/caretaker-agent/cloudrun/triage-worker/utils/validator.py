import re

def _assert_section_schema(
    spec: dict, section_name: str, expected_schema: dict
) -> None:
    """
    Asserts that spec[section_name] is a dict containing all expected
    field names with their required data types.
    """
    section = spec.get(section_name)
    if not isinstance(section, dict):
        raise ValueError(
            f"Missing or invalid object '{section_name}' in workable_spec"
        )

    for field_name, expected_type in expected_schema.items():
        if field_name not in section:
            raise ValueError(f"Missing '{section_name}' key: {field_name}")

        field_value = section[field_name]
        if isinstance(expected_type, list):
            element_type = expected_type[0]
            valid_list = isinstance(field_value, list) and all(
                isinstance(item, element_type) for item in field_value
            )
            if not valid_list:
                raise ValueError(
                    f"Key '{field_name}' in '{section_name}' must be a list of "
                    f"{element_type.__name__}"
                )
        elif not isinstance(field_value, expected_type):
            raise ValueError(
                f"Key '{field_name}' in '{section_name}' must be of type "
                f"{expected_type.__name__}"
            )

def validate_triage_result(data: dict) -> None:
    """
    Validates the structure of the LLM triage result.
    Expects an already-parsed dictionary (json.loads is called upstream
    by the triage orchestrator before invoking this validator).
    Ensures required metadata, effort estimates, and nested schemas
    are present when quality is OK.
    """
    if "triage_metadata" not in data:
        raise ValueError("Missing 'triage_metadata'")
        
    metadata = data["triage_metadata"]
    valid_qualities = ["SPAM", "EMPTY", "NEEDS_INFO", "FEATURE", "OK"]
    if metadata.get("quality") not in valid_qualities:
        raise ValueError(
            f"Invalid or missing 'quality': {metadata.get('quality')}"
        )

    if metadata.get("quality") == "NEEDS_INFO":
        comment = metadata.get("comment")
        if not isinstance(comment, str) or not comment.strip():
            metadata["comment"] = (
                "Thank you for opening this issue! Additional information (such as "
                "reproduction steps, environment details, or error logs) is required "
                "to help us triage and investigate. Please provide any relevant details "
                "so we can assist you."
            )

    if metadata.get("quality") == "OK":
        effort = metadata.get("effort_estimate")
        if effort not in ["SMALL", "MEDIUM", "LARGE"]:
            raise ValueError(
                f"Invalid or missing 'effort_estimate': {effort}"
            )

        spec = data.get("workable_spec")
        if not isinstance(spec, dict):
            raise ValueError("Missing 'workable_spec'")
        
        issue_id = spec.get("issue_id")
        pattern = r"^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+#[0-9]+$"
        valid_id = isinstance(issue_id, str) and bool(
            re.match(pattern, issue_id)
        )
        if not valid_id:
            raise ValueError(
                f"Invalid or missing 'issue_id' format: {issue_id}"
            )

        _assert_section_schema(spec, "summary", {
            "problem": str,
            "root_cause": str,
            "context": str,
        })
        _assert_section_schema(spec, "implementation_plan", {
            "files_to_modify": [str],
            "steps": [str],
        })
        _assert_section_schema(spec, "testing_strategy", {
            "test_file": str,
            "expected_behavior": str,
            "verification_steps": [str],
            "framework": str,
        })