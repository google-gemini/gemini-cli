import os
import sys
import json
import glob
from os.path import dirname, abspath

from dotenv import load_dotenv

# Ensure project root is in path for imports
project_root = abspath(os.path.join(dirname(__file__), "..", "..", "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Load environment variables from .env
load_dotenv(os.path.join(project_root, ".env"))

def main():
    tools_dir = dirname(abspath(__file__))
    golden_issues_dir = os.path.abspath(os.path.join(tools_dir, "..", "golden-issues"))
    json_files = sorted([
        f for f in glob.glob(os.path.join(golden_issues_dir, "**", "gemini_cli_*.json"), recursive=True)
        if not os.path.basename(f).startswith(".")
    ])
    
    if not json_files:
        print(f"No JSON files found in {golden_issues_dir}.")
        return

    print(f"[SYNC] Found {len(json_files)} JSON file(s) to process in {golden_issues_dir}.")
    
    try:
        from google.cloud import firestore
        
        project_id = os.environ.get("PROJECT_ID")
        db_id = os.environ.get("FIRESTORE_DATABASE")
        collection_name = os.environ.get("FIRESTORE_EVAL_COLLECTION")
        
        db = firestore.Client(project=project_id, database=db_id)
        print(f"[SYNC] Connected to Firestore: project={project_id}, collection={collection_name}")
    except Exception as e:
        print(f"[SYNC] Warning: Could not connect to Firestore client: {e}")
        print("[SYNC] Ensure PROJECT_ID and FIRESTORE_DATABASE are set in your environment.")
        return

    for file_path in json_files:
        filename = os.path.basename(file_path)
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            required_fields = ["owner", "repo", "issue_number", "issue_title", "issue_body"]
            missing = [field for field in required_fields if field not in data]
            if missing:
                print(f"  -> Skipping '{filename}': Missing {missing}")
                continue

            doc_id = f"github_{data['owner']}_{data['repo']}_{data['issue_number']}"
            doc_ref = db.collection(collection_name).document(doc_id)
            
            owner = data["owner"]
            repo = data["repo"]
            issue_num = data["issue_number"]
            pr_num = data.get("pr_number", 0)

            payload = {
                "expected": {
                    "quality": data.get("expected_quality", "OK"),
                    "effort": data.get("expected_effort", ""),
                    "workable_spec": data.get("expected_workable_spec", {})
                },
                "github_metadata": {
                    "owner": owner,
                    "repo": repo,
                    "issue_number": issue_num,
                    "issue_url": f"https://github.com/{owner}/{repo}/issues/{issue_num}",
                    "pr_url": f"https://github.com/{owner}/{repo}/pull/{pr_num}" if pr_num else "",
                    "target_version": data.get("target_version", "main")
                },
                "input": {
                    "title": data["issue_title"],
                    "body": data["issue_body"]
                },
                "notes": data.get("notes", "")
            }
            doc_ref.set(payload)
            print(f"  -> Synced '{filename}' to Firestore collection '{collection_name}' as '{doc_id}'")
        except Exception as e:
            print(f"  -> Failed to sync '{filename}': {e}")

if __name__ == "__main__":
    main()
