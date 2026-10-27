import threading
import time


_lock = threading.Lock()
_events = {}


def request_limit_exceeded(bucket, limit, window_seconds):
    """Process-local sliding window limiter for the single-instance app setup."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        recent = [stamp for stamp in _events.get(bucket, []) if stamp > cutoff]
        if len(recent) >= limit:
            _events[bucket] = recent
            return True
        recent.append(now)
        _events[bucket] = recent
        return False
