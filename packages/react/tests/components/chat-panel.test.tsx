// @vitest-environment jsdom
/**
 * Tests for the chat-page Agent Graph panel. The panel is the Stage-4
 * integration seam: given a resolved run id it reuses the Stage-3
 * `AgentGraphView`. We mock the heavy canvas and the data hook so this stays a
 * fast, deterministic component test that pins the branch behavior:
 *   - no run id  -> a hint state (never a fabricated graph), query disabled
 *   - run id     -> the real AgentGraphView, fed by useAgentGraph
 *   - closed     -> the query is disabled (enabled:false)
  - polling    -> host-controlled refetchIntervalMs is passed through
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/components/agent-graph/agent-graph-canvas", () => ({
  AgentGraphCanvas: () => <div data-testid="canvas-stub" />,
}));

vi.mock("@/core/agent-graph/hooks", () => ({
  useAgentGraph: vi.fn(),
}));

import { ChatAgentGraphPanel } from "@/components/agent-graph/chat-agent-graph-panel";
import { useAgentGraph } from "@/core/agent-graph/hooks";
import type { AgentGraphSnapshot } from "@/core/agent-graph/types";

const mockedUseAgentGraph = vi.mocked(useAgentGraph);

function queryResult(over: Partial<ReturnType<typeof useAgentGraph>> = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useAgentGraph>;
}

function snapshot(): AgentGraphSnapshot {
  return {
    threadId: "t1",
    runId: "r1",
    version: 1,
    truncated: false,
    updatedAt: "2026-05-31T00:00:00+00:00",
    nodes: [
      {
        id: "user",
        type: "user",
        label: "User",
        status: "completed",
        threadId: "t1",
        runId: "r1",
      },
    ],
    edges: [],
  };
}

afterEach(() => {
  cleanup();
  mockedUseAgentGraph.mockReset();
});

describe("ChatAgentGraphPanel", () => {
  test("shows a hint and disables the query when there is no run id", () => {
    mockedUseAgentGraph.mockReturnValue(queryResult());

    render(<ChatAgentGraphPanel runId={null} open onClose={vi.fn()} />);

    expect(screen.getByText("Agent Graph")).toBeInTheDocument();
    expect(screen.getByText(/no run selected/i)).toBeInTheDocument();
    // No run id -> the query is disabled (enabled:false), no canvas.
    expect(mockedUseAgentGraph).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false }),
    );
    expect(screen.queryByTestId("canvas-stub")).not.toBeInTheDocument();
  });

  test("renders the graph view when a run id is present", () => {
    mockedUseAgentGraph.mockReturnValue(queryResult({ data: snapshot() }));

    render(<ChatAgentGraphPanel runId="r1" open onClose={vi.fn()} />);

    expect(screen.getByTestId("canvas-stub")).toBeInTheDocument();
    expect(mockedUseAgentGraph).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ enabled: true }),
    );
  });

  test("passes host-controlled polling interval through", () => {
    mockedUseAgentGraph.mockReturnValue(queryResult({ data: snapshot() }));

    render(
      <ChatAgentGraphPanel
        runId="r1"
        open
        refetchIntervalMs={2500}
        onClose={vi.fn()}
      />,
    );

    expect(mockedUseAgentGraph).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ enabled: true, refetchIntervalMs: 2500 }),
    );
  });

  test("disables the query and polling entirely when the panel is closed", () => {
    mockedUseAgentGraph.mockReturnValue(queryResult({ data: snapshot() }));

    render(
      <ChatAgentGraphPanel
        runId="r1"
        open={false}
        refetchIntervalMs={2500}
        onClose={vi.fn()}
      />,
    );

    expect(mockedUseAgentGraph).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ enabled: false, refetchIntervalMs: false }),
    );
  });
});
