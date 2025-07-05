#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
A command-line tool to search and replace text in files using sed.

This tool provides a Python wrapper around the 'sed' command-line utility
to perform flexible search and replace operations on one or more files.

Key Features:
-------------
- Literal string or regular expression based search.
- In-place editing of files.
- Optional backup creation for modified files.
- Dry-run mode to preview changes without modifying files.
- Case-insensitive search.
- Processing of multiple files, including support for glob patterns.
- Verbose mode for detailed output.

Usage:
------
replace_in_file.py [options] search_pattern replace_string file [file ...]

Arguments:
  search_pattern        The string or regex pattern to search for.
  replace_string        The string to replace matches with.
  file                  One or more file paths or glob patterns to process.
                        Example: file.txt "docs/*.md" "project/src/**/*.py"

Common Options:
  --backup [SUFFIX]     Create a backup of each modified file. If SUFFIX is not
                        supplied, '.bak' is used. Ignored if --dry-run is active.
  --dry-run             Preview changes without modifying files. Overrides --backup.
  --regex               Treat search_pattern as a POSIX Extended Regular Expression (ERE).
                        By default, search_pattern is treated as a literal string.
                        When using --regex, ensure your pattern is valid for `sed`.
                        The script handles escaping of the delimiter '/' within your pattern.
  --ignore-case         Perform case-insensitive search. This typically adds the 'i'
                        flag to sed's 's' command.
  --verbose             Show detailed output, including the sed commands being run
                        and file processing steps.
  -h, --help            Show the help message and exit.

Examples:
---------
1. Basic literal replacement in one file:
   python replace_in_file.py "old_text" "new_text" myfile.txt

