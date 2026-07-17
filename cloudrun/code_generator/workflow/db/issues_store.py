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

"""Firestore client and document store for code generation."""

import os
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
from google.cloud import firestore


class IssueStatus(str, Enum):
    UNTRIAGED = "UNTRIAGED"
    TRIAGING = "TRIAGING"
    NEEDS_INFO = "NEEDS_INFO"
    TRIAGED = "TRIAGED"
    COMMIT_GENERATION = "COMMIT_GENERATION"
    PR_VALIDATION_PENDING = "PR_VALIDATION_PENDING"
    PR_EVALUATION_PENDING = "PR_EVALUATION_PENDING"
    PR_REVISION = "PR_REVISION"
    NEEDS_HUMAN = "NEEDS_HUMAN"
    AUTO_CLOSE = "AUTO_CLOSE"


class ClaimAction(Enum):
    PROCEED = "PROCEED"
    SKIP = "SKIP"
    NEEDS_HUMAN = "NEEDS_HUMAN"


class ReleaseAction(Enum):
    COMPLETE = "COMPLETE"  # Complete / no retry needed (Exit code 0)
    RETRY = "RETRY"        # Failed / trigger retry (Exit code 1)


PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", os.environ.get("PROJECT_ID"))
DATABASE_NAME = os.environ.get("FIRESTORE_DATABASE")
COLLECTION_NAME = os.environ.get("FIRESTORE_COLLECTION", "issues")

_db_client: firestore.Client | None = None


def get_firestore_client() -> firestore.Client:
    """Lazily initializes and returns the Firestore client."""
    global _db_client
    if _db_client is None:
        if DATABASE_NAME:
            _db_client = firestore.Client(project=PROJECT_ID, database=DATABASE_NAME)
        else:
            _db_client = firestore.Client(project=PROJECT_ID)
    return _db_client


def get_firestore_id(
    doc_id: str | None = None,
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | str | None = None,
) -> str:
    """Resolves the Firestore document ID.

    Prioritizes the FIRESTORE_ID / firestore_id environment variable or explicit doc_id
    over reconstructing the document ID from owner/repo/issue_number.
    """
    resolved_id = (
        doc_id
        or os.environ.get("FIRESTORE_ID")
        or os.environ.get("firestore_id")
    )
    if resolved_id:
        return resolved_id

    if owner and repo and issue_number is not None:
        return f"github_{owner}_{repo}_{issue_number}"

    raise ValueError(
        "Firestore document ID could not be resolved. Please set the 'FIRESTORE_ID' "
        "environment variable or provide explicit doc_id or owner, repo, and issue_number."
    )


def get_issue_ref(
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | str | None = None,
    doc_id: str | None = None,
):
    """Generates the Firestore DocumentReference for an issue using the resolved document ID."""
    resolved_id = get_firestore_id(doc_id=doc_id, owner=owner, repo=repo, issue_number=issue_number)
    return get_firestore_client().collection(COLLECTION_NAME).document(resolved_id)


@firestore.transactional
def _create_issue_tx(
    transaction,
    doc_ref,
    owner: str,
    repo: str,
    issue_number: int,
    title: str,
    pr_url: str = "",
    failure_error: str = "",
    doc_id: str | None = None,
) -> bool:
    snapshot = doc_ref.get(transaction=transaction)
    if not snapshot.exists:
        resolved_id = doc_id or doc_ref.id
        new_issue = {
            "status": IssueStatus.UNTRIAGED.value,
            "firestore_id": resolved_id,
            "triage_attempts": 0,
            "workable_spec": {},
            "lock": {
                "holder": None,
                "expires_at": None,
            },
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
            "github_metadata": {
                "owner": owner,
                "repo": repo,
                "issue_number": issue_number,
                "title": title,
                "pr_url": pr_url,
            },
            "failure_error": failure_error,
        }
        transaction.set(doc_ref, new_issue)
        return True
    return False


