# Gomata Vision CRM

Production-oriented GRE and sales CRM with a separated React frontend, Express backend, and PostgreSQL persistence.

## Project structure

```text
Gomata-CRM/
├── frontend/          React, Vite, pages, components and styles
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── backend/           Express API, authentication and PostgreSQL migrations
│   ├── src/
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
├── package.json       Workspace commands for both applications
└── package-lock.json  Locked dependencies for all workspaces
```

The backend uses PostgreSQL exclusively. There is no SQLite, JSON-file, browser-local, or in-memory application database. Automated integration tests also use a dedicated real PostgreSQL database (`gomata_crm_test`).

## Local setup

Requirements: Node.js 20.18–22, npm 10+, and PostgreSQL.

```bash
cp backend/.env.example backend/.env
npm install
npm run dev
```

Configure `backend/.env` with the real database connection:

```env
PORT=4001
DATABASE_URL=postgresql://gomata_user:password@127.0.0.1:5433/gomata_crm
```

Open `http://127.0.0.1:5173`.

The root development command starts two independent processes:

- Frontend: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:4001`
- Health check through the frontend proxy: `http://127.0.0.1:5173/api/health`

The services can also be started separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Vite reads `frontend/.env` and proxies `/api` to `VITE_API_PROXY_TARGET`. PostgreSQL credentials remain only in `backend/.env` and are never exposed to the frontend.

## Database

The backend refuses to start when `DATABASE_URL` is missing or PostgreSQL is unavailable. Tables, constraints, indexes, settings, and the initial administrator are migrated when the backend starts.

Set `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` before the first launch. In production, the seed password is mandatory. Existing leads persist through server and computer restarts because all records and sessions are stored in PostgreSQL.

Integration tests require a separate PostgreSQL database owned by the Gomata database role:

```bash
createdb --owner=gomata_user gomata_crm_test
npm test
```

Set `TEST_DATABASE_URL` in `backend/.env` if the test database uses a different server or name. Tests reset only that dedicated test database and never modify `gomata_crm`.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The test suite covers authentication, session invalidation, role-scoped lead access, duplicate prevention, serial generation, imports, analytics, settings, pipeline transitions, reminders, rescheduling, public QR capture, activity history, and PostgreSQL constraints.

## Production

Configure `backend/.env` with a dedicated least-privilege PostgreSQL role, the real HTTPS `APP_ORIGIN`, a strong `SEED_ADMIN_PASSWORD`, and TLS settings required by the database provider.

```bash
npm ci
npm run check
npm start
```

`npm run build` produces `frontend/dist` and `backend/dist`. The production backend serves the compiled frontend and API from one origin, avoiding cross-origin cookie problems. Run it behind an HTTPS reverse proxy, restrict PostgreSQL network access, and schedule encrypted PostgreSQL backups with periodic restore tests.
