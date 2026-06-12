# ADR 0001: Architektur fuer ein privates WM-Tippspiel

- Status: Superseded for user management by the multi-user MVP from 2026-06-12
- Datum: 2026-06-05
- Owner: Kevin Blaue

## Kontext

Es soll eine kleine Website unter einer Subdomain von `blaue-online.com` entstehen, die nur fuer Kevin gedacht ist und ein einfaches WM-Tippspiel abbildet.

> Update 2026-06-12: Das System laeuft jetzt als privates Mehrbenutzer-Tippspiel
> mit Admin-Rolle, Spieleranlage und Leaderboard. Die folgenden
> Single-User-Aussagen dokumentieren die urspruengliche Entscheidung.

Wichtige Rahmenbedingungen:

- Das Frontend soll als schlanke Next.js-Anwendung umgesetzt werden.
- Die bestehende NestJS-Service-App soll als BFF und API weiterverwendet werden.
- Es gibt nur einen Nutzer.
- Die Seite braucht keinen Mehrbenutzerbetrieb, keine Social-Funktionen und keinen Live-Ticker.
- Ein taeglicher Cron-Sync um `06:00 Europe/Berlin` reicht aus.
- Das System soll lediglich anzeigen, ob ein Tipp richtig oder falsch ist.
- Die Landing Page soll direkt der Login sein.
- Deployment soll per Docker erfolgen; der Reverse Proxy laeuft ueber Nginx.

## Entscheidung

Wir bauen das Tippspiel als kleine Zwei-App-Architektur:

1. Ein separates Next.js-Frontend unter `tippspiel.blaue-online.com`
2. Die bestehende NestJS-Service-App als BFF/API hinter demselben Host via `/api`

Die Architektur ist absichtlich klein gehalten:

- kein WebSocket
- kein Polling
- kein Rollenmodell
- kein Self-Service-User-Management
- keine externe API-Nutzung direkt aus dem Browser

Die NestJS-App uebernimmt:

- Login
- Session-Verwaltung
- Abruf und Speicherung der Matchdaten
- taeglichen Sync gegen den externen Datenanbieter
- Speicherung und Bewertung der Tipps

Das Next.js-Frontend uebernimmt:

- Login-Oberflaeche
- geschuetzte Uebersicht der Spiele
- Erfassung der Tipps
- farbliche Rueckmeldung pro Tipp

## Begruendung

Diese Entscheidung reduziert technische Komplexitaet und Betriebsaufwand deutlich.

- Single User statt vollwertigem User-System: weniger Angriffsfläche, weniger Code, weniger Admin-Aufwand
- taeglicher Sync statt Live-System: stabiler, billiger, deutlich einfacher zu betreiben
- BFF in NestJS: API-Key und Integrationslogik bleiben serverseitig
- Next.js getrennt vom Backend: Frontend bleibt einfach deploybar und spaeter austauschbar
- Routing unter einem Host: Cookies und Auth bleiben unkompliziert

Fuer den Zweck "Tipps abgeben und spaeter gruen oder rot sehen" waere alles Groessere Overengineering.

## Zielarchitektur

### Komponenten

#### 1. Next.js Frontend

Host:

- `https://tippspiel.blaue-online.com`

Verantwortung:

- Login-Seite auf `/`
- geschuetzte Seite auf `/tippspiel`
- Darstellung von Spielplan, Ergebnissen und eigenen Tipps
- Absenden von Login und Tipp-Aenderungen an `/api/*`

Technik:

- Next.js
- serverseitig oder hybrid gerenderte Seiten sind moeglich
- Session basiert auf HttpOnly-Cookie

#### 2. NestJS Service-App als BFF/API

Host intern:

- Docker-Container hinter Nginx

Oeffentliche Erreichbarkeit:

- via `https://tippspiel.blaue-online.com/api/*`

Verantwortung:

- Authentifizierung
- Session-Pruefung
- CRUD fuer Tipps
- Match-Read-API fuer das Frontend
- Cron-Job fuer den taeglichen Sync
- optionale manuelle Admin-Sync-Route

