import sys
import os
# Ensure project root is in sys.path for imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
import subprocess
import json
import time

def test_broker_as_subprocess(temp_workspace):
    env = os.environ.copy()
    env["PYTHONPATH"] = PROJECT_ROOT + os.pathsep + env.get("PYTHONPATH", "")

    process = subprocess.Popen(
        ["python", "-m", "examples.multi_workspace.context_broker"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(temp_workspace),
        env=env,
    )
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None

    try:
        request = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        process.stdin.write(json.dumps(request) + "\n")
        process.stdin.flush()
        
        response_str = ""
        for _ in range(50):
            if process.poll() is not None:
                break
            try:
                response_str = process.stdout.readline()
                if response_str.strip():
                    break
            except:
                pass
            time.sleep(0.1)
        
        if not response_str.strip():
            stderr_output = process.stderr.read()
            raise AssertionError(f"No response. STDERR: {stderr_output}")
            
        response = json.loads(response_str)
        assert "result" in response
        assert "tools" in response["result"]
        
    finally:
        process.terminate()
        process.wait(timeout=1)