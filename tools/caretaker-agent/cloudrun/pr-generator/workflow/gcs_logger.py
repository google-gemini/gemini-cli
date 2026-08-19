# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""GCS Logging and Artifact Preservation Utility.

Uploads agent execution trajectory logs, git diff patches, and PR details to
the designated Google Cloud Storage (GCS) debug bucket: pr_generation_debug_logs.
"""

import datetime
import json
import logging
import os
from typing import Any

try:
    from google.cloud import storage
except ImportError:
    storage = None


BUCKET_NAME = os.environ.get("PR_GEN_DEBUG_LOGS_BUCKET", "pr_generation_debug_logs")

logger = logging.getLogger("Orchestrator")


def _get_utc_timestamp() -> str:
    """Returns current UTC timestamp formatted as YYYYMMDD_HHMMSS."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")


def _parse_repo_slug(
    owner: str | None, repo: str | None, repo_url: str | None = None
) -> tuple[str, str]:
    """Parses repo author and repo name from metadata or repository URL."""
    if owner and repo:
        return owner, repo
    if repo_url:
        clean_url = repo_url.rstrip("/").replace(".git", "")
        parts = clean_url.split("/")
        if len(parts) >= 2:
            return parts[-2], parts[-1]
    return "unknown_owner", "unknown_repo"


def _get_target_bucket_name() -> str:
    """Returns target bucket name, using eval bucket if in eval mode, else debug log bucket."""
    if os.environ.get("EVAL_GCS_RUN_NAME"):
        return os.environ.get("PR_GEN_EVAL_RESULTS_BUCKET", "pr-generation-eval-results")
    return os.environ.get("PR_GEN_DEBUG_LOGS_BUCKET", "pr_generation_debug_logs")


def upload_to_bucket(
    blob_path: str, payload: str, content_type: str = "text/plain"
) -> bool:
    """Uploads a string payload directly to the designated GCS bucket.

    Args:
        blob_path: Relative key path inside the GCS bucket.
        payload: String data content to upload.
        content_type: MIME content type string.

    Returns:
        True if successfully uploaded, False otherwise.
    """
    if os.environ.get("DISABLE_GCS_LOGGING", "").lower() in ("1", "true", "yes"):
        return False

    bucket_name = _get_target_bucket_name()
    if not bucket_name:
        logger.info(
            "[GCS Logger] Target GCS bucket name not set. Skipping GCS upload."
        )
        return False

    if storage is None:
        logger.warning(
            "[GCS Logger] google.cloud.storage is not available. Skipping GCS upload."
        )
        return False

    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(payload, content_type=content_type)
        logger.info(
            "[GCS Logger] Uploaded artifact to gs://%s/%s", bucket_name, blob_path
        )
        return True
    except Exception as e:
        logger.warning(
            "[GCS Logger] Failed to upload artifact to GCS (gs://%s/%s): %s",
            bucket_name,
            blob_path,
            e,
        )
        return False


def serialize_chunks(resolved_chunks: list[Any]) -> str:
    """Serializes Antigravity SDK stream chunks into a clean, consolidated JSON string.

    Merges consecutive 'Text' streaming delta chunks with the same step_index into
    a single consolidated Text entry, while preserving Thought and ToolCall objects.
    """
    if not resolved_chunks:
        return "[]"

    serializable = []
    current_text_chunk: dict[str, Any] | None = None

    for chunk in resolved_chunks:
        try:
            dumped = chunk.model_dump()
        except AttributeError:
            try:
                dumped = chunk.dict()
            except AttributeError:
                dumped = {"raw": str(chunk)}

        chunk_type = chunk.__class__.__name__
        dumped["chunk_type"] = chunk_type

        if chunk_type == "Text":
            step_index = dumped.get("step_index")
            text_val = dumped.get("text", "")
            if (
                current_text_chunk is not None
                and current_text_chunk.get("step_index") == step_index
            ):
                current_text_chunk["text"] += text_val
            else:
                if current_text_chunk is not None:
                    serializable.append(current_text_chunk)
                current_text_chunk = dumped
        else:
            if current_text_chunk is not None:
                serializable.append(current_text_chunk)
                current_text_chunk = None
            serializable.append(dumped)

    if current_text_chunk is not None:
        serializable.append(current_text_chunk)

    return json.dumps(serializable, indent=2, default=str)


def _get_gcs_blob_prefix(owner: str, repo: str, subfolder: str) -> str:
    """Derives GCS blob prefix, using eval run path if in eval mode, else owner_repo."""
    eval_run_name = os.environ.get("EVAL_GCS_RUN_NAME")
    if eval_run_name:
        eval_run_ts = os.environ.get("EVAL_GCS_RUN_TIMESTAMP", "")
        run_folder = f"{eval_run_name}_{eval_run_ts}" if eval_run_ts else eval_run_name
        if subfolder == "git_diffs":
            folder_path = "outputs/diffs"
        elif subfolder == "pr_details":
            folder_path = "outputs/pr_details"
        elif subfolder in ("coding_agent", "eval_agent", "agent_traces"):
            folder_path = "agent_traces"
        else:
            folder_path = subfolder
        return f"runs/{run_folder}/{folder_path}"
    folder_name = "agent_traces" if subfolder in ("coding_agent", "eval_agent", "agent_traces") else subfolder
    return f"{owner}_{repo}/{folder_name}"


