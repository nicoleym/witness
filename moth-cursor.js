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

  // Lilt: a perched moth never sits perfectly upright — a slow, irregular
  // resting tilt that drifts a few degrees either way.
  var LILT_AMP = 5.2;                 // peak resting tilt, deg

  // Ambient idle gestures, played one at a time while at rest. Each is a slow
  // pose envelope (0 -> peak -> 0) layered over whatever the wings are doing.
  var GEST_GAP = [3.5, 8.0];          // s between ambient gestures (random)
  // Wing-stretch: the four pieces splay in opposing directions, elongating.
  var STRETCH_DUR = 1.6, ST_UP = 15, ST_DN = 14, ST_EXT = 0.11;
  // Slick-back: wings sweep straight down/back, streamlined, and hold a beat.
  var SLICK_DUR = 2.2, SL_UP = 36, SL_DN = 24, SL_SXU = 0.76, SL_SXL = 0.82;
  // Coattails: a far narrower slick — wings hang nearly straight down and the
  // whole moth collapses to a slim vertical column, wings trailing like tails.
  // The right side lags the left a touch so the two tails don't drop in lockstep.
  var COAT_DUR = 0.55, CO_UP = 95, CO_DN = 86, CO_SXU = 0.23, CO_SXL = 0.27;
  var COAT_STAGGER = 0.12;            // fraction of progress the right side trails

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
  var liltClock = 0;
  var gKind = "", gActive = false, gProg = 0, gDur = 1, gEnv = 0, gEnvR = 0, gGap = GEST_GAP[0];
  var lastGest = "";
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
  function rand(a, b) { return a + Math.random() * (b - a); }

  // Envelope shape for an ambient gesture, progress p in [0,1].
  // Stretch is a smooth out-and-back; slick-back ramps up, holds, releases.
  function gestureEnv(kind, p) {
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    if (kind === "coat") {
      // Quick & sharp: snap in, a hair of hold, snap back out.
      if (p < 0.3) { var c = p / 0.3; return c * c * (3 - 2 * c); }
      if (p < 0.45) return 1;
      var e = (1 - p) / 0.55; return e * e * (3 - 2 * e);
    }
    if (kind === "slick") {
      if (p < 0.22) { var u = p / 0.22; return u * u * (3 - 2 * u); }
      if (p < 0.68) return 1;
      var d = (1 - p) / 0.32; return d * d * (3 - 2 * d);
    }
    return Math.sin(Math.PI * clamp(p, 0, 1)); // stretch
  }

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

    // --- Ambient idle gestures: occasional stretch / slick-back ------------
    var settled = speed < 40 && burst <= 0;
    if (gActive) {
      gProg += dt / gDur;
      if (gProg >= 1 || !settled) { gActive = false; gGap = rand(GEST_GAP[0], GEST_GAP[1]); }
      if (gActive) {
        var stag = gKind === "coat" ? COAT_STAGGER : 0;
        gEnv = gestureEnv(gKind, gProg);
        gEnvR = stag ? gestureEnv(gKind, gProg - stag) : gEnv;
      }
    }
    if (!gActive) {
      gEnv += (0 - gEnv) * alpha(dt, 0.14);          // ease the last gesture out
      gEnvR += (0 - gEnvR) * alpha(dt, 0.14);
      if (settled && rest > 0.4) {
        gGap -= dt;
        if (gGap <= 0 && gEnv < 0.02) {
          // Cycle through every idle motion, no immediate repeats, so the
          // whole repertoire gets shown off even without cursor input.
          var pool = ["stretch", "slick", "coat", "clap"];
          var pick = pool[(Math.random() * pool.length) | 0];
          if (pick === lastGest) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
          lastGest = pick;
          gGap = rand(GEST_GAP[0], GEST_GAP[1]);
          if (pick === "clap") {
            fireBurst(0.9);                            // a spontaneous flutter-clap
          } else {
            gActive = true; gProg = 0; gKind = pick;
            gDur = pick === "slick" ? SLICK_DUR : pick === "coat" ? COAT_DUR : STRETCH_DUR;
          }
        }
      }
    }

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

    // flight targets per side; brake widens (negative compression).
    var raiseLf = rotAmt * o, compLf = compAmt * o - brake;
    var raiseRf = rotAmt * o2, compRf = compAmt * o2 - brake;
    var raiseClap = CLAP_RAISE + CLAP_SWING * oc;          // clap is symmetric
    var compClap = CLAP_COMP[0] + (CLAP_COMP[1] - CLAP_COMP[0]) * oc;

    // Per-wing, in a "raise = tip up" convention (right side negates on emit).
    // Base = flight blended into the folded perch by `rest`.
    var rUL = lerp(raiseLf, FOLD_RAISE, rest), rLL = lerp(raiseLf * 0.85, FOLD_RAISE, rest);
    var rUR = lerp(raiseRf, FOLD_RAISE, rest), rLR = lerp(raiseRf * 0.85, FOLD_RAISE, rest);
    var xL = 1 - lerp(compLf, FOLD_COMP, rest), xR = 1 - lerp(compRf, FOLD_COMP, rest);
    var xUL = xL, xLL = xL, xUR = xR, xLR = xR;

    // Ambient gesture: stretch (splay) / slick-back / coattails. The left side
    // uses gEnv, the right side gEnvR — equal except for coattails, where the
    // right tail lags the left so they don't drop in perfect lockstep.
    if (gEnv > 0.001 || gEnvR > 0.001) {
      var gUp, gDn, gSxU, gSxL;
      if (gKind === "slick") { gUp = -SL_UP; gDn = -SL_DN; gSxU = SL_SXU; gSxL = SL_SXL; }
      else if (gKind === "coat") { gUp = -CO_UP; gDn = -CO_DN; gSxU = CO_SXU; gSxL = CO_SXL; }
      else { gUp = ST_UP; gDn = -ST_DN; gSxU = 1 + ST_EXT; gSxL = 1 + ST_EXT; }
      rUL = lerp(rUL, gUp, gEnv); rUR = lerp(rUR, gUp, gEnvR);
      rLL = lerp(rLL, gDn, gEnv); rLR = lerp(rLR, gDn, gEnvR);
      xUL = lerp(xUL, gSxU, gEnv); xUR = lerp(xUR, gSxU, gEnvR);
      xLL = lerp(xLL, gSxL, gEnv); xLR = lerp(xLR, gSxL, gEnvR);
    }

    // Clap-flap overrides everything while it fires.
    if (burst > 0) {
      rUL = lerp(rUL, raiseClap, burst); rUR = lerp(rUR, raiseClap, burst);
      rLL = lerp(rLL, raiseClap * 0.85, burst); rLR = lerp(rLR, raiseClap * 0.85, burst);
      var xc = 1 - compClap;
      xUL = lerp(xUL, xc, burst); xUR = lerp(xUR, xc, burst);
      xLL = lerp(xLL, xc, burst); xLR = lerp(xLR, xc, burst);
    }

    els.wul.style.transform = "scaleX(" + xUL + ") rotate(" + rUL + "deg)";
    els.wll.style.transform = "scaleX(" + xLL + ") rotate(" + rLL + "deg)";
    els.wur.style.transform = "scaleX(" + xUR + ") rotate(" + (-rUR) + "deg)";
    els.wlr.style.transform = "scaleX(" + xLR + ") rotate(" + (-rLR) + "deg)";

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
    // Feelers spread on a stretch, lay back on a slick / coattails.
    var gAntL = -7, gAntR = 7;
    if (gKind === "slick") { gAntL = 13; gAntR = -13; }
    else if (gKind === "coat") { gAntL = 6; gAntR = -6; }
    antL = lerp(antL, gAntL, gEnv); antR = lerp(antR, gAntR, gEnvR);
    els.antl.style.transform = "rotate(" + antL + "deg)";
    els.antr.style.transform = "rotate(" + antR + "deg)";

    // --- Body: breath, drop when folded, lift on clap, rise on stretch -----
    var bob = (BODY_BOB[0] + (BODY_BOB[1] - BODY_BOB[0]) * I) * Math.sin(swayPhase * 0.5);
    var gBody = -3;                                // stretch rises
    if (gKind === "slick") gBody = 2;              // slick / coattails settle down
    else if (gKind === "coat") gBody = 3;
    var bodyTy = bob * (1 - rest) + FOLD_BODY * rest - 4 * oc * burst + gBody * gEnv;
    els.body.style.transform = "translateY(" + bodyTy + "px)";

    // --- Whole-body attitude: lilt + lean + bank ---------------------------
    // A perched moth is never bolt upright — slow, irregular resting tilt.
    liltClock += dt;
    var lilt = Math.sin(liltClock * 0.6) * (LILT_AMP * 0.62) +
               Math.sin(liltClock * 0.27 + 1.3) * (LILT_AMP * 0.42);
    var lean = clamp(vx * LEAN_K, -LEAN_MAX, LEAN_MAX);
    var lat = speed > 1 ? (vx * ay - vy * ax) / speed : 0;
    var bank = clamp(lat * BANK_K * 0.001, -BANK_MAX, BANK_MAX);
    roll += (lilt + (lean + bank) * (1 - rest) - roll) * alpha(dt, 0.1);
    var pitchTarget = 1 - clamp(Math.abs(vy) / 5200, 0, 0.06);
    pitch += (pitchTarget - pitch) * alpha(dt, 0.12);

    // --- Compose -----------------------------------------------------------
    var gScale = gKind === "stretch" ? 0.04 * gEnv : 0; // stretch elongates a touch
    var s = SCALE * (1 + 0.05 * I + 0.07 * burst * oc - 0.03 * rest + gScale);
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
