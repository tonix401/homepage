import { copyFileSync, existsSync } from "fs";
import { resolve } from "path";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openFolderPlugin } from "./src/services/FilesConverterService";
import { configuration } from "./vscode_website.config";

/**
 * Every route lives at `/?…`, so nothing here is load-bearing for links. It
 * is a safety net: GitHub Pages serves `404.html` for a path it does not
 * have, so a copy of `index.html` under that name turns a mistyped or stale
 * URL — `/resume`, an old deep link — into the app, which then rewrites the
 * address bar, instead of the Pages error page.
 */
function spaFallbackPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "spa-404-fallback",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const index = resolve(outDir, "index.html");
      if (existsSync(index)) copyFileSync(index, resolve(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  base: "/",
  server: {
    allowedHosts: true,
  },
  plugins: [
    react(),
    openFolderPlugin(configuration),
    spaFallbackPlugin(),
  ],
});
