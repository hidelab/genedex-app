/* ============================================================================
   Genedex data + compute layer
   ----------------------------------------------------------------------------
   Loads gene-list metadata (data/genedex-meta.json) and attaches gene members
   to each list, then builds indices and exposes hypergeometric / consensus /
   fingerprint / co-travel / facet-network compute helpers on window.Genedex.

   >>> SWAPPING IN REAL DATA <<<
   Gene memberships are currently SYNTHESISED (deterministic, biologically
   structured) because the per-list .txt files were not yet supplied. To use
   real data, replace `buildSyntheticMembers()` with a loader that, for each
   list `gl`, fetches `genelists/<gl>.txt` (one HGNC symbol per line, a
   GENE_SYMBOL header allowed) and returns gl -> string[]. Nothing else changes.
   ============================================================================ */
(function () {
  "use strict";

  // Idempotency guard: if the data layer has already been initialised on this
  // page, do not re-run — a second execution would replace window.Genedex with
  // a freshly-zeroed object and rebuild it asynchronously, which can surface as
  // a transient "reading 'length' of undefined" while components are rendering.
  if (window.Genedex && window.Genedex.ready) return;

  // ---- deterministic RNG ----------------------------------------------------
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // setTimeout(0) is clamped (and heavily throttled in a backgrounded frame), which
  // made long permutation runs spend most of their wall clock waiting on timers. A
  // MessageChannel round-trip yields to the event loop without that penalty.
  const __yieldChan = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
  const __yieldQueue = [];
  if (__yieldChan) __yieldChan.port1.onmessage = () => { const f = __yieldQueue.shift(); if (f) f(); };
  function yieldToUi() {
    if (!__yieldChan) return new Promise(r => setTimeout(r, 0));
    return new Promise(r => { __yieldQueue.push(r); __yieldChan.port2.postMessage(0); });
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- curated AD / neurodegeneration gene pool -----------------------------
  // Real HGNC symbols grouped by biological theme. Cell-type markers let the
  // fingerprint and network read plausibly to a domain expert.
  const HUB = ["APOE","APP","MAPT","PSEN1","PSEN2","TREM2","BIN1","CLU","PICALM","SORL1"];
  // Truly pleiotropic AD genes that legitimately show up across many programs
  // (lipid, amyloid clearance, microglial/inflammatory state). The rest of HUB
  // (PSEN2, PICALM, BIN1, SORL1, APP, MAPT, PSEN1) stay confined to their own
  // biological themes so e.g. cytokine facets never pick up amyloid/GWAS genes.
  const PLEIO = ["APOE","CLU"];
  const MARKERS = {
    "Excitatory neurons": ["SLC17A7","SATB2","RBFOX3","NRGN","CAMK2A","SLC17A6","RORB","CUX2","FEZF2","TBR1"],
    "Interneurons": ["GAD1","GAD2","SLC32A1","PVALB","SST","VIP","LAMP5","CCK","RELN","NPY"],
    "Astrocytes": ["GFAP","AQP4","ALDH1L1","SLC1A2","SLC1A3","S100B","GJA1","FGFR3","SLC39A12","GLUL"],
    "Oligodendrocytes": ["MBP","MOG","PLP1","MAG","MOBP","CNP","OLIG1","CLDN11","ASPA","ERMN"],
    "OPCs (Oligodendrocyte precursor cells)": ["PDGFRA","CSPG4","OLIG2","SOX10","VCAN","BCAN","LHFPL3","TNR"],
    "Microglia": ["CX3CR1","P2RY12","AIF1","ITGAM","CSF1R","C1QA","C1QB","C1QC","TYROBP","TMEM119"],
    "Brain immune cells": ["PTPRC","CSF1R","C1QA","ITGAM","CD68","LAPTM5","FCGR3A","MRC1"],
    "Endothelial cells": ["CLDN5","PECAM1","FLT1","VWF","CDH5","SLC2A1","A2M","ABCB1"],
    "Pericytes": ["PDGFRB","RGS5","ANPEP","KCNJ8","ABCC9","NOTCH3"],
    "SMCs (Vascular smooth muscle cells)": ["ACTA2","MYH11","TAGLN","CNN1","DES","NOTCH3"],
    "Dopaminergic neurons": ["TH","SLC6A3","NR4A2","DDC","SLC18A2","KCNJ6","CALB1"],
    "Hippocampal neurons": ["PROX1","ZBTB20","DCX","NEUROD1","CALB1","WFS1"],
    "T cells": ["CD3E","CD8A","CD2","IL7R","CCL5","GZMK","CD247"],
    "B cells": ["MS4A1","CD79A","CD79B","IGHM","CD19"],
    "Ependymal cells": ["FOXJ1","CCDC153","TMEM212","PIFO","HDC"],
    "Macrophages": ["MRC1","CD163","F13A1","LYVE1","STAB1"],
  };
  // microglia activation-state programs (DAM, inflammatory, etc.)
  const MICRO_STATE = ["TREM2","APOE","CST7","LPL","CLEC7A","ITGAX","CD9","SPP1","GPNMB","AXL","CD63","TYROBP","B2M","FTH1","APOC1","CCL3","CCL4","IL1B","TNF","CXCL10","CD83","HSPA1A","STAB1","SALL1"];
  const THEME = {
    amyloid: ["APP","BACE1","BACE2","ADAM10","ADAM17","PSEN1","PSEN2","NCSTN","APH1A","PSENEN","CLU","SORL1","ABCA7","NEP","IDE","ECE1","LRP1"],
    tau: ["MAPT","GSK3B","CDK5","MAPK1","MAPK3","PPP2CA","FYN","DYRK1A","CDK5R1","BIN1","STX1A"],
    gwas: ["BIN1","PICALM","CR1","ABCA7","CD33","MS4A6A","MS4A4A","SORL1","INPP5D","MEF2C","HLA-DRB1","PTK2B","CASS4","FERMT2","SLC24A4","ZCWPW1","CELF1","NME8","EPHA1","CD2AP","ABI3","PLCG2","ACE","ADAMTS1","IL34","SPI1","TREM2","CR1","CLNK","HS3ST1","ECHDC3","SCIMP"],
    inflammation: ["IL1B","IL6","TNF","NFKB1","TGFB1","CCL2","CXCL10","NLRP3","CASP1","TLR2","TLR4","IRF8","STAT1","C3","C4A","C1QA","CD68","NFKBIA","TNFAIP3","PTGS2","CXCL8","CCL5","IFITM3"],
    synaptic: ["SYP","SYN1","DLG4","GRIN1","GRIN2B","GRIA1","SNAP25","SYT1","HOMER1","SHANK3","NRXN1","NLGN1","GRIN2A","CAMK2A","NEFL","NEFM","SV2A","SYNGAP1","PCLO","BSN"],
    mito: ["NDUFA1","NDUFB1","SDHB","COX4I1","ATP5F1A","PGK1","LDHA","HK2","GAPDH","IDH1","MT-CO1","MT-ND1","SOD1","SOD2","PARK7","PINK1"],
    resilience: ["BDNF","NRN1","RBFOX1","VGF","CARTPT","NPTX2","NEFL","CALB1","RELN","WFS1","BCL2","FOXO3","KLOTHO","NRGN","YWHAZ","GAP43"],
    lipid: ["ABCA1","ABCA7","LRP1","LDLR","SREBF1","FASN","ACSL1","PLIN2","SOAT1","CYP46A1","ABCG1","APOC1","NPC1","TREM2","PLD3"],
    parkinson: ["SNCA","LRRK2","PARK7","PINK1","PRKN","GBA","VPS35","DJ1","UCHL1","ATP13A2","FBXO7","SYNJ1","TH","DDC"],
    proteostasis: ["HSPA1A","HSPA8","HSP90AA1","UBQLN2","SQSTM1","VCP","GRN","TARDBP","PSMD1","PSMB5","ATG5","ATG7","BECN1","MAP1LC3B"],
  };

  // assemble unique pool
  const POOL = (function () {
    const s = new Set(HUB);
    Object.values(MARKERS).forEach(a => a.forEach(g => s.add(g)));
    MICRO_STATE.forEach(g => s.add(g));
    Object.values(THEME).forEach(a => a.forEach(g => s.add(g)));
    return Array.from(s);
  })();

  // map a functional facet name -> theme keys it should draw from
  function ffThemes(name) {
    const n = name.toLowerCase();
    const t = [];
    if (/amyloid|aβ|abeta|plaque|a.?\u03b2/.test(n)) t.push("amyloid");
    if (/tau/.test(n)) t.push("tau");
    if (/resilien|cognit|resilience/.test(n)) t.push("resilience");
    if (/inflamm|cytokine|immune|microglios|astroglios|gliosis/.test(n)) t.push("inflammation");
    if (/synap|neurodegener|vulnerab|selective/.test(n)) t.push("synaptic");
    if (/parkinson|lewy|dopamin/.test(n)) t.push("parkinson");
    if (/clearance|phagocyt|uptake|bbb/.test(n)) t.push("lipid");
    if (/alzheimer|^ad$|dementia|decline|dysfunction/.test(n)) t.push("gwas", "amyloid");
    if (/neurogenesis|maturation/.test(n)) t.push("resilience");
    if (!t.length) t.push("gwas");
    return t;
  }

  // build a stable "core" gene set for a facet, split into shared/up/down
  function facetCore(key, genes, size) {
    const rng = mulberry32(hashStr("core:" + key));
    const arr = genes.slice();
    // shuffle deterministically
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    const core = arr.slice(0, Math.min(size, arr.length));
    const shared = core.filter((_, i) => i % 3 === 0);
    const up = core.filter((_, i) => i % 3 === 1);
    const down = core.filter((_, i) => i % 3 === 2);
    return { all: core, shared, up, down };
  }

  function sampleFrom(arr, rng, frac) {
    const out = [];
    for (const g of arr) if (rng() < frac) out.push(g);
    return out;
  }

  // ---- public state ---------------------------------------------------------
  const G = {
    ready: null, lists: [], universe: [], ffFacets: [], cfFacets: [],
    facetMeta: {}, geneIndex: {}, facetIndex: {}, classify: classify,
  };

  function classify(facet) {
    const f = G.resolveFacet(facet) || facet;
    if (G.facetMeta[f]) return G.facetMeta[f].type;
    // Compound, un-atomized facet name (e.g. "Alzheimer's disease and Neuritric
    // plaque load") isn't itself a key in facetMeta, which is built from the
    // atomized facets only \u2014 classify by its first atom instead.
    const atoms = String(facet).split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
    for (const a of atoms) { const ra = G.resolveFacet(a) || a; if (G.facetMeta[ra]) return G.facetMeta[ra].type; }
    return null;
  }

  // ---- synthetic membership builder ----------------------------------------
  function buildSyntheticMembers(lists) {
    // pre-build facet cores
    const ffCores = {}, cfCores = {};
    // facetPool[f] = the full set of genes biologically eligible for facet f.
    // The facet -> gene index is later restricted to this set so a gene can
    // only be attributed to a facet whose theme it actually belongs to.
    const facetPool = {};
    const ffGenePool = {};
    lists.forEach(l => l.ff.forEach(f => { ffGenePool[f] = true; }));
    Object.keys(ffGenePool).forEach(f => {
      const pool = new Set();
      ffThemes(f).forEach(t => THEME[t].forEach(g => pool.add(g)));
      PLEIO.forEach(g => pool.add(g));
      ffCores[f] = facetCore("ff:" + f, Array.from(pool), 60);
      facetPool[f] = new Set(ffCores[f].all);
    });
    const cfPoolNames = {};
    lists.forEach(l => l.cf.forEach(f => { cfPoolNames[f] = true; }));
    Object.keys(cfPoolNames).forEach(f => {
      const pool = new Set();
      // exact marker match, else microglia-state for microglia subtypes, else fuzzy
      if (MARKERS[f]) MARKERS[f].forEach(g => pool.add(g));
      if (/microglia|macrophage|dam|ham|dim/i.test(f)) MICRO_STATE.forEach(g => { if (mulberry32(hashStr(f + g))() < 0.5) pool.add(g); });
      if (/neuron/i.test(f) && !pool.size) MARKERS["Excitatory neurons"].forEach(g => pool.add(g));
      if (!pool.size) { // fuzzy: borrow nearest marker bucket
        const k = Object.keys(MARKERS).find(m => f.toLowerCase().includes(m.split(" ")[0].toLowerCase()));
        (MARKERS[k] || MARKERS["Astrocytes"]).forEach(g => pool.add(g));
      }
      cfCores[f] = facetCore("cf:" + f, Array.from(pool), 28);
      facetPool[f] = new Set(cfCores[f].all);
    });
    G.facetPool = facetPool;

    lists.forEach(l => {
      const rng = mulberry32(hashStr("members:" + l.gl));
      const set = new Set();
      const dirKey = l.dir === "Up" ? "up" : l.dir === "Down" ? "down" : "shared";
      // genes eligible for THIS list = union of its own facets' themes (+ pleio)
      const relevant = new Set();
      l.ff.forEach(f => { const c = ffCores[f]; if (c) c.all.forEach(g => relevant.add(g)); });
      l.cf.forEach(f => { const c = cfCores[f]; if (c) c.all.forEach(g => relevant.add(g)); });
      l.ff.forEach(f => {
        const c = ffCores[f]; if (!c) return;
        sampleFrom(c.shared, rng, 0.7).forEach(g => set.add(g));
        sampleFrom(c[dirKey] || c.up, rng, 0.6).forEach(g => set.add(g));
      });
      l.cf.forEach(f => {
        const c = cfCores[f]; if (!c) return;
        sampleFrom(c.shared, rng, 0.8).forEach(g => set.add(g));
        sampleFrom(c[dirKey] || c.up, rng, 0.55).forEach(g => set.add(g));
      });
      // pleiotropic hubs (APOE / CLU) appear broadly
      PLEIO.forEach(g => { if (rng() < 0.3) set.add(g); });
      // fill out to a plausible size. Padding draws from the global pool so the
      // gene universe stays full; cross-theme genes added here are NOT attributed
      // to this list's facets \u2014 the facetPool filter in buildIndices/fingerprint
      // keeps each facet's gene set biologically clean.
      const target = 18 + Math.floor(rng() * 90);
      let guard = 0;
      while (set.size < target && guard++ < 400) {
        set.add(POOL[Math.floor(rng() * POOL.length)]);
      }
      l.genes = Array.from(set).sort();
    });
    return lists;
  }

  // ---- index builders -------------------------------------------------------
  function buildIndices() {
    const uni = new Set();
    const gi = {}; // gene -> {lists:[], ff:{}, cf:{}, up:0, down:0}
    G.lists.forEach(l => {
      l.genes.forEach(g => {
        uni.add(g);
        if (!gi[g]) gi[g] = { gene: g, lists: [], ff: {}, cf: {}, up: 0, down: 0 };
        gi[g].lists.push(l.gl);
        l.ffAtoms.forEach(f => gi[g].ff[f] = (gi[g].ff[f] || 0) + 1);
        l.cfAtoms.forEach(f => gi[g].cf[f] = (gi[g].cf[f] || 0) + 1);
        if (l.dir === "Up") gi[g].up++; else if (l.dir === "Down") gi[g].down++;
      });
    });
    G.universe = Array.from(uni).sort();
    G.geneIndex = gi;

    const fi = {};
    const addFacet = (f, type) => { if (!fi[f]) fi[f] = { facet: f, type, genes: new Set(), lists: [] }; return fi[f]; };
    // a gene is attributed to a facet only if it belongs to that facet's pool,
    // so a list co-tagged with e.g. inflammation + amyloid doesn't leak amyloid
    // genes into the inflammation facet (and vice versa)
    const inPool = (f, g) => { const p = G.facetPool && G.facetPool[f]; return !p || p.has(g); };
    G.lists.forEach(l => {
      l.ffAtoms.forEach(f => { const e = addFacet(f, "ff"); l.genes.forEach(g => { if (inPool(f, g)) e.genes.add(g); }); e.lists.push(l.gl); });
      l.cfAtoms.forEach(f => { const e = addFacet(f, "cf"); l.genes.forEach(g => { if (inPool(f, g)) e.genes.add(g); }); e.lists.push(l.gl); });
    });
    // Tissue is a single per-list attribute rather than an atomized facet list, but
    // it behaves like one in the fingerprint: a column whose gene set is the union
    // of genes reported by lists from that tissue. There is no facetPool for a
    // tissue (any gene can be measured anywhere), so no pool filter applies. A
    // tissue whose name collides with an existing ff/cf facet is skipped rather
    // than merged, which would corrupt that facet's type.
    G.lists.forEach(l => {
      const t = l.tissue; if (!t) return;
      if (fi[t] && fi[t].type !== "tf") return;
      const e = addFacet(t, "tf"); l.genes.forEach(g => e.genes.add(g)); e.lists.push(l.gl);
    });
    G.facetIndex = fi;
    const ff = [], cf = [], tf = [];
    Object.values(fi).forEach(e => {
      G.facetMeta[e.facet] = { type: e.type, nLists: e.lists.length, nGenes: e.genes.size };
      (e.type === "ff" ? ff : e.type === "cf" ? cf : tf).push(e.facet);
    });
    ff.sort(); cf.sort(); tf.sort();
    G.ffFacets = ff; G.cfFacets = cf; G.tfFacets = tf;
  }

  // ---- stats: hypergeometric + BH FDR --------------------------------------
  const _lg = {};
  function logGamma(x) {
    if (_lg[x] != null) return _lg[x];
    const g = 7, c = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    let xx = x, a = c[0], t = xx + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (xx + i);
    const r = 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a) - Math.log(xx);
    _lg[x] = r; return r;
  }
  function logChoose(n, k) { if (k < 0 || k > n) return -Infinity; return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1); }
  // P(X >= k) for hypergeometric(N pop, K successes, n draws)
  function hyperSF(k, N, K, n) {
    if (k <= 0) return 1;
    const lo = k, hi = Math.min(K, n);
    const denom = logChoose(N, n);
    let sum = 0;
    for (let i = lo; i <= hi; i++) {
      const lp = logChoose(K, i) + logChoose(N - K, n - i) - denom;
      sum += Math.exp(lp);
    }
    return Math.min(1, Math.max(0, sum));
  }
  function bhFDR(pvals) {
    const idx = pvals.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
    const m = pvals.length, q = new Array(m);
    let prev = 1;
    for (let r = m - 1; r >= 0; r--) {
      const [p, i] = idx[r];
      const val = Math.min(prev, p * m / (r + 1));
      q[i] = val; prev = val;
    }
    return q;
  }

  // ---- compute API ----------------------------------------------------------
  const compute = {
    // Uppercase, trim, de-duplicate, and remap retired/alias symbols to the
    // HGNC-approved symbol used by the curated lists (G.aliases, loaded at
    // bootstrap from data/gene-aliases.json). Only aliases whose target is in
    // the curated universe are kept, so remapping never invents a miss.
    norm(genes) {
      const out = []; const seen = new Set();
      const al = G.aliases || null;
      genes.forEach(g => { let u = String(g).trim().toUpperCase(); if (u && al && al[u]) u = al[u]; if (u && !seen.has(u)) { seen.add(u); out.push(u); } });
      return out;
    },
    // Gene search enrichment across lists
    // Diagnostic companion to norm(): what the query resolved to, what was
    // remapped from an alias, and what is absent from every curated list.
    resolveInfo(inputGenes) {
      const src = Array.isArray(inputGenes) ? inputGenes : String(inputGenes || "").split(/[\s,;]+/);
      const al = G.aliases || {};
      const seen = new Set(), genes = [], remapped = [], missing = [];
      src.forEach(raw => {
        const u0 = String(raw).trim().toUpperCase(); if (!u0) return;
        const u = al[u0] || u0;
        if (u !== u0) remapped.push([u0, u]);
        if (seen.has(u)) return; seen.add(u); genes.push(u);
        if (!G.geneIndex[u]) missing.push(u0);
      });
      return { genes, remapped, missing, found: genes.filter(g => G.geneIndex[g]) };
    },
    enrich(inputGenes, opts) {
      opts = opts || {};
      const input = new Set(this.norm(inputGenes));
      const N = G.universe.length, n = input.size;
      const rows = [];
      G.lists.forEach(l => {
        if (opts.dir && opts.dir !== "All" && l.dir !== opts.dir) return;
        const ref = l.genes, K = ref.length;
        const overlap = ref.filter(g => input.has(g));
        if (overlap.length === 0 && !opts.keepEmpty) return;
        rows.push({ gl: l.gl, name: l.short, author: l.author, doi: l.doi, pmid: l.pmid, ff: l.ff, cf: l.cf, dir: l.dir,
          nInput: n, nRef: K, nOverlap: overlap.length, overlap,
          p: hyperSF(overlap.length, N, K, n) });
      });
      const q = bhFDR(rows.map(r => r.p));
      rows.forEach((r, i) => r.fdr = q[i]);
      rows.sort((a, b) => a.fdr - b.fdr || b.nOverlap - a.nOverlap);
      return { rows, nInput: n, universe: N };
    },
    // Fingerprint matrix: rows=genes, cols=facets.
    //
    // STATISTICAL MODEL
    // The counted unit is a STUDY, not a gene list (opts.unit="list" reverts to the
    // old behaviour). The corpus splits one paper into many lists — up/down, per
    // cell type, per region — so counting lists treats a single study's internal
    // splits as independent replications and inflates every p-value upward, worst
    // for exactly the popular genes and facets people look at first. Collapsing to
    // distinct PMID (then DOI, then author+title) makes the hypergeometric's
    // independence assumption approximately true instead of plainly false.
    //
    // Per cell (gene g x facet i), conditioned on the gene's own study degree:
    //   N   = studies passing the filters
    //   K   = studies containing g
    //   n_i = studies carrying facet i
    //   v   = studies where g appears under facet i
    //   p   = P(X >= v) hypergeometric upper tail
    // plus effect size (expected, fold), a Wilson interval on v/K against the
    // baseline rate n_i/N, a direction-concordance binomial over the up/down split,
    // and two fragility measures (leave-one-study-out worst p, and how many studies
    // must be dropped before p exceeds alpha).
    //
    // MULTIPLE TESTING
    // BH runs over the cells that carry an actual observation (v>0) — the tests that
    // were really performed. Cells with v=0 have p=1 by construction and carry no
    // information; padding the family with them only inflates m and costs power. The
    // family size is reported in the returned provenance so a q value is always
    // interpretable alongside the m and filter state that produced it.
    fingerprint(inputGenes, opts) {
      opts = opts || {};
      const genes = this.norm(inputGenes).filter(g => G.geneIndex[g]);
      const dir = opts.dir || "All";
      const tissues = opts.tissues && opts.tissues.length ? new Set(opts.tissues) : null;
      const types = opts.types && opts.types.length ? new Set(opts.types) : null;
      const contrasts = opts.contrasts && opts.contrasts.length ? new Set(opts.contrasts) : null;
      // cross-class list restriction: only count lists that also carry one of the
      // selected functional / cellular facets (e.g. functional fingerprint limited
      // to microglial lists).
      const reqFf = opts.restrictFf && opts.restrictFf.length ? new Set(opts.restrictFf.map(f => G.resolveFacet(f) || f)) : null;
      const reqCf = opts.restrictCf && opts.restrictCf.length ? new Set(opts.restrictCf.map(f => G.resolveFacet(f) || f)) : null;
      const ff = G.ffFacets, cf = G.cfFacets, tf = G.tfFacets || [];
      const ffIdx = {}; ff.forEach((f, i) => ffIdx[f] = i);
      const cfIdx = {}; cf.forEach((f, i) => cfIdx[f] = i);
      const tfIdx = {}; tf.forEach((f, i) => tfIdx[f] = i);
      const gset = new Set(genes);
      const unit = opts.unit === "list" ? "list" : "study";
      const sigAlpha = opts.sigAlpha || 0.05;

      // ---- collapse the filtered corpus into counting units ----
      const studyKey = (l) => l.pmid ? "P:" + l.pmid
        : l.doi ? "D:" + l.doi
        : (l.author || l.title) ? "A:" + (l.author || "") + "|" + (l.title || "")
        : "L:" + l.gl;
      const units = new Map();
      let nListsKept = 0;
      G.lists.forEach(l => {
        if (dir !== "All" && l.dir !== dir) return;
        if (tissues && !tissues.has(l.tissue)) return;
        if (types && !types.has(l.listType)) return;
        if (contrasts && !contrasts.has(l.contrast)) return;
        if (reqFf && !l.ffAtoms.some(f => reqFf.has(f))) return;
        if (reqCf && !l.cfAtoms.some(f => reqCf.has(f))) return;
        nListsKept++;
        const key = unit === "study" ? studyKey(l) : "L:" + l.gl;
        let u = units.get(key);
        if (!u) { u = { key, ff: new Set(), cf: new Set(), tf: new Set(), gene: new Map(), nLists: 0 }; units.set(key, u); }
        u.nLists++;
        l.ffAtoms.forEach(f => { const i = ffIdx[f]; if (i != null) u.ff.add(i); });
        l.cfAtoms.forEach(f => { const i = cfIdx[f]; if (i != null) u.cf.add(i); });
        // a study collapsed from lists across several regions carries all of them
        if (l.tissue != null && tfIdx[l.tissue] != null) u.tf.add(tfIdx[l.tissue]);
        const up = l.dir === "Up", dn = l.dir === "Down";
        for (const g of l.genes) {
          if (!gset.has(g)) continue;
          let e = u.gene.get(g);
          if (!e) { e = { ff: new Map(), cf: new Map(), tf: new Map() }; u.gene.set(g, e); }
          const add = (m, atoms, idxm) => atoms.forEach(f => {
            const i = idxm[f];
            if (i == null) return;
            if (G.facetPool[f] && !G.facetPool[f].has(g)) return;
            let c = m.get(i);
            if (!c) { c = { n: 0, up: 0, dn: 0 }; m.set(i, c); }
            c.n++; if (up) c.up++; else if (dn) c.dn++;
          });
          add(e.ff, l.ffAtoms, ffIdx);
          add(e.cf, l.cfAtoms, cfIdx);
          add(e.tf, l.tissue ? [l.tissue] : [], tfIdx);
        }
      });

      const unitArr = [...units.values()];
      const N = unitArr.length;
      const ffTot = new Array(ff.length).fill(0);
      const cfTot = new Array(cf.length).fill(0);
      const tfTot = new Array(tf.length).fill(0);
      const geneN = {}; genes.forEach(g => geneN[g] = 0);
      unitArr.forEach(u => {
        u.ff.forEach(i => ffTot[i]++);
        u.cf.forEach(i => cfTot[i]++);
        u.tf.forEach(i => tfTot[i]++);
        u.gene.forEach((_, g) => { if (g in geneN) geneN[g]++; });
      });

      // ---- per-gene, per-facet accumulation over units ----
      const mk = (n) => ({ n: new Array(n).fill(0), lists: new Array(n).fill(0), up: new Array(n).fill(0), dn: new Array(n).fill(0), upU: new Array(n).fill(0), dnU: new Array(n).fill(0) });
      const acc = {};
      genes.forEach(g => acc[g] = { ff: mk(ff.length), cf: mk(cf.length), tf: mk(tf.length) });
      unitArr.forEach(u => {
        u.gene.forEach((e, g) => {
          const a = acc[g]; if (!a) return;
          const roll = (m, t) => m.forEach((c, i) => {
            t.n[i]++; t.lists[i] += c.n;
            t.up[i] += c.up; t.dn[i] += c.dn;
            if (c.up > 0) t.upU[i]++;
            if (c.dn > 0) t.dnU[i]++;
          });
          roll(e.ff, a.ff); roll(e.cf, a.cf); roll(e.tf, a.tf);
        });
      });

      // ---- statistics ----
      const lf = [0, 0];
      const logFact = (n) => { for (let i = lf.length; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i); return lf[n]; };
      const lchoose = (n, k) => (k < 0 || k > n || n < 0) ? -Infinity : logFact(n) - logFact(k) - logFact(n - k);
      const hyper = (k, Nn, Kk, nn) => { // P(X >= k)
        if (Nn <= 0 || Kk <= 0 || nn <= 0) return 1;
        const lo = Math.max(0, nn - (Nn - Kk)), hi = Math.min(nn, Kk);
        if (k <= lo) return 1;
        if (k > hi) return 0;
        const den = lchoose(Nn, nn);
        let s = 0;
        for (let x = k; x <= hi; x++) s += Math.exp(lchoose(Kk, x) + lchoose(Nn - Kk, nn - x) - den);
        return Math.min(1, Math.max(0, s));
      };
      const wilson = (k, n) => { // 95% interval on a proportion
        if (!n) return [0, 1];
        const z = 1.959964, ph = k / n, z2 = z * z;
        const d = 1 + z2 / n, c = ph + z2 / (2 * n);
        const hw = z * Math.sqrt(ph * (1 - ph) / n + z2 / (4 * n * n));
        return [Math.max(0, (c - hw) / d), Math.min(1, (c + hw) / d)];
      };
      const binomTwo = (k, n) => { // two-sided exact binomial, p=0.5
        if (!n) return 1;
        let lower = 0, upper = 0;
        const ln2 = n * Math.log(0.5);
        for (let x = 0; x <= n; x++) { const pr = Math.exp(lchoose(n, x) + ln2); if (x <= k) lower += pr; if (x >= k) upper += pr; }
        return Math.min(1, 2 * Math.min(lower, upper));
      };

      const cellStats = (v, K, ni, upU, dnU, lists) => {
        const expected = K > 0 && N > 0 ? K * ni / N : 0;
        const p = hyper(v, N, K, ni);
        const ci = wilson(v, K);
        const base = N > 0 ? ni / N : 0;
        const nDir = upU + dnU;
        const concP = nDir > 1 ? binomTwo(Math.max(upU, dnU), nDir) : 1;
        return {
          v, lists, K, ni, N, expected,
          fold: expected > 0 ? v / expected : null,
          log2fold: expected > 0 && v > 0 ? Math.log2(v / expected) : null,
          p, rate: K > 0 ? v / K : 0, ciLo: ci[0], ciHi: ci[1], baseline: base,
          aboveBaseline: ci[0] > base,
          pDrop1: null, robust1: null, minKill: null,
          upU, dnU, concordance: nDir === 0 ? "n/a" : upU && dnU ? "mixed" : upU ? "all up" : "all down", concP
        };
      };
      // Fragility is only meaningful for a cell that HAS significance to lose, so it
      // is filled in after BH, for significant cells only.
      const addFragility = (s) => {
        s.pDrop1 = hyper(s.v - 1, N - 1, s.K - 1, s.ni - 1);
        s.robust1 = s.pDrop1 < sigAlpha;
        for (let r = 1; r <= s.v; r++) {
          if (hyper(s.v - r, N - r, s.K - r, s.ni - r) > sigAlpha) { s.minKill = r; break; }
        }
      };

      const rows = genes.map((g, gi) => {
        const a = acc[g];
        const K = geneN[g];
        const breadth = a.ff.n.filter(v => v > 0).length + a.cf.n.filter(v => v > 0).length;
        const build = (t, cols, tot) => cols.map((f, i) => {
          const testable = K > 0 && tot[i] > 0 && (!G.facetPool[f] || G.facetPool[f].has(g));
          if (!testable) return null;
          return cellStats(t.n[i], K, tot[i], t.upU[i], t.dnU[i], t.lists[i]);
        });
        const ffStat = build(a.ff, ff, ffTot), cfStat = build(a.cf, cf, cfTot), tfStat = build(a.tf, tf, tfTot);
        return { gene: g, ff: a.ff.n, cf: a.cf.n, tf: a.tf.n,
          ffLists: a.ff.lists, cfLists: a.cf.lists, tfLists: a.tf.lists,
          ffUp: a.ff.up, ffDn: a.ff.dn, cfUp: a.cf.up, cfDn: a.cf.dn, tfUp: a.tf.up, tfDn: a.tf.dn,
          breadth, tfBreadth: a.tf.n.filter(v => v > 0).length, studyN: K,
          ffStat, cfStat, tfStat,
          ffP: ffStat.map(s => s ? s.p : 1), cfP: cfStat.map(s => s ? s.p : 1), tfP: tfStat.map(s => s ? s.p : 1),
          inputRank: gi };
      });

      // ---- BH over the cells that carry an observation ----
      const flatP = [], flatRef = [];
      rows.forEach((r, ri) => {
        r.ffStat.forEach((s, i) => { if (s && s.v > 0) { flatP.push(s.p); flatRef.push([ri, "ff", i]); } });
        r.cfStat.forEach((s, i) => { if (s && s.v > 0) { flatP.push(s.p); flatRef.push([ri, "cf", i]); } });
        r.tfStat.forEach((s, i) => { if (s && s.v > 0) { flatP.push(s.p); flatRef.push([ri, "tf", i]); } });
      });
      const flatQ = bhFDR(flatP);
      rows.forEach(r => { r.ffQ = new Array(ff.length).fill(1); r.cfQ = new Array(cf.length).fill(1); r.tfQ = new Array(tf.length).fill(1); });
      flatRef.forEach((ref, k) => {
        const [ri, t, i] = ref;
        rows[ri][t + "Q"][i] = flatQ[k];
        const s = rows[ri][t + "Stat"][i];
        s.q = flatQ[k];
        s.significant = flatQ[k] < sigAlpha && s.fold != null && s.fold > 1;
        if (s.significant) addFragility(s);
      });
      rows.sort((a, b) => b.breadth - a.breadth);

      const nSig = rows.reduce((t, r) => t + r.ffStat.filter(s => s && s.significant).length + r.cfStat.filter(s => s && s.significant).length + r.tfStat.filter(s => s && s.significant).length, 0);
      const nFragile = rows.reduce((t, r) => t + r.ffStat.filter(s => s && s.significant && s.minKill === 1).length + r.cfStat.filter(s => s && s.significant && s.minKill === 1).length + r.tfStat.filter(s => s && s.significant && s.minKill === 1).length, 0);
      const minP = flatP.length ? Math.min.apply(null, flatP) : null;
      return { rows, ffCols: ff, cfCols: cf, tfCols: tf, dir, nLists: nListsKept, sigAlpha,
        unit, nUnits: N, nStudies: unit === "study" ? N : null, nTests: flatP.length, nSig, nFragile, minP,
        provenance: { unit, nLists: nListsKept, nUnits: N, dir,
          tissues: opts.tissues || [], types: opts.types || [], contrasts: opts.contrasts || [],
          restrictFf: opts.restrictFf || [], restrictCf: opts.restrictCf || [],
          nTests: flatP.length, fdr: "Benjamini-Hochberg", alpha: sigAlpha, minP,
          test: "hypergeometric upper tail, conditioned on gene " + unit + " degree" } };
    },
    // Per-cell provenance for the fingerprint: which curated lists produced each
    // (gene x facet) hit. Repeats fingerprint()'s filtering pass verbatim and
    // returns refs[gene] = { ff: { facet: [refLabel,...] }, cf: {...} }, keyed by
    // NAME (not index) so it lines up with any view-side column/row reordering.
    fingerprintRefs(inputGenes, opts) {
      opts = opts || {};
      const src = Array.isArray(inputGenes) ? inputGenes : String(inputGenes || "").split(/[\s,;]+/);
      const genes = this.norm(src).filter(g => G.geneIndex[g]);
      const dir = opts.dir || "All";
      const tissues = opts.tissues && opts.tissues.length ? new Set(opts.tissues) : null;
      const types = opts.types && opts.types.length ? new Set(opts.types) : null;
      const contrasts = opts.contrasts && opts.contrasts.length ? new Set(opts.contrasts) : null;
      const reqFf = opts.restrictFf && opts.restrictFf.length ? new Set(opts.restrictFf.map(f => G.resolveFacet(f) || f)) : null;
      const reqCf = opts.restrictCf && opts.restrictCf.length ? new Set(opts.restrictCf.map(f => G.resolveFacet(f) || f)) : null;
      const gset = new Set(genes);
      const refs = {}; genes.forEach(g => refs[g] = { ff: {}, cf: {}, tf: {} });
      const label = (l) => {
        const bits = [];
        if (l.author) bits.push(l.author);
        if (l.pmid) bits.push("PMID " + l.pmid);
        const head = bits.length ? bits.join(", ") : (l.short || l.name || l.gl);
        return head + (l.dir ? " [" + l.dir + "]" : "") + " (" + l.gl + ")";
      };
      G.lists.forEach(l => {
        if (dir !== "All" && l.dir !== dir) return;
        if (tissues && !tissues.has(l.tissue)) return;
        if (types && !types.has(l.listType)) return;
        if (contrasts && !contrasts.has(l.contrast)) return;
        if (reqFf && !l.ffAtoms.some(f => reqFf.has(f))) return;
        if (reqCf && !l.cfAtoms.some(f => reqCf.has(f))) return;
        const hits = [];
        for (const g of l.genes) if (gset.has(g)) hits.push(g);
        if (!hits.length) return;
        const lab = label(l);
        hits.forEach(g => {
          const r = refs[g];
          l.ffAtoms.forEach(f => { if (!G.facetPool[f] || G.facetPool[f].has(g)) (r.ff[f] = r.ff[f] || []).push(lab); });
          l.cfAtoms.forEach(f => { if (!G.facetPool[f] || G.facetPool[f].has(g)) (r.cf[f] = r.cf[f] || []).push(lab); });
          if (l.tissue) (r.tf[l.tissue] = r.tf[l.tissue] || []).push(lab);
        });
      });
      return refs;
    },
    // Co-travelling genes: degree-preserving permutation test (curveball null
    // model) for which genes co-occur with a query gene, across the curated
    // gene-list x gene bipartite membership graph, more than chance given each
    // gene's own list-membership frequency ("promiscuity"). Ported from
    // genedex_cotravel.R (find_cotraveling_genes). Async + chunked so the
    // burn-in / sampling swaps never block the UI thread; onProgress(({phase,
    // frac})) is called periodically during long runs.
    async cotravelTest(gene, opts, onProgress) {
      opts = opts || {};
      const rawList = Array.isArray(gene) ? gene : String(gene || "").split(/[\s,;]+/);
      const queryGenesAll = compute.norm(rawList);
      if (!queryGenesAll.length) throw new Error("Enter at least one gene symbol.");
      const allGenes = G.universe;
      const geneIndex = {}; allGenes.forEach((g, i) => geneIndex[g] = i);
      const nGenes = allGenes.length;
      const queryIdxs = [], queryGenesFound = [], queryGenesMissing = [];
      queryGenesAll.forEach(g => { if (g in geneIndex) { queryIdxs.push(geneIndex[g]); queryGenesFound.push(g); } else queryGenesMissing.push(g); });
      if (!queryGenesFound.length) {
        const probe = queryGenesAll[0];
        const close = allGenes.filter(g => g.startsWith(probe.slice(0, 3))).slice(0, 5);
        throw new Error("None of the entered genes were found in any curated gene list." + (close.length ? " Did you mean: " + close.join(", ") + "?" : ""));
      }
      const queryIdxSet = new Set(queryIdxs);
      const rowHasQuery = (r) => { for (const qi of queryIdxs) if (r.has(qi)) return true; return false; };

      // bipartite rows: one Set<gene index> per curated list, with aligned
      // metadata for the shared-list evidence view (which lists a partner gene
      // actually co-occurs with the query in, and under what facets).
      const rows = [], listMeta = [];
      G.lists.forEach(l => {
        const s = new Set();
        l.genes.forEach(g => { const idx = geneIndex[g]; if (idx != null) s.add(idx); });
        if (s.size > 0) { rows.push(s); listMeta.push({ gl: l.gl, name: l.short || l.gl, author: l.author, doi: l.doi, ff: l.ff, cf: l.cf, ffAtoms: l.ffAtoms, cfAtoms: l.cfAtoms, dir: l.dir, tissue: l.tissue }); }
      });
      const nLists = rows.length;
      if (!nLists) throw new Error("No curated gene lists are loaded.");

      const degree = new Int32Array(nGenes);
      rows.forEach(r => r.forEach(idx => degree[idx]++));
      const queryDegree = rows.filter(rowHasQuery).length;
      if (!queryDegree) throw new Error("None of " + queryGenesFound.join(", ") + " occur in any curated gene list together with other genes.");

      // rows that contain at least one query gene count fully (every gene in
      // that row co-travels with the query set), so multiple query genes are
      // treated as one composite entity for the null-model comparison.
      const cooccurWith = (rowsArr, idxSet) => {
        const vec = new Int32Array(nGenes);
        for (let i = 0; i < rowsArr.length; i++) {
          const r = rowsArr[i];
          let has = false; for (const qi of idxSet) { if (r.has(qi)) { has = true; break; } }
          if (has) r.forEach(g => vec[g]++);
        }
        return vec;
      };
      const observed = cooccurWith(rows, queryIdxSet);
      const nEdges = rows.reduce((s, r) => s + r.size, 0);

      // Shared-list evidence: for every list that contains at least one query
      // gene, which other genes it co-occurs with there, and under which
      // facets/which query gene(s) it matched via.
      const sharedByGene = {};
      for (let li = 0; li < rows.length; li++) {
        const r = rows[li];
        const matchedQuery = queryGenesFound.filter((qg, qi) => r.has(queryIdxs[qi]));
        if (!matchedQuery.length) continue;
        const lm = Object.assign({ matchedQuery }, listMeta[li]);
        r.forEach(g => { if (!queryIdxSet.has(g)) (sharedByGene[g] || (sharedByGene[g] = [])).push(lm); });
      }

      // Browser defaults are tuned for responsiveness over statistical purity:
      // a real ~1,400-list collection has enough edges that Strona et al.'s
      // recommended burn-in (5x edges) would block the UI for minutes. Capping
      // swap_budget keeps a default run to a few seconds; raise it via opts for
      // a slower, more rigorous run.
      let nPermutations = opts.nPermutations || 150;
      const burnInFactor = opts.burnInFactor || 5;
      const swapBudget = opts.swapBudget || 1700000;
      let burnIn = Math.min(burnInFactor * nEdges, Math.round(swapBudget * 0.7));
      // thin (curveball swaps between successive sampled permutations) decorrelates
      // the null draws. It must scale down with more requested permutations (so a
      // fixed budget still buys as many samples as reasonable) but never below a
      // fixed floor \u2014 letting it depend on burnIn alone kept the same tight
      // permutation cap regardless of budget; letting it depend on nPermutations
      // alone (the original bug) let it collapse toward 1 on large corpora.
      const thinFloor = opts.thinFloor || 500;
      const samplingBudget = Math.max(thinFloor, swapBudget - burnIn);
      const thin = opts.thin || Math.max(thinFloor, Math.floor(samplingBudget / nPermutations));
      const maxPermByBudget = Math.max(1, Math.floor(samplingBudget / thin));
      let permutationsCapped = false;
      if (nPermutations > maxPermByBudget) { nPermutations = maxPermByBudget; permutationsCapped = true; }

      const rng = mulberry32(hashStr("cotravel:" + queryGenesFound.join(",") + ":" + (opts.seed || 0)));
      // curveball swap: pick two lists, pool the genes that differ between them,
      // reshuffle the pool back into the two lists in the same proportions —
      // preserves every list's size and every gene's total degree exactly.
      function curveballSwaps(rowsArr, nSwaps) {
        const n = rowsArr.length;
        if (n < 2 || nSwaps <= 0) return rowsArr;
        for (let s = 0; s < nSwaps; s++) {
          let i = Math.floor(rng() * n), j = Math.floor(rng() * n);
          if (j === i) j = (j + 1) % n;
          const ri = rowsArr[i], rj = rowsArr[j];
          const onlyI = [], shared = [];
          ri.forEach(g => rj.has(g) ? shared.push(g) : onlyI.push(g));
          if (!onlyI.length) continue;
          const onlyJ = [];
          rj.forEach(g => { if (!ri.has(g)) onlyJ.push(g); });
          if (!onlyJ.length) continue;
          const pool = onlyI.concat(onlyJ);
          for (let k = pool.length - 1; k > 0; k--) { const l = Math.floor(rng() * (k + 1)); const t = pool[k]; pool[k] = pool[l]; pool[l] = t; }
          const newI = new Set(shared), newJ = new Set(shared);
          for (let k = 0; k < onlyI.length; k++) newI.add(pool[k]);
          for (let k = onlyI.length; k < pool.length; k++) newJ.add(pool[k]);
          rowsArr[i] = newI; rowsArr[j] = newJ;
        }
        return rowsArr;
      }

      let work = rows.map(r => new Set(r));
      const CHUNK = 2000;
      let done = 0;
      while (done < burnIn) {
        const step = Math.min(CHUNK, burnIn - done);
        curveballSwaps(work, step);
        done += step;
        if (onProgress) onProgress({ phase: "burn-in", frac: done / burnIn });
        await new Promise(r => setTimeout(r, 0));
      }

      const sumX = new Float64Array(nGenes), sumX2 = new Float64Array(nGenes);
      const countGe = new Int32Array(nGenes), countLe = new Int32Array(nGenes);
      for (let k = 0; k < nPermutations; k++) {
        curveballSwaps(work, thin);
        const samp = cooccurWith(work, queryIdxSet);
        for (let g = 0; g < nGenes; g++) {
          sumX[g] += samp[g]; sumX2[g] += samp[g] * samp[g];
          if (samp[g] >= observed[g]) countGe[g]++;
          if (samp[g] <= observed[g]) countLe[g]++;
        }
        if (onProgress) onProgress({ phase: "sampling", frac: (k + 1) / nPermutations });
        await new Promise(r => setTimeout(r, 0));
      }

      // normal-tail p-value (continuity-corrected) from the permutation-estimated
      // null mean/sd — see genedex_cotravel.R for why the raw empirical p-value
      // floor (1/(n_perm+1)) makes BH correction useless at this scale.
      const erfc = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : 2 - y; };
      const normalSf = (z) => 0.5 * erfc(z / Math.SQRT2);

      const minCo = opts.minCooccurrence != null ? opts.minCooccurrence : 1;
      const results = [];
      for (let g = 0; g < nGenes; g++) {
        if (queryIdxSet.has(g) || !degree[g]) continue;
        const obs = observed[g];
        if (obs < minCo) continue;
        const mean = sumX[g] / nPermutations;
        const variance = (sumX2[g] - nPermutations * mean * mean) / Math.max(1, nPermutations - 1);
        const sd = Math.sqrt(Math.max(variance, 0));
        const z = sd > 0 ? (obs - mean) / sd : null;
        const pEnrichment = sd > 0 ? normalSf((obs - 0.5 - mean) / sd) : 1;
        const pEnrichmentEmpirical = (1 + countGe[g]) / (nPermutations + 1);
        const union = queryDegree + degree[g] - obs;
        const shared = sharedByGene[g] || [];
        const facetTypes = opts.facetTypes || { ff: true, cf: true };
        const facetTally = {};
        shared.forEach(sl => {
          if (facetTypes.ff) (sl.ffAtoms || []).forEach(f => facetTally[f] = (facetTally[f] || 0) + 1);
          if (facetTypes.cf) (sl.cfAtoms || []).forEach(f => facetTally[f] = (facetTally[f] || 0) + 1);
        });
        const minFacetOcc = opts.minFacetOccurrence || 1;
        const topFacetEntry = Object.entries(facetTally).filter(e => e[1] >= minFacetOcc).sort((a, b) => b[1] - a[1])[0];
        results.push({ gene: allGenes[g], degree: degree[g], observed: obs, expected: mean, nullStd: sd, z,
          pEnrichment, pEnrichmentEmpirical, jaccard: union > 0 ? obs / union : 0, normalApproxOk: mean >= 5,
          sharedLists: shared, topFacet: topFacetEntry ? topFacetEntry[0] : null });
      }

      // Benjamini-Hochberg FDR on p_enrichment
      results.sort((a, b) => a.pEnrichment - b.pEnrichment);
      const m = results.length;
      let minQ = 1;
      for (let i = m - 1; i >= 0; i--) {
        minQ = Math.min(minQ, results[i].pEnrichment * m / (i + 1));
        results[i].qValue = minQ;
      }
      const fdrAlpha = opts.fdrAlpha || 0.05;
      results.forEach(r => { r.significant = r.qValue < fdrAlpha && r.z != null && r.z > 0; });
      results.sort((a, b) => a.pEnrichment - b.pEnrichment || b.z - a.z);

      return { gene: queryGenesFound.join(", "), genes: queryGenesFound, missingGenes: queryGenesMissing,
        queryDegree, nLists, nGenes: allGenes.length, nGenesTested: results.length,
        nPermutations, permutationsCapped, thin, burnIn, fdrAlpha, nSignificant: results.filter(r => r.significant).length,
        normalApproxWeak: results.filter(r => !r.normalApproxOk).length > 0.5 * results.length,
        rows: results };
    },
    // Gene modules: instead of ranking partner genes one at a time, find the BLOCKS
    // of genes that travel together. Candidates are the genes that co-occur with the
    // query; similarity between two candidates is the Jaccard overlap of the curated
    // lists they appear in; communities come from single-level Louvain (local moving)
    // on the kNN similarity graph. Each module is then annotated with the facets of
    // the lists that carry two or more of its members, which is what gives it a
    // biological reading rather than just a gene count.
    async geneModules(gene, opts, onProgress) {
      opts = opts || {};
      const rawList = Array.isArray(gene) ? gene : String(gene || "").split(/[\s,;]+/);
      const queryAll = compute.norm(rawList);
      if (!queryAll.length) throw new Error("Enter at least one gene symbol.");
      const allGenes = G.universe;
      const gi = {}; allGenes.forEach((g, i) => gi[g] = i);
      const queryFound = [], queryMissing = [];
      queryAll.forEach(g => { if (g in gi) queryFound.push(g); else queryMissing.push(g); });
      if (!queryFound.length) throw new Error("None of the entered genes were found in any curated gene list.");
      const qSet = new Set(queryFound);

      const maxCandidates = opts.maxCandidates || 150;
      const minCooccurrence = opts.minCooccurrence || 2;
      const k = opts.k || 8;
      const minSim = opts.minSim != null ? opts.minSim : 0.05;
      const gamma = opts.resolution || 1;
      const minModuleSize = opts.minModuleSize || 3;

      // Progress reporting is deliberately stingy: every onProgress call re-renders the
      // workbench, and yielding to the event loop costs a clamped timer tick, so a
      // chatty loop spent ~20x more time on reporting than on the statistics.
      let lastTick = 0, lastPct = -1, lastYield = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
      const tick = (phase, frac) => {
        const pct = Math.round(frac * 100);
        if (!onProgress || pct === lastPct) return;
        const t = Date.now();
        if (t - lastTick < 400 && frac < 1) return;
        lastTick = t; lastPct = pct; onProgress({ phase, frac });
      };
      const breathe = async () => {
        if (now() - lastYield < 120) return;
        await yieldToUi();
        lastYield = now();
      };

      // lists that contain at least one query gene, and the co-occurrence tally
      const qLists = [], coCount = new Map();
      G.lists.forEach((l, li) => {
        let hit = false;
        for (const g of l.genes) if (qSet.has(g)) { hit = true; break; }
        if (!hit) return;
        qLists.push(li);
        for (const g of l.genes) { if (qSet.has(g)) continue; coCount.set(g, (coCount.get(g) || 0) + 1); }
      });
      if (!qLists.length) throw new Error("None of " + queryFound.join(", ") + " occur in any curated gene list.");
      if (onProgress) onProgress({ phase: "candidates", frac: .2 });

      const candidates = [...coCount.entries()].filter(([, n]) => n >= minCooccurrence)
        .sort((a, b) => b[1] - a[1]).slice(0, maxCandidates).map(([g]) => g);
      const nodes = queryFound.concat(candidates.filter(g => !qSet.has(g)));
      if (nodes.length < minModuleSize) throw new Error("Only " + nodes.length + " gene(s) co-occur with the query at least " + minCooccurrence + " times \u2014 not enough to form modules. Lower the minimum co-occurrence.");

      // per-node list membership
      const nodeIdx = {}; nodes.forEach((g, i) => nodeIdx[g] = i);
      const memb = nodes.map(() => new Set());
      G.lists.forEach((l, li) => {
        for (const g of l.genes) { const i = nodeIdx[g]; if (i != null) memb[i].add(li); }
      });
      if (onProgress) onProgress({ phase: "similarity", frac: .45 });

      // pairwise Jaccard, kept as a kNN graph
      const n = nodes.length;
      const sim = [];
      for (let i = 0; i < n; i++) sim.push([]);
      for (let i = 0; i < n; i++) {
        const A = memb[i];
        for (let j = i + 1; j < n; j++) {
          const B = memb[j];
          const small = A.size < B.size ? A : B, big = A.size < B.size ? B : A;
          let inter = 0;
          small.forEach(x => { if (big.has(x)) inter++; });
          if (!inter) continue;
          const jac = inter / (A.size + B.size - inter);
          if (jac < minSim) continue;
          sim[i].push({ j, w: jac, inter });
          sim[j].push({ j: i, w: jac, inter });
        }
        if (onProgress && i % 25 === 0) { tick("similarity", .45 + .3 * (i / n)); await breathe(); }
      }
      const adj = sim.map(l => l.slice().sort((a, b) => b.w - a.w).slice(0, k));
      // symmetrise the kNN graph
      const edge = new Map();
      adj.forEach((l, i) => l.forEach(e => {
        const a = Math.min(i, e.j), b = Math.max(i, e.j);
        edge.set(a + ":" + b, { a, b, w: e.w, inter: e.inter });
      }));
      const edges = [...edge.values()];
      const nbr = nodes.map(() => []);
      edges.forEach(e => { nbr[e.a].push({ j: e.b, w: e.w }); nbr[e.b].push({ j: e.a, w: e.w }); });
      if (onProgress) onProgress({ phase: "communities", frac: .8 });

      // ---- single-level Louvain (local moving) ----
      const deg = nbr.map(l => l.reduce((s, e) => s + e.w, 0));
      const m2 = deg.reduce((s, d) => s + d, 0) || 1;
      let comm = nodes.map((_, i) => i);
      const tot = deg.slice();
      for (let pass = 0; pass < (opts.maxPasses || 12); pass++) {
        let moved = 0;
        for (let i = 0; i < n; i++) {
          const ci = comm[i];
          const wTo = new Map();
          nbr[i].forEach(e => wTo.set(comm[e.j], (wTo.get(comm[e.j]) || 0) + e.w));
          tot[ci] -= deg[i];
          let best = ci, bestGain = (wTo.get(ci) || 0) - gamma * deg[i] * tot[ci] / m2;
          wTo.forEach((w, c) => {
            if (c === ci) return;
            const gain = w - gamma * deg[i] * tot[c] / m2;
            if (gain > bestGain + 1e-12) { bestGain = gain; best = c; }
          });
          tot[best] += deg[i];
          if (best !== ci) { comm[i] = best; moved++; }
        }
        if (!moved) break;
      }
      // modularity of the final partition
      let Q = 0;
      {
        const inW = new Map(), totW = new Map();
        edges.forEach(e => { if (comm[e.a] === comm[e.b]) inW.set(comm[e.a], (inW.get(comm[e.a]) || 0) + 2 * e.w); });
        deg.forEach((d, i) => totW.set(comm[i], (totW.get(comm[i]) || 0) + d));
        totW.forEach((t, c) => { Q += (inW.get(c) || 0) / m2 - gamma * Math.pow(t / m2, 2); });
      }

      // ---- assemble modules ----
      const byComm = new Map();
      comm.forEach((c, i) => { if (!byComm.has(c)) byComm.set(c, []); byComm.get(c).push(i); });
      const simLookup = (i, j) => { const e = nbr[i].find(x => x.j === j); return e ? e.w : 0; };
      const modules = [];
      const unassigned = [];
      const belowMinSize = [];
      byComm.forEach((idxs) => {
        if (idxs.length < minModuleSize) { idxs.forEach(i => { unassigned.push(nodes[i]); belowMinSize.push(nodes[i]); }); return; }
        // cohesion: mean pairwise similarity inside the module
        let sum = 0, pairs = 0;
        for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) { sum += simLookup(idxs[a], idxs[b]); pairs++; }
        const cohesion = pairs ? sum / pairs : 0;
        // lists carrying >=2 module members, and their facet tallies
        const mset = new Set(idxs.map(i => nodes[i]));
        const ffT = new Map(), cfT = new Map(), backing = [];
        G.lists.forEach(l => {
          let c = 0;
          for (const g of l.genes) if (mset.has(g)) c++;
          if (c < 2) return;
          backing.push({ gl: l.gl, name: l.short || l.gl, author: l.author, pmid: l.pmid, doi: l.doi, dir: l.dir, nMembers: c });
          l.ffAtoms.forEach(f => ffT.set(f, (ffT.get(f) || 0) + 1));
          l.cfAtoms.forEach(f => cfT.set(f, (cfT.get(f) || 0) + 1));
        });
        const top = (t) => [...t.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([facet, nLists]) => ({ facet, nLists }));
        backing.sort((a, b) => b.nMembers - a.nMembers);
        const members = idxs.map(i => ({
          gene: nodes[i], isQuery: qSet.has(nodes[i]),
          nLists: memb[i].size, withQuery: coCount.get(nodes[i]) || (qSet.has(nodes[i]) ? qLists.length : 0),
          degree: nbr[i].length
        })).sort((a, b) => (b.isQuery ? 1 : 0) - (a.isQuery ? 1 : 0) || b.withQuery - a.withQuery);
        modules.push({ size: idxs.length, cohesion, members, ff: top(ffT), cf: top(cfT),
          nBackingLists: backing.length, backingLists: backing.slice(0, 40),
          queryMembers: members.filter(m => m.isQuery).map(m => m.gene) });
      });
      // Only modules the query genes actually landed in are reported; genes in the
      // discarded communities fall through to `unassigned` so the node count still adds up.
      const seedless = modules.filter(m => m.queryMembers.length === 0);
      let modules2 = modules.filter(m => m.queryMembers.length > 0);
      seedless.forEach(m => m.members.forEach(x => unassigned.push(x.gene)));
      modules.length = 0; modules2.forEach(m => modules.push(m));
      modules.sort((a, b) => b.queryMembers.length - a.queryMembers.length || b.size - a.size || b.cohesion - a.cohesion);
      modules.forEach((m, i) => m.id = i + 1);
      const nModulesDropped = seedless.length;
      const nBelowMinSize = belowMinSize.length;

      // ---- optional degree-preserving null model ----
      // Louvain finds a best split of whatever graph it is given, so cohesion and Q
      // describe the partition but say nothing about whether any single module is
      // tighter than chance. Here the statistic is a module's mean pairwise Jaccard
      // (over the untruncated similarity, not the kNN graph), recomputed on curveball
      // permutations of the gene x list bipartite graph. Curveball preserves every
      // list's size and every gene's list count exactly, so a small p-value means the
      // members share lists more than their individual promiscuity explains. The
      // partition itself is held fixed — this tests module tightness, not the split.
      //
      // Swaps run on the induced submatrix (candidate nodes x lists), not the whole
      // ~590k-membership corpus: it preserves exactly what the statistic depends on
      // (each node gene's list count, each list's node count) and is ~80x smaller, so
      // a default run finishes in seconds instead of minutes. Genes outside the
      // candidate pool never enter the Jaccard, so permuting them buys nothing.
      let perm = null;
      if ((opts.nPermutations || 0) > 0 && modules.length) {
        let nPermutations = opts.nPermutations;
        const nodeOfGene = new Map();
        nodes.forEach((g, i) => nodeOfGene.set(g, i));
        const rows = [];
        G.lists.forEach(l => {
          const s = new Set();
          l.genes.forEach(g => { const i = nodeOfGene.get(g); if (i != null) s.add(i); });
          if (s.size) rows.push(s);
        });
        const nEdgesBip = rows.reduce((s, r) => s + r.size, 0);
        const swapBudget = opts.swapBudget || 250000;
        const burnIn = Math.min((opts.burnInFactor || 5) * nEdgesBip, Math.round(swapBudget * 0.7));
        const thinFloor = opts.thinFloor || 200;
        const samplingBudget = Math.max(thinFloor, swapBudget - burnIn);
        const thin = opts.thin || Math.max(thinFloor, Math.floor(samplingBudget / nPermutations));
        const maxPerm = Math.max(1, Math.floor(samplingBudget / thin));
        let permutationsCapped = false;
        if (nPermutations > maxPerm) { nPermutations = maxPerm; permutationsCapped = true; }

        const rng = mulberry32(hashStr("modules:" + queryFound.join(",") + ":" + (opts.seed || 0)));
        const swaps = (rowsArr, nSwaps) => {
          const nr = rowsArr.length;
          if (nr < 2 || nSwaps <= 0) return;
          for (let s = 0; s < nSwaps; s++) {
            let i = Math.floor(rng() * nr), j = Math.floor(rng() * nr);
            if (j === i) j = (j + 1) % nr;
            const ri = rowsArr[i], rj = rowsArr[j];
            const onlyI = [], shared = [];
            ri.forEach(g => rj.has(g) ? shared.push(g) : onlyI.push(g));
            if (!onlyI.length) continue;
            const onlyJ = [];
            rj.forEach(g => { if (!ri.has(g)) onlyJ.push(g); });
            if (!onlyJ.length) continue;
            const pool = onlyI.concat(onlyJ);
            for (let q = pool.length - 1; q > 0; q--) { const l = Math.floor(rng() * (q + 1)); const t = pool[q]; pool[q] = pool[l]; pool[l] = t; }
            const newI = new Set(shared), newJ = new Set(shared);
            for (let q = 0; q < onlyI.length; q++) newI.add(pool[q]);
            for (let q = onlyI.length; q < pool.length; q++) newJ.add(pool[q]);
            rowsArr[i] = newI; rowsArr[j] = newJ;
          }
        };

        const memberIdxs = modules.map(m => m.members.map(x => nodeIdx[x.gene]));
        const statOf = (rowsArr) => {
          const ms = nodes.map(() => new Set());
          for (let li = 0; li < rowsArr.length; li++) rowsArr[li].forEach(i => ms[i].add(li));
          return memberIdxs.map(idxs => {
            let sum = 0, pairs = 0;
            for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
              const A = ms[idxs[a]], B = ms[idxs[b]];
              const small = A.size < B.size ? A : B, big = A.size < B.size ? B : A;
              let inter = 0; small.forEach(x => { if (big.has(x)) inter++; });
              const uni = A.size + B.size - inter;
              sum += uni ? inter / uni : 0; pairs++;
            }
            return pairs ? sum / pairs : 0;
          });
        };

        const obsStat = statOf(rows);
        const work = rows.map(r => new Set(r));
        let doneSwaps = 0;
        while (doneSwaps < burnIn) {
          const step = Math.min(20000, burnIn - doneSwaps);
          swaps(work, step); doneSwaps += step;
          tick("null burn-in", doneSwaps / burnIn);
          await breathe();
        }
        const nM = modules.length;
        const sumX = new Float64Array(nM), sumX2 = new Float64Array(nM), countGe = new Int32Array(nM);
        for (let t = 0; t < nPermutations; t++) {
          swaps(work, thin);
          const samp = statOf(work);
          for (let mi = 0; mi < nM; mi++) {
            sumX[mi] += samp[mi]; sumX2[mi] += samp[mi] * samp[mi];
            if (samp[mi] >= obsStat[mi]) countGe[mi]++;
          }
          tick("null sampling " + (t + 1) + "/" + nPermutations, (t + 1) / nPermutations);
          await breathe();
        }

        modules.forEach((m, mi) => {
          const mean = sumX[mi] / nPermutations;
          const variance = (sumX2[mi] - nPermutations * mean * mean) / Math.max(1, nPermutations - 1);
          const sd = Math.sqrt(Math.max(variance, 0));
          m.jaccardMean = obsStat[mi];
          m.nullMean = mean; m.nullSd = sd;
          m.z = sd > 0 ? (obsStat[mi] - mean) / sd : null;
          m.p = (1 + countGe[mi]) / (nPermutations + 1);
        });
        // Benjamini-Hochberg across modules (few tests, so the empirical p floor is fine)
        const order = modules.map((m, i) => i).sort((a, b) => modules[a].p - modules[b].p);
        let prev = 1;
        for (let r = order.length - 1; r >= 0; r--) {
          const m = modules[order[r]];
          prev = Math.min(prev, m.p * order.length / (r + 1));
          m.q = Math.min(1, prev);
        }
        const alpha = opts.fdrAlpha || 0.05;
        modules.forEach(m => m.significant = m.q <= alpha);
        perm = { nPermutations, permutationsCapped, thin, burnIn, fdrAlpha: alpha,
          pFloor: 1 / (nPermutations + 1), nSignificant: modules.filter(m => m.significant).length };
      }

      return { genes: queryFound, missingGenes: queryMissing, gene: queryFound.join(", "),
        nQueryLists: qLists.length, nCandidates: candidates.length, nNodes: n, nEdges: edges.length,
        modularity: Q, modules, unassigned, perm, nModulesDropped, nBelowMinSize,
        params: { maxCandidates, minCooccurrence, k, minSim, resolution: gamma, minModuleSize } };
    },
    // Consensus: genes conserved within facet across >=minLists independent lists
    consensus(opts) {
      opts = opts || {};
      const minLists = opts.minLists || 2;
      const dir = opts.dir || "All";
      const ffFilter = opts.ff && opts.ff.length ? new Set(opts.ff.map(f => G.resolveFacet(f) || f)) : null;
      const cfFilter = opts.cf && opts.cf.length ? new Set(opts.cf.map(f => G.resolveFacet(f) || f)) : null;
      const tissueFilter = opts.tissues && opts.tissues.length ? new Set(opts.tissues) : null;
      const typeFilter = opts.types && opts.types.length ? new Set(opts.types) : null;
      // group lists by (facet, cellularFacet?, direction)
      const groups = {};
      G.lists.forEach(l => {
        if (dir !== "All" && dir !== "Both" && l.dir !== dir) return;
        if (tissueFilter && !tissueFilter.has(l.tissue)) return;
        if (typeFilter && !typeFilter.has(l.listType)) return;
        l.ffAtoms.forEach(f => {
          if (ffFilter && !ffFilter.has(f)) return;
          const cfs = l.cfAtoms.length ? l.cfAtoms : [""];
          cfs.forEach(cfx => {
            if (cfFilter && cfx && !cfFilter.has(cfx)) return;
            if (cfFilter && !cfx) return;
            const dlabel = (dir === "Both" || dir === "All") ? (l.dir || "NA") : dir;
            const key = f + "||" + cfx + "||" + dlabel;
            (groups[key] = groups[key] || { ff: f, cf: cfx, dir: l.dir || "NA", lists: [] }).lists.push(l);
          });
        });
      });
      const out = [];
      Object.values(groups).forEach(g => {
        if (g.lists.length < minLists) return;
        let inter = null;
        g.lists.forEach(l => { const s = new Set(l.genes); inter = inter == null ? s : new Set([...inter].filter(x => s.has(x))); });
        const genes = Array.from(inter || []).sort();
        if (!genes.length) return;
        out.push({ ff: g.ff, cf: g.cf, dir: g.dir, nLists: g.lists.length, genes, nGenes: genes.length,
          contributors: g.lists.map(l => ({ gl: l.gl, author: l.author })) });
      });
      out.sort((a, b) => b.nGenes - a.nGenes);
      return out;
    },
    // Facet interaction network
    facetNetwork(opts) {
      opts = opts || {};
      const thr = opts.threshold || 3;
      const show = opts.show || { ff: true, cf: true, cross: true };
      const tissues = opts.tissues && opts.tissues.length ? new Set(opts.tissues) : null;
      const facets = [];
      if (show.ff) G.ffFacets.forEach(f => facets.push(f));
      if (show.cf) G.cfFacets.forEach(f => facets.push(f));
      // facet -> gene set. Restricted to the selected tissues' lists when a
      // tissue filter is active, otherwise the precomputed full index is used.
      let geneSet, listCount;
      if (tissues) {
        const fg = {}, fl = {};
        facets.forEach(f => { fg[f] = new Set(); fl[f] = 0; });
        const inPool = (f, g) => { const p = G.facetPool && G.facetPool[f]; return !p || p.has(g); };
        G.lists.forEach(l => {
          if (!tissues.has(l.tissue)) return;
          [...l.ffAtoms, ...l.cfAtoms].forEach(f => { if (fg[f]) { fl[f]++; l.genes.forEach(g => { if (inPool(f, g)) fg[f].add(g); }); } });
        });
        geneSet = f => fg[f]; listCount = f => fl[f];
      } else {
        geneSet = f => G.facetIndex[f].genes; listCount = f => G.facetMeta[f].nLists;
      }
      let nodes = facets.map(f => ({ id: f, type: G.facetMeta[f].type, size: geneSet(f).size, nLists: listCount(f) }));
      if (tissues) nodes = nodes.filter(n => n.size > 0);
      const edges = [];
      for (let i = 0; i < facets.length; i++) for (let j = i + 1; j < facets.length; j++) {
        const A = geneSet(facets[i]), B = geneSet(facets[j]);
        const ta = G.facetMeta[facets[i]].type, tb = G.facetMeta[facets[j]].type;
        const cross = ta !== tb;
        if (cross && !show.cross) continue;
        if (!cross && ta === "ff" && !show.ffEdge && show.ffEdge === false) continue;
        let shared = 0; const small = A.size < B.size ? A : B, big = A.size < B.size ? B : A;
        small.forEach(g => { if (big.has(g)) shared++; });
        if (shared >= thr) edges.push({ a: facets[i], b: facets[j], w: shared, cross });
      }
      // prune to a readable backbone: keep each node's top-K strongest edges (union)
      const topK = opts.topK || 4;
      const byNode = {}; facets.forEach(f => byNode[f] = []);
      edges.forEach(e => { byNode[e.a].push(e); byNode[e.b].push(e); });
      const keep = new Set();
      facets.forEach(f => { byNode[f].sort((a, b) => b.w - a.w).slice(0, topK).forEach(e => keep.add(e)); });
      const pruned = edges.filter(e => keep.has(e));
      const used = new Set(); pruned.forEach(e => { used.add(e.a); used.add(e.b); });
      return { nodes: nodes, edges: pruned };
    },
    sharedGenes(facetA, facetB) {
      const a = G.resolveFacet(facetA) || facetA, b = G.resolveFacet(facetB) || facetB;
      const A = G.facetIndex[a].genes, B = G.facetIndex[b].genes;
      return Array.from(A).filter(g => B.has(g)).sort();
    },
    hubGenes(facet, topN) {
      facet = G.resolveFacet(facet) || facet;
      const e = G.facetIndex[facet]; if (!e) return [];
      const counts = {};
      G.lists.forEach(l => { if (l.ffAtoms.includes(facet) || l.cfAtoms.includes(facet)) l.genes.forEach(g => { if (!G.facetPool[facet] || G.facetPool[facet].has(g)) counts[g] = (counts[g] || 0) + 1; }); });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, topN || 10).map(([g, c]) => ({ gene: g, count: c }));
    },
    // lists where `gene` appears under `facet`, honouring the active fingerprint
    // filters (direction, tissue, list-type, contrast). `opts` may be a plain
    // direction string (legacy) or an options object.
    cellLists(gene, facet, opts) {
      opts = (opts == null || typeof opts === "string") ? { dir: opts } : opts;
      const dir = opts.dir || "All";
      const tissues = opts.tissues && opts.tissues.length ? new Set(opts.tissues) : null;
      const types = opts.types && opts.types.length ? new Set(opts.types) : null;
      const contrasts = opts.contrasts && opts.contrasts.length ? new Set(opts.contrasts) : null;
      const reqFf = opts.restrictFf && opts.restrictFf.length ? new Set(opts.restrictFf.map(f => G.resolveFacet(f) || f)) : null;
      const reqCf = opts.restrictCf && opts.restrictCf.length ? new Set(opts.restrictCf.map(f => G.resolveFacet(f) || f)) : null;
      facet = G.resolveFacet(facet) || facet;
      const g = String(gene).trim().toUpperCase();
      return G.lists.filter(l => {
        if (dir && dir !== "All" && l.dir !== dir) return false;
        if (tissues && !tissues.has(l.tissue)) return false;
        if (types && !types.has(l.listType)) return false;
        if (contrasts && !contrasts.has(l.contrast)) return false;
        if (reqFf && !l.ffAtoms.some(f => reqFf.has(f))) return false;
        if (reqCf && !l.cfAtoms.some(f => reqCf.has(f))) return false;
        const isTf = G.facetMeta[facet] && G.facetMeta[facet].type === "tf";
        if (isTf ? l.tissue !== facet : !(l.ffAtoms.includes(facet) || l.cfAtoms.includes(facet))) return false;
        if (G.facetPool[facet] && !G.facetPool[facet].has(g)) return false;
        return l.genes.includes(g);
      }).map(l => ({ gl: l.gl, author: l.author, title: l.title, doi: l.doi, dir: l.dir, short: l.short }));
    },
    geneProfile(gene) {
      const g = String(gene).trim().toUpperCase();
      return G.geneIndex[g] || null;
    },
  };

  function dominantClass(gene) {
    const e = G.geneIndex[gene]; if (!e) return null;
    let best = null, bestC = -1;
    Object.entries(e.cf).forEach(([f, c]) => { if (c > bestC) { bestC = c; best = f; } });
    Object.entries(e.ff).forEach(([f, c]) => { if (c > bestC) { bestC = c; best = f; } });
    return best;
  }

  G.compute = compute;

  // ---- real-data ingestion (developer upload) -------------------------------
  async function inflateRaw(u8) { const ds = new DecompressionStream("deflate-raw"); const w = ds.writable.getWriter(); w.write(u8); w.close(); const ab = await new Response(ds.readable).arrayBuffer(); return new Uint8Array(ab); }
  async function unzip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer), dv = new DataView(arrayBuffer), dec = new TextDecoder();
    let eocd = -1; for (let i = bytes.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error("Not a valid .zip file");
    const cdOffset = dv.getUint32(eocd + 16, true), cdCount = dv.getUint16(eocd + 10, true);
    let p = cdOffset; const out = [];
    for (let n = 0; n < cdCount; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const localOffset = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith("/") || /__MACOSX|\.DS_Store/.test(name)) continue;
      const lhNameLen = dv.getUint16(localOffset + 26, true), lhExtraLen = dv.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      const comp = bytes.subarray(dataStart, dataStart + compSize);
      let data; if (method === 0) data = comp; else if (method === 8) data = await inflateRaw(comp); else continue;
      out.push({ name, text: new TextDecoder().decode(data) });
    }
    return out;
  }
  function keyToGl(name) { const base = String(name).split("/").pop(); const m = base.match(/GL\d{7}/i); return m ? m[0].toUpperCase() : base.replace(/\.[^.]+$/, ""); }
  function parseTxt(text) { return text.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(s => s && !/^GENE[_ ]?SYMBOL$/i.test(s) && !/^SYMBOL$/i.test(s) && !/^GENE$/i.test(s)); }
  function parseTable(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim()); if (!lines.length) return {};
    const delim = lines[0].indexOf("\t") >= 0 ? "\t" : ",";
    const rows = lines.map(l => l.split(delim).map(c => c.trim().replace(/^"|"$/g, "")));
    const header = rows[0].map(s => s.toLowerCase()); let start = 0, glCol = 0, geneCol = 1;
    if (header.some(h => /gene|gl|list|symbol/.test(h))) {
      start = 1; glCol = header.findIndex(h => /list|gl_?name|^gl$/.test(h)); if (glCol < 0) glCol = 0;
      geneCol = header.findIndex((h, i) => i !== glCol && /gene|symbol/.test(h)); if (geneCol < 0) geneCol = glCol === 0 ? 1 : 0;
    } else { glCol = rows[0].findIndex(c => /GL\d{7}/i.test(c)); if (glCol < 0) glCol = 0; geneCol = glCol === 0 ? 1 : 0; }
    const map = {};
    for (let i = start; i < rows.length; i++) {
      const r = rows[i]; if (r.length <= Math.max(glCol, geneCol)) continue;
      const gm = r[glCol].match(/GL\d{7}/i); const gl = gm ? gm[0].toUpperCase() : r[glCol];
      const genes = (r[geneCol] || "").split(/[;,\s|]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
      if (!genes.length) continue; (map[gl] = map[gl] || new Set()); genes.forEach(g => map[gl].add(g));
    }
    const out = {}; Object.keys(map).forEach(k => out[k] = Array.from(map[k])); return out;
  }
  function applyMembers(map) { G.lists.forEach(l => { const g = map[l.gl]; l.genes = (g && g.length) ? Array.from(new Set(g.map(x => String(x).toUpperCase()))).sort() : []; }); }
  function previewStats(map) { const glSet = new Set(G.lists.map(l => l.gl)); let matched = 0, genes = 0, unmatched = 0; Object.keys(map).forEach(k => { if (glSet.has(k)) { matched++; genes += map[k].length; } else unmatched++; }); return { matched, lists: G.lists.length, genes, unmatched }; }

  function idb() { return new Promise((res, rej) => { const r = indexedDB.open("genedex", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
  async function idbPut(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  async function idbDel(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

  // ---- contrast classification ---------------------------------------------
  // Most contrasts are only encoded in free text ("AD vs. control", "AD vs.
  // Resilient", "early AD vs late AD"…). Normalise the two compared groups to
  // a small canonical vocabulary and store l.contrast = "GroupA vs GroupB".
  function canonContrastGroup(s) {
    s = String(s).toLowerCase().trim();
    if (/no dementia|controls?\b|^ctr$|\bctr\b|healthy|non-?demented/.test(s)) return "CTR";
    if (/early ad/.test(s)) return "Early AD";
    if (/late ad/.test(s)) return "Late AD";
    if (/resilien/.test(s)) return "Resilient";
    if (/covid/.test(s)) return "COVID-19";
    if (/all other|other cells|other microglial|\brest\b/.test(s)) return "Rest";
    if (/\bad\b|alzheimer|dementia/.test(s)) return "AD";
    return null;
  }
  const CONTRAST_RE = /([A-Za-z0-9\u03b1\u03b2\u0391\u0392\-\/\+\.\s]{2,40}?)\s+vs\.?\s+([A-Za-z0-9\u03b1\u03b2\u0391\u0392\-\/\+\.]+(?:\s+[A-Za-z0-9\u03b1\u03b2\u0391\u0392\-\/\+\.]+){0,3})/i;
  function classifyContrasts(lists) {
    lists.forEach(l => {
      const hay = (l.notes || "") + " || " + (l.short || "") + " " + (l.name || "");
      const m = hay.match(CONTRAST_RE);
      let contrast = "";
      if (m) {
        const a = canonContrastGroup(m[1]), b = canonContrastGroup(m[2]);
        if (a && b && a !== b) {
          const pair = [a, b].sort();
          if (!pair.includes("Rest")) contrast = pair.join(" vs ");
        }
      }
      l.contrast = contrast;
    });
    const cc = {}; lists.forEach(l => { if (l.contrast) cc[l.contrast] = (cc[l.contrast] || 0) + 1; });
    // order by descending list count, then name
    G.contrasts = Object.keys(cc).sort((a, b) => cc[b] - cc[a] || a.localeCompare(b));
    G.contrastCounts = cc;
  }

  function classifyListTypes(lists) {
    lists.forEach(l => {
      const hay = ((l.short || "") + " " + (l.name || "") + " " + (l.notes || "")).toLowerCase();
      let t;
      if (/module|wgcna|co-?expression|\bpig\b|co-?expressed/.test(hay)) t = "module";
      else if (l.dir) t = "contrast";
      else if (/marker|genes defining|top \d+ genes|gep |canonical|signature of|defining the/.test(hay) || l.cf.length) t = "marker";
      else t = "other";
      l.listType = t;
    });
    const ts = {}; lists.forEach(l => { if (l.tissue) ts[l.tissue] = (ts[l.tissue] || 0) + 1; });
    G.tissues = Object.keys(ts).sort();
    G.tissueCounts = ts;
    const tc = {}; lists.forEach(l => tc[l.listType] = (tc[l.listType] || 0) + 1);
    G.listTypeCounts = tc;
  }
  G.LIST_TYPES = [
    { id: "marker", label: "Cell-type markers" },
    { id: "contrast", label: "Genes from contrast" },
    { id: "module", label: "Gene modules" },
    { id: "other", label: "Other / curated" },
  ];

  G.io = { unzip, parseTxt, parseTable, keyToGl, previewStats };
  G.persistRealData = async (map, label) => { const stats = previewStats(map); await idbPut("genelists", { map, label: label || "Uploaded data", stats, ts: Date.now() }); return stats; };
  G.clearRealData = async () => { await idbDel("genelists"); };

  // ---- pairwise list similarity (lazy-loaded) -------------------------------
  function b64ToBytes(b64) { const bin = atob(b64); const n = bin.length; const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i); return out; }
  let simPromise = null;
  G.loadSimilarity = function () {
    if (simPromise) return simPromise;
    simPromise = (async () => {
      const r = await fetch("data/similarity.json");
      const d = await r.json();
      const n = d.n, scale = d.corScale;
      const cb = b64ToBytes(d.cor_b64);
      const cor = new Int8Array(cb.buffer, cb.byteOffset, n * n);
      const sig = b64ToBytes(d.sig_b64); // round(-log10(padj)*10), 255 = capped/self
      const idx = {}; d.ids.forEach((g, i) => idx[g] = i);
      const padjOf = (s) => s >= 255 ? 0 : Math.pow(10, -s / 10);
      const sim = {
        n: n, ids: d.ids, names: d.names, idx: idx, scale: scale,
        has: (g) => g in idx,
        cor: (i, j) => cor[i * n + j] * scale,
        corById: (a, b) => { const i = idx[a], j = idx[b]; return (i == null || j == null) ? null : cor[i * n + j] * scale; },
        padjById: (a, b) => { const i = idx[a], j = idx[b]; return (i == null || j == null) ? null : padjOf(sig[i * n + j]); },
        // all partners of g, sorted by descending correlation
        neighbors: (g) => {
          const i = idx[g]; if (i == null) return [];
          const out = [];
          for (let j = 0; j < n; j++) { if (j === i) continue; out.push({ id: d.ids[j], cor: cor[i * n + j] * scale, padj: padjOf(sig[i * n + j]) }); }
          out.sort((a, b) => b.cor - a.cor);
          return out;
        },
      };
      G.sim = sim;
      return sim;
    })();
    return simPromise;
  };

  // ---- bootstrap ------------------------------------------------------------
  G.ready = (async function () {
    const res = await fetch("data/genedex-meta.json");
    G.lists = await res.json();
    // Normalise directionality casing — source data mixes "Up"/"up" and "Down"/"down"
    // (e.g. the SEA-AD / Gabitto selective-vulnerability lists use lowercase), which
    // otherwise fails the many `dir === "Up"` comparisons and leaves them uncoloured.
    G.lists.forEach(l => { const d = (l.dir || "").trim().toLowerCase(); l.dir = d === "up" ? "Up" : d === "down" ? "Down" : (l.dir || ""); });
    // Canonicalise ff/cf facet-name casing across the whole collection: source
    // data occasionally spells the same facet with different casing (e.g.
    // "Cognitive dysfunction" vs "Cognitive Dysfunction"), which would
    // otherwise split one facet into two throughout every facet-driven
    // feature (colouring, clustering, filters, the network). Pick the
    // most-frequent casing per lowercase key and remap every list to it, so
    // all downstream facet comparisons are effectively case-insensitive.
    function canonicaliseFacets(key) {
      const counts = {};
      G.lists.forEach(l => l[key].forEach(f => { const k = f.toLowerCase(); (counts[k] = counts[k] || {}); counts[k][f] = (counts[k][f] || 0) + 1; }));
      const canon = {};
      Object.entries(counts).forEach(([k, variants]) => { canon[k] = Object.entries(variants).sort((a, b) => b[1] - a[1])[0][0]; });
      G.lists.forEach(l => { l[key] = l[key].map(f => canon[f.toLowerCase()]); });
      return canon;
    }
    G.facetCanon = { ff: canonicaliseFacets("ff"), cf: canonicaliseFacets("cf") };
    // Some facet tags are themselves compound ("Alzheimer's disease and Amyloid
    // load and Tau load") — kept intact as the list's own descriptive tag, but
    // every facet-driven feature (filters, fingerprint columns, consensus
    // grouping, the facet network) needs the *atomic* facets so selecting
    // "Amyloid load" also picks up lists whose tag happens to be compound.
    const splitAtoms = (arr) => { const out = []; arr.forEach(f => f.split(/\s+and\s+/i).forEach(p => { const t = p.trim(); if (t) out.push(t); })); return Array.from(new Set(out)); };
    G.lists.forEach(l => { l.ffAtoms = splitAtoms(l.ff); l.cfAtoms = splitAtoms(l.cf); });
    function canonicaliseAtoms(key) {
      const counts = {};
      G.lists.forEach(l => l[key].forEach(f => { const k = f.toLowerCase(); (counts[k] = counts[k] || {}); counts[k][f] = (counts[k][f] || 0) + 1; }));
      const canon = {};
      Object.entries(counts).forEach(([k, variants]) => { canon[k] = Object.entries(variants).sort((a, b) => b[1] - a[1])[0][0]; });
      G.lists.forEach(l => { l[key] = l[key].map(f => canon[f.toLowerCase()]); });
      return canon;
    }
    G.facetCanon.ffAtoms = canonicaliseAtoms("ffAtoms");
    G.facetCanon.cfAtoms = canonicaliseAtoms("cfAtoms");
    // Case-insensitive facet lookup: resolve any-case input to the canonical
    // stored facet string (or null if no such facet exists).
    G.resolveFacet = (name) => { if (!name) return null; const k = String(name).trim().toLowerCase(); return G.facetCanon.ffAtoms[k] || G.facetCanon.cfAtoms[k] || G.facetCanon.ff[k] || G.facetCanon.cf[k] || null; };
    classifyListTypes(G.lists);
    classifyContrasts(G.lists);
    let applied = false;
    // 1) user-uploaded data in IndexedDB takes precedence (manual override)
    try { const stored = await idbGet("genelists"); if (stored && stored.map) { applyMembers(stored.map); G.synthetic = false; G.dataLabel = stored.label || "Uploaded data"; G.dataStats = stored.stats; applied = true; } } catch (e) {}
    // 2) otherwise load the bundled real per-list gene memberships
    if (!applied) {
      try {
        const mres = await fetch("data/genedex-members.json");
        if (mres.ok) {
          const map = await mres.json();
          applyMembers(map);
          G.synthetic = false;
          G.dataLabel = "Curated gene lists";
          G.dataStats = previewStats(map);
          applied = true;
        }
      } catch (e) {}
    }
    // 3) last resort: deterministic synthetic placeholder genes
    if (!applied) { buildSyntheticMembers(G.lists); G.synthetic = true; G.dataLabel = "Demo (synthetic)"; }
    if (!G.facetPool) G.facetPool = {}; // real-data mode has no synthetic facet pool; empty = no per-facet gene restriction
    buildIndices();
    // Alias map (HGNC): keep only entries that resolve a symbol absent from the
    // curated universe onto one present in it. Numeric keys (Excel-mangled
    // source rows) are discarded.
    G.aliases = {};
    try {
      const ares = await fetch("data/gene-aliases.json");
      if (ares.ok) {
        const raw = await ares.json();
        let n = 0;
        for (const k in raw) {
          const from = String(k).trim().toUpperCase();
          const to = String(Array.isArray(raw[k]) ? raw[k][0] : raw[k]).trim().toUpperCase();
          if (!from || !to || from === to || /^\d+$/.test(from)) continue;
          if (G.geneIndex[from] || !G.geneIndex[to]) continue;
          G.aliases[from] = to; n++;
        }
        G.aliasCount = n;
      }
    } catch (e) { G.aliasCount = 0; }
    return G;
  })();

  window.Genedex = G;
})();
