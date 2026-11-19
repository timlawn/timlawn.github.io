/* Neuromodulatory network animation for the home page.
   Usage: NeuroModBrain.mount(canvas, { theme: 'light' | 'dark', speed }) */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------ utilities */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hex2rgb(h) {
    h = String(h).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
  const mixRGB = (a, b, t) => [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
  const rand = Math.random;

  /* ------------------------------------------------------------- anatomy */
  // Brain units, frontal pole on the left, midline sagittal view.
  const VIEW = { x: 40, y: 34, w: 940, h: 764 };
  const P_CEREBRUM = new Path2D('M 92 440 C 58 360, 66 240, 160 160 C 245 88, 380 52, 520 54 C 660 56, 790 100, 868 182 C 930 248, 962 340, 948 420 C 940 470, 905 505, 858 515 C 800 525, 730 512, 668 488 C 640 476, 610 470, 585 472 C 560 480, 545 510, 520 528 C 495 540, 455 535, 420 520 C 340 500, 250 505, 175 495 C 130 488, 105 470, 92 440 Z');
  const P_CEREBELLUM = new Path2D('M 690 540 C 730 512, 820 510, 880 530 C 940 552, 960 615, 930 665 C 898 718, 805 735, 740 712 C 698 698, 676 660, 676 615 C 676 585, 680 556, 690 540 Z');
  const P_STEM = new Path2D('M 548 468 C 528 495, 515 528, 524 562 C 516 600, 528 640, 560 665 C 580 680, 588 700, 592 730 L 598 792 L 646 792 L 652 730 C 656 700, 664 670, 672 640 C 680 600, 684 560, 676 520 C 670 495, 668 480, 662 468 Z');

  const testCtx = document.createElement('canvas').getContext('2d');
  const inPath = (p, x, y) => testCtx.isPointInPath(p, x, y);
  const inBrain = (x, y) => inPath(P_CEREBRUM, x, y) || inPath(P_CEREBELLUM, x, y) || inPath(P_STEM, x, y);
  const usable = inBrain;

  // Soft regions [cx, cy, rx, ry]
  const R = {
    pfc:   [200, 300, 165, 215],
    deep:  [505, 420, 205, 118],
    str:   [405, 395, 78, 50],
    thal:  [535, 405, 62, 42],
    hip:   [620, 455, 78, 30],
    amyg:  [468, 478, 40, 27],
  };
  const REGIONS = ['pfc', 'cortex', 'str', 'thal', 'hip', 'amyg', 'deep', 'cereb', 'stem'];
  function ell(x, y, e) {
    const dx = (x - e[0]) / e[2], dy = (y - e[1]) / e[3];
    return smooth(clamp((1 - Math.sqrt(dx * dx + dy * dy)) / 0.45, 0, 1));
  }

  /* -------------------------------------------------------------- systems */
  // Order: serotonin, noradrenaline, dopamine, acetylcholine.
  const SYS = [
    { key: '5ht', name: 'Serotonin', abbr: 'DRN', full: 'Dorsal raphe nucleus', pos: [630, 520], token: '--c5ht', base: 1.3, cv: 0.12, burstN: 3, burstIsi: 150, burstEvery: 38000, pauseMs: 500,
      // pfc  cortex str  thal hip  amyg deep cereb stem
      aff: [.60, .55, .75, .60, .75, .85, .45, .35, .45], label: [14, -12, 'left'] },
    { key: 'na', name: 'Noradrenaline', abbr: 'LC', full: 'Locus coeruleus', pos: [652, 588], token: '--cna', base: 1.0, cv: 0.25, burstN: 6, burstIsi: 80, burstEvery: 16000, pauseMs: 1400,
      aff: [.95, .75, .15, .65, .75, .60, .40, .30, .40], label: [14, 16, 'left'] },
    { key: 'da', name: 'Dopamine', abbr: 'VTA', full: 'Ventral tegmental area', pos: [576, 502], token: '--cda', base: 1.1, cv: 0.3, burstN: 5, burstIsi: 70, burstEvery: 14000, pauseMs: 700,
      aff: [.80, .10, 1.0, .10, .20, .65, .25, 0, .15], label: [-14, 18, 'right'] },
    { key: 'ach', name: 'Acetylcholine', abbr: 'NBM', full: 'Basal forebrain (nucleus basalis)', pos: [425, 480], token: '--cach', base: 0.9, cv: 0.35, burstN: 4, burstIsi: 110, burstEvery: 20000, pauseMs: 500,
      aff: [.80, .85, .10, .30, 1.0, .80, .30, 0, .10], label: [-12, 20, 'right'] },
  ];
  const NS = SYS.length;
  // W[target][source], same order as SYS.
  const W_DEFAULT = [
    [-0.8, 0.8, 0.0, 0.4],   // DRN  <- 5-HT, NA, DA, ACh
    [-0.4, -0.8, 0.0, 0.4],  // LC
    [-0.4, 0.4, -0.8, 0.8],  // VTA
    [-0.4, 0.8, 0.4, 0.0],   // NBM
  ];
  let W = W_DEFAULT.map(r => r.slice());
  const STEPS = [-0.8, -0.4, 0, 0.4, 0.8];

  /* --------------------------------------------------------------- params */
  const SP = 12.5;                 // node spacing, brain units
  const MAX_EDGE = SP * 1.85;
  const MOD_SPEED = 120;           // brain units / s
  const LOCAL_SPEED = 85;
  const COLL_SPEED = 95;
  const C_TAU = 1800;              // ms, transmitter clearance
  const M_TAU = 3600;              // ms, decay of rate modulation
  const LIGHT_DECAY = 1250, EDGE_DECAY = 950, REFRACTORY = 1500;
  const MAX_IMPULSES = 1400;
  // Tonic tone: background transmitter level set by each nucleus's tonic rate.
  const TONE = 0.3, TONE_TAU = 3000;
  const WAVE_POWER = 1.8;          // local events at or above this power are slow waves
  // Drift along transmitter gradients on a damped spring (5-HT repels; NA, DA, ACh attract).
  const PULL = [-1.0, 1.0, 0.6, 0.8];
  const DRIFT_FORCE = 95, DRIFT_SPRING = 7, DRIFT_DAMP = 4.2, DRIFT_MAX = SP * 0.9;

  /* -------------------------------------------------------------- the graph */
  let edgeBk = [], nodeBk = [];
  let nodes = [], edges = [], nucNode = [], dist = [], aff = [], conc = [], cortexIdx = [];
  function poisson(x0, y0, w, h, r, rng, k) {
    k = k || 20;
    const cell = r / Math.SQRT2, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const grid = new Int32Array(gw * gh).fill(-1), pts = [], active = [], r2 = r * r;
    const add = (x, y) => { grid[((y - y0) / cell | 0) * gw + ((x - x0) / cell | 0)] = pts.length; pts.push([x, y]); active.push(pts.length - 1); };
    const free = (x, y) => {
      if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
      const gx = (x - x0) / cell | 0, gy = (y - y0) / cell | 0;
      for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++)
        for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
          const id = grid[yy * gw + xx]; if (id < 0) continue;
          const dx = pts[id][0] - x, dy = pts[id][1] - y; if (dx * dx + dy * dy < r2) return false;
        }
      return true;
    };
    add(x0 + w / 2, y0 + h / 2);
    while (active.length) {
      const ai = rng() * active.length | 0, p = pts[active[ai]];
      let found = false;
      for (let i = 0; i < k; i++) {
        const a = rng() * 6.2832, d = r * (1 + rng());
        const nx = p[0] + Math.cos(a) * d, ny = p[1] + Math.sin(a) * d;
        if (free(nx, ny)) { add(nx, ny); found = true; break; }
      }
      if (!found) active.splice(ai, 1);
    }
    return pts;
  }

  function build() {
    const rng = mulberry32(11);
    const pts = poisson(VIEW.x, VIEW.y, VIEW.w, VIEW.h, SP, rng).filter(p => usable(p[0], p[1]));
    nodes = pts.map(p => ({ x: p[0], y: p[1], x0: p[0], y0: p[1], vx: 0, vy: 0, r: 0.85 + rng() * 0.5, nbrs: [], light: 0, refr: 0, tint: null, nuc: -1, px: 0, py: 0, bk: 3 }));
    // Fade nodes near the edge of the shape.
    for (const n of nodes) {
      let ok = 0, tot = 0;
      for (const rr of [SP * 1.3, SP * 2.6]) for (let a = 0; a < 12; a++) { tot++; if (usable(n.x + Math.cos(a * 0.5236) * rr, n.y + Math.sin(a * 0.5236) * rr)) ok++; }
      n.bk = clamp(Math.round(Math.pow(ok / tot, 1.5) * 3), 0, 3);
    }

    // spatial hash
    const cell = MAX_EDGE, gw = Math.ceil(1000 / cell), gh = Math.ceil(820 / cell);
    const buckets = Array.from({ length: gw * gh }, () => []);
    nodes.forEach((n, i) => buckets[clamp(n.y / cell | 0, 0, gh - 1) * gw + clamp(n.x / cell | 0, 0, gw - 1)].push(i));
    const near = (x, y, r, fn) => {
      for (let gy = clamp((y - r) / cell | 0, 0, gh - 1); gy <= clamp((y + r) / cell | 0, 0, gh - 1); gy++)
        for (let gx = clamp((x - r) / cell | 0, 0, gw - 1); gx <= clamp((x + r) / cell | 0, 0, gw - 1); gx++)
          for (const j of buckets[gy * gw + gx]) if (fn(j) === false) return;
    };
    const lineOK = (a, b) => {
      for (const t of [0.25, 0.5, 0.75]) if (!usable(lerp(a.x, b.x, t), lerp(a.y, b.y, t))) return false;
      return true;
    };

    // Gabriel graph
    edges = [];
    const addEdge = (i, j, len) => {
      const e = { a: i, b: j, len, hot: 0, rgb: null };
      edges.push(e); nodes[i].nbrs.push({ e, to: j }); nodes[j].nbrs.push({ e, to: i });
    };
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      near(a.x, a.y, MAX_EDGE, j => {
        if (j <= i) return;
        const b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
        if (len2 > MAX_EDGE * MAX_EDGE) return;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, rr = len2 / 4;
        let ok = true;
        near(mx, my, Math.sqrt(rr), k => {
          if (k === i || k === j) return;
          const ex = nodes[k].x - mx, ey = nodes[k].y - my;
          if (ex * ex + ey * ey < rr * 0.999) { ok = false; return false; }
        });
        if (ok && lineOK(a, b)) addEdge(i, j, Math.sqrt(len2));
      });
    }

    // nuclei = nearest node to each anatomical position
    nucNode = SYS.map((s, k) => {
      let best = -1, bd = 1e9;
      nodes.forEach((n, i) => { const d = (n.x - s.pos[0]) ** 2 + (n.y - s.pos[1]) ** 2; if (d < bd && n.nuc < 0) { bd = d; best = i; } });
      nodes[best].nuc = k;
      return best;
    });

    // regional affinity per system
    aff = SYS.map(() => new Float32Array(nodes.length));
    cortexIdx = [];
    nodes.forEach((n, i) => {
      const inCx = inPath(P_CEREBRUM, n.x, n.y), inCb = inPath(P_CEREBELLUM, n.x, n.y);
      const w = new Array(REGIONS.length).fill(0);
      if (!inCx && inCb) w[7] = 1;
      else if (!inCx) w[8] = 1;
      else {
        const deep = ell(n.x, n.y, R.deep), pfc = ell(n.x, n.y, R.pfc);
        const str = ell(n.x, n.y, R.str), thal = ell(n.x, n.y, R.thal), hip = ell(n.x, n.y, R.hip), amyg = ell(n.x, n.y, R.amyg);
        const sub = Math.max(str, thal, hip, amyg);
        w[0] = pfc * (1 - deep); w[1] = (1 - pfc) * (1 - deep);
        w[2] = str; w[3] = thal; w[4] = hip; w[5] = amyg; w[6] = deep * (1 - sub);
        if (deep < 0.5) cortexIdx.push(i);
      }
      if (inCb) cortexIdx.push(i);
      const sw = w.reduce((a, b) => a + b, 0) || 1;
      SYS.forEach((s, k) => { let v = 0; for (let r = 0; r < w.length; r++) v += w[r] * s.aff[r]; aff[k][i] = v / sw; });
    });

    // hop distance from each nucleus (outward routing + collateral targeting)
    dist = nucNode.map(src => {
      const d = new Int32Array(nodes.length).fill(1 << 30), q = [src]; d[src] = 0;
      for (let h = 0; h < q.length; h++) { const i = q[h]; for (const nb of nodes[i].nbrs) if (d[nb.to] > d[i] + 1) { d[nb.to] = d[i] + 1; q.push(nb.to); } }
      return d;
    });
    conc = SYS.map(() => new Float32Array(nodes.length));
    edgeBk = [[], [], [], []]; nodeBk = [[], [], [], []];
    for (const e of edges) edgeBk[Math.min(nodes[e.a].bk, nodes[e.b].bk)].push(e);
    for (const n of nodes) nodeBk[n.bk].push(n);
    buildTargets();
    buildBundles();
  }

  /* ---------------------------------------------------------- simulation */
  let impulses = [];
  const nucState = SYS.map(() => ({ on: true, m: 0, burstLeft: 0, burstT: 0, pauseT: 0, next: rand() * 900, since: 2500 + rand() * 3000, pulse: 0, shown: 1, level: 1, tone: 0.8 }));
  let interactOn = true, localOn = true, moveOn = true, speed = 1.15;
  let mouse = null, localTimer = 200, syncLevel = 0.2, frontalIdx = null;

  function launch(e, from, to, props) {
    if (impulses.length > MAX_IMPULSES) return false;
    const speed = (props.kind === 'local' ? LOCAL_SPEED : props.kind === 'coll' ? COLL_SPEED : MOD_SPEED) / Math.max(1, e.len) * (props.sp || 1);
    impulses.push(Object.assign({ e, fwd: e.a === from, t: 0, speed, from, to }, props));
    return true;
  }

  function release(k, i, amt) {
    conc[k][i] = Math.min(1.2, conc[k][i] + amt);
    for (const nb of nodes[i].nbrs) conc[k][nb.to] = Math.min(1.2, conc[k][nb.to] + amt * 0.45);
  }

  // Fibres follow the shortest path to a target drawn from the affinity map, then arborise.
  const bfsCache = new Map();
  function bfsFrom(src) {
    let d = bfsCache.get(src);
    if (d) return d;
    d = new Int32Array(nodes.length).fill(1 << 30);
    const q = [src]; d[src] = 0;
    for (let h = 0; h < q.length; h++) { const i = q[h]; for (const nb of nodes[i].nbrs) if (d[nb.to] > d[i] + 1) { d[nb.to] = d[i] + 1; q.push(nb.to); } }
    bfsCache.set(src, d);
    return d;
  }
  let targetCdf = [];
  function buildTargets() {
    targetCdf = SYS.map((s, k) => {
      const idx = [], cum = []; let tot = 0;
      for (let i = 0; i < nodes.length; i++) {
        if (dist[k][i] < 12 || nodes[i].nuc >= 0) continue;
        const w = Math.pow(aff[k][i], 3);
        if (w < 1e-4) continue;
        tot += w; idx.push(i); cum.push(tot);
      }
      return { idx, cum, tot };
    });
  }
  function sampleTarget(k, rng) {
    const t = targetCdf[k], r = (rng || rand)() * t.tot;
    let lo = 0, hi = t.cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (t.cum[mid] < r) lo = mid + 1; else hi = mid; }
    return t.idx[lo];
  }
  function pickNbrs(k, i, count, exclude, ok) {
    const cands = [];
    let total = 0;
    for (const nb of nodes[i].nbrs) {
      if (nb.to === exclude || nodes[nb.to].nuc >= 0 || !ok(nb.to)) continue;
      const w = Math.pow(0.15 + aff[k][nb.to], 2);
      cands.push([nb, w]); total += w;
    }
    const out = [];
    while (out.length < count && cands.length) {
      let r = rand() * total, idx = 0;
      for (; idx < cands.length - 1; idx++) { r -= cands[idx][1]; if (r <= 0) break; }
      total -= cands[idx][1];
      out.push(cands.splice(idx, 1)[0][0]);
    }
    return out;
  }

  function flash(i, rgb, amount) {
    const n = nodes[i];
    if (amount >= n.light) n.tint = rgb;
    n.light = Math.max(n.light, amount);
  }

  // Tonic firing is a near-regular pacemaker (cv = interval jitter). Bursts are
  // followed by a pause; excitation raises burst probability.
  function gauss() { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  function tonicInterval(k) {
    const s = SYS[k], st = nucState[k];
    return 1000 / (s.base * st.level * Math.exp(clamp(st.m, -3, 1.6))) * Math.max(0.35, 1 + s.cv * gauss());
  }
  function startBurst(k) {
    const st = nucState[k];
    if (!st.on || st.burstLeft > 0) return;
    st.burstLeft = SYS[k].burstN; st.burstT = 0; st.since = 0; st.pauseT = 0;
  }

  function spikeNucleus(k, phasic) {
    const src = nucNode[k], st = nucState[k];
    flash(src, COL.sys[k], phasic ? 1 : 0.6);
    st.pulse = phasic ? 1 : Math.max(st.pulse, 0.5);
    if (interactOn) st.m += W[k][k] * (phasic ? 0.12 : 0.1);
    if (phasic) {
      // random subset of pathways per burst spike
      let sent = 0;
      for (const path of bundles[k]) if (rand() < 0.55) { sendPath(k, path, true); sent++; }
      if (!sent) sendPath(k, bundles[k][rand() * bundles[k].length | 0], true);
    }
    else if (rand() < 0.6) sendPath(k, bundles[k][rand() * bundles[k].length | 0], false);
    if (!interactOn) return;
    const pc = phasic ? 0.6 : 0.2;
    for (let j = 0; j < NS; j++) {
      if (j === k || W[j][k] === 0 || rand() > pc) continue;
      stepToward(k, j, src, -1);
    }
  }

  function stepToward(k, j, i, from) {
    const d = dist[j], cands = nodes[i].nbrs.filter(nb => d[nb.to] < d[i]);
    if (!cands.length) return;
    const nb = cands[rand() * cands.length | 0];
    launch(nb.e, i, nb.to, { kind: 'coll', sys: k, target: j });
  }

  // Fixed pathways: N_BUNDLES routes per nucleus to well-separated targets, traced once.
  let bundles = [];
  const N_BUNDLES = 8;
  function buildBundles() {
    bundles = SYS.map((s, k) => {
      const r = mulberry32(101 + k), goals = [];
      for (let guard = 0; goals.length < N_BUNDLES && guard < 600; guard++) {
        const g = sampleTarget(k, r), minSep = guard < 300 ? 120 : 70;
        if (goals.every(o => Math.hypot(nodes[o].x - nodes[g].x, nodes[o].y - nodes[g].y) > minSep)) goals.push(g);
      }
      return goals.map(g => tracePath(k, g, r)).filter(p => p && p.length > 2);
    });
  }
  function tracePath(k, goal, r) {
    const dg = bfsFrom(goal), path = [];
    let i = nucNode[k];
    for (let guard = 0; i !== goal && guard < 400; guard++) {
      const cands = []; let tot = 0;
      for (const nb of nodes[i].nbrs) {
        if (dg[nb.to] >= dg[i] || nodes[nb.to].nuc >= 0) continue;
        const w = Math.pow(0.15 + aff[k][nb.to], 2); cands.push([nb, w]); tot += w;
      }
      if (!cands.length) return null;
      let x = r() * tot, c = 0;
      for (; c < cands.length - 1; c++) { x -= cands[c][1]; if (x <= 0) break; }
      path.push(cands[c][0]); i = cands[c][0].to;
    }
    return i === goal ? path : null;
  }
  function sendPath(k, path, phasic) {
    if (!path) return;
    const ok = launch(path[0].e, nucNode[k], path[0].to, { kind: 'mod', sys: k, phase: 2, path, idx: 0, thin: !phasic, tree: { budget: phasic ? 40 : 6 }, gen: 1, sp: 0.85 + 0.3 * rand() });
    if (ok && phasic) impulses[impulses.length - 1].t = -rand() * 1.5;   // start delay
  }

  // phase 2 = travelling along a pathway, phase 1 = terminal arbor
  function arriveMod(im) {
    const k = im.sys, i = im.to, a = aff[k][i], thin = im.thin;
    flash(i, COL.sys[k], thin ? 0.25 : 0.45 + 0.3 * a);
    if (im.phase === 2) {
      release(k, i, thin ? 0.004 : 0.02 * (0.3 + a));
      const nx = im.idx + 1;
      if (nx >= im.path.length) { arbor(k, i, im.from, im.tree, im.gen, thin ? 4 : 10 + (rand() * 8 | 0), thin ? 1 : 3, thin); return; }
      // collateral branches beyond the trunk
      if (!thin && nx > 6 && im.tree.budget > 8 && rand() < 0.04 + 0.12 * a) arbor(k, i, im.from, im.tree, im.gen, 3 + (rand() * 5 | 0), 1, false);
      const step = im.path[nx];
      launch(step.e, i, step.to, { kind: 'mod', sys: k, phase: 2, path: im.path, idx: nx, thin, tree: im.tree, gen: im.gen + 1, sp: im.sp });
      return;
    }
    release(k, i, (thin ? 0.03 : 0.1) * (0.3 + a));
    arbor(k, i, im.from, im.tree, im.gen, im.left - 1, rand() < (thin ? 0.08 : 0.18 + 0.35 * a) ? 2 : 1, thin);
  }

  // Terminal release, which may trigger a local cascade (never for serotonin).
  const KICK = [0, 0.45, 0.3, 0.35];
  function terminal(k, i, a, thin) {
    release(k, i, (thin ? 0.2 : 0.42) * (0.3 + a));
    if (localOn && rand() < KICK[k] * (thin ? 0.5 : 1)) { nodes[i].refr = 0; fireLocal(i, -1, thin ? 4 : 1, thin ? 0.8 : 1); }
  }

  // terminal arbor: short branching walk, releasing as it goes
  function arbor(k, i, from, tree, gen, left, kids, thin) {
    const a = aff[k][i];
    if (left <= 0 || tree.budget <= 0 || rand() < 0.06) { terminal(k, i, a, thin); return; }
    let sent = 0;
    for (const nb of pickNbrs(k, i, kids, from, () => true)) {
      if (tree.budget-- <= 0) break;
      if (launch(nb.e, i, nb.to, { kind: 'mod', sys: k, tree, gen: gen + 1, phase: 1, left, thin })) sent++;
    }
    if (!sent) terminal(k, i, a, thin);
  }

  function arriveColl(im) {
    const j = im.target;
    if (im.to === nucNode[j]) {
      if (interactOn) nucState[j].m += W[j][im.sys] * 0.5;
      flash(im.to, COL.sys[im.sys], 0.8);
      return;
    }
    stepToward(im.sys, j, im.to, im.from);
  }

  // Local network activity, with gain and tint set by transmitter levels.
  // Effective transmitter = released + tonic tone.
  function ceff(k, i) { return conc[k][i] + TONE * nucState[k].tone * aff[k][i]; }
  function localGain(i) {
    return clamp(1 + 0.9 * ceff(1, i) + 0.6 * ceff(3, i) + 0.35 * ceff(2, i) - 0.8 * ceff(0, i), 0.25, 1.9);
  }
  function localTint(i) {
    let tot = 0, rgb = [0, 0, 0];
    for (let k = 0; k < NS; k++) { const c = conc[k][i] + 0.25 * TONE * nucState[k].tone * aff[k][i]; tot += c; for (let ch = 0; ch < 3; ch++) rgb[ch] += COL.sys[k][ch] * c; }
    if (tot < 0.05) return COL.local;
    rgb = rgb.map(v => v / tot);
    return mixRGB(COL.local, rgb, clamp(tot * 1.6, 0, 0.9));
  }
  function fireLocal(i, from, gen, power) {
    const n = nodes[i];
    if (!n || n.refr > 0 || n.nuc >= 0) return;
    n.refr = REFRACTORY * (0.8 + rand() * 0.4);
    flash(i, power >= WAVE_POWER ? COL.wave : localTint(i), power >= WAVE_POWER ? 0.8 : 0.6);
    const wave = power >= WAVE_POWER;
    if (gen > (wave ? 46 : 24)) return;
    const g = wave ? WAVE_POWER : localGain(i) * (power || 1);
    const p = wave ? (gen < 30 ? 0.62 : 0.4) : (gen === 0 ? 0.95 : gen < 4 ? 0.55 : 0.28) * g;
    const cands = n.nbrs.filter(nb => nb.to !== from && nodes[nb.to].refr <= 0);
    let sent = 0;
    for (let c = cands.length - 1; c > 0; c--) { const j = rand() * (c + 1) | 0; [cands[c], cands[j]] = [cands[j], cands[c]]; }
    for (const nb of cands) {
      if (sent >= (wave ? 2 : Math.round(3 * Math.min(g, 1.3)))) break;
      if (rand() > p) continue;
      if (launch(nb.e, i, nb.to, { kind: 'local', gen: gen + 1, rgb: wave ? COL.wave : localTint(i), sp: wave ? 0.9 : Math.sqrt(g), pw: wave ? power : 1 })) sent++;
    }
  }

  function nearestNode(x, y, maxD) {
    let best = -1, bd = maxD * maxD;
    nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }

  function burst(k) { startBurst(k); }

  function update(dt) {
    // nuclei
    const decM = Math.exp(-dt / M_TAU);
    SYS.forEach((s, k) => {
      const st = nucState[k];
      st.m *= decM;
      st.pulse *= Math.exp(-dt / 170);
      st.since += dt;
      const toneTarget = !st.on ? 0 : st.level * Math.exp(clamp(st.m, -3, 1.6)) * (st.pauseT > 0 ? 0.4 : 1);
      st.tone += (toneTarget - st.tone) * (1 - Math.exp(-dt / TONE_TAU));
      if (!st.on) return;
      if (st.burstLeft > 0) {
        st.burstT -= dt;
        if (st.burstT <= 0) {
          spikeNucleus(k, true);
          st.burstLeft--;
          st.burstT = s.burstIsi * (0.8 + 0.4 * rand());
          if (!st.burstLeft) st.pauseT = s.pauseMs * (0.8 + 0.4 * rand());
        }
        return;
      }
      if (st.pauseT > 0) { st.pauseT -= dt; if (st.pauseT <= 0) st.next = tonicInterval(k) * 0.6; return; }
      st.next -= dt;
      if (st.next <= 0) { spikeNucleus(k, false); st.next = tonicInterval(k); }
      if (st.since > 5000 && rand() < st.level * dt / s.burstEvery * Math.exp(1.4 * clamp(st.m, -2, 1.5))) startBurst(k);
    });

    // cortical state: low NA + ACh tone -> slow waves, high -> desynchronised
    syncLevel = smooth(clamp((1.15 - (nucState[1].tone + nucState[3].tone) / 2) / 0.9, 0, 1));

    // local activity
    if (localOn) {
      localTimer -= dt;
      if (localTimer <= 0) {
        if (rand() < syncLevel * 0.7) {
          if (!frontalIdx) frontalIdx = cortexIdx.filter(i => nodes[i].x0 < 300);
          const pool = rand() < 0.6 && frontalIdx.length ? frontalIdx : cortexIdx;
          const i = pool[rand() * pool.length | 0];
          nodes[i].refr = 0; fireLocal(i, -1, 0, WAVE_POWER);
        } else fireLocal(cortexIdx[rand() * cortexIdx.length | 0], -1, syncLevel < 0.5 ? 2 : 1, 1);
        localTimer = lerp(420, 1700, syncLevel) * (0.7 + 0.6 * rand());
      }
      if (mouse) { const i = nearestNode(mouse.x, mouse.y, 16); if (i >= 0) fireLocal(i, -1, 0, 1); }
    }

    // decay
    const decC = Math.exp(-dt / C_TAU);
    for (let k = 0; k < NS; k++) { const c = conc[k]; for (let i = 0; i < c.length; i++) if (c[i] > 0.001) c[i] *= decC; else c[i] = 0; }
    for (const n of nodes) {
      if (n.refr > 0) n.refr -= dt;
      if (n.light > 0) n.light = Math.max(0, n.light - dt / LIGHT_DECAY);
    }
    for (const e of edges) if (e.hot > 0) e.hot = Math.max(0, e.hot - dt / EDGE_DECAY);

    // drift
    const h = dt / 1000;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      let fx = 0, fy = 0;
      if (moveOn) {
        for (const nb of n.nbrs) {
          let g = 0;
          for (let k = 0; k < NS; k++) g += PULL[k] * (ceff(k, nb.to) - ceff(k, i));
          if (g === 0) continue;
          const o = nodes[nb.to], L = nb.e.len;
          fx += g * (o.x0 - n.x0) / L; fy += g * (o.y0 - n.y0) / L;
        }
      }
      n.vx += (DRIFT_FORCE * fx - DRIFT_SPRING * (n.x - n.x0) - DRIFT_DAMP * n.vx) * h;
      n.vy += (DRIFT_FORCE * fy - DRIFT_SPRING * (n.y - n.y0) - DRIFT_DAMP * n.vy) * h;
    }
    for (const n of nodes) {
      n.x += n.vx * h; n.y += n.vy * h;
      const dx = n.x - n.x0, dy = n.y - n.y0, d = Math.hypot(dx, dy);
      if (d > DRIFT_MAX) { n.x = n.x0 + dx / d * DRIFT_MAX; n.y = n.y0 + dy / d * DRIFT_MAX; n.vx *= 0.5; n.vy *= 0.5; }
    }

    // impulses
    for (let q = impulses.length - 1; q >= 0; q--) {
      const im = impulses[q];
      im.t += im.speed * dt / 1000;
      const rgb = im.kind === 'local' ? im.rgb : COL.sys[im.sys];
      const hv = im.kind === 'local' ? 0.45 : im.thin ? 0.3 : 0.85;
      if (im.t >= 0 && im.e.hot < hv) { im.e.hot = hv; im.e.rgb = rgb; }
      if (im.t >= 1) {
        impulses.splice(q, 1);
        if (im.kind === 'mod') arriveMod(im);
        else if (im.kind === 'coll') arriveColl(im);
        else if (localOn) fireLocal(im.to, im.from, im.gen, im.pw || 1);
      }
    }
  }

  /* ------------------------------------------------------------ rendering */
  // Palettes for the site's light (#fff) and dark (#474747) themes.
  const PALETTES = {
    light: { bg: '#ffffff', node: '#b3babf', edge: '#78838b', ink: '#33424c', local: '#9aa4ab',
             sys: ['#8a3ffc', '#e0314b', '#1f6fd6', '#0c9d76'], dark: false },
    dark:  { bg: '#474747', node: '#8d969d', edge: '#c3cacf', ink: '#f2f6f8', local: '#a9b1b7',
             sys: ['#c4a3ff', '#ff8295', '#78b6ff', '#55e0ad'], dark: true },
  };
  let canvas = null, ctx = null;
  let Wpx = 0, Hpx = 0, dpr = 1, S = 1, K = 1, OX = 0, OY = 0, washLayer = null, washCtx = null, sprites = [], halo = null;
  const WASH_SCALE = 0.25;
  let COL = {};

  function setTheme(t) {
    const p = typeof t === 'string' ? PALETTES[t] || PALETTES.light : t;
    COL = { bg: hex2rgb(p.bg), node: hex2rgb(p.node), edge: hex2rgb(p.edge), ink: hex2rgb(p.ink), local: hex2rgb(p.local),
            sys: p.sys.map(hex2rgb), dark: !!p.dark };
    COL.wave = mixRGB(COL.local, COL.ink, 0.45);
    sprites = COL.sys.map(c => makeSprite(c, [[0, COL.dark ? 0.3 : 0.27], [0.45, 0.1], [1, 0]]));
    halo = COL.sys.map(c => makeSprite(c, [[0, 0.6], [0.4, 0.24], [1, 0]]));
  }
  function makeSprite(rgb, stops) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d'), grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    for (const [o, a] of stops) grad.addColorStop(o, rgba(rgb, a));
    g.fillStyle = grad; g.fillRect(0, 0, 96, 96); return c;
  }

  // Fit the brain inside the canvas (contain) and centre it.
  const X = x => OX + (x - VIEW.x) * S, Y = y => OY + (y - VIEW.y) * S;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 10 || h < 10) return;
    Wpx = w; Hpx = h;
    S = Math.min(w / VIEW.w, h / VIEW.h);
    OX = (w - VIEW.w * S) / 2; OY = (h - VIEW.h * S) / 2;
    K = clamp(S * 1.1, 0.55, 1.2);
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.round(Wpx * dpr); canvas.height = Math.round(Hpx * dpr);
    washLayer = document.createElement('canvas');
    washLayer.width = Math.max(1, Math.round(Wpx * WASH_SCALE)); washLayer.height = Math.max(1, Math.round(Hpx * WASH_SCALE));
    washCtx = washLayer.getContext('2d');
    draw();
  }

  function draw() {
    if (!washCtx) return;
    for (const n of nodes) { n.px = X(n.x); n.py = Y(n.y); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = rgba(COL.bg, 1); ctx.fillRect(0, 0, Wpx, Hpx);

    // 1. transmitter wash
    washCtx.clearRect(0, 0, washLayer.width, washLayer.height);
    const Rw = SP * 3.0 * S * WASH_SCALE;
    let any = false;
    for (let k = 0; k < NS; k++) {
      const c = conc[k], sp = sprites[k];
      for (let i = 0; i < c.length; i++) {
        if (c[i] < 0.03) continue;
        any = true;
        washCtx.globalAlpha = Math.min(1, c[i] * 0.42);
        washCtx.drawImage(sp, nodes[i].px * WASH_SCALE - Rw, nodes[i].py * WASH_SCALE - Rw, Rw * 2, Rw * 2);
      }
    }
    washCtx.globalAlpha = 1;
    if (any) {
      ctx.globalCompositeOperation = COL.dark ? 'screen' : 'multiply';
      ctx.drawImage(washLayer, 0, 0, Wpx, Hpx);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 2. the network, fainter toward the edge of the shape
    ctx.lineWidth = 1;
    const ea = COL.dark ? 0.26 : 0.2;
    for (let b = 0; b < 4; b++) {
      const f = 0.3 + 0.7 * b / 3;
      ctx.strokeStyle = rgba(COL.edge, ea * f);
      ctx.beginPath();
      for (const e of edgeBk[b]) { const a = nodes[e.a], c = nodes[e.b]; ctx.moveTo(a.px, a.py); ctx.lineTo(c.px, c.py); }
      ctx.stroke();
      ctx.fillStyle = rgba(COL.node, 0.95 * f);
      ctx.beginPath();
      for (const n of nodeBk[b]) { const r = n.r * K * 1.15; ctx.moveTo(n.px + r, n.py); ctx.arc(n.px, n.py, r, 0, 6.2832); }
      ctx.fill();
    }

    // 3. nodes tinted by the local transmitter mix
    for (let i = 0; i < nodes.length; i++) {
      let tot = 0; for (let k = 0; k < NS; k++) tot += conc[k][i];
      if (tot < 0.12) continue;
      const n = nodes[i];
      ctx.fillStyle = rgba(localTint(i), Math.min(0.9, tot * 0.8));
      ctx.beginPath(); ctx.arc(n.px, n.py, n.r * K * 1.3, 0, 6.2832); ctx.fill();
    }

    // 4. hot edges
    ctx.lineCap = 'round';
    for (const e of edges) {
      if (e.hot < 0.03 || !e.rgb) continue;
      const a = nodes[e.a], b = nodes[e.b];
      ctx.strokeStyle = rgba(e.rgb, e.hot * 0.6);
      ctx.lineWidth = (0.8 + e.hot * 1.1) * K;
      ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
    }

    // 5. spiking nodes
    for (const n of nodes) {
      if (n.light < 0.03 || n.nuc >= 0 || !n.tint) continue;
      const L = n.light;
      ctx.fillStyle = rgba(n.tint, Math.min(1, 0.35 + 0.65 * L));
      ctx.beginPath(); ctx.arc(n.px, n.py, (n.r + 1.4 * L) * K, 0, 6.2832); ctx.fill();
    }

    // 6. impulses in flight
    for (const im of impulses) {
      if (im.t < 0) continue;
      const a = nodes[im.e.a], b = nodes[im.e.b];
      const T = im.fwd ? im.t : 1 - im.t, dir = im.fwd ? 1 : -1;
      const local = im.kind === 'local', rgb = local ? im.rgb : COL.sys[im.sys];
      const isWave = local && im.pw >= WAVE_POWER;
      const size = (local ? (isWave ? 0.8 : 0.65) : im.thin ? 0.65 : im.kind === 'coll' ? 0.85 : 1.1) * K, ia = local ? (isWave ? 0.8 : 0.6) : im.thin ? 0.55 : 1;
      for (let s = 4; s >= 1; s--) {
        const t = clamp(T - dir * s * 0.07, 0, 1);
        ctx.fillStyle = rgba(rgb, (0.4 - s * 0.075) * ia);
        ctx.beginPath(); ctx.arc(lerp(a.px, b.px, t), lerp(a.py, b.py, t), (2.4 - s * 0.35) * size, 0, 6.2832); ctx.fill();
      }
      const px = lerp(a.px, b.px, T), py = lerp(a.py, b.py, T);
      if (!local && !im.thin) { const h = 9 * size; ctx.globalAlpha = 0.85; ctx.drawImage(halo[im.sys], px - h, py - h, h * 2, h * 2); ctx.globalAlpha = 1; }
      ctx.fillStyle = rgba(rgb, 0.95 * ia);
      ctx.beginPath(); ctx.arc(px, py, 2 * size, 0, 6.2832); ctx.fill();
    }

    // 7. nuclei, pulsing with each spike
    SYS.forEach((s, k) => {
      const n = nodes[nucNode[k]], rgb = COL.sys[k], st = nucState[k], P = st.pulse;
      const h = (12 + 22 * P) * K;
      ctx.globalAlpha = 0.35 + 0.65 * P; ctx.drawImage(halo[k], n.px - h, n.py - h, h * 2, h * 2); ctx.globalAlpha = 1;
      ctx.fillStyle = rgba(rgb, 1);
      ctx.beginPath(); ctx.arc(n.px, n.py, (3.4 + 2.4 * P) * K, 0, 6.2832); ctx.fill();
    });
  }

  /* --------------------------------------------------------------- loop */
  const reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false, last = performance.now(), onScreen = true;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp(now - last, 0, 50); last = now;   // rAF timestamps can precede performance.now()
    if (paused || !onScreen || document.hidden) return;
    update(dt * speed); draw();
  }

  /* --------------------------------------------------------------- mount */
  // Size the canvas with CSS; the brain fits inside it.
  function mount(el, opts) {
    opts = opts || {};
    canvas = el; ctx = canvas.getContext('2d');
    if (opts.speed) speed = opts.speed;
    build();
    setTheme(opts.theme || 'light');
    new ResizeObserver(resize).observe(canvas);
    resize();

    const toBrain = ev => { const r = canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left - OX) / S + VIEW.x, y: (ev.clientY - r.top - OY) / S + VIEW.y }; };
    canvas.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse') mouse = toBrain(ev); }, { passive: true });
    canvas.addEventListener('pointerleave', () => { mouse = null; });
    canvas.addEventListener('pointerdown', ev => {
      const p = toBrain(ev);
      let hit = -1, bd = 26 * 26;
      SYS.forEach((s, k) => { const n = nodes[nucNode[k]]; const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2; if (d < bd) { bd = d; hit = k; } });
      if (hit >= 0) burst(hit);
      else { const i = nearestNode(p.x, p.y, 30); if (i >= 0) { nodes[i].refr = 0; fireLocal(i, -1, 0, 1.3); } }
    });
    if (global.IntersectionObserver) {
      new IntersectionObserver(es => { onScreen = es[0].isIntersecting; last = performance.now(); }, { threshold: 0.02 }).observe(canvas);
    }

    // warm up so the first frame is already mid-activity
    burst(1);
    for (let t = 0; t < 4500; t += 16) update(16);
    draw();
    if (!reduceMotion) requestAnimationFrame(frame);

    return {
      setTheme: t => { setTheme(t); draw(); },
      burst: k => burst(k),
      setPaused: p => { paused = !!p; last = performance.now(); },
    };
  }

  global.NeuroModBrain = { mount, systems: SYS.map(s => ({ key: s.key, name: s.name, nucleus: s.abbr })) };
})(window);
