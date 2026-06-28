/* ============================================================================
   Moth cursor — a living Death's-head moth that replaces the pointer.

   GEOMETRY is reconstructed from the deconstructed artwork pieces, fitted to
   moth/Image.png (the "ideal" pose) at ~94% pixel similarity. The 7 pieces sit
   in their canonical 675x565 frame; each wing/antenna pivots about the point
   where it meets the body.

   MOTION is grounded in flight physics & insect biology, modelled on
   moth/Moth.mp4. The skull rides a damped spring anchored to the real pointer
   (momentum, drag, a soft settle). The wingbeat is horizontal FORESHORTENING
   (scaleX) about each hinge plus a small rotation, and its effort tracks THRUST
   demand — how hard the moth is working to catch the cursor — not raw speed.

   BEHAVIOUR REPERTOIRE (each gesture has a cursor trigger and a real biomechanic):
     • flight     — moving: effort-driven wingbeat, banks into turns.
     • fold/perch — idle a beat: wings compress edge-on and drop, tucking into a
                    sliver; antennae lower; it lands and breathes.
     • clap-flap  — flick / mousedown / takeoff: wings snap upright over the back
                    and clap rapidly (the clap-and-fling lift mechanism), then ease.
     • brake      — hard deceleration: wings flare wide & forward to air-brake.
     • twitch     — perched: occasional asymmetric antenna flick (sensing the air).
   Attenborough x Nat Geo x a little computer magic.
   ============================================================================ */
