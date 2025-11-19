
import os
import json
import pandas as pd
from google.cloud import bigquery

# Get GCP Project from environment variable
GCP_PROJECT = os.environ.get("GCP_PROJECT")

def get_analysis_results(job_id: str) -> dict:
    """
    Queries BigQuery for the latest successful analysis result for a given job_id.
    """
    if not GCP_PROJECT:
        raise ValueError("GCP_PROJECT environment variable not set.")

    client = bigquery.Client(project=GCP_PROJECT)
    query = f"""
        SELECT metrics
        FROM `ecoasset_mrv.analysis_jobs_log`
        WHERE job_id = @job_id AND status = 'SUCCESS'
        ORDER BY timestamp DESC
        LIMIT 1
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("job_id", "STRING", job_id),
        ]
    )

    query_job = client.query(query, job_config=job_config)
    results = query_job.to_dataframe()

    if results.empty:
        raise ValueError(f"No successful analysis results found for job_id: {job_id}")

    # Parse the metrics JSON string
    metrics_str = results['metrics'][0]
    return json.loads(metrics_str)

def get_historical_trends(aoi_wkt: str, start_date: str, end_date: str) -> pd.DataFrame:
    """
    Mock function to return historical trend data.
    """
    # In a real implementation, this would query a data warehouse (e.g., BigQuery)
    # based on the AOI and date range to get historical biomass/carbon data.
    return pd.DataFrame({
        'date': pd.to_datetime(['2020-01-01']),
        'baseline_biomass_tonnes': [50000]
    })
