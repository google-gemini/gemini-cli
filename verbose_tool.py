import logging

def setup_verbose(config):
    logging.basicConfig(level=logging.DEBUG if config.get("verbose") else logging.INFO)
    return logging.getLogger(__name__)