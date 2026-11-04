import json
import logging
import sys

_log = logging.getLogger("pulseops.ai")


def ensure_logger() -> logging.Logger:
    if not _log.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("%(message)s"))
        _log.addHandler(handler)
        _log.setLevel(logging.INFO)
        _log.propagate = False
    return _log


def log_trace(payload: dict) -> None:
    safe = {key: value for key, value in payload.items() if key.lower() not in {"authorization", "token", "api_key"}}
    ensure_logger().info(json.dumps(safe, ensure_ascii=False, default=str))
