"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  ApiError,
  ApiUser,
  Match,
  Prediction,
  PredictionInput,
  apiRequest,
} from "@/lib/api";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      user: ApiUser;
      matches: Match[];
      predictions: Map<number, Prediction>;
    };

const matchStatusLabels: Record<Match["status"], string> = {
  cancelled: "Abgesagt",
  finished: "Beendet",
  in_progress: "Live",
  postponed: "Verschoben",
  scheduled: "Geplant",
};

const predictionStatusLabels: Record<Prediction["resultStatus"], string> = {
  correct: "Richtig",
  pending: "Offen",
  wrong: "Daneben",
};

export function TippspielDashboard() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      try {
        const session = await apiRequest<{ user: ApiUser }>("/api/auth/me");
        const [matches, predictions] = await Promise.all([
          apiRequest<Match[]>("/api/matches"),
          apiRequest<Prediction[]>("/api/predictions"),
        ]);

        if (isActive) {
          setState({
            status: "ready",
            user: session.user,
            matches,
            predictions: new Map(
              predictions.map((prediction) => [prediction.matchId, prediction]),
            ),
          });
        }
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          router.replace("/");
          return;
        }

        if (isActive) {
          setState({
            status: "error",
            message:
              "Spielplan und Tipps konnten nicht geladen werden. Bitte lade die Seite neu.",
          });
        }
      }
    }

    void loadDashboard();

    return () => {
      isActive = false;
    };
  }, [router]);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // The login page remains the safest destination if the BFF is unavailable.
    } finally {
      router.replace("/");
    }
  }

  async function handlePredictionSave(
    matchId: number,
    input: PredictionInput,
  ) {
    try {
      const prediction = await apiRequest<Prediction>(
        `/api/predictions/${matchId}`,
        {
          method: "PUT",
          body: JSON.stringify(input),
        },
      );

      setState((currentState) => {
        if (currentState.status !== "ready") {
          return currentState;
        }

        const predictions = new Map(currentState.predictions);
        predictions.set(matchId, prediction);

        return {
          ...currentState,
          predictions,
        };
      });

      return prediction;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        router.replace("/");
      }

      throw requestError;
    }
  }

  if (state.status === "loading") {
    return <DashboardLoading />;
  }

  if (state.status === "error") {
    return (
      <section className="dashboard-state" role="alert">
        <span className="state-icon">!</span>
        <h1>Kurze Auszeit</h1>
        <p>{state.message}</p>
        <button className="secondary-button" onClick={() => window.location.reload()}>
          Erneut versuchen
        </button>
      </section>
    );
  }

  const nextMatch = state.matches.find((match) => match.status === "scheduled");
  const predictedCount = state.predictions.size;

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <Image
          className="brand-logo brand-logo-nav"
          src="/branding/tippspiel-logo.png"
          alt="90 Minuten WM Tippspiel"
          width={1400}
          height={376}
          priority
        />
        <div className="header-actions">
          <span className="user-chip">{state.user.username}</span>
          <button
            className="text-button"
            disabled={isLoggingOut}
            onClick={handleLogout}
          >
            {isLoggingOut ? "Abmelden …" : "Abmelden"}
          </button>
        </div>
      </header>

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Dein WM-Tippspiel</p>
          <h1>Spielplan</h1>
          <p className="hero-subtitle">
            Tippe die Ergebnisse der kommenden Spiele und passe deine Tipps bis
            zum Anpfiff an.
          </p>
          <div className="tournament-lockup">
            <span>Deutschland · WM 2026</span>
            <Image
              src="/brands/dfb-logo.svg"
              alt="DFB"
              width={316}
              height={316}
            />
            <Image
              className="world-cup-logo"
              src="/brands/world-cup-26-logo.svg"
              alt="FIFA World Cup 2026"
              width={1450}
              height={644}
            />
          </div>
        </div>
        <dl className="summary-grid">
          <div>
            <dt>Spiele</dt>
            <dd>{state.matches.length}</dd>
          </div>
          <div>
            <dt>Getippt</dt>
            <dd>{predictedCount}</dd>
          </div>
          <div>
            <dt>Nächstes Spiel</dt>
            <dd>{nextMatch ? formatShortDate(nextMatch.kickoffAt) : "–"}</dd>
          </div>
        </dl>
      </section>

      <section className="matches-section" aria-labelledby="matches-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Aktueller Stand</p>
            <h2 id="matches-heading">Alle Begegnungen</h2>
          </div>
          <span className="prediction-entry-badge">Tipps eintragen</span>
        </div>

        {state.matches.length === 0 ? (
          <div className="empty-state">
            <span aria-hidden="true">○</span>
            <h3>Noch keine Spiele</h3>
            <p>Nach dem nächsten Backend-Sync erscheint hier der Spielplan.</p>
          </div>
        ) : (
          <div className="match-list">
            {state.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onSave={handlePredictionSave}
                prediction={state.predictions.get(match.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MatchCard({
  match,
  onSave,
  prediction,
}: {
  match: Match;
  onSave: (matchId: number, input: PredictionInput) => Promise<Prediction>;
  prediction?: Prediction;
}) {
  const hasResult = match.homeScore !== null && match.awayScore !== null;
  const isEditable = !match.locked;
  const [homeScore, setHomeScore] = useState(
    prediction?.predictedHomeScore.toString() ?? "",
  );
  const [awayScore, setAwayScore] = useState(
    prediction?.predictedAwayScore.toString() ?? "",
  );
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const predictedHomeScore = Number(homeScore);
    const predictedAwayScore = Number(awayScore);

    if (
      homeScore === "" ||
      awayScore === "" ||
      !Number.isInteger(predictedHomeScore) ||
      !Number.isInteger(predictedAwayScore) ||
      predictedHomeScore < 0 ||
      predictedAwayScore < 0
    ) {
      setSaveState({
        status: "error",
        message: "Bitte trage zwei nicht-negative ganze Ergebnisse ein.",
      });
      return;
    }

    setSaveState({ status: "saving" });

    try {
      const savedPrediction = await onSave(match.id, {
        predictedHomeScore,
        predictedAwayScore,
      });
      setHomeScore(savedPrediction.predictedHomeScore.toString());
      setAwayScore(savedPrediction.predictedAwayScore.toString());
      setSaveState({ status: "saved" });
    } catch (requestError) {
      setSaveState({
        status: "error",
        message: getPredictionErrorMessage(requestError),
      });
    }
  }

  return (
    <article className="match-card">
      <div className="match-meta">
        <time dateTime={match.kickoffAt}>{formatKickoff(match.kickoffAt)}</time>
        <span className={`match-status status-${match.status}`}>
          {matchStatusLabels[match.status]}
        </span>
      </div>

      <div className="teams">
        <Team name={match.homeTeam.shortName ?? match.homeTeam.name} />
        <div className="score">
          {hasResult ? (
            <>
              <strong>{match.homeScore}</strong>
              <span>:</span>
              <strong>{match.awayScore}</strong>
            </>
          ) : (
            <span>– : –</span>
          )}
        </div>
        <Team away name={match.awayTeam.shortName ?? match.awayTeam.name} />
      </div>

      {isEditable ? (
        <form className="prediction-form" onSubmit={handleSubmit}>
          <span className="prediction-label">Dein Tipp</span>
          <div className="prediction-controls">
            <label>
              <span className="sr-only">
                Tore {match.homeTeam.shortName ?? match.homeTeam.name}
              </span>
              <input
                aria-label={`Tore ${match.homeTeam.shortName ?? match.homeTeam.name}`}
                disabled={saveState.status === "saving"}
                inputMode="numeric"
                min="0"
                onChange={(event) => {
                  setHomeScore(event.target.value);
                  setSaveState({ status: "idle" });
                }}
                required
                type="number"
                value={homeScore}
              />
            </label>
            <span aria-hidden="true">:</span>
            <label>
              <span className="sr-only">
                Tore {match.awayTeam.shortName ?? match.awayTeam.name}
              </span>
              <input
                aria-label={`Tore ${match.awayTeam.shortName ?? match.awayTeam.name}`}
                disabled={saveState.status === "saving"}
                inputMode="numeric"
                min="0"
                onChange={(event) => {
                  setAwayScore(event.target.value);
                  setSaveState({ status: "idle" });
                }}
                required
                type="number"
                value={awayScore}
              />
            </label>
            <button
              className="save-prediction-button"
              disabled={saveState.status === "saving"}
              type="submit"
            >
              {saveState.status === "saving"
                ? "Speichert …"
                : prediction
                  ? "Aktualisieren"
                  : "Speichern"}
            </button>
          </div>
          <PredictionFeedback state={saveState} />
        </form>
      ) : (
        <div className="prediction-row">
          <span>Dein Tipp</span>
          {prediction ? (
            <div className="prediction-value">
              <strong>
                {prediction.predictedHomeScore} :{" "}
                {prediction.predictedAwayScore}
              </strong>
              <span
                className={`prediction-status prediction-${prediction.resultStatus}`}
              >
                {predictionStatusLabels[prediction.resultStatus]}
              </span>
            </div>
          ) : (
            <span className="no-prediction">Kein Tipp abgegeben</span>
          )}
        </div>
      )}
    </article>
  );
}

function PredictionFeedback({
  state,
}: {
  state:
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved" }
    | { status: "error"; message: string };
}) {
  if (state.status === "saved") {
    return (
      <span className="prediction-feedback prediction-feedback-success" role="status">
        Tipp gespeichert
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span className="prediction-feedback prediction-feedback-error" role="alert">
        {state.message}
      </span>
    );
  }

  return null;
}

function getPredictionErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return "Der Tipp ist ungültig. Bitte prüfe beide Ergebnisse.";
    }

    if (error.status === 409 || error.status === 423) {
      return "Das Spiel wurde inzwischen gesperrt. Der Tipp konnte nicht gespeichert werden.";
    }

    if (error.status === 401) {
      return "Deine Sitzung ist abgelaufen. Du wirst zur Anmeldung weitergeleitet.";
    }
  }

  return "Der Tipp konnte nicht gespeichert werden. Bitte versuche es erneut.";
}

function Team({ away = false, name }: { away?: boolean; name: string }) {
  return (
    <div className={`team ${away ? "team-away" : ""}`}>
      <span className="team-badge" aria-hidden="true">
        {name.slice(0, 2).toUpperCase()}
      </span>
      <strong>{name}</strong>
    </div>
  );
}

function DashboardLoading() {
  return (
    <section className="dashboard-state" aria-live="polite">
      <span className="loading-ball" aria-hidden="true" />
      <h1>Spielplan wird geladen</h1>
      <p>Session und aktuelle Begegnungen werden geprüft.</p>
    </section>
  );
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}
