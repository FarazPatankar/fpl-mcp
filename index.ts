import { shutdownTelemetry } from "./src/instrumentation.js";

// Initialize telemetry before application modules capture fetch.
const { createFplServer } = await import("./src/server.js");

const port = Number(process.env.PORT ?? 5678);
const server = createFplServer();

let shuttingDown = false;
const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down`);
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  let exitCode = 0;
  try {
    await server.stop();
  } catch (error) {
    console.error("Error stopping server", error);
    exitCode = 1;
  } finally {
    try {
      await shutdownTelemetry();
    } catch (error) {
      console.error("Error flushing telemetry", error);
      exitCode = 1;
    }
    clearTimeout(timeout);
    process.exit(exitCode);
  }
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await server.start({
    transportType: "httpStream",
    httpStream: {
      host: "0.0.0.0",
      port,
    },
  });
  console.log(`FPL MCP server listening on port ${port}`);
} catch (error) {
  console.error("Error starting FPL MCP server", error);
  await shutdownTelemetry().catch(() => {});
  process.exit(1);
}
