import unittest
import subprocess
import os
import shutil
import tempfile

# Assuming replace_in_file.py is in the same directory or accessible in PATH
SCRIPT_PATH = "./replace_in_file.py"

class TestReplaceInFile(unittest.TestCase):

    def setUp(self):
        # Create a temporary directory to store test files
        self.test_dir = tempfile.mkdtemp()
        self.test_file_path = os.path.join(self.test_dir, "test_file.txt")
        self.test_file_alt_path = os.path.join(self.test_dir, "alt_file.txt")

    def tearDown(self):
        # Remove the temporary directory and its contents
        shutil.rmtree(self.test_dir)

    def create_file(self, filepath, content=""):
        with open(filepath, "w") as f:
            f.write(content)

    def read_file(self, filepath):
        if not os.path.exists(filepath):
            return None
        with open(filepath, "r") as f:
            return f.read()

    def run_script(self, args):
        cmd = ["python3", SCRIPT_PATH] + args
        # print(f"Running command: {shlex.join(cmd)}") # For debugging tests
        return subprocess.run(cmd, capture_output=True, text=True)

    def test_simple_replace_single_file(self):
        content = "Hello world, this is a test world."
        self.create_file(self.test_file_path, content)
        result = self.run_script(["world", "planet", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed with error: {result.stderr}")
        modified_content = self.read_file(self.test_file_path)
        self.assertEqual(modified_content, "Hello planet, this is a test planet.")
        self.assertIn(f"Modified: {self.test_file_path}", result.stdout)
        self.assertIn("1 file(s) potentially modified", result.stdout)

    def test_regex_replace(self):
        content = "error123, error456, success789, errorABC"
        self.create_file(self.test_file_path, content)
        result = self.run_script(["--regex", "error[0-9]+", "ERROR_CODE", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed with error: {result.stderr}")
        modified_content = self.read_file(self.test_file_path)
        self.assertEqual(modified_content, "ERROR_CODE, ERROR_CODE, success789, errorABC")
        self.assertIn(f"Modified: {self.test_file_path}", result.stdout)

    def test_dry_run(self):
        original_content = "This is a line. This is another line."
        self.create_file(self.test_file_path, original_content)
        result = self.run_script(["--dry-run", "line", "sentence", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed with error: {result.stderr}")
        content_after_dry_run = self.read_file(self.test_file_path)
        self.assertEqual(content_after_dry_run, original_content)
        self.assertIn(f"--- Dry run: Proposed changes for {self.test_file_path} ---", result.stdout)
        self.assertIn("This is a sentence. This is another sentence.", result.stdout)
        self.assertIn("Dry run complete. 1 files scanned for changes.", result.stdout)
        self.assertNotIn("Modified:", result.stdout)

    def test_dry_run_no_changes(self):
        original_content = "This content will not change."
        self.create_file(self.test_file_path, original_content)
        result = self.run_script(["--dry-run", "nonexistent", "replacement", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr}")
        content_after_dry_run = self.read_file(self.test_file_path)
        self.assertEqual(content_after_dry_run, original_content, "File content should not change on dry run")
        self.assertIn(f"Dry run: No changes proposed for {self.test_file_path}", result.stdout)
        self.assertNotIn("--- Dry run: Proposed changes for", result.stdout)
        self.assertIn("Dry run complete. 1 files scanned for changes.", result.stdout)

    def test_backup_default_suffix(self):
        original_content = "Backup this line. And this line."
        self.create_file(self.test_file_path, original_content)
        backup_file_path = self.test_file_path + ".bak"
        result = self.run_script(["--backup", "line", "entry", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr}")
        modified_content = self.read_file(self.test_file_path)
        self.assertEqual(modified_content, "Backup this entry. And this entry.")
        self.assertTrue(os.path.exists(backup_file_path), "Backup file was not created.")
        backup_content = self.read_file(backup_file_path)
        self.assertEqual(backup_content, original_content, "Backup content does not match original.")
        self.assertIn(f"Modified: {self.test_file_path} (backup created: {backup_file_path})", result.stdout)

    def test_backup_custom_suffix(self):
        original_content = "Custom backup suffix test."
        self.create_file(self.test_file_path, original_content)
        custom_suffix = ".orig_test" # Made suffix more unique
        backup_file_path = self.test_file_path + custom_suffix
        result = self.run_script([f"--backup={custom_suffix}", "Custom", "Changed", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr}")
        modified_content = self.read_file(self.test_file_path)
        self.assertEqual(modified_content, "Changed backup suffix test.")
        self.assertTrue(os.path.exists(backup_file_path), "Custom backup file was not created.")
        backup_content = self.read_file(backup_file_path)
        self.assertEqual(backup_content, original_content, "Custom backup content does not match original.")
        self.assertIn(f"Modified: {self.test_file_path} (backup created: {backup_file_path})", result.stdout)

    def test_backup_and_dry_run(self):
        original_content = "Dry run with backup flag."
        self.create_file(self.test_file_path, original_content)
        backup_file_path = self.test_file_path + ".bak"
        result = self.run_script(["--dry-run", "--backup", "flag", "option", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr}")
        self.assertFalse(os.path.exists(backup_file_path), "Backup file should not be created with dry-run.")
        content_after_run = self.read_file(self.test_file_path)
        self.assertEqual(content_after_run, original_content, "File should not be modified by dry-run.")
        self.assertIn(f"--- Dry run: Proposed changes for {self.test_file_path} ---", result.stdout)
        self.assertNotIn("backup created", result.stdout.lower())

    def test_ignore_case_replace(self):
        content = "Hello World, hello world, HELLO world."
        self.create_file(self.test_file_path, content)
        result = self.run_script(["--ignore-case", "hello", "Hi", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr}")
        modified_content = self.read_file(self.test_file_path)
        self.assertEqual(modified_content, "Hi World, Hi world, Hi world.")
        self.assertIn(f"Modified: {self.test_file_path}", result.stdout)

    def test_multiple_files_globbing(self):
        file1_glob_path = os.path.join(self.test_dir, "glob_test_1.txt")
        file2_glob_path = os.path.join(self.test_dir, "glob_test_2.txt")
        file3_other_ext_path = os.path.join(self.test_dir, "glob_test_3.log")
        self.create_file(file1_glob_path, "Glob one old_word here.")
        self.create_file(file2_glob_path, "Glob two old_word there.")
        self.create_file(file3_other_ext_path, "Log file old_word also.")

        glob_pattern = os.path.join(self.test_dir, "glob_test_*.txt") # Only matches .txt
        result = self.run_script(["old_word", "new_word", glob_pattern])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr} -- {result.stdout}")

        modified_content1 = self.read_file(file1_glob_path)
        self.assertEqual(modified_content1, "Glob one new_word here.")
        self.assertIn(f"Modified: {file1_glob_path}", result.stdout)

        modified_content2 = self.read_file(file2_glob_path)
        self.assertEqual(modified_content2, "Glob two new_word there.")
        self.assertIn(f"Modified: {file2_glob_path}", result.stdout)

        # Ensure the .log file was not touched
        unmodified_log_content = self.read_file(file3_other_ext_path)
        self.assertEqual(unmodified_log_content, "Log file old_word also.")
        self.assertNotIn(f"Modified: {file3_other_ext_path}", result.stdout)

        self.assertIn("2 file(s) potentially modified", result.stdout)

    def test_file_not_found_error_direct_arg(self):
        non_existent_file = os.path.join(self.test_dir, "non_existent_file.txt")
        # This tests when a specific file argument does not exist.
        result = self.run_script(["old", "new", non_existent_file])
        self.assertNotEqual(result.returncode, 0, "Script should exit with error for non-existent file.")
        # The script exits with 1 if no valid files are found after checks.
        # Stderr will contain "Error: File '...' does not exist." and then "Error: No valid files available..."
        self.assertIn(f"Error: File '{non_existent_file}' (from pattern or direct input) does not exist.", result.stderr)
        self.assertIn("Error: No valid files available for processing after checks.", result.stderr)


    def test_no_files_match_glob(self):
        # This tests when a glob pattern matches no files.
        glob_pattern = os.path.join(self.test_dir, "non_matching_glob_*.foo")
        result = self.run_script(["old", "new", glob_pattern])
        self.assertNotEqual(result.returncode, 0, "Script should exit with error if glob matches no files.")
        self.assertIn(f"Info: Pattern '{glob_pattern}' did not match any files.", result.stderr) # Info message
        self.assertIn("Error: No files found to process based on the input patterns.", result.stderr) # Actual error leading to exit

    def test_replace_with_slashes_literal(self):
        content = "path/to/old_file and another path/to/old_file"
        self.create_file(self.test_file_path, content)
        result = self.run_script(["path/to/old_file", "new/path/for/file", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr}")
        modified_content = self.read_file(self.test_file_path)
        self.assertEqual(modified_content, "new/path/for/file and another new/path/for/file")
        self.assertIn(f"Modified: {self.test_file_path}", result.stdout)

    def test_replace_with_slashes_regex(self):
        content = "url=http://example.com/path"
        self.create_file(self.test_file_path, content)
        # Search: (http://)([^/]+)(/path) -> Replace: \1\2/new_path
        # Python raw strings are used to avoid issues with backslashes
        search_pattern_regex = r"(http://)([^/]+)(/path)"
        replace_string_regex = r"\1\2/new_path" # sed uses \1, \2 for backreferences

        result = self.run_script([
            "--regex",
            search_pattern_regex,
            replace_string_regex,
            self.test_file_path
        ])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr} - stdout: {result.stdout}")
        modified_content = self.read_file(self.test_file_path)
        self.assertEqual(modified_content, "url=http://example.com/new_path")
        self.assertIn(f"Modified: {self.test_file_path}", result.stdout)

    def test_no_match_replacement(self):
        content = "This file has no target string."
        self.create_file(self.test_file_path, content)
        result = self.run_script(["nonexistent_string", "replacement", self.test_file_path])
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr}")
        modified_content = self.read_file(self.test_file_path)
        self.assertEqual(modified_content, content, "Content should not change if no match.")
        # The script currently prints "Modified:" even if no actual change by sed.
        # This is because sed exits 0 even if no substitution is made.
        # We could enhance the script to detect no-op changes if necessary,
        # but for now, this behavior is acceptable as per typical sed wrapper.
        self.assertIn(f"Modified: {self.test_file_path}", result.stdout)

if __name__ == "__main__":
    # It's good practice to ensure the script is executable if it's not installed
    if not os.access(SCRIPT_PATH, os.X_OK):
        print(f"Warning: {SCRIPT_PATH} is not executable. Attempting to run with python3 interpreter.")
    unittest.main()
