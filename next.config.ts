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

const nextConfig: NextConfig = {
  output: "standalone",
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
