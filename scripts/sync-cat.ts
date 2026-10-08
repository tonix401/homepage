/**
 * Copies the cat's animation engine and rig from Tom's dotfiles into
 * `src/cat/`, so the wallpaper cat moves exactly like the cats on his kitty
 * windows.
 *
 *   npm run sync:cat
 *
 * The rig lives in ~/.config/cat: `rig.svg` and `poses.json` are its sources,
 * and its `build.py` turns them into `rig.json`. `engine.js` is the one engine
 * every renderer of the cat runs (Quickshell, the browser preview, Kitty Cam).
 * Both are copied verbatim and committed, because CI has no ~/.config. Re-run
 * this after `build.py` whenever the rig or the engine changes there.
 *
 * The engine is a plain script that declares `var CatEngine`, written without
 * `?.` and `??` so Qt's JavaScript engine can run it too. The one change made
 * here is an `export` line at the end, which turns it into a module.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const from = resolve(homedir(), ".config/cat");
const to = resolve("src/cat");

const engine = readFileSync(resolve(from, "engine.js"), "utf8");
if (!/^var CatEngine = /m.test(engine)) {
  throw new Error(`${from}/engine.js no longer declares \`var CatEngine\`; update scripts/sync-cat.ts`);
}
writeFileSync(
  resolve(to, "catEngine.js"),
  "// Copied from ~/.config/cat/engine.js by scripts/sync-cat.ts — do not edit by hand.\n" +
    "// Re-run `npm run sync:cat` to update it.\n\n" +
    engine.trimEnd() +
    "\n\nexport { CatEngine };\n",
);

// Parsed and re-serialized only to fail here, rather than in the browser, if it is not JSON.
const rig = JSON.parse(readFileSync(resolve(from, "rig.json"), "utf8"));
writeFileSync(resolve(to, "rig.json"), JSON.stringify(rig) + "\n");

console.log(`Copied engine.js and rig.json from ${from} to ${to}`);
