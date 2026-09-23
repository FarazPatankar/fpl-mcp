# fpl-mcp

A remote MCP server for the Fantasy Premier League API, designed for natural-language FPL questions.

## Tools

- `get_player_info` — comprehensive player details and upcoming fixtures
- `search_players` — fuzzy search, filtering, shortlisting, and rankings
- `compare_players` — side-by-side player comparisons
- `list_teams` — current Premier League clubs and short codes
- `get_team_info` — club details, leading players, and upcoming fixtures
- `get_team_fixtures` — schedules, results, and fixture difficulty
- `get_gameweek_overview` — gameweek status, deadline, and fixtures
- `get_fixture_player_stats` — goals, assists, cards, saves, bonus, BPS, and DEFCON by fixture
- `get_gameweek_deadline` — official deadline for any gameweek
- `get_price_changes` — official price-change progress, projections, and locks
- `get_defcon_status` — live and completed-game DEFCON progress
- `get_transfer_trends` — transfers in, out, and net movement
- `get_set_piece_takers` — penalties, free kicks, and corners

Player and team names support fuzzy matching. FPL API responses are cached for 60 seconds to avoid duplicate upstream requests during multi-step conversations.

## Install

```bash
bun install
```

## Run

```bash
bun run start
```

The server uses `PORT` when provided and otherwise listens on port `5678`.

Remote endpoints:

- Streamable HTTP: `/mcp`
- SSE: `/sse`
- Health check: `/healthz`

## Tracing

`index.ts` initializes the OpenTelemetry SDK before dynamically loading the app.
The existing `bun run start` command is unchanged. Explicit Bun-compatible
instrumentation covers FastMCP's `node:http` server, each MCP tool invocation,
and outbound native `fetch` calls (including FPL API calls on cache misses).
W3C `traceparent`/`tracestate` continue through async work and outgoing requests;
parent-based sampling is configured by the SDK environment defaults.

Railway supplies exporter endpoint, protocol, headers, service identity and
sampling on the next deployment after tracing is enabled. Do not hardcode them.
Set `OTEL_METRICS_EXPORTER=none` and `OTEL_LOGS_EXPORTER=none` because Railway's
receiver accepts traces only. Keep OBI off to avoid duplicate spans. For local
runs without a collector, use `OTEL_TRACES_EXPORTER=none` (and the two `none`
settings above), or `OTEL_SDK_DISABLED=true`.

SIGINT/SIGTERM stop the MCP server and flush the SDK, with a 10-second shutdown
budget. HTTP server spans end on response finish/close; long-lived SSE streams
therefore finish when disconnected. Fetch spans measure time to response headers;
tool spans include response parsing. Traces omit request arguments, response
bodies, URL queries, auth headers and raw error messages.

`bun test` includes a subprocess integration test with local FPL and OTLP/HTTP
JSON collectors, validating incoming parenting, outbound propagation, tool/I/O
nesting and shutdown flushing without calling production. Production protocol
selection remains environment-driven (Railway supplies HTTP/protobuf).

## Development

```bash
bun run typecheck
bun test
bun run format:check
```
