import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { recordSessionStart } from "./utils/sessionStart";

// Before anything renders: this tab's first load is when its uptime began.
recordSessionStart();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
