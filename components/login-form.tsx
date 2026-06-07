"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiError, apiRequest } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });
      router.replace("/tippspiel");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError("Benutzername oder Passwort stimmen nicht.");
      } else {
        setError("Die Anmeldung ist gerade nicht erreichbar. Bitte versuche es erneut.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Willkommen zurück</p>
        <h2>Anmelden</h2>
        <p className="form-copy">Nutze deinen persönlichen Tippspiel-Zugang.</p>
      </div>

      <label className="field">
        <span>Benutzername</span>
        <input
          autoComplete="username"
          name="username"
          placeholder="Dein Benutzername"
          required
        />
      </label>

      <label className="field">
        <span>Passwort</span>
        <input
          autoComplete="current-password"
          name="password"
          placeholder="Dein Passwort"
          required
          type="password"
        />
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Anmeldung läuft …" : "Zum Tippspiel"}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
