import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { FastMCPSessionAuth, Tool, ToolParameters } from "fastmcp";

/** Trace one logical tool invocation, without recording arguments or results. */
export const tracedTool = <Params extends ToolParameters>(
  tool: Tool<FastMCPSessionAuth, Params>,
): Tool<FastMCPSessionAuth, Params> => ({
  ...tool,
  execute: (args, context) =>
    trace
      .getTracer("fpl-mcp")
      .startActiveSpan(`mcp.tool ${tool.name}`, async span => {
        try {
          return await tool.execute(args, context);
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.recordException({
            name: "ToolError",
            message: "MCP tool execution failed",
          });
          throw error;
        } finally {
          span.end();
        }
      }),
});
