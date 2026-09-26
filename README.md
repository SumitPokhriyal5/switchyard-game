# Switchyard

A browser puzzle game about routing trains. Flip the switches so every train reaches the station
that matches its color and symbol. Scores are verified on the server by replaying the player's
inputs through the same game engine the browser uses.

> Work in progress. The full README (gameplay GIF, live link, architecture diagram and how score
> verification works) comes in the deployment phase.

## Tech stack

- **Engine:** TypeScript, pure and deterministic (seeded RNG, fixed 60 ticks per second)
- **Web:** React, Vite, Tailwind CSS, React Router, TanStack Query, Zustand
- **API:** Node, Express, MongoDB with Mongoose, Zod
- **Tooling:** npm workspaces, ESLint, Prettier, Vitest, GitHub Actions

## Repository layout

```
switchyard/
├── packages/engine/   # game logic shared by the browser and the server
├── apps/web/          # React frontend
└── apps/api/          # Express API
```

## Getting started

Requires Node 22.12 or newer. With [nvm](https://github.com/nvm-sh/nvm), run `nvm use` to pick up
the version from `.nvmrc`.

```bash
npm install
npm run check
```

## Scripts

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run build`     | Builds every package                       |
| `npm run typecheck` | Type-checks every package                  |
| `npm run test`      | Runs every package's tests                 |
| `npm run lint`      | Lints the whole repo                       |
| `npm run format`    | Formats the whole repo with Prettier       |
| `npm run check`     | Runs everything CI runs, in the same order |
