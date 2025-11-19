
import json
import logging
import tempfile
from datetime import datetime, timezone

import xarray as xr
from google.cloud import bigquery, storage

logger = logging.getLogger(__name__)

def upload_cog_to_gcs(data_array: xr.DataArray, bucket_name: str, blob_name: str) -> str:
    """
    Saves a DataArray as a local COG and uploads it to GCS.
    """
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)

    with tempfile.TemporaryDirectory() as tmpdir:
        local_path = f"{tmpdir}/output.tif"
        
        # Save to local COG
        data_array.rio.to_raster(local_path, driver="COG")
        
        # Upload to GCS
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(local_path)
        
        gcs_path = f"gs://{bucket_name}/{blob_name}"
        logger.info(f"Successfully uploaded COG to {gcs_path}")
        return gcs_path

def update_analysis_status(
    project_id: str,
    dataset_id: str,
    table_id: str,
    job_id: str,
    status: str,
    output_path: str = None,
    metrics: dict = None,
):
    """
    Inserts or updates a job status row in a BigQuery table.
    """
    bq_client = bigquery.Client(project=project_id)
    table_ref = bq_client.dataset(dataset_id).table(table_id)

    row = {
        "job_id": job_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "output_gcs_path": output_path,
        "metrics": json.dumps(metrics) if metrics else None,
    }

    errors = bq_client.insert_rows_json(table_ref, [row])
    if errors:
        logger.error(f"BigQuery insert errors: {errors}")
        raise RuntimeError(f"Failed to update BigQuery: {errors}")
    else:
        logger.info(f"Successfully logged status '{status}' for job '{job_id}' to BigQuery.")
