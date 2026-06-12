"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  ApiError,
  ApiUser,
  Match,
  MatchDetails,
  LeaderboardEntry,
  Prediction,
  PredictionInput,
  SyncSummary,
  loadDashboardData,
  loadMatchDetails,
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
      leaderboard: LeaderboardEntry[];
    };

type SyncState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; summary: SyncSummary }
  | { status: "error"; message: string };

type MatchStatusFilter = "all" | "open" | "live" | "finished";

type MatchDetailsState =
  | { status: "loading" }
  | { status: "ready"; details: MatchDetails }
  | { status: "error" };

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

const matchStatusFilters: {
  label: string;
  value: MatchStatusFilter;
}[] = [
  { label: "Alle", value: "all" },
  { label: "Offen", value: "open" },
  { label: "Live", value: "live" },
  { label: "Beendet", value: "finished" },
];

export function TippspielDashboard() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [syncState, setSyncState] = useState<SyncState>({ status: "idle" });
  const [syncCooldownUntil, setSyncCooldownUntil] = useState(getInitialSyncCooldown);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const deferredStatusFilter = useDeferredValue(statusFilter);
  const deferredRoundFilter = useDeferredValue(roundFilter);

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
  const roundOptions = getRoundOptions(state.matches);
  const filteredMatches = state.matches.filter(
    (match) =>
      matchesStatusFilter(match, deferredStatusFilter) &&
      (deferredRoundFilter === "all" ||
        getRoundFilterValue(match) === deferredRoundFilter),
  );

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
        <nav className="header-actions" aria-label="Hauptnavigation">
          {state.user.role === "admin" ? (
            <Link className="nav-link" href="/admin">
              Admin
            </Link>
          ) : null}
          <span className="user-chip">
            {state.user.username}
            {state.user.role === "admin" ? " · Admin" : ""}
          </span>
          <button
            className="text-button"
            disabled={isLoggingOut}
            onClick={handleLogout}
          >
            {isLoggingOut ? "Abmelden …" : "Abmelden"}
          </button>
        </nav>
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
            {state.user.role === "admin" ? (
            <button
              className="secondary-button sync-button"
              disabled={isSyncDisabled}
              onClick={handleManualSync}
              type="button"
              aria-label={
                syncState.status === "running"
                  ? "Synchronisierung läuft"
                  : syncCooldownSeconds > 0
                    ? `Synchronisierung in ${syncCooldownSeconds} Sekunden wieder möglich`
                    : "Spielplan synchronisieren"
              }
            >
              <SyncIcon isRunning={syncState.status === "running"} />
              <span>
                {syncState.status === "running"
                  ? "Läuft"
                  : syncCooldownSeconds > 0
                    ? `${syncCooldownSeconds}s`
                    : "Sync"}
              </span>
            </button>
            ) : null}
            {liveMatchesCount > 0 ? (
              <span className="live-indicator">
                {liveMatchesCount} Live-Spiel
                {liveMatchesCount === 1 ? "" : "e"}
              </span>
            ) : null}
          </div>
          {syncState.status === "success" ? (
            <p className="sync-feedback sync-feedback-success" role="status">
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

      <Leaderboard entries={state.leaderboard} currentUserId={state.user.userId} />

      <section className="matches-section" aria-labelledby="matches-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Aktueller Stand</p>
            <h2 id="matches-heading">Begegnungen</h2>
          </div>
          <span className="prediction-entry-badge">
            Klick auf eine Kachel zum Tippen
          </span>
        </div>

        {state.matches.length > 0 ? (
          <div className="match-filters" aria-label="Spiele filtern">
            <div className="status-filter" aria-label="Nach Status filtern">
              {matchStatusFilters.map((filter) => {
                const count = state.matches.filter((match) =>
                  matchesStatusFilter(match, filter.value),
                ).length;

                return (
                  <button
                    aria-pressed={statusFilter === filter.value}
                    className="status-filter-button"
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    type="button"
                  >
                    <span>{filter.label}</span>
                    <span className="filter-count">{count}</span>
                  </button>
                );
              })}
            </div>

            {roundOptions.length > 1 ? (
              <label className="round-filter">
                <span>Runde</span>
                <select
                  onChange={(event) => setRoundFilter(event.target.value)}
                  value={roundFilter}
                >
                  <option value="all">Alle Runden</option>
                  {roundOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <p className="filter-result" aria-live="polite">
              {filteredMatches.length} von {state.matches.length} Spielen
            </p>
          </div>
        ) : null}

        {state.matches.length === 0 ? (
          <div className="empty-state">
            <span aria-hidden="true">○</span>
            <h3>Noch keine Spiele</h3>
            <p>Nach dem nächsten Backend-Sync erscheint hier der Spielplan.</p>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="empty-state empty-state-filtered">
            <span aria-hidden="true">○</span>
            <h3>Keine passenden Spiele</h3>
            <p>Für diese Kombination aus Status und Runde gibt es keine Begegnung.</p>
            <button
              className="secondary-button"
              onClick={() => {
                setStatusFilter("all");
                setRoundFilter("all");
              }}
              type="button"
            >
              Filter zurücksetzen
            </button>
          </div>
        ) : (
          <div className="match-list">
            {filteredMatches.map((match) => (
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

      <p className="match-context">{formatMatchContext(match)}</p>

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

function Leaderboard({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: number;
}) {
  return (
    <section className="leaderboard-section" aria-labelledby="leaderboard-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">3 exakt · 1 Tordifferenz · 0 sonst</p>
          <h2 id="leaderboard-heading">Leaderboard</h2>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="leaderboard-empty">Noch keine Spieler im Ranking.</p>
      ) : (
        <ol className="leaderboard-list">
          {entries.map((entry) => (
            <li
              className={entry.userId === currentUserId ? "leaderboard-current" : ""}
              key={entry.userId}
            >
              <span className="leaderboard-rank">{entry.rank}</span>
              <div className="leaderboard-player">
                <strong>{entry.username}</strong>
                <span>
                  {entry.exactPredictions} exakt · {entry.goalDifferencePredictions} Differenz
                </span>
              </div>
              <strong className="leaderboard-points">
                {entry.points} {entry.points === 1 ? "Punkt" : "Punkte"}
              </strong>
            </li>
          ))}
        </ol>
      )}
    </section>
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
  const [detailsState, setDetailsState] = useState<MatchDetailsState>({
    status: "loading",
  });
  const closeDialog = useEffectEvent(onClose);

  useEffect(() => {
    let isActive = true;

    async function fetchDetails() {
      try {
        const details = await loadMatchDetails(match.id);

        if (isActive) {
          setDetailsState({ status: "ready", details });
        }
      } catch {
        if (isActive) {
          setDetailsState({ status: "error" });
        }
      }
    }

    void fetchDetails();

    return () => {
      isActive = false;
    };
  }, [match.id]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const documentStyle = document.documentElement.style;
    const previousBodyStyles = {
      left: bodyStyle.left,
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      right: bodyStyle.right,
      top: bodyStyle.top,
      width: bodyStyle.width,
    };
    const previousOverscrollBehavior = documentStyle.overscrollBehavior;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDialog();
      }
    }

    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    documentStyle.overscrollBehavior = "none";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      Object.assign(bodyStyle, previousBodyStyles);
      documentStyle.overscrollBehavior = previousOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, []);

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

        <dl className="match-detail-grid">
          <div>
            <dt>Wettbewerb</dt>
            <dd>{match.competition}</dd>
          </div>
          <div>
            <dt>Runde</dt>
            <dd>{formatRoundLabel(match)}</dd>
          </div>
          <div>
            <dt>Anstoß</dt>
            <dd>
              <time dateTime={match.kickoffAt}>
                {formatDetailedKickoff(match.kickoffAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Tippstatus</dt>
            <dd>{isEditable ? "Bis Anpfiff änderbar" : "Gesperrt"}</dd>
          </div>
        </dl>

        <MatchDetailsPanel state={detailsState} />

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

function MatchDetailsPanel({ state }: { state: MatchDetailsState }) {
  if (state.status === "loading") {
    return (
      <p className="match-details-feedback" role="status">
        Zusätzliche Spieldetails werden geladen …
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="match-details-feedback match-details-feedback-error">
        Zusätzliche Spieldetails sind gerade nicht verfügbar.
      </p>
    );
  }

  const { details } = state;
  const hasOverview =
    details.group !== null ||
    details.venue !== null ||
    details.lastUpdated !== null ||
    details.referees.length > 0;
  const hasEvents =
    details.goals.length > 0 ||
    details.bookings.length > 0 ||
    details.lineups.length > 0;

  if (!hasOverview && !hasEvents) {
    return null;
  }

  return (
    <section className="match-details-panel" aria-label="Zusätzliche Spieldetails">
      {hasOverview ? (
        <dl className="match-details-overview">
          {details.group ? (
            <div>
              <dt>Gruppe</dt>
              <dd>{formatGroup(details.group)}</dd>
            </div>
          ) : null}
          {details.venue ? (
            <div>
              <dt>Stadion</dt>
              <dd>{details.venue}</dd>
            </div>
          ) : null}
          {details.referees.length > 0 ? (
            <div>
              <dt>Schiedsrichter</dt>
              <dd>{details.referees.map(formatReferee).join(", ")}</dd>
            </div>
          ) : null}
          {details.lastUpdated ? (
            <div>
              <dt>Letztes Datenupdate</dt>
              <dd>
                <time dateTime={details.lastUpdated}>
                  {formatDetailsUpdatedAt(details.lastUpdated)}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {details.goals.length > 0 ? (
        <div className="match-event-section">
          <h3>Tore</h3>
          <ul>
            {details.goals.map((goal, index) => (
              <li key={`${goal.minute ?? "unknown"}-${goal.scorer?.id ?? index}`}>
                {goal.minute !== null ? (
                  <span>{formatEventMinute(goal.minute, goal.injuryTime)}</span>
                ) : null}
                {goal.scorer?.name ?? goal.team?.name ? (
                  <strong>{goal.scorer?.name ?? goal.team?.name}</strong>
                ) : null}
                {goal.homeScore !== null && goal.awayScore !== null ? (
                  <span>
                    {goal.homeScore}:{goal.awayScore}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {details.bookings.length > 0 ? (
        <div className="match-event-section">
          <h3>Karten</h3>
          <ul>
            {details.bookings.map((booking, index) => (
              <li key={`${booking.minute ?? "unknown"}-${booking.player?.id ?? index}`}>
                {booking.minute !== null ? (
                  <span>{formatEventMinute(booking.minute, booking.injuryTime)}</span>
                ) : null}
                {booking.player?.name ?? booking.team?.name ? (
                  <strong>{booking.player?.name ?? booking.team?.name}</strong>
                ) : null}
                {booking.card ? <span>{formatCard(booking.card)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {details.lineups.length > 0 ? (
        <div className="match-event-section match-lineups">
          <h3>Aufstellungen</h3>
          {details.lineups.map((lineup, index) => (
            <div className="match-lineup" key={lineup.team?.id ?? index}>
              {lineup.team?.name || lineup.formation ? (
                <h4>
                  {lineup.team?.name}
                  {lineup.team?.name && lineup.formation ? " · " : ""}
                  {lineup.formation}
                </h4>
              ) : null}
              {lineup.coach ? <p>Trainer: {lineup.coach.name}</p> : null}
              {lineup.starters.length > 0 ? (
                <p>{lineup.starters.map((player) => player.name).join(", ")}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SyncIcon({ isRunning }: { isRunning: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`sync-icon${isRunning ? " sync-icon-running" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M20 7h-5V2M4 17h5v5M5.1 9A7.5 7.5 0 0 1 18.6 6M18.9 15A7.5 7.5 0 0 1 5.4 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
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
  leaderboard: LeaderboardEntry[];
}): Extract<DashboardState, { status: "ready" }> {
  return {
    status: "ready",
    user: data.user,
    matches: data.matches,
    leaderboard: data.leaderboard,
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
    if (error.status === 403) {
      return "Der Sync ist nur für Admins verfügbar.";
    }

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

function formatDetailedKickoff(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function matchesStatusFilter(
  match: Match,
  filter: MatchStatusFilter,
): boolean {
  if (filter === "open") {
    return match.status === "scheduled" || match.status === "postponed";
  }

  if (filter === "live") {
    return match.status === "in_progress";
  }

  if (filter === "finished") {
    return match.status === "finished";
  }

  return true;
}

function getRoundOptions(matches: Match[]) {
  const options = new Map<string, string>();

  matches.forEach((match) => {
    options.set(getRoundFilterValue(match), formatRoundLabel(match));
  });

  return Array.from(options, ([value, label]) => ({ value, label })).sort(
    (left, right) =>
      left.label.localeCompare(right.label, "de", {
        numeric: true,
        sensitivity: "base",
      }),
  );
}

function getRoundFilterValue(match: Match): string {
  return `${match.stage ?? ""}:${match.matchday ?? ""}`;
}

function formatMatchContext(match: Match): string {
  return `${match.competition} · ${formatRoundLabel(match)}`;
}

function formatRoundLabel(match: Match): string {
  const stage = match.stage?.trim();

  if (stage && match.matchday !== null) {
    return `${formatStage(stage)} · Spieltag ${match.matchday}`;
  }

  if (stage) {
    return formatStage(stage);
  }

  if (match.matchday !== null) {
    return `Spieltag ${match.matchday}`;
  }

  return "Runde noch offen";
}

function formatGroup(group: string): string {
  return group.replace(/^GROUP_/, "Gruppe ").replaceAll("_", " ");
}

function formatReferee(referee: MatchDetails["referees"][number]): string {
  return referee.nationality
    ? `${referee.name} (${referee.nationality})`
    : referee.name;
}

function formatDetailsUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatEventMinute(
  minute: number | null,
  injuryTime: number | null,
): string {
  if (minute === null) {
    return "";
  }

  return injuryTime !== null && injuryTime > 0
    ? `${minute}+${injuryTime}′`
    : `${minute}′`;
}

function formatCard(card: string): string {
  return card
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}

function formatStage(stage: string): string {
  return stage
    .replaceAll("_", " ")
    .toLocaleLowerCase("de-DE")
    .replace(/(^|\s)\p{L}/gu, (character) => character.toLocaleUpperCase("de-DE"));
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
