// @vitest-environment jsdom
/**
 * Smoke test for the real React Flow canvas (not mocked). Verifies the canvas
 * mounts from a fixture snapshot, renders the React Flow viewport, and paints
 * the custom node cards with their role labels. ResizeObserver is stubbed in
 * the global test setup so React Flow can mount under jsdom.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { AgentGraphCanvas } from "@/components/agent-graph/agent-graph-canvas";
import type { AgentGraphSnapshot } from "@/core/agent-graph/types";

function fixture(): AgentGraphSnapshot {
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
        summary: "Research quantum computing",
      },
      {
        id: "lead_agent",
        type: "lead_agent",
        label: "Lead Agent",
        status: "completed",
        threadId: "t1",
        runId: "r1",
      },
    ],
    edges: [
      {
        id: "edge:user->lead",
        source: "user",
        target: "lead_agent",
        type: "input",
      },
    ],
  };
}

afterEach(cleanup);

describe("AgentGraphCanvas", () => {
  test("mounts React Flow and renders node cards from the snapshot", () => {
    const { container } = render(<AgentGraphCanvas snapshot={fixture()} />);

    // React Flow root mounted.
    expect(container.querySelector(".react-flow")).not.toBeNull();
    // Custom node cards painted with their role labels.
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Lead Agent")).toBeInTheDocument();
  });
});
