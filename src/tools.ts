import type { Fixture } from "fantasy-premier-league-api";
import type {
  FastMCP,
  FastMCPSessionAuth,
  Tool,
  ToolParameters,
} from "fastmcp";
import { z } from "zod";

import { tracedTool } from "./traced-tool.js";

import {
  findPlayer,
  findPlayers,
  findTeam,
  getEvent,
  getFixtureForTeam,
  getFplData,
  getPositionName,
  getUpcomingFixtures,
  isPriceLocked,
  type Element,
} from "./data.js";
import {
  jsonResponse,
  serializeFixture,
  serializePlayer,
  serializePlayerCompact,
  serializePlayerDetails,
} from "./serializers.js";

const positionIds = {
  DEF: 2,
  FWD: 4,
  GKP: 1,
  MID: 3,
} as const;

type PlayerSort =
  | "bonus"
  | "defcon_per_90"
  | "expected_assists"
  | "expected_goals"
  | "form"
  | "gameweek_points"
  | "minutes"
  | "ownership"
  | "points"
  | "points_per_game"
  | "price"
  | "price_change"
  | "transfers_in";

const playerSortValue = (player: Element, sort: PlayerSort) => {
  switch (sort) {
    case "bonus":
      return player.bonus;
    case "defcon_per_90":
      return player.defensive_contribution_per_90;
    case "expected_assists":
      return Number(player.expected_assists);
    case "expected_goals":
      return Number(player.expected_goals);
    case "form":
      return Number(player.form);
    case "gameweek_points":
      return player.event_points;
    case "minutes":
      return player.minutes;
    case "ownership":
      return Number(player.selected_by_percent);
    case "price":
      return player.now_cost;
    case "price_change":
      return Number(player.price_change_percent);
    case "transfers_in":
      return player.transfers_in_event;
    case "points":
      return player.total_points;
    case "points_per_game":
      return Number(player.points_per_game);
  }
};

const getDefconTarget = (elementType: number) => {
  if (elementType === positionIds.DEF) {
    return { close: 8, position: "DEF", target: 10 };
  }
  if (elementType === positionIds.MID) {
    return { close: 10, position: "MID", target: 12 };
  }
  return null;
};

const isFixtureComplete = (fixture: Fixture) =>
  fixture.finished || fixture.finished_provisional;

