import Image from "next/image";

import { LoginForm } from "@/components/login-form";

export default function Home() {
  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-heading">
        <Image
          className="brand-logo brand-logo-login"
          src="/branding/tippspiel-logo.png"
          alt="90 Minuten WM Tippspiel"
          width={1400}
          height={376}
          priority
        />
        <p className="eyebrow">WM 2026 · Privates Tippspiel</p>
        <h1 id="login-heading">Dein Tipp. Dein Spielplan.</h1>
        <p className="intro-copy">
          Alle Spiele, deine Tipps und die Ergebnisse an einem ruhigen Ort.
          Melde dich an, um loszulegen.
        </p>
        <div className="tournament-lockup tournament-lockup-dark">
          <span>Mit Blick auf</span>
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
