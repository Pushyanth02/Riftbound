import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/* ------------------------------------------------------------------ */
/* Riftbound: optional game-module resolution                          */
/*                                                                     */
/* The Phaser game entry (src/game/createGame.ts) is built by another  */
/* engineer and may not exist yet while the UI layer is developed.     */
/* Turbopack fails the whole route when a literal dynamic import       */
/* cannot resolve, so while the game entry is absent we alias the      */
/* specifier to a UI-owned stub that reports "not available" at        */
/* runtime. A directory watcher touches this config file when the      */
/* game entry appears, so Next restarts, the alias drops, and the      */
/* real module is used.                                                */
/* ------------------------------------------------------------------ */

const GAME_STUB = "./src/components/game/gameBootStub.ts";
const GAME_ENTRY_BASENAMES = ["createGame.ts", "createGame.tsx"];

function gameEntryExists(): boolean {
  for (const base of GAME_ENTRY_BASENAMES) {
    try {
      if (fs.statSync(path.join(process.cwd(), "src/game", base)).isFile()) return true;
    } catch {
      /* not present */
    }
  }
  return false;
}

function watchForGameEntry(): void {
  if (process.env.NODE_ENV !== "development") return;
  const g = globalThis as typeof globalThis & { __riftboundGameWatcher?: boolean };
  if (g.__riftboundGameWatcher) return;
  g.__riftboundGameWatcher = true;
  try {
    const dir = path.join(process.cwd(), "src/game");
    const watcher = fs.watch(dir, (event, filename) => {
      if (typeof filename === "string" && GAME_ENTRY_BASENAMES.includes(path.basename(filename))) {
        watcher.close();
        delete g.__riftboundGameWatcher;
        try {
          const now = new Date();
          fs.utimesSync(path.join(process.cwd(), "next.config.ts"), now, now);
        } catch {
          /* restart signal best-effort */
        }
      }
    });
  } catch {
    /* watcher unavailable - manual dev-server restart will re-evaluate */
  }
}

const hasGame = gameEntryExists();

/* ------------------------------------------------------------------ */
/* Riftbound: GitHub Pages static export                               */
/*                                                                     */
/* `bun run build:pages` (and the deploy workflow) set NEXT_OUTPUT=    */
/* "export" plus NEXT_BASE_PATH/NEXT_PUBLIC_BASE_PATH="/Riftbound" so  */
/* the game exports as a fully static site served from the project      */
/* Pages sub-path. The default `bun run build` stays a standalone       */
/* server bundle for self-hosting, and dev is unaffected.              */
/* ------------------------------------------------------------------ */

const isExport = process.env.NEXT_OUTPUT === "export";
const basePath = process.env.NEXT_BASE_PATH ?? "";

if (isExport && basePath && !basePath.startsWith("/")) {
  throw new Error("NEXT_BASE_PATH must start with a slash (e.g. /Riftbound)");
}

const nextConfig: NextConfig = {
  ...(isExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
        ...(basePath ? { basePath, assetPrefix: basePath } : {}),
      }
    : { output: "standalone" }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  ...(hasGame
    ? {}
    : {
        turbopack: {
          resolveAlias: {
            "@/game/createGame": GAME_STUB,
          },
        },
      }),
};

if (!hasGame) watchForGameEntry();

export default nextConfig;
