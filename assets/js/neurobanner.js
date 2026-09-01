/* ==========================================================================
   NeuroBanner — an excitable network banner for light backgrounds.

   A field of nodes wired into a sparse planar graph. Nodes fire, enter a
   refractory period, and send impulses that travel visibly along edges to
   their neighbours, which fire in turn — so cascades ripple outward and die
   out on their own instead of smearing around the cursor.

   Two extras beyond a generic neural-net banner:
     * "nuclei" — a few deep sources that periodically emit an ascending wave
       across the whole field (small brainstem nuclei reconfiguring cortex).
     * a slow haemodynamic channel — each spike drives a double-gamma-ish
       bloom that peaks ~2s later, so the fast spike races ahead of a soft
       BOLD wash trailing behind it.

   Zero dependencies. Usage:
       const b = NeuroBanner.mount(document.getElementById('banner'), { ... });
       b.setConfig({ spacing: 40 });  b.burst();  b.destroy();
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- utils */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function smoothstep(e0, e1, x) {
    if (e1 <= e0) return x >= e1 ? 1 : 0;
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // Deterministic RNG so a given seed always rebuilds the same layout.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
  const mixRGB = (a, b, t) => [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];

  /* ------------------------------------------------------------- defaults */
  const DEFAULTS = {
    seed: 7,

    // --- field ---
    spacing: 14,        // min distance between nodes (css px)
    linkRadius: 1.85,   // max edge length, as a multiple of spacing
    longRange: 16,      // small-world shortcut edges (let waves jump)
    fadeX: 0.26,        // horizontal dissolve, as a fraction of width
    fadeY: 0.30,        // vertical dissolve — deep, so nothing reaches the edge
    nodeSize: 1.2,

    // --- dynamics ---
    fanout: 3,          // max impulses launched per spike
    pSeed: 0.95,        // propagation probability, generation 0
    pNear: 0.58,        //   ... generations 1-3
    pFar: 0.30,         //   ... beyond that
    maxGen: 26,
    refractory: 1000,   // ms a node cannot re-fire
    conduction: 200,    // impulse speed, css px/s
    lightDecay: 850,    // ms for a node's spike to fade
    edgeDecay: 650,     // ms for an edge's heat to fade

    // --- haemodynamics ---
    boldGain: 1.30,     // 0 disables the slow bloom entirely
    boldRise: 440,      // ms — time-to-peak, so the bloom lags the spike
    boldFall: 580,      // ms — kept short; the tail is what overstays
    boldRadius: 5.5,    // bloom radius, as a multiple of spacing
    // The wash spreads far wider than a node, so it hits the canvas edge long
    // before the nodes do and gets cut into a straight line. Raising the mask
    // to a power makes it fall off much faster than the field it sits under,
    // so it has faded out before it can be clipped.
    boldMaskPow: 2.4,

    // --- idle activity ---
    // The field only stirs once the cursor has been away for idleDelay ms,
    // and then fades in over idleRamp so it never snaps on.
    idleDelay: 5000,           // ms without hover before idle activity starts
    idleRamp: 2500,            // ms to fade idle activity up to full strength
    idleMs: [900, 2200],       // interval between idle bursts
    idleGen: 1,                // seed generation; higher => smaller cascades
    idlePower: 1.0,            // scales fan-out and spread probability
    nuclei: 0,                 // deep sources; 0 disables them (see README)
    nucleusMs: [4200, 8000],   // interval between ascending waves
    maxImpulses: 300,

    // --- interaction ---
    hoverRadius: 26,
    hoverEnabled: true,

    // Rest is neutral grey; everything teal is activation. The ramp runs
    // grey -> teal -> near-black teal, so a peak spike reads as ink.
    colors: {
      node:    '#b3babf',  // resting node
      edge:    '#78838b',  // resting edge (drawn at low alpha)
      hot:     '#2a94a8',  // spike colour
      bright:  '#16b3c6',  // impulse / halo colour
      core:    '#0b3d49',  // ink core at peak activation
      bold:    '#4fb3c8',  // slow haemodynamic wash
      nucleus: '#b8682e',  // deep sources (only drawn when nuclei > 0)
    },
    edgeAlpha: 0.18,
    showNuclei: true,
  };

  function mergeCfg(base, over) {
    const out = Object.assign({}, base, over || {});
    out.colors = Object.assign({}, base.colors, (over && over.colors) || {});
    return out;
  }

  /* ------------------------------------------------ poisson-disk sampling */
  // Bridson. Gives blue-noise points: evenly spaced but not gridded, so the
  // field has no clumps or voids (which is what a naive random scatter gets).
  function poisson(w, h, r, rng, k) {
    k = k || 20;
    const cell = r / Math.SQRT2;
    const gw = Math.max(1, Math.ceil(w / cell));
    const gh = Math.max(1, Math.ceil(h / cell));
    const grid = new Int32Array(gw * gh).fill(-1);
    const pts = [];
    const active = [];
    const r2 = r * r;

    function add(x, y) {
      const gx = clamp((x / cell) | 0, 0, gw - 1);
      const gy = clamp((y / cell) | 0, 0, gh - 1);
      grid[gy * gw + gx] = pts.length;
      pts.push({ x: x, y: y });
      active.push(pts.length - 1);
    }
    function free(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const gx = clamp((x / cell) | 0, 0, gw - 1);
      const gy = clamp((y / cell) | 0, 0, gh - 1);
      for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++) {
        for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
          const id = grid[yy * gw + xx];
          if (id < 0) continue;
          const q = pts[id];
          const dx = q.x - x, dy = q.y - y;
          if (dx * dx + dy * dy < r2) return false;
        }
      }
      return true;
    }

    add(rng() * w, rng() * h);
    while (active.length) {
      const ai = (rng() * active.length) | 0;
      const p = pts[active[ai]];
      let found = false;
      for (let i = 0; i < k; i++) {
        const a = rng() * Math.PI * 2;
        const d = r * (1 + rng());
        const nx = p.x + Math.cos(a) * d;
        const ny = p.y + Math.sin(a) * d;
        if (free(nx, ny)) { add(nx, ny); found = true; break; }
      }
      if (!found) active.splice(ai, 1);
    }
    return pts;
  }

  /* ------------------------------------------------------- spatial lookup */
  function buildGrid(pts, cell, w, h) {
    const gw = Math.max(1, Math.ceil(w / cell));
    const gh = Math.max(1, Math.ceil(h / cell));
    const buckets = new Array(gw * gh);
    for (let i = 0; i < buckets.length; i++) buckets[i] = [];
    for (let i = 0; i < pts.length; i++) {
      const gx = clamp((pts[i].x / cell) | 0, 0, gw - 1);
      const gy = clamp((pts[i].y / cell) | 0, 0, gh - 1);
      buckets[gy * gw + gx].push(i);
    }
    return { cell: cell, gw: gw, gh: gh, buckets: buckets };
  }

  function forEachNear(g, x, y, r, fn) {
    const x0 = clamp(((x - r) / g.cell) | 0, 0, g.gw - 1);
    const x1 = clamp(((x + r) / g.cell) | 0, 0, g.gw - 1);
    const y0 = clamp(((y - r) / g.cell) | 0, 0, g.gh - 1);
    const y1 = clamp(((y + r) / g.cell) | 0, 0, g.gh - 1);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const b = g.buckets[gy * g.gw + gx];
        for (let k = 0; k < b.length; k++) if (fn(b[k]) === false) return;
      }
    }
  }

  /* ---------------------------------------------------------- the banner  */
  function mount(canvas, userCfg) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let cfg = mergeCfg(DEFAULTS, userCfg);
    const reduceMotion = global.matchMedia
      ? global.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

    let W = 0, H = 0, dpr = 1;
    let nodes = [], edges = [], impulses = [], nucleiIdx = [], grid = null;
    let rng = mulberry32(cfg.seed);
    let statics = null, boldLayer = null, boldCtx = null, boldScale = 0.2;
    let haloSprite = null, boldSprite = null;
    let C = {};
    let mouse = { x: -1e9, y: -1e9 };
    let running = false, visible = true, destroyed = false, paused = false;
    let last = 0, nucTimer = 1200, idleTimer = 300, sinceHover = 0;
    let fps = 60, rafId = 0;

    /* -- sprites: pre-rendered radial gradients, blitted per node per frame.
          Building the gradient once and drawImage-ing it is far cheaper than
          createRadialGradient inside the draw loop. --------------------- */
    function makeSprite(rgb, stops, size) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (let i = 0; i < stops.length; i++) grad.addColorStop(stops[i][0], rgba(rgb, stops[i][1]));
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      return c;
    }

    function refreshColors() {
      C = {};
      for (const k in cfg.colors) C[k] = hex2rgb(cfg.colors[k]);
      haloSprite = makeSprite(C.bright, [[0, 0.55], [0.4, 0.22], [1, 0]], 96);
      boldSprite = makeSprite(C.bold, [[0, 0.45], [0.45, 0.16], [1, 0]], 96);
    }

    /* ------------------------------------------------------------ masking */
    function maskAt(x, y) {
      const u = x / W, v = y / H;
      const mx = smoothstep(0, cfg.fadeX, u) * smoothstep(0, cfg.fadeX, 1 - u);
      const my = smoothstep(0, cfg.fadeY, v) * smoothstep(0, cfg.fadeY, 1 - v);
      return mx * my;
    }

    /* -------------------------------------------------------------- build */
    function build() {
      rng = mulberry32(cfg.seed);
      nodes = []; edges = []; impulses = []; nucleiIdx = [];
      if (W < 2 || H < 2) return;

      const pts = poisson(W, H, cfg.spacing, rng);
      for (let i = 0; i < pts.length; i++) {
        const m = maskAt(pts[i].x, pts[i].y);
        if (m < 0.05) continue;   // outside the dissolve — drop entirely
        nodes.push({
          x: pts[i].x, y: pts[i].y, m: m,
          r: cfg.nodeSize * (0.85 + rng() * 0.5),
          light: 0, refr: 0, b1: 0, b2: 0, nuc: false, nbrs: [],
        });
      }
      if (!nodes.length) return;

      const maxEdge = cfg.spacing * cfg.linkRadius;
      grid = buildGrid(nodes, Math.max(8, maxEdge), W, H);

      // Gabriel graph: keep edge (i,j) only if no third node sits inside the
      // circle having ij as its diameter. Planar, sparse (~4 neighbours),
      // no crossings — reads as a connectome rather than a wireframe blanket.
      const seen = new Set();
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        forEachNear(grid, a.x, a.y, maxEdge, function (j) {
          if (j <= i) return;
          const b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const len2 = dx * dx + dy * dy;
          if (len2 > maxEdge * maxEdge) return;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, rr = len2 / 4;
          let ok = true;
          forEachNear(grid, mx, my, Math.sqrt(rr), function (k) {
            if (k === i || k === j) return;
            const c = nodes[k];
            const ex = c.x - mx, ey = c.y - my;
            if (ex * ex + ey * ey < rr * 0.999) { ok = false; return false; }
          });
          if (!ok) return;
          const key = i + '-' + j;
          if (seen.has(key)) return;
          seen.add(key);
          addEdge(i, j, Math.sqrt(len2));
        });
      }

      // Small-world shortcuts: a handful of long links so a cascade can jump
      // clear across the banner instead of only creeping outward.
      const lo = cfg.spacing * 3, hi = cfg.spacing * 9;
      for (let n = 0, guard = 0; n < cfg.longRange && guard < cfg.longRange * 60; guard++) {
        const i = (rng() * nodes.length) | 0;
        const j = (rng() * nodes.length) | 0;
        if (i === j) continue;
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < lo || d > hi) continue;
        const key = Math.min(i, j) + '-' + Math.max(i, j);
        if (seen.has(key)) continue;
        seen.add(key);
        addEdge(i, j, d, true);
        n++;
      }

      // Nuclei: deep sources, placed low and spread across the field.
      for (let n = 0; n < cfg.nuclei; n++) {
        const tx = W * ((n + 0.62) / (cfg.nuclei + 0.25));
        const ty = H * 0.66;
        const idx = nearest(tx, ty, Math.max(W, H));
        if (idx >= 0 && nucleiIdx.indexOf(idx) < 0) {
          nodes[idx].nuc = true;
          nodes[idx].r = cfg.nodeSize * 1.9;
          nucleiIdx.push(idx);
        }
      }

      buildStatic();
    }

    function addEdge(i, j, len, long) {
      const e = {
        ia: i, ib: j, len: len, hot: 0, long: !!long,
        m: Math.min(nodes[i].m, nodes[j].m),
      };
      edges.push(e);
      nodes[i].nbrs.push({ e: e, to: j });
      nodes[j].nbrs.push({ e: e, to: i });
    }

    /* -- the resting graph never moves, so draw it once and blit it. ----- */
    function buildStatic() {
      statics = document.createElement('canvas');
      statics.width = Math.max(1, Math.round(W * dpr));
      statics.height = Math.max(1, Math.round(H * dpr));
      const s = statics.getContext('2d');
      s.setTransform(dpr, 0, 0, dpr, 0, 0);

      s.lineWidth = 1;
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i], a = nodes[e.ia], b = nodes[e.ib];
        s.strokeStyle = rgba(C.edge, cfg.edgeAlpha * e.m * (e.long ? 0.55 : 1));
        s.beginPath(); s.moveTo(a.x, a.y); s.lineTo(b.x, b.y); s.stroke();
      }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.nuc && cfg.showNuclei) {
          s.fillStyle = rgba(C.nucleus, 0.85 * n.m);
          s.beginPath(); s.arc(n.x, n.y, n.r, 0, 6.2832); s.fill();
          s.strokeStyle = rgba(C.nucleus, 0.30 * n.m);
          s.lineWidth = 1;
          s.beginPath(); s.arc(n.x, n.y, n.r + 5, 0, 6.2832); s.stroke();
        } else {
          s.fillStyle = rgba(C.node, 0.95 * n.m);
          s.beginPath(); s.arc(n.x, n.y, n.r, 0, 6.2832); s.fill();
        }
      }

      // Low-res buffer for the haemodynamic wash. Upscaling a 1/5-size
      // canvas is a free blur, and keeps the bloom cheap.
      boldLayer = document.createElement('canvas');
      boldLayer.width = Math.max(1, Math.round(W * boldScale));
      boldLayer.height = Math.max(1, Math.round(H * boldScale));
      boldCtx = boldLayer.getContext('2d');
    }

    /* ------------------------------------------------------------ queries */
    function nearest(x, y, maxD) {
      let best = -1, bd = maxD * maxD;
      if (grid) {
        forEachNear(grid, x, y, maxD, function (i) {
          const n = nodes[i];
          const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
          if (d < bd) { bd = d; best = i; }
        });
      }
      if (best < 0) {  // fall back to a full scan (used when placing nuclei)
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
          if (d < bd) { bd = d; best = i; }
        }
      }
      return best;
    }

    /* ------------------------------------------------------------- firing */
    function fire(i, from, gen, power) {
      const n = nodes[i];
      if (!n || n.refr > 0) return;
      power = power || 1;
      n.light = 1;
      n.refr = cfg.refractory * (0.8 + rng() * 0.4);
      n.b1 += 1;                                  // kick the slow channel
      if (reduceMotion || gen > cfg.maxGen) return;
      if (impulses.length > cfg.maxImpulses) return;

      const cands = [];
      for (let k = 0; k < n.nbrs.length; k++) {
        const nb = n.nbrs[k];
        if (nb.to !== from && nodes[nb.to].refr <= 0) cands.push(nb);
      }
      for (let k = cands.length - 1; k > 0; k--) {   // shuffle
        const j = (rng() * (k + 1)) | 0;
        const t = cands[k]; cands[k] = cands[j]; cands[j] = t;
      }

      const cap = Math.round(cfg.fanout * power);
      const p = (gen === 0 ? cfg.pSeed : gen < 4 ? cfg.pNear : cfg.pFar) * power;
      let sent = 0;
      for (let k = 0; k < cands.length && sent < cap; k++) {
        if (rng() > p) continue;
        const nb = cands[k];
        impulses.push({
          e: nb.e,
          forward: nb.e.ia === i,
          t: 0,
          speed: cfg.conduction / Math.max(1, nb.e.len),  // fraction of edge/s
          gen: gen + 1, from: i, to: nb.to,
        });
        sent++;
      }
    }

    function burst(x, y) {
      if (!nodes.length) return;
      const i = (x === undefined)
        ? (rng() * nodes.length) | 0
        : nearest(x, y, Math.max(W, H));
      if (i >= 0) { nodes[i].refr = 0; fire(i, -1, 0, 1.3); }
    }

    /* ------------------------------------------------------------- update */
    function update(dt) {
      if (cfg.hoverEnabled && mouse.x > -1e8) {
        sinceHover = 0;
        const i = nearest(mouse.x, mouse.y, cfg.hoverRadius);
        if (i >= 0) fire(i, -1, 0);
      } else {
        sinceHover += dt;
      }

      if (!reduceMotion) {
        if (nucleiIdx.length) {
          nucTimer -= dt;
          if (nucTimer <= 0) {
            const i = nucleiIdx[(rng() * nucleiIdx.length) | 0];
            nodes[i].refr = 0;
            fire(i, -1, 0, 1.45);   // an ascending wave
            nucTimer = lerp(cfg.nucleusMs[0], cfg.nucleusMs[1], rng());
          }
        }

        // Idle stirring. Held off until the cursor has been away a while, then
        // ramped in, so the field settles after you leave rather than competing
        // with you while you are playing with it.
        const idle = clamp((sinceHover - cfg.idleDelay) / Math.max(1, cfg.idleRamp), 0, 1);
        if (idle > 0) {
          idleTimer -= dt * idle;
          if (idleTimer <= 0) {
            if (impulses.length < cfg.maxImpulses * 0.4) {
              fire((rng() * nodes.length) | 0, -1, cfg.idleGen, cfg.idlePower * idle);
            }
            idleTimer = lerp(cfg.idleMs[0], cfg.idleMs[1], rng());
          }
        }
      }

      const kr = Math.min(1, dt / cfg.boldRise);
      const kf = Math.min(1, dt / cfg.boldFall);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.refr > 0) n.refr -= dt;
        if (n.light > 0) n.light = Math.max(0, n.light - dt / cfg.lightDecay);
        if (n.b1 > 1e-4 || n.b2 > 1e-4) {          // two-stage leaky cascade
          const flow = n.b1 * kr;                   // ≈ a gamma HRF: delayed
          n.b1 -= flow;                             //   rise, slow decay
          n.b2 += flow - n.b2 * kf;
        }
      }
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.hot > 0) e.hot = Math.max(0, e.hot - dt / cfg.edgeDecay);
      }

      for (let k = impulses.length - 1; k >= 0; k--) {
        const im = impulses[k];
        im.t += im.speed * dt / 1000;
        if (im.e.hot < 0.9) im.e.hot = 0.9;
        if (im.t >= 1) { impulses.splice(k, 1); fire(im.to, im.from, im.gen); }
      }
    }

    /* --------------------------------------------------------------- draw */
    function draw() {
      ctx.clearRect(0, 0, W, H);

      // 1. slow haemodynamic wash, underneath everything
      if (cfg.boldGain > 0 && boldCtx) {
        boldCtx.clearRect(0, 0, boldLayer.width, boldLayer.height);
        let any = false;
        const R = cfg.spacing * cfg.boldRadius * boldScale;
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const a = n.b2 * cfg.boldGain * Math.pow(n.m, cfg.boldMaskPow);
          if (a < 0.02) continue;
          any = true;
          boldCtx.globalAlpha = Math.min(1, a);
          boldCtx.drawImage(boldSprite, n.x * boldScale - R, n.y * boldScale - R, R * 2, R * 2);
        }
        if (any) {
          boldCtx.globalAlpha = 1;
          ctx.drawImage(boldLayer, 0, 0, W, H);
        }
      }

      // 2. the resting graph (pre-rendered)
      if (statics) ctx.drawImage(statics, 0, 0, W, H);

      // 3. hot edges
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.hot < 0.02) continue;
        const a = nodes[e.ia], b = nodes[e.ib];
        ctx.strokeStyle = rgba(C.bright, e.hot * 0.55 * e.m);
        ctx.lineWidth = 1 + e.hot * 1.1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.lineWidth = 1;

      // 4. spiking nodes: halo, then a core that darkens toward ink
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.light < 0.02) continue;
        const L = n.light;
        const hr = (n.r + 16 * L) * 1.9;
        ctx.globalAlpha = Math.min(1, L * n.m);
        ctx.drawImage(haloSprite, n.x - hr, n.y - hr, hr * 2, hr * 2);
        ctx.globalAlpha = 1;
        const base = n.nuc && cfg.showNuclei ? C.nucleus : C.node;
        const col = L < 0.6 ? mixRGB(base, C.hot, L / 0.6)
                            : mixRGB(C.hot, C.core, (L - 0.6) / 0.4);
        ctx.fillStyle = rgba(col, Math.min(1, 0.55 + 0.45 * L) * n.m);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 1.4 * L, 0, 6.2832); ctx.fill();
      }

      // 5. impulses in transit — the light actually travelling along the wire
      for (let i = 0; i < impulses.length; i++) {
        const im = impulses[i];
        const a = nodes[im.e.ia], b = nodes[im.e.ib];
        const T = im.forward ? im.t : 1 - im.t;
        const dir = im.forward ? 1 : -1;
        const m = im.e.m;
        for (let s = 5; s >= 1; s--) {              // comet trail
          const t = clamp(T - dir * s * 0.045, 0, 1);
          const px = lerp(a.x, b.x, t), py = lerp(a.y, b.y, t);
          ctx.fillStyle = rgba(C.bright, (0.42 - s * 0.06) * m);
          ctx.beginPath(); ctx.arc(px, py, 2.6 - s * 0.32, 0, 6.2832); ctx.fill();
        }
        const px = lerp(a.x, b.x, T), py = lerp(a.y, b.y, T);
        ctx.globalAlpha = 0.9 * m;
        ctx.drawImage(haloSprite, px - 11, py - 11, 22, 22);
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgba(C.core, 0.9 * m);
        ctx.beginPath(); ctx.arc(px, py, 2.1, 0, 6.2832); ctx.fill();
      }
    }

    /* --------------------------------------------------------------- loop */
    function loop(now) {
      if (destroyed) return;
      rafId = requestAnimationFrame(loop);
      if (!running || !visible || paused) { last = now; return; }
      const dt = Math.min(50, now - last);
      last = now;
      fps = fps * 0.92 + (1000 / Math.max(1, dt)) * 0.08;
      update(dt);
      draw();
    }

    /* ------------------------------------------------------------- sizing */
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      draw();
    }

    /* ------------------------------------------------------------- events */
    function toLocal(ev) {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    const onMove = function (ev) { mouse = toLocal(ev); };
    const onLeave = function () { mouse = { x: -1e9, y: -1e9 }; };
    const onDown = function (ev) { const p = toLocal(ev); burst(p.x, p.y); };

    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);

    let rzTimer = 0;
    const onResize = function () { clearTimeout(rzTimer); rzTimer = setTimeout(resize, 120); };
    global.addEventListener('resize', onResize);

    const onVis = function () { visible = !document.hidden && running; last = performance.now(); };
    document.addEventListener('visibilitychange', onVis);

    let io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (es) {
        running = es[0].isIntersecting;
        visible = running && !document.hidden;
        last = performance.now();
      }, { threshold: 0.02 });
      io.observe(canvas);
    } else { running = true; }

    /* --------------------------------------------------------------- init */
    refreshColors();
    resize();
    running = true; visible = !document.hidden;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
    // an opening cascade, so the banner is alive on arrival
    setTimeout(function () { if (!destroyed) burst(W * 0.3, H * 0.5); }, 550);

    return {
      setConfig: function (patch) {
        const needsBuild = patch && Object.keys(patch).some(function (k) {
          return ['seed','spacing','linkRadius','longRange','fadeX','fadeY',
                  'nodeSize','nuclei','showNuclei','edgeAlpha','colors'].indexOf(k) >= 0;
        });
        cfg = mergeCfg(cfg, patch);
        if (patch && patch.colors) refreshColors();
        if (needsBuild) { build(); draw(); }
        return cfg;
      },
      getConfig: function () { return JSON.parse(JSON.stringify(cfg)); },
      rebuild: function () { build(); draw(); },
      resize: resize,
      burst: burst,
      setPaused: function (p) { paused = !!p; last = performance.now(); },
      stats: function () {
        return { nodes: nodes.length, edges: edges.length,
                 impulses: impulses.length, fps: fps };
      },
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(rafId);
        clearTimeout(rzTimer);
        if (io) io.disconnect();
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('pointerdown', onDown);
        global.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        ctx.clearRect(0, 0, W, H);
      },
    };
  }

  global.NeuroBanner = { mount: mount, DEFAULTS: DEFAULTS };
})(window);
