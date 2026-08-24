import { describe, expect, test } from "bun:test";

import {
  findPlayer,
  findTeam,
  getFixtureForTeam,
  type Element,
  type Team,
} from "./data.js";

const players = [
  {
    first_name: "Cole",
    id: 1,
    second_name: "Palmer",
    web_name: "Palmer",
  },
  {
    first_name: "Bukayo",
    id: 2,
    second_name: "Saka",
    web_name: "Saka",
  },
] as Element[];

const teams = [
  { id: 1, name: "Arsenal", short_name: "ARS" },
  { id: 2, name: "Chelsea", short_name: "CHE" },
] as Team[];

describe("FPL data helpers", () => {
  test("finds players by exact and fuzzy natural names", () => {
    expect(findPlayer("palmer", players)?.id).toBe(1);
    expect(findPlayer("bukyo saka", players)?.id).toBe(2);
    expect(findPlayer("not a footballer", players)).toBeNull();
  });

  test("finds teams by name, short code, and fuzzy spelling", () => {
    expect(findTeam("ARS", teams)?.id).toBe(1);
    expect(findTeam("chelse", teams)?.id).toBe(2);
    expect(findTeam("Barcelona", teams)).toBeNull();
  });

  test("formats a fixture from a team's perspective", () => {
    const fixture = {
      event: 3,
      finished: false,
      finished_provisional: false,
      id: 10,
      kickoff_time: "2026-09-01T15:00:00Z",
      started: false,
      team_a: 2,
      team_a_difficulty: 4,
      team_a_score: null,
      team_h: 1,
      team_h_difficulty: 2,
      team_h_score: null,
    } as Parameters<typeof getFixtureForTeam>[0];

    expect(getFixtureForTeam(fixture, 1, teams)).toMatchObject({
      difficulty: 2,
      event: 3,
      isHome: true,
      opponent: "Chelsea",
    });
    expect(getFixtureForTeam(fixture, 2, teams)).toMatchObject({
      difficulty: 4,
      isHome: false,
      opponent: "Arsenal",
    });
  });
});
