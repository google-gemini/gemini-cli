"""
Helper script to sync evaluation run results from local container disk to GCS bucket.
"""

import os
from google.cloud import storage


def sync_results_to_gcs() -> None:
    bucket_name = os.environ.get("EVAL_RESULTS_BUCKET", "triage-eval-results")
    runs_dir = "results/runs"

    if not os.path.exists(runs_dir):
        print(f"⚠️ Warning: No '{runs_dir}' directory found to sync to GCS.")
        return

    print("\n========================================================")
    print(" 📤 Syncing evaluation run results to GCS")
    print(f" Bucket: gs://{bucket_name}/runs/")
    print("========================================================")

    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        count = 0

        run_folders = [d for d in os.listdir(runs_dir) if os.path.isdir(os.path.join(runs_dir, d))]
        run_dest = f"gs://{bucket_name}/runs/{run_folders[0]}/" if run_folders else f"gs://{bucket_name}/runs/"

        for root, _, files in os.walk(runs_dir):
            for file in files:
                local_path = os.path.join(root, file)
                rel_path = os.path.relpath(local_path, runs_dir)
                blob_path = f"runs/{rel_path}"
                blob = bucket.blob(blob_path)
                # Set explicit charset=utf-8 on GCS blobs so web browsers and Caretaker Dashboard render markdown emojis cleanly.
                if file.endswith(".md"):
                    blob.upload_from_filename(local_path, content_type="text/markdown; charset=utf-8")
                elif file.endswith(".json"):
                    blob.upload_from_filename(local_path, content_type="application/json; charset=utf-8")
                else:
                    blob.upload_from_filename(local_path)
                count += 1

        print(f"✅ Successfully uploaded {count} result artifact(s) to {run_dest}\n")
    except Exception as e:
        print(f"❌ Error: Failed to upload evaluation results to GCS: {e}")
        raise


if __name__ == "__main__":
    sync_results_to_gcs()
