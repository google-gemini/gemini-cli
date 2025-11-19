
import os
import json
import shutil
from datetime import datetime, timezone
from google.cloud import storage, bigquery

def save_image_to_gcs(local_image_path: str, bucket_name: str, gcs_image_path: str, temp_dir: str) -> str:
    """Uploads a local file to Google Cloud Storage and cleans up the temp directory."""
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(gcs_image_path)

    blob.upload_from_filename(local_image_path)
    gcs_path = f"gs://{bucket_name}/{gcs_image_path}"
    print(f"Successfully uploaded image to {gcs_path}")

    # Clean up the temporary directory
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
        print(f"Successfully removed temporary directory: {temp_dir}")

    return gcs_path

def write_summary_to_bigquery(project_id: str, dataset_id: str, table_id: str, job_id: str, status: str, details: dict = None):
    """Writes a summary of the ingestion job to a BigQuery table."""
    bq_client = bigquery.Client(project=project_id)
    table_ref = bq_client.dataset(dataset_id).table(table_id)

    row = {
        "job_id": job_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "service": "forestry-ingestion",
        "details": json.dumps(details) if details else None,
    }

    errors = bq_client.insert_rows_json(table_ref, [row])
    if errors:
        print(f"BigQuery insert errors: {errors}")
        raise RuntimeError(f"Failed to write to BigQuery: {errors}")
    else:
        print(f"Successfully logged status '{status}' for job '{job_id}' to BigQuery.")
