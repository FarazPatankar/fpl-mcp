import { FastMCP } from "fastmcp";
import { z } from "zod";
import { getBootstrapStatic } from "fantasy-premier-league-api";

const server = new FastMCP({
  name: "My Server",
  version: "1.0.0",
});

server.addTool({
  name: "add",
  description: "Add two numbers",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: async args => {
    return String(args.a + args.b);
  },
});

server.addTool({
  name: "get_player_info",
  description: "Get player info",
  parameters: z.object({
    name: z.string(),
  }),
  execute: async args => {
    const { elements } = await getBootstrapStatic();
    const player = elements.find(element => element.web_name === args.name);
    if (player == null) {
      return "Player not found";
    }

    return player.first_name + " " + player.second_name;
  },
});

server.start({
  transportType: "httpStream",
  httpStream: {
    port: 5678,
  },
});
