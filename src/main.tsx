import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { recordSessionStart } from "./utils/sessionStart";
import { loadAddedFiles } from "./utils/fileStore";
import { guardFileDrops } from "./utils/drop";

// Before anything renders: this tab's first load is when its uptime began.
recordSessionStart();
guardFileDrops();

// The files this tab added come back before the first render, so a window
// showing one is not turned away by its app's `normalizeArg`. A stuck
// IndexedDB costs them, not the page: after a second it renders anyway.
const loaded = Promise.race([loadAddedFiles(), new Promise((resolve) => setTimeout(resolve, 1000))]);

void loaded.then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
