#!/usr/bin/env python3
# Copyright 2026 Google LLC
# Apache-2.0 License

"""Interactive GitHub-Style Diff & File Viewer Generator for Evaluation Runs.

Generates a standalone HTML visualizer (eval_diff_viewer.html) comparing
Ground-Truth PR diffs, Agent Proposed diffs, and Original Source Files.

Usage:
    python3 evals/pr-generation/generate_diff_viewer.py --run-name large_test_1 --input-path evals/pr-generation/datasets/triage_agent_specs/large_triaged_issues
"""

import argparse
import glob
import json
import logging
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PR_GEN_DIR = Path(__file__).resolve().parent
EVALS_DIR = PR_GEN_DIR.parent
RUNS_BASE_DIR = PR_GEN_DIR / "run_outputs"
TARGET_REPO_DIR = EVALS_DIR / "triage" / "target_repo"
CARETAKER_ROOT = EVALS_DIR.parent

if str(PR_GEN_DIR) not in sys.path:
    sys.path.insert(0, str(PR_GEN_DIR))
if str(CARETAKER_ROOT) not in sys.path:
    sys.path.insert(0, str(CARETAKER_ROOT))

logger = logging.getLogger("DiffViewerGenerator")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Interactive GitHub-Style Diff Viewer Generator"
    )
    parser.add_argument(
        "--run-name", required=True, help="Run identifier (e.g. 'large_test_1')"
    )
    parser.add_argument(
        "--input-path",
        required=True,
        help="Input directory or file containing golden / triaged issue specs",
    )
    parser.add_argument(
        "--output-html",
        default=None,
        help="Optional path to output HTML file (default: <run_dir>/<run_name>_diff_viewer.html)",
    )
    return parser.parse_args()


def fetch_true_diff(owner: str, repo: str, pr_number: int) -> str:
    """Fetches the ground-truth PR diff from GitHub."""
    if not owner or not repo or not pr_number:
        return ""
    if not re.match(r"^[a-zA-Z0-9_-]+$", str(owner)) or not re.match(r"^[a-zA-Z0-9._-]+$", str(repo)):
        logger.warning("Invalid owner or repository name: %s/%s", owner, repo)
        return ""
    try:
        pr_num = int(pr_number)
        if pr_num <= 0:
            return ""
    except (ValueError, TypeError):
        return ""

    url = f"https://github.com/{owner}/{repo}/pull/{pr_num}.diff"
    headers = {"User-Agent": "SSR-Diff-Viewer"}
    token = os.environ.get("GIT_TOKEN") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8")
    except Exception as e:
        logger.warning(f"Failed to fetch true diff from GitHub ({url}): {e}")
        return ""


