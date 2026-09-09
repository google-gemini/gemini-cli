import unittest
from unittest.mock import patch
from google.antigravity.types import Text
from utils.agent_logger import extract_final_output, log_agent_run
from triage_orchestrator import process_issue_triage


class TestAgentLogger(unittest.TestCase):

    def test_extract_final_output(self):
        """Verifies final step output extraction and step filtering."""
        self.assertEqual(extract_final_output(None), "")
        self.assertEqual(extract_final_output([]), "")
        chunks = [
            Text(text="Thought 1", step_index=0),
            Text(text="Result: SUCCESS", step_index=1),
            Text(text=" Additional", step_index=1),
        ]
        self.assertEqual(
            extract_final_output(chunks), "Result: SUCCESS Additional"
        )

    @patch("utils.agent_logger.upload_to_bucket")
    def test_log_agent_run(self, mock_upload):
        """Verifies log routing to GCS and serialization behavior."""
        chunks = [Text(text="Thought", step_index=0)]

        # Test OFF mode (should not call upload)
        log_agent_run("repo", 42, chunks, mode="OFF")
        mock_upload.assert_not_called()

        # Test GCS mode (should call upload and serialize the chunks)
        log_agent_run("repo", 42, chunks, mode="GCS")
        mock_upload.assert_called_once()
        
        # Verify GCS upload payload contains our serialized text
        args, _ = mock_upload.call_args
        self.assertIn('"text": "Thought"', args[2])

    @patch("triage_orchestrator.upload_to_bucket")
    @patch("triage_orchestrator.Agent")
    def test_process_issue_triage_error(self, mock_agent, mock_upload):
        """Verifies error handling and GCS upload on SDK failures."""
        mock_agent.return_value.__aenter__.side_effect = Exception("API Error")
        success, raw_output = process_issue_triage({"issue_number": 42}, target_cwd="/opt/gemini-cli")
        self.assertFalse(success)
        self.assertIn("API Error", raw_output)
        mock_upload.assert_called_once()


if __name__ == "__main__":
    unittest.main()
