import { copyFileSync, existsSync } from "fs";
import { resolve } from "path";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openFolderPlugin } from "./src/services/FilesConverterService.ts";
import { gitLogPlugin } from "./src/services/gitLog.ts";
import { seoPlugin } from "./src/services/seo.ts";
import { configuration, seo } from "./vscode_website.config.ts";

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

/**
 * Packages only ever imported dynamically: Shiki, which `highlighter.ts`
 * loads on its own, and eruda, which Run and Debug loads on demand. The
 * vendor group below must not capture them, or they would load with it.
 */
const LAZY_PACKAGES =
  /node_modules[\\/](shiki|@shikijs|oniguruma-to-es|oniguruma-parser|regex|regex-recursion|regex-utilities|hast-util-to-html|eruda)[\\/]/;

export default defineConfig({
  base: "/",
  build: {
    rolldownOptions: {
      output: {
        /*
         * The libraries change far less often than the site, so they go in
         * chunks of their own that a returning visitor still has cached after
         * a deploy: React, and everything else the first screen needs (the
         * markdown pipeline above all). The site's own code is what is left.
         */
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: "vendor", test: (id) => id.includes("node_modules") && !LAZY_PACKAGES.test(id), priority: 1 },
          ],
        },
      },
      onLog(level, log, handler) {
        // eruda's console evaluates what is typed into it, so its direct `eval`
        // is the point, and in a package. Any other `eval` still warns.
        if (log.code === "EVAL" && /node_modules[\\/]eruda[\\/]/.test(log.id ?? "")) return;
        handler(level, log);
      },
    },
  },
  server: {
    allowedHosts: true,
  },
  plugins: [
    react(),
    openFolderPlugin(configuration),
    seoPlugin(seo),
    gitLogPlugin(),
    spaFallbackPlugin(),
  ],
});
