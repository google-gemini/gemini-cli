import sys
import json
import os
import logging
from logging.handlers import RotatingFileHandler

# Setup logging
log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".gemini", "logs"))
if not os.path.exists(log_dir):
    os.makedirs(log_dir)
log_file = os.path.join(log_dir, "context-broker.jsonl")

logger = logging.getLogger("context_broker")
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(log_file, maxBytes=1024*1024, backupCount=3)
formatter = logging.Formatter('%(asctime)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# Load workspaces
workspaces_path = os.path.join(os.path.dirname(__file__), "..", ".gemini", "workspaces.json")
with open(workspaces_path, "r") as f:
    workspaces_config = json.load(f)["workspaces"]

ALLOWED_WORKSPACES = [
    {"name": ws["name"], "path": os.path.abspath(os.path.join(os.path.dirname(workspaces_path), "..", ws["path"]))}
    for ws in workspaces_config
]

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
    }

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

            if method == "get_tool_definitions":
                response = {"id": request["id"], "result": get_tool_definitions()}
            elif method == "list_contexts":
                response = list_contexts(request)
            elif method == "read_file":
                response = read_file(request)
            elif method == "search_code":
                response = search_code(request)
            elif method == "dependency_graph":
                response = dependency_graph(request)
            elif method == "summarize_repo":
                response = summarize_repo(request)
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
