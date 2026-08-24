import { FastMCP } from "fastmcp";

import { registerTools } from "./tools.js";

export const createFplServer = () => {
  const server = new FastMCP({
    name: "Fantasy Premier League",
    version: "1.0.0",
    health: {
      enabled: true,
      path: "/healthz",
    },
  });

  registerTools(server);

  return server;
};
