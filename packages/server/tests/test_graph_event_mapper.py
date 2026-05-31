"""Unit tests for the DeerGraph event mapper (phase 1).

The mapper turns individual persisted RunEvent dicts into graph fragments.
Pure functions, no IO. Field shapes mirror LangChain ``model_dump()`` output as
stored by RunJournal.
"""

from __future__ import annotations

from deergraph.runtime import event_mapper as em
from deergraph.runtime.sanitizer import Sanitizer

SANI = Sanitizer()


def _event(event_type, content, *, caller="lead_agent", seq=1, created_at="2026-05-31T00:00:00+00:00"):
    meta = {} if caller is None else {"caller": caller}
    return {
        "thread_id": "t1",
        "run_id": "r1",
        "event_type": event_type,
        "category": "message",
        "content": content,
        "metadata": meta,
        "seq": seq,
        "created_at": created_at,
    }


# --------------------------------------------------------------------------
# caller classification
# --------------------------------------------------------------------------


class TestCaller:
    def test_default_caller_is_lead(self):
        assert em.is_lead_event(_event("llm.ai.response", {}, caller="lead_agent")) is True

    def test_missing_caller_treated_as_lead(self):
        assert em.is_lead_event(_event("llm.ai.response", {}, caller=None)) is True

    def test_subagent_caller_not_lead(self):
        assert em.is_lead_event(_event("llm.ai.response", {}, caller="subagent:research")) is False

    def test_middleware_caller_not_lead(self):
        assert em.is_lead_event(_event("llm.ai.response", {}, caller="middleware:summary")) is False


# --------------------------------------------------------------------------
# User node
# --------------------------------------------------------------------------


class TestUserNode:
    def test_human_input_to_user_node(self):
        ev = _event("llm.human.input", {"type": "human", "content": "Research quantum computing"})
        node = em.user_node_from_event(ev, SANI)
        assert node.id == em.USER_NODE_ID
        assert node.type == "user"
        assert node.status == "completed"
        assert "quantum" in node.summary

    def test_user_to_lead_edge(self):
        edge = em.user_to_lead_edge()
        assert edge.source == em.USER_NODE_ID
        assert edge.target == em.LEAD_NODE_ID
        assert edge.type == "input"


# --------------------------------------------------------------------------
# Lead agent node
# --------------------------------------------------------------------------


class TestLeadNode:
    def test_lead_node_is_stable_logical_node(self):
        node = em.lead_agent_node("t1", "r1")
        assert node.id == em.LEAD_NODE_ID
        assert node.type == "lead_agent"


# --------------------------------------------------------------------------
# Subagent extraction from task tool calls
# --------------------------------------------------------------------------


class TestTaskCalls:
    def test_extracts_task_tool_call(self):
        content = {
            "type": "ai",
            "content": "delegating",
            "tool_calls": [
                {"name": "task", "id": "call_1", "args": {"description": "research topic A"}, "type": "tool_call"},
            ],
        }
        calls = em.task_calls_from_ai_response(_event("llm.ai.response", content))
        assert len(calls) == 1
        assert calls[0].call_id == "call_1"

    def test_ignores_non_task_tool_calls(self):
        content = {
            "type": "ai",
            "tool_calls": [
                {"name": "read_file", "id": "call_x", "args": {"path": "/etc/hosts"}},
            ],
        }
        assert em.task_calls_from_ai_response(_event("llm.ai.response", content)) == []

    def test_handles_missing_tool_calls_key(self):
        assert em.task_calls_from_ai_response(_event("llm.ai.response", {"type": "ai", "content": "hi"})) == []

    def test_subagent_node_from_call(self):
        content = {
            "tool_calls": [{"name": "task", "id": "call_1", "args": {"description": "research topic A"}}],
        }
        ev = _event("llm.ai.response", content)
        call = em.task_calls_from_ai_response(ev)[0]
        node = em.subagent_node(call, ev, SANI)
        assert node.id == em.subagent_node_id("call_1")
        assert node.type == "subagent"
        assert node.status == "pending"
        assert node.correlation_id == "call_1"
        assert "research topic A" in node.summary

    def test_delegates_edge(self):
        edge = em.delegates_edge("call_1")
        assert edge.source == em.LEAD_NODE_ID
        assert edge.target == em.subagent_node_id("call_1")
        assert edge.type == "delegates"
        assert edge.correlation_id == "call_1"

    def test_subagent_args_are_sanitized(self):
        content = {
            "tool_calls": [{"name": "task", "id": "c2", "args": {"description": "use api_key=supersecret123 now"}}],
        }
        ev = _event("llm.ai.response", content)
        call = em.task_calls_from_ai_response(ev)[0]
        node = em.subagent_node(call, ev, SANI)
        assert "supersecret123" not in node.summary


# --------------------------------------------------------------------------
# Tool result -> returns edge
# --------------------------------------------------------------------------


class TestToolResult:
    def test_tool_result_info(self):
        content = {"type": "tool", "tool_call_id": "call_1", "content": "found 3 papers", "status": "success"}
        info = em.tool_result_info(_event("llm.tool.result", content))
        assert info.tool_call_id == "call_1"
        assert "papers" in info.text
        assert info.status == "success"

    def test_returns_edge(self):
        edge = em.returns_edge("call_1")
        assert edge.source == em.subagent_node_id("call_1")
        assert edge.target == em.LEAD_NODE_ID
        assert edge.type == "returns"

    def test_error_status_detected(self):
        content = {"type": "tool", "tool_call_id": "call_1", "content": "boom", "status": "error"}
        info = em.tool_result_info(_event("llm.tool.result", content))
        assert info.status == "error"

    def test_missing_tool_call_id_is_none_not_crash(self):
        info = em.tool_result_info(_event("llm.tool.result", {"type": "tool", "content": "orphan"}))
        assert info.tool_call_id is None  # builder treats as orphan, must not crash


# --------------------------------------------------------------------------
# Final node
# --------------------------------------------------------------------------


class TestFinalNode:
    def test_final_node_from_ai_message(self):
        ev = _event("llm.ai.response", {"type": "ai", "content": "Here is the final answer.", "tool_calls": []})
        node = em.final_node_from_ai(ev, SANI)
        assert node.id == em.FINAL_NODE_ID
        assert node.type == "final"
        assert node.status == "completed"
        assert "final answer" in node.summary

    def test_final_node_from_run_error(self):
        ev = _event("run.error", "RuntimeError: kaboom", caller=None)
        node = em.final_node_from_run_error(ev, "t1", "r1", SANI)
        assert node.type == "error"
        assert node.status == "failed"
        assert "kaboom" in node.error

    def test_lead_to_final_edge(self):
        edge = em.lead_to_final_edge()
        assert edge.source == em.LEAD_NODE_ID
        assert edge.target == em.FINAL_NODE_ID
        assert edge.type == "produces"


# --------------------------------------------------------------------------
# AIMessage helpers
# --------------------------------------------------------------------------


class TestAiHelpers:
    def test_has_tool_calls_true(self):
        ev = _event("llm.ai.response", {"tool_calls": [{"name": "task", "id": "c1", "args": {}}]})
        assert em.ai_has_tool_calls(ev) is True

    def test_has_tool_calls_false(self):
        ev = _event("llm.ai.response", {"content": "done", "tool_calls": []})
        assert em.ai_has_tool_calls(ev) is False

    def test_text_from_block_content(self):
        ev = _event("llm.ai.response", {"content": [{"type": "text", "text": "block answer"}], "tool_calls": []})
        node = em.final_node_from_ai(ev, SANI)
        assert "block answer" in node.summary
