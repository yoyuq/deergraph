/**
 * Tests for the pure presentation helpers shared by the node renderer and the
 * details panel. Keeping role labels, status tone, and duration formatting in
 * pure functions makes the visual contract testable without rendering.
 */
import { describe, expect, test } from "vitest";

import {
  formatDuration,
  nodeRoleLabel,
  statusLabel,
  statusTone,
} from "@/core/agent-graph/visuals";

describe("nodeRoleLabel", () => {
  test.each([
    ["user", "User"],
    ["lead_agent", "Lead Agent"],
    ["subagent", "Subagent"],
    ["tool", "Tool"],
    ["final", "Final Answer"],
    ["error", "Error"],
  ] as const)("%s -> %s", (type, label) => {
    expect(nodeRoleLabel(type)).toBe(label);
  });
});

describe("statusTone", () => {
  test.each([
    ["pending", "neutral"],
    ["running", "running"],
    ["completed", "success"],
    ["failed", "danger"],
    ["cancelled", "warning"],
    ["timeout", "warning"],
  ] as const)("%s -> %s", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});

describe("statusLabel", () => {
  test("humanizes the status token", () => {
    expect(statusLabel("running")).toBe("Running");
    expect(statusLabel("completed")).toBe("Completed");
  });
});

describe("formatDuration", () => {
  test("returns null when duration is missing", () => {
    expect(formatDuration(undefined)).toBeNull();
  });

  test("renders sub-second durations in ms", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  test("renders seconds with one decimal", () => {
    expect(formatDuration(1500)).toBe("1.5s");
  });

  test("renders minutes and seconds for long durations", () => {
    expect(formatDuration(65000)).toBe("1m 5s");
  });
});
