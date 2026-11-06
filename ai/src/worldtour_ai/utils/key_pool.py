"""API keys for the outside services, with spare keys from the admin dashboard.

Order of use for each service: the key in this project's environment (SERPAPI_API_KEY, ...), then
the spare keys added at /admin → API keys, oldest first. A key that a provider refuses because its
quota ran out (HTTP 429, "quota") or because it is invalid (401/403) is skipped from then on and
reported to the accounts server, so the dashboard shows it and the next key takes over at once.

The spare keys come from the accounts server (/api/internal/keys, protected by
INTERNAL_API_SECRET) and are cached for a few minutes. Without that secret, or when the server
can't be reached, only the environment keys are used, exactly as before.
"""

from __future__ import annotations

import threading
import time

from worldtour_ai.config.settings import get_settings
from worldtour_ai.utils.logging import get_logger

logger = get_logger("worldtour.keys")

SERVICES = {
    "serpapi": "serpapi_api_key",
    "openrouter": "openrouter_api_key",
    "geoapify": "geoapify_api_key",
    "aviationstack": "aviationstack_api_key",
}
_REFRESH_S = 300  # spare keys are read again every 5 minutes
_EXHAUSTED_S = 24 * 3600  # quotas reset daily or monthly: try a used-up key again after a day
_INVALID_S = 7 * 24 * 3600

_lock = threading.Lock()
_remote: dict = {"at": 0.0, "keys": {}, "env": {}}
_skip: dict[str, float] = {}  # key → time until which it is skipped on this instance


def _spare_keys() -> tuple[dict, dict]:
    settings = get_settings()
    if settings.disable_network or not settings.internal_api_secret or not settings.accounts_server_url:
        return {}, {}
    with _lock:
        if time.time() - _remote["at"] < _REFRESH_S:
            return _remote["keys"], _remote["env"]
        _remote["at"] = time.time()  # also while fetching: one request at a time
    try:
        import httpx

        response = httpx.get(
            f"{settings.accounts_server_url.rstrip('/')}/api/internal/keys",
            headers={"x-internal-secret": settings.internal_api_secret},
            timeout=3,
        )
        response.raise_for_status()
        data = response.json()
        with _lock:
            _remote.update(keys=data.get("keys") or {}, env=data.get("env") or {})
    except Exception as exc:
        logger.debug("Spare API keys unavailable: %s", exc)
        with _lock:
            _remote["at"] = time.time() - _REFRESH_S + 60  # try again in a minute
    return _remote["keys"], _remote["env"]


def _recently_failed(status: str | None, at: str | None) -> bool:
    if status not in {"exhausted", "invalid"} or not at:
        return False
    from datetime import datetime

    try:
        when = datetime.fromisoformat(at.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return False
    return time.time() - when < (_INVALID_S if status == "invalid" else _EXHAUSTED_S)


def candidates(service: str) -> list[tuple[str, str]]:
    """(id, key) pairs to try, in order; id is "env" for this project's own key."""
    env_key = getattr(get_settings(), SERVICES[service], "") or ""
    spare, env_status = _spare_keys()
    pairs: list[tuple[str, str]] = []
    status = env_status.get(service) or {}
    env_failed = env_key and status.get("last4") == env_key[-4:] and _recently_failed(status.get("status"), status.get("exhaustedAt"))
    if env_key and not env_failed:
        pairs.append(("env", env_key))
    for row in spare.get(service) or []:
        if row.get("key") and not _recently_failed(row.get("status"), row.get("exhaustedAt")):
            pairs.append((row.get("id") or "", row["key"]))
    if env_key and env_failed:
        pairs.append(("env", env_key))  # last resort: its quota may have reset
    now = time.time()
    usable = [pair for pair in pairs if _skip.get(pair[1], 0) < now]
    return usable or pairs[-1:]


def api_key(service: str) -> str:
    """The key to use now for a service, or "" when none is configured."""
    found = candidates(service)
    return found[0][1] if found else ""


def is_pooled(service: str, key: str) -> bool:
    return any(key == k for _id, k in candidates(service)) or key == getattr(get_settings(), SERVICES[service], "")


def mark_failed(service: str, key: str, status: str, error: str = "") -> str | None:
    """Stop using a key (quota used up or invalid), tell the dashboard, and return the next key."""
    ids = {k: i for i, k in candidates(service)}
    key_id = ids.get(key, "env" if key == getattr(get_settings(), SERVICES[service], "") else "")
    _skip[key] = time.time() + (_INVALID_S if status == "invalid" else _EXHAUSTED_S)
    logger.warning("%s key ••••%s %s: %s", service, key[-4:], status, error)
    from worldtour_ai.utils.agent_logs import log_event

    log_event("api_key_failed", level="warning", service=service, key_last4=key[-4:], status=status, error=error)
    _report(service, key_id, key[-4:], status, error)
    following = [k for _i, k in candidates(service) if k != key and _skip.get(k, 0) < time.time()]
    return following[0] if following else None


def _report(service: str, key_id: str, last4: str, status: str, error: str) -> None:
    settings = get_settings()
    if not key_id or not settings.internal_api_secret or not settings.accounts_server_url:
        return

    def send() -> None:
        try:
            import httpx

            httpx.post(
                f"{settings.accounts_server_url.rstrip('/')}/api/internal/keys/report",
                headers={"x-internal-secret": settings.internal_api_secret},
                json={"service": service, "id": key_id, "last4": last4, "status": status, "error": error[:300]},
                timeout=3,
            )
        except Exception as exc:
            logger.debug("Key report failed: %s", exc)

    threading.Thread(target=send, daemon=True).start()


def failure_kind(exc: Exception) -> str | None:
    """'exhausted' or 'invalid' when an error means the key itself is the problem, else None."""
    from worldtour_ai.utils.exceptions import QuotaExceededError, RateLimitError

    text = str(exc).lower()
    # A plain 429 can be a short per-second limit: only the provider's words say the quota is gone.
    used_up = ("run out", "quota", "exceeded", "daily", "monthly", "per-day", "usage limit", "usage_limit", "credits", "no searches")
    if isinstance(exc, QuotaExceededError) or any(word in text for word in used_up):
        return "exhausted"
    if isinstance(exc, RateLimitError):
        return None
    if "(401)" in text or "(403)" in text or "invalid api key" in text or "invalid_access_key" in text or "returned 401" in text:
        return "invalid"
    return None
