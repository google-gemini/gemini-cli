import pytest
import json
import os

@pytest.fixture
def temp_workspace(tmp_path):
    (tmp_path / ".gemini").mkdir()
    (tmp_path / ".gemini" / "logs").mkdir()
    (tmp_path / "client").mkdir()
    (tmp_path / "server").mkdir()
    with open(tmp_path / "client" / "client.js", "w") as f:
        f.write("// CORS handling in client")
    with open(tmp_path / "server" / "server.js", "w") as f:
        f.write("// CORS handling in server")
    with open(tmp_path / ".gemini" / "workspaces.json", "w") as f:
        json.dump({"workspaces": [{"name": "client", "path": "client"}, {"name": "server", "path": "server"}]}, f)
    return tmp_path
