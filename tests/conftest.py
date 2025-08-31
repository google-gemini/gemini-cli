
import pytest
import json
import os

@pytest.fixture
def temp_workspace(tmp_path):
    # Create examples/multi_workspace/.gemini and logs directories
    examples_dir = tmp_path / "examples"
    multiws_dir = examples_dir / "multi_workspace"
    gemini_dir = multiws_dir / ".gemini"
    logs_dir = gemini_dir / "logs"
    gemini_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)
    # Create client and server workspaces
    (tmp_path / "client").mkdir(parents=True, exist_ok=True)
    (tmp_path / "server").mkdir(parents=True, exist_ok=True)
    # Add example files
    with open(tmp_path / "client" / "client.js", "w") as f:
        f.write("// CORS handling in client")
    with open(tmp_path / "server" / "server.js", "w") as f:
        f.write("// CORS handling in server")
    # Create workspaces.json in both locations for all tests
    workspaces_data = {"workspaces": [
        {"name": "client", "path": "client"},
        {"name": "server", "path": "server"}
    ]}
    # For protocol test subprocess
    with open(gemini_dir / "workspaces.json", "w") as f:
        json.dump(workspaces_data, f)
    # For server-side tests
    root_gemini_dir = tmp_path / ".gemini"
    root_gemini_dir.mkdir(parents=True, exist_ok=True)
    with open(root_gemini_dir / "workspaces.json", "w") as f:
        json.dump(workspaces_data, f)

    # Copy __init__.py files to make temp workspace importable
    import shutil
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    # examples/__init__.py
    src_examples_init = os.path.join(project_root, 'examples', '__init__.py')
    dst_examples = tmp_path / 'examples'
    dst_examples.mkdir(exist_ok=True)
    shutil.copyfile(src_examples_init, dst_examples / '__init__.py')
    # examples/multi_workspace/__init__.py
    src_multiws_init = os.path.join(project_root, 'examples', 'multi_workspace', '__init__.py')
    dst_multiws = dst_examples / 'multi_workspace'
    dst_multiws.mkdir(exist_ok=True)
    shutil.copyfile(src_multiws_init, dst_multiws / '__init__.py')

    # examples/multi_workspace/context_broker/__init__.py
    src_cb_init = os.path.join(project_root, 'examples', 'multi_workspace', 'context_broker', '__init__.py')
    dst_cb = dst_multiws / 'context_broker'
    dst_cb.mkdir(exist_ok=True)
    shutil.copyfile(src_cb_init, dst_cb / '__init__.py')
    # examples/multi_workspace/context_broker/__main__.py
    src_cb_main = os.path.join(project_root, 'examples', 'multi_workspace', 'context_broker', '__main__.py')
    shutil.copyfile(src_cb_main, dst_cb / '__main__.py')
    # examples/multi_workspace/context_broker/server.py
    src_cb_server = os.path.join(project_root, 'examples', 'multi_workspace', 'context_broker', 'server.py')
    shutil.copyfile(src_cb_server, dst_cb / 'server.py')

    return tmp_path
