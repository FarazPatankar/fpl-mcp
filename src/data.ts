import {
  getAllFixtures,
  getBootstrapStatic,
  type BootstrapStatic,
  type Fixture,
} from "fantasy-premier-league-api";
import Fuse from "fuse.js";

export type Element = BootstrapStatic["elements"][number];
export type ElementType = BootstrapStatic["element_types"][number];
export type Event = BootstrapStatic["events"][number];
export type Team = BootstrapStatic["teams"][number];

export interface FplData {
  bootstrap: BootstrapStatic;
  fixtures: Fixture[];
}

const CACHE_TTL_MS = 60_000;
let cachedData: Promise<FplData> | null = null;
let cacheExpiresAt = 0;

export const getFplData = async (): Promise<FplData> => {
  const now = Date.now();
  if (cachedData != null && now < cacheExpiresAt) {
    return cachedData;
  }

  cachedData = Promise.all([getBootstrapStatic(), getAllFixtures()])
    .then(([bootstrap, fixtures]) => ({ bootstrap, fixtures }))
    .catch(error => {
      cachedData = null;
      cacheExpiresAt = 0;
      throw error;
    });
  cacheExpiresAt = now + CACHE_TTL_MS;

  return cachedData;
};

export const clearFplDataCache = () => {
  cachedData = null;
  cacheExpiresAt = 0;
};

const normalize = (value: string) => value.trim().toLowerCase();

export const findPlayers = (
  query: string,
  elements: Element[],
  limit = 10,
): Element[] => {
  const normalizedQuery = normalize(query);
  const exactMatches = elements.filter(element =>
    [element.web_name, element.first_name, element.second_name]
      .map(normalize)
      .includes(normalizedQuery),
  );

  if (exactMatches.length > 0) {
    return exactMatches.slice(0, limit);
  }

  const searchableElements = elements.map(element => ({
    element,
    fullName: `${element.first_name} ${element.second_name}`,
  }));
  const fuse = new Fuse(searchableElements, {
    includeScore: true,
    keys: [
      { name: "element.web_name", weight: 0.4 },
      { name: "fullName", weight: 0.3 },
      { name: "element.second_name", weight: 0.2 },
      { name: "element.first_name", weight: 0.1 },
    ],
    threshold: 0.45,
  });

  return fuse.search(query, { limit }).map(result => result.item.element);
};

export const findPlayer = (query: string, elements: Element[]) =>
  findPlayers(query, elements, 1)[0] ?? null;

export const findTeam = (query: string, teams: Team[]): Team | null => {
  const normalizedQuery = normalize(query);
  const exactMatch = teams.find(team =>
    [team.name, team.short_name].map(normalize).includes(normalizedQuery),
  );
  if (exactMatch != null) {
    return exactMatch;
  }

  const fuse = new Fuse(teams, {
    includeScore: true,
    keys: [
      { name: "name", weight: 0.7 },
      { name: "short_name", weight: 0.3 },
    ],
    threshold: 0.35,
  });
  const result = fuse.search(query, { limit: 1 })[0];

  return result != null && (result.score ?? 1) <= 0.35 ? result.item : null;
};

export const getPositionName = (
  elementTypeId: number,
  elementTypes: ElementType[],
) =>
  elementTypes.find(elementType => elementType.id === elementTypeId)
    ?.singular_name_short ?? "Unknown";

export const getFixtureForTeam = (
  fixture: Fixture,
  teamId: number,
  teams: Team[],
) => {
  const isHome = fixture.team_h === teamId;
  const opponentId = isHome ? fixture.team_a : fixture.team_h;
  const opponent = teams.find(team => team.id === opponentId);

  return {
    awayScore: fixture.team_a_score,
    difficulty: isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty,
    event: fixture.event,
    finished: fixture.finished || fixture.finished_provisional,
    homeScore: fixture.team_h_score,
    id: fixture.id,
    isHome,
    kickoffTime: fixture.kickoff_time,
    opponent: opponent?.name ?? "Unknown",
    opponentShortName: opponent?.short_name ?? "Unknown",
    started: fixture.started,
  };
};

export const getUpcomingFixtures = (
  teamId: number,
  fixtures: Fixture[],
  teams: Team[],
  limit = 5,
) =>
  fixtures
    .filter(
      fixture =>
        (fixture.team_h === teamId || fixture.team_a === teamId) &&
        !fixture.finished &&
        !fixture.finished_provisional,
    )
    .sort(
      (a, b) =>
        new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime(),
    )
    .slice(0, limit)
    .map(fixture => getFixtureForTeam(fixture, teamId, teams));

export const getDefaultEvent = (events: Event[]) =>
  events.find(event => event.is_current) ??
  events.find(event => event.is_next) ??
  null;

export const getEvent = (events: Event[], eventId?: number) =>
  eventId == null
    ? getDefaultEvent(events)
    : (events.find(event => event.id === eventId) ?? null);

export const isPriceLocked = (element: Element) =>
  element.price_change_locked_until != null &&
  new Date(element.price_change_locked_until).getTime() > Date.now();
