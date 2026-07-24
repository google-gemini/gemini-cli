"""Bidirectional Firestore Synchronization CLI Tool."""

import json
import argparse
from pathlib import Path
from dotenv import load_dotenv
from google.cloud import firestore
from evals.triage.helpers.dataset import get_env_var

load_dotenv()

TRIAGE_EVAL_DIR = Path(__file__).resolve().parent.parent
GOLDEN_ISSUES_DIR = TRIAGE_EVAL_DIR / "dataset" / "golden-issues"


def _get_db():
    project_id = get_env_var("PROJECT_ID")
    db_id = get_env_var("FIRESTORE_DATABASE")
    collection_name = get_env_var("FIRESTORE_EVAL_COLLECTION")
    db = firestore.Client(project=project_id, database=db_id)
    return db, collection_name


def sync_to_firestore():
    db, collection_name = _get_db()
    json_files = sorted([f for f in GOLDEN_ISSUES_DIR.glob("**/gemini_cli_*.json") if not f.name.startswith(".")])
    if not json_files:
        print(f"[SYNC] No JSON files found in {GOLDEN_ISSUES_DIR}.")
        return

    print(f"[SYNC] Uploading {len(json_files)} JSON file(s) to Firestore collection '{collection_name}'...")
    for file_path in json_files:
        filename = file_path.name
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            doc_id = f"github_{data['owner']}_{data['repo']}_{data['issue_number']}"
            db.collection(collection_name).document(doc_id).set(data)
            print(f"  -> Uploaded '{filename}' as '{doc_id}'")
        except Exception as e:
            print(f"  -> Failed to upload '{filename}': {e}")


def sync_from_firestore():
    db, collection_name = _get_db()
    GOLDEN_ISSUES_DIR.mkdir(parents=True, exist_ok=True)
    docs = db.collection(collection_name).stream()

    count = 0
    print(f"[SYNC] Downloading documents from Firestore collection '{collection_name}'...")
    for doc in docs:
        data = doc.to_dict()
        issue_num = data.get("issue_number")
        if not issue_num:
            continue
        file_path = GOLDEN_ISSUES_DIR / f"gemini_cli_{issue_num}.json"
        file_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"  -> Downloaded Issue #{issue_num} to '{file_path.name}'")
        count += 1
    print(f"[SYNC] Downloaded {count} file(s) to {GOLDEN_ISSUES_DIR}.")


def main():
    parser = argparse.ArgumentParser(description="Bidirectional Firestore Synchronization CLI Tool.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--to-firestore", action="store_true", help="Upload local JSONs to Firestore (Default)")
    group.add_argument("--from-firestore", action="store_true", help="Download Firestore docs to local JSONs")

    args = parser.parse_args()
    if args.from_firestore:
        sync_from_firestore()
    else:
        sync_to_firestore()


if __name__ == "__main__":
    main()