def get_original_file_content(version: str, file_path: str, owner: str = "google-gemini", repo: str = "gemini-cli") -> str:
    """Retrieves original source file content at a specific version via local target_repo or raw GitHub URL."""
    clean_path = file_path.lstrip("/")
    if ".." in clean_path or not re.match(r"^[a-zA-Z0-9_-]+$", str(owner)) or not re.match(r"^[a-zA-Z0-9._-]+$", str(repo)):
        return f"// Original file content unavailable for path: {clean_path}"

    # Try git show in local target_repo
    if TARGET_REPO_DIR.exists() and version:
        try:
            res = subprocess.run(
                ["git", "show", f"{version}:{clean_path}"],
                cwd=TARGET_REPO_DIR,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if res.returncode == 0 and res.stdout:
                return res.stdout
        except Exception:
            pass

    # Fallback to Raw GitHub URL
    if version and clean_path:
        url = f"https://raw.githubusercontent.com/{owner}/{repo}/{version}/{clean_path}"
        headers = {"User-Agent": "SSR-Diff-Viewer"}
        token = os.environ.get("GIT_TOKEN") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode("utf-8")
        except Exception:
            pass

    return f"// Original file content unavailable for path: {clean_path} at revision {version}"


def parse_modified_files(diff_text: str) -> List[str]:
    """Extracts modified file paths from diff headers."""
    files = []
    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            files.append(line[6:].strip())
        elif line.startswith("--- a/") and not files:
            files.append(line[6:].strip())
    return list(dict.fromkeys(files))  # Preserve order, unique


def find_diff_file(diffs_dir: Path, test_id: str, issue_num: Optional[int]) -> Optional[Path]:
    """Finds matching proposed diff file for a test ID or issue number."""
    if not diffs_dir.exists():
        return None

    candidates = [
        diffs_dir / f"{test_id}_diff.diff",
        diffs_dir / f"{test_id}.diff",
    ]
    if issue_num:
        candidates.extend(diffs_dir.glob(f"issue_{issue_num}_*_diff.diff"))
        candidates.extend(diffs_dir.glob(f"*{issue_num}*_diff.diff"))

    for cand in candidates:
        if cand.exists() and cand.stat().st_size > 0:
            return cand
    return None


def generate_html_report(run_name: str, test_cases: List[Dict[str, Any]]) -> str:
    """Generates a rich, interactive HTML report with diff2html and syntax highlighting."""
    # Securely escape HTML syntax and line separators to prevent script injection and XSS
    json_data = (
        json.dumps(test_cases)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )
    
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SSR Code Generator Diff Viewer - {run_name}</title>
    
    <!-- diff2html CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css">
    <!-- Highlight.js CSS for Syntax Highlighting -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
    
    <style>
        :root {{
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --border-color: #30363d;
            --text-primary: #c9d1d9;
            --text-secondary: #8b949e;
            --accent-blue: #58a6ff;
            --accent-green: #3fb950;
            --accent-red: #f85149;
            --accent-yellow: #d29922;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            margin: 0;
            padding: 0;
            display: flex;
            height: 100vh;
            overflow: hidden;
        }}
        #sidebar {{
            width: 320px;
            background-color: var(--bg-secondary);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        }}
        .sidebar-header {{
            padding: 16px;
            border-bottom: 1px solid var(--border-color);
        }}
        .sidebar-header h2 {{
            margin: 0 0 8px 0;
            font-size: 16px;
            color: var(--accent-blue);
        }}
        .stats-summary {{
            font-size: 12px;
            color: var(--text-secondary);
        }}
        .test-list {{
            overflow-y: auto;
            flex-grow: 1;
            padding: 8px 0;
        }}
        .test-item {{
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
            transition: background 0.15s ease;
        }}
        .test-item:hover {{
            background-color: var(--bg-tertiary);
        }}
        .test-item.active {{
            background-color: #1f242c;
            border-left: 4px solid var(--accent-blue);
        }}
        .test-item-title {{
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        .badge {{
            display: inline-block;
            padding: 2px 6px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 12px;
            text-transform: uppercase;
        }}
        .badge-pass {{ background-color: rgba(63, 185, 80, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); }}
        .badge-fail {{ background-color: rgba(248, 81, 73, 0.2); color: var(--accent-red); border: 1px solid var(--accent-red); }}
        
        #main-content {{
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background-color: var(--bg-primary);
        }}
        .content-header {{
            padding: 16px 24px;
            background-color: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
        }}
        .content-header h1 {{
            margin: 0 0 8px 0;
            font-size: 18px;
        }}
        .verdict-box {{
            background-color: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 12px 16px;
            margin-top: 8px;
            font-size: 13px;
            line-height: 1.5;
        }}
        #sidebar.collapsed {{
            display: none !important;
        }}
        .content-header.collapsed {{
            display: none !important;
        }}
        .tab-bar {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            padding: 0 16px;
            flex-shrink: 0;
        }}
        .tab-group {{
            display: flex;
            align-items: center;
        }}
        .control-group {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .toggle-btn {{
            background-color: var(--bg-tertiary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            user-select: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }}
        .toggle-btn:hover {{
            background-color: var(--border-color);
            border-color: var(--accent-blue);
            color: var(--accent-blue);
        }}
        .toggle-btn.active {{
            background-color: rgba(88, 166, 255, 0.15);
            border-color: var(--accent-blue);
            color: var(--accent-blue);
        }}
        .tab {{
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-secondary);
            border-bottom: 2px solid transparent;
            cursor: pointer;
            user-select: none;
        }}
        .tab:hover {{ color: var(--text-primary); }}
        .tab.active {{
            color: var(--accent-blue);
            border-bottom-color: var(--accent-blue);
        }}
        .tab-content {{
            flex-grow: 1;
            overflow: auto;
            padding: 24px;
            display: none;
        }}
        .tab-content.active {{
            display: block;
        }}
        pre code {{
            font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
            font-size: 12px;
            border-radius: 6px;
        }}
        /* diff2html dark theme overrides & scrolling fix */
        .d2h-wrapper {{ color: #c9d1d9 !important; background-color: #0d1117 !important; }}
        .d2h-file-header {{ background-color: #161b22 !important; border-color: #30363d !important; }}
        .d2h-file-name {{ color: #58a6ff !important; }}
        .d2h-code-line {{ color: #c9d1d9 !important; position: relative !important; display: table-cell !important; }}
        .d2h-code-line-prefix {{ color: #8b949e !important; }}
        .d2h-ins {{ background-color: rgba(46, 160, 67, 0.15) !important; color: #e6edf3 !important; }}
        .d2h-del {{ background-color: rgba(248, 81, 73, 0.15) !important; color: #e6edf3 !important; }}
        .d2h-code-side-line {{ font-size: 12px !important; position: relative !important; display: table-cell !important; }}
        
        /* Sticky File Header Bar & CHANGED Tag Alignment Fix */
        .d2h-file-wrapper {{
            border: 1px solid var(--border-color) !important;
            border-radius: 6px !important;
            margin-bottom: 24px !important;
        }}
        .d2h-file-header {{
            position: sticky !important;
            top: -24px !important;
            z-index: 10 !important;
            background-color: var(--bg-secondary) !important;
            border-bottom: 1px solid var(--border-color) !important;
            padding: 10px 16px !important;
            margin: 0 !important;
            display: flex !important;
            align-items: center !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
            border-top-left-radius: 6px !important;
            border-top-right-radius: 6px !important;
        }}
        .d2h-file-name-wrapper {{
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            width: 100% !important;
            font-size: 13px !important;
        }}
        .d2h-file-name {{
            color: var(--accent-blue) !important;
            font-weight: 600 !important;
        }}
        .d2h-tag {{
            display: inline-flex !important;
            align-items: center !important;
            padding: 2px 8px !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            border-radius: 12px !important;
            text-transform: uppercase !important;
            line-height: 1.2 !important;
        }}
        .d2h-changed, .d2h-changed-tag {{
            background-color: rgba(210, 153, 34, 0.2) !important;
            color: var(--accent-yellow) !important;
            border: 1px solid var(--accent-yellow) !important;
        }}

        /* Fix line number positioning so numbers scroll in sync with content */
        .d2h-diff-tbody > tr {{ position: relative !important; }}
        .d2h-code-linenumber,
        .d2h-code-side-linenumber {{
            position: static !important;
            display: table-cell !important;
            vertical-align: middle !important;
            width: 45px !important;
            min-width: 45px !important;
            box-sizing: border-box !important;
            user-select: none !important;
        }}
    </style>
</head>
<body>

    <div id="sidebar">
        <div class="sidebar-header">
            <h2>{run_name} Evaluation Run</h2>
            <div class="stats-summary" id="stats-summary">Loading...</div>
        </div>
        <div class="test-list" id="test-list"></div>
    </div>

    <div id="main-content">
        <div class="content-header" id="content-header">
            <h1 id="selected-title">Select a Test Case</h1>
            <div id="selected-meta"></div>
            <div class="verdict-box" id="selected-verdict">Choose a test case from the left sidebar to inspect diffs and judge verdict.</div>
        </div>

        <div class="tab-bar">
            <div class="tab-group">
                <div class="tab active" onclick="switchTab('proposed-diff')">🔵 Agent Proposed Diff</div>
                <div class="tab" onclick="switchTab('ground-truth')">🟢 Ground Truth PR Diff</div>
                <div class="tab" onclick="switchTab('original-file')">📁 Original Source File</div>
            </div>
            <div class="control-group">
                <button class="toggle-btn" id="btn-toggle-sidebar" onclick="toggleSidebar()" title="Toggle Left Sidebar (Hotkey: S)">
                    ◀ Hide Sidebar
                </button>
                <button class="toggle-btn" id="btn-toggle-header" onclick="toggleHeader()" title="Toggle Top Header (Hotkey: H)">
                    ▲ Hide Header
                </button>
            </div>
        </div>

        <div id="tab-proposed-diff" class="tab-content active">
            <div id="diff-proposed-container"></div>
        </div>

        <div id="tab-ground-truth" class="tab-content">
            <div id="diff-ground-truth-container"></div>
        </div>

        <div id="tab-original-file" class="tab-content">
            <pre><code id="original-file-container" class="javascript">Select a test case to view original file context...</code></pre>
        </div>
    </div>

    <!-- diff2html JS & Highlight.js -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/diff2html/bundles/js/diff2html-ui.min.js"></script>

    <script>
        const testData = {json_data};
        let currentTest = null;

        function init() {{
            renderSidebar();
            if (testData.length > 0) {{
                selectTest(0);
            }}
        }}

        function renderSidebar() {{
            const listEl = document.getElementById('test-list');
            const statsEl = document.getElementById('stats-summary');
            
            let total = testData.length;
            let totalScore = 0;
            let passCount = 0;

            listEl.innerHTML = '';
            testData.forEach((item, index) => {{
                totalScore += item.score || 0;
                if ((item.score || 0) >= 4) passCount++;

                const div = document.createElement('div');
                div.className = `test-item ${{index === 0 ? 'active' : ''}}`;
                div.id = `test-item-${{index}}`;
                div.onclick = () => selectTest(index);

                const isPass = (item.score || 0) >= 4;
                const badgeClass = isPass ? 'badge-pass' : 'badge-fail';
                const badgeText = isPass ? `PASS (${{item.score}}/6)` : `FAIL (${{item.score}}/6)`;
                const runtimeStr = item.runtime_seconds ? (String(item.runtime_seconds).endsWith('s') ? item.runtime_seconds : item.runtime_seconds + 's') : '';

                div.innerHTML = `
                    <div class="test-item-title">#${{item.issue_number}} - ${{escapeHtml(item.title || item.test_id)}}</div>
                    <div><span class="badge ${{badgeClass}}">${{badgeText}}</span> <span style="font-size: 11px; color: var(--text-secondary); margin-left: 6px;">Turns: ${{item.attempts || '?'}} | ${{runtimeStr}}</span></div>
                `;
                listEl.appendChild(div);
            }});

            const avgScore = total > 0 ? (totalScore / total).toFixed(2) : '0.00';
            statsEl.innerHTML = `Avg Score: <strong>${{avgScore}} / 6.00</strong> | Total Issues: <strong>${{total}}</strong> | Passed: <strong>${{passCount}}</strong>`;
        }}

        function selectTest(index) {{
            currentTest = testData[index];

            document.querySelectorAll('.test-item').forEach((el, i) => {{
                el.classList.toggle('active', i === index);
            }});

            document.getElementById('selected-title').innerText = `#${{currentTest.issue_number}}: ${{currentTest.title || currentTest.test_id}}`;
            
            const isPass = (currentTest.score || 0) >= 4;
            const badgeClass = isPass ? 'badge-pass' : 'badge-fail';
            const runtimeStr = currentTest.runtime_seconds ? (String(currentTest.runtime_seconds).endsWith('s') ? currentTest.runtime_seconds : currentTest.runtime_seconds + 's') : '?';
            document.getElementById('selected-meta').innerHTML = `
                <span class="badge ${{badgeClass}}">${{isPass ? 'PASS' : 'FAIL'}} (Score: ${{currentTest.score}}/6)</span>
                <span style="font-size: 12px; color: var(--text-secondary); margin-left: 12px;">Turns: ${{currentTest.attempts || '?'}} | Runtime: ${{runtimeStr}}</span>
            `;

            document.getElementById('selected-verdict').innerHTML = `<strong>Judge Verdict:</strong> ${{escapeHtml(currentTest.verdict_description || 'No verdict details available.')}}`;

            renderDiff('diff-proposed-container', currentTest.proposed_diff || '// No proposed diff generated.');
            renderDiff('diff-ground-truth-container', currentTest.true_diff || '// No ground truth diff available.');

            const origContainer = document.getElementById('tab-original-file');
            const filesMap = currentTest.original_files || {{}};
            const filePaths = Object.keys(filesMap);

            if (filePaths.length === 0) {{
                origContainer.innerHTML = '<pre><code class="javascript">// Original file content unavailable.</code></pre>';
            }} else if (filePaths.length === 1) {{
                origContainer.innerHTML = `<div style="margin-bottom: 8px; font-size: 13px; color: var(--accent-blue);">${{filePaths[0]}}</div><pre><code id="orig-code"></code></pre>`;
                document.getElementById('orig-code').textContent = filesMap[filePaths[0]];
            }} else {{
                let options = filePaths.map(p => `<option value="${{p}}">${{p}}</option>`).join('');
                origContainer.innerHTML = `
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 13px;">Select File: </label>
                        <select id="file-selector" onchange="renderOriginalFile(this.value)" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 4px; border-radius: 4px;">
                            ${{options}}
                        </select>
                    </div>
                    <pre><code id="orig-code"></code></pre>
                `;
                renderOriginalFile(filePaths[0]);
            }}
            if (document.getElementById('orig-code')) {{
                hljs.highlightElement(document.getElementById('orig-code'));
            }}
        }}

        function renderOriginalFile(filepath) {{
            const codeEl = document.getElementById('orig-code');
            if (codeEl && currentTest && currentTest.original_files) {{
                codeEl.textContent = currentTest.original_files[filepath] || '// Error loading content.';
                hljs.highlightElement(codeEl);
            }}
        }}

        function renderDiff(containerId, diffString) {{
            const targetEl = document.getElementById(containerId);
            targetEl.innerHTML = '';
            
            if (!diffString || diffString.startsWith('//')) {{
                targetEl.innerHTML = `<pre style="padding: 16px; color: var(--text-secondary);">${{escapeHtml(diffString)}}</pre>`;
                return;
            }}

            const diff2htmlUi = new Diff2HtmlUI(targetEl, diffString, {{
                drawFileList: true,
                matching: 'lines',
                outputFormat: 'side-by-side',
                renderNothingWhenEmpty: false
            }});
            diff2htmlUi.draw();
            diff2htmlUi.highlightCode();
        }}

        function toggleSidebar() {{
            const sidebar = document.getElementById('sidebar');
            const btn = document.getElementById('btn-toggle-sidebar');
            const isCollapsed = sidebar.classList.toggle('collapsed');
            btn.innerHTML = isCollapsed ? '▶ Show Sidebar' : '◀ Hide Sidebar';
            btn.classList.toggle('active', isCollapsed);
        }}

        function toggleHeader() {{
            const header = document.getElementById('content-header');
            const btn = document.getElementById('btn-toggle-header');
            const isCollapsed = header.classList.toggle('collapsed');
            btn.innerHTML = isCollapsed ? '▼ Show Header' : '▲ Hide Header';
            btn.classList.toggle('active', isCollapsed);
        }}

        document.addEventListener('keydown', (e) => {{
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 's' || e.key === 'S') toggleSidebar();
            if (e.key === 'h' || e.key === 'H') toggleHeader();
        }});

        function switchTab(tabId) {{
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            event.target.classList.add('active');
            document.getElementById(`tab-${{tabId}}`).classList.add('active');
        }}

        function escapeHtml(str) {{
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }}

        window.onload = init;
    </script>
</body>
</html>
"""
    return html


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    args = parse_args()
    args.run_name = re.sub(r"[^a-zA-Z0-9._-]", "", args.run_name).strip(".") or "default_run"

    run_dir = RUNS_BASE_DIR / args.run_name
    diffs_dir = run_dir / "outputs" / "diffs"
    score_file_md = run_dir / f"{args.run_name}_eval_score.md"
    if not score_file_md.exists():
        fallback_scores = list(run_dir.glob("*_eval_score.md"))
        if fallback_scores:
            score_file_md = fallback_scores[0]
            logger.info("Using fallback score file: %s", score_file_md.name)

    if not run_dir.exists():
        logger.error(f"Run directory does not exist: {run_dir}")
        sys.exit(1)

    # Collect test specs
    input_path = Path(args.input_path)
    spec_files = []
    if input_path.is_dir():
        spec_files = sorted(list(input_path.glob("*.json")))
    elif input_path.is_file():
        spec_files = [input_path]

    if not spec_files:
        logger.error(f"No JSON spec files found in input path: {args.input_path}")
        sys.exit(1)

    # Load test metrics from test_results.json / Results.txt
    try:
        from eval_diff_judge import load_test_metrics_for_run
        turn_map, runtime_map, _, status_map, _ = load_test_metrics_for_run(str(run_dir))
    except Exception as e:
        logger.warning(f"Could not load test metrics: {e}")
        turn_map, runtime_map, status_map = {}, {}, {}

    # Load score map / verdicts from eval_score.md if available
    verdict_map = {}
    if score_file_md.exists():
        try:
            content = score_file_md.read_text(encoding="utf-8")
            for line in content.splitlines():
                if line.startswith("| ✅") or line.startswith("| ❌"):
                    parts = [p.strip() for p in line.split("|")]
                    if len(parts) >= 9:
                        issue_str = parts[2].replace("`", "").replace("#", "")
                        turns_str = parts[3]
                        runtime_str = parts[4].rstrip("s")
                        score_str = parts[7].replace("**", "").split("/")[0]
                        verdict = parts[8]
                        if issue_str.isdigit():
                            verdict_map[int(issue_str)] = {
                                "score": int(score_str) if score_str.isdigit() else 6,
                                "turns": turns_str,
                                "runtime": runtime_str,
                                "verdict": verdict,
                            }
                    elif len(parts) >= 7:
                        issue_str = parts[2].replace("`", "").replace("#", "")
                        score_str = parts[5].replace("**", "").split("/")[0]
                        verdict = parts[6]
                        if issue_str.isdigit():
                            verdict_map[int(issue_str)] = {
                                "score": int(score_str) if score_str.isdigit() else 6,
                                "verdict": verdict,
                            }
        except Exception as e:
            logger.warning(f"Could not parse {score_file_md}: {e}")

    logger.info("==========================================================")
    logger.info(f" Generating Diff & File Visualizer Report: {args.run_name}")
    logger.info(f" Input Path:      {args.input_path}")
    logger.info(f" Test Specs:      {len(spec_files)}")
    logger.info("==========================================================")

    VALID_QUALITIES = {"OK", "FEATURE", "NEEDS_INFO", "SPAM_EMPTY", "SPAM", "EMPTY"}
    test_cases = []
    skipped_count = 0

    for spec_file in spec_files:
        test_id = spec_file.stem
        try:
            doc_dict = json.loads(spec_file.read_text(encoding="utf-8"))
        except Exception:
            doc_dict = {}

        raw_quality = doc_dict.get("expected_quality") or doc_dict.get("status")
        if not raw_quality and isinstance(doc_dict.get("triage_metadata"), dict):
            raw_quality = doc_dict.get("triage_metadata", {}).get("quality")

        workable_spec = doc_dict.get("workable_spec")

        if raw_quality in VALID_QUALITIES:
            quality_label = raw_quality
        elif raw_quality:
            quality_label = str(raw_quality)
        elif not workable_spec:
            quality_label = "NO_SPEC"
        else:
            quality_label = "OK"

        test_status = status_map.get(test_id, "")

        if quality_label != "OK" or not workable_spec or test_status == "SKIPPED_NON_OK":
            logger.info("Skipping non-OK / no-spec issue from diff viewer: %s (%s)", test_id, quality_label)
            skipped_count += 1
            continue

        github_meta = doc_dict.get("github_metadata", {})
        workable_spec = doc_dict.get("workable_spec", {})
        
        issue_number = github_meta.get("issue_number")
        if not issue_number:
            parts = test_id.split("_")
            for p in parts:
                if p.isdigit():
                    issue_number = int(p)
                    break

        owner = github_meta.get("owner", "google-gemini")
        repo = github_meta.get("repo", "gemini-cli")
        pr_number = github_meta.get("pr_number", 0)
        target_version = (
            github_meta.get("target_version")
            or github_meta.get("baseRefOid")
            or "main"
        )
        title = github_meta.get("title") or workable_spec.get("summary", {}).get("problem", test_id)

        # Proposed Diff
        proposed_diff_file = find_diff_file(diffs_dir, test_id, issue_number)
        proposed_diff = proposed_diff_file.read_text(encoding="utf-8") if proposed_diff_file else ""

        # True Diff
        true_diff = fetch_true_diff(owner, repo, pr_number)

        # Extract modified files and load original file content for all modified paths
        modified_files = list(
            dict.fromkeys(
                parse_modified_files(proposed_diff) + parse_modified_files(true_diff)
            )
        )
        original_files_map = {
            filepath: get_original_file_content(target_version, filepath, owner, repo)
            for filepath in modified_files
        }

        # Score & Verdict
        verdict_info = verdict_map.get(issue_number, {})
        score = verdict_info.get("score", 6 if proposed_diff.strip() else 0)
        verdict = verdict_info.get("verdict", "Evaluated by SSR LLM Diff Judge.")

        # Turns and Runtime
        turns_val = verdict_info.get("turns")
        if not turns_val:
            turns_tuple = turn_map.get(test_id) or turn_map.get(f"gemini_cli_{issue_number}")
            if turns_tuple:
                turns_val = turns_tuple[0]
            else:
                turns_val = "?"

        runtime_val = verdict_info.get("runtime")
        if not runtime_val:
            rt = runtime_map.get(test_id) or runtime_map.get(f"gemini_cli_{issue_number}")
            runtime_val = str(rt) if rt is not None else "?"

        test_cases.append({
            "test_id": test_id,
            "issue_number": issue_number or "?",
            "title": title,
            "score": score,
            "attempts": turns_val,
            "runtime_seconds": runtime_val,
            "verdict_description": verdict,
            "proposed_diff": proposed_diff,
            "true_diff": true_diff,
            "original_files": original_files_map,
        })

    html_content = generate_html_report(args.run_name, test_cases)
    
    if args.output_html:
        output_html_path = Path(args.output_html)
    else:
        output_html_path = run_dir / f"{args.run_name}_diff_viewer.html"

    output_html_path.write_text(html_content, encoding="utf-8")

    logger.info(f"✨ Interactive Diff Viewer Report generated successfully ({len(test_cases)} evaluated cases):")
    if skipped_count:
        logger.info(f"   (Omitted {skipped_count} non-OK / no-spec issue(s) from visualization)")
    logger.info(f"   {output_html_path}")


if __name__ == "__main__":
    main()
