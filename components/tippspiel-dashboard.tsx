"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  ApiError,
  ApiUser,
  Match,
  Prediction,
  PredictionInput,
  SyncSummary,
  loadDashboardData,
  runManualSync,
  savePrediction,
} from "@/lib/api";
import { getTeamFlagClassName } from "@/lib/team-flags";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      user: ApiUser;
      matches: Match[];
      predictions: Map<number, Prediction>;
    };

type SyncState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; summary: SyncSummary }
  | { status: "error"; message: string };

const SYNC_COOLDOWN_MS = 6_000;
const SYNC_COOLDOWN_STORAGE_KEY = "tippspiel.syncCooldownUntil";

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
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ status: "idle" });
  const [syncCooldownUntil, setSyncCooldownUntil] = useState(getInitialSyncCooldown);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    let isActive = true;

    async function initializeDashboard() {
      try {
        const dashboardData = await loadDashboardData();

        if (!isActive) {
          return;
        }

        setState(createReadyState(dashboardData));
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

    void initializeDashboard();

    return () => {
      isActive = false;
    };
  }, [router]);

  useEffect(() => {
    if (syncCooldownUntil === 0) {
      return;
    }

    const updateClock = () => {
      const now = Date.now();
      setCurrentTime(now);

      if (syncCooldownUntil <= now) {
        window.localStorage.removeItem(SYNC_COOLDOWN_STORAGE_KEY);
      }
    };

    const intervalId = window.setInterval(() => {
      updateClock();
    }, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [syncCooldownUntil]);

  async function refreshDashboardData() {
    const dashboardData = await loadDashboardData();

    if (
      activeMatchId !== null &&
      !dashboardData.matches.some((match) => match.id === activeMatchId)
    ) {
      setActiveMatchId(null);
    }

    setState(createReadyState(dashboardData));
  }

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      router.replace("/");
    }
  }

  async function handlePredictionSave(
    matchId: number,
    input: PredictionInput,
  ) {
    try {
      const prediction = await savePrediction(matchId, input);

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

  async function handleManualSync() {
    if (syncState.status === "running") {
      return;
    }

    const cooldownUntil = Date.now() + SYNC_COOLDOWN_MS;
    setSyncCooldownUntil(cooldownUntil);
    setCurrentTime(Date.now());
    window.localStorage.setItem(
      SYNC_COOLDOWN_STORAGE_KEY,
      cooldownUntil.toString(),
    );
    setSyncState({ status: "running" });

    try {
      const summary = await runManualSync();
      await refreshDashboardData();
      setSyncState({ status: "success", summary });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        router.replace("/");
        return;
      }

      setSyncState({
        status: "error",
        message: getSyncErrorMessage(requestError),
      });
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
  const liveMatchesCount = state.matches.filter(
    (match) => match.status === "in_progress",
  ).length;
  const activeMatch =
    activeMatchId === null
      ? undefined
      : state.matches.find((match) => match.id === activeMatchId);
  const activePrediction =
    activeMatchId === null ? undefined : state.predictions.get(activeMatchId);
  const syncCooldownSeconds = Math.max(
    0,
    Math.ceil((syncCooldownUntil - currentTime) / 1_000),
  );
  const isSyncDisabled =
    syncState.status === "running" || syncCooldownSeconds > 0;

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
            Öffne eine Begegnung, tippe im Overlay und ändere deinen Tipp nur
            bis zum Anpfiff. Live- und beendete Spiele bleiben sichtbar, aber
            gesperrt.
          </p>
          <div className="hero-tools">
            <button
              className="secondary-button sync-button"
              disabled={isSyncDisabled}
              onClick={handleManualSync}
              type="button"
            >
              {syncState.status === "running"
                ? "Sync läuft …"
                : syncCooldownSeconds > 0
                  ? `Sync in ${syncCooldownSeconds}s`
                  : "Jetzt synchronisieren"}
            </button>
            {liveMatchesCount > 0 ? (
              <span className="live-indicator">
                {liveMatchesCount} Live-Spiel
                {liveMatchesCount === 1 ? "" : "e"}
              </span>
            ) : (
              <span className="sync-hint">Manueller Sync lädt danach frische Daten.</span>
            )}
          </div>
          {syncState.status === "success" ? (
            <p className="sync-feedback sync-feedback-success" role="status">
              Sync #{syncState.summary.syncRunId} abgeschlossen.{" "}
              {syncState.summary.matchesProcessed} Spiele aktualisiert.
            </p>
          ) : null}
          {syncState.status === "error" ? (
            <p className="sync-feedback sync-feedback-error" role="alert">
              {syncState.message}
            </p>
          ) : null}
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
            <dt>Live</dt>
            <dd>{liveMatchesCount}</dd>
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
          <span className="prediction-entry-badge">
            Klick auf eine Kachel zum Tippen
          </span>
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
                onOpen={() => setActiveMatchId(match.id)}
                prediction={state.predictions.get(match.id)}
              />
            ))}
          </div>
        )}
      </section>

      {activeMatch ? (
        <PredictionDialog
          key={`${activeMatch.id}:${activePrediction?.updatedAt ?? "new"}`}
          match={activeMatch}
          onClose={() => setActiveMatchId(null)}
          onSave={handlePredictionSave}
          prediction={activePrediction}
        />
      ) : null}
    </div>
  );
}

