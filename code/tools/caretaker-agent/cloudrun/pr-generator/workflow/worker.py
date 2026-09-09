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
    """Sets up the root logger with a standardized format."""
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(IgnoreRawWsMsgFilter())
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[handler],
    )


async def main() -> None:
    """Asynchronous process execution entrypoint."""
    setup_logging()
    logging.info("Starting SSR Agent Orchestration Worker...")

    try:
        config = Config()
        orchestrator = Orchestrator(config)
        await orchestrator.run()
    except OrchestrationError as e:
        logging.critical("Orchestrator encountered a fatal error: %s", e)
        sys.exit(1)
    except Exception as e:
        logging.exception("An unhandled error occurred in the orchestrator.")
        sys.exit(4)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Fatal crash during startup initialization: {err}", file=sys.stderr)
        sys.exit(4)
