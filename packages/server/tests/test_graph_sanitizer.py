"""Unit tests for the DeerGraph sanitizer and graph models (phase 1).

Sanitizer is a hard requirement: every field that enters a GraphSnapshot
must pass through it (secret redaction + head/tail truncation). These tests
fix the contract before implementation.
"""

from __future__ import annotations

from deergraph.runtime.models import GraphEdge, GraphNode, GraphSnapshot
from deergraph.runtime.sanitizer import (
    Sanitizer,
    is_sensitive_key,
    make_preview,
    redact_secrets,
    sanitize_mapping,
)


# --------------------------------------------------------------------------
# Value-based secret redaction
# --------------------------------------------------------------------------


class TestRedactSecrets:
    def test_redacts_openai_style_key(self):
        text = "here is my key sk-abcdef0123456789ABCDEF0123 use it"
        out = redact_secrets(text)
        assert "sk-abcdef0123456789ABCDEF0123" not in out
        assert "[REDACTED]" in out

    def test_redacts_github_token(self):
        text = "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        out = redact_secrets(text)
        assert "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" not in out
        assert "[REDACTED]" in out

    def test_redacts_aws_access_key(self):
        text = "AKIAIOSFODNN7EXAMPLE is the access key"
        out = redact_secrets(text)
        assert "AKIAIOSFODNN7EXAMPLE" not in out

    def test_redacts_bearer_header(self):
        text = "Authorization: Bearer eyJabc.def.ghi"
        out = redact_secrets(text)
        assert "eyJabc.def.ghi" not in out
        assert "[REDACTED]" in out

    def test_redacts_inline_key_value(self):
        text = "api_key=supersecretvalue123"
        out = redact_secrets(text)
        assert "supersecretvalue123" not in out
        assert "[REDACTED]" in out
        # The key name itself stays so the reader knows what was redacted.
        assert "api_key" in out

    def test_leaves_plain_text_untouched(self):
        text = "The lead agent delegated two subagents to research the topic."
        assert redact_secrets(text) == text


# --------------------------------------------------------------------------
# Key-based redaction
# --------------------------------------------------------------------------


class TestSensitiveKeys:
    def test_known_sensitive_keys(self):
        for key in ("password", "API_KEY", "secret", "Authorization", "token", "client_secret"):
            assert is_sensitive_key(key) is True

    def test_non_sensitive_keys(self):
        for key in ("description", "prompt", "name", "status"):
            assert is_sensitive_key(key) is False


class TestSanitizeMapping:
    def test_redacts_sensitive_values_by_key(self):
        d = {"prompt": "do the thing", "api_key": "sk-livesecret", "nested": {"password": "hunter2"}}
        out = sanitize_mapping(d)
        assert out["prompt"] == "do the thing"
        assert out["api_key"] == "[REDACTED]"
        assert out["nested"]["password"] == "[REDACTED]"

    def test_redacts_secret_patterns_in_non_sensitive_values(self):
        d = {"note": "the key is sk-abcdef0123456789ABCDEF0123"}
        out = sanitize_mapping(d)
        assert "sk-abcdef0123456789ABCDEF0123" not in out["note"]

    def test_handles_lists(self):
        d = {"items": ["plain", "token=abc123secret"]}
        out = sanitize_mapping(d)
        assert out["items"][0] == "plain"
        assert "abc123secret" not in out["items"][1]


# --------------------------------------------------------------------------
# Truncation preview
# --------------------------------------------------------------------------


class TestMakePreview:
    def test_short_text_unchanged(self):
        assert make_preview("hello world") == "hello world"

    def test_long_text_truncated_head_tail(self):
        text = "A" * 1000 + "B" * 1000
        out = make_preview(text, head=100, tail=50)
        assert len(out) < len(text)
        assert out.startswith("A" * 50)  # head present
        assert out.endswith("B" * 25)  # tail present
        assert "omitted" in out

    def test_preview_also_redacts(self):
        text = "prefix sk-abcdef0123456789ABCDEF0123 suffix"
        out = make_preview(text)
        assert "sk-abcdef0123456789ABCDEF0123" not in out

    def test_none_returns_none(self):
        assert make_preview(None) is None


class TestSanitizerFacade:
    def test_text_runs_redact_then_truncate(self):
        s = Sanitizer(preview_head=10, preview_tail=5)
        long_secret = "token=abc " + ("x" * 500)
        out = s.text(long_secret)
        assert "abc" not in out or "[REDACTED]" in out
        assert len(out) < len(long_secret)

    def test_mapping_delegates(self):
        s = Sanitizer()
        out = s.mapping({"password": "p"})
        assert out["password"] == "[REDACTED]"


# --------------------------------------------------------------------------
# Graph models
# --------------------------------------------------------------------------


class TestGraphModels:
    def test_node_to_dict_camel_case(self):
        node = GraphNode(
            id="subagent:call_1",
            type="subagent",
            label="research",
            status="completed",
            thread_id="t1",
            run_id="r1",
            correlation_id="call_1",
            summary="researched the topic",
        )
        d = node.to_dict()
        assert d["id"] == "subagent:call_1"
        assert d["type"] == "subagent"
        assert d["threadId"] == "t1"
        assert d["runId"] == "r1"
        assert d["correlationId"] == "call_1"
        assert d["summary"] == "researched the topic"
        # Unset optional fields are omitted to keep payloads small.
        assert "error" not in d

    def test_edge_to_dict_camel_case(self):
        edge = GraphEdge(id="e1", source="lead_agent", target="subagent:call_1", type="delegates")
        d = edge.to_dict()
        assert d["source"] == "lead_agent"
        assert d["target"] == "subagent:call_1"
        assert d["type"] == "delegates"

    def test_snapshot_to_dict(self):
        node = GraphNode(id="user", type="user", label="User", status="completed", thread_id="t1", run_id="r1")
        snap = GraphSnapshot(thread_id="t1", run_id="r1", nodes=[node], edges=[], truncated=False)
        d = snap.to_dict()
        assert d["threadId"] == "t1"
        assert d["runId"] == "r1"
        assert d["truncated"] is False
        assert isinstance(d["nodes"], list)
        assert d["nodes"][0]["id"] == "user"
        assert "updatedAt" in d
