// ==UserScript==
// @name         Roggler Blue
// @version      18.0.0
// @description  Mode 1: resizable sidebar + builds. Mode 2: 2-col panels, selected elements floated.
// @match        https://poe.ninja/poe1/builds/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SIDEBAR_DEFAULT = 270;
  const SIDEBAR_MIN     = 200;
  const SIDEBAR_MAX     = 1000;
  const GROUP_H         = 700;

  let mode           = 1;
  let currentWidth   = SIDEBAR_DEFAULT;
  let layoutObserver = null;
  let resizeObserver = null;

  const css = `
    .leaderboard-top { display: none !important; }

    body {
      font-family: unset !important;
      background-image: none !important;
      background-color: hsl(214.3, 53.8%, 7.6%) !important;
      --background-image: none !important;
    }

    nav#openSidebar {
      width: 100% !important;
      min-width: 0 !important;
    }

    body.pn-mode2 main.overflow-auto {
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    #pn-float-box {
      position: fixed;
      top: 88px;
      left: 115px;
      z-index: 10000;
      background: #242e38;
      border-radius: 6px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    #pn-mode-toggle {
      padding: 8px 16px;
      font-size: 22px;
      cursor: pointer;
      background: #2a2a2a;
      color: #ccc;
      border: 1px solid #444;
      border-radius: 4px;
      user-select: none;
      width: 100%;
    }
    #pn-mode-toggle:hover { background: #3a3a3a; }

    #pn-resize-handle {
      position: absolute; top: 0; width: 8px; height: 100%;
      cursor: col-resize; z-index: 9999;
      background: transparent; transition: background 0.15s;
    }
    #pn-resize-handle:hover,
    #pn-resize-handle.dragging { background: rgba(255,255,255,0.15); }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Also strip the background image set as a CSS variable on the element
  function removeBackground() {
    document.body.style.setProperty('--background-image', 'none');
    document.body.style.backgroundImage = 'none';
    // Find and null out any inline background referencing the image
    document.querySelectorAll('[style*="bg2"]').forEach(el => {
      el.style.backgroundImage = 'none';
    });
  }
  removeBackground();
  // Run once more after page settles in case it's applied late
  setTimeout(removeBackground, 1000);

  const btn = document.createElement('button');
  btn.id = 'pn-mode-toggle';

  const box = document.createElement('div');
  box.id = 'pn-float-box';
  box.appendChild(btn);
  document.body.appendChild(box);

  let grid, navGrid, sidebar, handle;

  const SEL_WHITESPACE = 'section.bg-clip-padding header div[class*="_layout-cluster_"] div.whitespace-nowrap';
  const SEL_CLEARBTN   = 'section.bg-clip-padding header div[class*="_layout-cluster_"] button.text-coolgrey-300';
  const SEL_SORTEDTH   = 'th[class*="_sorted_"]';

  const FLOAT_CONFIG = [
    { sel: SEL_WHITESPACE, left: 100 },
    { sel: SEL_CLEARBTN,   left: 167 },
    { sel: SEL_SORTEDTH,   left: 188 },
  ];

  function floatElements() {
    const boxRect = box.getBoundingClientRect();
    let top = boxRect.bottom + 8;

    FLOAT_CONFIG.forEach(({ sel, left }) => {
      const el = document.querySelector(sel);
      if (!el) return;
      Object.assign(el.style, {
        visibility:   'visible',
        position:     'fixed',
        zIndex:       '10000',
        top:          top + 'px',
        left:         left + 'px',
        background:   '#242e38',
        borderRadius: '6px',
        padding:      '6px 12px',
      });
      top += (el.offsetHeight || 32) + 8;
    });
  }

  function unfloatElements() {
    FLOAT_CONFIG.forEach(({ sel }) => {
      const el = document.querySelector(sel);
      if (!el) return;
      Object.assign(el.style, {
        visibility:   '',
        position:     '',
        zIndex:       '',
        top:          '',
        left:         '',
        background:   '',
        borderRadius: '',
        padding:      '',
      });
    });
  }

  function compensateHeights() {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(compensateHeights);

    const panels = [...navGrid.children].slice(1);
    for (let i = 0; i < panels.length; i += 4) {
      const topL = panels[i];
      const topR = panels[i + 1];
      const botL = panels[i + 3];
      const botR = panels[i + 2];

      if (topL) resizeObserver.observe(topL);
      if (topR) resizeObserver.observe(topR);

      const hL = topL ? topL.offsetHeight : 0;
      const hR = topR ? topR.offsetHeight : 0;

      if (botL) botL.style.marginTop = hL < hR ? -(hR - hL) + 'px' : '';
      if (botR) botR.style.marginTop = hR < hL ? -(hL - hR) + 'px' : '';

      if (topL && botL) {
        const wrapper = botL.querySelector('.filter-list-wrapper');
        if (wrapper) {
          const nonWrapperH = botL.offsetHeight - wrapper.offsetHeight;
          wrapper.style.height = Math.max(0, GROUP_H - hL - nonWrapperH) + 'px';
        }
      }
      if (topR && botR) {
        const wrapper = botR.querySelector('.filter-list-wrapper');
        if (wrapper) {
          const nonWrapperH = botR.offsetHeight - wrapper.offsetHeight;
          wrapper.style.height = Math.max(0, GROUP_H - hR - nonWrapperH) + 'px';
        }
      }
    }
  }

  function positionPanels() {
    const children = [...navGrid.children];

    if (children[0]) children[0].style.gridColumn = '1 / -1';

    children.slice(1).forEach((p, i) => {
      const group = Math.floor(i / 4);
      const pos   = i % 4;
      p.style.gridColumn = (pos === 0 || pos === 3) ? '1' : '2';
      p.style.gridRow    = String((pos < 2 ? group * 2 : group * 2 + 1) + 2);
    });

    requestAnimationFrame(compensateHeights);
  }

  function buildLayout() {
    [...navGrid.children].forEach(p => {
      const wrapper = p.querySelector('.filter-list-wrapper');
      p._origWrapperH = wrapper ? wrapper.style.height : null;
    });

    navGrid.style.display             = 'grid';
    navGrid.style.gridTemplateColumns = `${currentWidth}px 1fr`;
    navGrid.style.columnGap           = '8px';
    navGrid.style.alignItems          = 'start';

    positionPanels();

    layoutObserver = new MutationObserver(positionPanels);
    layoutObserver.observe(navGrid, { childList: true });
  }

  function destroyLayout() {
    if (layoutObserver) { layoutObserver.disconnect(); layoutObserver = null; }
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }

    navGrid.style.display             = '';
    navGrid.style.gridTemplateColumns = '';
    navGrid.style.columnGap           = '';
    navGrid.style.alignItems          = '';

    [...navGrid.children].forEach(p => {
      p.style.gridColumn = '';
      p.style.gridRow    = '';
      p.style.marginTop  = '';
      const wrapper = p.querySelector('.filter-list-wrapper');
      if (wrapper && p._origWrapperH !== undefined) {
        wrapper.style.height = p._origWrapperH || '';
      }
      delete p._origWrapperH;
    });
  }

  function applyMode() {
    if (mode === 2) {
      document.body.classList.add('pn-mode2');
      grid.style.gridTemplateColumns = '1fr';
      buildLayout();
      requestAnimationFrame(floatElements);
      handle.style.right = 'auto';
      handle.style.left  = (currentWidth - 4) + 'px';
      btn.textContent = 'Show Builds';
    } else {
      unfloatElements();
      destroyLayout();
      document.body.classList.remove('pn-mode2');
      grid.style.gridTemplateColumns = `${currentWidth}px 1fr`;
      handle.style.left  = 'auto';
      handle.style.right = '-4px';
      btn.textContent = 'Craft Mode';
    }
  }

  btn.addEventListener('click', () => {
    mode = mode === 1 ? 2 : 1;
    applyMode();
  });

  function init() {
    sidebar = document.querySelector('nav#openSidebar');
    grid    = document.querySelector('div[class*="_layout-sidebar_"]');
    navGrid = document.querySelector('nav#openSidebar > div.layout-stack');
    if (!sidebar || !grid || !navGrid) { setTimeout(init, 300); return; }

    sidebar.style.position = 'relative';
    handle    = document.createElement('div');
    handle.id = 'pn-resize-handle';
    sidebar.appendChild(handle);

    applyMode();

    let dragging = false;
    let startX;

    handle.addEventListener('mousedown', e => {
      dragging = true;
      startX   = e.clientX;
      handle.classList.add('dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      currentWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, currentWidth + (e.clientX - startX)));
      startX = e.clientX;
      if (mode === 2) {
        navGrid.style.gridTemplateColumns = `${currentWidth}px 1fr`;
        handle.style.left = (currentWidth - 4) + 'px';
      } else {
        grid.style.gridTemplateColumns = `${currentWidth}px 1fr`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
    });
  }

  init();

})();// ==UserScript==
// @name        New script
// @namespace   Violentmonkey Scripts
// @match       *://example.org/*
// @icon
// @grant       none
// @version     1.0
// @author      -
// @description 26/03/2026, 11:02:20 pm
// ==/UserScript==
