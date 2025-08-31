import sys
import json
import os
import logging
from logging.handlers import RotatingFileHandler

# Setup logging
log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".gemini", "logs"))
if not os.path.exists(log_dir):
    os.makedirs(log_dir)
log_file = os.path.join(log_dir, "context_broker.jsonl")

logger = logging.getLogger("context_broker")
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(log_file, maxBytes=1024*1024, backupCount=3)
formatter = logging.Formatter('%(asctime)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# Workspaces file path
workspaces_path = os.path.join(os.path.dirname(__file__), "..", ".gemini", "workspaces.json")

def load_workspaces():
    with open(workspaces_path, "r") as f:
        workspaces_config = json.load(f)["workspaces"]
    return [
        {"name": ws["name"], "path": os.path.abspath(os.path.join(os.path.dirname(workspaces_path), "..", ws["path"]))}
        for ws in workspaces_config
    ]

ALLOWED_WORKSPACES = load_workspaces()

def get_tool_definitions():
    return {
        "list_contexts": {
            "description": "Lists the available contexts (workspaces).",
            "parameters": {},
        },
        "read_file": {
            "description": "Reads the content of a file in a specific context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "context": {"type": "string", "description": "The context (workspace) name."},
                    "path": {"type": "string", "description": "The relative path to the file."},
                },
                "required": ["context", "path"],
            },
        },
        "search_code": {
            "description": "Searches for a pattern in the code of a specific context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "context": {"type": "string", "description": "The context (workspace) name."},
                    "pattern": {"type": "string", "description": "The regex pattern to search for."},
                },
                "required": ["context", "pattern"],
            },
        },
        "dependency_graph": {
            "description": "Infers the dependency graph for a workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "context": {"type": "string", "description": "The context (workspace) name."},
                },
                "required": ["context"],
            },
        },
        "summarize_repo": {
            "description": "Summarizes the contents of a repository.",
            "parameters": {
                "type": "object",
                "properties": {
                    "context": {"type": "string", "description": "The context (workspace) name."},
                },
                "required": ["context"],
            },
        },
        "add_workspace": {
            "description": "Adds a new workspace to the configuration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "The name of the new workspace."}, 
                    "path": {"type": "string", "description": "The relative path to the new workspace."}, 
                },
                "required": ["name", "path"],
            },
        },
    }

def add_workspace(request):
    global ALLOWED_WORKSPACES
    log_event = {"tool": "add_workspace", "request": request}
    logger.info(json.dumps(log_event))

    name = request["params"]["name"]
    path = request["params"]["path"]

    # Validate name and path
    if not name or not path:
        return {"id": request["id"], "error": "Name and path are required."}
    
    # Check for duplicate names
    if any(ws["name"] == name for ws in ALLOWED_WORKSPACES):
        return {"id": request["id"], "error": f"Workspace with name '{name}' already exists."}
    
    # Security: ensure the path is within the project directory
    project_root = os.path.abspath(os.path.join(os.path.dirname(workspaces_path), ".."))
    new_path = os.path.abspath(os.path.join(project_root, path))
    if not new_path.startswith(project_root):
        return {"id": request["id"], "error": "Cannot add a workspace outside the project directory."}
    
    # Check if directory exists
    if not os.path.exists(new_path):
        return {"id": request["id"], "error": f"Directory '{path}' does not exist."}
    
    # Check for duplicate paths
    if any(os.path.abspath(os.path.join(project_root, ws["path"])) == new_path for ws in ALLOWED_WORKSPACES):
        return {"id": request["id"], "error": f"Workspace with path '{path}' already exists."}

    with open(workspaces_path, "r+") as f:
        data = json.load(f)
        data["workspaces"].append({"name": name, "path": path})
        f.seek(0)
        json.dump(data, f, indent=2)
        f.truncate()
    ALLOWED_WORKSPACES = load_workspaces()

    return {"id": request["id"], "result": {"status": "success"}}

def list_contexts(request):
    log_event = {"tool": "list_contexts", "request": request}
    logger.info(json.dumps(log_event))
    return {
        "id": request["id"],
        "result": {
            "contexts": ALLOWED_WORKSPACES
        },
    }

