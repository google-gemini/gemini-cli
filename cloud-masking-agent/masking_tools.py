import os
import logging
import tempfile
import rasterio
import numpy as np
from google.cloud import storage
from omnicloudmask import predict_from_array

# --- Configuration ---
storage_client = storage.Client()
logging.basicConfig(level=logging.INFO)

def download_gcs_file(gcs_path, local_dir):
    """Downloads a file from GCS to a local directory."""
    try:
        bucket_name, blob_name = gcs_path.replace("gs://", "").split("/", 1)
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        local_path = os.path.join(local_dir, os.path.basename(blob_name))
        blob.download_to_filename(local_path)
        logging.info(f"Successfully downloaded {gcs_path} to {local_path}")
        return local_path
    except Exception as e:
        logging.error(f"Failed to download {gcs_path}: {e}")
        raise

def run_cloud_masking(input_gcs_path: str, output_dir: str) -> str:
    """
    Runs the OmniCloudMask model on a GeoTIFF from GCS.
    
    This function assumes the input GeoTIFF has at least 3 bands:
    Red, Green, and NIR (Near-Infrared).
    """
    logging.info(f'Real cloud masking starting for {input_gcs_path}')
    
    try:
        # 1. Download the file from GCS
        local_image_path = download_gcs_file(input_gcs_path, output_dir)
        
        # 2. Open the GeoTIFF and read bands
        with rasterio.open(local_image_path) as src:
            # OmniCloudMask requires Red, Green, and NIR bands.
            # We assume a Sentinel-2-like 4-band file (R, G, B, NIR)
            # and that Red='B04', Green='B03', NIR='B08'.
            # A real implementation would need to map bands correctly.
            # For this example, we'll assume the first 3 bands are R, G, NIR
            
            # Read the first 3 bands into a numpy array
            # A more robust version would read bands by name (e.g., 'B04', 'B03', 'B08')
            image_array = src.read([1, 2, 3]) # Reading first 3 bands as (R, G, NIR)
            
            # Also save the geospatial metadata for writing the mask later
            meta = src.meta.copy()

        # 3. Run the OmniCloudMask model
        # The model expects (bands, height, width)
        logging.info("Running OmniCloudMask model...")
        # Note: First run will download the model weights (a few hundred MB)
        mask = predict_from_array(
            image_array,
            inference_device="cpu", # Use 'cuda' if GPU is available
            patch_size=512 # Smaller patch size for lower memory
        )
        
        # 4. Save the resulting mask as a new GeoTIFF
        # Update metadata for the new 1-band mask file
        meta.update(
            count=1,
            dtype='uint8',
            driver='GTiff'
        )
        
        mask_filename = os.path.basename(local_image_path).replace(".tif", "_mask.tif")
        output_mask_path = os.path.join(output_dir, mask_filename)
        
        with rasterio.open(output_mask_path, 'w', **meta) as dst:
            dst.write(mask, 1)
            
        logging.info(f"Successfully created cloud mask at {output_mask_path}")
        return output_mask_path

    except Exception as e:
        logging.error(f"Cloud masking failed: {e}", exc_info=True)
        raise