def upload_agent_trajectory_log(
    owner: str,
    repo: str,
    agent_role_folder: str,  # 'coding_agent', 'eval_agent', or 'agent_traces'
    issue_number: str | int,
    resolved_chunks: list[Any],
    timestamp: str | None = None,
    attempt_index: int = 1,
) -> str | None:
    """Serializes and uploads agent trajectory debug log to GCS and/or local trace directory."""
    if not resolved_chunks:
        return None

    raw_turn_payload = serialize_chunks(resolved_chunks)
    chunks_data = json.loads(raw_turn_payload) if isinstance(raw_turn_payload, str) else raw_turn_payload

    local_trace_dir = os.environ.get("LOCAL_TRACE_DIR") or "/tmp/agent_traces"
    local_file = os.path.join(local_trace_dir, f"issue_{issue_number}.json")

    data: dict[str, Any] = {}
    try:
        os.makedirs(local_trace_dir, exist_ok=True)
        if os.path.exists(local_file):
            try:
                with open(local_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {}

        if "issue_number" not in data:
            data["issue_number"] = issue_number
            data["owner"] = owner
            data["repo"] = repo

        role_prefix = "coding" if "coding" in agent_role_folder else "eval"
        turn_key = f"{role_prefix}_{attempt_index}"
        data[turn_key] = chunks_data

        with open(local_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        logger.info("[GCS Logger] Consolidated agent trace to %s (key: %s)", local_file, turn_key)
    except Exception as e:
        logger.warning("[GCS Logger] Failed to save local trace: %s", e)

    full_trace_payload = json.dumps(data, indent=2, default=str) if data else raw_turn_payload

    prefix = _get_gcs_blob_prefix(owner, repo, "agent_traces")
    blob_path = f"{prefix}/issue_{issue_number}.json"
    if upload_to_bucket(blob_path, full_trace_payload, content_type="application/json"):
        return blob_path
    return None


def upload_git_diff(
    owner: str,
    repo: str,
    issue_number: str | int,
    diff_content: str,
    timestamp: str | None = None,
) -> str | None:
    """Uploads generated git diff patch artifact to GCS."""
    if not diff_content:
        return None

    ts = timestamp or _get_utc_timestamp()
    prefix = _get_gcs_blob_prefix(owner, repo, "git_diffs")
    blob_path = f"{prefix}/issue_{issue_number}_{ts}_diff.diff"
    if upload_to_bucket(blob_path, diff_content, content_type="text/plain"):
        return blob_path
    return None


def upload_pr_details(
    owner: str,
    repo: str,
    issue_number: str | int,
    pr_details_content: str,
    timestamp: str | None = None,
) -> str | None:
    """Uploads generated PR details markdown documentation artifact to GCS."""
    if not pr_details_content:
        return None

    ts = timestamp or _get_utc_timestamp()
    prefix = _get_gcs_blob_prefix(owner, repo, "pr_details")
    blob_path = f"{prefix}/issue_{issue_number}_{ts}_pr_details.md"
    if upload_to_bucket(blob_path, pr_details_content, content_type="text/markdown"):
        return blob_path
    return None


def upload_eval_run_artifacts(run_dir: str, run_name: str) -> None:
    """Uploads all outputs/, logs/, Results.txt, and score reports to GCS bucket for an evaluation run."""
    if os.environ.get("DISABLE_GCS_LOGGING", "").lower() in ("1", "true", "yes"):
        return

    eval_run_ts = os.environ.get("EVAL_GCS_RUN_TIMESTAMP", "")
    run_folder = f"{run_name}_{eval_run_ts}" if eval_run_ts else run_name
    gcs_base_prefix = f"runs/{run_folder}"

    for root, _, files in os.walk(run_dir):
        rel_root = os.path.relpath(root, run_dir)
        for f in files:
            file_path = os.path.join(root, f)
            if rel_root == ".":
                if f == "Results.txt" or f.endswith("_eval_score.md"):
                    blob_path = f"{gcs_base_prefix}/{f}"
                    try:
                        with open(file_path, "r", encoding="utf-8") as file_handle:
                            content = file_handle.read()
                        upload_to_bucket(blob_path, content, content_type="text/markdown" if f.endswith(".md") else "text/plain")
                    except Exception as e:
                        logger.warning("[GCS Logger] Failed to upload %s: %s", f, e)
            elif rel_root.startswith("outputs") or rel_root.startswith("logs"):
                blob_path = f"{gcs_base_prefix}/{os.path.join(rel_root, f)}"
                try:
                    with open(file_path, "r", encoding="utf-8") as file_handle:
                        content = file_handle.read()
                    content_type = "text/markdown" if f.endswith(".md") else "text/plain"
                    upload_to_bucket(blob_path, content, content_type=content_type)
                except Exception as e:
                    logger.warning("[GCS Logger] Failed to upload %s: %s", file_path, e)
