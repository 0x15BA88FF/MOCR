# MOCR

A real-time Slooh telescope observation viewer with a React web frontend and an
Express-style proxy server.

## Prerequisites

- [pnpm](https://pnpm.io/) (v11+)
- [Node.js](https://nodejs.org/) v24+

For Nix users: `nix develop` enters a shell with pnpm and Node preinstalled.

## Environment variables

The server reads credentials from `server/.env`. Copy the example and fill in
your Slooh account details:

```bash
cp server/.env.example server/.env
```

| Variable           | Description                              | Default |
| ------------------ | ---------------------------------------- | ------- |
| `SLOOH_EMAIL`      | Your Slooh account email                 | —       |
| `SLOOH_PASSWD`     | Your Slooh account password              | —       |
| `SLOOH_PROXY_PORT` | Port for the proxy server                | `8270`  |

## Running locally

From the repository root:

```bash
pnpm install
pnpm dev
```

This starts both the proxy server (`localhost:8270`) and the web dev server
(`localhost:5173`). The Vite config proxies `/api` and `/sse` requests to the
proxy automatically.

### Individual apps

```bash
pnpm dev:server   # start only the proxy server
pnpm dev:web      # start only the web dev server
```

## Building

```bash
pnpm build
```

## Project layout

```
.
├── server/          # Slooh proxy server (astronomy-engine)
├── web/             # React + Vite + Tailwind frontend
├── flake.nix        # Nix dev shell
├── pnpm-workspace.yaml
└── turbo.json
```
