
import os
import tempfile
import rioxarray
import xarray as xr
from shapely.geometry import shape

import copernicus
import gcp_utils

# --- Configuration ---
GCP_PROJECT = os.environ.get("GCP_PROJECT")
RESULTS_BUCKET = os.environ.get("INGESTION_BUCKET", "ecoasset-ingestion-results")
BQ_DATASET = "ecoasset_mrv"
BQ_TABLE = "ingestion_jobs_log" # Assuming a different log table for ingestion

def run_ingestion_pipeline(job_id: str, aoi_wkt: str, start_date: str, end_date: str):
    """The core data ingestion and processing pipeline."""
    print(f"Starting ingestion pipeline for job_id: {job_id}")
    status = "FAILURE"
    details = {}
    temp_dir = None

    try:
        # 1. Search for the best STAC item
        print("Searching for STAC items...")
        stac_item = copernicus.search_stac(aoi_wkt, start_date, end_date)
        if not stac_item:
            details["error"] = "No suitable STAC item found for the given criteria."
            print(details["error"])
            return # Exit early

        details["stac_item_id"] = stac_item.id
        print(f"Found STAC item: {stac_item.id}")

        # 2. Download required bands
        temp_dir = tempfile.mkdtemp()
        print(f"Created temporary directory: {temp_dir}")
        band_paths = copernicus.download_bands(stac_item, aoi_wkt, temp_dir)

        # 3. Process and combine bands
        print("Processing and combining bands...")
        aoi_geom = shape(aoi_wkt)

        # Load TCI (RGB) and clip
        tci_da = rioxarray.open_rasterio(band_paths["TCI"]).rio.clip([aoi_geom])
        
        # Load NIR (B08), scale, and align it to the TCI grid
        b08_da = rioxarray.open_rasterio(band_paths["B08"])
        b08_aligned = b08_da.rio.reproject_match(tci_da)
        
        # Scale factor for Sentinel-2 L2A data
        scale_factor = 10000
        tci_scaled = (tci_da / scale_factor).astype("float32")
        b08_scaled = (b08_aligned / scale_factor).astype("float32")

        # Combine into a 4-band DataArray (R, G, B, NIR)
        # Assuming TCI is 3 bands: R, G, B
        multi_band_da = xr.concat(
            [tci_scaled.sel(band=1), tci_scaled.sel(band=2), tci_scaled.sel(band=3), b08_scaled.squeeze()],
            dim="band"
        ).assign_coords(band=["B04", "B03", "B02", "B08"]) # Assigning standard names

        # 4. Save multi-band GeoTIFF locally
        output_local_path = os.path.join(temp_dir, "multiband_output.tif")
        multi_band_da.rio.to_raster(output_local_path, driver="COG")
        print(f"Saved multi-band GeoTIFF to: {output_local_path}")

        # 5. Upload to GCS
        gcs_image_path = f"imagery/{job_id}/multiband.tif"
        gcs_path = gcp_utils.save_image_to_gcs(
            output_local_path, RESULTS_BUCKET, gcs_image_path, temp_dir
        )
        details["output_gcs_path"] = gcs_path
        
        status = "SUCCESS"
        print("Ingestion pipeline completed successfully.")

    except Exception as e:
        status = "FAILURE"
        details["error"] = str(e)
        print(f"ERROR in ingestion pipeline: {e}")
    finally:
        # 6. Log final status to BigQuery
        gcp_utils.write_summary_to_bigquery(
            project_id=GCP_PROJECT,
            dataset_id=BQ_DATASET,
            table_id=BQ_TABLE,
            job_id=job_id,
            status=status,
            details=details
        )
        # Cleanup temp dir if it wasn't cleaned up by save_image_to_gcs
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