function MatchCard({
  match,
  onOpen,
  prediction,
}: {
  match: Match;
  onOpen: () => void;
  prediction?: Prediction;
}) {
  const hasResult = match.homeScore !== null && match.awayScore !== null;
  const isEditable = isMatchEditable(match);
  const statusMessage = getMatchStatusMessage(match);

  return (
    <button
      aria-haspopup="dialog"
      className={`match-card match-card-button${isEditable ? "" : " match-card-locked"}`}
      onClick={onOpen}
      type="button"
    >
      <div className="match-meta">
        <time dateTime={match.kickoffAt}>{formatKickoff(match.kickoffAt)}</time>
        <span className={`match-status status-${match.status}`}>
          {matchStatusLabels[match.status]}
        </span>
      </div>

      <div className="teams">
        <TeamDisplay name={match.homeTeam.shortName ?? match.homeTeam.name} team={match.homeTeam} />
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
        <TeamDisplay
          away
          name={match.awayTeam.shortName ?? match.awayTeam.name}
          team={match.awayTeam}
        />
      </div>

      <div className="prediction-row">
        <span className="prediction-row-copy">
          {prediction ? "Dein Tipp" : isEditable ? "Noch kein Tipp" : "Kein Tipp gespeichert"}
        </span>
        <div className="prediction-value">
          {prediction ? (
            <>
              <strong>
                {prediction.predictedHomeScore}:{prediction.predictedAwayScore}
              </strong>
              <span className={`prediction-status prediction-${prediction.resultStatus}`}>
                {predictionStatusLabels[prediction.resultStatus]}
              </span>
            </>
          ) : (
            <span className="no-prediction">–</span>
          )}
        </div>
      </div>

      <div className="match-card-footer">
        <span className="match-card-hint">{statusMessage}</span>
        <span className="match-card-cta">
          {isEditable ? (prediction ? "Tipp ändern" : "Tipp abgeben") : "Details ansehen"}
        </span>
      </div>
    </button>
  );
}

