# Tippspiel Frontend

Public frontend repository for Kevin's private World Cup prediction game. The
project currently contains the standard Next.js home page and the infrastructure
needed to build and run it as a container. The real tippspiel UI will be added
later.

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

## Docker

Build and run the production image:

```bash
docker build -t tippspiel-frontend .
docker run --rm -p 3000:3000 tippspiel-frontend
```

The image uses Next.js standalone output and runs as a non-root user.

## Planned Deployment

The frontend is intended to run at
`https://tippspiel.blaue-online.com` in Docker behind an Nginx reverse proxy.
Nginx will route frontend traffic to this container and `/api/*` traffic to the
private NestJS BFF/API.

The architecture decision is documented in
[`docs/adr/0001-private-wm-tippspiel-architecture.md`](docs/adr/0001-private-wm-tippspiel-architecture.md).
