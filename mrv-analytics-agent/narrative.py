
import os
import json
import vertexai
from vertexai.generative_models import GenerativeModel

# --- Configuration ---
GCP_PROJECT = os.environ.get("GCP_PROJECT")
LOCATION = os.environ.get("GCP_REGION", "us-central1") # Default region
MODEL_ID = "gemini-1.5-flash-001"

if GCP_PROJECT:
    vertexai.init(project=GCP_PROJECT, location=LOCATION)

# --- System Prompt for the Narrative Agent ---
SYSTEM_PROMPT = """
You are an expert Measurement, Reporting, and Verification (MRV) analyst.
Your task is to synthesize the provided JSON data into a concise, professional narrative summary.

Focus on the following key points:
1.  The total area of canopy loss in hectares.
2.  The estimated carbon dioxide equivalent (CO2e) emissions resulting from this loss.
3.  The significance of this loss in the context of historical trends.

Do not include any introductory or concluding remarks. Just provide the narrative.
"""

def generate_narrative(
    analysis_metrics: dict,
    carbon_metrics: dict,
    trend_analysis: dict,
    context: dict
) -> str:
    """
    Generates a narrative summary using the Gemini model.
    """
    if not GCP_PROJECT:
        return "Narrative generation skipped: GCP_PROJECT environment variable not set."

    # Combine all data into a single dictionary for the prompt
    prompt_data = {
        "context": context,
        "geospatial_metrics": analysis_metrics,
        "ecological_impact": carbon_metrics,
        "trend_analysis": trend_analysis,
    }

    # Create the prompt for the model
    prompt = json.dumps(prompt_data, indent=2)

    # Call the Gemini model
    model = GenerativeModel(MODEL_ID, system_instruction=SYSTEM_PROMPT)
    response = model.generate_content(prompt)

    return response.text.strip()
