import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { FastMCPSession } from "fastmcp";

import { createFplServer } from "./server.js";

let client: Client | null = null;
let session: FastMCPSession | null = null;

afterEach(async () => {
  await client?.close();
  await session?.close();
  client = null;
  session = null;
});

describe("FPL MCP server", () => {
  test("registers broad natural-language tooling", async () => {
    const server = createFplServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });

    [session] = await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name).sort()).toEqual(
      [
        "compare_players",
        "get_defcon_status",
        "get_fixture_player_stats",
        "get_gameweek_deadline",
        "get_gameweek_overview",
        "get_player_info",
        "get_price_changes",
        "get_set_piece_takers",
        "get_team_fixtures",
        "get_team_info",
        "get_transfer_trends",
        "list_teams",
        "search_players",
      ].sort(),
    );
    expect(tools.every(tool => (tool.description?.length ?? 0) > 40)).toBe(
      true,
    );
  });
});