#### 3. PostgreSQL

Verantwortung:

- persistente Speicherung von Nutzerdaten
- Spiele
- Teams
- Tipps
- Sync-Metadaten

#### 4. Nginx Reverse Proxy

Verantwortung:

- TLS-Terminierung
- Routing von `/` zum Next.js-Container
- Routing von `/api/` zum NestJS-Container

## Routing

Oeffentliche URL-Struktur:

- `/` -> Login
- `/tippspiel` -> private Match- und Tipp-Uebersicht
- `/api/auth/*` -> Auth-Endpunkte in NestJS
- `/api/matches/*` -> Matchdaten in NestJS
- `/api/predictions/*` -> Tippdaten in NestJS

Reverse-Proxy-Regeln:

- `location /` -> Next.js
- `location /api/` -> NestJS

## Authentifizierung

Es wird ein einfacher Single-User-Login umgesetzt.

### Variante

- genau ein vordefinierter Benutzer
- Username optional fest vorgegeben
- Passwort als Hash in Env oder Datenbank
- Login liefert Session per HttpOnly-Cookie

### Warum keine Alternativen

Nicht gewaehlt:

- HTTP Basic Auth im Nginx
- Passwort im Frontend
- GitHub OAuth oder externe Identity Provider

Gruende:

- Basic Auth ist fuer die Benutzerfuehrung unschoen und schwerer spaeter zu erweitern
- Frontend-only-Schutz ist unsicher
- OAuth ist fuer einen privaten Einzelzugang unnoetig komplex

## Datenquelle und Sync

### Externe Quelle

Die Sportdaten werden serverseitig ueber eine verlaessliche REST-Quelle geholt, zum Beispiel `football-data.org`.

Der Browser spricht nie direkt mit dem Anbieter.

### Sync-Strategie

Ein taeglicher Cron laeuft um:

- `06:00 Europe/Berlin`

Aufgaben:

1. Matchdaten aktualisieren
2. Anstosszeiten und Matchstatus uebernehmen
3. Endstaende fertiger Spiele speichern
4. offene Tipps gegen finalisierte Ergebnisse pruefen
5. `result_status` je Tipp neu setzen

Optionale spaetere Erweiterung:

- ein zweiter Abend-Cron fuer spaet finalisierte Spiele

## Datenmodell

Das Modell bleibt minimal.

### `users`

- `id`
- `username`
- `password_hash`
- `created_at`
- `updated_at`

Hinweis:

- fuer den Start ist genau ein Datensatz vorgesehen

### `teams`

- `id`
- `external_id`
- `name`
- `short_name`
- `code`
- `crest_url`
- `created_at`
- `updated_at`

### `matches`

- `id`
- `external_id`
- `competition`
- `stage`
- `matchday`
- `home_team_id`
- `away_team_id`
- `kickoff_at`
- `status`
- `home_score`
- `away_score`
- `synced_at`
- `created_at`
- `updated_at`

Empfohlene `status`-Werte:

- `scheduled`
- `in_progress`
- `finished`
- `postponed`
- `cancelled`

### `predictions`

- `id`
- `user_id`
- `match_id`
- `predicted_home_score`
- `predicted_away_score`
- `result_status`
- `locked_at`
- `created_at`
- `updated_at`

Empfohlene `result_status`-Werte:

- `pending`
- `correct`
- `wrong`

Regel:

- pro Benutzer genau ein Tipp pro Match

### `sync_runs`

- `id`
- `source`
- `started_at`
- `finished_at`
- `status`
- `message`

Nutzen:

- Betriebsnachvollziehbarkeit
- Debugging bei fehlgeschlagenem Import

## Bewertungslogik

Fuer Version 1 gilt absichtlich nur die einfache Regel:

- `correct`, wenn Heim- und Auswaertstore exakt mit dem finalen Endstand uebereinstimmen
- `wrong`, wenn das Spiel final ist und das Ergebnis nicht exakt stimmt
- `pending`, solange kein finaler Endstand vorliegt

Spaetere Erweiterungen sind moeglich:

