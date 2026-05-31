"""Map individual persisted RunEvents into DeerGraph fragments.

Pure, IO-free functions. Each operates on a single store record dict
(``{thread_id, run_id, event_type, category, content, metadata, seq, created_at}``)
and returns nodes/edges. The :mod:`builder` orchestrates ordering, dedup and
Final-node selection.

Tolerance is a hard requirement (OpenClaw review §3.3/§3.4):
- ``task`` tool-call field shapes may vary; read defensively.
- a tool result with no matching tool_call must not raise — it surfaces as an
  orphan (``tool_call_id is None``) the builder can ignore.

Every text field that lands on a node/edge passes through the sanitizer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from deerflow.runtime.graph.models import GraphEdge, GraphNode
from deerflow.runtime.graph.sanitizer import Sanitizer

# Stable logical node ids for the MVP skeleton.
USER_NODE_ID = "user"
LEAD_NODE_ID = "lead_agent"
FINAL_NODE_ID = "final"

TASK_TOOL_NAME = "task"


def subagent_node_id(call_id: str) -> str:
    return f"subagent:{call_id}"


# --------------------------------------------------------------------------
# caller classification
# --------------------------------------------------------------------------


def _caller(event: dict[str, Any]) -> str:
    meta = event.get("metadata") or {}
    caller = meta.get("caller")
    return caller if isinstance(caller, str) and caller else "lead_agent"


def is_lead_event(event: dict[str, Any]) -> bool:
    """True for lead-agent events (caller missing/``lead_agent``).

    Subagent-internal and middleware events are excluded so the MVP graph
    stays at the lead-agent level and doesn't expand subagent internals.
    """
    caller = _caller(event)
    return not (caller.startswith("subagent:") or caller.startswith("middleware:"))


# --------------------------------------------------------------------------
# message text extraction
# --------------------------------------------------------------------------


def _message_text(content: Any) -> str:
    """Extract plain text from a LangChain message ``content`` field.

    Handles str content and Anthropic-style block lists
    (``[{"type": "text", "text": ...}]``).
    """
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        # A full model_dump dict: pull its inner content field.
        return _message_text(content.get("content", ""))
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return ""


def _content_dict(event: dict[str, Any]) -> dict[str, Any]:
    content = event.get("content")
    return content if isinstance(content, dict) else {}


# --------------------------------------------------------------------------
# User node
# --------------------------------------------------------------------------


def user_node_from_event(event: dict[str, Any], sanitizer: Sanitizer) -> GraphNode:
    text = _message_text(event.get("content"))
    return GraphNode(
        id=USER_NODE_ID,
        type="user",
        label="User",
        status="completed",
        thread_id=event["thread_id"],
        run_id=event["run_id"],
        summary=sanitizer.text(text),
        started_at=event.get("created_at"),
    )


def user_to_lead_edge() -> GraphEdge:
    return GraphEdge(id="edge:user->lead", source=USER_NODE_ID, target=LEAD_NODE_ID, type="input")


# --------------------------------------------------------------------------
# Lead agent node
# --------------------------------------------------------------------------


def lead_agent_node(thread_id: str, run_id: str) -> GraphNode:
    return GraphNode(
        id=LEAD_NODE_ID,
        type="lead_agent",
        label="Lead Agent",
        status="completed",
        thread_id=thread_id,
        run_id=run_id,
    )


# --------------------------------------------------------------------------
# Subagent extraction from task tool calls
# --------------------------------------------------------------------------


@dataclass
class TaskCall:
    call_id: str
    args: dict[str, Any]


def _tool_calls(event: dict[str, Any]) -> list[dict[str, Any]]:
    raw = _content_dict(event).get("tool_calls")
    if not isinstance(raw, list):
        return []
    return [tc for tc in raw if isinstance(tc, dict)]


def ai_has_tool_calls(event: dict[str, Any]) -> bool:
    return len(_tool_calls(event)) > 0


def task_calls_from_ai_response(event: dict[str, Any]) -> list[TaskCall]:
    """Extract ``task`` tool calls (subagent delegations) from an AIMessage.

    Tolerant of field-shape differences: a call needs name == ``task`` and an
    ``id``. Calls without an id are skipped (cannot correlate a tool result).
    """
    calls: list[TaskCall] = []
    for tc in _tool_calls(event):
        name = tc.get("name")
        if name != TASK_TOOL_NAME:
            continue
        call_id = tc.get("id")
        if not isinstance(call_id, str) or not call_id:
            continue
        args = tc.get("args")
        calls.append(TaskCall(call_id=call_id, args=args if isinstance(args, dict) else {}))
    return calls


def _task_description(args: dict[str, Any]) -> str:
    for key in ("description", "prompt", "task", "instructions"):
        val = args.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return "subagent task"


def subagent_node(call: TaskCall, event: dict[str, Any], sanitizer: Sanitizer) -> GraphNode:
    description = _task_description(call.args)
    return GraphNode(
        id=subagent_node_id(call.call_id),
        type="subagent",
        label="Subagent",
        status="pending",
        thread_id=event["thread_id"],
        run_id=event["run_id"],
        parent_id=LEAD_NODE_ID,
        correlation_id=call.call_id,
        summary=sanitizer.text(description),
        input_preview=sanitizer.text(description),
        started_at=event.get("created_at"),
    )


def delegates_edge(call_id: str) -> GraphEdge:
    return GraphEdge(
        id=f"edge:lead->subagent:{call_id}",
        source=LEAD_NODE_ID,
        target=subagent_node_id(call_id),
        type="delegates",
        correlation_id=call_id,
    )


# --------------------------------------------------------------------------
# Tool result -> returns edge
# --------------------------------------------------------------------------


@dataclass
class ToolResultInfo:
    tool_call_id: str | None
    text: str
    status: str | None
    created_at: str | None


def tool_result_info(event: dict[str, Any]) -> ToolResultInfo:
    content = _content_dict(event)
    call_id = content.get("tool_call_id")
    status = content.get("status")
    return ToolResultInfo(
        tool_call_id=call_id if isinstance(call_id, str) and call_id else None,
        text=_message_text(content.get("content", "")),
        status=status if isinstance(status, str) else None,
        created_at=event.get("created_at"),
    )


def returns_edge(call_id: str) -> GraphEdge:
    return GraphEdge(
        id=f"edge:subagent:{call_id}->lead",
        source=subagent_node_id(call_id),
        target=LEAD_NODE_ID,
        type="returns",
        correlation_id=call_id,
    )


# --------------------------------------------------------------------------
# Final node
# --------------------------------------------------------------------------


def final_node_from_ai(event: dict[str, Any], sanitizer: Sanitizer) -> GraphNode:
    text = _message_text(_content_dict(event).get("content", ""))
    return GraphNode(
        id=FINAL_NODE_ID,
        type="final",
        label="Final Answer",
        status="completed",
        thread_id=event["thread_id"],
        run_id=event["run_id"],
        parent_id=LEAD_NODE_ID,
        summary=sanitizer.text(text),
        output_preview=sanitizer.text(text),
        ended_at=event.get("created_at"),
    )


def final_node_from_run_end(event: dict[str, Any], thread_id: str, run_id: str, sanitizer: Sanitizer) -> GraphNode:
    text = _message_text(event.get("content"))
    return GraphNode(
        id=FINAL_NODE_ID,
        type="final",
        label="Final Answer",
        status="completed",
        thread_id=thread_id,
        run_id=run_id,
        parent_id=LEAD_NODE_ID,
        summary=sanitizer.text(text) if text else None,
        ended_at=event.get("created_at"),
    )


def final_node_from_run_error(event: dict[str, Any], thread_id: str, run_id: str, sanitizer: Sanitizer) -> GraphNode:
    text = _message_text(event.get("content"))
    return GraphNode(
        id=FINAL_NODE_ID,
        type="error",
        label="Run Failed",
        status="failed",
        thread_id=thread_id,
        run_id=run_id,
        parent_id=LEAD_NODE_ID,
        error=sanitizer.text(text) or "run failed",
        ended_at=event.get("created_at"),
    )


def lead_to_final_edge() -> GraphEdge:
    return GraphEdge(id="edge:lead->final", source=LEAD_NODE_ID, target=FINAL_NODE_ID, type="produces")
