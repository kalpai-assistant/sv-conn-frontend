# admin-frontend

Standalone operator / analytics / support console for Eazyserv. Lives alongside the consumer
frontend in the same git repo but builds and deploys independently.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS 4 + shadcn primitives (new-york style, blue hue 262 to match consumer)
- TanStack Router (programmatic route config — swap to file-based when the route count grows)
- Vitest + jsdom for unit tests

## Dev

```bash
cd admin-frontend
npm install
npm run dev            # → http://localhost:5174
```

The dev port is **5174** so it does not collide with the consumer app on 5173.

## Scripts

```bash
npm run dev            # Vite dev server on 5174
npm run build          # tsc --noEmit + vite build → dist/
npm run preview        # serve dist/ on 5174
npm run lint           # eslint
npm test               # vitest run
npm run format         # prettier --write .
```

CI locally mirrors the GitHub workflow:

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

## Routes

| Path         | Access  | Notes                                               |
| ------------ | ------- | --------------------------------------------------- |
| `/login`     | public  | Placeholder — SVC-422 wires real auth               |
| `/operator`  | authed  | Fulfilment ops console                              |
| `/analytics` | authed  | Marketplace dashboards                              |
| `/support`   | authed  | Customer / provider support                         |
| `/`          | authed  | Redirects to `/operator`                            |

## Deploy

Container image via `Dockerfile` (node:22 build → nginx:alpine runtime, SPA fallback in
`nginx.conf`). Build from this directory:

```bash
docker build -t eazyserv-admin .
docker run --rm -p 8080:80 eazyserv-admin
```

CloudFront / S3 or App Runner picks this up — infra wiring is a separate ticket.
