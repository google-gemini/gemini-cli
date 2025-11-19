
import os
import logging
from datetime import datetime

import vertexai
from vertexai.generative_models import (
    FunctionDeclaration,
    GenerationConfig,
    GenerativeModel,
    Tool,
    ToolConfig,
)

from geocoder import get_geometry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# TODO: Set your Google Cloud project ID.
PROJECT_ID = os.environ.get("GCP_PROJECT")
# TODO: Set your Google Cloud region.
LOCATION = os.environ.get("GCP_REGION")

if not PROJECT_ID or not LOCATION:
    raise RuntimeError("GCP_PROJECT and GCP_REGION environment variables must be set.")

vertexai.init(project=PROJECT_ID, location=LOCATION)

MODEL_ID = "gemini-1.5-flash-001"

# Define the function declaration for the model
set_analysis_parameters = FunctionDeclaration(
    name="set_analysis_parameters",
    description="Sets the parameters for geospatial and temporal analysis based on a user query.",
    parameters={
        "type": "object",
        "properties": {
            "location_description": {
                "type": "string",
                "description": "The precise, formalized name of the location (e.g., 'Cass County, Minnesota, USA').",
            },
            "start_date_iso": {
                "type": "string",
                "description": "The start date in YYYY-MM-DD format.",
            },
            "end_date_iso": {
                "type": "string",
                "description": "The end date in YYYY-MM-DD format.",
            },
        },
        "required": ["location_description", "start_date_iso", "end_date_iso"],
    },
)

# Define the tool that the model can use
reasoning_tool = Tool(function_declarations=[set_analysis_parameters])

# Define the system prompt
SYSTEM_PROMPT = f"""
You are the GeoReasoningAgent.
Your task is to interpret geospatial and temporal queries from the user.
You MUST use the `set_analysis_parameters` tool to structure the output.
Today's date is {datetime.now().strftime('%Y-%m-%d')}. Use this as the CURRENT_DATE for any relative date calculations (e.g., 'last year', 'next month').
"""

def process_query(query: str) -> dict:
    """
    Processes the user's natural language query using Gemini and the geocoder.

    Args:
        query: The user's natural language query.

    Returns:
        A dictionary containing the AOI in WKT format, start date, end date,
        and the location name.

    Raises:
        ValueError: If the model fails to return the expected parameters.
        RuntimeError: If the geocoding service fails.
    """
    model = GenerativeModel(
        MODEL_ID,
        system_instruction=SYSTEM_PROMPT,
    )

    # Define the tool config object to force tool use
    tool_config = ToolConfig(
        function_calling_config=ToolConfig.FunctionCallingConfig(
            mode=ToolConfig.FunctionCallingConfig.Mode.ANY
        )
    )

    response = model.generate_content(
        query,
        tools=[reasoning_tool],
        tool_config=tool_config  # <-- Pass the new object here
    )

    try:
        function_call = response.candidates[0].content.parts[0].function_call
        params = {
            key: value for key, value in function_call.args.items()
        }

        location_name = params.get("location_description")
        start_date = params.get("start_date_iso")
        end_date = params.get("end_date_iso")

        if not all([location_name, start_date, end_date]):
            raise ValueError("Model did not return all required parameters.")

        # Get the geometry from the geocoder
        aoi_wkt = get_geometry(location_name)

        return {
            "aoi_wkt": aoi_wkt,
            "start_date": start_date,
            "end_date": end_date,
            "location_name": location_name,
        }

    except (AttributeError, IndexError, KeyError) as e:
        logger.error(f"Failed to parse model response: {response}")
        raise ValueError("Failed to interpret the model's response.") from e
    except ValueError as e:
        # Handle errors from get_geometry (e.g., geocoding failed)
        logger.error(f"Geocoding failed: {e}")
        raise RuntimeError("Error during geocoding process.") from e

if __name__ == '__main__':
    # Example usage
    test_query = "Show me imagery for Cass County, Minnesota from last summer."
    try:
        result = process_query(test_query)
        print(result)
    except (ValueError, RuntimeError) as e:
        print(f"Error: {e}")
