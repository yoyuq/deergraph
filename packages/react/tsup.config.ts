import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "components/agent-graph/index": "src/components/agent-graph/index.ts",
    "core/agent-graph/types": "src/core/agent-graph/types.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "@xyflow/react",
    "@tanstack/react-query",
    "clsx",
    "lucide-react",
    "tailwind-merge",
  ],
});
