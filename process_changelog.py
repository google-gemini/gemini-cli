import re
import sys

raw_data = sys.stdin.read()

# Reformat PR links
def reformat_pr(match):
    description = match.group(1)
    user = match.group(2)
    url = match.group(3)
    # Extract PR number from URL
    pr_number = url.split('/')[-1]
    return f"* {description} by {user} in [#{pr_number}]({url})"

# Pattern matches: * Description by @user in URL
# We want to match the whole line for reformatting
pattern = r"\* (.*?) by (@[\w-]+) in (https://github\.com/google-gemini/gemini-cli/pull/\d+)"
processed_data = re.sub(pattern, reformat_pr, raw_data)

# Remove New Contributors section
if "**New Contributors**" in processed_data:
    parts = processed_data.split("**New Contributors**")
    # First part is what's changed
    # Second part might have Full Changelog at the end
    processed_data = parts[0].strip()
    if "**Full Changelog**" in parts[1]:
        full_changelog = parts[1].split("**Full Changelog**")[1].strip()
        processed_data += "\n\n**Full Changelog**: " + full_changelog
else:
    # If no New Contributors, ensure Full Changelog is correctly formatted if it's there
    pass

print(processed_data)
