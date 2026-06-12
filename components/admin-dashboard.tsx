"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  AdminUser,
  ApiError,
  ApiUser,
  apiRequest,
  createPlayer,
  loadAdminUsers,
} from "@/lib/api";

type AdminState =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
  | { status: "ready"; user: ApiUser; users: AdminUser[] };

type CreateState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; username: string }
  | { status: "error"; message: string };

export function AdminDashboard() {
  const router = useRouter();
  const [state, setState] = useState<AdminState>({ status: "loading" });
  const [createState, setCreateState] = useState<CreateState>({ status: "idle" });

  useEffect(() => {
    let isActive = true;

    async function initialize() {
      try {
        const session = await apiRequest<{ user: ApiUser }>("/api/auth/me");

        if (session.user.role !== "admin") {
          if (isActive) {
            setState({ status: "forbidden" });
          }
          return;
        }

        const users = await loadAdminUsers();

        if (isActive) {
          setState({ status: "ready", user: session.user, users });
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/");
          return;
        }

        if (isActive && error instanceof ApiError && error.status === 403) {
          setState({ status: "forbidden" });
          return;
        }

        if (isActive) {
          setState({
            status: "error",
            message: "Die Spieler-Verwaltung konnte nicht geladen werden.",
          });
        }
      }
    }

    void initialize();

    return () => {
      isActive = false;
    };
  }, [router]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    setCreateState({ status: "saving" });

    try {
      const createdUser = await createPlayer({ password, username });
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              users: [...current.users, createdUser].sort((left, right) =>
                left.username.localeCompare(right.username, "de"),
              ),
            }
          : current,
      );
      form.reset();
      setCreateState({ status: "success", username: createdUser.username });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setState({ status: "forbidden" });
        return;
      }

      setCreateState({
        status: "error",
        message: getCreateUserError(error),
      });
    }
  }

  if (state.status === "loading") {
    return <AdminStatus title="Verwaltung lädt" />;
  }

  if (state.status === "forbidden") {
    return (
      <AdminStatus
        title="Kein Admin-Zugang"
        message="Diese Seite ist nur für Admins verfügbar."
      />
    );
  }

  if (state.status === "error") {
    return <AdminStatus title="Kurze Auszeit" message={state.message} />;
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/tippspiel" aria-label="Zurück zum Tippspiel">
          <Image
            className="brand-logo brand-logo-nav"
            src="/branding/tippspiel-logo.png"
            alt="90 Minuten WM Tippspiel"
            width={1400}
            height={376}
            priority
          />
        </Link>
        <nav className="header-actions" aria-label="Hauptnavigation">
          <Link className="nav-link" href="/tippspiel">
            Spielplan
          </Link>
          <span className="user-chip">{state.user.username} · Admin</span>
        </nav>
      </header>

      <section className="admin-hero">
        <p className="eyebrow">Adminbereich</p>
        <h1>Spieler verwalten</h1>
        <p>
          Lege persönliche Zugänge an. Neue Spieler können sich direkt danach
          anmelden und ihre eigenen Tipps speichern.
        </p>
      </section>

      <div className="admin-grid">
        <section className="admin-card" aria-labelledby="create-player-heading">
          <div>
            <p className="eyebrow">Neuer Zugang</p>
            <h2 id="create-player-heading">Spieler anlegen</h2>
          </div>
          <form className="admin-form" onSubmit={handleCreate}>
            <label className="field">
              <span>Benutzername</span>
              <input
                autoComplete="off"
                minLength={2}
                maxLength={50}
                name="username"
                placeholder="z. B. Anna"
                required
              />
            </label>
            <label className="field">
              <span>Startpasswort</span>
              <input
                autoComplete="new-password"
                minLength={8}
                name="password"
                placeholder="Mindestens 8 Zeichen"
                required
                type="password"
              />
            </label>
            {createState.status === "error" ? (
              <p className="form-error" role="alert">
                {createState.message}
              </p>
            ) : null}
            {createState.status === "success" ? (
              <p className="form-success" role="status">
                {createState.username} kann sich jetzt anmelden.
              </p>
            ) : null}
            <button
              className="primary-button"
              disabled={createState.status === "saving"}
              type="submit"
            >
              {createState.status === "saving" ? "Wird angelegt …" : "Spieler anlegen"}
              <span aria-hidden="true">+</span>
            </button>
          </form>
        </section>

        <section className="admin-card" aria-labelledby="players-heading">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Aktive Zugänge</p>
              <h2 id="players-heading">Spieler</h2>
            </div>
            <span className="prediction-entry-badge">{state.users.length}</span>
          </div>
          <ul className="user-list">
            {state.users.map((user) => (
              <li key={user.id}>
                <div>
                  <strong>{user.username}</strong>
                  <span>{user.role === "admin" ? "Admin" : "Spieler"}</span>
                </div>
                <span className={`account-state${user.isBanned ? " account-state-banned" : ""}`}>
                  {user.isBanned ? "Gesperrt" : "Aktiv"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function AdminStatus({
  title,
  message = "Die Daten werden vorbereitet.",
}: {
  title: string;
  message?: string;
}) {
  return (
    <section className="dashboard-state">
      <span className="state-icon">!</span>
      <h1>{title}</h1>
      <p>{message}</p>
      <Link className="secondary-button link-button" href="/tippspiel">
        Zum Spielplan
      </Link>
    </section>
  );
}

function getCreateUserError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return "Benutzername und Passwort erfüllen die Vorgaben noch nicht.";
    }

    if (error.status === 409) {
      return "Dieser Benutzername ist bereits vergeben.";
    }
  }

  return "Der Spieler konnte nicht angelegt werden. Bitte versuche es erneut.";
}
