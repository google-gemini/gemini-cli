import json
import datetime
import os
from google.cloud import storage

BUCKET_NAME = os.environ.get("TRIAGE_DEBUG_LOGS_BUCKET")

def upload_debug_log(repository: str, issue_number: str, debug_output: str):
    """
    Uploads the gemini CLI debug logs/stderr to the GCS bucket.
    """
    if not debug_output:
        return
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(BUCKET_NAME)
        
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
        safe_repo = repository.replace("/", "_")
        blob_name = f"{safe_repo}/issue_{issue_number}_{timestamp}_debug.log"
        
        blob = bucket.blob(blob_name)
        blob.upload_from_string(debug_output, content_type="text/plain")
        print(f"[LOGIC] Uploaded debug logs to gs://{BUCKET_NAME}/{blob_name}")
    except Exception as e:
        print(f"[LOGIC] Error uploading debug logs to GCS: {e}")