import os
import subprocess
import json
import re

GREEN = '\033[92m'
RED = '\033[91m'
RESET = '\033[0m'

def print_ok(msg):
    print(f"{GREEN}{msg} [OK]{RESET}")

def print_bad(msg):
    print(f"{RED}{msg}{RESET}")

def check_node_version():
    print("Checking Node.js version...")
    required = (20, 0, 0)
    try:
        version = subprocess.check_output(["node", "-v"]).decode().strip().lstrip('v')
    except FileNotFoundError:
        print_bad("Node.js not found: 'node' command is missing.")
        return
    except Exception as e:
        print_bad(f"Error running 'node -v': {e}")
        return
    match = re.match(r'(\d+)\.(\d+)\.(\d+)', version)
    if not match:
        print_bad(f"Node.js version string is invalid: '{version}'")
        return
    major, minor, patch = map(int, match.groups())
    if (major, minor, patch) < required:
        print_bad(f"Node.js version {version} is too old. Required: >=20.0.0")
    else:
        print_ok(f"Node.js version {version}")

def check_cli_version():
    print("\nChecking Gemini CLI version...")
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        package_json_path = os.path.join(script_dir, '..', 'package.json')
        with open(package_json_path) as f:
            data = json.load(f)
            version = data.get("version")
            if version:
                print_ok(f"Gemini CLI version {version} is OK.")
            else:
                print_bad("Gemini CLI version not found in package.json.")
    except FileNotFoundError:
        print_bad(f"`package.json` not found. Expected at: {package_json_path}")
    except Exception as e:
        print_bad(f"Could not read package.json: {e}")

def check_gcloud_auth():
    print("\nChecking gcloud authentication...")
    adc_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if adc_path:
        if os.path.isfile(adc_path):
            print_ok(f"Using credentials from GOOGLE_APPLICATION_CREDENTIALS: {adc_path}")
            return
        else:
            print_bad(f"GOOGLE_APPLICATION_CREDENTIALS is set, but the file does not exist: {adc_path}")
            return

    try:
        subprocess.check_output([
            "gcloud", "auth", "application-default", "print-access-token"
        ], stderr=subprocess.STDOUT, text=True)
        print_ok("gcloud ADC authentication is valid")
    except FileNotFoundError:
        print_bad("No ADC found: GOOGLE_APPLICATION_CREDENTIALS is not set and `gcloud` command not found.")
        print("  - Try running 'gcloud auth application-default login' or setting GOOGLE_APPLICATION_CREDENTIALS.")
    except subprocess.CalledProcessError as e:
        print_bad(f"gcloud ADC authentication failed. See details below.")
        print("  - Try running 'gcloud auth application-default login' or setting GOOGLE_APPLICATION_CREDENTIALS.")
        print(f"  - gcloud output:\n{e.output}")
    except Exception as e:
        print_bad(f"An unexpected error occurred during gcloud ADC authentication: {e}")

def check_env():
    print("\nChecking environment variables...")
    for var in ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"]:
        if os.environ.get(var):
            print_ok(f"{var} is set: {os.environ[var]}")
        else:
            print_bad(f"{var} is NOT set.")

def check_api_endpoint():
    print("\nChecking API endpoint configuration...")
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    google_api_key = os.environ.get("GOOGLE_API_KEY")
    google_cloud_project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    google_cloud_location = os.environ.get("GOOGLE_CLOUD_LOCATION")

    auth_type = None
    if gemini_api_key:
        auth_type = "USE_GEMINI"
        print("  + Using Gemini API key.")
        print("  - Endpoint: generativelanguage.googleapis.com")
    elif google_api_key or (google_cloud_project and google_cloud_location):
        auth_type = "USE_VERTEX_AI"
        print("  + Using Vertex AI.")
        if google_cloud_location:
            print(f"  - Endpoint: {google_cloud_location}-aiplatform.googleapis.com")
        else:
            print("  - GOOGLE_CLOUD_LOCATION is not set, cannot determine endpoint.")
    else:
        print("  - No API key or Vertex AI configuration found.")


def main():
    print("Gemini Doctor: Environment Diagnostics\n")
    check_node_version()
    check_cli_version()
    check_gcloud_auth()
    check_env()
    check_api_endpoint()
    print("\nDoctor checks complete.")

if __name__ == "__main__":
    main()
