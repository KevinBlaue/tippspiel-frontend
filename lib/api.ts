export type ApiUser = {
  userId: string;
  username: string;
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
    throw new ApiError(response.status, `API request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