def create_issue(
    owner: str,
    repo: str,
    issue_number: int,
    title: str,
    pr_url: str = "",
    failure_error: str = "",
    doc_id: str | None = None,
) -> bool:
    """Initializes a new issue document in a transaction."""
    doc_ref = get_issue_ref(owner=owner, repo=repo, issue_number=issue_number, doc_id=doc_id)
    transaction = get_firestore_client().transaction()
    return _create_issue_tx(
        transaction,
        doc_ref,
        owner,
        repo,
        issue_number,
        title,
        pr_url,
        failure_error,
        doc_id,
    )


@firestore.transactional
def _acquire_lock_tx(
    transaction,
    doc_ref,
    lock_holder: str,
    lock_duration_sec: int,
    target_status: str,
) -> ClaimAction:
    """Transactional logic to validate and claim concurrency locks.

    Step 1 & 2 (Lock Validation):
    - If lock.expires_at is Null (or expired): no worker claimed, PROCEED.
    - If lock.expires_at not elapsed, but lock.holder == current execution_id: crashed instance re-issue, PROCEED.
    - Else (active lock held by another workflow): commit transaction with no changes and SKIP.
    """
    snapshot = doc_ref.get(transaction=transaction)
    if not snapshot.exists:
        return ClaimAction.SKIP

    data = snapshot.to_dict() or {}
    current_status = data.get("status")
    attempts = data.get("triage_attempts", 0)

    # Early exit for terminal states
    if current_status in [
        IssueStatus.NEEDS_INFO.value,
        IssueStatus.NEEDS_HUMAN.value,
        IssueStatus.AUTO_CLOSE.value,
    ]:
        return ClaimAction.SKIP

    if attempts >= 2:
        transaction.update(
            doc_ref,
            {
                "status": IssueStatus.NEEDS_HUMAN.value,
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
        )
        return ClaimAction.NEEDS_HUMAN

    lock = data.get("lock") or {}
    now = datetime.now(timezone.utc)
    holder = lock.get("holder")
    expires_at = lock.get("expires_at")

    # Check active lock condition
    lock_is_active = (expires_at is not None) and (now <= expires_at)

    # If lock is active and held by another execution_id, exit cleanly
    if lock_is_active and holder != lock_holder:
        return ClaimAction.SKIP

    # Acquire lock and set status (Step 3: COMMIT_GENERATION)
    new_expires_at = now + timedelta(seconds=lock_duration_sec)
    new_attempts = attempts + 1

    transaction.update(
        doc_ref,
        {
            "status": target_status,
            "triage_attempts": new_attempts,
            "lock.holder": lock_holder,
            "lock.expires_at": new_expires_at,
            "updated_at": firestore.SERVER_TIMESTAMP,
        },
    )
    return ClaimAction.PROCEED


def acquire_lock(
    lock_holder: str,
    doc_id: str | None = None,
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | str | None = None,
    lock_duration_sec: int = 900,  # 15 minutes
    target_status: str = IssueStatus.COMMIT_GENERATION.value,
) -> ClaimAction:
    """Attempts to acquire the processing lock for a Cloud Run workflow execution."""
    doc_ref = get_issue_ref(owner=owner, repo=repo, issue_number=issue_number, doc_id=doc_id)
    transaction = get_firestore_client().transaction()
    return _acquire_lock_tx(
        transaction,
        doc_ref,
        lock_holder,
        lock_duration_sec,
        target_status,
    )


@firestore.transactional
def _release_lock_tx(
    transaction,
    doc_ref,
    lock_holder: str,
    success: bool,
    status: str | None = None,
    pr_url: str | None = None,
    failure_error: str | None = None,
    workable_spec: dict[str, Any] | None = None,
) -> ReleaseAction:
    """Transactional logic to release the lock and update status."""
    snapshot = doc_ref.get(transaction=transaction)
    if not snapshot.exists:
        return ReleaseAction.COMPLETE

    data = snapshot.to_dict() or {}
    lock = data.get("lock") or {}

    if lock.get("holder") != lock_holder:
        return ReleaseAction.COMPLETE

    updates: dict[str, Any] = {
        "lock.holder": None,
        "lock.expires_at": None,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    if pr_url is not None:
        updates["github_metadata.pr_url"] = pr_url

    if failure_error is not None:
        updates["failure_error"] = failure_error

    if success:
        if status:
            updates["status"] = status
        if workable_spec is not None:
            updates["workable_spec"] = workable_spec
        transaction.update(doc_ref, updates)
        return ReleaseAction.COMPLETE
    else:
        attempts = data.get("triage_attempts", 0)
        if attempts < 2:
            updates["status"] = IssueStatus.UNTRIAGED.value
            transaction.update(doc_ref, updates)
            return ReleaseAction.RETRY
        else:
            updates["status"] = IssueStatus.NEEDS_HUMAN.value
            transaction.update(doc_ref, updates)
            return ReleaseAction.COMPLETE


def release_lock(
    lock_holder: str,
    success: bool,
    doc_id: str | None = None,
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | str | None = None,
    status: str | None = None,
    pr_url: str | None = None,
    failure_error: str | None = None,
    workable_spec: dict[str, Any] | None = None,
) -> ReleaseAction:
    """Releases the processing lock for an issue and updates status."""
    doc_ref = get_issue_ref(owner=owner, repo=repo, issue_number=issue_number, doc_id=doc_id)
    transaction = get_firestore_client().transaction()
    return _release_lock_tx(
        transaction,
        doc_ref,
        lock_holder,
        success,
        status,
        pr_url,
        failure_error,
        workable_spec,
    )


def mark_pr_created(
    lock_holder: str,
    pr_url: str,
    doc_id: str | None = None,
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | str | None = None,
    status: str = IssueStatus.PR_EVALUATION_PENDING.value,
) -> ReleaseAction:
    """Moves issue to PR_EVALUATION_PENDING, records pr_url, and releases lock."""
    return release_lock(
        lock_holder=lock_holder,
        success=True,
        doc_id=doc_id,
        owner=owner,
        repo=repo,
        issue_number=issue_number,
        status=status,
        pr_url=pr_url,
    )


def mark_needs_human(
    lock_holder: str,
    reason: str,
    doc_id: str | None = None,
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | str | None = None,
) -> ReleaseAction:
    """Moves issue to NEEDS_HUMAN, records failure_error, and releases lock."""
    return release_lock(
        lock_holder=lock_holder,
        success=False,
        doc_id=doc_id,
        owner=owner,
        repo=repo,
        issue_number=issue_number,
        status=IssueStatus.NEEDS_HUMAN.value,
        failure_error=reason,
    )


def get_issue(
    doc_id: str | None = None,
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | str | None = None,
) -> dict[str, Any] | None:
    """Retrieves an issue document snapshot as a dictionary using FIRESTORE_ID."""
    doc_ref = get_issue_ref(owner=owner, repo=repo, issue_number=issue_number, doc_id=doc_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        return None
    return snapshot.to_dict()


def update_status(
    status: str,
    doc_id: str | None = None,
    owner: str | None = None,
    repo: str | None = None,
    issue_number: int | str | None = None,
    pr_url: str | None = None,
    failure_error: str | None = None,
) -> None:
    """Updates issue status, PR URL, and failure error using FIRESTORE_ID."""
    doc_ref = get_issue_ref(owner=owner, repo=repo, issue_number=issue_number, doc_id=doc_id)
    updates: dict[str, Any] = {
        "status": status,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    if pr_url is not None:
        updates["github_metadata.pr_url"] = pr_url
    if failure_error is not None:
        updates["failure_error"] = failure_error
    doc_ref.update(updates)