def read_file(request):
    log_event = {"tool": "read_file", "request": request}
    logger.info(json.dumps(log_event))

    context_name = request["params"]["context"]
    path = request["params"]["path"]
    
    context = next((ws for ws in ALLOWED_WORKSPACES if ws["name"] == context_name), None)
    if not context:
        return {"id": request["id"], "error": "Invalid context."}

    full_path = os.path.abspath(os.path.join(context["path"], path))

    if not any(full_path.startswith(ws["path"]) for ws in ALLOWED_WORKSPACES):
        return {"id": request["id"], "error": "File access outside of allowed directories is not permitted."}

    try:
        with open(full_path, "r") as f:
            content = f.read()
        return {"id": request["id"], "result": {"content": content}}
    except FileNotFoundError:
        return {"id": request["id"], "error": "File not found."}
    except Exception as e:
        return {"id": request["id"], "error": str(e)}

def search_code(request):
    log_event = {"tool": "search_code", "request": request}
    logger.info(json.dumps(log_event))

    context_name = request["params"]["context"]
    pattern = request["params"]["pattern"]
    
    context = next((ws for ws in ALLOWED_WORKSPACES if ws["name"] == context_name), None)
    if not context:
        return {"id": request["id"], "error": "Invalid context."}

    results = []
    for root, _, files in os.walk(context["path"]):
        for file in files:
            file_path = os.path.join(root, file)
            try:
                with open(file_path, "r") as f:
                    for i, line in enumerate(f):
                        if pattern in line:
                            results.append({
                                "path": os.path.relpath(file_path, context["path"]),
                                "line": i + 1,
                                "content": line.strip(),
                            })
            except Exception:
                pass

    return {"id": request["id"], "result": {"matches": results}}

def dependency_graph(request):
    log_event = {"tool": "dependency_graph", "request": request}
    logger.info(json.dumps(log_event))

    context_name = request["params"]["context"]
    context = next((ws for ws in ALLOWED_WORKSPACES if ws["name"] == context_name), None)
    if not context:
        return {"id": request["id"], "error": "Invalid context."}

    deps = {"nodes": [], "edges": []}
    package_json_path = os.path.join(context["path"], "package.json")
    if os.path.exists(package_json_path):
        with open(package_json_path, "r") as f:
            package_json = json.load(f)
            project_name = package_json.get("name", context_name)
            deps["nodes"].append({"id": project_name, "label": project_name})
            
            for dep_type in ["dependencies", "devDependencies"]:
                if dep_type in package_json:
                    for dep_name in package_json[dep_type]:
                        deps["nodes"].append({"id": dep_name, "label": dep_name})
                        deps["edges"].append({"from": project_name, "to": dep_name})

    return {"id": request["id"], "result": deps}

def summarize_repo(request):
    log_event = {"tool": "summarize_repo", "request": request}
    logger.info(json.dumps(log_event))

    context_name = request["params"]["context"]
    context = next((ws for ws in ALLOWED_WORKSPACES if ws["name"] == context_name), None)
    if not context:
        return {"id": request["id"], "error": "Invalid context."}

    summary = []
    for root, dirs, files in os.walk(context["path"]):
        # Exclude .git and node_modules
        dirs[:] = [d for d in dirs if d not in [".git", "node_modules"]]
        level = root.replace(context["path"], '').count(os.sep)
        indent = " " * 4 * (level)
        summary.append(f"{indent}{os.path.basename(root)}/")
        sub_indent = " " * 4 * (level + 1)
        for f in files:
            summary.append(f"{sub_indent}{f}")

    return {"id": request["id"], "result": {"summary": "\n".join(summary)}}

def main():
    for line in sys.stdin:
        try:
            request = json.loads(line.strip())
            method = request.get("method")
            response = {}

            if method == "tools/list":
                response = {"id": request["id"], "result": {"tools": [{
                    "name": name,
                    "description": tool["description"],
                    "inputSchema": tool["parameters"]
                } for name, tool in get_tool_definitions().items()]}}
            elif method == "tools/call":
                tool_name = request["params"]["name"]
                tool_args = request["params"]["arguments"]
                tool_request = {"id": request["id"], "params": tool_args}
                
                if tool_name == "list_contexts":
                    response = list_contexts(tool_request)
                elif tool_name == "read_file":
                    response = read_file(tool_request)
                elif tool_name == "search_code":
                    response = search_code(tool_request)
                elif tool_name == "dependency_graph":
                    response = dependency_graph(tool_request)
                elif tool_name == "summarize_repo":
                    response = summarize_repo(tool_request)
                elif tool_name == "add_workspace":
                    response = add_workspace(tool_request)
                else:
                    response = {"id": request["id"], "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"}}

            else:
                response = {"id": request["id"], "error": "Unknown method."}

        except json.JSONDecodeError:
            response = {"error": "Invalid JSON."}
        except Exception as e:
            response = {"error": str(e)}

        print(json.dumps(response))
        sys.stdout.flush()

if __name__ == "__main__":
    main()