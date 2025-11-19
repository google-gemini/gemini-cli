
import os
import json
import pandas as pd
import streamlit as st
from google.cloud import bigquery

# Get GCP Project from environment variable
GCP_PROJECT = os.environ.get("GCP_PROJECT")

@st.cache_data
def get_recent_jobs() -> pd.DataFrame:
    """
    Queries BigQuery for the 50 most recent successful analysis jobs.
    """
    if not GCP_PROJECT:
        st.error("GCP_PROJECT environment variable not set.")
        return pd.DataFrame()

    client = bigquery.Client(project=GCP_PROJECT)
    query = f"""
        SELECT job_id, timestamp
        FROM `ecoasset_mrv.analysis_jobs_log`
        WHERE status = 'SUCCESS'
        ORDER BY timestamp DESC
        LIMIT 50
    """
    try:
        query_job = client.query(query)
        return query_job.to_dataframe()
    except Exception as e:
        st.error(f"Failed to fetch recent jobs from BigQuery: {e}")
        return pd.DataFrame()

@st.cache_data
def get_job_details(job_id: str) -> tuple[dict, str] | tuple[None, None]:
    """
    Queries BigQuery for the details of a specific successful job.
    """
    if not GCP_PROJECT:
        st.error("GCP_PROJECT environment variable not set.")
        return None, None

    client = bigquery.Client(project=GCP_PROJECT)
    query = f"""
        SELECT metrics, output_gcs_path
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

    try:
        query_job = client.query(query, job_config=job_config)
        results = query_job.to_dataframe()

        if results.empty:
            st.warning(f"No successful job details found for job_id: {job_id}")
            return None, None

        metrics_str = results['metrics'][0]
        output_path = results['output_gcs_path'][0]
        
        return json.loads(metrics_str), output_path
    except Exception as e:
        st.error(f"Failed to fetch job details for {job_id}: {e}")
        return None, None
