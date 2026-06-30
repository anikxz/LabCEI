# LabCEI — Lab Compliance & Efficiency

A laboratory instrument **calibration compliance** tracker with **chemical inventory** and **ISO document** management. Built as an Expo / React Native app (deployed as an installable web PWA) backed by an Express + PostgreSQL API.

## Features

- **Instrument register** — track instruments, calibration dates, cadence, and status (active / out of service).
- **Calibration compliance** — automatic overdue / upcoming detection with a calendar view.
- **Trends** — visualise calibration history and compliance over time.
- **Chemical inventory** — stock levels, locations, suppliers, expiry tracking, and NFPA 704 hazard ratings, with a built-in catalog for quick add.
- **ISO documents** — controlled document register (type, category, retention, revision, attachments) with a starter set that auto-seeds on first load.
- **Notifications** — configurable alerts for overdue / upcoming calibrations and low-stock / expiring chemicals.
- **Roles & auth** — JWT authentication with `admin`, `technician`, and `viewer` roles.
- **PWA** — installable, offline-capable web build with QR code generation for instruments.

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | Expo, React Native, expo-router (file-based routing), React Native Web |
| Backend  | Node.js, Express |
| Database | PostgreSQL |
| Auth     | JWT (bcrypt password hashing) |

## Project Structure

```
app/            Expo Router screens (dashboard, instruments, calendar, trends,
                documents, chemicals, settings, login, …) and shared components
lib/            Frontend helpers (API client, auth context, theme, PDF generation)
api/            Express server
  routes/       REST endpoints (auth, instruments, logs, chemical-stock,
                iso-documents, notifications, storage, …)
  middleware/   Auth middleware
db/             schema.sql and migrations/
deploy/         nginx site configuration
scripts/        Build/PWA helper scripts
public/         PWA manifest, service worker, icons
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 1. Install dependencies

```bash
npm install
cd api && npm install && cd ..
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable              | Description |
|-----------------------|-------------|
| `DATABASE_URL`        | PostgreSQL connection string |
| `JWT_SECRET`          | Long random secret (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| `PORT`                | API server port (default `3001`) |
| `ALLOWED_ORIGINS`     | Comma-separated CORS origins |
| `EXPO_PUBLIC_API_URL` | API URL reachable from the browser/device |

### 3. Set up the database

```bash
psql "$DATABASE_URL" -f db/schema.sql
# apply any additional migrations
psql "$DATABASE_URL" -f db/migrations/001_chemicals_iso_documents.sql
```

### 4. Run the API

```bash
node api/index.js
```

### 5. Run the app

```bash
# Development
npm run web

# Production web build (outputs to dist/)
npm run build
```

## Deployment

The web app is exported as static files (`npm run build` → `dist/`) and served behind nginx (see `deploy/`). The API runs as a Node service (e.g. systemd) connected to PostgreSQL.

## License

Private / internal use.
