export type ApiUser = {
  userId: number;
  username: string;
  role: "admin" | "player";
};

export type AdminUser = {
  id: number;
  username: string;
  role: "admin" | "player";
  isBanned: boolean;
};

export type Team = {
  id: number;
  externalId: number;
  name: string;
  shortName: string | null;
  code: string | null;
  crestUrl: string | null;
};

export type Match = {
  id: number;
  externalId: number;
  competition: string;
  stage: string | null;
  matchday: number | null;
  homeTeam: Team;
  awayTeam: Team;
  kickoffAt: string;
  status: "scheduled" | "in_progress" | "finished" | "postponed" | "cancelled";
  homeScore: number | null;
  awayScore: number | null;
  locked: boolean;
};

export type MatchDetails = {
  group: string | null;
  referees: {
    id: number | null;
    name: string;
    type: string | null;
    nationality: string | null;
  }[];
  venue: string | null;
  lastUpdated: string | null;
  goals: {
    minute: number | null;
    injuryTime: number | null;
    type: string | null;
    team: MatchEventParticipant | null;
    scorer: MatchEventParticipant | null;
    assist: MatchEventParticipant | null;
    homeScore: number | null;
    awayScore: number | null;
  }[];
  bookings: {
    minute: number | null;
    injuryTime: number | null;
    card: string | null;
    team: MatchEventParticipant | null;
    player: MatchEventParticipant | null;
  }[];
  lineups: {
    team: MatchEventParticipant | null;
    formation: string | null;
    coach: MatchEventParticipant | null;
    starters: MatchEventParticipant[];
    substitutes: MatchEventParticipant[];
  }[];
};

type MatchEventParticipant = {
  id: number | null;
  name: string;
};

export type Prediction = {
  id: number;
  matchId: number;
  predictedHomeScore: number;
  predictedAwayScore: number;
  resultStatus: "pending" | "correct" | "wrong";
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PredictionInput = Pick<
  Prediction,
  "predictedHomeScore" | "predictedAwayScore"
>;

export type SyncSummary = {
  syncRunId: number;
  matchesProcessed: number;
  predictionsUpdated: number;
};

export type LeaderboardEntry = {
  rank: number;
  userId: number;
  username: string;
  points: number;
  exactPredictions: number;
  goalDifferencePredictions: number;
  scoredPredictions: number;
};

export type DashboardData = {
  user: ApiUser;
  matches: Match[];
  predictions: Prediction[];
  leaderboard: LeaderboardEntry[];
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T = void>(
  path: `/api/${string}`,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getApiErrorMessage(response),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function loadDashboardData(): Promise<DashboardData> {
  const session = await apiRequest<{ user: ApiUser }>("/api/auth/me");
  const [matches, predictions, leaderboard] = await Promise.all([
    apiRequest<Match[]>("/api/matches"),
    apiRequest<Prediction[]>("/api/predictions"),
    apiRequest<LeaderboardEntry[]>("/api/leaderboard"),
  ]);

  return {
    user: session.user,
    matches,
    predictions,
    leaderboard,
  };
}

export function savePrediction(
  matchId: number,
  input: PredictionInput,
): Promise<Prediction> {
  return apiRequest<Prediction>(`/api/predictions/${matchId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function loadMatchDetails(matchId: number): Promise<MatchDetails> {
  return apiRequest<MatchDetails>(`/api/matches/${matchId}/details`);
}

export function runManualSync(): Promise<SyncSummary> {
  return apiRequest<SyncSummary>("/api/admin/sync", {
    method: "POST",
  });
}

export function loadAdminUsers(): Promise<AdminUser[]> {
  return apiRequest<AdminUser[]>("/api/admin/users");
}

export function createPlayer(input: {
  username: string;
  password: string;
}): Promise<AdminUser> {
  return apiRequest<AdminUser>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

async function getApiErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(body.message) && body.message.length > 0) {
      return body.message.join(" ");
    }

    if (typeof body.message === "string" && body.message.trim().length > 0) {
      return body.message;
    }

    if (typeof body.error === "string" && body.error.trim().length > 0) {
      return body.error;
    }
  } else {
    const text = await response.text();

    if (text.trim().length > 0) {
      return text;
    }
  }

  return `API request failed with ${response.status}`;
}
