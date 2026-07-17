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

"""Seeds example_firestore.json into Firestore test-gcli-db-clone/test_issues."""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from google.cloud import firestore


def seed_firestore(
    json_path: str = "example_firestore.json",
    project_id: str | None = None,
    database_id: str = "test-gcli-db-clone",
    collection_name: str = "test_issues",
) -> None:
    """Reads example_firestore.json and writes it to the specified Firestore collection."""
    # Resolve project ID
    project = (
        project_id
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("PROJECT_ID")
        or "gcli-intern-project-2026"
    )

    # Load JSON file
    if not os.path.exists(json_path):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        rel_path = os.path.join(script_dir, json_path)
        if os.path.exists(rel_path):
            json_path = rel_path
        else:
            print(f"Error: JSON file '{json_path}' not found.", file=sys.stderr)
            sys.exit(1)

    print(f"Loading '{json_path}'...")
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Resolve Document ID
    doc_id = data.get("firestore_id")
    if not doc_id:
        github_meta = data.get("github_metadata", {})
        owner = github_meta.get("owner", "google-gemini")
        repo = github_meta.get("repo", "gemini-cli")
        issue_number = github_meta.get("issue_number", "25693")
        doc_id = f"github_{owner}_{repo}_{issue_number}"

    # Connect to Firestore client
    print(f"Connecting to Firestore (Project: {project}, Database: {database_id})...")
    try:
        db = firestore.Client(project=project, database=database_id)
    except Exception as e:
        print(f"Failed to initialize Firestore client: {e}", file=sys.stderr)
        sys.exit(1)

    # Convert timestamp strings to datetime objects
    doc_data = dict(data)
    now = datetime.now(timezone.utc)
    if "created_at" in doc_data and isinstance(doc_data["created_at"], str):
        try:
            doc_data["created_at"] = datetime.fromisoformat(doc_data["created_at"].replace("Z", "+00:00"))
        except Exception:
            doc_data["created_at"] = now

    if "updated_at" in doc_data and isinstance(doc_data["updated_at"], str):
        try:
            doc_data["updated_at"] = datetime.fromisoformat(doc_data["updated_at"].replace("Z", "+00:00"))
        except Exception:
            doc_data["updated_at"] = now

    # Write document
    print(f"Uploading document '{doc_id}' to collection '{collection_name}'...")
    doc_ref = db.collection(collection_name).document(doc_id)
    doc_ref.set(doc_data)

    print("\n=======================================================")
    print(" Document added successfully!")
    print(f" Database:   {database_id}")
    print(f" Collection: {collection_name}")
    print(f" Doc ID:     {doc_id}")
    print("=======================================================\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Add example_firestore.json to Firestore collection."
    )
    parser.add_argument(
        "--file",
        default="example_firestore.json",
        help="Path to example Firestore JSON file (default: example_firestore.json)",
    )
    parser.add_argument(
        "--project",
        default=None,
        help="Google Cloud Project ID (default: GOOGLE_CLOUD_PROJECT env var or gcli-intern-project-2026)",
    )
    parser.add_argument(
        "--database",
        default="test-gcli-db-clone",
        help="Firestore database ID (default: test-gcli-db-clone)",
    )
    parser.add_argument(
        "--collection",
        default="test_issues",
        help="Firestore collection name (default: test_issues)",
    )

    args = parser.parse_args()
    seed_firestore(
        json_path=args.file,
        project_id=args.project,
        database_id=args.database,
        collection_name=args.collection,
    )
