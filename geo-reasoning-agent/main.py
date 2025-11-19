
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging

from reasoning_engine import process_query

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="GeoReasoningAgent",
    description="An API for interpreting geospatial and temporal queries.",
    version="1.0.0",
)

class QueryRequest(BaseModel):
    query: str

@app.post("/analyze_context")
async def analyze_context(request: QueryRequest):
    """
    Analyzes a natural language query to extract geospatial and temporal context.
    """
    try:
        logger.info(f"Received query: {request.query}")
        result = process_query(request.query)
        return result
    except (ValueError, RuntimeError) as e:
        logger.error(f"Validation error for query '{request.query}': {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process query. Reason: {e}"
        )
    except Exception as e:
        logger.exception(f"An unexpected error occurred for query '{request.query}': {e}")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )

@app.get("/health")
async def health_check():
    """
    Returns a 200 status to indicate the service is running.
    """
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
