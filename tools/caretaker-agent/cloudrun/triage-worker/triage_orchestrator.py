import os
import asyncio
from utils.agent_logger import (
    upload_to_bucket,
    log_agent_run,
    extract_final_output,
)
from google.antigravity import Agent, LocalAgentConfig
from google.antigravity.hooks.policy import allow, deny

# Use "gemini-pro-latest" and "gemini-flash-latest"
MODEL_NAME = "gemini-flash-latest"

def process_issue_triage(
    payload: dict,
    target_cwd: str,
) -> tuple[bool, str]:
    """
    LLM inference via Antigravity SDK.
    """
    issue_num = payload.get("issue_number")
    title = payload.get("title", "")
    body = payload.get("body", "")
    repo_name = payload.get("repository", "")
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    system_prompt_path = os.path.join(
        current_dir, ".gemini", "triage_orchestrator.md"
    )
    gcs_logging = os.environ.get("GCS_LOGGING", "GCS").upper()

    triage_policies = [
        # Deny all tools by default
        deny("*"), 
        
        # Whitelist specific read-only and skill tools
        allow("view_file"),
        allow("list_directory"),
        allow("find_file"),
        allow("search_directory"),
        allow("activate_skill"),
        allow("finish")
    ]

    with open(system_prompt_path, "r", encoding="utf-8") as f:
        triage_instructions = f.read()

    skills_dir = os.path.join(current_dir, ".gemini", "skills")
    issue_prompt = (
        f"Repository: {repo_name}\n"
        f"Issue Number: {issue_num}\n"
        f"Title: {title}\n"
        f"Description: {body}"
    )

    async def run_triage():
        triage_config = LocalAgentConfig(
            system_instructions=triage_instructions,
            skills_paths=[skills_dir],
            api_key=os.environ.get("GEMINI_API_KEY"),
            workspaces=[target_cwd, skills_dir],
            policies=triage_policies,
            model=MODEL_NAME,
        )

        print(f"[LOGIC] [Issue #{issue_num}] Running Triage Worker...")
        async with Agent(triage_config) as agent:
            response = await agent.chat(issue_prompt)
            
            # Resolve all execution chunks (thoughts, tool calls, and results)
            resolved_chunks = await response.resolve()
            
            # Extract the final step's output
            text_output = extract_final_output(resolved_chunks)

            log_agent_run(
                repo_name,
                issue_num,
                resolved_chunks,
                mode=gcs_logging,
            )

            print(f"[LOGIC] Agent Response:\n{text_output}")
                
            return True, text_output

    try:
        success, raw_output = asyncio.run(run_triage())
        return success, raw_output
    except Exception as e:
        error_msg = f"Error during Antigravity Agent run: {e}"
        print(f"[LOGIC] {error_msg}")
        if gcs_logging == "GCS":
            # If agent failed/crashed before chunks resolved, upload traceback string directly
            upload_to_bucket(repo_name, issue_num, error_msg)
        return False, error_msg
