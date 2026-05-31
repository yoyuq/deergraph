"""Sanitizer for DeerGraph snapshots.

Hard requirement (ADR-6 / phase-0 design §6): every field that enters a
GraphSnapshot is redacted (key-based + value-based) and head/tail truncated.
The graph never echoes raw tool input/output, since the event store keeps it
verbatim and may contain secrets.

Three layers:
1. ``redact_secrets``  — value-pattern regex (Bearer, sk-*, ghp_*, AKIA*, inline key=value).
2. ``is_sensitive_key`` / ``sanitize_mapping`` — key-name redaction over dicts/lists.
3. ``make_preview`` — redact then head+tail truncate for display fields.

Everything is best-effort: a sanitizer failure must degrade gracefully and
never break graph construction or the main task.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

REDACTION_MARKER = "[REDACTED]"

# Graph previews are far shorter than tool-output budgets — keep them tight so
# one screen isn't flooded with raw content.
DEFAULT_PREVIEW_HEAD = 500
DEFAULT_PREVIEW_TAIL = 200

# Case-insensitive dict-key names whose values are redacted wholesale.
_SENSITIVE_KEY_NAMES: frozenset[str] = frozenset(
    {
        "password",
        "passwd",
        "secret",
        "token",
        "api_key",
        "apikey",
        "access_key",
        "secret_key",
        "authorization",
        "auth",
        "bearer",
        "credential",
        "credentials",
        "private_key",
        "session",
        "cookie",
        "refresh_token",
        "access_token",
        "client_secret",
    }
)

# Value-pattern secret detectors. Order matters: more specific first.
_SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._\-]+"),
    re.compile(r"\bsk-[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bgh[opsu]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
)

# Inline `key = value` / `key: value` secrets. Keeps the key, redacts the value.
_INLINE_SECRET = re.compile(
    r"(?i)\b(password|passwd|secret|api[_-]?key|access[_-]?key|secret[_-]?key|"
    r"token|authorization|client[_-]?secret|private[_-]?key|refresh[_-]?token|"
    r"access[_-]?token)\b(\s*[=:]\s*)(\S+)"
)


def is_sensitive_key(key: str) -> bool:
    """True if a dict key name indicates its value should be fully redacted."""
    normalized = key.strip().lower().replace("-", "_")
    if normalized in _SENSITIVE_KEY_NAMES:
        return True
    # Catch compound keys like "openai_api_key", "x_auth_token".
    return any(name in normalized for name in ("api_key", "secret", "password", "token", "authorization", "bearer", "credential"))


def redact_secrets(text: str) -> str:
    """Replace secret-looking substrings in free text with the redaction marker."""
    if not text:
        return text
    try:
        out = text
        # Value-pattern detectors first (e.g. "Bearer <tok>"), otherwise the
        # inline key=value rule would consume the keyword and orphan the token.
        for pattern in _SECRET_PATTERNS:
            out = pattern.sub(REDACTION_MARKER, out)
        out = _INLINE_SECRET.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTION_MARKER}", out)
        return out
    except Exception:  # noqa: BLE001 - best-effort, never break the graph
        logger.warning("redact_secrets failed; returning placeholder", exc_info=True)
        return REDACTION_MARKER


def sanitize_mapping(value: Any) -> Any:
    """Recursively redact a dict/list/scalar.

    - dict: sensitive keys -> ``[REDACTED]``; other values recursed.
    - list/tuple: each element recursed.
    - str: value-pattern redaction.
    - other scalars: returned unchanged.
    """
    try:
        if isinstance(value, dict):
            out: dict[str, Any] = {}
            for key, val in value.items():
                if isinstance(key, str) and is_sensitive_key(key):
                    out[key] = REDACTION_MARKER
                else:
                    out[key] = sanitize_mapping(val)
            return out
        if isinstance(value, (list, tuple)):
            return [sanitize_mapping(v) for v in value]
        if isinstance(value, str):
            return redact_secrets(value)
        return value
    except Exception:  # noqa: BLE001 - best-effort
        logger.warning("sanitize_mapping failed", exc_info=True)
        return REDACTION_MARKER


def make_preview(
    text: str | None,
    *,
    head: int = DEFAULT_PREVIEW_HEAD,
    tail: int = DEFAULT_PREVIEW_TAIL,
) -> str | None:
    """Redact then head+tail truncate a display string.

    Returns ``None`` for ``None`` input so callers can omit empty fields.
    """
    if text is None:
        return None
    try:
        redacted = redact_secrets(str(text))
        if len(redacted) <= head + tail:
            return redacted
        omitted = len(redacted) - head - tail
        return f"{redacted[:head]}\n[... {omitted} chars omitted ...]\n{redacted[-tail:]}"
    except Exception:  # noqa: BLE001 - best-effort
        logger.warning("make_preview failed", exc_info=True)
        return REDACTION_MARKER


class Sanitizer:
    """Stateful facade bundling redaction + truncation with configured limits."""

    def __init__(self, *, preview_head: int = DEFAULT_PREVIEW_HEAD, preview_tail: int = DEFAULT_PREVIEW_TAIL) -> None:
        self.preview_head = preview_head
        self.preview_tail = preview_tail

    def text(self, value: str | None) -> str | None:
        """Redact + truncate a free-text field destined for a node/edge."""
        return make_preview(value, head=self.preview_head, tail=self.preview_tail)

    def mapping(self, value: Any) -> Any:
        """Deep-redact a structured value (tool args, metadata)."""
        return sanitize_mapping(value)
