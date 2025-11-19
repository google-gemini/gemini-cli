
import argparse
import logging
import os
import sys

from analysis import (
    analyze_change,
    calculate_statistics,
    load_and_align,
)
from gcp_utils import update_analysis_status, upload_cog_to_gcs

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)

# --- Configuration ---
GCP_PROJECT = os.environ.get("GCP_PROJECT")
RESULTS_BUCKET = os.environ.get("ANALYSIS_BUCKET")
BQ_DATASET = "ecoasset_mrv"
BQ_TABLE = "analysis_jobs_log"


def main(args):
    """Main processing pipeline."""
    job_id = args.job_id
    logger.info(f"Starting job: {job_id})")

    # Log initial RUNNING status
    update_analysis_status(
        project_id=GCP_PROJECT,
        dataset_id=BQ_DATASET,
        table_id=BQ_TABLE,
        job_id=job_id,
        status="RUNNING",
    )

    try:
        # 1. Load and Align Data
        logger.info("Loading and aligning raster data...")
        da_t1, da_t2 = load_and_align(args.input_t1, args.input_t2, args.aoi_wkt)

        # 2. Analyze Change
        logger.info("Analyzing change...")
        _, loss_mask = analyze_change(da_t1, da_t2)

        # 3. Calculate Statistics
        logger.info("Calculating statistics...")
        stats = calculate_statistics(loss_mask)
        logger.info(f"Calculated stats: {stats}")

        # 4. Upload Results
        logger.info("Uploading results to GCS...")
        output_blob_name = f"results/{job_id}/canopy_loss_mask.tif"
        output_gcs_path = upload_cog_to_gcs(loss_mask, RESULTS_BUCKET, output_blob_name)

        # 5. Log SUCCESS status
        update_analysis_status(
            project_id=GCP_PROJECT,
            dataset_id=BQ_DATASET,
            table_id=BQ_TABLE,
            job_id=job_id,
            status="SUCCESS",
            output_path=output_gcs_path,
            metrics=stats,
        )
        logger.info(f"Job {job_id} completed successfully.")

    except Exception as e:
        error_message = f"Job failed: {str(e)}"
        logger.exception(error_message) # Log full traceback
        
        # Log FAILURE status
        update_analysis_status(
            project_id=GCP_PROJECT,
            dataset_id=BQ_DATASET,
            table_id=BQ_TABLE,
            job_id=job_id,
            status="FAILURE",
            metrics={"error": error_message}
        )
        sys.exit(1) # Exit with error code for Cloud Run

if __name__ == "__main__":
    if not all([GCP_PROJECT, RESULTS_BUCKET]):
        raise RuntimeError(
            "GCP_PROJECT and ANALYSIS_BUCKET environment variables must be set."
        )

    parser = argparse.ArgumentParser(description="Remote Sensing Analysis Agent")
    parser.add_argument("--input_t1", required=True, help="GCS path to the T1 raster.")
    parser.add_argument("--input_t2", required=True, help="GCS path to the T2 raster.")
    parser.add_argument("--aoi_wkt", required=True, help="WKT string of the Area of Interest.")
    parser.add_argument("--job_id", required=True, help="Unique ID for this analysis job.")

    main(parser.parse_args())
