/*
 * Moteur de simulation de la planche « Coupe du Gang · nouvelles règles » (31 oct. 2026).
 * Vue de dessus, vrai stade du jeu, ballon et joueurs en physique, particules, ombres et lumières.
 *
 *   CoupeSim.mount(canvas, def, opts) -> { stop(), reroll() }
 *   def : { mode: 'event', kind }  foam | gel | storm | goals | water | smoke (match joué seul, événement en boucle)
 *         { mode: 'script', name } fire | elec | penalty | golden | camp | block | keep | firewater | elecwater | firefoam
 *         { mode: 'multi' }        match joué seul, événements tirés au hasard à la suite, sans but
 *   opts : { view: { x0, y0, w, h } (unités du jeu), cssW, cssH }
 */
(function () {
  'use strict';
  var W = 360, H = 640, GW = 124, GL = 118, GR = 242, GD = 28, BR = 11, PR = 24, BBW = 228, BBD = 100;
  var IK = 1234 / 640, IX0 = 255.4375, IY0 = 543;
  var IMG = '/_blob/99e21bf250a9694c0c286464883e8df0';
  var TAU = Math.PI * 2;
  var FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
  var DUR = { foam: 6, gel: 6, storm: 5, goals: 8, water: 10, smoke: 10 };
  var LENS = { calm: 1.2, announce: 1.0, fade: 1.4 };
  var NAMES = { foam: 'MOUSSE À RASER', gel: 'GEL', storm: 'ORAGE', goals: 'BUTS QUI BOUGENT', water: 'ARROSAGE', smoke: 'FUMIGÈNE' };
  var GOLD = '#ebc15e';

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function imgOk(img) { return img && img.complete && img.naturalWidth > 0; }
  function pick(xs) { return xs[Math.floor(Math.random() * xs.length)]; }

  // ─── Sprites ──────────────────────────────────────────────────────
  var SPR = null, IMAGE = null;
  function sprite(size, paint) { var c = document.createElement('canvas'); c.width = size; c.height = size; paint(c.getContext('2d'), size); return c; }
  function radial(stops) {
    return function (g, s) {
      var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    };
  }
  function makeSprites() {
    SPR = {
      shadow: sprite(64, radial([[0, 'rgba(0,0,0,.6)'], [0.5, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,0)']])),
      flame: sprite(64, radial([[0, 'rgba(255,250,210,1)'], [0.25, 'rgba(255,190,60,.9)'], [0.6, 'rgba(255,80,20,.45)'], [1, 'rgba(255,40,10,0)']])),
      glowO: sprite(64, radial([[0, 'rgba(255,170,60,.75)'], [1, 'rgba(255,90,20,0)']])),
      glowB: sprite(64, radial([[0, 'rgba(170,225,255,.9)'], [0.45, 'rgba(70,155,255,.4)'], [1, 'rgba(40,110,255,0)']])),
      glowG: sprite(64, radial([[0, 'rgba(255,230,150,.85)'], [0.5, 'rgba(235,193,94,.35)'], [1, 'rgba(235,193,94,0)']])),
      smoke: sprite(128, radial([[0, 'rgba(225,225,228,.6)'], [0.4, 'rgba(215,215,220,.38)'], [0.75, 'rgba(205,205,210,.1)'], [1, 'rgba(205,205,210,0)']])),
      smokeR: sprite(128, radial([[0, 'rgba(238,66,66,.8)'], [0.45, 'rgba(212,42,46,.52)'], [0.8, 'rgba(190,30,35,.13)'], [1, 'rgba(190,30,35,0)']])),
      redLight: sprite(128, radial([[0, 'rgba(255,80,60,.6)'], [0.5, 'rgba(255,40,40,.2)'], [1, 'rgba(255,40,40,0)']])),
      drop: sprite(16, radial([[0, 'rgba(245,250,255,1)'], [0.45, 'rgba(205,230,255,.85)'], [1, 'rgba(205,230,255,0)']])),
      scorch: sprite(128, radial([[0, 'rgba(12,8,5,.95)'], [0.35, 'rgba(28,17,9,.85)'], [0.6, 'rgba(45,28,14,.45)'], [1, 'rgba(45,28,14,0)']])),
      wetDot: sprite(32, radial([[0, 'rgba(4,18,8,.55)'], [1, 'rgba(4,18,8,0)']])),
      bubble: sprite(64, function (g, s) {
        var c = s / 2, gr = g.createRadialGradient(c * 0.7, c * 0.62, s * 0.03, c, c, c);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#f6f9fb'); gr.addColorStop(0.8, '#dbe3e9'); gr.addColorStop(1, '#bcc7d0');
        g.fillStyle = gr; g.beginPath(); g.arc(c, c, c - 1.5, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(135,150,165,.6)'; g.lineWidth = 2; g.stroke();
        g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(c * 0.64, c * 0.56, c * 0.17, 0, TAU); g.fill();
      })
    };
    IMAGE = new Image(); IMAGE.src = IMG;
  }

  // ─── Dessin : outils ──────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
  function smoothPath(ctx, pts) {
    var n = pts.length, m = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    ctx.beginPath(); var m0 = m(pts[n - 1], pts[0]); ctx.moveTo(m0.x, m0.y);
    for (var i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n], mm = m(p, q); ctx.quadraticCurveTo(p.x, p.y, mm.x, mm.y); }
    ctx.closePath();
  }
  function inPoly(pts, x, y) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function polyline(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); }
  function dashed(ctx, x, y, rx, ry, a, t, color) {
    ctx.save(); ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 24; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 16);
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, TAU); ctx.stroke(); ctx.restore();
  }
  function arcs(ctx, x, y, r0, r1, n, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.shadowColor = color; ctx.shadowBlur = 6;
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      for (var j = 1; j <= 4; j++) { var r = lerp(r0, r1, j / 4), aa = a + rnd(-0.5, 0.5); ctx.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function jag(x0, y0, x1, y1, depth, rough) {
    var pts = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
    for (var d = 0; d < depth; d++) {
      var next = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        var nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, off = rnd(-1, 1) * len * rough;
        next.push({ x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off }, b);
      }
      pts = next;
    }
    return pts;
  }
  function genBolt(x, y, top) {
    var main = jag(x + rnd(-90, 90), top - 20, x, y, 6, 0.3), branches = [], n = 2 + Math.floor(Math.random() * 2);
    for (var i = 0; i < n; i++) {
      var s = main[Math.floor(rnd(0.25, 0.75) * main.length)], ang = Math.atan2(y - s.y, x - s.x) + rnd(-0.9, 0.9), len = rnd(50, 130);
      branches.push(jag(s.x, s.y, s.x + Math.cos(ang) * len, s.y + Math.sin(ang) * len, 4, 0.35));
    }
    return { main: main, branches: branches };
  }
  function drawBolt(ctx, bolt, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowColor = '#7cc4ff';
    var layers = [[12, 'rgba(90,160,255,' + (0.22 * a).toFixed(3) + ')', 18], [5, 'rgba(170,215,255,' + (0.6 * a).toFixed(3) + ')', 10], [1.8, 'rgba(255,255,255,' + a.toFixed(3) + ')', 4]];
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i]; ctx.strokeStyle = L[1]; ctx.shadowBlur = L[2];
      ctx.lineWidth = L[0]; polyline(ctx, bolt.main);
      ctx.lineWidth = L[0] * 0.55; for (var j = 0; j < bolt.branches.length; j++) polyline(ctx, bolt.branches[j]);
    }
    ctx.restore();
  }
  function fullRect(ctx, v, style) { ctx.fillStyle = style; ctx.fillRect(v.x0, v.y0, v.w, v.h); }

  // Textes posés sur le terrain (bannières, étiquettes)
  function textShadowed(ctx, txt, x, y, size, color, shade) {
    ctx.font = '800 ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = shade || 'rgba(11,11,12,.9)'; ctx.fillText(txt, x, y + size * 0.07);
    ctx.fillStyle = color; ctx.fillText(txt, x, y);
  }
  function pill(ctx, txt, x, y, size, color) {
    ctx.font = '700 ' + size + 'px ' + FONT; var w = ctx.measureText(txt).width + size * 0.9, h = size * 1.45;
    ctx.fillStyle = 'rgba(11,11,12,.86)'; roundRect(ctx, x - w / 2, y - h / 2, w, h, size * 0.4); ctx.fill();
    ctx.fillStyle = color || '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + 0.5);
  }
  function banner(sc, text, sub, color, opts) { if (window.__SIMLOG) window.__SIMLOG.push(text); sc.banners.push({ text: text, sub: sub, color: color || '#ffffff', age: 0, dur: (opts && opts.dur) || 2.2, y: (opts && opts.y) || H / 2 - 30, size: (opts && opts.size) || 58, glow: opts && opts.glow }); }
  function tag(sc, text, x, y, color, dur) { if (window.__SIMLOG) window.__SIMLOG.push('#' + text); sc.tags.push({ text: text, x: x, y: y, color: color || GOLD, age: 0, dur: dur || 1 }); }
  function drawBanners(sc, ctx) {
    var i;
    for (i = 0; i < sc.tags.length; i++) {
      var g = sc.tags[i], a = clamp(Math.min(g.age / 0.12, (g.dur - g.age) / 0.25), 0, 1);
      ctx.globalAlpha = a; pill(ctx, g.text, g.x, g.y - g.age * 8, 15, g.color); ctx.globalAlpha = 1;
    }
    for (i = 0; i < sc.banners.length; i++) {
      var b = sc.banners[i], t = b.age, s = t < 0.18 ? lerp(0.55, 1.1, t / 0.18) : t < 0.3 ? lerp(1.1, 1, (t - 0.18) / 0.12) : 1;
      var a2 = clamp((b.dur - t) / 0.35, 0, 1); ctx.save(); ctx.globalAlpha = a2; ctx.translate(W / 2, b.y); ctx.scale(s, s);
      if (b.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(b.glow, -150, -60, 300, 120); ctx.globalCompositeOperation = 'source-over'; }
      textShadowed(ctx, b.text, 0, 0, b.size, b.color, 'rgba(142,15,20,.95)');
      if (b.sub) pill(ctx, b.sub, 0, b.size * 0.78, 17, '#ffffff');
      ctx.restore();
    }
  }

  // ─── Décor ────────────────────────────────────────────────────────
  function drawBackground(ctx, v) {
    if (imgOk(IMAGE)) { ctx.drawImage(IMAGE, IX0 + v.x0 * IK, IY0 + v.y0 * IK, v.w * IK, v.h * IK, v.x0, v.y0, v.w, v.h); return; }
    ctx.fillStyle = '#121513'; ctx.fillRect(v.x0, v.y0, v.w, v.h);
    for (var y = 0; y < H; y += 40) { ctx.fillStyle = (y / 40) % 2 ? '#1b3a21' : '#24482b'; ctx.fillRect(0, y, W, 40); }
    ctx.strokeStyle = 'rgba(236,248,240,.8)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 46, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(12,16,14,.9)'; ctx.fillRect(GL, -GD, GW, GD); ctx.fillRect(GL, H, GW, GD);
  }
  function patchImage(ctx, sx, sy, sw, sh, dx, dy, alpha) {
    if (!imgOk(IMAGE)) return;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(IMAGE, IX0 + sx * IK, IY0 + sy * IK, sw * IK, sh * IK, dx, dy, sw, sh);
    ctx.globalAlpha = 1;
  }
  function patchGoal(ctx, top) {
    var y = top ? -GD - 12 : H, h = GD + 12;
    if (imgOk(IMAGE)) ctx.drawImage(IMAGE, IX0 + (GR + 10) * IK, IY0 + y * IK, (GW + 20) * IK, h * IK, GL - 10, y, GW + 20, h);
    else { ctx.fillStyle = '#121513'; ctx.fillRect(GL - 10, y, GW + 20, h); }
  }
  function drawGoal(ctx, cx, top) {
    var x0 = cx - GW / 2, x1 = cx + GW / 2, yb = top ? -GD : H, line = top ? 0 : H;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x0 + 4, yb + 5, GW, GD);
    ctx.fillStyle = 'rgba(12,16,14,.82)'; ctx.fillRect(x0, yb, GW, GD);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, yb, GW, GD); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 0.7; ctx.beginPath();
    for (var i = -GD; i < GW + GD; i += 5) { ctx.moveTo(x0 + i, yb); ctx.lineTo(x0 + i + GD, yb + GD); ctx.moveTo(x0 + i + GD, yb); ctx.lineTo(x0 + i, yb + GD); }
    ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(225,230,236,.85)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x0, line); ctx.lineTo(x0, top ? yb : yb + GD); ctx.lineTo(x1, top ? yb : yb + GD); ctx.lineTo(x1, line); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, line); ctx.lineTo(x1, line); ctx.stroke();
    [x0, x1].forEach(function (px) {
      var g = ctx.createRadialGradient(px - 1.2, line - 1.2, 0.5, px, line, 4.2); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9aa2aa');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, line, 4.2, 0, TAU); ctx.fill();
    });
    ctx.restore();
  }

  // ─── Particules ───────────────────────────────────────────────────
  function burst(sc, x, y, k, n) {
    for (var i = 0; i < n; i++) { var a = rnd(0, TAU), v = rnd(60, 220); sc.parts.push({ k: k, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.25, 0.5), age: 0, s: rnd(1, 2) }); }
  }
  function steam(sc, x, y, n) { for (var i = 0; i < n; i++) sc.parts.push({ k: 'steam', x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-22, 22), vy: rnd(-34, -8), life: rnd(0.6, 1.2), age: 0, s: rnd(10, 18) }); }
  function confetti(sc, n) {
    for (var i = 0; i < n; i++) sc.parts.push({ k: 'conf', x: rnd(0, W), y: rnd(-80, -10), vx: rnd(-20, 20), vy: rnd(120, 220), life: rnd(2.2, 3.4), age: 0, s: rnd(4, 7), r: rnd(0, TAU), vr: rnd(-8, 8), c: pick([GOLD, '#ffffff', '#e01f26']) });
  }
  function updateParts(sc, dt) {
    var ps = sc.parts;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i]; p.age += dt; p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if (p.k === 'flame' || p.k === 'spark' || p.k === 'zap') { var f = Math.exp(-3 * dt); p.vx *= f; p.vy *= f; }
      if (p.k === 'conf') p.r += p.vr * dt;
    }
    sc.parts = ps.filter(function (p) { return p.age < p.life; });
    if (sc.parts.length > 800) sc.parts.splice(0, sc.parts.length - 800);
  }
  function drawParts(sc, ctx, layer) {
    for (var i = 0; i < sc.parts.length; i++) {
      var p = sc.parts[i]; if ((p.layer || 'over') !== layer) continue;
      var t = p.age / p.life, a = 1 - t;
      if (p.k === 'flame') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.9; var s = p.s * (1 + t * 0.7); ctx.drawImage(SPR.flame, p.x - s / 2, p.y - s / 2, s, s); }
      else if (p.k === 'spark' || p.k === 'zap') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; ctx.strokeStyle = p.k === 'spark' ? 'rgba(255,190,90,' + a.toFixed(3) + ')' : 'rgba(175,222,255,' + a.toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); ctx.stroke(); }
      else if (p.k === 'pop') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); }
      else if (p.k === 'glint') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = '#e8fffb'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); }
      else if (p.k === 'splash') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(220,236,255,' + (0.5 * a).toFixed(3) + ')'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.4 + t), 0, TAU); ctx.stroke(); }
      else if (p.k === 'steam' || p.k === 'wisp') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (p.k === 'steam' ? 0.6 : 0.35) * a; var ss = p.s * (1 + t * 1.4); ctx.drawImage(SPR.smoke, p.x - ss, p.y - ss, ss * 2, ss * 2); }
      else if (p.k === 'hit') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * a).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + t * 16, 0, TAU); ctx.stroke(); }
      else if (p.k === 'shock') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,170,60,' + (0.8 * a).toFixed(3) + ')'; ctx.lineWidth = 3 * a + 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, 8 + t * 46, 0, TAU); ctx.stroke(); }
      else if (p.k === 'conf') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a * 1.5); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 5, p.s, p.s / 2.5); ctx.restore(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ─── Jeu : ballon et joueurs ──────────────────────────────────────
  function padAI(p, b, dt, slow) {
    var mine = p.side === 0 ? b.y > H / 2 - 10 : b.y < H / 2 + 10, tx, ty;
    if (mine && !b.hidden) { tx = b.x + rnd(-2, 2); ty = b.y + (p.side === 0 ? 20 : -20); }
    else { tx = W / 2 + (b.x - W / 2) * 0.45; ty = p.side === 0 ? H - 74 : 74; }
    tx = clamp(tx, PR, W - PR);
    ty = p.side === 0 ? clamp(ty, H / 2 + PR, H - PR - 4) : clamp(ty, PR + 4, H / 2 - PR);
    moveTo(p, tx, ty, (p.side === 0 ? 560 : 520) * (slow || 1), dt);
  }
  function moveTo(p, tx, ty, vmax, dt) {
    var dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), sp = Math.min(vmax, d * 8);
    p.vx = d > 0.5 ? dx / d * sp : 0; p.vy = d > 0.5 ? dy / d * sp : 0;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.x = clamp(p.x, PR, W - PR); p.y = clamp(p.y, PR, H - PR);
  }
  function collide(sc, p, b) {
    var dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), m = BR + PR;
    if (d >= m || d < 0.001) return;
    var nx = dx / d, ny = dy / d; b.x = p.x + nx * m; b.y = p.y + ny * m;
    var rel = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
    if (rel >= 0) return;
    b.vx -= 1.85 * rel * nx; b.vy -= 1.85 * rel * ny; b.vx += p.vx * 0.5; b.vy += p.vy * 0.5;
    if (!sc.script) {
      var want = p.side === 0 ? -1 : 1;
      if (b.vy * want < 160) b.vy = want * rnd(260, 520);
      b.vx += rnd(-140, 140);
      if (Math.random() < 0.12) { b.vx *= 1.25; b.vy *= 1.5; }
    }
    var wasHot = b.fire > 0 || b.elec > 0;
    if (wasHot && b.owner !== p.side) { if (b.fire > 0) steam(sc, b.x, b.y, 8); b.fire = 0; b.elec = 0; if (sc.script && sc.script.onDouse) sc.script.onDouse(sc, p); }
    if (!sc.script && Math.hypot(b.vx, b.vy) > 930 && !(b.fire > 0)) { b.fire = 4; b.owner = p.side; burst(sc, b.x, b.y, 'spark', 12); }
    sc.parts.push({ k: 'hit', x: b.x - nx * BR, y: b.y - ny * BR, life: 0.25, age: 0 });
    if (sc.script && sc.script.onHit) sc.script.onHit(sc, p, b);
  }
  function serve(sc) {
    var b = sc.ball; b.x = W / 2 + rnd(-30, 30); b.y = H / 2; b.vx = rnd(-160, 160); b.vy = (Math.random() < 0.5 ? -1 : 1) * rnd(320, 480);
    b.fire = 0; b.elec = 0; b.hop = 0; b.owner = -1; b.trail = []; b.hidden = false; b.kin = false;
  }
  function aim(b, tx, ty, speed) { var dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1; b.vx = dx / d * speed; b.vy = dy / d * speed; }
  function physics(sc, dt) {
    var b = sc.ball, i;
    for (i = 0; i < 2; i++) {
      var p = sc.pads[i];
      if (p.ctrl) moveTo(p, p.ctrl.x, p.ctrl.y, p.ctrl.v || 600, dt);
      else padAI(p, b, dt, p.slow);
    }
    if (b.hidden) return;
    if (b.kin) { b.trail.unshift({ x: b.x, y: b.y }); if (b.trail.length > 8) b.trail.pop(); return; }
    if (!sc.noFriction) { var f = Math.exp(-(sc.friction || 0.32) * dt); b.vx *= f; b.vy *= f; }
    sc.noFriction = false;
    var sp = Math.hypot(b.vx, b.vy);
    if (sp > 980) { b.vx *= 980 / sp; b.vy *= 980 / sp; sp = 980; }
    if (!sc.script && sp < 70) { sc.slowT += dt; if (sc.slowT > 1.2) { b.vy += (b.y > H / 2 ? -1 : 1) * 300; b.vx += rnd(-80, 80); sc.slowT = 0; } } else sc.slowT = 0;
    b.x += b.vx * dt; b.y += b.vy * dt; b.spin += sp * dt / BR;
    if (b.hop > 0) b.hop -= dt; if (b.fire > 0) b.fire -= dt; if (b.elec > 0) b.elec -= dt;
    if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx) * 0.85; }
    if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx) * 0.85; }
    var offT = sc.goalOff[1], offB = sc.goalOff[0], mouthT = b.x > GL + offT + 4 && b.x < GR + offT - 4 && !sc.noGoals, mouthB = b.x > GL + offB + 4 && b.x < GR + offB - 4 && !sc.noGoals;
    if (b.y < BR) { if (mouthT) { if (b.y < -GD * 0.5) { goal(sc, 0); return; } } else { b.y = BR; b.vy = Math.abs(b.vy) * 0.85; } }
    if (b.y > H - BR) { if (mouthB) { if (b.y > H + GD * 0.5) { goal(sc, 1); return; } } else { b.y = H - BR; b.vy = -Math.abs(b.vy) * 0.85; } }
    if (b.y < 0) b.x = clamp(b.x, GL + offT + BR, GR + offT - BR);
    if (b.y > H) b.x = clamp(b.x, GL + offB + BR, GR + offB - BR);
    if (!(b.hop > 0)) for (i = 0; i < 2; i++) collide(sc, sc.pads[i], b);
    b.trail.unshift({ x: b.x, y: b.y }); if (b.trail.length > 8) b.trail.pop();
    if (b.fire > 0) {
      var n = Math.ceil(dt * 60 * (1 + sp / 350));
      for (var k = 0; k < n; k++) sc.parts.push({ k: 'flame', x: b.x + rnd(-4, 4), y: b.y + rnd(-4, 4), vx: -b.vx * 0.12 + rnd(-30, 30), vy: -b.vy * 0.12 + rnd(-30, 30), life: rnd(0.25, 0.45), age: 0, s: rnd(10, 18), layer: 'ball' });
    }
  }
  function goal(sc, scorer) {
    var b = sc.ball, hot = b.fire > 0 ? 'fire' : b.elec > 0 ? 'elec' : null;
    burst(sc, b.x, scorer === 0 ? 0 : H, hot === 'fire' ? 'spark' : 'zap', 22);
    sc.shake = Math.max(sc.shake, 5);
    if (sc.script) { if (sc.script.onGoal) sc.script.onGoal(sc, scorer, hot); b.hidden = true; b.vx = 0; b.vy = 0; b.fire = 0; b.elec = 0; }
    else serve(sc);
  }
  function drawBall(ctx, sc) {
    var b = sc.ball; if (b.hidden) return;
    var hop = b.hop > 0 ? Math.sin(Math.PI * clamp(1 - b.hop / 0.5, 0, 1)) : 0, s = 1 + 0.7 * hop, sp = Math.hypot(b.vx, b.vy);
    ctx.globalAlpha = 0.55 - 0.25 * hop; ctx.drawImage(SPR.shadow, b.x + 3 + 10 * hop - 15, b.y + 4 + 14 * hop - 15, 30, 30); ctx.globalAlpha = 1;
    var bx = b.x, by = b.y - 14 * hop;
    if (sp > 520 || b.kin) { for (var i = 2; i < b.trail.length; i += 2) { ctx.globalAlpha = 0.14 * (1 - i / b.trail.length); ctx.fillStyle = b.fire > 0 ? '#ffb020' : b.elec > 0 ? '#9fd4ff' : '#ffffff'; ctx.beginPath(); ctx.arc(b.trail[i].x, b.trail[i].y, BR, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = 'lighter';
    if (b.fire > 0) ctx.drawImage(SPR.glowO, bx - 28, by - 28, 56, 56);
    if (b.elec > 0) ctx.drawImage(SPR.glowB, bx - 32, by - 32, 64, 64);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(bx, by); ctx.scale(s, s);
    var g = ctx.createRadialGradient(-3.5, -3.5, 1, 0, 0, BR);
    if (b.fire > 0) { g.addColorStop(0, '#fff6c9'); g.addColorStop(0.5, '#ffb020'); g.addColorStop(1, '#e8400f'); }
    else if (b.elec > 0) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#9fd4ff'); g.addColorStop(1, '#2b7cff'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#e8e8e8'); g.addColorStop(1, '#9b9b9b'); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, BR, 0, TAU); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(25,25,28,.5)';
    for (var k = 0; k < 3; k++) { var a = b.spin * 0.35 + k * 2.1; ctx.beginPath(); ctx.arc(Math.cos(a) * 6.5, Math.sin(a * 0.8) * 5.5, 3.1, 0, TAU); ctx.fill(); }
    ctx.restore(); ctx.restore();
    if (b.elec > 0) { ctx.globalCompositeOperation = 'lighter'; arcs(ctx, bx, by, 9, 21, 3, '#bfe6ff'); ctx.globalCompositeOperation = 'source-over'; }
  }
  function drawPad(ctx, p) {
    ctx.globalAlpha = 0.5; ctx.drawImage(SPR.shadow, p.x + 4 - 34, p.y + 6 - 34, 68, 68); ctx.globalAlpha = 1;
    var red = p.side === 0, g = ctx.createRadialGradient(p.x - 8, p.y - 8, 2, p.x, p.y, PR);
    if (red) { g.addColorStop(0, '#ff7a7e'); g.addColorStop(0.55, '#e01f26'); g.addColorStop(1, '#8e0f14'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f2f2f2'); g.addColorStop(1, '#b9bcc2'); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, PR, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, PR - 3, 0, TAU); ctx.stroke();
    var k = ctx.createRadialGradient(p.x - 3, p.y - 3, 1, p.x, p.y, 10);
    if (red) { k.addColorStop(0, '#ff8a8e'); k.addColorStop(1, '#a3111a'); } else { k.addColorStop(0, '#ffffff'); k.addColorStop(1, '#a8acb2'); }
    ctx.fillStyle = k; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function ring(ctx, x, y, r, frac, color) {
    ctx.save(); ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1)); ctx.stroke(); ctx.restore();
  }
  function gauge(ctx, x, y, w, frac, label) {
    ctx.fillStyle = 'rgba(11,11,12,.8)'; roundRect(ctx, x - w / 2 - 6, y - 16, w + 12, 30, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; roundRect(ctx, x - w / 2, y + 2, w, 7, 3.5); ctx.fill();
    ctx.fillStyle = GOLD; roundRect(ctx, x - w / 2, y + 2, Math.max(7, w * clamp(frac, 0, 1)), 7, 3.5); ctx.fill();
    ctx.font = '700 12px ' + FONT; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y - 6);
  }
  function whistle(sc) { sc.flash = Math.max(sc.flash, 0.5); sc.shake = Math.max(sc.shake, 2); }

  // ─── Pièces des événements, réutilisées par les séquences ─────────
  function pop(sc, q, hot) {
    q.dead = true;
    if (hot) { steam(sc, q.x + q.ox, q.y + q.oy, 1); return; }
    for (var i = 0; i < 3; i++) sc.parts.push({ k: 'pop', x: q.x + q.ox, y: q.y + q.oy, vx: rnd(-45, 45), vy: rnd(-45, 45), life: rnd(0.2, 0.35), age: 0, s: rnd(0.8, 1.8) });
  }
  function makeFoam(cx, cy) {
    var lobes = [], n = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) lobes.push({ x: cx + rnd(-28, 28), y: cy + rnd(-18, 18), rx: rnd(18, 34), ry: rnd(12, 22), a: rnd(0, Math.PI) });
    var inside = function (x, y) {
      for (var i = 0; i < lobes.length; i++) { var L = lobes[i], c = Math.cos(L.a), s = Math.sin(L.a), dx = x - L.x, dy = y - L.y, u = (dx * c + dy * s) / L.rx, v = (-dx * s + dy * c) / L.ry; if (u * u + v * v < 1) return true; }
      return false;
    };
    var bubbles = [], tries = 0;
    while (bubbles.length < 190 && tries < 5000) { tries++; var x = cx + rnd(-72, 72), y = cy + rnd(-52, 52); if (!inside(x, y)) continue; bubbles.push({ x: x, y: y, r: 2 + Math.pow(Math.random(), 2.2) * 7.5, d: rnd(0, 0.6), ph: rnd(0, TAU), ox: 0, oy: 0, dead: false }); }
    bubbles.sort(function (a, b) { return a.y - b.y; });
    return { lobes: lobes, inside: inside, bubbles: bubbles, cx: cx, cy: cy };
  }
  function foamStep(sc, f, dt, k, fading) {
    var b = sc.ball, sp = Math.hypot(b.vx, b.vy), hot = b.fire > 0;
    if (!b.hidden && k > 0.3 && f.inside(b.x, b.y) && !hot) { var fr = Math.exp(-3.4 * dt); b.vx *= fr; b.vy *= fr; if (sp < 45 && sp > 0) { b.vx *= 45 / sp; b.vy *= 45 / sp; } }
    for (var i = 0; i < f.bubbles.length; i++) {
      var q = f.bubbles[i]; if (q.dead) continue;
      var dx = q.x + q.ox - b.x, dy = q.y + q.oy - b.y, d = Math.hypot(dx, dy), m = BR + q.r * 0.8 + (hot ? 9 : 0);
      if (!b.hidden && d < m && d > 0.01) {
        if (hot) { if (Math.random() < 30 * dt) pop(sc, q, true); }
        else { q.ox += dx / d * (m - d) * 0.7; q.oy += dy / d * (m - d) * 0.7; if (sp > 120 && Math.random() < 5 * dt) pop(sc, q); }
      }
      if (fading && Math.random() < dt * 1.6) pop(sc, q);
    }
  }
  function foamDraw(sc, ctx, f, at) {
    var q, a, s, i;
    ctx.globalAlpha = 0.22;
    for (i = 0; i < f.bubbles.length; i++) { q = f.bubbles[i]; if (q.dead) continue; a = ease((at - q.d) / 0.35); if (a <= 0) continue; s = q.r * 2.7 * a; ctx.drawImage(SPR.shadow, q.x + q.ox + 1.5 - s / 2, q.y + q.oy + 2.5 - s / 2, s, s); }
    ctx.globalAlpha = 1;
    for (i = 0; i < f.bubbles.length; i++) { q = f.bubbles[i]; if (q.dead) continue; a = ease((at - q.d) / 0.35); if (a <= 0) continue; s = q.r * 2 * a * (1 + 0.05 * Math.sin(sc.t * 3 + q.ph)); ctx.drawImage(SPR.bubble, q.x + q.ox - s / 2, q.y + q.oy - s / 2, s, s); }
  }
  function makeSprinkler(x, y, base, range) { return { x: x, y: y, base: base, range: range, ang: base, dir: 1, step: 0, thr: rnd(105, 150), up: 0, acc: 0 }; }
  function waterStep(sc, w, dt, on) {
    var b = sc.ball, wc = sc.wetC.getContext('2d'), v = sc.v;
    w.sp.forEach(function (s) {
      s.up = on ? Math.min(1, s.up + dt / 0.35) : Math.max(0, s.up - dt / 0.5);
      if (s.up < 0.9 || !on) return;
      if (s.dir > 0) { s.step += dt; if (s.step > 0.075) { s.step = 0; s.ang += 0.07; if (s.ang > s.base + s.range) s.dir = -1; } }
      else { s.ang -= dt * 2.6; if (s.ang < s.base) { s.ang = s.base; s.dir = 1; } }
      s.acc += dt * 170;
      while (s.acc > 1) {
        s.acc -= 1; var a = s.ang + rnd(-0.05, 0.05), dist = s.thr * rnd(0.3, 1.05), T = rnd(0.42, 0.62);
        w.drops.push({ x: s.x, y: s.y, vx: Math.cos(a) * dist / T, vy: Math.sin(a) * dist / T, z: 4, vz: 900 * T / 2, s: rnd(1.6, 2.8) });
      }
      if (b.hidden) return;
      var dx = Math.cos(s.ang), dy = Math.sin(s.ang), rx = b.x - s.x, ry = b.y - s.y, along = rx * dx + ry * dy, perp = Math.abs(-rx * dy + ry * dx);
      if (along > 14 && along < s.thr && perp < 14) {
        b.vx += dx * 1300 * dt; b.vy += dy * 1300 * dt;
        if (b.fire > 0) { b.fire = 0; steam(sc, b.x, b.y, 12); if (sc.script && sc.script.onWater) sc.script.onWater(sc, 'fire'); }
        if (b.elec > 0) { b.elec = 0; b.hop = 0.5; burst(sc, b.x, b.y, 'zap', 20); sc.shake = Math.max(sc.shake, 3); if (sc.script && sc.script.onWater) sc.script.onWater(sc, 'elec'); }
      }
    });
    for (var j = 0; j < w.drops.length; j++) {
      var d = w.drops[j]; d.x += d.vx * dt; d.y += d.vy * dt; d.vz -= 900 * dt; d.z += d.vz * dt;
      if (d.z <= 0) { d.dead = true; if (Math.random() < 0.35) sc.parts.push({ k: 'splash', x: d.x, y: d.y, life: 0.28, age: 0, s: rnd(2, 4), layer: 'under' }); wc.globalAlpha = 0.06; wc.drawImage(SPR.wetDot, d.x - v.x0 - 7, d.y - v.y0 - 7, 14, 14); wc.globalAlpha = 1; }
    }
    w.drops = w.drops.filter(function (d) { return !d.dead; });
  }
  function waterUnder(sc, ctx, w) {
    if (sc.wetA > 0) { ctx.globalAlpha = sc.wetA; ctx.drawImage(sc.wetC, sc.v.x0, sc.v.y0, sc.v.w, sc.v.h); ctx.globalAlpha = 1; }
    w.sp.forEach(function (s) {
      if (s.up <= 0) return; var u = s.up;
      ctx.fillStyle = 'rgba(22,15,8,' + (0.45 * u).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(s.x, s.y, 8 * u + 2, 0, TAU); ctx.fill();
      var g = ctx.createRadialGradient(s.x - 2, s.y - 2, 0.5, s.x, s.y, 6 * u); g.addColorStop(0, '#eef2f5'); g.addColorStop(0.6, '#8d969e'); g.addColorStop(1, '#3f454b');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 6 * u, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2b3036'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(s.ang) * 9 * u, s.y + Math.sin(s.ang) * 9 * u); ctx.stroke();
    });
  }
  function waterOver(sc, ctx, w) {
    var i, d;
    ctx.globalAlpha = 0.2; for (i = 0; i < w.drops.length; i++) { d = w.drops[i]; if (d.z > 6) ctx.drawImage(SPR.wetDot, d.x - 2, d.y - 2, 4, 4); }
    ctx.globalAlpha = 1; for (i = 0; i < w.drops.length; i++) { d = w.drops[i]; ctx.drawImage(SPR.drop, d.x - d.s, d.y - d.z * 0.35 - d.s, d.s * 2, d.s * 2); }
  }
  function ensureWet(sc) {
    if (!sc.wetC) { sc.wetC = document.createElement('canvas'); sc.wetC.width = Math.ceil(sc.v.w); sc.wetC.height = Math.ceil(sc.v.h); }
    sc.wetC.getContext('2d').clearRect(0, 0, sc.wetC.width, sc.wetC.height); sc.wetA = 0;
  }
  function makeStrike(x, y, t) {
    var s = { x: x, y: y, t: t, done: false, age: 0, flash: 0, bolt: null, blobs: [], embers: [] };
    for (var j = 0; j < 6; j++) s.blobs.push({ x: rnd(-14, 14), y: rnd(-12, 12), s: rnd(26, 48) });
    for (var e = 0; e < 14; e++) s.embers.push({ x: rnd(-16, 16), y: rnd(-14, 14), ph: rnd(0, TAU) });
    return s;
  }
  function strikeStep(sc, s, at, dt) {
    var b = sc.ball;
    if (at >= s.t && !s.done) {
      s.done = true; s.age = 0; s.bolt = genBolt(s.x, s.y, sc.v.y0); burst(sc, s.x, s.y, 'spark', 22); sc.shake = Math.max(sc.shake, 4);
      for (var k = 0; k < 7; k++) sc.parts.push({ k: 'wisp', x: s.x + rnd(-8, 8), y: s.y + rnd(-8, 8), vx: rnd(-6, 6), vy: rnd(-16, -6), life: rnd(1.2, 2.2), age: 0, s: rnd(8, 14) });
    }
    if (!s.done) return;
    s.age += dt;
    s.flash = s.age < 0.1 ? 1 : s.age < 0.14 ? 0.15 : s.age < 0.2 ? 0.85 : s.age < 0.26 ? 0.2 : Math.max(0, 0.6 - (s.age - 0.26) * 4);
    if (!b.hidden && s.age < 3 && Math.hypot(b.x - s.x, b.y - s.y) < 26 && !(b.elec > 0)) {
      b.elec = 4; b.fire = 0; b.owner = b.vy < 0 ? 0 : 1; b.vx *= 1.3; b.vy *= 1.3; burst(sc, b.x, b.y, 'zap', 12);
      if (sc.script && sc.script.onCharge) sc.script.onCharge(sc, s);
    }
  }
  function strikeUnder(sc, ctx, s, k) {
    if (!s.done || k <= 0) return;
    ctx.globalAlpha = 0.85 * k;
    for (var i = 0; i < s.blobs.length; i++) { var bl = s.blobs[i]; ctx.drawImage(SPR.scorch, s.x + bl.x - bl.s / 2, s.y + bl.y - bl.s / 2, bl.s, bl.s); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    var life = Math.max(0, 1 - s.age / 4.5) * k;
    for (var j = 0; j < s.embers.length; j++) {
      var e = s.embers[j], a = life * (0.5 + 0.5 * Math.sin(sc.t * 9 + e.ph)); if (a <= 0.02) continue;
      ctx.fillStyle = 'rgba(255,' + Math.round(110 + 60 * a) + ',30,' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(s.x + e.x, s.y + e.y, 1.3, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function strikeOver(sc, ctx, s, warn) {
    if (warn) dashed(ctx, s.x, s.y, 22, 22, 0, sc.t, '#7cc4ff');
    if (s.done && s.age < 3) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(sc.t * 20);
      ctx.drawImage(SPR.glowB, s.x - 34, s.y - 34, 68, 68); ctx.globalAlpha = 1;
      arcs(ctx, s.x, s.y, 3, 26, 4, '#bfe6ff'); ctx.globalCompositeOperation = 'source-over';
    }
    if (s.flash > 0.01 && s.bolt) {
      drawBolt(ctx, s.bolt, s.flash);
      fullRect(ctx, sc.v, 'rgba(225,238,255,' + (0.42 * s.flash).toFixed(3) + ')');
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = s.flash; ctx.drawImage(SPR.glowB, s.x - 90, s.y - 90, 180, 180); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  function rainStep(sc, r, dark, dt) {
    var v = sc.v, want = Math.round(230 * dark * (v.w * v.h) / (480 * 820));
    while (r.length < want) r.push({ x: rnd(v.x0, v.x0 + v.w), y: rnd(v.y0, v.y0 + v.h), z: rnd(0, 240) });
    if (r.length > want) r.length = want;
    for (var i = 0; i < r.length; i++) {
      var d = r[i]; d.z -= 950 * dt; d.x -= 50 * dt;
      if (d.z <= 0) { if (Math.random() < 0.5) sc.parts.push({ k: 'splash', x: d.x, y: d.y, life: 0.3, age: 0, s: rnd(3, 6), layer: 'under' }); d.x = rnd(v.x0, v.x0 + v.w); d.y = rnd(v.y0, v.y0 + v.h); d.z = rnd(160, 240); }
    }
  }
  function rainDraw(sc, ctx, r, dark) {
    if (dark <= 0) return;
    fullRect(ctx, sc.v, 'rgba(4,8,22,' + (0.52 * dark).toFixed(3) + ')');
    ctx.strokeStyle = 'rgba(200,220,255,.32)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var i = 0; i < r.length; i++) { var d = r[i], y = d.y - d.z * 0.25; ctx.moveTo(d.x + 3, y - 9); ctx.lineTo(d.x, y); }
    ctx.stroke();
  }

  // ─── Les six événements (match joué seul) ─────────────────────────
  var KINDS = {
    foam: {
      init: function () { return makeFoam(rnd(70, 290), rnd(120, 520)); },
      update: function (sc, dt) { if (sc.phase === 'active' || sc.phase === 'fade') foamStep(sc, sc.p, dt, sc.k, sc.phase === 'fade'); },
      over: function (sc, ctx) { if (sc.phase === 'active' || sc.phase === 'fade') foamDraw(sc, ctx, sc.p, sc.phase === 'active' ? sc.pt : 99); },
      bounds: function (sc) { return sc.p.lobes.map(function (L) { return { x: L.x, y: L.y, rx: L.rx + 5, ry: L.ry + 5, a: L.a }; }); }
    },
    gel: {
      init: function () {
        var cx = rnd(80, 280), cy = rnd(130, 510), n = 18, rr = [], base = rnd(28, 40), i;
        for (i = 0; i < n; i++) rr.push(base * rnd(0.6, 1.3));
        for (var pass = 0; pass < 2; pass++) rr = rr.map(function (v, j) { return (rr[(j + n - 1) % n] + v * 2 + rr[(j + 1) % n]) / 4; });
        var sx = rnd(1.1, 1.7), rot = rnd(0, Math.PI), pts = [];
        for (i = 0; i < n; i++) { var a = i / n * TAU, x = Math.cos(a) * rr[i] * sx, y = Math.sin(a) * rr[i]; pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) }); }
        return { cx: cx, cy: cy, pts: pts, rot: rot, rx: base * 1.25 * sx, ry: base * 1.25, ripples: [], rip: 0, grow: 0 };
      },
      update: function (sc, dt) {
        var p = sc.p, b = sc.ball;
        p.grow = sc.phase === 'active' ? ease(sc.pt / 0.6) : sc.phase === 'fade' ? 1 - ease(sc.pt / LENS.fade) : 0;
        for (var i = 0; i < p.ripples.length; i++) p.ripples[i].age += dt;
        p.ripples = p.ripples.filter(function (r) { return r.age < 0.9; });
        if (!b.hidden && p.grow > 0.4 && inPoly(p.pts, b.x, b.y)) {
          sc.noFriction = true; var sp = Math.hypot(b.vx, b.vy), g = 1 + 1.9 * dt; b.vx *= g; b.vy *= g;
          p.rip -= dt; if (p.rip <= 0) { p.rip = 0.06; p.ripples.push({ x: b.x, y: b.y, age: 0 }); }
          if (Math.random() < 20 * dt) sc.parts.push({ k: 'glint', x: b.x + rnd(-7, 7), y: b.y + rnd(-7, 7), life: 0.4, age: 0, s: rnd(0.8, 1.6) });
          if (sp > 640 && !(b.fire > 0)) { b.fire = 4; b.owner = b.vy < 0 ? 0 : 1; burst(sc, b.x, b.y, 'spark', 14); }
        }
      },
      under: function (sc, ctx) {
        var p = sc.p; if (p.grow <= 0.01) return;
        ctx.save(); ctx.translate(p.cx, p.cy); ctx.scale(p.grow, p.grow); ctx.translate(-p.cx, -p.cy);
        ctx.save(); smoothPath(ctx, p.pts); ctx.clip();
        if (imgOk(IMAGE)) { var m = 1.08, R = p.rx + 12; ctx.globalAlpha = 0.65; ctx.drawImage(IMAGE, IX0 + (p.cx - R / m) * IK, IY0 + (p.cy - R / m) * IK, 2 * R / m * IK, 2 * R / m * IK, p.cx - R, p.cy - R, 2 * R, 2 * R); ctx.globalAlpha = 1; }
        var g = ctx.createRadialGradient(p.cx - 8, p.cy - 6, 2, p.cx, p.cy, p.rx);
        g.addColorStop(0, 'rgba(215,255,248,.4)'); g.addColorStop(0.55, 'rgba(70,215,205,.3)'); g.addColorStop(1, 'rgba(18,135,145,.48)');
        ctx.fillStyle = g; ctx.fillRect(p.cx - p.rx - 30, p.cy - p.rx - 30, 2 * p.rx + 60, 2 * p.rx + 60);
        for (var i = 0; i < p.ripples.length; i++) { var r = p.ripples[i], t = r.age / 0.9; ctx.strokeStyle = 'rgba(235,255,252,' + (0.55 * (1 - t)).toFixed(3) + ')'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(r.x, r.y, 4 + t * 26, 3 + t * 18, p.rot, 0, TAU); ctx.stroke(); }
        ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(10,70,75,.3)'; smoothPath(ctx, p.pts); ctx.stroke();
        ctx.restore();
        ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(225,255,250,.75)'; smoothPath(ctx, p.pts); ctx.stroke();
        ctx.translate(p.cx, p.cy); ctx.rotate(p.rot); var sh = Math.sin(sc.t * 1.4) * 8;
        ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.ellipse(-p.rx * 0.32 + sh, -p.ry * 0.36, p.rx * 0.26, 3, -0.12, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(p.rx * 0.22 + sh * 0.6, -p.ry * 0.48, p.rx * 0.08, 1.8, -0.12, 0, TAU); ctx.fill();
        ctx.restore();
      },
      bounds: function (sc) { var p = sc.p; return [{ x: p.cx, y: p.cy, rx: p.rx + 6, ry: p.ry + 6, a: p.rot }]; }
    },
    storm: {
      init: function () {
        var n = 1 + Math.floor(Math.random() * 3), offs = [rnd(0.2, 0.4), rnd(0.9, 1.3), rnd(1.6, 2.1)], strikes = [];
        for (var i = 0; i < n; i++) strikes.push(makeStrike(rnd(36, 324), rnd(80, 560), offs[i]));
        return { strikes: strikes, rain: [], dark: 0 };
      },
      update: function (sc, dt) {
        var p = sc.p, at = sc.phase === 'active' ? sc.pt : -1;
        p.dark = sc.phase === 'announce' ? ease(sc.pt) : sc.phase === 'active' ? 1 : sc.phase === 'fade' ? 1 - ease(sc.pt / LENS.fade) : 0;
        rainStep(sc, p.rain, p.dark, dt);
        p.strikes.forEach(function (s) { strikeStep(sc, s, at, dt); });
      },
      under: function (sc, ctx) { var k = sc.phase === 'fade' ? 1 - ease(sc.pt / LENS.fade) : sc.phase === 'calm' ? 0 : 1; sc.p.strikes.forEach(function (s) { strikeUnder(sc, ctx, s, k); }); },
      over: function (sc, ctx) {
        var p = sc.p, at = sc.phase === 'active' ? sc.pt : -1;
        rainDraw(sc, ctx, p.rain, p.dark);
        p.strikes.forEach(function (s) {
          var warn = (sc.phase === 'announce' && s.t < 0.5) || (sc.phase === 'active' && at < s.t && at > s.t - 0.9);
          if (sc.phase !== 'calm') strikeOver(sc, ctx, s, warn);
        });
      }
    },
    goals: {
      init: function () {
        var mk = function () { return { a1: rnd(28, 54), w1: rnd(1.1, 2.2), p1: rnd(0, TAU), a2: rnd(8, 18), w2: rnd(2.6, 4.4), p2: rnd(0, TAU), wv: rnd(0.6, 1.4), pv: rnd(0, TAU), tt: 0 }; };
        return { g: [mk(), mk()] };
      },
      update: function (sc, dt) {
        var p = sc.p, env = sc.phase === 'active' ? ease(sc.pt / 0.7) * (1 - ease((sc.pt - (DUR.goals - 0.8)) / 0.8)) : 0;
        for (var i = 0; i < 2; i++) {
          var g = p.g[i]; g.tt += dt * (0.25 + 1.1 * (0.5 + 0.5 * Math.sin(sc.t * g.wv + g.pv)));
          sc.goalOff[i] = clamp(g.a1 * Math.sin(g.w1 * g.tt + g.p1) + g.a2 * Math.sin(g.w2 * g.tt + g.p2), -100, 100) * env;
        }
      },
      goals: function (sc, ctx) {
        patchGoal(ctx, true); patchGoal(ctx, false);
        drawGoal(ctx, W / 2 + sc.goalOff[1], true); drawGoal(ctx, W / 2 + sc.goalOff[0], false);
        if (sc.phase === 'announce') {
          ctx.save(); ctx.strokeStyle = GOLD; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(sc.t * 16);
          [-GD - 14, H + GD + 14].forEach(function (y) { ctx.beginPath(); ctx.moveTo(W / 2 - 90, y); ctx.lineTo(W / 2 - 54, y); ctx.moveTo(W / 2 - 90, y); ctx.lineTo(W / 2 - 82, y - 6); ctx.moveTo(W / 2 - 90, y); ctx.lineTo(W / 2 - 82, y + 6); ctx.moveTo(W / 2 + 90, y); ctx.lineTo(W / 2 + 54, y); ctx.moveTo(W / 2 + 90, y); ctx.lineTo(W / 2 + 82, y - 6); ctx.moveTo(W / 2 + 90, y); ctx.lineTo(W / 2 + 82, y + 6); ctx.stroke(); });
          ctx.restore();
        }
      }
    },
    water: {
      init: function (sc) {
        var n = 2 + Math.floor(Math.random() * 3), sp = [], tries = 0;
        while (sp.length < n && tries < 300) {
          tries++; var x = rnd(40, 320), y = rnd(90, 550);
          if (sp.some(function (s) { return Math.hypot(s.x - x, s.y - y) < 80; })) continue;
          sp.push(makeSprinkler(x, y, rnd(0, TAU), rnd(1.0, 2.8)));
        }
        ensureWet(sc);
        return { sp: sp, drops: [] };
      },
      update: function (sc, dt) {
        var on = sc.phase === 'active';
        sc.wetA = sc.phase === 'calm' ? Math.max(0, sc.wetA - dt * 0.5) : (on || sc.phase === 'fade') ? 1 : sc.wetA;
        waterStep(sc, sc.p, dt, on);
      },
      under: function (sc, ctx) { waterUnder(sc, ctx, sc.p); },
      over: function (sc, ctx) { waterOver(sc, ctx, sc.p); },
      bounds: function (sc) { return sc.p.sp.map(function (s) { return { x: s.x, y: s.y, rx: 18, ry: 18, a: 0 }; }); }
    },
    smoke: {
      init: function (sc) {
        var v = sc.v, side = Math.floor(Math.random() * 4), from;
        var left = Math.max(v.x0 + 8, -52), right = Math.min(v.x0 + v.w - 8, 412), top = Math.max(v.y0 + 8, -80), bottom = Math.min(v.y0 + v.h - 8, 722);
        if (side === 0) from = { x: rnd(left, Math.min(-12, left + 28)), y: rnd(80, 560) };
        else if (side === 1) from = { x: rnd(Math.max(372, right - 28), right), y: rnd(80, 560) };
        else if (side === 2) from = { x: rnd(30, 330), y: rnd(top, Math.min(-20, top + 34)) };
        else from = { x: rnd(30, 330), y: rnd(Math.max(660, bottom - 34), bottom) };
        var to = { x: rnd(60, 300), y: rnd(120, 520) }, wa = rnd(0, TAU), ws = rnd(24, 52);
        return { from: from, to: to, wind: { x: Math.cos(wa) * ws, y: Math.sin(wa) * ws }, c: { x: from.x, y: from.y, z: 0, rot: 0 }, tip: { x: from.x, y: from.y }, puffs: sc.p && sc.p.puffs ? sc.p.puffs : [], acc: 0, lit: 0, landed: false, vx: 0, vy: 0 };
      },
      update: function (sc, dt) {
        var p = sc.p, c = p.c, T = 0.95;
        if (sc.phase === 'active') {
          var t = sc.pt;
          if (t < T) { var u = t / T; c.x = lerp(p.from.x, p.to.x, u); c.y = lerp(p.from.y, p.to.y, u); c.z = 480 * u * (1 - u); c.rot += dt * 14; }
          else {
            if (!p.landed) { p.landed = true; p.vx = (p.to.x - p.from.x) / T * 0.3; p.vy = (p.to.y - p.from.y) / T * 0.3; burst(sc, c.x, c.y, 'spark', 10); }
            var tt = t - T, f = Math.exp(-2.6 * dt); c.z = Math.abs(Math.sin(tt * 9)) * 14 * Math.exp(-tt * 5);
            p.vx *= f; p.vy *= f; c.x += p.vx * dt; c.y += p.vy * dt; c.rot += (Math.hypot(p.vx, p.vy) / 5) * dt;
            p.lit = Math.min(1, p.lit + dt * 3);
          }
        } else if (sc.phase === 'fade') p.lit = Math.max(0, p.lit - dt * 1.2);
        else p.lit = 0;
        p.tip = { x: c.x + Math.cos(c.rot) * 8, y: c.y + Math.sin(c.rot) * 8 };
        var gust = 0.7 + 0.5 * Math.sin(sc.t * 1.3) + 0.2 * Math.sin(sc.t * 3.1);
        if (p.lit > 0.05 && sc.phase === 'active') {
          p.acc += dt * 75;
          while (p.acc > 1) { p.acc -= 1; p.puffs.push({ x: p.tip.x + rnd(-2, 2), y: p.tip.y + rnd(-2, 2), z: rnd(0, 4), vx: rnd(-10, 10), vy: rnd(-10, 10), vz: rnd(12, 24), s: rnd(5, 9), g: rnd(14, 22), life: rnd(3.6, 5.4), age: 0 }); }
          if (Math.random() < dt * 30) sc.parts.push({ k: 'spark', x: p.tip.x, y: p.tip.y, vx: rnd(-90, 90), vy: rnd(-90, 90), life: rnd(0.2, 0.4), age: 0, s: 1.4 });
        }
        for (var i = 0; i < p.puffs.length; i++) {
          var q = p.puffs[i], w = Math.min(1, q.age / 0.6); q.age += dt;
          q.x += (q.vx + p.wind.x * gust * w) * dt; q.y += (q.vy + p.wind.y * gust * w) * dt;
          q.z += q.vz * dt; q.vz *= Math.exp(-0.5 * dt); q.s += q.g * dt; q.vx *= Math.exp(-1.2 * dt); q.vy *= Math.exp(-1.2 * dt);
        }
        p.puffs = p.puffs.filter(function (q) { return q.age < q.life; });
        if (p.puffs.length > 420) p.puffs.splice(0, p.puffs.length - 420);
      },
      under: function (sc, ctx) {
        var p = sc.p, c = p.c; if (sc.phase !== 'active' && sc.phase !== 'fade') return;
        if (p.lit > 0) { var fl = 0.8 + 0.2 * Math.sin(sc.t * 37) + 0.1 * Math.sin(sc.t * 23); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(p.lit * fl, 0, 1); ctx.drawImage(SPR.redLight, p.tip.x - 80, p.tip.y - 80, 160, 160); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        ctx.globalAlpha = 0.45; ctx.drawImage(SPR.shadow, c.x - 10 + c.z * 0.3, c.y - 10 + c.z * 0.5, 20, 20); ctx.globalAlpha = 1;
      },
      over: function (sc, ctx) {
        var p = sc.p, c = p.c;
        if (sc.phase === 'active' || sc.phase === 'fade') {
          ctx.save(); ctx.translate(c.x, c.y - c.z * 0.4); ctx.rotate(c.rot); var k = 1 + c.z / 160; ctx.scale(k, k);
          var g = ctx.createLinearGradient(0, -4, 0, 4), burnt = sc.phase === 'fade';
          g.addColorStop(0, burnt ? '#7a6a6a' : '#ff4a50'); g.addColorStop(1, burnt ? '#3a3030' : '#8e0f14');
          ctx.fillStyle = g; roundRect(ctx, -8, -3.5, 16, 7, 2.5); ctx.fill(); ctx.fillStyle = '#d9d9d9'; ctx.fillRect(-8, -3.5, 2.5, 7); ctx.restore();
          if (p.lit > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(p.lit * (0.75 + 0.25 * Math.random()), 0, 1); ctx.drawImage(SPR.flame, p.tip.x - 9, p.tip.y - c.z * 0.4 - 9, 18, 18); ctx.drawImage(SPR.redLight, p.tip.x - 22, p.tip.y - c.z * 0.4 - 22, 44, 44); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        }
        for (var i = 0; i < p.puffs.length; i++) {
          var q = p.puffs[i], t = q.age / q.life, a = Math.min(1, q.age / 0.35) * Math.pow(1 - t, 1.3), x = q.x, y = q.y - q.z * 0.3, s = q.s;
          ctx.globalAlpha = clamp(a * 0.85 * (1 - t * 0.7), 0, 1); ctx.drawImage(SPR.smokeR, x - s, y - s, s * 2, s * 2);
          ctx.globalAlpha = clamp(a * 0.45 * t, 0, 1); ctx.drawImage(SPR.smoke, x - s, y - s, s * 2, s * 2);
        }
        ctx.globalAlpha = 1;
      },
      bounds: function (sc) { var p = sc.p; return [{ x: p.to.x, y: p.to.y, rx: 22, ry: 22, a: 0 }, { x: p.from.x, y: p.from.y, rx: 9, ry: 9, a: 0 }]; }
    }
  };

  // ─── Séquences des règles ─────────────────────────────────────────
  function goalSpot(top) { return { x: W / 2 + rnd(-GW / 2 + 18, GW / 2 - 18), y: top ? -GD - 4 : H + GD + 4 }; }
  function reset(sc, bx, by, vx, vy) {
    var b = sc.ball; b.x = bx; b.y = by; b.vx = vx || 0; b.vy = vy || 0; b.fire = 0; b.elec = 0; b.hop = 0; b.owner = -1; b.trail = []; b.hidden = false; b.kin = false;
    sc.pads[0].ctrl = null; sc.pads[1].ctrl = null; sc.pads[0].slow = 1; sc.pads[1].slow = 1;
    sc.banners = []; sc.tags = []; sc.s = {};
  }
  function strike(sc, p, target, speed, fire) {
    var b = sc.ball; aim(b, target.x, target.y, speed);
    if (fire) { b.fire = 4; b.owner = p.side; burst(sc, b.x, b.y, 'spark', 24); sc.parts.push({ k: 'shock', x: b.x, y: b.y, life: 0.45, age: 0 }); sc.shake = Math.max(sc.shake, 6); }
  }
  // Gardien adverse posé sur un côté, tir vers l'autre côté, réaction en retard
  function keeperAside(sc) { var sx = Math.random() < 0.5 ? -1 : 1; sc.s.side = sx; sc.pads[1].ctrl = { x: W / 2 + sx * 100, y: 86, v: 320 }; }
  function farGoal(sc) { return { x: W / 2 - sc.s.side * rnd(14, 44), y: -GD - 4 }; }
  function lateKeeper(sc, tx) { sc.pads[1].ctrl = { x: lerp(sc.pads[1].x, tx, 0.3), y: 82, v: 160 }; }
  // Le joueur rouge vient frapper le ballon par-dessous
  function rushRed(sc, v) { var b = sc.ball; sc.pads[0].ctrl = { x: b.x, y: b.y + 18, v: v || 1150 }; }

  var SCRIPTS = {
    fire: {
      cycle: 6.2,
      init: function (sc) {
        reset(sc, rnd(130, 230), 250, rnd(-50, 50), 280);
        sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 }; keeperAside(sc);
        sc.s.saved = Math.random() < 0.3;
      },
      update: function (sc) {
        var s = sc.s, b = sc.ball;
        if (!s.struck && (b.y > 410 || sc.ct > 1.8)) rushRed(sc);
        if (s.struck && sc.ct - s.at > 0.35) sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 };
        if (s.struck && s.saved && !s.done) { var tx = b.x + b.vx * ((60 - b.y) / (b.vy || -1)); sc.pads[1].ctrl = { x: clamp(tx, PR, W - PR), y: 60, v: 900 }; }
      },
      onHit: function (sc, p) {
        var s = sc.s;
        if (p.side === 0 && !s.struck) { s.struck = true; s.at = sc.ct; var g = farGoal(sc); strike(sc, p, g, 980, true); if (!s.saved) lateKeeper(sc, g.x); tag(sc, 'FRAPPE TRÈS FORTE', p.x + 40, p.y - 34, '#ffb020', 1); }
      },
      onDouse: function (sc) { if (!sc.s.done) { sc.s.done = true; banner(sc, 'ARRÊTÉE', 'Touchée par Kevin : la balle s’éteint', '#ffffff'); } },
      onGoal: function (sc, scorer, hot) { sc.s.done = true; if (hot === 'fire') { banner(sc, 'BUT EN FEU', '+1 · TOI 3 – 2', '#ffb020', { glow: SPR.glowO }); confetti(sc, 30); } else banner(sc, 'BUT !', 'TOI 3 – 2'); }
    },

    elec: {
      cycle: 7.4,
      init: function (sc) {
        reset(sc, rnd(120, 240), 440, rnd(-40, 40), 110);
        sc.s.st = makeStrike(rnd(110, 250), rnd(250, 320), 0.9); sc.s.rain = [];
        sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 }; keeperAside(sc);
      },
      update: function (sc, dt) {
        var s = sc.s, b = sc.ball;
        s.dark = sc.ct < 0.8 ? ease(sc.ct / 0.8) : sc.ct > sc.script.cycle - 1 ? 1 - ease((sc.ct - (sc.script.cycle - 1)) / 0.8) : 1;
        rainStep(sc, s.rain, s.dark, dt);
        strikeStep(sc, s.st, sc.ct, dt);
        if (!s.struck && sc.ct > 1.5) rushRed(sc);
        if (s.struck && sc.ct - s.at > 0.35) sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 };
        if (s.struck && !s.charged && b.y < s.st.y - 40) { s.charged = true; }
      },
      onHit: function (sc, p) { var s = sc.s; if (p.side === 0 && !s.struck) { s.struck = true; s.at = sc.ct; strike(sc, p, { x: s.st.x, y: s.st.y }, 620, false); } },
      onCharge: function (sc) { var s = sc.s; if (s.boost) return; s.boost = true; var g = farGoal(sc); aim(sc.ball, g.x, g.y, 980); lateKeeper(sc, g.x); tag(sc, 'CHARGÉE', s.st.x + 44, s.st.y - 26, '#9fd4ff', 1); },
      onDouse: function (sc) { if (!sc.s.done) { sc.s.done = true; banner(sc, 'ARRÊTÉE', 'La charge disparaît', '#ffffff'); } },
      onGoal: function (sc, scorer, hot) { sc.s.done = true; banner(sc, hot === 'elec' ? 'BUT ÉLECTRIQUE' : 'BUT !', hot === 'elec' ? '+2 · TOI 4 – 2' : 'TOI 3 – 2', hot === 'elec' ? '#9fd4ff' : '#ffffff', { glow: hot === 'elec' ? SPR.glowB : null, size: 52 }); },
      under: function (sc, ctx) { strikeUnder(sc, ctx, sc.s.st, 1); },
      over: function (sc, ctx) { var s = sc.s; rainDraw(sc, ctx, s.rain, s.dark); strikeOver(sc, ctx, s.st, sc.ct < s.st.t); }
    },

    penalty: {
      cycle: 7.6,
      init: function (sc) {
        reset(sc, W / 2, 112, 0, 0);
        sc.pads[1].x = W / 2; sc.pads[1].y = PR + 3; sc.pads[0].x = W / 2 + rnd(-30, 30); sc.pads[0].y = 236;
        sc.s.shotAt = rnd(2.0, 2.8); sc.s.corner = Math.random() < 0.5 ? -1 : 1; sc.s.save = Math.random() < 0.35;
        sc.ball.kin = true; whistle(sc);
        banner(sc, 'PENALTY', 'Kevin campait devant son but', GOLD, { dur: 1.3 });
      },
      update: function (sc) {
        var s = sc.s, b = sc.ball, t = sc.ct;
        if (!s.shot) {
          sc.pads[1].ctrl = { x: W / 2 + Math.sin(t * 4.2) * 28, y: PR + 3, v: 260 };
          sc.pads[0].ctrl = { x: W / 2 + s.corner * -8, y: t < 1.3 ? 236 : 162, v: 160 };
          if (t >= s.shotAt) { s.shot = true; b.kin = false; rushRed(sc, 900); }
        } else if (!s.kicked) rushRed(sc, 900);
        if (s.kicked) sc.pads[1].ctrl = { x: W / 2 + (s.save ? s.corner : -s.corner) * 44, y: PR + 3, v: 520 };
        if (s.kicked && sc.ct - s.at > 0.3) sc.pads[0].ctrl = { x: W / 2, y: 200, v: 300 };
        if (s.kicked && !s.done && b.vy > 40 && b.y < 140) { s.done = true; banner(sc, 'ARRÊTÉ !', 'Le jeu reprend', '#ffffff'); }
      },
      onHit: function (sc, p) { var s = sc.s; if (p.side === 0 && !s.kicked && s.shot) { s.kicked = true; s.at = sc.ct; strike(sc, p, { x: W / 2 + s.corner * (GW / 2 - 14), y: -GD - 4 }, 860, false); } },
      onGoal: function (sc) { sc.s.done = true; banner(sc, 'BUT !', 'TOI 2 – 1'); confetti(sc, 20); },
      over: function (sc, ctx) {
        var s = sc.s, t = sc.ct;
        if (t > 1.0 && !s.kicked) {
          ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = GOLD; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(GL, PR + 3); ctx.lineTo(GR, PR + 3); ctx.stroke(); ctx.restore();
          ring(ctx, sc.ball.x, sc.ball.y, 22, 1 - (t - 1.0) / 3, GOLD);
          pill(ctx, '3 S POUR TIRER', sc.ball.x + 72, sc.ball.y, 14, GOLD);
        }
      }
    },

    golden: {
      cycle: 8.6,
      init: function (sc) {
        reset(sc, W / 2 + rnd(-30, 30), 430, 0, 0);
        sc.pads[0].x = W / 2; sc.pads[0].y = 520; keeperAside(sc); sc.s.line = 1; sc.s.score = '4 – 4';
        banner(sc, 'BUT EN OR', 'Le prochain but gagne', GOLD, { dur: 1.5, glow: SPR.glowG }); whistle(sc);
      },
      update: function (sc, dt) {
        var s = sc.s, b = sc.ball, t = sc.ct;
        s.line = t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 0.6);
        if (t > 1.1 && t < 1.7) for (var i = 0; i < 3; i++) sc.parts.push({ k: 'glint', x: rnd(6, W - 6), y: H / 2 + rnd(-2, 2), vx: 0, vy: rnd(-30, 30), life: 0.6, age: 0, s: rnd(1, 2) });
        if (t < 1.6) { sc.pads[0].ctrl = { x: W / 2, y: 520, v: 300 }; return; }
        if (!s.struck) {
          var push = b.y > 200;
          sc.pads[0].ctrl = push ? { x: b.x + Math.sin(t * 5) * 6, y: b.y + 30, v: 300 } : { x: b.x, y: b.y + 18, v: 1100 };
          if (push && Math.hypot(b.vx, b.vy) < 60 && Math.hypot(sc.pads[0].x - b.x, sc.pads[0].y - b.y) < BR + PR + 2) { b.vy = -150; b.vx = rnd(-30, 30); }
        } else if (sc.ct - s.at > 0.3) sc.pads[0].ctrl = { x: W / 2, y: 260, v: 400 };
        sc.friction = 1.6;
      },
      onHit: function (sc, p, b) { var s = sc.s; if (p.side === 0 && !s.struck && b.y <= 205) { s.struck = true; s.at = sc.ct; sc.friction = 0.32; var g = farGoal(sc); strike(sc, p, g, 900, false); lateKeeper(sc, g.x); } },
      onGoal: function (sc, scorer) { sc.s.done = true; sc.s.score = scorer === 0 ? '5 – 4' : '4 – 5'; banner(sc, scorer === 0 ? 'VICTOIRE' : 'DÉFAITE', 'But en or · ' + sc.s.score, GOLD, { glow: SPR.glowG, dur: 3 }); confetti(sc, 60); },
      under: function (sc, ctx) {
        var s = sc.s;
        if (s.line < 1) patchImage(ctx, 0, H / 2 - 22, W, 12, 0, H / 2 - 6, 1 - s.line);
        if (s.line > 0 && sc.ct > 0.6) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = s.line * (0.6 + 0.4 * Math.sin(sc.t * 12)); ctx.fillStyle = 'rgba(235,193,94,.55)'; ctx.fillRect(0, H / 2 - 4, W, 8); ctx.restore(); }
      },
      over: function (sc, ctx) {
        var y = sc.v.y0 + 30;
        ctx.fillStyle = 'rgba(11,11,12,.82)'; roundRect(ctx, W / 2 - 120, y - 18, 240, 36, 10); ctx.fill();
        ctx.font = '800 22px ' + FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#ff3d44'; ctx.fillText('TOI', W / 2 - 106, y + 1);
        ctx.textAlign = 'center'; ctx.fillStyle = sc.s.done ? GOLD : '#ffffff'; ctx.fillText(sc.s.score, W / 2 - 22, y + 1);
        ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.fillText('KEVIN', W / 2 + 10, y + 1);
        ctx.fillStyle = GOLD; ctx.textAlign = 'right'; ctx.fillText('5:00', W / 2 + 110, y + 1);
        if (sc.ct > 1.1 && sc.ct < 2.4) pill(ctx, 'LIGNE DU MILIEU OUVERTE', W / 2, H / 2 + 26, 14, GOLD);
      }
    },

    camp: {
      cycle: 6.6,
      init: function (sc) {
        reset(sc, W / 2, 420, 0, 0); sc.ball.kin = true;
        sc.s.spot = { x: W / 2 + rnd(-60, 60), y: rnd(56, 78) }; sc.s.ph = rnd(0, TAU);
      },
      update: function (sc) {
        var s = sc.s, b = sc.ball, t = sc.ct;
        sc.pads[1].ctrl = t < 4.2 ? { x: s.spot.x + Math.sin(t * 2) * 4, y: s.spot.y, v: 300 } : { x: W / 2, y: 120, v: 300 };
        b.x = W / 2 + Math.sin(t * 1.3 + s.ph) * 90; b.y = 440 + Math.sin(t * 1.9 + s.ph) * 70;
        sc.pads[0].ctrl = { x: b.x + Math.sin(t * 3) * 10, y: b.y + 32, v: 600 };
        var inBox = Math.abs(sc.pads[1].x - W / 2) < BBW / 2 && sc.pads[1].y < BBD;
        if (inBox && s.in == null) s.in = t;
        if (!inBox) s.in = null;
        if (s.in != null && t - s.in >= 3 && !s.done) { s.done = true; whistle(sc); banner(sc, 'FAUTE', 'Penalty pour toi', GOLD, { dur: 1.8 }); }
      },
      under: function (sc, ctx) {
        var s = sc.s; if (s.in == null && !s.done) return;
        ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(sc.t * 8); ctx.fillStyle = 'rgba(235,193,94,.2)'; ctx.strokeStyle = GOLD; ctx.lineWidth = 2.4;
        ctx.fillRect(W / 2 - BBW / 2, 0, BBW, BBD); ctx.strokeRect(W / 2 - BBW / 2, 0, BBW, BBD); ctx.restore();
      },
      over: function (sc, ctx) { var s = sc.s; if (s.in != null && !s.done) ring(ctx, sc.pads[1].x, sc.pads[1].y, PR + 9, (sc.ct - s.in) / 3, GOLD); }
    },

    block: {
      cycle: 6.4,
      init: function (sc) {
        var side = Math.random() < 0.5 ? -1 : 1;
        reset(sc, side < 0 ? 120 : 240, 430, 0, 0);
        sc.s.pin = { x: side < 0 ? rnd(26, 70) : rnd(290, 334), y: H - BR };
        aim(sc.ball, sc.s.pin.x, sc.s.pin.y, 300);
        sc.friction = 0.6;
      },
      update: function (sc) {
        var s = sc.s, b = sc.ball, t = sc.ct;
        if (s.done) sc.pads[0].ctrl = { x: W / 2, y: 560, v: 300 };
        else if (b.y > H - 90) sc.pads[0].ctrl = { x: b.x, y: H - BR - (BR + PR) + 3, v: 520 };
        else sc.pads[0].ctrl = { x: W / 2, y: 548, v: 300 };
        var pinned = b.y > H - BR - 8 && Math.hypot(sc.pads[0].x - b.x, sc.pads[0].y - b.y) < BR + PR + 6;
        if (pinned && !s.done) b.vx *= 0.85;
        if (pinned && s.at == null) s.at = t;
        if (!pinned && !s.done) s.at = null;
        if (s.at != null && t - s.at >= 1.5 && !s.done) { s.done = true; whistle(sc); banner(sc, 'FAUTE', 'Penalty pour Kevin', GOLD, { dur: 1.8 }); b.vy = -260; }
      },
      over: function (sc, ctx) { var s = sc.s; if (s.at != null && !s.done) gauge(ctx, s.pin.x < W / 2 ? s.pin.x + 70 : s.pin.x - 70, H - 80, 90, (sc.ct - s.at) / 1.5, 'BALLON BLOQUÉ'); }
    },

    keep: {
      cycle: 6.8,
      init: function (sc) {
        reset(sc, W / 2, 470, 0, 0); sc.ball.kin = true; sc.s.ph = rnd(0, TAU);
        sc.keepN = (sc.keepN || 0) + 1; if (sc.keepN > 3) sc.keepN = 1;
      },
      update: function (sc) {
        var s = sc.s, b = sc.ball, t = sc.ct;
        sc.pads[1].ctrl = { x: W / 2 + Math.sin(t) * 40, y: 120, v: 300 };
        if (!s.done) { b.x = W / 2 + Math.sin(t * 1.1 + s.ph) * 110; b.y = 470 + Math.sin(t * 1.7 + s.ph) * 90; sc.pads[0].ctrl = { x: b.x + Math.sin(t * 4) * 12, y: b.y + 30, v: 700 }; }
        if (t >= 5 && !s.done) {
          s.done = true; whistle(sc);
          if (sc.keepN >= 3) banner(sc, 'PENALTY', '3e avertissement du match', GOLD, { dur: 1.7 });
          else banner(sc, 'AVERTISSEMENT ' + sc.keepN + '/3', 'Le ballon change de camp', GOLD, { dur: 1.7, size: 44 });
          b.kin = false; aim(b, W / 2, 200, 520); sc.pads[0].ctrl = { x: W / 2, y: 560, v: 300 };
        }
        if (s.done && b.y < 230) { b.vx *= 0.9; b.vy *= 0.9; }
      },
      under: function (sc, ctx) { if (!sc.s.done) { ctx.save(); ctx.fillStyle = 'rgba(235,193,94,.08)'; ctx.strokeStyle = 'rgba(235,193,94,.7)'; ctx.setLineDash([7, 6]); ctx.lineWidth = 2; ctx.fillRect(4, H / 2 + 4, W - 8, H / 2 - 8); ctx.strokeRect(4, H / 2 + 4, W - 8, H / 2 - 8); ctx.restore(); } },
      over: function (sc, ctx) {
        var t = sc.ct, n = sc.keepN;
        gauge(ctx, W / 2, H / 2 + 34, 170, t / 5, 'BALLON DANS TON CAMP · 5 S');
        for (var i = 0; i < 3; i++) { var x = W / 2 - 20 + i * 20, y = H / 2 + 66, on = i < n - 1 || (sc.s.done && i < n); ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fillStyle = on ? GOLD : 'rgba(11,11,12,.75)'; ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke(); }
      }
    },

    firewater: {
      cycle: 6.4,
      init: function (sc) {
        reset(sc, rnd(140, 220), 300, rnd(-30, 30), 300);
        var S = makeSprinkler(rnd(110, 250), rnd(220, 290), 0, 0); S.base = Math.random() < 0.5 ? -0.6 : Math.PI - 0.6 - 1.2; S.range = 1.2; S.ang = S.base; S.thr = 150;
        sc.s.w = { sp: [S], drops: [] }; ensureWet(sc); sc.wetA = 1;
        sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 }; sc.pads[1].slow = 0.6;
      },
      update: function (sc, dt) {
        var s = sc.s, b = sc.ball;
        waterStep(sc, s.w, dt, true);
        if (!s.struck && (b.y > 410 || sc.ct > 1.8)) rushRed(sc);
        if (s.struck && sc.ct - s.at > 0.35) sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 };
      },
      onHit: function (sc, p) { var s = sc.s; if (p.side === 0 && !s.struck) { s.struck = true; s.at = sc.ct; var S = s.w.sp[0]; strike(sc, p, { x: S.x + Math.cos(S.ang) * 50, y: S.y + Math.sin(S.ang) * 50 }, 900, true); } },
      onWater: function (sc, what) { if (what === 'fire' && !sc.s.out) { sc.s.out = true; tag(sc, 'ÉTEINTE', sc.ball.x + 46, sc.ball.y - 24, '#d4e6f5', 1.4); } },
      onGoal: function (sc, scorer, hot) { banner(sc, hot === 'fire' ? 'BUT EN FEU' : 'BUT !', null, hot === 'fire' ? '#ffb020' : '#ffffff'); },
      under: function (sc, ctx) { waterUnder(sc, ctx, sc.s.w); },
      over: function (sc, ctx) { waterOver(sc, ctx, sc.s.w); }
    },

    elecwater: {
      cycle: 7.4,
      init: function (sc) {
        reset(sc, rnd(140, 220), 450, rnd(-30, 30), 100);
        sc.s.st = makeStrike(rnd(140, 220), 330, 0.6);
        var S = makeSprinkler(sc.s.st.x + rnd(-30, 30), 190, 0, 0); S.base = Math.random() < 0.5 ? -0.5 : Math.PI - 0.7; S.range = 1.2; S.ang = S.base; S.thr = 150;
        sc.s.w = { sp: [S], drops: [] }; ensureWet(sc); sc.wetA = 1; sc.s.rain = [];
        sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 };
        sc.pads[1].ctrl = { x: S.x, y: 110, v: 400 };
      },
      update: function (sc, dt) {
        var s = sc.s;
        waterStep(sc, s.w, dt, true);
        s.dark = Math.min(1, sc.ct / 0.6) * 0.55;
        rainStep(sc, s.rain, s.dark, dt);
        strikeStep(sc, s.st, sc.ct, dt);
        if (!s.struck && sc.ct > 1.3) rushRed(sc);
        if (s.struck && sc.ct - s.at > 0.35) sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 };
      },
      onHit: function (sc, p) { var s = sc.s; if (p.side === 0 && !s.struck) { s.struck = true; s.at = sc.ct; strike(sc, p, { x: s.st.x, y: s.st.y }, 600, false); } },
      onCharge: function (sc) { var s = sc.s; if (s.boost) return; s.boost = true; var S = s.w.sp[0]; aim(sc.ball, S.x + Math.cos(S.ang) * 40, S.y + Math.sin(S.ang) * 40, 760); tag(sc, 'CHARGÉE', s.st.x + 44, s.st.y + 24, '#9fd4ff', 1); },
      onWater: function (sc, what) { if (what === 'elec' && !sc.s.sc) { sc.s.sc = true; tag(sc, 'COURT-CIRCUIT', sc.ball.x + 50, sc.ball.y - 26, '#ffe066', 1.4); aim(sc.ball, goalSpot(true).x, -GD - 4, 700); } },
      onGoal: function (sc, scorer, hot) { banner(sc, 'BUT !', 'Le bond a passé Kevin', '#ffffff'); },
      under: function (sc, ctx) { waterUnder(sc, ctx, sc.s.w); strikeUnder(sc, ctx, sc.s.st, 1); },
      over: function (sc, ctx) { var s = sc.s; waterOver(sc, ctx, s.w); rainDraw(sc, ctx, s.rain, s.dark); strikeOver(sc, ctx, s.st, sc.ct < s.st.t); }
    },

    firefoam: {
      cycle: 6.4,
      init: function (sc) {
        reset(sc, rnd(140, 220), 300, rnd(-30, 30), 300);
        sc.s.f = makeFoam(rnd(140, 220), rnd(210, 270));
        sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 }; keeperAside(sc);
      },
      update: function (sc, dt) {
        var s = sc.s, b = sc.ball, before = s.f.bubbles.filter(function (q) { return !q.dead; }).length;
        foamStep(sc, s.f, dt, 1, false);
        var after = s.f.bubbles.filter(function (q) { return !q.dead; }).length;
        if (before - after > 0 && b.fire > 0 && !s.tagged) { s.tagged = true; tag(sc, 'ÉVAPORÉE', b.x + 48, b.y - 24, '#ffb020', 1.3); }
        if (s.retarget && b.fire > 0 && b.y < s.f.cy - 34) { s.retarget = false; var g = farGoal(sc); aim(b, g.x, g.y, 900); lateKeeper(sc, g.x); }
        if (!s.struck && (b.y > 410 || sc.ct > 1.8)) rushRed(sc);
        if (s.struck && sc.ct - s.at > 0.35) sc.pads[0].ctrl = { x: W / 2, y: 572, v: 500 };
      },
      onHit: function (sc, p) { var s = sc.s; if (p.side === 0 && !s.struck) { s.struck = true; s.at = sc.ct; strike(sc, p, { x: s.f.cx, y: s.f.cy }, 900, true); s.retarget = true; } },
      onGoal: function (sc, scorer, hot) { banner(sc, hot === 'fire' ? 'BUT EN FEU' : 'BUT !', hot === 'fire' ? '+1 · le feu a traversé' : null, hot === 'fire' ? '#ffb020' : '#ffffff', { glow: hot === 'fire' ? SPR.glowO : null }); },
      over: function (sc, ctx) { foamDraw(sc, ctx, sc.s.f, 99); }
    }
  };

  // ─── Une scène = un terrain ───────────────────────────────────────
  function Scene(def, v) {
    this.def = def; this.v = v; this.parts = []; this.banners = []; this.tags = []; this.goalOff = [0, 0]; this.t = 0; this.slowT = 0; this.k = 0; this.shake = 0; this.flash = 0;
    this.ball = { spin: 0, trail: [] }; serve(this);
    this.pads = [{ x: W / 2, y: H - 74, vx: 0, vy: 0, side: 0 }, { x: W / 2, y: 74, vx: 0, vy: 0, side: 1 }];
    if (def.mode === 'script') { this.script = SCRIPTS[def.name]; this.ct = 0; this.s = {}; this.script.init(this); }
    else {
      this.kind = def.mode === 'multi' ? pick(Object.keys(KINDS)) : def.kind;
      this.noGoals = def.mode === 'multi';
      this.p = KINDS[this.kind].init(this); this.phase = 'calm'; this.pt = rnd(0, 0.8);
    }
  }
  Scene.prototype.reroll = function () {
    if (this.script) { this.ct = 0; this.parts = []; this.friction = 0; this.script.init(this); return; }
    if (this.def.mode === 'multi') this.kind = pick(Object.keys(KINDS));
    this.p = KINDS[this.kind].init(this); this.phase = 'announce'; this.pt = 0; this.goalOff = [0, 0];
    if (this.def.mode === 'multi') banner(this, NAMES[this.kind], 'dans 1 s', '#ffffff', { dur: 1, size: 40 });
  };
  Scene.prototype.update = function (dt) {
    this.t += dt; this.shake = Math.max(0, this.shake - dt * 18); this.flash = Math.max(0, this.flash - dt * 2.5);
    var i;
    for (i = 0; i < this.banners.length; i++) this.banners[i].age += dt;
    for (i = 0; i < this.tags.length; i++) this.tags[i].age += dt;
    this.banners = this.banners.filter(function (b) { return b.age < b.dur; });
    this.tags = this.tags.filter(function (b) { return b.age < b.dur; });
    if (this.script) {
      this.ct += dt;
      if (this.ct >= this.script.cycle) { this.ct = 0; this.parts = []; this.friction = 0; this.script.init(this); }
      this.script.update(this, dt);
    } else {
      var len = this.phase === 'active' ? DUR[this.kind] : LENS[this.phase];
      this.pt += dt;
      if (this.pt >= len) {
        this.pt = 0;
        this.phase = this.phase === 'calm' ? 'announce' : this.phase === 'announce' ? 'active' : this.phase === 'active' ? 'fade' : 'calm';
        if (this.phase === 'calm') {
          if (this.def.mode === 'multi') this.kind = pick(Object.keys(KINDS));
          this.p = KINDS[this.kind].init(this); this.goalOff = [0, 0];
        }
        if (this.phase === 'announce' && this.def.mode === 'multi') banner(this, NAMES[this.kind], 'dans 1 s', '#ffffff', { dur: 1, size: 40 });
      }
      this.k = this.phase === 'active' ? 1 : this.phase === 'fade' ? 1 - this.pt / LENS.fade : 0;
      KINDS[this.kind].update(this, dt);
    }
    physics(this, dt);
    updateParts(this, dt);
  };
  Scene.prototype.draw = function () {
    var ctx = this.ctx, d = this.dpr, v = this.v, s = this.scale, K = this.script || KINDS[this.kind];
    var sx = this.shake > 0 ? rnd(-1, 1) * this.shake : 0, sy = this.shake > 0 ? rnd(-1, 1) * this.shake : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d120f'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(d * s, 0, 0, d * s, (-v.x0 + sx) * s * d, (-v.y0 + sy) * s * d);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    drawBackground(ctx, v);
    if (K.under) K.under(this, ctx);
    if (K.goals) K.goals(this, ctx);
    drawParts(this, ctx, 'under');
    drawParts(this, ctx, 'ball');
    drawBall(ctx, this);
    drawPad(ctx, this.pads[1]); drawPad(ctx, this.pads[0]);
    if (K.over) K.over(this, ctx);
    drawParts(this, ctx, 'over');
    if (!this.script && this.phase === 'announce' && K.bounds) { var list = K.bounds(this); for (var i = 0; i < list.length; i++) { var e = list[i]; dashed(ctx, e.x, e.y, e.rx, e.ry, e.a, this.t, '#ffffff'); } }
    if (this.flash > 0) fullRect(ctx, v, 'rgba(255,255,255,' + (0.35 * this.flash).toFixed(3) + ')');
    drawBanners(this, ctx);
  };

  function mount(canvas, def, opts) {
    if (!SPR) makeSprites();
    opts = opts || {};
    var v = opts.view || { x0: -60, y0: -90, w: 480, h: 820 }, cssW = opts.cssW || 288, cssH = opts.cssH || Math.round(cssW * v.h / v.w);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    var sc = new Scene(def, v); sc.canvas = canvas; sc.ctx = canvas.getContext('2d'); sc.dpr = dpr; sc.scale = cssW / v.w;
    if (document.fonts && document.fonts.load) { try { document.fonts.load('800 40px "Barlow Condensed"'); } catch (e) { /* police par défaut */ } }
    var raf = 0, last = 0, stopped = false;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function frame(now) {
      if (stopped) return;
      var dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60; last = now;
      sc.update(dt); sc.draw();
      raf = requestAnimationFrame(frame);
    }
    if (reduce) { for (var i = 0; i < 150; i++) sc.update(1 / 60); sc.draw(); IMAGE.addEventListener('load', function () { sc.draw(); }); }
    else raf = requestAnimationFrame(frame);
    return { stop: function () { stopped = true; cancelAnimationFrame(raf); }, reroll: function () { sc.reroll(); } };
  }

  window.CoupeSim = { mount: mount };
})();