(function () {
  "use strict";

  var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduced) return;

  // ---- Canonical layout (the 675x565 artwork frame) ----------------------
  // key, file, left, top, width, height, transform-origin (body hinge), z.
  var BASE = "/moth/Deconstructed/";
  var PARTS = [
    ["body", "body.png",     210, 149, 234, 361, "50% 25%", 1],
    ["wll",  "wing2.png",     67, 266, 222, 127, "99% 24%", 2], // lower-left
    ["wul",  "wing1.png",     29,  58, 252, 232, "99% 91%", 3], // upper-left
    ["wlr",  "wing4.png",    369, 283, 219, 122, "1% 12%",  4], // lower-right
    ["wur",  "wing3.png",    384,  81, 259, 219, "2% 87%",  5], // upper-right
    ["antl", "antenna2.png", 216, 150, 108,  80, "96% 95%", 6], // left antenna
    ["antr", "antenna1.png", 341, 157, 113,  73, "4% 95%",  7]  // right antenna
  ];
  var SKULL_X = 327, SKULL_Y = 250;   // pointer hotspot, canvas space
  var SCALE = 0.17;                   // ~115px wide cursor

  // ---- Flight model ------------------------------------------------------
  var WN = 26, ZETA = 0.82;           // spring natural freq / damping ratio
  var K = WN * WN, C = 2 * ZETA * WN;
  var ERR_REF = 190, SPEED_REF = 1500;
  var EXERT_RISE = 0.045, EXERT_FALL = 0.5, EXERT_FLOOR = 0.06;
  var IDLE_HZ = 1.05, FAST_HZ = 9.5;
  var WING_COMPRESS = [0.07, 0.44];   // scaleX dip, rest -> full thrust
  var WING_ROT = [1.5, 13.0];         // deg about hinge
  var ANT_SWAY = [2.2, 4.5], BODY_BOB = [1.2, 4.5];
  var LEAN_K = 0.024, LEAN_MAX = 14;
  var BANK_K = 0.9, BANK_MAX = 16;
  var ANT_LAG_K = 0.018, ANT_LAG_MAX = 16;

  // ---- Behaviour repertoire ----------------------------------------------
  var REST_DELAY = 0.85;              // s of stillness before it perches
  var REST_IN_TAU = 0.5, REST_OUT_TAU = 0.07;
  var FOLD_RAISE = -8, FOLD_COMP = 0.60, FOLD_ANT = 15, FOLD_BODY = 7;
  var CLAP_HZ = 13, BURST_DUR = 0.5;     // upright clap-flap
  var CLAP_RAISE = 8, CLAP_SWING = 46, CLAP_COMP = [0.30, 0.60];
  var FLICK_SPEED = 950, BURST_COOLDOWN = 0.28;
  var TAKEOFF_REST = 0.3;
  var BRAKE_TAU = 0.12, BRAKE_K = 0.0016, BRAKE_MAX = 0.22; // wing air-brake flare
  var TWITCH_CHANCE = 0.006, TWITCH_DECAY = 0.18, TWITCH_AMP = 10;

  // ---- DOM ---------------------------------------------------------------
  var root = document.createElement("div");
  root.id = "moth-cursor";
  root.setAttribute("aria-hidden", "true");
  var els = {};
  var pending = PARTS.length;
  PARTS.forEach(function (p) {
    var img = document.createElement("img");
    img.src = BASE + p[1];
    img.draggable = false;
    img.style.cssText =
      "position:absolute;left:" + p[2] + "px;top:" + p[3] + "px;width:" +
      p[4] + "px;height:" + p[5] + "px;transform-origin:" + p[6] +
      ";z-index:" + p[7] + ";will-change:transform;backface-visibility:hidden;";
    img.addEventListener("load", ready);
    img.addEventListener("error", ready);
    els[p[0]] = img;
    root.appendChild(img);
  });
  function ready() { if (--pending <= 0) root.classList.add("is-ready"); }
  function mount() {
    document.body.appendChild(root);
    document.documentElement.classList.add("moth-cursor-active");
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  // ---- State -------------------------------------------------------------
  var px = window.innerWidth / 2, py = window.innerHeight / 2;
  var sx = px, sy = py, vx = 0, vy = 0;
  var exertion = EXERT_FLOOR, roll = 0, pitch = 1;
  var phase = 0, swayPhase = 0, clapPhase = 0;
  var idleTime = 0, rest = 0, burst = 0, burstCd = 0;
  var brake = 0, prevSpeed = 0, prevSpeed2 = 0, twitch = 0, twitchDir = 1;
  var seen = false, last = 0;

  function fireBurst(strength) {
    if (burstCd > 0) return;
    burst = Math.max(burst, strength);
    burstCd = BURST_COOLDOWN;
  }

  window.addEventListener("pointermove", function (e) {
    px = e.clientX; py = e.clientY;
    if (!seen) { seen = true; sx = px; sy = py; }
    if (rest > TAKEOFF_REST) fireBurst(1);   // wake & take off with a clap
    idleTime = 0;
  }, { passive: true });
  window.addEventListener("pointerdown", function () { fireBurst(0.85); }, { passive: true });
  window.addEventListener("pointerleave", function () { root.classList.add("is-out"); });
  window.addEventListener("pointerenter", function () { root.classList.remove("is-out"); });

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function alpha(dt, tau) { return 1 - Math.exp(-dt / tau); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) { last = now; return; }
    var dt = Math.min(0.04, (now - last) / 1000);
    last = now;

    // --- Spring-damper flight ----------------------------------------------
    var ex = px - sx, ey = py - sy;
    var ax = ex * K - vx * C, ay = ey * K - vy * C;
    vx += ax * dt; vy += ay * dt; sx += vx * dt; sy += vy * dt;
    var speed = Math.hypot(vx, vy), err = Math.hypot(ex, ey);

    // --- Timers: idle -> perch, burst decay --------------------------------
    idleTime += dt;
    if (burstCd > 0) burstCd -= dt;
    var restTarget = idleTime > REST_DELAY && speed < 40 ? 1 : 0;
    rest += (restTarget - rest) *
            alpha(dt, restTarget > rest ? REST_IN_TAU : REST_OUT_TAU);
    if (burst > 0) burst = Math.max(0, burst - dt / BURST_DUR);
    // Flick: a fresh surge past the threshold claps the wings.
    if (speed > FLICK_SPEED && prevSpeed <= FLICK_SPEED) fireBurst(1);
    prevSpeed = speed;

    // --- Effort: thrust demand drives the wingbeat -------------------------
    var drive = clamp(err / ERR_REF * 0.85 + speed / SPEED_REF * 0.5, 0, 1);
    exertion += (Math.max(EXERT_FLOOR, drive) - exertion) *
                alpha(dt, drive > exertion ? EXERT_RISE : EXERT_FALL);
    var I = exertion * (1 - rest);   // a perched moth isn't exerting

    // --- Air-brake: wings flare when decelerating hard ---------------------
    var decel = (prevSpeed2 - speed) / dt;       // px/s^2 of slowing
    var brakeTarget = clamp(decel * BRAKE_K, 0, BRAKE_MAX) * (1 - rest);
    brake += (brakeTarget - brake) * alpha(dt, BRAKE_TAU);
    prevSpeed2 = speed;

    // --- Phases ------------------------------------------------------------
    var hz = IDLE_HZ + (FAST_HZ - IDLE_HZ) * I;
    phase += 2 * Math.PI * hz * dt;
    swayPhase += 2 * Math.PI * (0.45 + 0.5 * I) * dt;
    if (burst > 0) clapPhase += 2 * Math.PI * CLAP_HZ * dt; else clapPhase = 0;
    var wob = Math.sin(swayPhase * 0.37) * 0.12 + Math.sin(swayPhase * 0.91) * 0.06;

    // --- Wing pose: blend flight -> fold(rest) -> clap(burst), + brake -----
    var o = (0.5 - 0.5 * Math.cos(phase)) * (0.93 + wob);
    var o2 = (0.5 - 0.5 * Math.cos(phase - 0.18)) * (0.93 + wob); // right lags
    var compAmt = WING_COMPRESS[0] + (WING_COMPRESS[1] - WING_COMPRESS[0]) * I;
    var rotAmt = WING_ROT[0] + (WING_ROT[1] - WING_ROT[0]) * I;
    var oc = 0.5 - 0.5 * Math.cos(clapPhase);

    // flight targets (raise deg, compression amount) per side
    var raiseLf = rotAmt * o, compLf = compAmt * o - brake;  // brake widens (negative comp)
    var raiseRf = rotAmt * o2, compRf = compAmt * o2 - brake;
    // fold + clap targets (shared L/R; clap is symmetric)
    var raiseFold = FOLD_RAISE, compFold = FOLD_COMP;
    var raiseClap = CLAP_RAISE + CLAP_SWING * oc;
    var compClap = CLAP_COMP[0] + (CLAP_COMP[1] - CLAP_COMP[0]) * oc;

    var raiseL = lerp(lerp(raiseLf, raiseFold, rest), raiseClap, burst);
    var compL = lerp(lerp(compLf, compFold, rest), compClap, burst);
    var raiseR = lerp(lerp(raiseRf, raiseFold, rest), raiseClap, burst);
    var compR = lerp(lerp(compRf, compFold, rest), compClap, burst);

    els.wul.style.transform = "scaleX(" + (1 - compL) + ") rotate(" + raiseL + "deg)";
    els.wll.style.transform = "scaleX(" + (1 - compL) + ") rotate(" + raiseL * 0.85 + "deg)";
    els.wur.style.transform = "scaleX(" + (1 - compR) + ") rotate(" + (-raiseR) + "deg)";
    els.wlr.style.transform = "scaleX(" + (1 - compR) + ") rotate(" + (-raiseR * 0.85) + "deg)";

    // --- Antennae: sway + inertia, blend to lowered (fold) + clap + twitch --
    var swayAmp = ANT_SWAY[0] + (ANT_SWAY[1] - ANT_SWAY[0]) * I;
    var sway = Math.sin(swayPhase * 0.5) * swayAmp;
    var antLag = clamp(-vx * ANT_LAG_K, -ANT_LAG_MAX, ANT_LAG_MAX);
    if (rest > 0.5 && Math.random() < TWITCH_CHANCE) {
      twitch = 1; twitchDir = Math.random() < 0.5 ? -1 : 1;
    }
    twitch = Math.max(0, twitch - dt / TWITCH_DECAY);
    var antL = lerp(lerp(sway + antLag, FOLD_ANT, rest), -5, burst) + twitch * TWITCH_AMP * twitchDir;
    var antR = lerp(lerp(-sway * 0.8 + antLag, -FOLD_ANT, rest), 5, burst);
    els.antl.style.transform = "rotate(" + antL + "deg)";
    els.antr.style.transform = "rotate(" + antR + "deg)";

    // --- Body: breath, drop when folded, lift on clap ----------------------
    var bob = (BODY_BOB[0] + (BODY_BOB[1] - BODY_BOB[0]) * I) * Math.sin(swayPhase * 0.5);
    var bodyTy = bob * (1 - rest) + FOLD_BODY * rest - 4 * oc * burst;
    els.body.style.transform = "translateY(" + bodyTy + "px)";

    // --- Whole-body attitude -----------------------------------------------
    var lean = clamp(vx * LEAN_K, -LEAN_MAX, LEAN_MAX);
    var lat = speed > 1 ? (vx * ay - vy * ax) / speed : 0;
    var bank = clamp(lat * BANK_K * 0.001, -BANK_MAX, BANK_MAX);
    roll += ((lean + bank) * (1 - rest) - roll) * alpha(dt, 0.1);
    var pitchTarget = 1 - clamp(Math.abs(vy) / 5200, 0, 0.06);
    pitch += (pitchTarget - pitch) * alpha(dt, 0.12);

    // --- Compose -----------------------------------------------------------
    var s = SCALE * (1 + 0.05 * I + 0.07 * burst * oc - 0.03 * rest);
    root.style.transform =
      "translate(" + (sx - SKULL_X) + "px," + (sy - SKULL_Y) + "px) scale(" +
      s + "," + (s * pitch) + ") rotate(" + roll + "deg)";
    var glow = Math.max(I, burst * 0.6);
    root.style.filter =
      "drop-shadow(0 " + (3 + 5 * I).toFixed(1) + "px " + (6 + 8 * I).toFixed(1) +
      "px rgba(0,0,0,0.45)) drop-shadow(0 0 " + (11 * glow).toFixed(1) +
      "px rgba(228,179,67," + (0.22 * glow).toFixed(3) + "))";

    if (window.__moth) window.__moth(speed, err, I, roll, { rest: rest, burst: burst, brake: brake });
  }
  requestAnimationFrame(frame);
})();
