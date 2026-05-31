/**
 * Public entry for `@deergraph/react` (ADR-004 public API).
 *
 * - Configuration: {@link configureDeergraph}, {@link DeergraphProvider}
 * - Top-level components: {@link AgentGraphView}, {@link ChatAgentGraphPanel}
 * - Graph + runtime-config types
 *
 * Sub-paths: `@deergraph/react/components` and `@deergraph/react/types`.
 */

export {
  configureDeergraph,
  DeergraphProvider,
  useDeergraphRuntime,
  getDeergraphRuntime,
  type DeergraphRuntimeConfig,
} from "./runtime-config";

export {
  AgentGraphView,
  type AgentGraphViewProps,
  ChatAgentGraphPanel,
  type ChatAgentGraphPanelProps,
} from "./components/agent-graph";

export {
  fetchAgentGraph,
  useAgentGraph,
  agentGraphQueryKey,
  type UseAgentGraphOptions,
  snapshotToFlow,
  type AgentFlowGraph,
  type AgentFlowNode,
  type AgentFlowEdge,
} from "./core/agent-graph";

export type {
  AgentGraphSnapshot,
  AgentGraphNode,
  AgentGraphEdge,
  AgentGraphNodeType,
  AgentGraphNodeStatus,
  AgentGraphEdgeType,
  AgentGraphEdgeStatus,
} from "./core/agent-graph/types";
