import os
import subprocess
import json

GREEN = '\033[92m'
RED = '\033[91m'
RESET = '\033[0m'

def print_ok(msg):
    print(f"{GREEN}{msg} [OK]{RESET}")

def print_bad(msg):
    print(f"{RED}{msg} [NOT IN GOOD SHAPE]{RESET}")

def check_node_version():
    print("Checking Node.js version...")
    required = (20, 0, 0)
    try:
        version = subprocess.check_output(["node", "-v"]).decode().strip().lstrip('v')
        major, minor, patch = map(int, version.split('.'))
        if (major, minor, patch) < required:
            print_bad(f"Node.js version {version} is too old. Required: >=20.0.0")
        else:
            print_ok(f"Node.js version {version}")
    except Exception as e:
        print_bad(f"Node.js not found: {e}")

def check_cli_version():
    print("\nChecking Gemini CLI version...")
    try:
        with open("package.json") as f:
            data = json.load(f)
            version = data.get("version")
            if version:
                print_ok(f"Gemini CLI version {version} is OK.")
            else:
                print_bad("Gemini CLI version not found in package.json.")
    except Exception as e:
        print_bad(f"Could not read package.json: {e}")

def check_gcloud_auth():
    print("\nChecking gcloud authentication...")
    adc_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if adc_path and os.path.exists(adc_path):
        print_ok(f"ADC file found: {adc_path}")
    else:
        print_bad("ADC file not found or GOOGLE_APPLICATION_CREDENTIALS not set.")
    try:
        subprocess.check_output(["gcloud", "auth", "application-default", "print-access-token"], stderr=subprocess.STDOUT)
        print_ok("gcloud ADC authentication")
    except Exception as e:
        print_bad(f"gcloud ADC authentication failed: {e}")

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
