# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Entrypoint orchestrator script running as a Cloud Run Job.

Loads the environment config, configures centralized logging, and executes the
iterative bug-fixing orchestrator asynchronously.
"""

import asyncio
import logging
import sys

from config import Config
from orchestrator import Orchestrator, OrchestrationError


class IgnoreRawWsMsgFilter(logging.Filter):
    """Filter to ignore raw websocket messages in the log output."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "RAW WS MSG" not in record.getMessage()


def setup_logging() -> None:
    """Sets up the root logger with WARNING level and dedicated 'Orchestrator' logger at INFO."""
    logging.getLogger().setLevel(logging.WARNING)

    app_logger = logging.getLogger("Orchestrator")
    app_logger.setLevel(logging.INFO)
    app_logger.propagate = False

    for h in app_logger.handlers[:]:
        app_logger.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(IgnoreRawWsMsgFilter())
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    app_logger.addHandler(handler)


async def main() -> None:
    """Asynchronous process execution entrypoint."""
    setup_logging()
    logger = logging.getLogger("Orchestrator")
    logger.info("Starting Agent Orchestration Worker...")

    try:
        config = Config()
        orchestrator = Orchestrator(config)
        await orchestrator.run()
    except OrchestrationError as e:
        logger.critical("Orchestrator encountered a fatal error: %s", e)
        sys.exit(1)
    except Exception as e:
        logger.exception("An unhandled error occurred in the orchestrator.")
        sys.exit(4)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Fatal crash during startup initialization: {err}", file=sys.stderr)
        sys.exit(4)
