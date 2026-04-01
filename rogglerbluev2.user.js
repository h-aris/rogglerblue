// ==UserScript==
// @name         Roggler Blue v2.0
// @version      2.0.7
// @description  Mode 1: resizable sidebar. Mode 2: 2-col panels + mod/basetype badges.
// @downloadURL  https://github.com/h-aris/rogglerblue/raw/refs/heads/main/rogglerbluev2.user.js
// @match        https://poe.ninja/poe1/builds/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SIDEBAR_DEFAULT   = 270;
  const SIDEBAR_MIN       = 200;
  const SIDEBAR_MAX       = 1000;
  const GROUP_H           = 700;
  const BASES_REVERSE_URL = 'https://raw.githubusercontent.com/h-aris/rogglerblue/refs/heads/main/mods/bases_reverse.json';
  const MODS_SPLIT_BASE   = 'https://raw.githubusercontent.com/h-aris/rogglerblue/refs/heads/main/mods/mods_split/';
  const ICON_BASE         = 'https://raw.githubusercontent.com/h-aris/rogglerblue/main/icons/';
  const BADGE_WIDTH       = 120;   // px — fixed allocation for badge area
  const BADGE_PAD         = 6;     // px — gap between badge area and text
  const ICON_SIZE         = 22;    // px — icon dimensions
  const LOC_W             = 16;    // px — loc badge width
  const BADGES_LEFT       = 7;     // px — offset from cell left edge to badge container
  const MAX_MOD_ICONS     = 2;   // max category icons shown inline per mod (excluding [...])
  const SB_W              = 40;
  const THUMB_PAD         = 5;
  const UNKNOWN_GREY      = '#9ca3af';
  const UNKNOWN_DARK      = '#374151';
  // BT dual-attr icon layout
  const BT_ICON_GAP       = 8;    // px gap between dual attr icons
  const BT_DUAL_LEFT      = 25;    // px left offset for dual-attr bt icons
  // Single-attr center = BT_DUAL_LEFT + (24+BT_ICON_GAP+24)/2 - ICON_SIZE/2
  const BT_SINGLE_LEFT    = Math.round(BT_DUAL_LEFT + (ICON_SIZE + BT_ICON_GAP + ICON_SIZE) / 2 - ICON_SIZE / 2);

  const CAT_PRIORITY = {
    normal:0, essence:1, veiled:2, searing:3, eater:4, delve:5,
    incursion:6, master:7, elder:8, shaper:9, crusader:10, redeemer:11,
    hunter:12, warlord:13, bestiary:14, synthesis:15, corrupted:16,
  };
  const LOC_ORD          = { P:0, S:1, I:2 };
  const ELLIPSIS_IGNORE  = new Set(['synthesis','corrupted']);

  const ICON_MAP = {
    normal:    'base-symbol.png',    essence:   'essence-symbol.webp',
    veiled:    'veiled-symbol.webp', delve:     'delve-symbol.webp',
    incursion: 'incursion-symbol.webp', master: 'craftingbench-symbol.webp',
    searing:   'exarch-symbol.webp', eater:    'eater-symbol.webp',
    elder:     'elder-symbol.webp',  shaper:   'shaper-symbol.webp',
    crusader:  'crusader-symbol.webp', redeemer:'redeemer-symbol.webp',
    hunter:    'hunter-symbol.webp', warlord:  'warlord-symbol.webp',
    bestiary:  'bestiary-symbol.webp', synthesis:'synthesis-symbol.webp',
    corrupted: 'corruption-symbol.webp', enchant:'enchant-symbol.png',
  };
  const ATTR_COLORS = { str:'#a94444', dex:'#3f7f5f', int:'#3f5f8f' };
  const ATTR_ICONS  = { str:'str-symbol2.png', dex:'dex-symbol2.png', int:'int-symbol2.png' };
  const PURE_ATTRS  = new Set(['str','dex','int']);

  // ── State ──────────────────────────────────────────────────────────────────
  let mode          = 1;
  let currentWidth  = SIDEBAR_DEFAULT;
  let layoutObs     = null;
  let resizeObs     = null;
  let baseLookup    = null;
  let currentModIdx = null;
  let currentBtTag  = null;
  const modCache    = new Map();
  let grid, navGrid, sidebar, handle;

  // ── CSS ────────────────────────────────────────────────────────────────────
  const css = `
    .leaderboard-top { display: none !important; }
    body {
      font-family: unset !important; background-image: none !important;
      background-color: hsl(214.3,53.8%,7.6%) !important; --background-image: none !important;
    }
    nav#openSidebar { width: 100% !important; min-width: 0 !important; }
    body.pn-mode2 main.overflow-auto {
      visibility: hidden !important; height: 0 !important;
      min-height: 0 !important; overflow: hidden !important;
    }
    #pn-float-box {
      position: fixed; top: 88px; left: 115px; z-index: 10000;
      background: #242e38; border-radius: 6px; padding: 10px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    #pn-mode-toggle {
      padding: 8px 16px; font-size: 22px; cursor: pointer;
      background: #2a2a2a; color: #ccc; border: 1px solid #444;
      border-radius: 4px; user-select: none; width: 100%;
    }
    #pn-mode-toggle:hover { background: #3a3a3a; }
    #pn-badge-toggle {
      padding: 4px 10px; font-size: 12px; cursor: pointer;
      background: #2a2a2a; color: #888; border: 1px solid #444;
      border-radius: 4px; user-select: none; width: 100%; display: none;
    }
    #pn-badge-toggle:hover { background: #3a3a3a; }
    #pn-badge-toggle.active { color: #79c0ff; border-color: #79c0ff; }
    body.pn-mode2 #pn-badge-toggle { display: block; }
    #pn-resize-handle {
      position: absolute; top: 0; width: 8px; height: 100%;
      cursor: col-resize; z-index: 9999; background: transparent; transition: background 0.15s;
    }
    #pn-resize-handle:hover, #pn-resize-handle.dragging { background: rgba(255,255,255,0.15); }

    /* ── Universal cell indent for mods section (also grey border) ───────── */
    body.pn-mode2 .rb-mods-sec .filter-list-cell.filter-text {
      position: relative !important;
      padding-left: ${BADGE_WIDTH + BADGE_PAD}px !important;
      border-left: 3px solid ${UNKNOWN_GREY} !important;
    }
    /* BT section: indent only — border comes entirely from .rb-bt-bars elements */
    body.pn-mode2 .rb-bt-sec .filter-list-cell.filter-text {
      position: relative !important;
      padding-left: ${BADGE_WIDTH + BADGE_PAD}px !important;
    }

    /* Recognized mod cell borders override grey */
    body.pn-mode2 .filter-list-cell.filter-text[data-mod-first="P"] { border-left: 3px solid #c8a951 !important; }
    body.pn-mode2 .filter-list-cell.filter-text[data-mod-first="S"] { border-left: 3px solid #6fa0d0 !important; }
    body.pn-mode2 .filter-list-cell.filter-text[data-mod-first="I"] { border-left: 3px solid #9d7cd8 !important; }
    /* data-mod-first="?" keeps UNKNOWN_GREY via the rb-mods-sec rule */

    /* ── Mod badge container ─────────────────────────────────────────────── */
    .rb-badges {
      display: none; position: absolute; left: ${BADGES_LEFT}px; top: 50%; transform: translateY(-50%);
      width: ${BADGE_WIDTH - 4}px; align-items: center; gap: 2px; overflow: hidden; cursor: default;
    }
    body.pn-mode2:not(.rb-no-badges) .rb-badges { display: flex; }

    .rb-loc {
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700;
      width: ${LOC_W}px; min-width: ${LOC_W}px; height: ${ICON_SIZE}px;
      border-radius: 2px; flex-shrink: 0; line-height: 1;
    }
    .rb-loc-P { background: #2d2510; color: #c8a951; }
    .rb-loc-S { background: #0e1e2d; color: #6fa0d0; }
    .rb-loc-I { background: #1e1228; color: #9d7cd8; }

    .rb-icon { width: ${ICON_SIZE}px; min-width: ${ICON_SIZE}px; height: ${ICON_SIZE}px; object-fit: contain; flex-shrink: 0; }
    .rb-sep  { color: #555; font-size: 10px; padding: 0; line-height: 1; flex-shrink: 0; }

    /* [...] and [?] both use dark bg + light text */
    .rb-ellipsis {
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; padding: 0 3px; height: ${ICON_SIZE}px;
      background: ${UNKNOWN_DARK}; color: ${UNKNOWN_GREY};
      border-radius: 2px; flex-shrink: 0; white-space: nowrap;
      margin-left: 3px; /* extra 3px + flex gap 2px = 5px total before ellipsis */
    }
    .rb-unknown-badge {
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; padding: 0 4px; height: ${ICON_SIZE}px;
      background: ${UNKNOWN_DARK}; color: ${UNKNOWN_GREY};
      border-radius: 2px; flex-shrink: 0;
    }

    /* ── Basetype bars (always visible in mode 2) ────────────────────────── */
    .rb-bt-bars { position: absolute; left: 0; top: 0; height: 100%; display: flex; z-index: 1; pointer-events: none; }
    .rb-bt-bar  { height: 100%; flex-shrink: 0; }

    /* Basetype icon badges */
    .rb-bt-icons {
      display: none; position: absolute; top: 50%; transform: translateY(-50%);
      align-items: center; cursor: default;
    }
    body.pn-mode2:not(.rb-no-badges) .rb-bt-icons { display: flex; }

    /* ── Scrollbar ───────────────────────────────────────────────────────── */
    .filter-list-wrapper { position: relative !important; padding-right: ${SB_W}px !important; }
    .rb-sb-track {
      position: absolute; right: 0; top: 0; width: ${SB_W}px; height: 100%;
      background: #131b24; z-index: 50; border-left: 1px solid #1e2d3d; box-sizing: border-box;
    }
    .rb-sb-thumb {
      position: absolute; left: 4px; width: calc(100% - 8px);
      background: #2d3f55; border-radius: 4px; cursor: grab; min-height: 20px;
      transition: background 0.12s; box-sizing: border-box;
    }
    .rb-sb-thumb:hover    { background: #3a5070; }
    .rb-sb-thumb.dragging { background: #4a6088; cursor: grabbing; }

    /* ── Tooltip ─────────────────────────────────────────────────────────── */
    #rb-tooltip {
      position: fixed; display: none; z-index: 99999; background: #161b22;
      border: 1px solid #30363d; border-radius: 6px; padding: 8px 10px;
      pointer-events: none; min-width: 130px; white-space: nowrap;
    }
    .rb-tip-group { margin-bottom: 5px; } .rb-tip-group:last-child { margin-bottom: 0; }
    .rb-tip-label { font-size: 10px; font-weight: 700; margin-bottom: 3px; }
    .rb-tip-label-P { color: #c8a951; } .rb-tip-label-S { color: #6fa0d0; } .rb-tip-label-I { color: #9d7cd8; }
    .rb-tip-row { display: flex; align-items: center; gap: 5px; padding: 1px 0 1px 4px; font-size: 11px; color: #8b949e; }
    .rb-tip-row img { width: 14px; height: 14px; object-fit: contain; }

    /* Suppress poe.ninja hover panels (Radix UI popovers) in mode 2 */
    body.pn-mode2 [data-radix-popper-content-wrapper],
    body.pn-mode2 [role="tooltip"] { display: none !important; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const tooltip = document.createElement('div');
  tooltip.id = 'rb-tooltip';
  document.body.appendChild(tooltip);

  function removeBackground() {
    document.body.style.setProperty('--background-image', 'none');
    document.body.style.backgroundImage = 'none';
    document.querySelectorAll('[style*="bg2"]').forEach(el => { el.style.backgroundImage = 'none'; });
  }
  removeBackground();
  setTimeout(removeBackground, 1000);

  // ── Float box ──────────────────────────────────────────────────────────────
  const btn      = document.createElement('button'); btn.id = 'pn-mode-toggle';
  const badgeBtn = document.createElement('button'); badgeBtn.id = 'pn-badge-toggle';
  badgeBtn.textContent = 'Badges: ON'; badgeBtn.classList.add('active');
  const box = document.createElement('div'); box.id = 'pn-float-box';
  box.appendChild(btn); box.appendChild(badgeBtn); document.body.appendChild(box);

  badgeBtn.addEventListener('click', () => {
    const hidden = document.body.classList.toggle('rb-no-badges');
    badgeBtn.textContent = hidden ? 'Badges: OFF' : 'Badges: ON';
    badgeBtn.classList.toggle('active', !hidden);
  });

  const SEL_WHITESPACE = 'section.bg-clip-padding header div[class*="_layout-cluster_"] div.whitespace-nowrap';
  const SEL_CLEARBTN   = 'section.bg-clip-padding header div[class*="_layout-cluster_"] button.text-coolgrey-300';
  const SEL_SORTEDTH   = 'th[class*="_sorted_"]';
  const FLOAT_CONFIG   = [
    { sel: SEL_WHITESPACE, left: 100 },
    { sel: SEL_CLEARBTN,   left: 167 },
    { sel: SEL_SORTEDTH,   left: 188 },
  ];

  // ── Section helpers ────────────────────────────────────────────────────────
  function getSectionByTitle(regex) {
    if (!navGrid) return null;
    for (const sec of navGrid.querySelectorAll('section.bg-clip-padding')) {
      const header = sec.querySelector(':scope > header');
      if (!header) continue;
      const h2 = header.querySelector('h2');
      if (regex.test((h2 || header).textContent)) return sec;
    }
    return null;
  }
  function getModSection() { return getSectionByTitle(/mods/i); }
  function getBtSection()  { return getSectionByTitle(/base\s*types/i); }

  function stripCellText(cell, removeSelector) {
    const clone = cell.cloneNode(true);
    if (removeSelector) clone.querySelectorAll(removeSelector).forEach(el => el.remove());
    clone.querySelectorAll('[class*="percent"],[class*="value"],[class*="count"]').forEach(el => el.remove());
    return clone.textContent.trim().replace(/\s*\d+(\.\d+)?%?\s*$/, '').trim().toLowerCase();
  }
  const getModText      = cell => stripCellText(cell, '.rb-badges');
  const getBasetypeText = cell => stripCellText(cell, '.rb-bt-bars,.rb-bt-icons');

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadBasesReverse() {
    try {
      const data = await (await fetch(BASES_REVERSE_URL)).json();
      baseLookup = {};
      for (const [name, tags] of Object.entries(data))
        baseLookup[name.toLowerCase()] = tags;
    } catch (e) { console.error('[RogglerBlue] baseLookup failed:', e); baseLookup = {}; }
  }

  function sortModIndex(idx) {
    for (const arr of Object.values(idx)) {
      arr.sort((a, b) => {
        const cp = (CAT_PRIORITY[a.key] ?? 999) - (CAT_PRIORITY[b.key] ?? 999);
        return cp !== 0 ? cp : (LOC_ORD[a.loc] ?? 9) - (LOC_ORD[b.loc] ?? 9);
      });
    }
  }

  async function updateModIndex() {
    if (!baseLookup) return;
    const btSec = getBtSection();
    if (!btSec) { _setModIdx(null, null); return; }

    const topCell = btSec.querySelector('.filter-list-cell.filter-text.included')
                 || btSec.querySelector('.filter-list-cell.filter-text');
    if (!topCell) { _setModIdx(null, null); return; }

    const name = getBasetypeText(topCell);
    const tags  = baseLookup[name];
    if (!tags || !tags.length) return; // unrecognized — keep current mod index

    const specificTag = tags[tags.length - 1];
    const classTag    = specificTag.split('_').pop();
    if (currentBtTag === specificTag && currentModIdx) return;

    const cached = modCache.get(specificTag) || modCache.get(classTag);
    if (cached) { _setModIdx(specificTag, cached); return; }

    for (const tag of [specificTag, classTag]) {
      try {
        const res = await fetch(MODS_SPLIT_BASE + tag + '.json');
        if (!res.ok) continue;
        const idx = {};
        for (const [k, v] of Object.entries((await res.json()).modIndex || {}))
          idx[k.toLowerCase()] = v;
        sortModIndex(idx);
        modCache.set(tag, idx);
        _setModIdx(specificTag, idx);
        return;
      } catch (e) {}
    }
    _setModIdx(null, null);
  }

  function _setModIdx(tag, idx) {
    const changed = tag !== currentBtTag || idx !== currentModIdx;
    currentBtTag  = tag;
    currentModIdx = idx;
    if (changed) highlightMods();
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────
  function attachTooltip(el, html) {
    el.addEventListener('mouseenter', () => {
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      const r = el.getBoundingClientRect(), h = tooltip.offsetHeight;
      tooltip.style.top  = (r.top - h - 6 < 4 ? r.bottom + 4 : r.top - h - 6) + 'px';
      tooltip.style.left = r.left + 'px';
    });
    el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  }

  // ── Mod badge element ──────────────────────────────────────────────────────
  function makeBadgeEl(arr) {
    const wrap = document.createElement('span');
    wrap.className = 'rb-badges';

    const hasNonSynth = arr.some(e => e.key !== 'synthesis');
    const inlineArr   = hasNonSynth ? arr.filter(e => e.key !== 'synthesis') : arr;
    if (!inlineArr.length) return { el: wrap, firstLoc: null };

    // Show top MAX_MOD_ICONS entries by priority, across any categories.
    // Loc badge shown once per loc type; / separator on loc transitions.
    const shownEntries = inlineArr.slice(0, MAX_MOD_ICONS);
    const showEllipsis = inlineArr.slice(MAX_MOD_ICONS).some(e => !ELLIPSIS_IGNORE.has(e.key));

    let dispLoc = null, firstLoc = null;
    const shownLocs = {};
    for (const e of shownEntries) {
      if (dispLoc !== null && e.loc !== dispLoc) {
        const sep = document.createElement('span');
        sep.className = 'rb-sep'; sep.textContent = '/';
        wrap.appendChild(sep);
      }
      if (!shownLocs[e.loc]) {
        shownLocs[e.loc] = true;
        const locEl = document.createElement('span');
        locEl.className = 'rb-loc rb-loc-' + e.loc;
        locEl.textContent = e.loc;
        wrap.appendChild(locEl);
        if (!firstLoc) firstLoc = e.loc;
      }
      if (ICON_MAP[e.key]) {
        const img = document.createElement('img');
        img.className = 'rb-icon'; img.src = ICON_BASE + ICON_MAP[e.key];
        wrap.appendChild(img);
      }
      dispLoc = e.loc;
    }

    if (showEllipsis) {
      const ell = document.createElement('span');
      ell.className = 'rb-ellipsis'; ell.textContent = '...';
      wrap.appendChild(ell);
    }

    // Full tooltip
    const groups = { P:[], S:[], I:[] };
    for (const e of arr) { if (groups[e.loc]) groups[e.loc].push(e); }
    const ll = { P:'Prefix', S:'Suffix', I:'Implicit' };
    let tip = '';
    for (const loc of ['P','S','I']) {
      if (!groups[loc].length) continue;
      tip += '<div class="rb-tip-group"><div class="rb-tip-label rb-tip-label-'+loc+'">'+ll[loc]+'</div>';
      for (const e of groups[loc]) {
        const f = ICON_MAP[e.key];
        tip += '<div class="rb-tip-row">'+(f?'<img src="'+ICON_BASE+f+'">':'')+e.title+'</div>';
      }
      tip += '</div>';
    }
    // Tooltip only on [...] — if no ellipsis shown, attach to wrap as fallback
    if (showEllipsis) {
      const ellEl = wrap.querySelector('.rb-ellipsis');
      if (ellEl) attachTooltip(ellEl, tip);
    }
    return { el: wrap, firstLoc };
  }

  // ── Highlight functions ────────────────────────────────────────────────────
  function highlightMods() {
    if (mode !== 2) return;
    const sec = getModSection();
    if (!sec) return;
    sec.classList.add('rb-mods-sec');

    sec.querySelectorAll('.filter-list-cell.filter-text').forEach(cell => {
      cell.querySelector('.rb-badges')?.remove();
      delete cell.dataset.modFirst;

      const qBadge = () => {
        const wrap = document.createElement('span'); wrap.className = 'rb-badges';
        const q = document.createElement('span'); q.className = 'rb-unknown-badge'; q.textContent = '?';
        wrap.appendChild(q); return wrap;
      };

      if (!currentModIdx) {
        cell.prepend(qBadge()); cell.dataset.modFirst = '?'; return;
      }
      const arr = currentModIdx[getModText(cell)];
      if (!arr || !arr.length) {
        cell.prepend(qBadge()); cell.dataset.modFirst = '?'; return;
      }
      const { el, firstLoc } = makeBadgeEl(arr);
      if (firstLoc) cell.dataset.modFirst = firstLoc;
      cell.prepend(el);
    });
  }

  function highlightBasetypes() {
    if (mode !== 2 || !baseLookup) return;
    const btSec = getBtSection();
    if (!btSec) return;
    btSec.classList.add('rb-bt-sec');

    btSec.querySelectorAll('.filter-list-cell.filter-text').forEach(cell => {
      cell.querySelector('.rb-bt-bars')?.remove();
      cell.querySelector('.rb-bt-icons')?.remove();

      const tags  = baseLookup[getBasetypeText(cell)];
      const attrs = tags ? tags.filter(t => PURE_ATTRS.has(t)) : [];

      // ── Bars ──────────────────────────────────────────────────────────────
      if (!tags || !tags.length) {
        // Unrecognized — grey bar + [?] badge
        const bars = document.createElement('span'); bars.className = 'rb-bt-bars';
        const bar  = document.createElement('span'); bar.className = 'rb-bt-bar';
        bar.style.cssText = 'width:6px;background:' + UNKNOWN_GREY;
        bars.appendChild(bar); cell.appendChild(bars);

        const icons = document.createElement('span'); icons.className = 'rb-bt-icons';
        icons.style.left = 4 + BT_SINGLE_LEFT + 'px';
        const q = document.createElement('span'); q.className = 'rb-unknown-badge'; q.textContent = '?';
        icons.appendChild(q); cell.prepend(icons);
        return;
      }

      if (attrs.length > 0) {
        // Colored bars — width split evenly across attrs
        const bars = document.createElement('span'); bars.className = 'rb-bt-bars';
        const w = Math.floor(6 / attrs.length);
        attrs.forEach(a => {
          const bar = document.createElement('span'); bar.className = 'rb-bt-bar';
          bar.style.cssText = 'width:' + w + 'px;background:' + ATTR_COLORS[a];
          bars.appendChild(bar);
        });
        cell.appendChild(bars);
      }
      // Recognized no-attr (jewellery, quiver): no bar

      // ── Attr icon badges ───────────────────────────────────────────────────
      const icons = document.createElement('span'); icons.className = 'rb-bt-icons';
      if (attrs.length === 0) {
        // Jewellery/quiver: no icons, no badge
        return;
      } else if (attrs.length === 1) {
        icons.style.cssText = 'left:' + BT_SINGLE_LEFT + 'px; gap:0px';
      } else {
        icons.style.cssText = 'left:' + BT_DUAL_LEFT + 'px; gap:' + BT_ICON_GAP + 'px';
      }
      attrs.forEach(a => {
        const img = document.createElement('img');
        img.className = 'rb-icon'; img.src = ICON_BASE + ATTR_ICONS[a];
        icons.appendChild(img);
      });
      const tipHtml = '<div class="rb-tip-group"><div class="rb-tip-label" style="color:#c9d1d9">'
        + tags[tags.length-1] + '</div>'
        + tags.map(t => '<div class="rb-tip-row">'+t+'</div>').join('') + '</div>';
      attachTooltip(icons, tipHtml);
      cell.prepend(icons);
    });
  }

  function highlightAll() {
    highlightBasetypes();
    highlightMods();
  }

  // ── Custom scrollbar ───────────────────────────────────────────────────────
  function installScrollbar(wrapper) {
    if (wrapper._rbSb) return;
    const list = wrapper.querySelector('.filter-list');
    if (!list) return;
    const track = document.createElement('div'); track.className = 'rb-sb-track';
    const thumb = document.createElement('div'); thumb.className = 'rb-sb-thumb';
    track.appendChild(thumb); wrapper.appendChild(track);

    function update() {
      const sh=list.scrollHeight, ch=list.clientHeight, st=list.scrollTop, th=track.offsetHeight;
      if (!th||sh<=ch) { thumb.style.height='0'; return; }
      const usable=th-THUMB_PAD*2, thumbH=Math.max(20,usable*ch/sh);
      thumb.style.height=thumbH+'px';
      thumb.style.top=(THUMB_PAD+(sh>ch?st/(sh-ch)*(usable-thumbH):0))+'px';
    }
    list.addEventListener('scroll', update, { passive:true });
    const ro = new ResizeObserver(update);
    ro.observe(list); ro.observe(track); update();

    track.addEventListener('wheel', e => { list.scrollTop+=e.deltaY; e.preventDefault(); }, { passive:false });
    let drag=false, y0=0, st0=0;
    thumb.addEventListener('mousedown', e => {
      drag=true; y0=e.clientY; st0=list.scrollTop;
      thumb.classList.add('dragging'); e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      const sh=list.scrollHeight, ch=list.clientHeight;
      const travel=track.offsetHeight-THUMB_PAD*2-thumb.offsetHeight;
      if (travel>0) list.scrollTop=Math.max(0,Math.min(sh-ch, st0+(e.clientY-y0)*(sh-ch)/travel));
    });
    document.addEventListener('mouseup', () => { if(drag){drag=false;thumb.classList.remove('dragging');} });
    track.addEventListener('mousedown', e => {
      if (e.target===thumb) return;
      const r=track.getBoundingClientRect();
      list.scrollTop=Math.max(0,Math.min(1,(e.clientY-r.top-THUMB_PAD)/(r.height-THUMB_PAD*2)))*(list.scrollHeight-list.clientHeight);
    });
    wrapper._rbSb = { track, ro };
  }
  function installAllScrollbars() {
    document.querySelectorAll('nav#openSidebar .filter-list-wrapper').forEach(installScrollbar);
  }
  function removeAllScrollbars() {
    document.querySelectorAll('nav#openSidebar .filter-list-wrapper').forEach(w => {
      if (!w._rbSb) return; w._rbSb.ro.disconnect(); w._rbSb.track.remove(); delete w._rbSb;
    });
  }

  // ── Float elements ─────────────────────────────────────────────────────────
  function floatElements() {
    const br=box.getBoundingClientRect(); let top=br.bottom+8;
    FLOAT_CONFIG.forEach(({ sel, left }) => {
      const el=document.querySelector(sel); if (!el) return;
      Object.assign(el.style, { visibility:'visible', position:'fixed', zIndex:'10000', top:top+'px', left:left+'px', background:'#242e38', borderRadius:'6px', padding:'6px 12px' });
      top+=(el.offsetHeight||32)+8;
    });
  }
  function unfloatElements() {
    FLOAT_CONFIG.forEach(({ sel }) => {
      const el=document.querySelector(sel); if (!el) return;
      Object.assign(el.style, { visibility:'', position:'', zIndex:'', top:'', left:'', background:'', borderRadius:'', padding:'' });
    });
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  function compensateHeights() {
    if (resizeObs) resizeObs.disconnect();
    resizeObs = new ResizeObserver(compensateHeights);
    const panels=[...navGrid.children].slice(1);
    for (let i=0; i<panels.length; i+=4) {
      const tL=panels[i], tR=panels[i+1], bL=panels[i+3], bR=panels[i+2];
      if (tL) resizeObs.observe(tL); if (tR) resizeObs.observe(tR);

      // Shrink top panel wrappers if their list content is shorter than rendered height.
      // poe.ninja sizes panels to available space in mode 2, so on re-entry the BT panel
      // with few items ends up oversized. We cap it at actual content height.
      for (const top of [tL, tR]) {
        if (!top) continue;
        const topW = top.querySelector('.filter-list-wrapper');
        if (!topW) continue;
        const topList = topW.querySelector('.filter-list');
        if (topList && topList.scrollHeight > 0 && topList.scrollHeight < topW.offsetHeight)
          topW.style.height = topList.scrollHeight + 'px';
      }

      // Re-read heights after potential top-panel shrink
      const hL=tL?tL.offsetHeight:0, hR=tR?tR.offsetHeight:0;
      if (bL) bL.style.marginTop=hL<hR?-(hR-hL)+'px':'';
      if (bR) bR.style.marginTop=hR<hL?-(hL-hR)+'px':'';
      for (const [top,bot] of [[tL,bL],[tR,bR]]) {
        if (!top||!bot) continue;
        const w=bot.querySelector('.filter-list-wrapper');
        if (w) { const nh=bot.offsetHeight-w.offsetHeight; w.style.height=Math.max(0,GROUP_H-(top===tL?hL:hR)-nh)+'px'; }
      }
    }
    installAllScrollbars();
    highlightAll();
    updateModIndex();
  }

  function positionPanels() {
    const ch=[...navGrid.children];
    if (ch[0]) ch[0].style.gridColumn='1 / -1';
    ch.slice(1).forEach((p,i) => {
      const g=Math.floor(i/4), pos=i%4;
      p.style.gridColumn=(pos===0||pos===3)?'1':'2';
      p.style.gridRow=String((pos<2?g*2:g*2+1)+2);
    });
    requestAnimationFrame(compensateHeights);
  }

  function buildLayout() {
    [...navGrid.children].forEach(p => {
      const w=p.querySelector('.filter-list-wrapper'); p._origWH=w?w.style.height:null;
    });
    Object.assign(navGrid.style, { display:'grid', gridTemplateColumns:`${currentWidth}px 1fr`, columnGap:'8px', alignItems:'start' });
    positionPanels();
    layoutObs=new MutationObserver(positionPanels);
    layoutObs.observe(navGrid, { childList:true });
  }

  function destroyLayout() {
    removeAllScrollbars();
    if (layoutObs) { layoutObs.disconnect(); layoutObs=null; }
    if (resizeObs) { resizeObs.disconnect(); resizeObs=null; }
    Object.assign(navGrid.style, { display:'', gridTemplateColumns:'', columnGap:'', alignItems:'' });
    [...navGrid.children].forEach(p => {
      p.style.gridColumn=p.style.gridRow=p.style.marginTop='';
      const w=p.querySelector('.filter-list-wrapper');
      if (w&&p._origWH!==undefined) w.style.height=p._origWH||'';
      delete p._origWH;
    });
    navGrid.querySelectorAll('.rb-mods-sec,.rb-bt-sec').forEach(el => {
      el.classList.remove('rb-mods-sec','rb-bt-sec');
    });
  }

  function applyMode() {
    if (mode===2) {
      document.body.classList.add('pn-mode2');
      grid.style.gridTemplateColumns='1fr';
      buildLayout();
      requestAnimationFrame(floatElements);
      handle.style.right='auto'; handle.style.left=(currentWidth-4)+'px';
      btn.textContent='Show Builds';
    } else {
      tooltip.style.display='none';
      document.querySelectorAll('.rb-badges,.rb-bt-bars,.rb-bt-icons').forEach(el=>el.remove());
      document.querySelectorAll('[data-mod-first]').forEach(el=>delete el.dataset.modFirst);
      currentModIdx=null; currentBtTag=null;
      unfloatElements(); destroyLayout();
      document.body.classList.remove('pn-mode2');
      grid.style.gridTemplateColumns=`${currentWidth}px 1fr`;
      handle.style.left='auto'; handle.style.right='-4px';
      btn.textContent='Craft Mode';
      setTimeout(installAllScrollbars,400);
    }
  }

  btn.addEventListener('click', () => { mode=mode===1?2:1; applyMode(); });

  function init() {
    sidebar=document.querySelector('nav#openSidebar');
    grid   =document.querySelector('div[class*="_layout-sidebar_"]');
    navGrid=document.querySelector('nav#openSidebar > div.layout-stack');
    if (!sidebar||!grid||!navGrid) { setTimeout(init,300); return; }
    sidebar.style.position='relative';
    handle=document.createElement('div'); handle.id='pn-resize-handle'; sidebar.appendChild(handle);
    loadBasesReverse().then(() => {
      applyMode();
      document.addEventListener('scroll', highlightAll, { passive:true, capture:true });
    });
    let dragging=false, startX;
    handle.addEventListener('mousedown', e => { dragging=true; startX=e.clientX; handle.classList.add('dragging'); e.preventDefault(); });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      currentWidth=Math.min(SIDEBAR_MAX,Math.max(SIDEBAR_MIN,currentWidth+(e.clientX-startX)));
      startX=e.clientX;
      if (mode===2) { navGrid.style.gridTemplateColumns=`${currentWidth}px 1fr`; handle.style.left=(currentWidth-4)+'px'; }
      else           { grid.style.gridTemplateColumns=`${currentWidth}px 1fr`; }
    });
    document.addEventListener('mouseup', () => { if(dragging){dragging=false;handle.classList.remove('dragging');} });
  }

  init();
})();
