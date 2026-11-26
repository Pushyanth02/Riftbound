/* GitHub Pages basePath support.

   The game is also published as a static export under a sub-path
   (https://pushyanth02.github.io/Riftbound/). Public asset URLs stored in
   config data and toast payloads stay root-relative ("/assets/..."), so
   every render site maps them through assetPath() and the Phaser loader
   sets its baseURL from the same value. In dev and self-hosted builds the
   prefix is empty and the paths are unchanged. */

/** Build-time base path ("/Riftbound" on GitHub Pages, "" otherwise). */
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix a root-relative public asset URL with the deployment base path. */
export function assetPath(url: string): string {
  if (BASE_PATH && url.startsWith('/')) return BASE_PATH + url;
  return url;
}
