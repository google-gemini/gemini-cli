from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging

from masking_tools import run_cloud_masking

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class MaskingRequest(BaseModel):
    job_id: str
    input_gcs_path: str

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/run_mask")
async def run_mask(request: MaskingRequest):
    logger.info(f"Received masking request for job_id: {request.job_id}, input_gcs_path: {request.input_gcs_path}")

# In main.py

import tempfile
from google.cloud import storage
from masking_tools import run_cloud_masking

# ... (keep your other imports and app = FastAPI()) ...

storage_client = storage.Client()
RESULTS_BUCKET = "ecoasset-analysis-results" # Or your chosen bucket

# ... (keep your Pydantic model) ...

@app.post("/run_mask")
async def run_mask(request: MaskingRequest):

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            # 1. Run the scientific code
            local_mask_path = run_cloud_masking(request.input_gcs_path, tmpdir)

            # 2. Upload the final mask to GCS
            blob_name = f"results/{request.job_id}/cloud_mask.tif"
            bucket = storage_client.bucket(RESULTS_BUCKET)
            blob = bucket.blob(blob_name)
            blob.upload_from_filename(local_mask_path)

            final_gcs_path = f"gs://{RESULTS_BUCKET}/{blob_name}"

            # 3. Return the GCS path of the new mask
            return {"job_id": request.job_id, "cloud_masked_path": final_gcs_path}

        except Exception as e:
            logging.error(f"Failed to run cloud masking: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

# ... (keep your /health endpoint) ...
