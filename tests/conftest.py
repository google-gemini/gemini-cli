
import pytest
import json
import os

@pytest.fixture
def temp_workspace(tmp_path):
    test_workspace_path = tmp_path / "test_workspace"
    (test_workspace_path / ".gemini").mkdir(parents=True, exist_ok=True)
    (test_workspace_path / ".gemini" / "logs").mkdir(parents=True, exist_ok=True)
    (test_workspace_path / "client").mkdir(parents=True, exist_ok=True)
    (test_workspace_path / "server").mkdir(parents=True, exist_ok=True)
    with open(test_workspace_path / "client" / "client.js", "w") as f:
        f.write("// CORS handling in client")
    with open(test_workspace_path / "server" / "server.js", "w") as f:
        f.write("// CORS handling in server")
    with open(test_workspace_path / ".gemini" / "workspaces.json", "w") as f:
        json.dump({"workspaces": [{"name": "client", "path": "client"}, {"name": "server", "path": "server"}]}, f)
    yield test_workspace_path
