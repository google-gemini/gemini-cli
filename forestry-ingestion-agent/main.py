
import base64
import json
import logging
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from ingestion_workflow import run_ingestion_pipeline

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ForestryIngestionAgent",
    description="An event-driven microservice for ingesting geospatial data.",
    version="1.0.0",
)

# --- Pydantic Models for Pub/Sub Message ---
class PubSubMessage(BaseModel):
    data: str

class PubSubRequest(BaseModel):
    message: PubSubMessage
    subscription: str

# --- API Endpoints ---
@app.post("/pubsub/push")
async def pubsub_push(request: PubSubRequest, background_tasks: BackgroundTasks):
    """
    Receives a push message from Pub/Sub, decodes it, and starts the ingestion pipeline.
    """
    try:
        # Decode the message data from base64
        message_data_str = base64.b64decode(request.message.data).decode("utf-8")
        message_data = json.loads(message_data_str)
        logger.info(f"Received message: {message_data}")

        # Extract parameters
        job_id = message_data.get("job_id")
        aoi_wkt = message_data.get("aoi_wkt")
        start_date = message_data.get("start_date")
        end_date = message_data.get("end_date")

        if not all([job_id, aoi_wkt, start_date, end_date]):
            raise HTTPException(status_code=400, detail="Missing required fields in message.")

        # Run the ingestion pipeline in the background
        background_tasks.add_task(
            run_ingestion_pipeline, job_id, aoi_wkt, start_date, end_date
        )

        # Immediately return a 204 to acknowledge the message
        return "", 204

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in Pub/Sub message.")
    except Exception as e:
        logger.exception("An error occurred while processing the Pub/Sub message.")
        # Don't return 500, as Pub/Sub would retry. Let it be acknowledged.
        # The error will be logged in the pipeline itself.
        return "", 204

@app.get("/health")
async def health_check():
    """
    Returns a 200 status to indicate the service is running.
    """
    return {"status": "ok"}
