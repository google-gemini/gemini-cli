import subprocess
import json
import os

def test_broker_as_subprocess(temp_workspace):
    process = subprocess.Popen(
        ["python", "-m", "context_broker"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(temp_workspace),
    )

    # Test list_contexts
    request = {"jsonrpc": "2.0", "id": 1, "method": "list_contexts"}
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    response_str = process.stdout.readline()
    response = json.loads(response_str)
    assert len(response["result"]["contexts"]) == 2

    process.terminate()

