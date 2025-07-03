import logging

def setup_verbose(config):
    logging.basicConfig(level=logging.DEBUG if config.get("verbose") else logging.INFO)
    return logging.getLogger(__name__)

def read_with_verbose(file_path, config):
    logger = setup_verbose(config)
    logger.debug(f"Checking permissions for {file_path}")
    if not check_file_permission(file_path, "read", config):
        raise PermissionError(f"Read access denied for {file_path}")
    logger.debug(f"Reading file {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()