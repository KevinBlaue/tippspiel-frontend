import { LoginForm } from "@/components/login-form";

export default function Home() {
  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-heading">
        <div className="brand-mark" aria-hidden="true">
          <span>90</span>
          <small>MIN</small>
        </div>
        <p className="eyebrow">WM 2026 · Privates Tippspiel</p>
        <h1 id="login-heading">Dein Tipp. Dein Spielplan.</h1>
        <p className="intro-copy">
          Alle Spiele, deine Tipps und die Ergebnisse an einem ruhigen Ort.
          Melde dich an, um loszulegen.
        </p>
        <div className="pitch-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      <section className="login-panel" aria-label="Anmeldung">
        <LoginForm />
        <p className="privacy-note">
          Privater Zugang · Session per sicherem Cookie
        </p>
      </section>
    </main>
  );
}
