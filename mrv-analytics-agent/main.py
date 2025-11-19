
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from data_access import get_analysis_results, get_historical_trends
from modeling import estimate_carbon_impact, analyze_trends
from narrative import generate_narrative

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MRVAnalyticsAgent",
    description="Synthesizes geospatial data into ecological and narrative summaries.",
    version="1.0.0",
)

# --- Pydantic Models ---
class MRVRequest(BaseModel):
    job_id: str
    aoi_wkt: str
    start_date: str
    end_date: str
    location_name: str

# --- API Endpoints ---
@app.post("/synthesize_metrics")
async def synthesize_metrics(request: MRVRequest):
    """
    Main endpoint to synthesize metrics from a completed analysis job.
    """
    try:
        # 1. Data Access Layer
        logger.info(f"Fetching results for job_id: {request.job_id}")
        analysis_metrics = get_analysis_results(request.job_id)

        # 2. Modeling Layer
        logger.info("Estimating carbon impact...")
        carbon_metrics = estimate_carbon_impact(analysis_metrics)

        logger.info("Analyzing historical trends...")
        historical_data = get_historical_trends(
            request.aoi_wkt, request.start_date, request.end_date
        )
        trend_analysis = analyze_trends(historical_data, carbon_metrics)

        # 3. Narrative Layer
        logger.info("Generating narrative summary...")
        context = {
            "location": request.location_name,
            "period": f"{request.start_date} to {request.end_date}",
        }
        narrative_summary = generate_narrative(
            analysis_metrics, carbon_metrics, trend_analysis, context
        )

        # 4. Assemble Final Response
        return {
            "job_id": request.job_id,
            "narrative_summary": narrative_summary,
            "key_metrics": {
                "geospatial": analysis_metrics,
                "ecological": carbon_metrics,
                "trends": trend_analysis,
            },
        }

    except ValueError as e:
        logger.error(f"Value error: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("An unexpected error occurred.")
        raise HTTPException(status_code=500, detail="Internal server error.")

@app.get("/health")
async def health_check():
    """
    Returns a 200 status to indicate the service is running.
    """
    return {"status": "ok"}
