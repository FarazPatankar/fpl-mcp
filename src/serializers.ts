import type { Fixture } from "fantasy-premier-league-api";

import {
  getPositionName,
  getUpcomingFixtures,
  isPriceLocked,
  type Element,
  type ElementType,
  type Team,
} from "./data.js";

export const serializePlayer = (
  player: Element,
  teams: Team[],
  elementTypes: ElementType[],
) => {
  const team = teams.find(team => team.id === player.team);

  return {
    id: player.id,
    name: player.web_name,
    fullName: `${player.first_name} ${player.second_name}`.trim(),
    team: team?.name ?? "Unknown",
    teamShortName: team?.short_name ?? "Unknown",
    position: getPositionName(player.element_type, elementTypes),
    price: player.now_cost / 10,
    totalPoints: player.total_points,
    gameweekPoints: player.event_points,
    pointsPerGame: Number(player.points_per_game),
    form: Number(player.form),
    ownershipPercent: Number(player.selected_by_percent),
    minutes: player.minutes,
    starts: player.starts,
    goals: player.goals_scored,
    assists: player.assists,
    cleanSheets: player.clean_sheets,
    goalsConceded: player.goals_conceded,
    saves: player.saves,
    yellowCards: player.yellow_cards,
    redCards: player.red_cards,
    bonus: player.bonus,
    bps: player.bps,
    expectedGoals: Number(player.expected_goals),
    expectedAssists: Number(player.expected_assists),
    expectedGoalInvolvements: Number(player.expected_goal_involvements),
    expectedGoalsConceded: Number(player.expected_goals_conceded),
    defensiveContribution: player.defensive_contribution,
    defensiveContributionPer90: player.defensive_contribution_per_90,
    clearancesBlocksInterceptions: player.clearances_blocks_interceptions,
    recoveries: player.recoveries,
    tackles: player.tackles,
    transfersInGameweek: player.transfers_in_event,
    transfersOutGameweek: player.transfers_out_event,
    priceChange: {
      calibrating: player.price_change_calibrating,
      hourlyRate: player.price_change_hourly_rate,
      locked: isPriceLocked(player),
      lockedUntil: player.price_change_locked_until,
      percent: Number(player.price_change_percent),
      projections: player.price_change_projections.map(projection => ({
        dayOffset: projection.offset,
        likelihood: projection.likelihood,
        projectedPercent: Number(projection.projected_percent),
      })),
    },
    availability: {
      chanceNextRound: player.chance_of_playing_next_round,
      chanceThisRound: player.chance_of_playing_this_round,
      news: player.news || null,
      status: player.status,
    },
    setPieces: {
      cornersAndIndirectFreeKicksOrder:
        player.corners_and_indirect_freekicks_order,
      directFreeKicksOrder: player.direct_freekicks_order,
      penaltiesOrder: player.penalties_order,
    },
  };
};

export const serializePlayerCompact = (
  player: Element,
  teams: Team[],
  elementTypes: ElementType[],
) => {
  const details = serializePlayer(player, teams, elementTypes);

  return {
    id: details.id,
    name: details.name,
    team: details.teamShortName,
    position: details.position,
    price: details.price,
    totalPoints: details.totalPoints,
    gameweekPoints: details.gameweekPoints,
    pointsPerGame: details.pointsPerGame,
    form: details.form,
    ownershipPercent: details.ownershipPercent,
    expectedGoals: details.expectedGoals,
    expectedAssists: details.expectedAssists,
    defensiveContributionPer90: details.defensiveContributionPer90,
    priceChangePercent: details.priceChange.percent,
    transfersInGameweek: details.transfersInGameweek,
    transfersOutGameweek: details.transfersOutGameweek,
    news: details.availability.news,
  };
};

export const serializePlayerDetails = (
  player: Element,
  teams: Team[],
  elementTypes: ElementType[],
  fixtures: Fixture[],
  fixtureLimit = 5,
) => ({
  ...serializePlayer(player, teams, elementTypes),
  upcomingFixtures: getUpcomingFixtures(
    player.team,
    fixtures,
    teams,
    fixtureLimit,
  ),
});

export const serializeFixture = (fixture: Fixture, teams: Team[]) => {
  const homeTeam = teams.find(team => team.id === fixture.team_h);
  const awayTeam = teams.find(team => team.id === fixture.team_a);

  return {
    id: fixture.id,
    gameweek: fixture.event,
    kickoffTime: fixture.kickoff_time,
    started: fixture.started,
    finished: fixture.finished || fixture.finished_provisional,
    homeTeam: homeTeam?.name ?? "Unknown",
    homeTeamShortName: homeTeam?.short_name ?? "Unknown",
    homeScore: fixture.team_h_score,
    homeDifficulty: fixture.team_h_difficulty,
    awayTeam: awayTeam?.name ?? "Unknown",
    awayTeamShortName: awayTeam?.short_name ?? "Unknown",
    awayScore: fixture.team_a_score,
    awayDifficulty: fixture.team_a_difficulty,
  };
};

export const jsonResponse = (value: unknown) => JSON.stringify(value, null, 2);