function PredictionDialog({
  match,
  onClose,
  onSave,
  prediction,
}: {
  match: Match;
  onClose: () => void;
  onSave: (matchId: number, input: PredictionInput) => Promise<Prediction>;
  prediction?: Prediction;
}) {
  const isEditable = isMatchEditable(match);
  const hasResult = match.homeScore !== null && match.awayScore !== null;
  const [homeScore, setHomeScore] = useState(
    prediction?.predictedHomeScore.toString() ?? "",
  );
  const [awayScore, setAwayScore] = useState(
    prediction?.predictedAwayScore.toString() ?? "",
  );
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

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
      await onSave(match.id, {
        predictedHomeScore,
        predictedAwayScore,
      });
      onClose();
    } catch (requestError) {
      setSaveState({
        status: "error",
        message: getPredictionErrorMessage(requestError),
      });
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-labelledby="prediction-dialog-title"
        aria-modal="true"
        className="prediction-dialog"
        role="dialog"
      >
        <div className="prediction-dialog-header">
          <div>
            <p className="eyebrow">Spiel bearbeiten</p>
            <h2 id="prediction-dialog-title">
              {match.homeTeam.shortName ?? match.homeTeam.name} gegen{" "}
              {match.awayTeam.shortName ?? match.awayTeam.name}
            </h2>
          </div>
          <button
            aria-label="Overlay schließen"
            className="modal-close-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="prediction-dialog-meta">
          <time dateTime={match.kickoffAt}>{formatKickoff(match.kickoffAt)}</time>
          <span className={`match-status status-${match.status}`}>
            {matchStatusLabels[match.status]}
          </span>
        </div>

        <div className="prediction-dialog-teams">
          <TeamDisplay
            compact
            name={match.homeTeam.shortName ?? match.homeTeam.name}
            team={match.homeTeam}
          />
          <div className="score score-large">
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
          <TeamDisplay
            away
            compact
            name={match.awayTeam.shortName ?? match.awayTeam.name}
            team={match.awayTeam}
          />
        </div>

        <p className={`match-lock-message${isEditable ? "" : " match-lock-message-locked"}`}>
          {getMatchStatusMessage(match)}
        </p>

        <form className="prediction-dialog-form" onSubmit={handleSubmit}>
          <div className="prediction-dialog-fields">
            <label className="dialog-score-field">
              <span>{match.homeTeam.shortName ?? match.homeTeam.name}</span>
              <input
                aria-label={`Tore ${match.homeTeam.shortName ?? match.homeTeam.name}`}
                disabled={!isEditable || saveState.status === "saving"}
                inputMode="numeric"
                min="0"
                onChange={(event) => {
                  setHomeScore(event.target.value);
                  setSaveState({ status: "idle" });
                }}
                placeholder="0"
                required={isEditable}
                type="number"
                value={homeScore}
              />
            </label>

            <span className="dialog-score-separator">:</span>

            <label className="dialog-score-field">
              <span>{match.awayTeam.shortName ?? match.awayTeam.name}</span>
              <input
                aria-label={`Tore ${match.awayTeam.shortName ?? match.awayTeam.name}`}
                disabled={!isEditable || saveState.status === "saving"}
                inputMode="numeric"
                min="0"
                onChange={(event) => {
                  setAwayScore(event.target.value);
                  setSaveState({ status: "idle" });
                }}
                placeholder="0"
                required={isEditable}
                type="number"
                value={awayScore}
              />
            </label>
          </div>

          {prediction ? (
            <div className="dialog-prediction-summary">
              <span>
                Letzter Tipp:{" "}
                <strong>
                  {prediction.predictedHomeScore}:{prediction.predictedAwayScore}
                </strong>
              </span>
              <span className={`prediction-status prediction-${prediction.resultStatus}`}>
                {predictionStatusLabels[prediction.resultStatus]}
              </span>
            </div>
          ) : null}

          {saveState.status === "error" ? (
            <p className="prediction-feedback prediction-feedback-error" role="alert">
              {saveState.message}
            </p>
          ) : null}

          <div className="prediction-dialog-actions">
            <button
              className="text-button"
              onClick={onClose}
              type="button"
            >
              Schließen
            </button>
            <button
              className="primary-button dialog-save-button"
              disabled={!isEditable || saveState.status === "saving"}
              type="submit"
            >
              {saveState.status === "saving"
                ? "Speichern …"
                : prediction
                  ? "Tipp speichern"
                  : "Tipp anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function TeamDisplay({
  away = false,
  compact = false,
  name,
  team,
}: {
  away?: boolean;
  compact?: boolean;
  name: string;
  team: Match["homeTeam"];
}) {
  const flagClassName = getTeamFlagClassName(team);

  return (
    <div className={`team${away ? " team-away" : ""}${compact ? " team-compact" : ""}`}>
      <span className={`team-badge${flagClassName ? " team-badge-flag" : ""}`}>
        {flagClassName ? (
          <span aria-hidden="true" className={`team-flag ${flagClassName}`} />
        ) : (
          <span className="team-badge-fallback">
            {getTeamFallbackLabel(team)}
          </span>
        )}
      </span>
      <strong>{name}</strong>
    </div>
  );
}

