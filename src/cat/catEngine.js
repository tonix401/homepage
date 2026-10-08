// Copied from ~/.config/cat/engine.js by scripts/sync-cat.ts — do not edit by hand.
// Re-run `npm run sync:cat` to update it.

// The cat rig's animation engine (SPEC.md, "Animation"): rig.json in, one frame of part matrices,
// paths and opacities out. build.py inlines it into preview.html and copies it to Quickshell's
// components/CatEngine.js, so both renderers play the same cat; edit it here.
// Plain ES2017 without ?. and ??, so the QML JavaScript engine takes it as well as browsers.
//
//   var st = CatEngine.create(rig, "neutral");
//   CatEngine.setExpression(st, "happy");   CatEngine.act(st, "hop", 2);   CatEngine.press(st, true);
//   CatEngine.voice(st, [active, open, wide, round]);   // sing along (0..1 each; see voice.py)
//   CatEngine.track(st, pose);              // follow a tracked face (kitty-cam.html); null: face lost
//   var frame = CatEngine.step(st, dt);     // {worlds, paths, variantOpacity, partOpacity, shapeOpacity}
//
// frame.worlds[part] is an affine [a, b, c, d, e, f] (x' = a x + c y + e, y' = b x + d y + f) in rig
// coordinates; frame.paths[part][variant][i], when present, replaces shape i's static `d` (shape keys
// and skinning). Skinned parts get the identity matrix: their paths are already placed.
var CatEngine = (function () {
    "use strict";

    var FEET = [75, 138]; // whole-cat motions squash and stretch about here
    var ID = [1, 0, 0, 1, 0, 0];
    // Face tracking fakes a turning head by parallax: how far each part of the face slides with the
    // head's yaw and pitch (rig units at full turn = 8 · depth sideways, 5 · depth up/down).
    var DEPTH = { "eye-l": 1, "eye-r": 1, mouth: 1.15, sing: 1.15, cheeks: 1.15, sweat: 0.8, "whiskers-l": 0.6, "whiskers-r": 0.6, bow: 0.4, "ear-l": -0.3, "ear-r": -0.3 };
    var YAWN = { open: 1.5, wide: 0.8, round: 0.3 }; // the sing mouth's keys at the height of a yawn
    var REST_POSE = { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, blinkL: 0, blinkR: 0, gazeX: 0, gazeY: 0, brow: 0, smile: 0, open: 0, wide: 0, round: 0 };

    function or(v, d) {
        return v === undefined || v === null ? d : v;
    }
    function rand(a, b) {
        return a + Math.random() * (b - a);
    }
    function clamp(v, a, b) {
        return Math.max(a, Math.min(b, v));
    }
    function lerp(a, b, k) {
        return a + (b - a) * k;
    }
    function smooth(x) { // smoothstep on 0..1
        return x * x * (3 - 2 * x);
    }
    // Moves v towards goal, settling in about `settle` seconds.
    function ease(v, goal, dt, settle) {
        return goal + (v - goal) * Math.exp(-dt * 4.6 / settle);
    }
    function mul(m, n) {
        return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    }
    function apply(m, p) {
        return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
    }
    // translate(pivot + t) · rotate(rot°) · scale(sx, sy) · translate(-pivot)
    function local(pivot, tr) {
        var r = tr.rot * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
        var a = cos * tr.sx, b = sin * tr.sx, c = -sin * tr.sy, d = cos * tr.sy;
        return [a, b, c, d, pivot[0] + tr.tx - a * pivot[0] - c * pivot[1], pivot[1] + tr.ty - b * pivot[0] - d * pivot[1]];
    }
    function pathOf(subpaths) { // [[pts, closed], ...]
        var out = [];
        for (var s = 0; s < subpaths.length; s++) {
            var pts = subpaths[s][0], str = "M " + pts[0][0].toFixed(3) + " " + pts[0][1].toFixed(3);
            for (var i = 1; i < pts.length; i += 3)
                str += " C " + pts[i][0].toFixed(3) + " " + pts[i][1].toFixed(3) + " " + pts[i + 1][0].toFixed(3) + " " + pts[i + 1][1].toFixed(3) + " " + pts[i + 2][0].toFixed(3) + " " + pts[i + 2][1].toFixed(3);
            out.push(subpaths[s][1] ? str + " Z" : str);
        }
        return out.join(" ");
    }
    // A damped spring {x, v} pulled towards goal, plus an outside acceleration; small steps keep it stable.
    function spring(s, goal, dt, k, c, force) {
        var n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
        for (var i = 0; i < n; i++) {
            s.v += (-k * (s.x - goal) - c * s.v + force) * h;
            s.x += s.v * h;
        }
    }

    function create(rig, expression) {
        return {
            rig: rig,
            expression: rig.expressions[expression] ? expression : "neutral",
            idle: true, // the idle loop (blinks, twitches, tilts, breathing)
            extraKeys: {}, // "part.key" -> weight added on top (preview sliders)
            t: 0,
            first: true,
            cur: {},
            motion: "", motionCount: 0, motionStart: 0,
            nextBlink: 2, blinkStart: -10,
            nextTwitch: 6, twitchStart: -10, twitchSide: "l",
            nextTilt: rand(5, 12), tiltStart: -10, tiltDir: 1,
            nextYawn: 0, yawnStart: -10, yawnGate: 0, // sleepy yawns; yawnGate fades one out if the cat stops being sleepy
            head: { x: 0, v: 0 }, // the head's lag behind the body (rig units, down is +)
            tilt: { x: 0, v: 0 }, // the head's tilt (degrees)
            squash: { x: 0, v: 0 }, // whole-cat squish: -0.2 is squashed flat, + is stretched
            pressed: false,
            prevTy: 0, prevVy: 0,
            voice: [0, 0, 0, 0], // [active, open, wide, round], as last given to voice()
            singing: 0, // 0..1: the sing mouth fading in over the expression's mouth
            lips: { open: 0, wide: 0, round: 0 }, // the sing mouth's shape keys, eased
            pose: null, // the tracked face, as last given to track(); null while there is none
            lastPose: REST_POSE, // kept while the tracking fades out after the face is lost
            tracked: 0, // 0..1: how much the tracked face drives the cat
            restMouth: false, // tracked: show the expression's own mouth while the lips are closed
            trackBlink: true, trackHead: true, // false: the idle blinks / head tilts carry on while tracked
        };
    }

    function act(st, motion, count) {
        st.motion = motion;
        st.motionCount = Math.max(1, count || 1);
        st.motionStart = st.t;
    }

    function setExpression(st, name) {
        if (!st.rig.expressions[name])
            name = "neutral";
        if (name === st.expression)
            return;
        st.expression = name;
        var m = st.rig.expressions[name].motion;
        if (m === "hop" || m === "jolt")
            act(st, m, 1);
    }

    // The audio being sung along to, per frame of analysis: `active` (0/1) shows the sing mouth in
    // expressions that sing, `open`, `wide`, `round` (0..1) shape it.
    function voice(st, v) {
        st.voice = v;
    }

    // A tracked face (kitty-cam.html), already filtered and normalised, or null when it is lost:
    //   yaw, pitch (-1..1: turned right / looking down at +1), roll (degrees, clockwise),
    //   x, y (rig units the head leans by), blinkL, blinkR, smile, open, wide, round (0..1),
    //   gazeX, gazeY (-1..1), brow (-1 frowning .. 1 raised).
    // While tracked, the face replaces the idle blinks, twitches and tilts, and the sing mouth follows its lips.
    function track(st, pose) {
        st.pose = pose;
        if (pose)
            st.lastPose = pose;
    }

    // Held down: squish flat. Let go: boing back (the squash spring overshoots).
    function press(st, down) {
        st.pressed = down;
    }

    // The whole cat's squash and stretch for the running motion.
    function motionPose(st, t) {
        var o = { ty: 0, sx: 1, sy: 1 };
        if (!st.motion)
            return o;
        var len = st.motion === "hop" ? 0.55 : 0.32;
        var p = (t - st.motionStart) / len;
        if (p >= st.motionCount) {
            st.motion = "";
            return o;
        }
        var f = p % 1, h, s;
        if (st.motion === "hop") {
            if (f < 0.18) { // crouch
                s = Math.sin(Math.PI / 2 * f / 0.18);
                o.sy = 1 - 0.14 * s;
                o.sx = 1 + 0.1 * s;
            } else if (f < 0.75) { // up and down, stretched on the way up
                var q = (f - 0.18) / 0.57, k = Math.min(1, q / 0.12);
                h = Math.sin(Math.PI * q);
                o.ty = -13 * h;
                o.sy = lerp(0.86, 1 + 0.09 * (1 - h) * (1 - q), k);
                o.sx = lerp(1.1, 1 - 0.05 * (1 - h) * (1 - q), k);
            } else { // land
                s = Math.sin(Math.PI * (f - 0.75) / 0.25);
                o.sy = 1 - 0.15 * s;
                o.sx = 1 + 0.11 * s;
            }
        } else { // jolt: a startled stretch upwards
            h = Math.sin(Math.PI * f) * (1 - f);
            o.ty = -5 * h;
            o.sy = 1 + 0.12 * h;
            o.sx = 1 - 0.06 * h;
        }
        return o;
    }

    function step(st, dt) {
        var rig = st.rig, snap = st.first;
        st.first = false;
        if (snap)
            dt = 0;
        var t = (st.t += dt);
        var e = rig.expressions[st.expression] || rig.expressions.neutral;
        var idle = st.idle;
        st.tracked = snap ? (st.pose ? 1 : 0) : ease(st.tracked, st.pose ? 1 : 0, dt, 0.25);
        var T = st.tracked, P = st.lastPose;

        // ── idle loop ──
        var eyes = e.variants["eye-l"];
        if (t >= st.nextBlink) {
            st.blinkStart = t;
            st.nextBlink = t + (Math.random() < 0.15 ? 0.3 : rand(3, 7));
        }
        var bp = (t - st.blinkStart) / (st.expression === "sleepy" ? 0.5 : 0.16);
        var blinkable = eyes === "open" || eyes === "wide" || eyes === "sparkle";
        var blink = idle && blinkable && bp < 1 ? (bp < 0.4 ? 1 - 0.9 * bp / 0.4 : 0.1 + 0.9 * (bp - 0.4) / 0.6) : 1;
        blink = lerp(blink, 1, st.trackBlink ? T : 0); // a tracked face blinks for itself

        if (t >= st.nextTwitch) {
            st.twitchStart = t;
            st.twitchSide = Math.random() < 0.5 ? "l" : "r";
            st.nextTwitch = t + rand(8, 20);
        }
        var tp = (t - st.twitchStart) / 0.36;
        var twitch = idle && st.expression !== "asleep" && tp < 1 ? Math.abs(Math.sin(2 * Math.PI * tp)) * (1 - T) : 0;

        // A curious head tilt now and then, held for a moment; the spring makes it overshoot and settle.
        if (t >= st.nextTilt) {
            st.tiltStart = t;
            st.tiltDir = Math.random() < 0.5 ? -1 : 1;
            st.nextTilt = t + rand(9, 22);
        }
        var tilting = idle && st.expression !== "asleep" && st.expression !== "startled" && t - st.tiltStart < 1.8;
        var bob = e.motion === "bob" ? Math.sin(2 * Math.PI * t / 0.9) : 0;
        var tremble = e.motion === "tremble" ? 0.5 * Math.sin(2 * Math.PI * 13 * t) : 0;

        // Sleepy: a big yawn now and then (2.6 s): eyes squeezed shut, mouth wide open, ears back, a stretch.
        var sleepy = idle && st.expression === "sleepy";
        if (!sleepy) {
            if (st.nextYawn < t + 4) // the first yawn comes 4–10 s after the cat gets sleepy
                st.nextYawn = t + rand(4, 10);
        } else if (t >= st.nextYawn) {
            st.yawnStart = t;
            st.nextYawn = t + rand(20, 45);
        }
        st.yawnGate = snap ? (sleepy ? 1 : 0) : ease(st.yawnGate, sleepy ? 1 : 0, dt, 0.25);
        var yp = (t - st.yawnStart) / 2.6, ys = 0;
        if (yp < 0.3) // opening, slowly
            ys = smooth(yp / 0.3);
        else if (yp < 0.68) // held, stretching a little further
            ys = 1 + 0.06 * Math.sin(Math.PI * (yp - 0.3) / 0.38);
        else if (yp < 1) // closing
            ys = 1 - smooth((yp - 0.68) / 0.32);
        var yawn = ys * st.yawnGate * (1 - T);

        var breath = idle ? (1 - Math.cos(2 * Math.PI * t / (e.breath || 4))) / 2 : 0;

        // ── singing: the sing mouth takes over from the expression's mouth while there's a voice ──
        // A tracked face talks through the sing mouth: always, or (restMouth) only while the lips move,
        // with a little hysteresis so a mouth on the edge doesn't flicker between the two.
        var lipsAt = st.singing > 0.5 ? 0.04 : 0.08;
        var talking = !st.restMouth || P.open > lipsAt || P.round > 3 * lipsAt || P.wide > 4 * lipsAt;
        var singGoal = Math.max(e.sing && st.voice[0] > 0 ? 1 : 0, st.pose && talking ? 1 : 0);
        st.singing = snap ? singGoal : ease(st.singing, singGoal, dt, 0.12);
        var lipNames = ["open", "wide", "round"];
        for (var li = 0; li < 3; li++) {
            var lipGoal = lerp(st.voice[li + 1], P[lipNames[li]], T);
            st.lips[lipNames[li]] = snap ? lipGoal : ease(st.lips[lipNames[li]], lipGoal, dt, 0.05);
        }

        // ── whole-cat motion, and the springs it shakes ──
        var o = motionPose(st, t);
        if (dt > 0) {
            var vy = (o.ty - st.prevTy) / dt, ay = (vy - st.prevVy) / dt;
            st.prevTy = o.ty;
            st.prevVy = vy;
            // The head is heavy: when the body jumps up it lags down, and wobbles after landing.
            spring(st.head, 0, dt, 220, 11, clamp(-0.25 * ay, -3000, 3000));
            st.head.x = clamp(st.head.x, -6, 6);
            spring(st.tilt, (tilting ? 7 * st.tiltDir * (st.trackHead ? 1 - T : 1) : 0) + 4 * bob, dt, 140, 9, 0);
            spring(st.squash, st.pressed ? -0.2 : 0, dt, 320, 9, 0);
        }
        var sq = st.squash.x;
        var all = { tx: tremble, ty: o.ty, sx: o.sx * (1 - 0.7 * sq) * (1 - 0.025 * yawn), sy: o.sy * (1 + sq) * (1 + 0.05 * yawn), rot: 0 };
        var root = local(FEET, all);
        var singShown = Math.max(st.singing, Math.min(1, 3 * yawn)); // a yawn opens the sing mouth too

        // ── pass 1: ease every part towards the expression, layer the above on top, find matrices ──
        var worlds = {}, vo = {}, po = {}, so = {}, liveKeys = {};
        var order = rig.order;
        for (var n = 0; n < order.length; n++) {
            var name = order[n], part = rig.parts[name];
            var c = st.cur[name];
            if (!c)
                c = st.cur[name] = { tr: { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 }, keys: {}, variants: {}, shown: part.hidden ? 0 : 1 };
            var target = e.transforms[name] || {};
            for (var k in c.tr) {
                var goal = or(target[k], k === "sx" || k === "sy" ? 1 : 0);
                c.tr[k] = snap ? goal : ease(c.tr[k], goal, dt, 0.22);
            }
            for (var key in part.keys) {
                var kg = or(e.keys[name + "." + key], 0);
                c.keys[key] = snap ? kg : ease(or(c.keys[key], kg), kg, dt, 0.22);
            }
            var chosen = or(e.variants[name], Object.keys(part.variants)[0]);
            for (var v in part.variants) {
                var vg = v === chosen ? 1 : 0;
                c.variants[v] = snap ? vg : ease(or(c.variants[v], vg), vg, dt, 0.12);
                vo[name + "/" + v] = c.variants[v];
            }
            var shown = !part.hidden || e.show.indexOf(name) >= 0 ? 1 : 0;
            c.shown = snap ? shown : ease(c.shown, shown, dt, 0.22);
            po[name] = name === "sing" ? singShown : name === "mouth" ? c.shown * (1 - singShown) : name === "cheeks" ? Math.max(c.shown, P.smile * T) : c.shown;

            var tr = { tx: c.tr.tx, ty: c.tr.ty, sx: c.tr.sx, sy: c.tr.sy, rot: c.tr.rot };
            var keys = {};
            for (key in c.keys)
                keys[key] = c.keys[key] + or(st.extraKeys[name + "." + key], 0);
            if (name === "eye-l" || name === "eye-r") {
                tr.sy *= blink * (1 - 0.8 * yawn);
                if (T > 0) {
                    var left = name === "eye-l", lid = left ? P.blinkL : P.blinkR;
                    if (blinkable)
                        tr.sy *= 1 - 0.9 * lid * T;
                    tr.sx *= 1 - 0.25 * Math.max(0, left ? -P.yaw : P.yaw) * T; // the far eye narrows as the head turns
                    tr.tx += 1.5 * P.gazeX * T;
                    tr.ty += 1.5 * P.gazeY * T;
                }
            }
            if (T > 0 && DEPTH[name]) {
                tr.tx += 8 * DEPTH[name] * P.yaw * T;
                tr.ty += 5 * DEPTH[name] * P.pitch * T;
            }
            if (T > 0 && (name === "ear-l" || name === "ear-r")) { // the ears are the eyebrows
                if ("perk" in keys)
                    keys.perk += Math.max(0, P.brow) * T;
                if ("flat" in keys)
                    keys.flat += Math.max(0, -P.brow) * T;
            }
            if ((name === "ear-l" || name === "ear-r") && "flat" in keys)
                keys.flat += 0.5 * yawn;
            if (name === "ear-" + st.twitchSide && "twitch" in keys)
                keys.twitch += twitch;
            if (name === "whiskers-" + st.twitchSide)
                tr.rot += (st.twitchSide === "l" ? 3 : -3) * twitch;
            if (name === "body") {
                tr.sy *= 1 + 0.025 * breath;
                tr.sx *= 1 + 0.015 * breath;
            }
            if (name === "sing")
                for (key in st.lips)
                    keys[key] += lerp(st.lips[key], YAWN[key], Math.min(1, yawn));
            if (name === "head") { // lifted a little as the mouth opens
                tr.ty += st.head.x - 1.3 * breath - 1.2 * Math.abs(bob) - 0.8 * st.lips.open * st.singing - 2 * yawn;
                tr.rot += st.tilt.x + P.roll * T;
                tr.tx += P.x * T;
                tr.ty += P.y * T;
                tr.sx *= 1 - 0.05 * Math.abs(P.yaw) * T;
            }
            liveKeys[name] = keys;
            var m = local(part.pivot, tr);
            worlds[name] = part.parent ? mul(worlds[part.parent], m) : mul(root, m);
        }

        // ── pass 2: paths moved by shape keys or skinning ──
        var paths = {};
        for (n = 0; n < order.length; n++) {
            name = order[n];
            part = rig.parts[name];
            var keyNames = Object.keys(part.keys);
            if (part.skin) {
                var mb = worlds[name], mh = worlds[part.skin.bone];
                paths[name] = {};
                for (v in part.variants) {
                    if (vo[name + "/" + v] <= 0.01)
                        continue;
                    var ws = part.skin.weights[v];
                    paths[name][v] = part.variants[v].map(function (s, i) {
                        return pathOf(s.paths.map(function (sub, j) {
                            return [sub.pts.map(function (p, q) {
                                var a = apply(mb, p), b = apply(mh, p), w = ws[i][j][q];
                                return [lerp(a[0], b[0], w), lerp(a[1], b[1], w)];
                            }), sub.closed];
                        }));
                    });
                }
                worlds[name] = ID;
            } else if (keyNames.length > 0) {
                keys = liveKeys[name];
                paths[name] = {
                    default: part.variants["default"].map(function (s, i) {
                        return pathOf(s.paths.map(function (sub, j) {
                            return [sub.pts.map(function (p, q) {
                                var x = p[0], y = p[1];
                                for (var kk = 0; kk < keyNames.length; kk++) {
                                    var w = keys[keyNames[kk]], kp = part.keys[keyNames[kk]][i][j][q];
                                    x += w * (kp[0] - p[0]);
                                    y += w * (kp[1] - p[1]);
                                }
                                return [x, y];
                            }), sub.closed];
                        }));
                    })
                };
            }
            if (name === "zzz") // the z's take turns
                for (var z = 0; z < 3; z++)
                    so[name + "/" + z] = Math.max(0, Math.sin(Math.PI * ((t / 3.6 - z / 3 + 1) % 1) * 1.5));
        }
        return { worlds: worlds, paths: paths, variantOpacity: vo, partOpacity: po, shapeOpacity: so };
    }

    return { create: create, step: step, act: act, press: press, setExpression: setExpression, voice: voice, track: track };
})();

export { CatEngine };
