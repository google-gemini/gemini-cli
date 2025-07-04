
import os
import sys

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
        "packages/cli/src/gemini.tsx",
        "packages/cli/src/commands/searchFiles.ts",
        "packages/cli/src/commands/listFiles.ts",
        "packages/cli/src/commands/generate.ts",
        "packages/cli/src/commands/fileInfo.ts",
        "packages/cli/src/commands/explain.ts",
        "packages/cli/src/commands/deleteFile.ts",
        "packages/cli/src/commands/debug.ts",
        "packages/cli/src/config/settings.ts",
        "packages/cli/src/ui/App.tsx",
        "packages/cli/src/ui/components/InputPrompt.tsx",
        "packages/cli/src/ui/components/EditorSettingsDialog.tsx",
        "packages/cli/src/ui/components/ConsolePatcher.tsx"
    ]
    
    for file_path in files_to_process:
        replace_in_file(file_path, "import { logger } from '@google/gemini-cli-core';", "import { Logger } from '@google/gemini-cli-core';")
        replace_in_file(file_path, "logger.", "new Logger().")

if __name__ == "__main__":
    main()