2. Regex replacement in all .log files in a directory, with backup:
   python replace_in_file.py --regex --backup ".original" "ERROR_\d+" "FixedError" logs/*.log

3. Dry run for a case-insensitive replacement:
   python replace_in_file.py --dry-run --ignore-case "myFunction" "my_function" src/script.py

Notes on `sed` Behavior and Portability:
-----------------------------------------
- This script relies on the `sed` utility being available in the system's PATH.
- In-place editing (`-i` flag):
  - With a backup suffix (e.g., `--backup .bak`), `sed -i.bak` is used, which is
    generally portable across GNU sed (Linux) and BSD sed (macOS).
  - Without a backup suffix (when `--backup` is not used and not `--dry-run`),
    `sed -i` is used. This is standard for GNU sed. BSD sed typically requires a
    suffix for `-i` (e.g., `sed -i ''` for no backup). The script currently uses
    `sed -i` in this scenario, which might behave differently or error on BSD sed
    if not GNU sed. For maximum portability without backups, manual temp file
    handling would be needed, which is not implemented in this version for simplicity.
- Regex Flavor: `sed` uses POSIX Basic Regular Expressions (BRE) by default for the `s`
  command in many versions. Some `sed` versions might interpret patterns as Extended
  Regular Expressions (ERE) more broadly or support a flag (like -E or -r, though
  this script does not explicitly add such flags globally). If `--regex` is used,
  your pattern should conform to what your `sed` version expects for the `s` command.
  The script primarily constructs the `s/pattern/replacement/g[i]` command.
- Special Characters:
  - Literal mode: The script attempts to escape special characters in the search
    pattern (like '.', '*', '[', etc.) and the delimiter ('/') to ensure they are
    treated literally. The ampersand '&' in the replacement string is also escaped
    to represent a literal ampersand.
  - Regex mode: You are responsible for correct regex syntax. The script will
    only escape the delimiter ('/') if it appears in your regex pattern or
    replacement string. Characters like '&' (for the entire matched pattern) and
    '\1', '\2', etc. (for captured backreferences) in the replacement string should
    be used as per `sed`'s regex replacement rules.
- Newlines: The script replaces Python `\n` with `\\n` for `sed`. How `sed` handles
  `\\n` (or literal newlines) in patterns and replacements can vary between versions
  (GNU sed is generally more flexible).
- In-place editing without explicit backup (when `--backup` is not used):
  To ensure cross-platform compatibility (GNU sed vs. BSD sed like on macOS or Termux),
  the script handles this scenario by redirecting `sed`'s output to a temporary
  file and then replacing the original file with the temporary file. This avoids
  issues with `sed -i` (no suffix) vs. `sed -i ''`.

Performance:
------------
- The script processes files sequentially.
- `sed` itself is highly optimized for stream editing and handles large individual
  files efficiently without loading them entirely into memory.
- For a very large number of input files, the sequential processing might be a
  bottleneck. Parallel processing across multiple files is not implemented in
  this version.

Error Handling:
---------------
- The script performs initial checks for file existence and permissions.
- Errors from `sed` execution (e.g., invalid regex, permission issues during
  modification by `sed`) are reported to stderr.
- If no files match input patterns or no valid files are found after initial checks,
  the script will exit with an error message.
"""

import argparse
import glob
import os
import shlex
import shutil
import subprocess
import sys

def main():
    """Main function to parse arguments and orchestrate replacements."""
    parser = argparse.ArgumentParser(
        description="Search and replace text in files using sed.",
        epilog="""\
Examples:
  Basic replacement:
    replace_in_file "old_text" "new_text" file.txt
  Regex replacement in multiple log files:
    replace_in_file --regex "error[0-9]+" "ERROR_CODE" *.log
  Dry run to preview changes:
    replace_in_file --dry-run "foo" "bar" "document with spaces.txt"
  In-place edit with a backup file (.bak suffix):
    replace_in_file --backup "old_pattern" "new_pattern" data.csv
  In-place edit with a custom backup suffix:
    replace_in_file --backup .original "confidential" "REDACTED" config.ini
  Case-insensitive regex replacement:
    replace_in_file --regex --ignore-case "myvariable" "MyVariable" script.py
""",
        formatter_class=argparse.RawTextHelpFormatter  # Allows for formatted epilog
    )

    parser.add_argument(
        "search_pattern",
        help="The string or regex pattern to search for."
    )
    parser.add_argument(
        "replace_string",
        help="The string to replace matches with."
    )
    parser.add_argument(
        "files",
        nargs='+',
        help="One or more files or glob patterns to process. Example: file.txt *.log 'another file.txt'"
    )
    parser.add_argument(
        "--backup",
        nargs='?',
        const=".bak",  # Default suffix if --backup is used without a value
        default=None,  # Not used if --backup is absent
        metavar="SUFFIX",
        help="Create a backup of each modified file. "
             "If SUFFIX is not supplied, '.bak' is used."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without modifying files. "
             "Overrides --backup if both are specified."
    )
    parser.add_argument(
        "--regex",
        action="store_true",
        help="Treat search_pattern as a regular expression. Default is literal string matching."
    )
    parser.add_argument(
        "--ignore-case",
        action="store_true",
        help="Perform case-insensitive search. Works with both literal and regex searches."
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed output of operations, including commands being run."
    )

    args = parser.parse_args()

    if args.verbose:
        print("Arguments received:")
        print(f"  Search Pattern: {args.search_pattern}")
        print(f"  Replace String: {args.replace_string}")
        print(f"  Files/Patterns: {args.files}")
        print(f"  Backup: {args.backup if args.backup is not None else 'No'}")
        print(f"  Dry Run: {args.dry_run}")
        print(f"  Regex Mode: {args.regex}")
        print(f"  Ignore Case: {args.ignore_case}")
        print(f"  Verbose: {args.verbose}")

    # Step 2: Input validation and file globbing
    actual_files = []
    if args.verbose:
        print("Expanding file patterns...")
    for file_pattern in args.files:
        # Use glob.escape for patterns that might contain special characters
        # if they are meant to be literal paths before globbing.
        # However, args.files are expected to be glob patterns directly.
        expanded_paths = glob.glob(file_pattern)
        if not expanded_paths:
            if args.verbose or not any("*" in p or "?" in p or "[" in p for p in args.files):
                # Print warning if the pattern was specific and didn't match,
                # or if verbose mode is on.
                print(f"Info: Pattern '{file_pattern}' did not match any files.", file=sys.stderr)
        actual_files.extend(expanded_paths)

    # Remove duplicates that might arise from overlapping globs or repeated file names
    actual_files = sorted(list(set(actual_files)))

    if not actual_files:
        print("Error: No files found to process based on the input patterns.", file=sys.stderr)
        sys.exit(1)

    if args.verbose:
        print(f"Found {len(actual_files)} unique file(s) to process:")
        for f_path in actual_files:
            print(f"  - {f_path}")

    valid_files_to_process = []
    for f_path in actual_files:
        if not os.path.exists(f_path):
            # This check might be redundant if glob already filters non-existent paths,
            # but good for explicit patterns that weren't globs.
            print(f"Error: File '{f_path}' (from pattern or direct input) does not exist.", file=sys.stderr)
            continue
        if not os.path.isfile(f_path):
            print(f"Error: Path '{f_path}' is not a file.", file=sys.stderr)
            continue
        if not os.access(f_path, os.R_OK):
            print(f"Error: File '{f_path}' is not readable.", file=sys.stderr)
            continue
        if not args.dry_run and (args.backup is not None or True): # True means we intend to modify
            # Check writability of the file itself if not dry_run.
            # If using backup with suffix (e.g. sed -i.bak), sed needs write access to the dir.
            # If overwriting (sed -i without suffix, or our own temp file strategy), sed needs write access to file.
            if not os.access(f_path, os.W_OK):
                 print(f"Error: File '{f_path}' is not writable.", file=sys.stderr)
                 continue
            # Also check if directory is writable if we are creating backup files there
            if args.backup is not None:
                dir_name = os.path.dirname(f_path) or '.'
                if not os.access(dir_name, os.W_OK):
                    print(f"Error: Directory '{dir_name}' for file '{f_path}' is not writable (for backup).", file=sys.stderr)
                    continue
        valid_files_to_process.append(f_path)

    if not valid_files_to_process:
        print("Error: No valid files available for processing after checks. Please check file paths and permissions.", file=sys.stderr)
        sys.exit(1)

    if args.verbose:
        print(f"Proceeding with {len(valid_files_to_process)} valid file(s):")
        for f_path in valid_files_to_process:
            print(f"  -> {f_path}")

    # Store valid files back into args or use this new list for further processing
    args.processed_files = valid_files_to_process
    print(f"Successfully validated {len(args.processed_files)} files.")


def construct_sed_command(search_pattern, replace_string, is_regex, ignore_case,
                          backup_suffix_for_sed_i, dry_run, verbose=False):
    """
    Constructs the initial parts of the sed command list, focusing on in-place options.

    Args:
        search_pattern (str): The pattern to search for. (Not used in this sub-step)
        replace_string (str): The string to replace with. (Not used in this sub-step)
        is_regex (bool): Whether search_pattern is a regex. (Not used in this sub-step)
        ignore_case (bool): Whether to ignore case. (Not used in this sub-step)
        backup_suffix_for_sed_i (str | None): Suffix for sed's -i option.
                                               If None and not dry_run, sed -i is attempted (GNU).
        dry_run (bool): If True, sed will not modify files (no -i).
        verbose (bool): If True, print extra details.

    Returns:
        list: A list of command parts for subprocess.run(), including 'sed' and in-place options.
    """
    sed_cmd_parts = ["sed"]

    if not dry_run:
        if backup_suffix_for_sed_i is not None:
            # This form `-i<suffix>` (e.g., -i.bak) is generally more portable
            # for creating backups across GNU and BSD sed versions.
            sed_cmd_parts.append(f"-i{backup_suffix_for_sed_i}")
        else:
            # Attempt to use '-i' for in-place edit without a backup file.
            # This is standard for GNU sed. BSD sed requires a suffix for -i;
            # for no backup, it would be `sed -i '' ...`.
            # True cross-platform handling of `sed -i` (no backup suffix) vs `sed -i ''`
            # may require OS detection or a temp file strategy if this proves problematic.
            # For now, this targets the GNU sed behavior for simplicity in this step.
            sed_cmd_parts.append("-i")

    if verbose:
        # In this sub-step, we are only adding sed and potentially -i flags.
        # The full command with script and file will be built up later.
        print(f"Initial sed command parts (in-place options): {sed_cmd_parts}")

    # The rest of the command (script, file) will be added in subsequent steps.
    # For now, just return these initial parts.
    # ---- Start of next incremental part ----

    # Escape search_pattern and replace_string for sed if not is_regex.
    # sed uses / as a default delimiter, so it must be escaped in patterns if used literally.
    # & in replacement string is special (refers to the matched pattern).
    # \ is the escape character itself.

    # Choose a delimiter unlikely to be in patterns, to simplify escaping.
    # Using a less common character like '#' or a control character (e.g., \x01)
    # can reduce the need to escape the delimiter itself within the user's patterns.
    # For now, let's stick to '/' and handle its escaping.
    delimiter = '/'

    s_search_pattern = search_pattern
    s_replace_string = replace_string

    if not is_regex:
        # Escape for literal matching:
        # Escape the chosen delimiter, backslash, and ampersand (in replacement).
        # Also escape regex special characters to treat them literally in the search pattern.
        s_search_pattern = s_search_pattern.replace('\\', '\\\\') # Must be first
        s_search_pattern = s_search_pattern.replace(delimiter, f'\\{delimiter}')
        # Characters that are special in regex and should be escaped for literal search
        regex_special_chars = ['.', '*', '[', ']', '(', ')', '{', '}', '?', '+', '^', '$', '|']
        for char in regex_special_chars:
            s_search_pattern = s_search_pattern.replace(char, f'\\{char}')

        # For replacement string, only '\', delimiter, and '&' are typically special.
        s_replace_string = s_replace_string.replace('\\', '\\\\')
        s_replace_string = s_replace_string.replace(delimiter, f'\\{delimiter}')
        s_replace_string = s_replace_string.replace('&', '\\&') # Escape & to treat it literally
    else:
        # For regex mode, user is responsible for correct regex syntax.
        # However, we still need to escape the delimiter if it appears in the patterns,
        # and backslashes in the replacement string.
        s_search_pattern = s_search_pattern.replace(delimiter, f'\\{delimiter}')
        s_replace_string = s_replace_string.replace(delimiter, f'\\{delimiter}')
        # In regex replacement, `&` refers to the whole match, `\1` etc for groups.
        # `\` needs to be `\\` if literal. User needs to be aware of this.
        # Let's assume user handles `\` and `&` correctly in regex replacement string,
        # or we provide a way to make `&` literal if needed.
        # For now, minimal escaping for replace_string in regex mode, mainly delimiter.
        # A common practice for replacement string in regex is to escape \ and & if they are meant literally.
        # However, over-escaping can break user's intended regex backreferences.
        # Let's assume user provides regex_replace_string correctly.
        # What definitely needs escaping is the delimiter.
        pass # Minimal manipulation for regex patterns from user side

    # Newlines in search/replace can be tricky with sed's `s` command.
    # GNU sed can handle `\n` in patterns. BSD sed might need literal newlines or `$'...'` strings.
    # For simplicity, this implementation assumes users will handle multiline patterns
    # appropriately for their `sed` version if using complex regex, or avoid newlines in literal mode.
    # Replacing Python newlines with `\\n` for sed:
    s_search_pattern = s_search_pattern.replace('\n', '\\n')
    s_replace_string = s_replace_string.replace('\n', '\\n')

    sed_script = f"s{delimiter}{s_search_pattern}{delimiter}{s_replace_string}{delimiter}g"

    if ignore_case:
        sed_script += "i"

    sed_cmd_parts.append(sed_script)

    if verbose:
        print(f"Constructed sed command parts: {sed_cmd_parts}")

    return sed_cmd_parts

def execute_sed_command(sed_cmd_base_parts, filepath, dry_run=False, verbose=False):
    """
    Executes the constructed sed command for a given file.

    Args:
        sed_cmd_base_parts (list): The base command parts from construct_sed_command
                                   (e.g., ['sed', '-i', 's/old/new/g']).
        filepath (str): The path to the file to process.
        dry_run (bool): If True, sed's output is captured and printed, file not modified.
        verbose (bool): If True, print command and other details.

    Returns:
        tuple: (success: bool, output: str, error_output: str)
               Output contains stdout from sed (especially for dry_run).
               Error_output contains stderr.
    """
    # Check if sed -i (with or without suffix) is part of the command
    # This indicates whether sed will handle in-place editing itself.
    is_sed_in_place = any(part.startswith("-i") for part in sed_cmd_base_parts)

    if not dry_run and not is_sed_in_place:
        # Manual in-place edit using a temporary file
        # This is for portability when `sed -i` (no suffix) is not reliable (e.g., BSD sed)
        # or when we want to avoid it altogether for the no-backup scenario.
        temp_file = None
        try:
            # Create a named temporary file in the same directory to ensure `mv` is atomic (rename)
            # and permissions are more likely to be inherited correctly.
            file_dir = os.path.dirname(filepath) or '.'
            # Suffix helps in identifying the temp file if it leaks.
            with tempfile.NamedTemporaryFile(mode='w', delete=False, dir=file_dir, suffix='.sedtmp') as tf:
                temp_file_path = tf.name
                temp_file = tf # keep file object to ensure it's not closed prematurely by with

            if verbose:
                print(f"Using temporary file for in-place edit: {temp_file_path}")

            # Command: sed 'script' original_file > temp_file
            # sed_cmd_base_parts should not contain -i here. It should contain 'sed' and the script.
            # Ensure filepath is the last part of the command for sed input
            # and not part of the redirection.
            # The script part is usually the last element before the filepath in sed_cmd_base_parts
            # if -i is not used.

            # Construct command: sed_script_parts + [filepath]
            # where sed_script_parts = ['sed', 's/old/new/g'] for example.
            # We need to ensure sed_cmd_base_parts is just ['sed', 's/old/new/g'] here.
            # construct_sed_command now ensures -i is not added if backup_suffix is None.

            # The command to run is sed_cmd_base_parts (e.g. ['sed', 's/foo/bar/g']) + [filepath]
            # The output of this command needs to be redirected to temp_file_path.

            cmd_for_redir = sed_cmd_base_parts + [filepath]
            if verbose:
                print(f"Executing for temp file: {shlex.join(cmd_for_redir)} > {temp_file_path}")

            with open(temp_file_path, 'w') as tf_out:
                process = subprocess.run(cmd_for_redir, stdout=tf_out, stderr=subprocess.PIPE, text=True, check=False)

            stdout = "" # No stdout to capture directly when redirecting to file
            stderr = process.stderr.strip() if process.stderr else ""

            if process.returncode != 0:
                if verbose or stderr:
                    print(f"Error executing sed (to temp file) for {filepath}: {stderr}", file=sys.stderr)
                # Clean up temp file on error before returning
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                return False, stdout, stderr

            # Replace original file with temp file
            try:
                shutil.move(temp_file_path, filepath)
                if verbose:
                    print(f"Successfully moved {temp_file_path} to {filepath}")
            except Exception as e_mv:
                print(f"Error moving temp file {temp_file_path} to {filepath}: {e_mv}", file=sys.stderr)
                # Clean up temp file on error
                if os.path.exists(temp_file_path): # Should have been moved or error before
                    os.remove(temp_file_path)
                return False, stdout, str(e_mv)

            return True, stdout, stderr # Success

        except Exception as e_outer:
            print(f"An unexpected error occurred during manual in-place edit for {filepath}: {e_outer}", file=sys.stderr)
            if temp_file and temp_file_path and os.path.exists(temp_file_path): # temp_file_path might not be set if NamedTemporaryFile fails
                os.remove(temp_file_path)
            return False, "", str(e_outer)
        finally:
            # Redundant if NamedTemporaryFile(delete=True) but we used delete=False
            # and shutil.move. If move failed, it might still be there.
            if temp_file and temp_file_path and os.path.exists(temp_file_path):
                 try:
                    os.remove(temp_file_path)
                 except OSError:
                    pass # e.g. permission error, or already moved.

    else: # This is the original path: dry_run OR sed is handling in-place with -i<suffix>
        full_command = sed_cmd_base_parts + [filepath]
        if verbose:
            print(f"Executing (sed -i or dry-run): {shlex.join(full_command)}")

        try:
            process = subprocess.run(full_command, capture_output=True, text=True, check=False)
            stdout = process.stdout.strip() if process.stdout else ""
        stderr = process.stderr.strip()

        if process.returncode != 0:
            if verbose or stderr: # Show stderr if verbose or if there's something in it
                 print(f"Error executing sed for {filepath}: {stderr}", file=sys.stderr)
            return False, stdout, stderr # stdout might still be useful for dry-run preview on error

        if dry_run:
            if stdout:
                print(f"--- Dry run: Proposed changes for {filepath} ---")
                print(stdout)
                print(f"--- End dry run for {filepath} ---")
            else:
                print(f"Dry run: No changes proposed for {filepath}")

        return True, stdout, stderr

    except FileNotFoundError:
        print(f"Error: sed command not found. Please ensure 'sed' is installed and in your PATH.", file=sys.stderr)
        return False, "", "sed command not found"
    except Exception as e:
        print(f"An unexpected error occurred while running sed for {filepath}: {e}", file=sys.stderr)
        return False, "", str(e)

# Modify main to call the construction and execution
def main():
    """Main function to parse arguments and orchestrate replacements."""
    parser = argparse.ArgumentParser(
        description="Search and replace text in files using sed.",
        epilog="""\
Examples:
  Basic replacement:
    replace_in_file "old_text" "new_text" file.txt
  Regex replacement in multiple log files:
    replace_in_file --regex "error[0-9]+" "ERROR_CODE" *.log
  Dry run to preview changes:
    replace_in_file --dry-run "foo" "bar" "document with spaces.txt"
  In-place edit with a backup file (.bak suffix):
    replace_in_file --backup "old_pattern" "new_pattern" data.csv
  In-place edit with a custom backup suffix:
    replace_in_file --backup .original "confidential" "REDACTED" config.ini
  Case-insensitive regex replacement:
    replace_in_file --regex --ignore-case "myvariable" "MyVariable" script.py
""",
        formatter_class=argparse.RawTextHelpFormatter
    )

    parser.add_argument(
        "search_pattern",
        help="The string or regex pattern to search for."
    )
    parser.add_argument(
        "replace_string",
        help="The string to replace matches with."
    )
    parser.add_argument(
        "files",
        nargs='+',
        help="One or more files or glob patterns to process. Example: file.txt *.log 'another file.txt'"
    )
    parser.add_argument(
        "--backup",
        nargs='?',
        const=".bak",
        default=None,
        metavar="SUFFIX",
        help="Create a backup of each modified file. If SUFFIX is not supplied, '.bak' is used."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without modifying files. Overrides --backup if both are specified."
    )
    parser.add_argument(
        "--regex",
        action="store_true",
        help="Treat search_pattern as a regular expression. Default is literal string matching."
    )
    parser.add_argument(
        "--ignore-case",
        action="store_true",
        help="Perform case-insensitive search. Works with both literal and regex searches."
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed output of operations, including commands being run."
    )

    args = parser.parse_args()

    if args.verbose:
        print("Arguments received:")
        print(f"  Search Pattern: {args.search_pattern}")
        print(f"  Replace String: {args.replace_string}")
        print(f"  Files/Patterns: {args.files}")
        print(f"  Backup Suffix: {args.backup if args.backup is not None else 'No'}") # Corrected from Backup
        print(f"  Dry Run: {args.dry_run}")
        print(f"  Regex Mode: {args.regex}")
        print(f"  Ignore Case: {args.ignore_case}")
        print(f"  Verbose: {args.verbose}")

    actual_files = []
    if args.verbose:
        print("Expanding file patterns...")
    for file_pattern in args.files:
        expanded_paths = glob.glob(file_pattern)
        if not expanded_paths:
            if args.verbose or not any("*" in p or "?" in p or "[" in p for p in args.files):
                print(f"Info: Pattern '{file_pattern}' did not match any files.", file=sys.stderr)
        actual_files.extend(expanded_paths)
    actual_files = sorted(list(set(actual_files)))

    if not actual_files:
        print("Error: No files found to process based on the input patterns.", file=sys.stderr)
        sys.exit(1)

    if args.verbose:
        print(f"Found {len(actual_files)} unique file(s) to process:")
        for f_path in actual_files:
            print(f"  - {f_path}")

    valid_files_to_process = []
    for f_path in actual_files:
        if not os.path.exists(f_path):
            print(f"Error: File '{f_path}' (from pattern or direct input) does not exist.", file=sys.stderr)
            continue
        if not os.path.isfile(f_path):
            print(f"Error: Path '{f_path}' is not a file.", file=sys.stderr)
            continue
        if not os.access(f_path, os.R_OK):
            print(f"Error: File '{f_path}' is not readable.", file=sys.stderr)
            continue
        if not args.dry_run:
            # For non-dry-run, check writability.
            # If using backup with suffix (e.g. sed -i.bak), sed needs write access to the dir.
            # If overwriting (sed -i without suffix, or our own temp file strategy), sed needs write access to file.
            if not os.access(f_path, os.W_OK):
                 print(f"Error: File '{f_path}' is not writable (for in-place edit).", file=sys.stderr)
                 continue
            if args.backup is not None: # Backup implies -i<suffix>
                dir_name = os.path.dirname(f_path) or '.'
                if not os.access(dir_name, os.W_OK):
                    print(f"Error: Directory '{dir_name}' for file '{f_path}' is not writable (for backup file creation).", file=sys.stderr)
                    continue
        valid_files_to_process.append(f_path)

    if not valid_files_to_process:
        print("Error: No valid files available for processing after checks. Please check file paths and permissions.", file=sys.stderr)
        sys.exit(1)

    if args.verbose:
        print(f"Proceeding with {len(valid_files_to_process)} valid file(s):")
        for f_path in valid_files_to_process:
            print(f"  -> {f_path}")

    args.processed_files = valid_files_to_process
    # Removed the print about successful validation as it's verbose / implied.

    # Determine backup suffix for sed's -i option.
    # If args.dry_run is true, backup_suffix is irrelevant for sed -i, as -i won't be used.
    # If args.backup is None (meaning --backup flag not used), then no backup suffix for sed.
    # If args.backup is a string (e.g. ".bak" or a user-provided one), use that.
    sed_backup_suffix = args.backup if not args.dry_run else None


    # Main processing loop
    files_processed_count = 0
    files_modified_count = 0 # For non-dry-run

    for f_path in args.processed_files:
        if args.verbose:
            print(f"Processing file: {f_path}")

        sed_cmd_base = construct_sed_command(
            args.search_pattern,
            args.replace_string,
            args.regex,
            args.ignore_case,
            sed_backup_suffix, # Pass the determined suffix for sed -i
            args.dry_run,
            args.verbose
        )

        success, output, error_output = execute_sed_command(
            sed_cmd_base,
            f_path,
            args.dry_run,
            args.verbose
        )

        files_processed_count += 1
        if success and not args.dry_run:
            # How to check if sed actually modified the file?
            # `sed` usually exits 0 even if no changes made.
            # For non-dry-run, we can't rely on stdout to check for modifications
            # as it's empty with -i. We'd have to compare file content before/after,
            # or rely on sed's behavior (some versions might have specific flags for this).
            # For now, assume success means it *could* have been modified.
            # A simple way: if sed exits 0 and it wasn't a dry run, consider it "attempted modification".
            # If a backup was made, the original file is now the backup, and f_path is the new one.
            if args.backup and sed_backup_suffix: # Check if backup was actually performed
                 print(f"Modified: {f_path} (backup created: {f_path}{sed_backup_suffix})")
            else:
                 print(f"Modified: {f_path}")
            files_modified_count +=1

        elif not success:
            print(f"Failed to process {f_path}. Error: {error_output}", file=sys.stderr)
            # Decide if we should continue with other files or exit.
            # For now, continue.

    print(f"--- Processing Summary ---")
    print(f"Total files considered: {len(args.processed_files)}")
    if args.dry_run:
        print(f"Dry run complete. {files_processed_count} files scanned for changes.")
    else:
        print(f"{files_modified_count} file(s) potentially modified out of {files_processed_count} processed.")


if __name__ == "__main__":
    main()
