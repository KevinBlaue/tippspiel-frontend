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

export type PredictionInput = Pick<
  Prediction,
  "predictedHomeScore" | "predictedAwayScore"
>;

export type SyncSummary = {
  syncRunId: number;
  matchesProcessed: number;
  predictionsUpdated: number;
};

export type DashboardData = {
  user: ApiUser;
  matches: Match[];
  predictions: Prediction[];
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
  const [matches, predictions] = await Promise.all([
    apiRequest<Match[]>("/api/matches"),
    apiRequest<Prediction[]>("/api/predictions"),
  ]);

  return {
    user: session.user,
    matches,
    predictions,
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

export function runManualSync(): Promise<SyncSummary> {
  return apiRequest<SyncSummary>("/api/admin/sync", {
    method: "POST",
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
