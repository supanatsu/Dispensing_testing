// ==========================================================================
// global_nav.js  v2.0
// Reusable Global Navigation / Sidebar component for BELTON IPQC
//
// USAGE (same as before — fully backward-compatible):
//
//   1. In <head>, add:
//        <script src="global_nav.js"></script>
//
//   2. In <body>, replace the entire hardcoded <aside class="sidebar">...</aside>
//      block with a single placeholder element:
//        <aside id="sidebar-root"></aside>
//
//   3. Right before </body> (or in a DOMContentLoaded handler), call:
//        initGlobalNavigation();
//      or with an explicit page-id override:
//        initGlobalNavigation('dispensing');
//
// NEW in v2.0:
//   • Collapse / expand toggle button (chevron) — persists across pages via localStorage
//   • Icon-only collapsed mode (72 px) with animated chevron
//   • Tooltip labels shown on hover when collapsed (no JS, pure CSS)
//   • Mobile overlay mode: sidebar slides over content on narrow screens
//   • Mobile hamburger button injected into .topbar automatically
//   • Smooth transitions on both sidebar and .main content area
//   • CSS custom property --sidebar-w kept in sync at all times so
//     page-level code that reads it (charts, modals, etc.) stays correct
//   • Zero layout-shift on initial paint (state applied before first frame)
// ==========================================================================

