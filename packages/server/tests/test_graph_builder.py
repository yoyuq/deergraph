"""Integration-ish unit tests for the DeerGraph builder (phase 1).

Builds GraphSnapshots from a real :class:`MemoryRunEventSource` populated with
events shaped like RunJournal output. No mocks of the product path — only the
``RunEventSource`` is the in-memory test double deergraph ships for this use.
"""

from __future__ import annotations

from deergraph.runtime import event_mapper as em
from deergraph.runtime.builder import build_graph_snapshot
from deergraph.testing import MemoryRunEventSource

THREAD = "t1"
RUN = "r1"


def _put(store, event_type, content, *, caller="lead_agent", category="message"):
    meta = {} if caller is None else {"caller": caller}
    return store.put(
        thread_id=THREAD,
        run_id=RUN,
        event_type=event_type,
        category=category,
        content=content,
        metadata=meta,
    )


def _human(text):
    return {"type": "human", "content": text}


def _ai_with_task(call_id, description):
    return {
        "type": "ai",
        "content": "delegating to a subagent",
        "tool_calls": [{"name": "task", "id": call_id, "args": {"description": description}, "type": "tool_call"}],
    }


def _ai_final(text):
    return {"type": "ai", "content": text, "tool_calls": []}


def _tool_result(call_id, text, status="success"):
    return {"type": "tool", "tool_call_id": call_id, "content": text, "status": status}


def _ids(items):
    return {i.id for i in items}


def _node(snap, node_id):
    return next(n for n in snap.nodes if n.id == node_id)


def _has_edge(snap, source, target, type_):
    return any(e.source == source and e.target == target and e.type == type_ for e in snap.edges)


# --------------------------------------------------------------------------
# Full MVP chain
# --------------------------------------------------------------------------


class TestFullChain:
    def test_user_lead_subagent_lead_final(self):
        store = MemoryRunEventSource()
        _put(store, "llm.human.input", _human("Research quantum computing"))
        _put(store, "llm.ai.response", _ai_with_task("call_1", "research quantum basics"))
        _put(store, "llm.tool.result", _tool_result("call_1", "found 3 papers"))
        _put(store, "llm.ai.response", _ai_final("Quantum computing uses qubits."))
        _put(store, "run.end", {"output": "done"}, caller=None, category="outputs")

        snap = build_graph_snapshot(store, THREAD, RUN)

        ids = _ids(snap.nodes)
        assert em.USER_NODE_ID in ids
        assert em.LEAD_NODE_ID in ids
        assert em.subagent_node_id("call_1") in ids
        assert em.FINAL_NODE_ID in ids

        assert _has_edge(snap, em.USER_NODE_ID, em.LEAD_NODE_ID, "input")
        assert _has_edge(snap, em.LEAD_NODE_ID, em.subagent_node_id("call_1"), "delegates")
        assert _has_edge(snap, em.subagent_node_id("call_1"), em.LEAD_NODE_ID, "returns")
        assert _has_edge(snap, em.LEAD_NODE_ID, em.FINAL_NODE_ID, "produces")

        # Subagent status inferred completed from a successful tool result.
        assert _node(snap, em.subagent_node_id("call_1")).status == "completed"
        assert _node(snap, em.FINAL_NODE_ID).status == "completed"
        assert snap.truncated is False
        assert snap.thread_id == THREAD
        assert snap.run_id == RUN

    def test_multiple_subagents(self):
        store = MemoryRunEventSource()
        _put(store, "llm.human.input", _human("Compare A and B"))
        _put(store, "llm.ai.response", _ai_with_task("call_1", "research A"))
        _put(store, "llm.ai.response", _ai_with_task("call_2", "research B"))
        _put(store, "llm.tool.result", _tool_result("call_1", "A facts"))
        _put(store, "llm.tool.result", _tool_result("call_2", "B facts"))
        _put(store, "llm.ai.response", _ai_final("A and B compared."))

        snap = build_graph_snapshot(store, THREAD, RUN)
        ids = _ids(snap.nodes)
        assert em.subagent_node_id("call_1") in ids
        assert em.subagent_node_id("call_2") in ids
        assert _has_edge(snap, em.LEAD_NODE_ID, em.subagent_node_id("call_2"), "delegates")
        assert _has_edge(snap, em.subagent_node_id("call_2"), em.LEAD_NODE_ID, "returns")


