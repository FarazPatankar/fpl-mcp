import { FastMCP, type ResourceTemplate } from "fastmcp";
import { z } from "zod";
import {
  getBootstrapStatic,
  type BootstrapStatic,
} from "fantasy-premier-league-api";
import Fuse from "fuse.js";

const server = new FastMCP({
  name: "Fantasy Premier League",
  version: "0.0.1",
});

const elementResource: ResourceTemplate<BootstrapStatic["elements"][number]> = {
  uriTemplate: "elements://element/{id}",
  name: "element",
  mimeType: "application/json",
  arguments: [
    {
      name: "id",
      required: true,
    },
  ],
  load: async args => {
    const { elements } = await getBootstrapStatic();

    const id = Number(args.id);
    const element = elements.find(element => element.id === id);

    return {
      text: JSON.stringify(element),
    };
  },
};

server.addResourceTemplate(elementResource);

const findPlayer = async (name: string) => {
  const { elements } = await getBootstrapStatic();

  const fuse = new Fuse(elements, {
    keys: ["web_name", "first_name", "second_name"],
  });
  const response = fuse.search(name);

  if (response.length === 0) {
    return null;
  }

  return response[0]?.item;
};

server.addTool({
  name: "get_player_info",
  description: "Get player info",
  parameters: z.object({
    name: z.string(),
  }),
  execute: async args => {
    const player = await findPlayer(args.name);
    if (player == null) {
      return "Player not found";
    }

    return {
      content: [
        {
          type: "resource",
          resource: await server.embedded(`elements://element/${player.id}`),
        },
      ],
    };
  },
});

server.start({
  transportType: "httpStream",
  httpStream: {
    port: 5678,
  },
});