- Tendenz richtig
- Punktelogik
- Bonusfragen

Diese Erweiterungen sind explizit nicht Teil von V1.

## Fachliche Regeln

- Tipps koennen nur bis zum Matchstart bearbeitet werden.
- Nach Matchstart wird ein Tipp logisch gesperrt.
- Gruen oder rot wird erst nach finalem Matchstatus gesetzt.
- Nicht gesyncte oder verschobene Spiele bleiben neutral.

## API-Schnittstellen

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Matches

- `GET /api/matches`
- `GET /api/matches/:id`

### Predictions

- `GET /api/predictions`
- `PUT /api/predictions/:matchId`

### Admin/Sync

- `POST /api/admin/sync`

Hinweis:

- diese Route sollte nur intern oder zumindest zusaetzlich geschuetzt sein

## Frontend-Struktur

### Seite `/`

Funktion:

- Login-Maske

Elemente:

- Benutzername oder feste Kennung
- Passwortfeld
- Login-Button

### Seite `/tippspiel`

Funktion:

- zentrale Uebersicht

Inhalte:

- Liste der Spiele nach Datum sortiert
- Teams und Anstosszeit
- finaler Spielstand, falls vorhanden
- eigene Tipp-Eingabe
- Statusfarbe pro Tipp

Empfohlene Statusdarstellung:

- grau: offen
- gruen: richtig
- rot: falsch

## Deployment

### Container

- `tippspiel-frontend` fuer Next.js
- `service-app` fuer NestJS
- `postgres` fuer Datenhaltung

### Netzwerk

Alle Container laufen in einem internen Docker-Netzwerk.

Nginx spricht lokal auf die Containerports.

### Domain

- `tippspiel.blaue-online.com`

### Proxy-Skizze

```nginx
server {
  server_name tippspiel.blaue-online.com;

  location /api/ {
    proxy_pass http://service-app:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://tippspiel-frontend:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Hinweis:

- die genaue `proxy_pass`-Form ist spaeter an die reale NestJS-Basisroute anzupassen

## Cron-Betrieb

Der taegliche Sync wird in der Service-App oder im umgebenden Deployment zeitgesteuert ausgefuehrt.

Empfehlung:

- Cron um `06:00 Europe/Berlin`
- Ausfuehrung eines dedizierten Sync-Commands oder eines geschuetzten HTTP-Endpunkts

Bevorzugt:

- interner App-Command oder NestJS Scheduler

Alternativ:

- externer Cron-Container, der einen internen Endpunkt aufruft

## Nicht-Ziele

Folgende Punkte sind bewusst nicht Teil dieser Architekturentscheidung:

- Mehrbenutzerbetrieb
- Oeffentliche Registrierung
- Live-Score-WebSockets
- Push-Benachrichtigungen
- Social Features
- komplexe Punktelogik
- Admin-Backoffice

## Konsequenzen

### Vorteile

- sehr ueberschaubarer Umfang
- einfach zu deployen
- wenig moving parts
- gute Grundlage fuer spaetere Erweiterungen
- sicherer als eine reine Frontend-Loesung

### Nachteile

- kein Live-Stand am Spieltag
- Aenderungen am Datenanbieter betreffen den Sync-Code
- fuer echten Wettbewerb oder mehrere Nutzer spaeter nicht ausreichend

## Umsetzungsreihenfolge

1. neues Frontend-Repo oder Projektordner fuer Next.js anlegen
2. Deployment fuer die bestehende NestJS-Service-App per Docker herstellen
3. Datenbankschema fuer `users`, `teams`, `matches`, `predictions`, `sync_runs` anlegen
4. Auth in NestJS umsetzen
5. Match- und Prediction-Endpunkte bauen
6. taeglichen Sync implementieren
7. Nginx-Proxy fuer `tippspiel.blaue-online.com` schalten

## Offene Punkte

- genauer Repo-Name der bestehenden NestJS-Service-App
- konkretes Deployment-Layout fuer diese Service-App
- finale Wahl der Sportdatenquelle
- ob ein zweiter abendlicher Sync direkt zum Start sinnvoll ist