# --------------------------------------------------------------------------
# Failure / error handling
# --------------------------------------------------------------------------


class TestFailureModes:
    def test_run_error_produces_error_final(self):
        store = MemoryRunEventSource()
        _put(store, "llm.human.input", _human("Do the thing"))
        _put(store, "llm.ai.response", _ai_with_task("call_1", "do it"))
        _put(store, "run.error", "RuntimeError: kaboom", caller=None, category="error")

        snap = build_graph_snapshot(store, THREAD, RUN)
        final = _node(snap, em.FINAL_NODE_ID)
        assert final.type == "error"
        assert final.status == "failed"
        assert "kaboom" in final.error

    def test_failed_tool_result_marks_subagent_failed(self):
        store = MemoryRunEventSource()
        _put(store, "llm.human.input", _human("q"))
        _put(store, "llm.ai.response", _ai_with_task("call_1", "do it"))
        _put(store, "llm.tool.result", _tool_result("call_1", "error occurred", status="error"))

        snap = build_graph_snapshot(store, THREAD, RUN)
        assert _node(snap, em.subagent_node_id("call_1")).status == "failed"

    def test_orphan_tool_result_does_not_crash(self):
        store = MemoryRunEventSource()
        _put(store, "llm.human.input", _human("q"))
        _put(store, "llm.tool.result", _tool_result("call_unknown", "orphan result"))

        snap = build_graph_snapshot(store, THREAD, RUN)
        # No subagent node for the orphan; no returns edge; still returns cleanly.
        assert em.subagent_node_id("call_unknown") not in _ids(snap.nodes)
        assert not any(e.type == "returns" for e in snap.edges)


# --------------------------------------------------------------------------
# Edge cases
# --------------------------------------------------------------------------


class TestEdgeCases:
    def test_empty_run_returns_empty_snapshot(self):
        store = MemoryRunEventSource()
        snap = build_graph_snapshot(store, THREAD, RUN)
        assert snap.nodes == []
        assert snap.edges == []
        assert snap.truncated is False

    def test_repeated_build_is_stable(self):
        store = MemoryRunEventSource()
        _put(store, "llm.human.input", _human("q"))
        _put(store, "llm.ai.response", _ai_with_task("call_1", "do it"))
        _put(store, "llm.tool.result", _tool_result("call_1", "ok"))
        _put(store, "llm.ai.response", _ai_final("answer"))

        snap1 = build_graph_snapshot(store, THREAD, RUN)
        snap2 = build_graph_snapshot(store, THREAD, RUN)
        assert snap1.to_dict()["nodes"] == snap2.to_dict()["nodes"]
        assert snap1.to_dict()["edges"] == snap2.to_dict()["edges"]

    def test_truncation_flag_set_when_cap_hit(self):
        store = MemoryRunEventSource()
        _put(store, "llm.human.input", _human("q"))
        _put(store, "llm.ai.response", _ai_with_task("call_1", "a"))
        _put(store, "llm.tool.result", _tool_result("call_1", "ok"))
        _put(store, "llm.ai.response", _ai_final("answer"))

        snap = build_graph_snapshot(store, THREAD, RUN, max_events=2)
        assert snap.truncated is True

    def test_subagent_internal_events_are_ignored(self):
        store = MemoryRunEventSource()
        _put(store, "llm.human.input", _human("q"))
        _put(store, "llm.ai.response", _ai_with_task("call_1", "research"))
        # A subagent-internal AIMessage with its own (non-task) tool call must
        # not create lead-level subagent nodes.
        _put(
            store,
            "llm.ai.response",
            {"type": "ai", "tool_calls": [{"name": "read_file", "id": "inner_1", "args": {}}]},
            caller="subagent:research",
        )
        _put(store, "llm.tool.result", _tool_result("call_1", "done"))
        _put(store, "llm.ai.response", _ai_final("answer"))

        snap = build_graph_snapshot(store, THREAD, RUN)
        subagent_nodes = [n for n in snap.nodes if n.type == "subagent"]
        assert len(subagent_nodes) == 1
        assert subagent_nodes[0].id == em.subagent_node_id("call_1")
