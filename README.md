# Tippspiel Frontend

Public frontend repository for Kevin's private World Cup prediction game. The
application starts with a login at `/` and exposes the authenticated match and
prediction overview at `/tippspiel`.

This project was created together with OpenClaw and Codex as a public
vibe-coding showcase.

## Development

Requirements:

- Node.js 24
- npm

Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run lint
npm run build
```

There is no committed CI/CD pipeline for this repo on purpose. Local helper
scripts live in `/.scripts`, which is intentionally ignored by Git.

## Docker

Build and run the production image:

```bash
docker build -t tippspiel-frontend .
docker run --rm -p 3000:3000 tippspiel-frontend
```

The image uses Next.js standalone output and runs as a non-root user.

For local deploys on the Raspberry Pi we run the container on
`127.0.0.1:3001` and let Nginx terminate TLS and proxy requests.

## Planned Deployment

The frontend is intended to run at
`https://tippspiel.blaue-online.com` in Docker behind an Nginx reverse proxy.
Nginx will route frontend traffic to this container and `/api/*` traffic to the
private NestJS BFF/API.

A checked-in Nginx site example lives at
[`deploy/nginx/tippspiel.blaue-online.com.conf`](deploy/nginx/tippspiel.blaue-online.com.conf).

The architecture decision is documented in
[`docs/adr/0001-private-wm-tippspiel-architecture.md`](docs/adr/0001-private-wm-tippspiel-architecture.md).
The planned frontend increments are tracked in
[`docs/frontend-release-plan.md`](docs/frontend-release-plan.md).
