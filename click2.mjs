const t = (await (await fetch("http://127.0.0.1:9222/json/list")).json()).find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const console_ = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.method === "Log.entryAdded") console_.push(m.params.entry.text); if (pending.has(m.id)) pending.get(m.id)(m); };
await new Promise((r) => (ws.onopen = r));
const send = (m, p) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable"); await send("Log.enable");
await send("Page.navigate", { url: "file://" + process.argv[2] });
await wait(1500);
const before = (await send("Page.captureScreenshot", {})).result.data;
for (const type of ["mousePressed", "mouseReleased"])
  await send("Input.dispatchMouseEvent", { type, x: 120, y: 60, button: "left", clickCount: 1 });
await wait(3000);
const after = (await send("Page.captureScreenshot", {})).result.data;
console.log("screenshot changed after click:", before !== after);
console.log("browser log:", console_.join(" || ") || "(empty)");
require("fs");
