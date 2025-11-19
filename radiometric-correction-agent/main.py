import os
import tempfile
import shutil
import logging
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google.cloud import storage
from loraccs_tools import LORACCS

# Configure logging
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# --- Helper Functions ---

def download_gcs_blob(storage_client: storage.Client, gcs_path: str, destination_path: str):
    """Downloads a blob from Google Cloud Storage."""
    try:
        gcs_uri = gcs_path.replace("gs://", "")
        bucket_name, blob_name = gcs_uri.split("/", 1)
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.download_to_filename(destination_path)
        logging.info(f"Successfully downloaded {gcs_path} to {destination_path}")
    except Exception as e:
        logging.error(f"Failed to download {gcs_path}. Error: {e}")
        raise

def upload_gcs_blob(storage_client: storage.Client, source_path: str, gcs_path: str):
    """Uploads a file to Google Cloud Storage."""
    try:
        gcs_uri = gcs_path.replace("gs://", "")
        bucket_name, blob_name = gcs_uri.split("/", 1)
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(source_path)
        logging.info(f"Successfully uploaded {source_path} to {gcs_path}")
    except Exception as e:
        logging.error(f"Failed to upload {source_path}. Error: {e}")
        raise

# --- API Endpoints ---

@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}

class CorrectionRequest(BaseModel):
    """Pydantic model for the correction request."""
    job_id: str
    image_gcs_paths: List[str]

@app.post("/correct_mosaic")
def correct_mosaic(request: CorrectionRequest):
    """
    Accepts a mosaic correction job, performs LORACCS radiometric correction,
    and returns the GCS path to the corrected mosaic.
    """
    logging.info(f"Received correction request for job_id: {request.job_id}")
    
    if len(request.image_gcs_paths) != 2:
        raise HTTPException(status_code=400, detail="Expected two GCS paths: one for the target image and one for the reference image.")

    # Use a temporary directory for all processing
    temp_dir = tempfile.mkdtemp()
    logging.info(f"Created temporary directory: {temp_dir}")

    try:
        storage_client = storage.Client()

        # Define local file paths
        tgt_img_fp = os.path.join(temp_dir, "target_image.tif")
        ref_img_fp = os.path.join(temp_dir, "reference_image.tif")

        # Download images from GCS
        # Assuming the first path is the target and the second is the reference
        download_gcs_blob(storage_client, request.image_gcs_paths[0], tgt_img_fp)
        download_gcs_blob(storage_client, request.image_gcs_paths[1], ref_img_fp)

        # --- Run LORACCS Correction ---
        # These parameters are based on the LORACCS docstring for PlanetScope imagery.
        # They might need to be adjusted for different sensors.
        band_names = ['Blue', 'Green', 'Red', 'NIR']
        max_spectra = [3000, 3000, 3000, 8000]
        
        logging.info("Starting LORACCS radiometric correction...")
        loraccs_processor = LORACCS(
            outdir=temp_dir,
            ref_img_fp=ref_img_fp,
            tgt_img_fp=tgt_img_fp,
            band_names=band_names,
            max_spectra=max_spectra,
            delete_working_files=False # Keep files for debugging if needed
        )
        logging.info("LORACCS processing complete.")

        # Define paths for the corrected image
        corrected_local_path = os.path.join(temp_dir, 'LORACCS_normalized_img.tif')
        corrected_gcs_path = f"gs://mock-bucket/corrected_mosaics/{request.job_id}_corrected.tif"

        # Upload the corrected image to GCS
        upload_gcs_blob(storage_client, corrected_local_path, corrected_gcs_path)

        return {
            "job_id": request.job_id,
            "corrected_mosaic_path": corrected_gcs_path,
            "nrmse_results": loraccs_processor.nrmse.to_dict()
        }

    except Exception as e:
        logging.error(f"An error occurred during job {request.job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Mosaic correction failed due to an internal error: {e}")

    finally:
        # Clean up the temporary directory
        shutil.rmtree(temp_dir)
        logging.info(f"Removed temporary directory: {temp_dir}")
