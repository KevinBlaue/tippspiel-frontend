# Frontend Release Plan

This plan keeps the first frontend releases small and aligned with
[ADR 0001](adr/0001-private-wm-tippspiel-architecture.md). The browser only
talks to the BFF through `/api`; there is no direct external sports API access.

## PR 1: Login and read-only overview

Status: in progress

- Replace the stock Next.js page with the login at `/`.
- Add the authenticated `/tippspiel` route.
- Load the session, matches and existing predictions from the BFF.
- Cover loading, empty, unavailable and unauthorized states.
- Keep predictions read-only.

## PR 2: Prediction entry

- Add score inputs for matches that have not kicked off.
- Persist a prediction with `PUT /api/predictions/:matchId`.
- Show validation, save and kickoff-lock feedback.
- Refresh the local match row after a successful save.

## PR 3: Match overview polish

- Group matches by date or matchday.
- Improve finished-match feedback for correct and wrong predictions.
- Add a focused match detail view only if the overview becomes too dense.

## PR 4: Release readiness

- Add focused component or browser tests for the login and prediction flow.
- Run an accessibility and responsive-layout pass.
- Document the production smoke test and rollback steps.

## Deliberately out of scope

- Multiple users, registration, roles or profile management
- Social features, rankings, live updates or polling
- Browser access to the external football data provider
- Bonus questions or a points system beyond exact-result feedback
