
import os
import vertexai
from vertexai.generative_models import GenerativeModel, Part, Tool

# Import all tool classes
from tools.geo_reasoning import GeoReasoningTool
from tools.forestry_ingestion import ForestryIngestionTool
from tools.status_checker import StatusCheckerTool
from tools.remote_sensing import RemoteSensingTool
from tools.mrv_analytics import MRVAnalyticsTool

# --- Configuration ---
GCP_PROJECT = os.environ.get("GCP_PROJECT")
LOCATION = os.environ.get("GCP_REGION", "us-central1")
MODEL_ID = "gemini-2.5-flash"

if GCP_PROJECT:
    vertexai.init(project=GCP_PROJECT, location=LOCATION)

# --- System Prompt ---
SYSTEM_PROMPT = """
You are the EcoAsset Labs Root Orchestrator, a sophisticated AI agent responsible for coordinating a complex environmental analysis workflow.

Your primary goal is to answer a user's natural language query by orchestrating a series of specialized sub-agents (represented as tools).

You MUST follow this exact workflow:
1.  **Parse Geography and Time**: Use the `parse_geography_and_time` tool to understand the user's request.
2.  **Trigger Ingestion**: Use the `trigger_forestry_ingestion` tool to start the data collection process.
3.  **Monitor Ingestion**: Use the `check_job_status` tool on the ingestion job_id until the status is 'SUCCESS'.
4.  **Trigger Analysis**: Once ingestion is successful, use the `trigger_remote_sensing_analysis` tool, passing the outputs from the ingestion step.
5.  **Monitor Analysis**: Use the `check_job_status` tool on the analysis job_id until the status is 'SUCCESS'.
6.  **Get Final Metrics**: Once analysis is successful, use the `get_mrv_metrics` tool to get the final, summarized results.
7.  **Synthesize Final Answer**: After receiving the final metrics and narrative, present the `narrative_summary` to the user as the final answer. Do not add any extra conversational text.

Strictly adhere to the tool definitions and the workflow. Do not deviate. Begin the process now.
"""

# --- Tool Initialization and Registry ---
def initialize_tools():
    tools_list = [
        GeoReasoningTool(),
        ForestryIngestionTool(),
        StatusCheckerTool(),
        RemoteSensingTool(),
        MRVAnalyticsTool(),
    ]

    tool_definitions = [t.get_definition() for t in tools_list]

    # Create the registry by manually pairing the known name with the execute method
    tool_registry = {
        "parse_geography_and_time": tools_list[0].execute,
        "trigger_forestry_ingestion": tools_list[1].execute,
        "check_job_status": tools_list[2].execute,
        "trigger_remote_sensing_analysis": tools_list[3].execute,
        "get_mrv_metrics": tools_list[4].execute,
    }

    return Tool(function_declarations=tool_definitions), tool_registry

# --- Main Orchestration Logic ---
def handle_query(query: str) -> str:
    if not GCP_PROJECT:
        return "Orchestration skipped: GCP_PROJECT environment variable not set."

    gemini_tool, tool_registry = initialize_tools()

    model = GenerativeModel(
        MODEL_ID,
        system_instruction=SYSTEM_PROMPT,
        tools=[gemini_tool]
    )

    chat = model.start_chat()
    response = chat.send_message(query)

    while True:
        # Check for a function call in the model's response
        if not response.candidates[0].content.parts[0].function_call.name:
            # If no function call, the model has its final answer
            return response.text

        function_call = response.candidates[0].content.parts[0].function_call
        tool_name = function_call.name
        
        if tool_name not in tool_registry:
            raise ValueError(f"Unknown tool: {tool_name}")

        # Execute the corresponding tool function
        executor = tool_registry[tool_name]
        args = {key: value for key, value in function_call.args.items()}
        result = executor(args)

        # Send the tool's result back to the model
        response = chat.send_message(
            Part.from_function_response(
                name=tool_name,
                response={"content": result}
            )
        )
