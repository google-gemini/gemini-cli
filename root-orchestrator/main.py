
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from orchestrator import handle_query

app = FastAPI(
    title="Root Orchestrator Agent",
    description="Coordinates a multi-agent workflow to answer complex geospatial queries.",
    version="1.0.0"
)

class QueryRequest(BaseModel):
    query: str

@app.post("/orchestrate")
async def orchestrate(request: QueryRequest):
    """
    Receives a natural language query and orchestrates the full analysis workflow.
    """
    try:
        result = handle_query(request.query)
        return {"response": result}
    except Exception as e:
        # In a real app, you'd have more specific error handling
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}
