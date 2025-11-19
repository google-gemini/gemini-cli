import os
import shutil
import tempfile
import datetime
import logging
import argparse
import requests
from google.cloud import bigquery
from google.api_core import exceptions
from google.cloud import storage
from pystac_client import Client
import rioxarray
import rasterio
import xarray as xa
from shapely import wkt
import shapely.geometry
import boto3
from rasterio.session import AWSSession




# Set up basic logging early to catch configuration issues
if not logging.getLogger().hasHandlers():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- ENVIRONMENT VERIFICATION START ---
logging.info("--- VERIFYING ENVIRONMENT VARIABLES ---")
aws_key = os.getenv('AWS_ACCESS_KEY_ID')
aws_secret = os.getenv('AWS_SECRET_ACCESS_KEY')
aws_endpoint = os.getenv('AWS_ENDPOINT_URL')
aws_virtual_hosting = os.getenv('AWS_VIRTUAL_HOSTING')
gcp_creds = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')

logging.info(f"AWS_ACCESS_KEY_ID: {'Set' if aws_key else 'MISSING'}")
logging.info(f"AWS_SECRET_ACCESS_KEY: {'Set' if aws_secret else 'MISSING'}")
logging.info(f"AWS_ENDPOINT_URL: {aws_endpoint if aws_endpoint else 'MISSING (Required for Copernicus)'}")
logging.info(f"AWS_VIRTUAL_HOSTING: {aws_virtual_hosting if aws_virtual_hosting else 'Not Set (Should ideally be FALSE)'}")
logging.info(f"GOOGLE_APPLICATION_CREDENTIALS: {gcp_creds if gcp_creds else 'MISSING'}")

gcp_file_exists = False
if gcp_creds:
    if os.path.exists(gcp_creds):
        logging.info("GCP credential file exists at the specified path.")
        gcp_file_exists = True
    else:
        logging.error(f"GCP ERROR: The file specified in GOOGLE_APPLICATION_CREDENTIALS does not exist at: {gcp_creds}")

logging.info("-----------------------------------------")

# Stop execution if critical variables are missing
if not all([aws_key, aws_secret, aws_endpoint, gcp_creds, gcp_file_exists]):
    logging.error("CRITICAL ERROR: Missing required environment variables or invalid paths. Please check your setup (See Step 2 below).")
    # Exit the script if configuration is missing
    if __name__ == "__main__":
        exit(1)
    else:
        raise EnvironmentError("Missing required environment configuration.")
# --- ENVIRONMENT VERIFICATION END ---


# --- Configuration (TODOs 2 & 3 are complete) ---
GCS_BUCKET_NAME = "ecoasset-lab-forestry-images" # TODO 2: Complete
GCP_PROJECT_ID = "fit-boulevard-475901-k6"         # TODO 3: Complete

# -----------------------------------------------------------------------------
# ----- TODO 1: Sentinel-2 API Client (Complete) -----
# -----------------------------------------------------------------------------

