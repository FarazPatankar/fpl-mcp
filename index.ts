import { createFplServer } from "./src/server.js";

const port = Number(process.env.PORT ?? 5678);
const server = createFplServer();

const shutdown = async (signal: NodeJS.Signals) => {
  console.log(`Received ${signal}; shutting down`);
  await server.stop();
  process.exit(0);
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
  process.exit(1);
}
