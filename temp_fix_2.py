
import os

def replace_in_file(file_path, old_string, new_string):
    try:
        with open(file_path, 'r') as file:
            file_content = file.read()
        
        new_content = file_content.replace(old_string, new_string)
        
        with open(file_path, 'w') as file:
            file.write(new_content)
        
        print(f"Successfully replaced '{old_string}' with '{new_string}' in {file_path}")
    except Exception as e:
        print(f"Error processing file {file_path}: {e}")

def main():
    files_to_process = [
        "packages/cli/src/config/config.ts",
        "packages/cli/src/nonInteractiveCli.ts",
        "packages/cli/src/config/extension.ts"
    ]
    
    for file_path in files_to_process:
        if file_path == "packages/cli/src/config/config.ts":
            replace_in_file(file_path, "logger,", "Logger,")
        elif file_path == "packages/cli/src/nonInteractiveCli.ts":
            replace_in_file(file_path, "logger,", "Logger,")
        elif file_path == "packages/cli/src/config/extension.ts":
            replace_in_file(file_path, "import { logger, MCPServerConfig } from '@google/gemini-cli-core';", "import { Logger, MCPServerConfig } from '@google/gemini-cli-core';")
            replace_in_file(file_path, "logger.", "new Logger().")

if __name__ == "__main__":
    main()