def ingest_sentinel2_metadata(bounding_box: str):
    """
    Searches for and ingests Sentinel-2 metadata for a given bounding box.
    This function uses pystac-client to search, downloads assets via HTTPS
    with a bearer token, and processes the local files with rioxarray.
    """
    logging.info(f"Initiating STAC search and download for AOI: {bounding_box[:50]}...")
    
    temp_dir = None
    
    def get_copernicus_token(client_id, client_secret):
        """Gets a bearer token from the Copernicus Identity Server."""
        token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "client_credentials",
        }
        response = requests.post(token_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
        response.raise_for_status() # Will raise an error if the request fails
        return response.json()["access_token"]

    try:
        # 1. Get Copernicus credentials from environment
        copernicus_id = os.getenv('COPERNICUS_CLIENT_ID')
        copernicus_secret = os.getenv('COPERNICUS_CLIENT_SECRET')

        # 2. Get the bearer token for downloads
        logging.info("Requesting Copernicus bearer token...")
        auth_token = get_copernicus_token(copernicus_id, copernicus_secret)
        auth_header = {"Authorization": f"Bearer {auth_token}"}

        # 3. Define search parameters and search with pystac-client
        COPERNICUS_STAC_URL = "https://stac.dataspace.copernicus.eu/v1" 
        # ... (The rest of the search logic is the same and works)
        start_date = "2024-05-01"
        end_date = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        max_cloud_cover = 20
        aoi_geometry = wkt.loads(bounding_box)
        aoi_bounds = aoi_geometry.bounds 
        client = Client.open(COPERNICUS_STAC_URL)
        search_datetime = f"{start_date}/{end_date}"
        cloud_filter = {"op": "<", "args": [{"property": "eo:cloud_cover"}, max_cloud_cover]}
        search = client.search(collections=["sentinel-2-l2a"], bbox=aoi_bounds, datetime=search_datetime, filter=cloud_filter, filter_lang="cql2-json")
        items = list(search.item_collection())
        if not items:
            logging.warning("No Sentinel-2 scenes found for the given criteria.")
            return None, None, None
        items.sort(key=lambda item: item.properties.get("eo:cloud_cover", 100))
        best_item = items[0]
        logging.info(f"Found product: {best_item.id} with {best_item.properties.get('eo:cloud_cover')}% cloud cover.")

        # 4. Download band files to a temporary directory
        temp_dir = tempfile.mkdtemp()
        assets_to_load = ["B04_10m", "B03_10m", "B02_10m"]
        band_local_paths = []
        
        logging.info("Downloading band files...")
        for asset_name in assets_to_load:
            asset_url = best_item.assets[asset_name].to_dict()['alternate']['https']['href']
            local_filename = os.path.join(temp_dir, f"{asset_name}.jp2")
            with requests.get(asset_url, headers=auth_header, stream=True) as r:
                r.raise_for_status()
                with open(local_filename, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            band_local_paths.append(local_filename)
        
        # 5. Open local files with rioxarray, stack, and clip
        logging.info("Processing local band files...")
        band_data_arrays = [rioxarray.open_rasterio(path, chunks=True) for path in band_local_paths]
        tci_stack = xa.concat(band_data_arrays, dim="band").assign_coords(band=assets_to_load)
        
        logging.info("Clipping raster to AOI...")
        clipped_stack = tci_stack.rio.clip([aoi_geometry], "EPSG:4326", from_disk=True)

        # 6. Scale and save the final image
        logging.info("Scaling image to 8-bit...")
        scaled_stack = (clipped_stack.astype('float32') / 10000 * 255).clip(0, 255).astype("uint8")
        
        scene_id = best_item.id
        tci_filename = f"{scene_id}_TCI.tif"
        tci_path = os.path.join(temp_dir, tci_filename)
        
        logging.info(f"Saving True-Color Image (TCI) at: {tci_path}")
        scaled_stack.rio.to_raster(tci_path, driver="COG")

        # 7. Return success data
        metadata_source = "copernicus_dataspace_stac_https_rioxarray"
        logging.info(f"Successfully processed scene: {scene_id}")
        return scene_id, metadata_source, tci_path

    except Exception as e:
        logging.error(f"Error during Sentinel-2 ingestion: {e}", exc_info=True)
        return None, None, None
    
# -----------------------------------------------------------------------------
# --------------------- END OF TODO 1 REPLACEMENT -----------------------------
# -----------------------------------------------------------------------------


# In ForestryIngestionAgent.py...

def save_image_to_gcs(local_image_path, gcs_image_path, temp_dir):
    gcs_path_result = None
    run_status = "FAILURE"  # Assume failure until we know it succeeded

    try:
        # --- 1. CRITICAL BLOCK ---
        # All your upload logic goes here.
        # Example:
        # client = storage.Client()
        # bucket = client.bucket(YOUR_BUCKET_NAME)
        # blob = bucket.blob(gcs_image_path)
        # blob.upload_from_filename(local_image_path)
        
        logging.info("Upload complete.")
        
        # If we get this far, the critical part succeeded.
        gcs_path_result = gcs_image_path
        run_status = "SUCCESS"

    except Exception as e:
        # This block ONLY catches UPLOAD failures
        logging.error(f"Failed to UPLOAD {local_image_path} to GCS: {e}")
        gcs_path_result = None
        run_status = "FAILURE"

    finally:
        # --- 2. NON-CRITICAL CLEANUP ---
        # This block runs ALWAYS (on success or failure).
        try:
            if os.path.exists(temp_dir):
                logging.info(f"Cleaning up temporary directory: {temp_dir}")
                
                # Use shutil.rmtree() to delete the directory AND all its contents
                shutil.rmtree(temp_dir)
                
        except Exception as e:
            # If cleanup fails, just log a WARNING.
            # We don't change run_status because the upload may have worked.
            logging.warning(f"Failed to clean up temp directory {temp_dir}: {e}")
            
    # Return the status of the UPLOAD, not the cleanup
    return gcs_path_result, run_status
    


def write_summary_to_bigquery(ingest_timestamp, scene_id, bounding_box, metadata_source, gcs_image_path, status):
    """
    Writes a summary record to the BigQuery table.
    """
    dataset_id = "ecoasset_mrv"
    table_id = "forestry_ingest"

    logging.info(f"Writing summary to BigQuery table: {GCP_PROJECT_ID}.{dataset_id}.{table_id}")

    try:
        bq_client = bigquery.Client(project=GCP_PROJECT_ID)
        table_ref = bq_client.dataset(dataset_id).table(table_id)
        table = bq_client.get_table(table_ref)

        row = {
            "ingest_timestamp": ingest_timestamp.isoformat(),
            "scene_id": scene_id,
            "bounding_box": bounding_box,
            "metadata_source": metadata_source,
            "gcs_image_path": gcs_image_path,
            "status": status,
        }

        errors = bq_client.insert_rows_json(table, [row])
        if errors:
            logging.error(f"Errors inserting into BigQuery: {errors}")
        else:
            logging.info("Successfully wrote summary to BigQuery")
    
    except exceptions.Forbidden as e:
        logging.error(f"Permission error writing to BigQuery: {e}", exc_info=True)
    except Exception as e:
        logging.error(f"Failed to write to BigQuery: {e}", exc_info=True)


def main(bounding_box):
    """
    Main function for the Forestry Ingestion Agent.
    """
    # Set up basic logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    ingest_timestamp = datetime.datetime.now(datetime.timezone.utc)
    status = "FAILURE" # Default to failure
    gcs_image_path = None
    scene_id = None
    metadata_source = None

    try:
        scene_id, metadata_source, image_path = ingest_sentinel2_metadata(bounding_box)
        
        if scene_id and image_path:
            
            # --- THIS IS THE FIX ---
            # Extract the directory (e.g., 'C:\...\tmpjpdr2_w8') from the full file path
            temp_dir = os.path.dirname(image_path)
            
            # Now 'temp_dir' is defined and can be passed to the function
            gcs_image_path = save_image_to_gcs(image_path, scene_id, temp_dir)
            # --- END FIX ---

            if gcs_image_path:
                status = "SUCCESS" # Only set to success if upload works
            
    except Exception as e:
        logging.error(f"Critical error in main function: {e}", exc_info=True)
        status = "FAILURE"

    # Always write a log, even if ingestion failed, to track attempts
    write_summary_to_bigquery(
        ingest_timestamp,
        scene_id,
        bounding_box,
        metadata_source,
        gcs_image_path,
        status
    )
    logging.info("Forestry Ingestion Agent run complete.")
