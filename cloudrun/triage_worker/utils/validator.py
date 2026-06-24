def validate_triage_result(data: dict) -> None:
    """
    This can be fleshed out more to not only validate structure
    """
    if "triage_metadata" not in data:
        raise ValueError("Missing 'triage_metadata'")
        
    meta = data["triage_metadata"]
    if meta.get("quality") == "OK":
        if "workable_spec" not in data:
            raise ValueError("Missing 'workable_spec'")
        
        spec = data["workable_spec"]
        required_keys = ["issue_id", "summary", "implementation_plan", "testing_strategy"]
        for key in required_keys:
            if key not in spec:
                raise ValueError(f"Missing spec key: {key}")