function DashboardLoading() {
  return (
    <section className="dashboard-state" aria-live="polite">
      <span className="loading-ball">○</span>
      <h1>Spielplan lädt</h1>
      <p>Spiele, Tipps und Live-Stände werden gerade zusammengetragen.</p>
    </section>
  );
}

function createReadyState(data: {
  user: ApiUser;
  matches: Match[];
  predictions: Prediction[];
}): Extract<DashboardState, { status: "ready" }> {
  return {
    status: "ready",
    user: data.user,
    matches: data.matches,
    predictions: new Map(
      data.predictions.map((prediction) => [prediction.matchId, prediction]),
    ),
  };
}

function isMatchEditable(match: Match): boolean {
  return match.status === "scheduled" && !match.locked;
}

function getMatchStatusMessage(match: Match): string {
  if (match.status === "in_progress") {
    return "Live-Spiel: Tipps sind nicht mehr änderbar.";
  }

  if (match.status === "finished") {
    return "Spiel beendet: Tipps sind gesperrt.";
  }

  if (match.locked) {
    return "Anpfiff erreicht: Tipp gesperrt.";
  }

  if (match.status === "postponed") {
    return "Spiel verschoben: Tipp aktuell pausiert.";
  }

  if (match.status === "cancelled") {
    return "Spiel abgesagt: kein Tipp mehr möglich.";
  }

  return "Tipps lassen sich bis zum Anpfiff speichern.";
}

function getPredictionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return "Bitte trage zwei nicht-negative ganze Ergebnisse ein.";
    }

    if (error.status === 404) {
      return "Dieses Spiel wurde nicht gefunden. Bitte lade die Übersicht neu.";
    }

    if (error.status === 409) {
      return "Der Anpfiff ist erreicht. Dieser Tipp kann nicht mehr geändert werden.";
    }

    return error.message;
  }

  return "Der Tipp konnte nicht gespeichert werden. Bitte versuche es erneut.";
}

function getSyncErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "Der Sync ist gerade rate-limitiert. Bitte warte kurz vor dem nächsten Versuch.";
    }

    return `Sync fehlgeschlagen: ${error.message}`;
  }

  return "Der Sync konnte nicht gestartet werden. Bitte versuche es erneut.";
}

function getTeamFallbackLabel(team: Match["homeTeam"]): string {
  if (team.code && team.code.trim().length > 0) {
    return team.code.slice(0, 3);
  }

  return "TBD";
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getInitialSyncCooldown() {
  if (typeof window === "undefined") {
    return 0;
  }

  const savedCooldown = window.localStorage.getItem(SYNC_COOLDOWN_STORAGE_KEY);

  if (!savedCooldown) {
    return 0;
  }

  const parsedCooldown = Number(savedCooldown);

  if (!Number.isFinite(parsedCooldown) || parsedCooldown <= Date.now()) {
    window.localStorage.removeItem(SYNC_COOLDOWN_STORAGE_KEY);
    return 0;
  }

  return parsedCooldown;
}