export const registerTools = (server: FastMCP) => {
  const addTool = <Params extends ToolParameters>(
    tool: Tool<FastMCPSessionAuth, Params>,
  ) => server.addTool(tracedTool(tool));

  addTool({
    name: "get_player_info",
    description:
      "Find one FPL player by a natural name or partial name and return comprehensive details: price, points, form, ownership, expected stats, availability, set-piece order, DEFCON data, price-change projections, and upcoming fixtures. Use this for questions about a specific player.",
    parameters: z.object({
      fixtureLimit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe("Number of upcoming fixtures to include."),
      name: z
        .string()
        .min(1)
        .describe("Player name, surname, web name, or close partial spelling."),
    }),
    execute: async ({ fixtureLimit, name }) => {
      const { bootstrap, fixtures } = await getFplData();
      const player = findPlayer(name, bootstrap.elements);
      if (player == null) {
        return jsonResponse({ error: `No player found matching '${name}'.` });
      }

      return jsonResponse(
        serializePlayerDetails(
          player,
          bootstrap.teams,
          bootstrap.element_types,
          fixtures,
          fixtureLimit,
        ),
      );
    },
  });

  addTool({
    name: "search_players",
    description:
      "Search, filter, rank, and shortlist FPL players. Handles natural requests such as 'best midfielders under 7.5m', 'in-form Arsenal defenders', 'highest-owned forwards', 'top DEFCON players', or a fuzzy player-name search.",
    parameters: z.object({
      limit: z.number().int().min(1).max(25).default(10),
      maxPrice: z
        .number()
        .min(3)
        .max(20)
        .optional()
        .describe("Maximum FPL price in millions, e.g. 7.5."),
      minForm: z.number().min(0).optional(),
      minPoints: z.number().int().min(0).optional(),
      minPrice: z.number().min(3).max(20).optional(),
      position: z.enum(["GKP", "DEF", "MID", "FWD"]).optional(),
      query: z
        .string()
        .optional()
        .describe("Optional fuzzy player name or name fragment."),
      sortBy: z
        .enum([
          "points",
          "gameweek_points",
          "points_per_game",
          "form",
          "price",
          "ownership",
          "defcon_per_90",
          "transfers_in",
          "price_change",
          "bonus",
          "expected_goals",
          "expected_assists",
          "minutes",
        ])
        .default("points"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
      team: z
        .string()
        .optional()
        .describe("Club name or short code, e.g. Arsenal or ARS."),
    }),
    execute: async args => {
      const { bootstrap } = await getFplData();
      const team =
        args.team == null ? null : findTeam(args.team, bootstrap.teams);
      if (args.team != null && team == null) {
        return jsonResponse({
          error: `No team found matching '${args.team}'.`,
        });
      }

      let players =
        args.query == null
          ? [...bootstrap.elements]
          : findPlayers(
              args.query,
              bootstrap.elements,
              bootstrap.elements.length,
            );
      players = players.filter(player => {
        if (team != null && player.team !== team.id) return false;
        if (
          args.position != null &&
          player.element_type !== positionIds[args.position]
        ) {
          return false;
        }
        if (args.minPrice != null && player.now_cost / 10 < args.minPrice) {
          return false;
        }
        if (args.maxPrice != null && player.now_cost / 10 > args.maxPrice) {
          return false;
        }
        if (args.minPoints != null && player.total_points < args.minPoints) {
          return false;
        }
        if (args.minForm != null && Number(player.form) < args.minForm) {
          return false;
        }
        return true;
      });

      players.sort((a, b) => {
        const difference =
          playerSortValue(a, args.sortBy) - playerSortValue(b, args.sortBy);
        return args.sortOrder === "asc" ? difference : -difference;
      });

      return jsonResponse({
        count: Math.min(players.length, args.limit),
        players: players
          .slice(0, args.limit)
          .map(player =>
            serializePlayerCompact(
              player,
              bootstrap.teams,
              bootstrap.element_types,
            ),
          ),
      });
    },
  });

  addTool({
    name: "compare_players",
    description:
      "Compare two to six named FPL players side-by-side across price, points, form, ownership, expected stats, DEFCON, transfers, availability, and price-change signals.",
    parameters: z.object({
      names: z
        .array(z.string().min(1))
        .min(2)
        .max(6)
        .describe("Player names or fuzzy name fragments to compare."),
    }),
    execute: async ({ names }) => {
      const { bootstrap } = await getFplData();
      const players = names.map(name => ({
        name,
        player: findPlayer(name, bootstrap.elements),
      }));
      const missing = players
        .filter(result => result.player == null)
        .map(result => result.name);

      return jsonResponse({
        missing,
        players: players.flatMap(result =>
          result.player == null
            ? []
            : [
                serializePlayer(
                  result.player,
                  bootstrap.teams,
                  bootstrap.element_types,
                ),
              ],
        ),
      });
    },
  });

  addTool({
    name: "list_teams",
    description:
      "List all current Premier League clubs with IDs, short codes, table information, and FPL strength ratings. Use when the user asks which teams are available or needs club codes.",
    parameters: z.object({}),
    execute: async () => {
      const { bootstrap } = await getFplData();
      return jsonResponse(
        bootstrap.teams.map(team => ({
          id: team.id,
          name: team.name,
          played: team.played,
          points: team.points,
          position: team.position,
          shortName: team.short_name,
          strength: team.strength,
        })),
      );
    },
  });

  addTool({
    name: "get_team_info",
    description:
      "Find a club by natural name or short code and return its team details, upcoming fixtures with FDR, and leading FPL players. Use for broad questions about a specific club.",
    parameters: z.object({
      fixtureLimit: z.number().int().min(1).max(10).default(5),
      playerLimit: z.number().int().min(1).max(15).default(5),
      team: z.string().min(1).describe("Club name or short code."),
    }),
    execute: async ({ fixtureLimit, playerLimit, team: teamQuery }) => {
      const { bootstrap, fixtures } = await getFplData();
      const team = findTeam(teamQuery, bootstrap.teams);
      if (team == null) {
        return jsonResponse({
          error: `No team found matching '${teamQuery}'.`,
        });
      }

      const players = bootstrap.elements
        .filter(player => player.team === team.id)
        .sort((a, b) => b.total_points - a.total_points)
        .slice(0, playerLimit)
        .map(player =>
          serializePlayerCompact(
            player,
            bootstrap.teams,
            bootstrap.element_types,
          ),
        );

      return jsonResponse({
        team,
        leadingPlayers: players,
        upcomingFixtures: getUpcomingFixtures(
          team.id,
          fixtures,
          bootstrap.teams,
          fixtureLimit,
        ),
      });
    },
  });

  addTool({
    name: "get_team_fixtures",
    description:
      "Return fixtures or results for one club, including gameweek, kickoff, home/away, opponent, score, status, and FPL fixture difficulty. Use for natural questions about schedules, runs, results, or fixture difficulty.",
    parameters: z.object({
      limit: z.number().int().min(1).max(38).default(5),
      status: z.enum(["upcoming", "completed", "all"]).default("upcoming"),
      team: z.string().min(1).describe("Club name or short code."),
    }),
    execute: async ({ limit, status, team: teamQuery }) => {
      const { bootstrap, fixtures } = await getFplData();
      const team = findTeam(teamQuery, bootstrap.teams);
      if (team == null) {
        return jsonResponse({
          error: `No team found matching '${teamQuery}'.`,
        });
      }

      const matchingFixtures = fixtures
        .filter(
          fixture => fixture.team_h === team.id || fixture.team_a === team.id,
        )
        .filter(fixture => {
          const complete = isFixtureComplete(fixture);
          if (status === "upcoming") return !complete;
          if (status === "completed") return complete;
          return true;
        })
        .sort((a, b) => {
          const difference =
            new Date(a.kickoff_time).getTime() -
            new Date(b.kickoff_time).getTime();
          return status === "completed" ? -difference : difference;
        })
        .slice(0, limit)
        .map(fixture => getFixtureForTeam(fixture, team.id, bootstrap.teams));

      return jsonResponse({ team: team.name, fixtures: matchingFixtures });
    },
  });

  addTool({
    name: "get_gameweek_overview",
    description:
      "Return one gameweek's status, deadline, headline statistics, and every fixture. Defaults to the current gameweek, or the next gameweek when there is no current one.",
    parameters: z.object({
      gameweek: z.number().int().min(1).max(38).optional(),
    }),
    execute: async ({ gameweek }) => {
      const { bootstrap, fixtures } = await getFplData();
      const event = getEvent(bootstrap.events, gameweek);
      if (event == null) {
        return jsonResponse({ error: "Gameweek not found." });
      }

      return jsonResponse({
        event,
        fixtures: fixtures
          .filter(fixture => fixture.event === event.id)
          .map(fixture => serializeFixture(fixture, bootstrap.teams)),
      });
    },
  });

  addTool({
    name: "get_fixture_player_stats",
    description:
      "Return named player contributions from live or completed fixtures: goals, assists, cards, saves, bonus, BPS, and DEFCON. Filter by gameweek and/or club. Use for questions such as 'who scored?', 'who got bonus?', or 'what happened in the Arsenal match?'.",
    parameters: z.object({
      gameweek: z.number().int().min(1).max(38).optional(),
      includeUnstarted: z.boolean().default(false),
      team: z.string().optional().describe("Optional club name or short code."),
    }),
    execute: async ({ gameweek, includeUnstarted, team: teamQuery }) => {
      const { bootstrap, fixtures } = await getFplData();
      const event = getEvent(bootstrap.events, gameweek);
      if (event == null) {
        return jsonResponse({ error: "Gameweek not found." });
      }

      const team =
        teamQuery == null ? null : findTeam(teamQuery, bootstrap.teams);
      if (teamQuery != null && team == null) {
        return jsonResponse({
          error: `No team found matching '${teamQuery}'.`,
        });
      }

      const fixtureStats = fixtures
        .filter(fixture => fixture.event === event.id)
        .filter(fixture => includeUnstarted || fixture.started)
        .filter(
          fixture =>
            team == null ||
            fixture.team_h === team.id ||
            fixture.team_a === team.id,
        )
        .map(fixture => {
          const players = new Map<
            number,
            { id: number; name: string; stats: Record<string, number> }
          >();

          for (const stat of fixture.stats) {
            for (const entry of [...stat.h, ...stat.a]) {
              const player = bootstrap.elements.find(
                element => element.id === entry.element,
              );
              if (player == null) continue;

              const existing = players.get(player.id) ?? {
                id: player.id,
                name: player.web_name,
                stats: {},
              };
              existing.stats[stat.identifier] = entry.value;
              players.set(player.id, existing);
            }
          }

          return {
            fixture: serializeFixture(fixture, bootstrap.teams),
            players: [...players.values()],
          };
        });

      return jsonResponse({ gameweek: event.id, fixtures: fixtureStats });
    },
  });

  addTool({
    name: "get_gameweek_deadline",
    description:
      "Get the official deadline for a specific, current, or next FPL gameweek. Returns ISO time and Unix epoch so the caller can convert it to any requested timezone.",
    parameters: z.object({
      gameweek: z.number().int().min(1).max(38).optional(),
    }),
    execute: async ({ gameweek }) => {
      const { bootstrap } = await getFplData();
      const event = getEvent(bootstrap.events, gameweek);
      if (event == null) {
        return jsonResponse({ error: "Gameweek not found." });
      }

      return jsonResponse({
        deadlineEpoch: event.deadline_time_epoch,
        deadlineIso: event.deadline_time,
        gameweek: event.id,
        name: event.name,
      });
    },
  });

  addTool({
    name: "get_price_changes",
    description:
      "Return official FPL price-change progress and projections. Handles natural questions about likely risers, likely fallers, locked prices, tonight's changes, or multi-day projections.",
    parameters: z.object({
      direction: z.enum(["rise", "fall", "both"]).default("both"),
      includeLocked: z
        .boolean()
        .default(false)
        .describe("Include currently price-locked players in a separate list."),
      limit: z.number().int().min(1).max(50).default(10),
      minimumPercent: z
        .number()
        .min(0)
        .max(100)
        .default(0)
        .describe("Minimum absolute price-change progress percentage."),
    }),
    execute: async ({ direction, includeLocked, limit, minimumPercent }) => {
      const { bootstrap } = await getFplData();
      const serializePrice = (player: Element) => {
        const team = bootstrap.teams.find(team => team.id === player.team);
        return {
          id: player.id,
          name: player.web_name,
          team: team?.short_name ?? "Unknown",
          price: player.now_cost / 10,
          percent: Number(player.price_change_percent),
          hourlyRate: player.price_change_hourly_rate,
          calibrating: player.price_change_calibrating,
          locked: isPriceLocked(player),
          lockedUntil: player.price_change_locked_until,
          projections: player.price_change_projections.map(projection => ({
            dayOffset: projection.offset,
            likelihood: projection.likelihood,
            projectedPercent: Number(projection.projected_percent),
          })),
        };
      };

      const rising = bootstrap.elements
        .filter(player => Number(player.price_change_percent) > 0)
        .filter(
          player =>
            Math.abs(Number(player.price_change_percent)) >= minimumPercent,
        )
        .sort(
          (a, b) =>
            Number(b.price_change_percent) - Number(a.price_change_percent),
        )
        .slice(0, limit)
        .map(serializePrice);
      const falling = bootstrap.elements
        .filter(player => Number(player.price_change_percent) < 0)
        .filter(
          player =>
            Math.abs(Number(player.price_change_percent)) >= minimumPercent,
        )
        .sort(
          (a, b) =>
            Number(a.price_change_percent) - Number(b.price_change_percent),
        )
        .slice(0, limit)
        .map(serializePrice);
      const locked = includeLocked
        ? bootstrap.elements
            .filter(isPriceLocked)
            .sort(
              (a, b) =>
                new Date(a.price_change_locked_until!).getTime() -
                new Date(b.price_change_locked_until!).getTime(),
            )
            .slice(0, limit)
            .map(serializePrice)
        : [];

      return jsonResponse({
        falling: direction === "rise" ? [] : falling,
        locked,
        rising: direction === "fall" ? [] : rising,
      });
    },
  });

  addTool({
    name: "get_defcon_status",
    description:
      "Return defensive-contribution (DEFCON) progress from gameweek fixture stats. Defenders reach DEFCON at 10 and are close from 8; midfielders reach it at 12 and are close from 10. Defaults to close/reached players in the current gameweek.",
    parameters: z.object({
      gameweek: z.number().int().min(1).max(38).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      mode: z
        .enum(["close_or_reached", "reached", "all"])
        .default("close_or_reached"),
      status: z.enum(["active", "completed", "all"]).default("all"),
    }),
    execute: async ({ gameweek, limit, mode, status }) => {
      const { bootstrap, fixtures } = await getFplData();
      const event = getEvent(bootstrap.events, gameweek);
      if (event == null) {
        return jsonResponse({ error: "Gameweek not found." });
      }

      const results = fixtures
        .filter(fixture => fixture.event === event.id && fixture.started)
        .filter(fixture => {
          const complete = isFixtureComplete(fixture);
          if (status === "active") return !complete;
          if (status === "completed") return complete;
          return true;
        })
        .flatMap(fixture => {
          const stat = fixture.stats.find(
            fixtureStat => fixtureStat.identifier === "defensive_contribution",
          );
          if (stat == null) return [];

          return [...stat.h, ...stat.a].flatMap(({ element: id, value }) => {
            const player = bootstrap.elements.find(
              element => element.id === id,
            );
            if (player == null) return [];
            const target = getDefconTarget(player.element_type);
            if (target == null) return [];

            const complete = isFixtureComplete(fixture);
            const minimum =
              mode === "all"
                ? 0
                : mode === "reached" || complete
                  ? target.target
                  : target.close;
            if (value < minimum) return [];

            const team = bootstrap.teams.find(team => team.id === player.team);
            const fixtureDetails = serializeFixture(fixture, bootstrap.teams);
            return [
              {
                achieved: value >= target.target,
                fixture: {
                  awayTeam: fixtureDetails.awayTeamShortName,
                  finished: fixtureDetails.finished,
                  homeTeam: fixtureDetails.homeTeamShortName,
                  id: fixtureDetails.id,
                },
                player: player.web_name,
                position: target.position,
                progress: value,
                target: target.target,
                team: team?.short_name ?? "Unknown",
              },
            ];
          });
        })
        .sort((a, b) => b.progress - a.progress);

      return jsonResponse({
        gameweek: event.id,
        totalMatches: results.length,
        players: results.slice(0, limit),
      });
    },
  });

  addTool({
    name: "get_transfer_trends",
    description:
      "Return the most transferred-in, transferred-out, or net-transferred FPL players for the current gameweek. Use for popularity and market-movement questions.",
    parameters: z.object({
      direction: z.enum(["in", "out", "net"]).default("net"),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    execute: async ({ direction, limit }) => {
      const { bootstrap } = await getFplData();
      const value = (player: Element) => {
        if (direction === "in") return player.transfers_in_event;
        if (direction === "out") return player.transfers_out_event;
        return player.transfers_in_event - player.transfers_out_event;
      };
      const players = [...bootstrap.elements]
        .sort((a, b) => value(b) - value(a))
        .slice(0, limit)
        .map(player => {
          const team = bootstrap.teams.find(team => team.id === player.team);
          return {
            name: player.web_name,
            netTransfers:
              player.transfers_in_event - player.transfers_out_event,
            price: player.now_cost / 10,
            team: team?.short_name ?? "Unknown",
            transfersIn: player.transfers_in_event,
            transfersOut: player.transfers_out_event,
          };
        });

      return jsonResponse({ direction, players });
    },
  });

  addTool({
    name: "get_set_piece_takers",
    description:
      "Return penalty, direct-free-kick, and corner/indirect-free-kick order for players, optionally limited to one club. Use for set-piece taker questions.",
    parameters: z.object({
      team: z.string().optional().describe("Optional club name or short code."),
    }),
    execute: async ({ team: teamQuery }) => {
      const { bootstrap } = await getFplData();
      const team =
        teamQuery == null ? null : findTeam(teamQuery, bootstrap.teams);
      if (teamQuery != null && team == null) {
        return jsonResponse({
          error: `No team found matching '${teamQuery}'.`,
        });
      }

      const players = bootstrap.elements
        .filter(player => team == null || player.team === team.id)
        .filter(
          player =>
            player.penalties_order != null ||
            player.direct_freekicks_order != null ||
            player.corners_and_indirect_freekicks_order != null,
        )
        .map(player => ({
          cornersAndIndirectFreeKicks:
            player.corners_and_indirect_freekicks_order,
          directFreeKicks: player.direct_freekicks_order,
          name: player.web_name,
          penalties: player.penalties_order,
          position: getPositionName(
            player.element_type,
            bootstrap.element_types,
          ),
          team:
            bootstrap.teams.find(team => team.id === player.team)?.short_name ??
            "Unknown",
        }));

      return jsonResponse({ players });
    },
  });
};
