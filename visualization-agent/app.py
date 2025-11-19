
import streamlit as st
from data_loader import get_recent_jobs, get_job_details
from geo_visualizer import load_and_vectorize_mask, create_loss_map

# --- Page Configuration ---
st.set_page_config(
    page_title="MRV Analysis Dashboard",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- Sidebar ---
st.sidebar.title("Analysis Job Selector")

jobs_df = get_recent_jobs()

if not jobs_df.empty:
    # Format for display
    jobs_df['display'] = jobs_df['job_id'] + " | " + jobs_df['timestamp'].astype(str)
    selected_job_display = st.sidebar.selectbox(
        "Select a recent job run:", 
        jobs_df['display']
    )
    selected_job_id = selected_job_display.split(' | ')[0]
else:
    st.sidebar.warning("No successful jobs found.")
    selected_job_id = None

# --- Main Dashboard ---
st.title("Canopy Loss Analysis Dashboard")

if selected_job_id:
    st.header(f"Results for Job: {selected_job_id}")

    # Load job details
    metrics, gcs_path = get_job_details(selected_job_id)

    if metrics and gcs_path:
        # Display Key Metrics
        st.subheader("Key Metrics")
        col1, col2 = st.columns(2)
        col1.metric(
            label="Total Canopy Loss (Hectares)", 
            value=f"{metrics.get('loss_area_ha', 0):.2f}"
        )
        col2.metric(
            label="Total Canopy Loss (Square Meters)", 
            value=f"{metrics.get('loss_area_m2', 0):.2f}"
        )

        # Geospatial Visualization
        st.subheader("Geospatial Loss Distribution")
        with st.spinner("Loading and vectorizing loss mask..."):
            gdf = load_and_vectorize_mask(gcs_path)
        
        if gdf is not None and not gdf.empty:
            loss_map = create_loss_map(gdf)
            st.pydeck_chart(loss_map)
        else:
            st.info("No visual data to display.")

    else:
        st.error("Could not retrieve details for the selected job.")
else:
    st.info("Select a job from the sidebar to view results.")
