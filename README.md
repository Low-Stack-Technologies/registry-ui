# Registry UI

A single-container Docker Registry V2 UI built with Bun, React, Vite, Tailwind CSS, shadcn-style components, tRPC, and SQLite.

## Features

- First-run setup wizard for the initial admin user and shared registry credentials.
- App-local users stored in SQLite with `admin` and `viewer` roles.
- Registry browsing for repositories, tags, manifests, layers, platforms, digests, and pull commands.
- Admin-only registry management for delete-by-digest and retagging when the registry supports those operations.
- Admin screens for users, registry settings, and audit logs.
- One runtime container. SQLite, encryption key, sessions, and settings are stored under `/data`.

## Development

```bash
bun install
bun run dev
```

The dev command builds the frontend once, then serves the static build and API from the Bun server. Open `http://localhost:3000`, or set `PORT` to use another app port:

```bash
PORT=3050 bun run dev
```

## Container

```bash
docker build -t registry-ui .
docker run --rm -p 3000:3000 -v registry-ui-data:/data registry-ui
```

Open `http://localhost:3000` and complete setup. HTTPS registry URLs are required unless you explicitly enable HTTP in the setup wizard or settings screen.

## Runtime settings

- `PORT`: HTTP port inside the container, defaults to `3000`.
- `DATA_DIR`: persistent data directory, defaults to `/data`.
- `DATABASE_PATH`: optional explicit SQLite database path.
- `APP_SECRET`: optional encryption secret for stored registry credentials. If omitted, `/data/app.key` is generated and reused.
- `APP_KEY_PATH`: optional generated key path when `APP_SECRET` is omitted.

## Registry requirements

The app targets the standard Docker Registry HTTP API V2. Some registries disable catalog listing, manifest deletion, or retag writes; the UI reports those registry errors directly.
