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

## Development

```bash
bun run typecheck
bun test
bun run format:check
```