(function () {

  /* ── prevent double-init ─────────────────────────────────────────────── */
  if (window._globalNavLoaded) return;
  window._globalNavLoaded = true;

  /* ── constants ───────────────────────────────────────────────────────── */
  const COLLAPSE_LS_KEY = 'belton_ipqc_sidebar_collapsed';
  const EXPANDED_WIDTH = '220px';      // slightly narrower for Tab A11 landscape
  const COLLAPSED_WIDTH = '60px';       // tighter collapsed for small screens
  const MOBILE_BP = 600;          // px — covers only phones, iPad will use desktop nav

  // =========================================================================
  // 1. NAV DATA
  // =========================================================================
  const NAV_SECTIONS = [
    {
      label: 'Overview',
      items: [
        {
          id: 'dashboard',
          domId: 'nav-dashboard',
          href: 'index.html',
          label: 'Dashboard',
          match: ['index'],
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10
                   0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4
                   15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10
                   -3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />`
        },
        {
          id: 'system-alert',
          domId: 'nav-system-alert',
          href: 'system_alert.html',
          label: 'System Alert',
          match: ['system_alert'],
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`
        },
        {
          id: 'alert-config',
          domId: 'nav-alert-config',
          href: 'alert_config.html',
          label: 'Alert Config',
          match: ['alert_config'],
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0
                   00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0
                   .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />`
        },
        {
          id: 'system-config',
          domId: 'nav-system-config',
          href: 'system_config.html',
          label: 'System Config',
          match: ['system_config'],
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573
                   1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756
                   .426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826
                   3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756
                   -3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a
                   1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724
                   1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07
                   2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />`
        }
      ]
    },
    {
      label: 'IPQC Modules',
      items: [
        {
          id: 'dispensing',
          href: 'dispensing.html',
          label: 'Dispensing',
          match: ['dispensing'],
          badge: 'badge-dispensing',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l
                   -.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l
                   -1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415
                   3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009
                   10.172V5L8 4z" />`
        },
        {
          id: 'laser',
          href: 'laser.html',
          label: 'Laser Engraving',
          match: ['laser'],
          badge: 'badge-laser',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z" />`
        },
        {
          id: 'pof',
          href: 'push_out_force.html',
          label: 'Push Out Force',
          match: ['push_out_force', 'pof'],
          badge: 'badge-pof',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2
                   0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />`
        },
        {
          id: 'damper',
          href: 'damper_install.html',
          label: 'Damper Install',
          match: ['damper_install', 'damper'],
          badge: 'badge-damper',
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573
                   1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756
                   .426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826
                   3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756
                   -3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a
                   1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724
                   1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07
                   2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />`
        }
      ]
    }
  ];

  // =========================================================================
  // 2. PAGE DETECTION
  // =========================================================================
  function currentPageKey() {
    let path = window.location.pathname || '';
    let file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    file = file.toLowerCase().replace(/\.html?$/, '');
    if (file === '') file = 'index';
    return file;
  }

  function currentHash() {
    return (window.location.hash || '').replace(/^#/, '');
  }

  // =========================================================================
  // 3. INJECT STYLES (once, idempotent)
  // =========================================================================
  function injectStyles() {
    if (document.getElementById('global-nav-style')) return;

    const style = document.createElement('style');
    style.id = 'global-nav-style';
    style.textContent = `
      /* ── base sidebar ─────────────────────────────────────────── */
      .sidebar {
        width: ${EXPANDED_WIDTH};
        background: #CC1033;
        display: flex;
        flex-direction: column;
        position: fixed;
        top: 0; left: 0;
        height: 100vh;
        z-index: 300;
        overflow-x: hidden;
        overflow-y: auto;
        transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        scrollbar-width: none;
      }
      .sidebar::-webkit-scrollbar { display: none; }

      /* ── main area shift ────────────────────────────────────────── */
      .main {
        margin-left: ${EXPANDED_WIDTH};
        width: calc(100vw - ${EXPANDED_WIDTH});
        transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .main.sidebar-collapsed {
        margin-left: ${COLLAPSED_WIDTH};
        width: calc(100vw - ${COLLAPSED_WIDTH});
      }
      
      /* Global safeguard: prevent flex children from blowing out .main width */
      .main > * {
        min-width: 0;
      }
      
      /* Global safeguard: allow topbar to wrap if viewport is too narrow */
      .topbar {
        flex-wrap: wrap;
        min-height: var(--topbar-h, 60px);
        height: auto !important;
        padding-top: 8px !important;
        padding-bottom: 8px !important;
        gap: 10px;
      }
      .topbar-right {
        flex-wrap: wrap;
      }

      /* ── no-transition helper (used during initial paint) ────────── */
      .sidebar.no-transition,
      .sidebar.no-transition ~ .main,
      .sidebar.no-transition ~ * .main {
        transition: none !important;
      }

      /* ── brand ─────────────────────────────────────────────────── */
      .brand {
        height: 56px;
        display: flex;
        align-items: center;
        padding: 0 16px;
        border-bottom: 1px solid rgba(255,255,255,0.15);
        gap: 10px;
        flex-shrink: 0;
        overflow: hidden;
        white-space: nowrap;
      }
      .brand-icon {
        width: 32px; height: 32px;
        background: rgba(255,255,255,0.15);
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .brand-icon svg { width: 20px; height: 18px; }
      .brand-text {
        font-size: 14px; font-weight: 700;
        color: #fff; letter-spacing: 0.3px;
        transition: opacity 0.15s, width 0.25s;
        overflow: hidden;
      }
      .brand-text span { color: rgba(255,255,255,0.75); }

      /* ── nav sections ──────────────────────────────────────────── */
      .sidebar-section { padding: 12px 10px 6px; }
      .sidebar-label {
        font-size: 9px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 1.2px;
        color: rgba(255,255,255,0.5);
        padding: 0 8px; margin-bottom: 4px;
        white-space: nowrap; overflow: hidden;
        transition: opacity 0.15s;
      }
      .nav-list { list-style: none; display: flex; flex-direction: column; gap: 2px; }

      /* ── nav links ──────────────────────────────────────────────── */
      .nav-link {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 10px;
        border-radius: 8px;
        color: rgba(255,255,255,0.75);
        text-decoration: none;
        font-size: 12.5px; font-weight: 500;
        transition: background 0.15s, color 0.15s, padding 0.25s;
        white-space: nowrap; overflow: hidden;
        position: relative;
      }
      .nav-link svg {
        width: 17px; height: 17px; flex-shrink: 0;
        stroke: currentColor;
      }
      .nav-link:hover { background: rgba(255,255,255,0.15); color: #fff; }
      .nav-link.active { background: #fff; color: #CC1033; }
      .nav-link.active svg { stroke: #CC1033; }

      .nav-label {
        flex: 1; overflow: hidden;
        transition: opacity 0.15s, max-width 0.25s;
        max-width: 180px;
      }
      .nav-badge {
        margin-left: auto; flex-shrink: 0;
        font-size: 9px; font-weight: 700;
        padding: 1px 6px; border-radius: 20px;
        background: rgba(255,255,255,0.2); color: #fff;
        transition: opacity 0.15s;
      }
      .nav-link.active .nav-badge {
        background: rgba(204,16,51,0.12); color: #CC1033;
      }

      /* ── back-to-home: styled identical to .nav-link ─────────── */
      .sidebar-back-btn {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 10px;
        border-radius: 8px;
        color: rgba(255,255,255,0.75);
        text-decoration: none;
        font-size: 12.5px; font-weight: 500;
        transition: background 0.15s, color 0.15s, padding 0.25s;
        white-space: nowrap; overflow: hidden;
        position: relative;
        background: none;
        border: none;
        cursor: pointer;
      }
      .sidebar-back-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
      .sidebar-back-btn svg {
        width: 17px; height: 17px; flex-shrink: 0;
        stroke: currentColor;
      }
      .sidebar-back-label {
        flex: 1; overflow: hidden;
        transition: opacity 0.15s, max-width 0.25s;
        max-width: 180px;
      }
      /* collapsed: icon only, same as nav-link */
      .sidebar.collapsed .sidebar-back-btn {
        padding: 9px;
        justify-content: center;
      }
      .sidebar.collapsed .sidebar-back-label { opacity: 0; max-width: 0; }
      /* tooltip on collapsed hover */
      .sidebar.collapsed .sidebar-back-btn::after {
        content: 'กลับหน้าหลัก';
        position: absolute;
        left: calc(100% + 14px);
        top: 50%; transform: translateY(-50%);
        background: rgba(26,6,8,0.92);
        color: #fff;
        font-size: 12px; font-weight: 600;
        padding: 5px 10px;
        border-radius: 6px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s 0.05s;
        z-index: 500;
      }
      .sidebar.collapsed .sidebar-back-btn::before {
        content: '';
        position: absolute;
        left: calc(100% + 8px);
        top: 50%; transform: translateY(-50%);
        border: 5px solid transparent;
        border-right-color: rgba(26,6,8,0.92);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s 0.05s;
        z-index: 500;
      }
      .sidebar.collapsed .sidebar-back-btn:hover::after,
      .sidebar.collapsed .sidebar-back-btn:hover::before { opacity: 1; }

      /* ── toggle button ──────────────────────────────────────────── */
      .sidebar-toggle-btn {
        width: 32px; height: 32px;
        background: transparent;
        border: none;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        color: #fff;
        border-radius: 6px;
        transition: background 0.15s;
        z-index: 400;
      }
      .sidebar-toggle-btn:hover {
        background: rgba(255, 255, 255, 0.15);
      }
      .sidebar-toggle-btn svg {
        width: 24px; height: 24px; stroke: currentColor;
      }

      /* ── COLLAPSED STATE ────────────────────────────────────────── */
      .sidebar.collapsed { width: ${COLLAPSED_WIDTH}; }

      .sidebar.collapsed .brand { padding: 0; justify-content: center; }
      .sidebar.collapsed .brand-text { opacity: 0; max-width: 0; display: none; }
      .sidebar.collapsed .sidebar-label { opacity: 0; display: none; }
      .sidebar.collapsed .sidebar-section { padding: 8px 8px; }
      .sidebar.collapsed .nav-link { padding: 12px; justify-content: center; gap: 0; border-radius: 12px; }
      .sidebar.collapsed .nav-label { opacity: 0; max-width: 0; display: none; }
      .sidebar.collapsed .nav-badge { opacity: 0; display: none; }

      /* ── collapsed tooltips (pure CSS, no JS) ───────────────────── */
      .sidebar.collapsed .nav-link::after {
        content: attr(data-tooltip);
        position: absolute;
        left: calc(100% + 14px);
        top: 50%; transform: translateY(-50%);
        background: rgba(26,6,8,0.92);
        color: #fff;
        font-size: 12px; font-weight: 600;
        padding: 5px 10px;
        border-radius: 6px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s 0.05s;
        z-index: 500;
        backdrop-filter: blur(4px);
      }
      .sidebar.collapsed .nav-link::before {
        content: '';
        position: absolute;
        left: calc(100% + 8px);
        top: 50%; transform: translateY(-50%);
        border: 5px solid transparent;
        border-right-color: rgba(26,6,8,0.92);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s 0.05s;
        z-index: 500;
      }
      .sidebar.collapsed .nav-link:hover::after,
      .sidebar.collapsed .nav-link:hover::before { opacity: 1; }

      /* ── overlay backdrop (mobile) ──────────────────────────────── */
      #sidebar-backdrop {
        display: none;
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.45);
        z-index: 290;
        opacity: 0;
        transition: opacity 0.25s;
      }
      #sidebar-backdrop.visible {
        display: block;
        opacity: 1;
      }

      /* ── mobile hamburger ────────────────────────────────────────── */
      .sidebar-hamburger {
        display: none;
        align-items: center; justify-content: center;
        width: 36px; height: 36px;
        border-radius: 8px;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        margin-right: 8px;
        color: #CC1033;
        flex-shrink: 0;
      }
      .sidebar-hamburger svg { width: 20px; height: 20px; stroke: #CC1033; }

      /* ── MOBILE/TABLET BREAKPOINT (≤900px covers Galaxy Tab A11 portrait) ── */
      @media (max-width: ${MOBILE_BP}px) {
        /* Sidebar becomes an overlay panel — slides off-screen by default */
        .sidebar {
          transform: translateX(-100%);
          width: 240px !important;  /* compact overlay for tablet */
          box-shadow: 4px 0 24px rgba(0,0,0,0.18);
        }
        .sidebar.mobile-open {
          transform: translateX(0);
        }
        /* Main never shifts on mobile */
        .main,
        .main.sidebar-collapsed {
          margin-left: 0 !important;
          width: 100vw !important;
        }
        /* Hide desktop toggle on mobile */
        .sidebar-toggle-btn { display: none !important; }
        /* Show hamburger */
        .sidebar-hamburger { display: flex !important; }
        /* Collapsed tooltips irrelevant on mobile */
        .sidebar.collapsed .nav-link::after,
        .sidebar.collapsed .nav-link::before,
        .sidebar.collapsed .sidebar-back-btn::after,
        .sidebar.collapsed .sidebar-back-btn::before { display: none; }
        
        /* Force expanded styles on mobile even if .collapsed class is present */
        .sidebar.collapsed .brand { padding: 0 16px; justify-content: flex-start; }
        .sidebar.collapsed .brand-text { opacity: 1; max-width: none; }
        .sidebar.collapsed .sidebar-label { opacity: 1; }
        .sidebar.collapsed .sidebar-section { padding: 12px 10px 6px; }
        .sidebar.collapsed .nav-link { padding: 9px 10px; justify-content: flex-start; }
        .sidebar.collapsed .nav-label { opacity: 1; max-width: 180px; }
        .sidebar.collapsed .nav-badge { opacity: 1; }
        .sidebar.collapsed .sidebar-back-btn { padding: 9px 10px; justify-content: flex-start; }
        .sidebar.collapsed .sidebar-back-label { opacity: 1; max-width: 180px; }
      }

      /* ── no-transition helper (used during initial paint) ────────── */
      .sidebar.no-transition,
      .sidebar.no-transition ~ .main,
      .sidebar.no-transition ~ * .main {
        transition: none !important;
      }

      /* ── scrollbar spacing at bottom of sidebar ─────────────────── */
      .sidebar::after {
        content: '';
        display: block;
        height: 24px;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 4. HTML BUILDERS
  // =========================================================================
  function buildBrandHTML() {
    return `
      <div class="brand">
        <button type="button" class="sidebar-toggle-btn" id="sidebar-toggle-btn" aria-label="ย่อ/ขยายเมนู">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div class="brand-text">BELTON <span>IPQC</span></div>
      </div>`;
  }

  function buildBackButtonHTML(pageKey) {
    // Only show on module pages (not on index itself)
    const isModulePage = !['index', ''].includes(pageKey);
    if (!isModulePage) return '';
    // Wrap in a mini-section identical in structure to sidebar-section
    return `
      <div class="sidebar-section" style="padding-bottom:0;padding-top:10px;">
        <ul class="nav-list">
          <li>
            <a href="index.html"
               class="sidebar-back-btn"
               data-tooltip="กลับหน้าหลัก"
               title="กลับหน้าหลัก">
              <svg fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                      d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span class="sidebar-back-label">กลับหน้าหลัก</span>
            </a>
          </li>
        </ul>
        <div style="margin:8px 8px 0;border-bottom:1px solid rgba(255,255,255,0.12);"></div>
      </div>`;
  }

  function buildToggleButtonHTML() {
    return `
      <button type="button" class="sidebar-toggle-btn" id="sidebar-toggle-btn"
              aria-label="ย่อ/ขยายเมนู" title="ย่อ/ขยายเมนู">
        <svg fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                d="M15 19l-7-7 7-7" />
        </svg>
      </button>`;
  }

  function buildHamburgerHTML() {
    return `
      <button type="button" class="sidebar-hamburger" id="sidebar-hamburger"
              aria-label="เปิดเมนู" title="เปิดเมนู">
        <svg fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>`;
  }

  function buildSectionHTML(section, pageKey, hash, activeOverride) {
    const items = section.items.map(item => {
      let isActive = false;

      if (activeOverride) {
        isActive = (item.id === activeOverride);
      } else if (item.match.includes(pageKey)) {
        if (item.hashMatch) {
          isActive = hash
            ? (hash === item.hashMatch)
            : (item.hashMatch === 'dashboard');
        } else {
          isActive = true;
        }
      }

      const activeClass = isActive ? ' active' : '';
      const badgeHTML = item.badge
        ? `<span class="nav-badge" id="${item.badge}">0</span>`
        : '';
      const idAttr = item.domId ? ` id="${item.domId}"` : '';
      const onclickAttr = item.onclick ? ` onclick="${item.onclick}"` : '';

      return `
        <li>
          <a href="${item.href}"${idAttr}
             class="nav-link${activeClass}"
             data-nav-id="${item.id}"
             data-tooltip="${item.label}"
             title="${item.label}"${onclickAttr}>
            <svg fill="none" viewBox="0 0 24 24">${item.icon}</svg>
            <span class="nav-label">${item.label}</span>${badgeHTML}
          </a>
        </li>`;
    }).join('');

    return `
      <div class="sidebar-section">
        <div class="sidebar-label">${section.label}</div>
        <ul class="nav-list">${items}</ul>
      </div>`;
  }

  // =========================================================================
  // 5. STATE MANAGEMENT
  // =========================================================================
  function getCollapsedState() {
    try { return localStorage.getItem(COLLAPSE_LS_KEY) === 'true'; } catch (e) { return false; }
  }
  function setCollapsedState(collapsed) {
    try { localStorage.setItem(COLLAPSE_LS_KEY, collapsed ? 'true' : 'false'); } catch (e) { }
  }

  function getMainEl(sidebarEl) {
    return (sidebarEl.nextElementSibling && sidebarEl.nextElementSibling.classList.contains('main'))
      ? sidebarEl.nextElementSibling
      : document.querySelector('.main');
  }

  function updateCSSVar(width) {
    // Keep --sidebar-w in sync so chart/modal calculations that read it stay correct
    try {
      document.documentElement.style.setProperty('--sidebar-w', width);
    } catch (e) { }
  }

  function applyCollapsedState(sidebarEl, collapsed, animate) {
    if (!animate) sidebarEl.classList.add('no-transition');

    sidebarEl.classList.toggle('collapsed', collapsed);

    const mainEl = getMainEl(sidebarEl);
    if (mainEl) mainEl.classList.toggle('sidebar-collapsed', collapsed);

    updateCSSVar(collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH);

    if (!animate) {
      // Re-enable transitions after the next paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => sidebarEl.classList.remove('no-transition'));
      });
    }
  }

  // =========================================================================
  // 6. MOBILE OVERLAY
  // =========================================================================
  function isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

  function openMobileOverlay(sidebarEl) {
    sidebarEl.classList.add('mobile-open');
    let backdrop = document.getElementById('sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }
    requestAnimationFrame(() => backdrop.classList.add('visible'));
    document.body.style.overflow = 'hidden';
  }

  function closeMobileOverlay(sidebarEl) {
    sidebarEl.classList.remove('mobile-open');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) backdrop.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function wireMobileHamburger(sidebarEl) {
    // Inject hamburger into topbar (if present) — before the first topbar child
    const topbar = document.querySelector('.topbar');
    const existing = document.getElementById('sidebar-hamburger');
    if (topbar && !existing) {
      topbar.insertAdjacentHTML('afterbegin', buildHamburgerHTML());
    }

    const btn = document.getElementById('sidebar-hamburger');
    if (btn) {
      btn.addEventListener('click', () => {
        if (sidebarEl.classList.contains('mobile-open')) {
          closeMobileOverlay(sidebarEl);
        } else {
          openMobileOverlay(sidebarEl);
        }
      });
    }

    // Backdrop tap closes
    document.body.addEventListener('click', e => {
      const backdrop = document.getElementById('sidebar-backdrop');
      if (backdrop && backdrop.classList.contains('visible') && e.target === backdrop) {
        closeMobileOverlay(sidebarEl);
      }
    });

    // Close when a nav link is tapped on mobile
    sidebarEl.querySelectorAll('.nav-link').forEach(a => {
      a.addEventListener('click', () => {
        if (isMobile()) closeMobileOverlay(sidebarEl);
      });
    });
  }

  // =========================================================================
  // 7. TOGGLE BUTTON (desktop)
  // =========================================================================
  function wireToggleButton(sidebarEl) {
    const btn = sidebarEl.querySelector('#sidebar-toggle-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (isMobile()) return; // handled by hamburger on mobile
      const collapsed = !sidebarEl.classList.contains('collapsed');
      applyCollapsedState(sidebarEl, collapsed, true);
      setCollapsedState(collapsed);
    });
  }

  // =========================================================================
  // 8. HASH-CHANGE ACTIVE DETECTION (index.html)
  // =========================================================================
  function wireHashChange(sidebarEl) {
    const pageKey = currentPageKey();
    window.addEventListener('hashchange', () => {
      const newHash = currentHash();
      sidebarEl.querySelectorAll('.nav-link').forEach(a => {
        const id = a.getAttribute('data-nav-id');
        const item = NAV_SECTIONS.flatMap(s => s.items).find(i => i.id === id);
        if (!item) return;
        if (item.match.includes(pageKey) && item.hashMatch) {
          const shouldBeActive = newHash
            ? (newHash === item.hashMatch)
            : (item.hashMatch === 'dashboard');
          a.classList.toggle('active', shouldBeActive);
        }
      });
    });
  }

  // =========================================================================
  // 9. PUBLIC API
  // =========================================================================

  /**
   * initGlobalNavigation(activeId?, mountId?)
   *
   * @param {string} [activeId]  - Optional explicit nav item id to mark active.
   *   'dashboard' | 'alert-config' | 'system-config' |
   *   'dispensing' | 'laser' | 'pof' | 'damper'
   *   If omitted, auto-detected from window.location.
   *
   * @param {string} [mountId='sidebar-root']
   *   ID of the placeholder <aside> to render into.
   */
  window.initGlobalNavigation = function (activeId, mountId) {
    try {
      const root = document.getElementById(mountId || 'sidebar-root');
      if (!root) {
        console.warn('[global_nav] #sidebar-root not found — sidebar not rendered.');
        return;
      }

      injectStyles();

      const pageKey = currentPageKey();
      const hash = currentHash();

      root.classList.add('sidebar');
      root.style.position = 'fixed';

      root.innerHTML =
        buildBrandHTML() +
        NAV_SECTIONS.map(sec => buildSectionHTML(sec, pageKey, hash, activeId)).join('');

      // Apply persisted state immediately (no-transition to prevent flash)
      applyCollapsedState(root, getCollapsedState(), false);

      // Wire interactions
      wireToggleButton(root);
      wireMobileHamburger(root);
      wireHashChange(root);
    } catch (err) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;background:red;color:white;padding:20px;font-size:16px;';
      errDiv.textContent = 'global_nav Error: ' + err.message + '\n' + err.stack;
      document.body.appendChild(errDiv);
    }
  };

  /**
   * refreshNavBadges({ dispensing, laser, pof, damper })
   * Update module badge counters without re-rendering the sidebar.
   */
  window.refreshNavBadges = function (counts) {
    if (!counts) return;
    const map = {
      dispensing: 'badge-dispensing',
      laser: 'badge-laser',
      pof: 'badge-pof',
      damper: 'badge-damper'
    };
    Object.keys(map).forEach(key => {
      if (counts[key] === undefined) return;
      const el = document.getElementById(map[key]);
      if (el) el.textContent = String(counts[key]);
    });
  };

})();