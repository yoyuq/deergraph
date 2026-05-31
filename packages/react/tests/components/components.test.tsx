// @vitest-environment jsdom
/**
 * Component tests for the DeerGraph presentational pieces and the state
 * orchestrator. The pure card / details-panel / state components are rendered
 * directly (no React Flow context). The orchestrator's branch selection
 * (loading / error / empty / data) is pinned with the heavy canvas child
 * mocked, so this stays a fast, deterministic component test fed by a fixture.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/components/workspace/agent-graph/agent-graph-canvas", () => ({
  AgentGraphCanvas: () => <div data-testid="canvas-stub" />,
}));

import { AgentGraphDetailsPanel } from "@/components/workspace/agent-graph/agent-graph-details-panel";
import { AgentGraphNodeCard } from "@/components/workspace/agent-graph/agent-graph-node";
import {
  AgentGraphEmpty,
  AgentGraphError,
  AgentGraphLoading,
} from "@/components/workspace/agent-graph/agent-graph-states";
import { AgentGraphView } from "@/components/workspace/agent-graph/agent-graph-view";
import type {
  AgentGraphNode,
  AgentGraphSnapshot,
} from "@/core/agent-graph/types";

function makeNode(p: Partial<AgentGraphNode> = {}): AgentGraphNode {
  return {
    id: "subagent:call_1",
    type: "subagent",
    label: "Subagent",
    status: "completed",
    threadId: "t1",
    runId: "r1",
    summary: "research quantum basics",
    durationMs: 1500,
    ...p,
  };
}

function makeSnapshot(p: Partial<AgentGraphSnapshot> = {}): AgentGraphSnapshot {
  return {
    threadId: "t1",
    runId: "r1",
    version: 1,
    truncated: false,
    updatedAt: "2026-05-31T00:00:00+00:00",
    nodes: [makeNode()],
    edges: [],
    ...p,
  };
}

afterEach(cleanup);

describe("AgentGraphNodeCard", () => {
  test("renders the role label, status and summary", () => {
    render(<AgentGraphNodeCard node={makeNode()} />);
    expect(screen.getByText("Subagent")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText(/research quantum basics/)).toBeInTheDocument();
  });
});

describe("AgentGraphDetailsPanel", () => {
  test("prompts to select a node when none is selected", () => {
    render(<AgentGraphDetailsPanel node={null} />);
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
  });

  test("renders the selected node's fields including duration", () => {
    render(<AgentGraphDetailsPanel node={makeNode()} />);
    expect(screen.getByText("subagent:call_1")).toBeInTheDocument();
    expect(screen.getByText("1.5s")).toBeInTheDocument();
    expect(screen.getByText(/research quantum basics/)).toBeInTheDocument();
  });

  test("renders an error field for failed nodes", () => {
    render(
      <AgentGraphDetailsPanel
        node={makeNode({ type: "error", status: "failed", error: "kaboom" })}
      />,
    );
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
  });
});

describe("AgentGraph state components", () => {
  test("loading state announces loading", () => {
    render(<AgentGraphLoading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test("empty state explains there is nothing to show", () => {
    render(<AgentGraphEmpty />);
    expect(screen.getByText(/no graph/i)).toBeInTheDocument();
  });

  test("error state shows the message and retries", () => {
    const onRetry = vi.fn();
    render(
      <AgentGraphError error={new Error("load failed")} onRetry={onRetry} />,
    );
    expect(screen.getByText(/load failed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("AgentGraphView orchestration", () => {
  test("shows loading while pending", () => {
    render(
      <AgentGraphView
        isPending
        isError={false}
        error={null}
        data={undefined}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test("shows error branch on failure", () => {
    render(
      <AgentGraphView
        isPending={false}
        isError
        error={new Error("nope 500")}
        data={undefined}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/nope 500/)).toBeInTheDocument();
  });

  test("shows empty state when the snapshot has no nodes", () => {
    render(
      <AgentGraphView
        isPending={false}
        isError={false}
        error={null}
        data={makeSnapshot({ nodes: [], edges: [] })}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/no graph/i)).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-stub")).not.toBeInTheDocument();
  });

  test("renders the canvas when the snapshot has nodes", () => {
    render(
      <AgentGraphView
        isPending={false}
        isError={false}
        error={null}
        data={makeSnapshot()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canvas-stub")).toBeInTheDocument();
  });

  test("surfaces a truncation warning when the snapshot is truncated", () => {
    render(
      <AgentGraphView
        isPending={false}
        isError={false}
        error={null}
        data={makeSnapshot({ truncated: true })}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/may be incomplete|truncated/i)).toBeInTheDocument();
  });
});
