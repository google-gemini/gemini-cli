import json
from context_broker import server

def test_list_contexts(temp_workspace, monkeypatch):
    monkeypatch.setattr(server, 'workspaces_path', str(temp_workspace / ".gemini" / "workspaces.json"))
    server.ALLOWED_WORKSPACES = server.load_workspaces()
    request = {"id": 1, "method": "list_contexts", "params": {}}
    response = server.list_contexts(request)
    assert len(response["result"]["contexts"]) == 2

def test_add_workspace(temp_workspace, monkeypatch):
    monkeypatch.setattr(server, 'workspaces_path', str(temp_workspace / ".gemini" / "workspaces.json"))
    server.ALLOWED_WORKSPACES = server.load_workspaces()
    (temp_workspace / "new_workspace").mkdir()
    request = {"id": 2, "method": "add_workspace", "params": {"name": "new", "path": "new_workspace"}}
    response = server.add_workspace(request)
    assert response["result"]["status"] == "success"
    assert len(server.ALLOWED_WORKSPACES) == 3
