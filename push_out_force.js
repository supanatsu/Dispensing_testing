// 
//  BELTON IPQC  Push Out Force  v4.0  (push_out_force.js)
//  Multi-product, multi-mode SPC: Buy off / New Buy off /
//  Roving audit / New Roving audit / OBA / Special
//  Each product can have Short/Long type AND Bobbin type with
//  independent SPC parameters per inspection mode.
//  Database: MySQL via Node.js backend API (localhost:3000)
// 

//  Storage Keys 
const LS_KEY_POF = 'belton_pof_v4_records';
const LS_KEY_ALERTS = 'belton_pof_v4_alerts';
const LS_KEY_CFG = 'belton_pof_v4_config';

async function fetchPOFConfigFromDB() {
  try {
    const res = await fetch((typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3000') + '/api/system/config');
    if (res.ok) {
      const dbCfg = await res.json();
      if (dbCfg && dbCfg.belton_pof_config_v1) {
        localStorage.setItem('belton_pof_config_v1', dbCfg.belton_pof_config_v1);
      }
    }
  } catch (e) {
    console.error("Failed to fetch POF config from DB", e);
  }
}
// Call early
fetchPOFConfigFromDB();

//  Backend 
let isServerOnline = false;

//  Sort State 
let _sortCol = 'no';
let _sortDir = -1;

//  EML draft cache 
let _emlCache = null;

//  Local Caches for Live DB Integration 
let _recordsCache = [];
let _alertsCache = [];

// 
//  INSPECTION MODES (matches folder structure)
// 
const MODES = {
  buyoff: { label: '🔴 Buy Off', color: '#dc2626', bg: 'rgba(220,38,38,.10)', spcKey: 'buyoff' },
  roving: { label: '🔵 Roving Audit', color: '#2563eb', bg: 'rgba(37,99,235,.10)', spcKey: 'roving' },
  oba: { label: '🟢 OBA', color: '#16a34a', bg: 'rgba(22,163,74,.10)', spcKey: 'buyoff' },
  special: { label: '⭐ Special', color: '#b45309', bg: 'rgba(180,83,9,.10)', spcKey: 'buyoff' },
};

// 
//  PRODUCT CATALOGUE
//  label    display name
//  unit     Lbs / Kgf
//  types    array: 'sl' (Short/Long) | 'bobbin'
//  spc      keyed by mode group ('buyoff'|'roving') then type ('sl'|'bobbin')
//            { spec, trigger, ucl, cl, lcl, rucl, rcl }
// 
const PRODUCTS_DEFAULT = {

  //  Cimarron BP 
  cim3d: {
    label: 'Cimarron BP 3D', unit: 'Lbs', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 92.35, ucl: 217.11, cl: 167.21, lcl: 117.31, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 92.35, ucl: 217.11, cl: 167.21, lcl: 117.31, rucl: 25, rcl: 12.5 }
      },
      roving: {
        sl: { spec: 25, trigger: 92.35, ucl: 217.11, cl: 167.21, lcl: 117.31, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 92.35, ucl: 217.11, cl: 167.21, lcl: 117.31, rucl: 25, rcl: 12.5 }
      },
    },
  },
  cim4d: {
    label: 'Cimarron BP 4D', unit: 'Lbs', types: ['sl', 'bobbin'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 64.5, ucl: 215, cl: 154.80, lcl: 94.60, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 2.5, trigger: 37.59, ucl: 343.03, cl: 272.85, lcl: 202.67, rucl: 5, rcl: 2.5 },
      },
      roving: {
        sl: { spec: 25, trigger: 64.5, ucl: 215, cl: 154.80, lcl: 94.60, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 37.59, ucl: 343.03, cl: 272.85, lcl: 202.67, rucl: 5, rcl: 2.5 },
      },
    },
  },
  cim5d: {
    label: 'Cimarron BP 5D', unit: 'Lbs', types: ['sl', 'bobbin'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 64.5, ucl: 215, cl: 154.80, lcl: 94.60, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 37.59, ucl: 343.03, cl: 272.85, lcl: 202.67, rucl: 5, rcl: 2.5 },
      },
      roving: {
        sl: { spec: 25, trigger: 64.5, ucl: 215, cl: 154.80, lcl: 94.60, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 37.59, ucl: 343.03, cl: 272.85, lcl: 202.67, rucl: 5, rcl: 2.5 },
      },
    },
  },

  //  ComET 
  comet: {
    label: 'ComET', unit: 'Lbs', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 80, ucl: 220, cl: 160, lcl: 100, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 80, ucl: 220, cl: 160, lcl: 100, rucl: 30, rcl: 15 }
      },
      roving: {
        sl: { spec: 25, trigger: 80, ucl: 220, cl: 160, lcl: 100, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 80, ucl: 220, cl: 160, lcl: 100, rucl: 30, rcl: 15 }
      },
    },
  },

  //  Dorado 
  dor5d: {
    label: 'Dorado 5D', unit: 'Lbs', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 100, ucl: 250, cl: 150, lcl: 80, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 100, ucl: 250, cl: 150, lcl: 80, rucl: 30, rcl: 15 }
      },
      roving: {
        sl: { spec: 25, trigger: 100, ucl: 250, cl: 150, lcl: 80, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 100, ucl: 250, cl: 150, lcl: 80, rucl: 30, rcl: 15 }
      },
    },
  },
  dor5dbb: {
    label: 'Dorado 5D AL BB', unit: 'Lbs', types: ['sl', 'bobbin'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 100, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 100, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 }
      },
      roving: {
        sl: { spec: 25, trigger: 100, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 100, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 }
      },
    },
  },
  dor10d: {
    label: 'Dorado 10D', unit: 'Lbs', types: ['sl', 'bobbin'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 60, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 },
        bobbin: { spec: 2.5, trigger: 3.4, ucl: 15.53, cl: 9.94, lcl: 4.34, rucl: 5, rcl: 2.5 },
      },
      roving: {
        sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 5, rcl: 2.5 },
      },
    },
  },

  //  M11 P 
  m11p: {
    label: 'M11 P', unit: 'Lbs', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 30, trigger: 65.2, ucl: 250.2, cl: 179.8, lcl: 109.4, rucl: 15, rcl: 7.5 },
        bobbin: { spec: 30, trigger: 53.75, ucl: 150.49, cl: 103, lcl: 55.51, rucl: 10, rcl: 5 },
      },
      roving: {
        sl: { spec: 30, trigger: 65.2, ucl: 250.2, cl: 179.8, lcl: 109.4, rucl: 15, rcl: 7.5 },
        bobbin: { spec: 30, trigger: 53.75, ucl: 150.49, cl: 103, lcl: 55.51, rucl: 10, rcl: 5 },
      },
    },
  },

  //  Marlin 
  mar10d: {
    label: 'Marlin 10D', unit: 'Lbs', types: ['sl', 'bobbin'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 10, rcl: 5 },
      },
      roving: {
        sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 10, rcl: 5 },
      },
    },
  },

  //  Rosewood 
  ros1d: {
    label: 'Rosewood 1D', unit: 'Kgf', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 5.9, trigger: 10.1, ucl: 23.7, cl: 15.2, lcl: 6.6, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 2.5, trigger: 7.17, ucl: 23.18, cl: 13.86, lcl: 4.54, rucl: 5, rcl: 2.5 },
      },
      roving: {
        sl: { spec: 5.9, trigger: 10.1, ucl: 23.7, cl: 15.2, lcl: 6.6, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 2.5, trigger: 7.17, ucl: 23.18, cl: 13.86, lcl: 4.54, rucl: 5, rcl: 2.5 },
      },
    },
  },
  ros2d: {
    label: 'Rosewood 2D', unit: 'Kgf', types: ['sl', 'bobbin'],
    spc: {
      buyoff: {
        sl: { spec: 5.9, trigger: 10.1, ucl: 23.7, cl: 15.2, lcl: 6.6, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 2.5, trigger: 7.17, ucl: 23.18, cl: 13.86, lcl: 4.54, rucl: 5, rcl: 2.5 },
      },
      roving: {
        sl: { spec: 5.9, trigger: 10.1, ucl: 23.7, cl: 15.2, lcl: 6.6, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 2.5, trigger: 7.17, ucl: 23.18, cl: 13.86, lcl: 4.54, rucl: 5, rcl: 2.5 },
      },
    },
  },

  //  Skybolt 
  sky1d: {
    label: 'Skybolt 1D', unit: 'Kgf', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 }
      },
      roving: {
        sl: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 }
      },
    },
  },
  sky2d: {
    label: 'Skybolt 2D', unit: 'Kgf', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 11.34, trigger: 17.48, ucl: 37.55, cl: 25.27, lcl: 12.99, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 11.34, trigger: 17.48, ucl: 37.55, cl: 25.27, lcl: 12.99, rucl: 5, rcl: 2.5 }
      },
      roving: {
        sl: { spec: 11.34, trigger: 17.48, ucl: 37.55, cl: 25.27, lcl: 12.99, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 11.34, trigger: 17.48, ucl: 37.55, cl: 25.27, lcl: 12.99, rucl: 5, rcl: 2.5 }
      },
    },
  },
  sky3d: {
    label: 'Skybolt 3D', unit: 'Kgf', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 11.34, trigger: 17.34, ucl: 44.14, cl: 36.14, lcl: 28.14, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 11.34, trigger: 17.34, ucl: 44.14, cl: 36.14, lcl: 28.14, rucl: 5, rcl: 2.5 }
      },
      roving: {
        sl: { spec: 11.34, trigger: 17.34, ucl: 44.14, cl: 36.14, lcl: 28.14, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 11.34, trigger: 17.34, ucl: 44.14, cl: 36.14, lcl: 28.14, rucl: 5, rcl: 2.5 }
      },
    },
  },
  sky4d: {
    label: 'Skybolt 4D', unit: 'Kgf', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 11.34, trigger: 22.17, ucl: 79.09, cl: 57.44, lcl: 35.78, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 11.34, trigger: 22.17, ucl: 79.09, cl: 57.44, lcl: 35.78, rucl: 5, rcl: 2.5 }
      },
      roving: {
        sl: { spec: 11.34, trigger: 22.17, ucl: 79.09, cl: 57.44, lcl: 35.78, rucl: 5, rcl: 2.5 },
        bobbin: { spec: 11.34, trigger: 22.17, ucl: 79.09, cl: 57.44, lcl: 35.78, rucl: 5, rcl: 2.5 }
      },
    },
  },

  //  Summit 
  sum10d: {
    label: 'Summit 10D', unit: 'Lbs', types: ['sl', 'bobbin'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 10, rcl: 5 },
      },
      roving: {
        sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 },
        bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 10, rcl: 5 },
      },
    },
  },

  //  V11 
  v111d: {
    label: 'V11 1D', unit: 'Lbs', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 87.03, ucl: 172.13, cl: 115.39, lcl: 58.66, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 60, ucl: 120, cl: 90, lcl: 60, rucl: 10, rcl: 5 },
      },
      roving: {
        sl: { spec: 25, trigger: 87.03, ucl: 172.13, cl: 115.39, lcl: 58.66, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 60, ucl: 130, cl: 90, lcl: 50, rucl: 10, rcl: 5 },
      },
    },
  },
  v112d: {
    label: 'V11 2D', unit: 'Lbs', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 93.97, ucl: 169.01, cl: 118.98, lcl: 68.95, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 93.97, ucl: 169.01, cl: 118.98, lcl: 68.95, rucl: 25, rcl: 12.5 }
      },
      roving: {
        sl: { spec: 25, trigger: 93.97, ucl: 169.01, cl: 118.98, lcl: 68.95, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 93.97, ucl: 169.01, cl: 118.98, lcl: 68.95, rucl: 25, rcl: 12.5 }
      },
    },
  },
  v114d: {
    label: 'V11 4D', unit: 'Lbs', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 }
      },
      roving: {
        sl: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 }
      },
    },
  },

  //  V15 
  v15: {
    label: 'V15 CMR 4D', unit: 'Lbs', types: ['sl'],
    spc: {
      buyoff: {
        sl: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 }
      },
      roving: {
        sl: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 },
        bobbin: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 }
      },
    },
  },
};

//  Runtime merged catalogue (user config overrides) 
let PRODUCTS = {};

// 
//  Helper: resolve SPC params for current mode + type
// 
function getSPC(productKey, modeKey, typeKey) {
  const p = PRODUCTS[productKey];
  if (!p) return null;
  const grp = MODES[modeKey]?.spcKey || 'buyoff';
  return p.spc?.[grp]?.[typeKey] || null;
}

// 
//  Startup
// 
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  fetchDynamicProducts();
  populateModeDropdowns();

  const d = document.getElementById('m-date');
  if (d) d.value = todayISO();

  startClock();

  // Init epoxy pickers with defaults
  if (typeof initEpoxyPickers === 'function') initEpoxyPickers();

  //  Live API
  checkBackendConnection().then(() => {
    refreshDataFromServer();
  });

  //  backend  10 
  setInterval(() => {
    checkBackendConnection().then(() => {
      if (isServerOnline) refreshDataFromServer();
    });
  }, 10000);
});

//  Clock 
function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleString('th-TH', { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

//  Config 
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
    let sourceProducts = JSON.parse(JSON.stringify(PRODUCTS_DEFAULT));
    if (saved.products) {
      Object.keys(saved.products).forEach(k => {
        if (sourceProducts[k]) sourceProducts[k] = { ...sourceProducts[k], ...saved.products[k] };
      });
    }
    PRODUCTS = new Proxy(sourceProducts, {
      get: function (target, prop) {
        if (typeof prop === 'symbol') return target[prop];
        if (prop in target) return target[prop];
        if (typeof prop === 'string') {
          const sortedKeys = Object.keys(target).sort((a, b) => target[b].label.length - target[a].label.length);
          const match = sortedKeys.find(k => prop.includes(target[k].label));
          if (match) return target[match];
        }
        return undefined;
      },
      ownKeys: function (target) { return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor: function (target, prop) { return Reflect.getOwnPropertyDescriptor(target, prop); },
      set: function (target, prop, value) { target[prop] = value; return true; }
    });
  } catch {
    PRODUCTS = new Proxy(JSON.parse(JSON.stringify(PRODUCTS_DEFAULT)), {
      get: function (target, prop) {
        if (typeof prop === 'symbol') return target[prop];
        if (prop in target) return target[prop];
        if (typeof prop === 'string') {
          const sortedKeys = Object.keys(target).sort((a, b) => target[b].label.length - target[a].label.length);
          const match = sortedKeys.find(k => prop.includes(target[k].label));
          if (match) return target[match];
        }
        return undefined;
      },
      ownKeys: function (target) { return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor: function (target, prop) { return Reflect.getOwnPropertyDescriptor(target, prop); },
      set: function (target, prop, value) { target[prop] = value; return true; }
    });
  }
}

window.SERVER_PRODUCTS_LIST = [];

async function fetchDynamicProducts() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/pof/products_list`);
    const data = await res.json();
    if (data.success) {
      window.SERVER_PRODUCTS_LIST = data.products;
      const currentMode = document.getElementById('m-mode')?.value || 'buyoff';
      populateProductDropdowns(currentMode);
    }
  } catch (e) {
    console.error('Failed to fetch dynamic products:', e);
  }
}

function saveConfig() {
  const email = document.getElementById('cfg-email')?.value || '';
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
    existing.email = email;
    localStorage.setItem(LS_KEY_CFG, JSON.stringify(existing));
    showToast('บันทึก Config สำเร็จ', 'success');
  } catch {
    showToast('Save config failed', 'error');
  }
}

//  Populate dropdowns 
function populateModeDropdowns() {
  ['m-mode', 'flt-mode'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'flt-mode') {
      while (el.options.length > 1) el.remove(1);
    } else {
      el.innerHTML = '';
    }
    Object.keys(MODES).forEach(k => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = MODES[k].label;
      el.appendChild(o);
    });
  });
}

function populateProductDropdowns(modeFilter = null) {
  ['m-product', 'flt-product', 'viz-product', 'cfg-product-sel', 'imp-product'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    while (el.options.length > 1) el.remove(1);

    if (!window.SERVER_PRODUCTS_LIST || window.SERVER_PRODUCTS_LIST.length === 0) {
      Object.keys(PRODUCTS).forEach(k => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = PRODUCTS[k].label;
        el.appendChild(o);
      });
    } else {
      // Map mode to match DB string Buy-off/Roving
      let dbMode = modeFilter ? modeFilter.toLowerCase() : null;
      if (dbMode === 'buyoff') dbMode = 'buy-off';

      const filtered = window.SERVER_PRODUCTS_LIST.filter(p => !dbMode || dbMode === 'all' || (p.mode || '').toLowerCase() === dbMode);

      // Use a proxy source for keys
      const sourceKeys = Object.keys(PRODUCTS_DEFAULT);
      const sortedKeys = sourceKeys.sort((a, b) => PRODUCTS_DEFAULT[b].label.length - PRODUCTS_DEFAULT[a].label.length);

      filtered.forEach(p => {
        let mk = sortedKeys.find(k => p.product_name.includes(PRODUCTS_DEFAULT[k].label)) || sourceKeys[0];
        const o = document.createElement('option');
        o.value = mk;
        o.setAttribute('data-fullname', p.product_name);
        o.textContent = p.product_name;
        el.appendChild(o);
      });
    }
  });
}

//  Helpers 
function loadRecords() { return _recordsCache; }
function saveRecords(a) { _recordsCache = a; localStorage.setItem(LS_KEY_POF, JSON.stringify(a)); }
function loadAlerts() { return _alertsCache; }
function saveAlerts(a) { _alertsCache = a; localStorage.setItem(LS_KEY_ALERTS, JSON.stringify(a)); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmt(v, d = 2) { return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toFixed(d); }

function switchTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');

  if (id === 'records') renderRecords();
  if (id === 'viz') renderCharts();
  if (id === 'alerts') renderAlerts();
}

// 
//  Backend Connection
// 
async function checkBackendConnection() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    isServerOnline = data.status === 'OK';
  } catch {
    isServerOnline = false;
  }

  const dot = document.getElementById('sync-status-indicator');
  const text = document.getElementById('sync-status-text');
  if (dot) {
    dot.className = 'sync-dot ' + (isServerOnline ? 'online' : 'offline');
  }
  if (text) {
    text.textContent = isServerOnline ? 'Online (MySQL)' : 'Offline Mode';
    text.style.color = isServerOnline ? 'var(--pass)' : 'var(--text3)';
  }
}

async function refreshDataFromServer() {
  if (isServerOnline) {
    try {
      //  Fetch DB Limits 
      try {
        const confRes = await fetch(`${BACKEND_URL}/api/config/pof`);
        const confData = await confRes.json();
        if (confData.success && confData.limits) {
          confData.limits.forEach(lim => {
            const prod = lim.product_key;
            let typeKey = (lim.type_parameter === 'long_fantail' || lim.type_parameter === 'short_fantail') ? 'sl' : 'bobbin';
            if (PRODUCTS_DEFAULT[prod] && PRODUCTS_DEFAULT[prod].spc) {
              ['buyoff', 'roving', 'new_buyoff', 'new_roving', 'oba', 'special'].forEach(m => {
                if (PRODUCTS_DEFAULT[prod].spc[m] && PRODUCTS_DEFAULT[prod].spc[m][typeKey]) {
                  const spcObj = PRODUCTS_DEFAULT[prod].spc[m][typeKey];
                  if (lim.lcl !== null) spcObj.lcl = parseFloat(lim.lcl);
                  if (lim.cl !== null) spcObj.cl = parseFloat(lim.cl);
                  if (lim.ucl !== null) spcObj.ucl = parseFloat(lim.ucl);
                  if (lim.lsl !== null) {
                    spcObj.spec = parseFloat(lim.lsl);
                    spcObj.trigger = parseFloat(lim.lsl);
                  }
                }
              });
            }
          });
        }
      } catch (e) { console.warn('Failed to load POF config', e); }

      //  Load Records  DB 
      const recRes = await fetch(`${BACKEND_URL}/api/pof/records`);
      const recData = await recRes.json();
      if (recData.success && Array.isArray(recData.records)) {
        _recordsCache = recData.records.map(r => {
          const modeKey = r.mode || 'buyoff';
          const prodKey = r.product || '';
          const typeKey = r.coil_type || 'sl';
          // fallback SPC  PRODUCTS catalogue  DB  (record )
          const spcFb = getSPC(prodKey, modeKey, typeKey) || {};
          return {
            id: r.no,                                                    //  no  id (DB  id )
            no: r.no,
            date: r.date || '',
            mode: modeKey,
            modeLabel: MODES[modeKey]?.label || modeKey,
            coilType: typeKey,                                                  //   r.coil_type  typeKey
            condition: r.condition || 'NTC',
            product: prodKey,
            productLabel: r.product_label || PRODUCTS[prodKey]?.label || prodKey,  //  fallback  catalogue
            unit: r.unit || PRODUCTS[prodKey]?.unit || 'Lbs',
            oven: r.oven || '',
            team: r.team || '',
            en: r.en || '',
            traveler: r.traveler || '',
            lot: r.lot || '',
            qty: r.qty || '',
            remark: r.remark || '',
            long1: r.long1 != null ? parseFloat(r.long1) : (r.values_json?.long1 != null ? parseFloat(r.values_json.long1) : null),
            short2: r.short2 != null ? parseFloat(r.short2) : (r.values_json?.short2 != null ? parseFloat(r.values_json.short2) : null),
            bobbin1: r.bobbin1 != null ? parseFloat(r.bobbin1) : (r.values_json?.bobbin1 != null ? parseFloat(r.values_json.bobbin1) : null),
            bobbin2: r.bobbin2 != null ? parseFloat(r.bobbin2) : (r.values_json?.bobbin2 != null ? parseFloat(r.values_json.bobbin2) : null),
            avg: r.avg != null ? parseFloat(r.avg) : (r.values_json?.avg != null ? parseFloat(r.values_json.avg) : null),
            max: r.max != null ? parseFloat(r.max) : (r.values_json?.max != null ? parseFloat(r.values_json.max) : null),
            min: r.min != null ? parseFloat(r.min) : (r.values_json?.min != null ? parseFloat(r.values_json.min) : null),
            range: r.range != null ? parseFloat(r.range) : null,
            spec_result: r.spec_result || '',
            trigger: r.trigger || '',
            out_cl: r.out_cl || '',
            trend: r.trend || '',
            nine_pt: r.nine_pt || '',
            overall: r.overall || 'Pass',
            // SPC snapshot:  DB   null  fallback  PRODUCTS
            spc_ucl: r.spc_ucl != null ? r.spc_ucl : (spcFb.ucl || null),
            spc_cl: r.spc_cl != null ? r.spc_cl : (spcFb.cl || null),
            spc_lcl: r.spc_lcl != null ? r.spc_lcl : (spcFb.lcl || null),
            spc_trig: r.spc_trig != null ? r.spc_trig : (spcFb.trigger || null),
            spc_spec: r.spc_spec != null ? r.spc_spec : (spcFb.spec || null),
            savedAt: r.savedAt || '',
          };
        });
        localStorage.setItem(LS_KEY_POF, JSON.stringify(_recordsCache));
      }

      //  Load Alerts  DB 
      const alertRes = await fetch(`${BACKEND_URL}/api/pof/alerts`);
      const alertData = await alertRes.json();
      if (alertData.success && Array.isArray(alertData.alerts)) {
        _alertsCache = alertData.alerts.map((a, i) => ({
          id: a.id != null ? a.id : (Date.now() + i),
          ts: a.ts || a.time || new Date().toISOString(),
          level: a.level || (a.spec === 'OUT' ? 'ng' : 'warn'),
          product: a.product || '',
          mode: a.mode || '',
          modeLabel: MODES[a.mode]?.label || a.mode || '',
          coilType: a.coilType || a.coil_type || 'sl',
          en: a.en || '',
          traveler: a.traveler || '',
          avg: a.avg || '',
          min: a.min || '',
          spec_result: a.spec || '',
          trigger: a.trigger || '',
          msg: a.remark || a.msg || '',
        }));
        localStorage.setItem(LS_KEY_ALERTS, JSON.stringify(_alertsCache));
      }
    } catch (err) {
      console.error('Failed to load live data from server:', err);
      // Fallback to localStorage
      try {
        _recordsCache = JSON.parse(localStorage.getItem(LS_KEY_POF) || '[]');
        _alertsCache = JSON.parse(localStorage.getItem(LS_KEY_ALERTS) || '[]');
      } catch { _recordsCache = []; _alertsCache = []; }
    }
  } else {
    //  Offline:  localStorage 
    try {
      _recordsCache = JSON.parse(localStorage.getItem(LS_KEY_POF) || '[]');
      _alertsCache = JSON.parse(localStorage.getItem(LS_KEY_ALERTS) || '[]');
    } catch { _recordsCache = []; _alertsCache = []; }
  }

  updateKPIs();
  updateBadges();

  //  tab 
  const activeTabBtn = document.querySelector('.nav-btn.active');
  const tabName = activeTabBtn ? (activeTabBtn.getAttribute('data-tab') || 'manual') : 'manual';
  if (tabName === 'records') renderRecords();
  if (tabName === 'viz') renderCharts();
  if (tabName === 'alerts') renderAlerts();
}

async function syncWithServer() {
  showToast('กำลัง Sync ข้อมูล...', 'info');
  await checkBackendConnection();
  if (isServerOnline && _recordsCache.length > 0) {
    try {
      await fetch(`${BACKEND_URL}/api/pof/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_data: { records: _recordsCache } })
      });
    } catch (e) {
      console.warn('POF Push sync failed', e);
    }
  }
  await refreshDataFromServer();
  showToast(isServerOnline ? '✅ Sync สำเร็จ' : '⚠️ ออฟไลน์: ใช้ข้อมูลในเครื่อง', isServerOnline ? 'success' : 'warn');
}

// 
//  Mode / Product change  update form
// 
function onModeChange() {
  const modeKey = document.getElementById('m-mode')?.value;
  const badge = document.getElementById('type-badge');
  if (badge && modeKey && MODES[modeKey]) {
    const m = MODES[modeKey];
    badge.textContent = m.label;
    badge.style.color = m.color;
    badge.style.background = m.bg;
    badge.style.border = `1px solid ${m.color}33`;
  }
  if (window.SERVER_PRODUCTS_LIST && window.SERVER_PRODUCTS_LIST.length > 0) {
    populateProductDropdowns(modeKey);
  }
  onProductChange();
}

function onProductChange() {
  const prodKey = document.getElementById('m-product')?.value;
  const modeKey = document.getElementById('m-mode')?.value || 'buyoff';
  const typeKey = 'sl'; // Defaulting to 'sl' since Coil Type selector is removed

  const p = prodKey ? PRODUCTS[prodKey] : null;
  const spc = (prodKey && modeKey) ? getSPC(prodKey, modeKey, typeKey) : null;

  const specLabel = document.getElementById('form-spec-label');
  const measSec = document.getElementById('meas-section');
  const noMsg = document.getElementById('no-product-msg');
  const typeWrap = document.getElementById('coil-type-wrap');
  const grpBobbin = document.getElementById('grp-bobbin');

  if (p && grpBobbin) {
    const hasBobbin = p.types?.includes('bobbin');
    grpBobbin.style.display = hasBobbin ? '' : 'none';
    const grpEpoxyBobbin = document.getElementById('grp-epoxy-bobbin');
    if (grpEpoxyBobbin) grpEpoxyBobbin.style.display = hasBobbin ? '' : 'none';
  }

  if (p && spc) {
    // ── Load separate Long/Short SPC specs from localStorage (new config schema) ──
    let longSpc = { ...spc };
    let shortSpc = { ...spc };
    try {
      const allCfg = JSON.parse(localStorage.getItem('belton_pof_config_v1') || '{}');
      const pCfg = allCfg[prodKey] || allCfg['default'];
      const grp = MODES[modeKey]?.spcKey || 'buyoff';
      if (pCfg && pCfg[grp]) {
        const bc = pCfg[grp];
        // Long Fantail overrides
        if (bc.long_lsl != null) longSpc.spec = bc.long_lsl;
        if (bc.long_ucl != null) longSpc.trigger = bc.long_ucl;
        if (bc.long_ucl != null) longSpc.ucl = bc.long_ucl;
        if (bc.long_cl != null) longSpc.cl = bc.long_cl;
        if (bc.long_lcl != null) longSpc.lcl = bc.long_lcl;
        if (bc.long_usl != null) longSpc.usl = bc.long_usl;
        // Short Fantail overrides
        if (bc.short_lsl != null) shortSpc.spec = bc.short_lsl;
        if (bc.short_ucl != null) shortSpc.trigger = bc.short_ucl;
        if (bc.short_ucl != null) shortSpc.ucl = bc.short_ucl;
        if (bc.short_cl != null) shortSpc.cl = bc.short_cl;
        if (bc.short_lcl != null) shortSpc.lcl = bc.short_lcl;
        if (bc.short_usl != null) shortSpc.usl = bc.short_usl;
      }
    } catch { }

    // Store separate specs for use in calcResult
    window._pofSpcLong = longSpc;
    window._pofSpcShort = shortSpc;

    if (specLabel) {
      specLabel.textContent =
        `${p.label} [${MODES[modeKey]?.label || modeKey}] · Long LSL: ${longSpc.spec} | Short LSL: ${shortSpc.spec} ${p.unit} | UCL: ${longSpc.ucl}`;
    }
    if (measSec) measSec.style.display = '';
    if (noMsg) noMsg.style.display = 'none';

    document.getElementById('meas-spec-tag').textContent = `(LSL Long ${longSpc.spec} / Short ${shortSpc.spec} ${p.unit})`;

    const mb1 = document.getElementById('m-bobbin1');
    const mb2 = document.getElementById('m-bobbin2');
    if (mb1) mb1.value = '';
    if (mb2) mb2.value = '';

    const l1 = document.getElementById('label-long1');
    const s2 = document.getElementById('label-short2');
    if (l1) l1.textContent = `Long Fantail (${p.unit})`;
    if (s2) s2.textContent = `Short Fantail (${p.unit})`;

    // Gauge ticks (use long spc for display)
    const tl = document.getElementById('t-lcl');
    const tc = document.getElementById('t-cl');
    const tu = document.getElementById('t-ucl');
    if (tl) tl.textContent = longSpc.lcl;
    if (tc) tc.textContent = longSpc.cl;
    if (tu) tu.textContent = longSpc.ucl;

    document.getElementById('page-sub').textContent = `Push Out Force  ${p.label}  v4.0`;
  } else {
    window._pofSpcLong = null;
    window._pofSpcShort = null;
    if (specLabel) specLabel.textContent = 'เลือก Product และ Mode เพื่อดู SPC Spec';
    if (measSec) measSec.style.display = 'none';
    if (noMsg) noMsg.style.display = '';
  }

  // Toggle Header fields based on Mode
  const grpOven = document.getElementById('grp-oven');
  const grpLot = document.getElementById('grp-lot');
  const grpQty = document.getElementById('grp-qty');

  if (grpOven) grpOven.style.display = (modeKey === 'oba') ? 'none' : '';
  if (grpLot) grpLot.style.display = (modeKey === 'roving' || modeKey === 'new_roving' || modeKey === 'special') ? 'none' : '';
  if (grpQty) grpQty.style.display = ''; // Always show Frequency now

  // Load Frequency from system config
  const qtyInput = document.getElementById('m-qty');
  if (qtyInput && prodKey) {
    try {
      const allCfg = JSON.parse(localStorage.getItem('belton_pof_config_v1') || '{}');
      const pCfg = allCfg[prodKey] || allCfg['default'];
      if (pCfg) {
        if (modeKey === 'buyoff' || modeKey === 'oba' || modeKey.includes('roving')) {
          qtyInput.value = pCfg.freq ? `${pCfg.freq}/Shift/Oven` : '';
        } else {
          qtyInput.value = '';
        }
      } else {
        qtyInput.value = '';
      }
    } catch (e) {
      qtyInput.value = '';
    }
  } else if (qtyInput) {
    qtyInput.value = '';
  }

  // Re-init epoxy pickers with product-specific thresholds
  if (typeof initEpoxyPickers === 'function') initEpoxyPickers();

  calcResult();
}

// 
//  Live Calculation  (Long / Short Fantail use separate SPC specs)
// 
function calcResult() {
  const l1 = parseFloat(document.getElementById('m-long1')?.value);
  const s2 = parseFloat(document.getElementById('m-short2')?.value);
  const prodKey = document.getElementById('m-product')?.value;
  const modeKey = document.getElementById('m-mode')?.value || 'buyoff';
  const typeKey = 'sl';
  const spc = (prodKey && modeKey) ? getSPC(prodKey, modeKey, typeKey) : null;
  const p = prodKey ? PRODUCTS[prodKey] : null;

  // Use separate Long/Short specs if available (from new config), else fall back to shared spc
  const longSpc = window._pofSpcLong || spc;
  const shortSpc = window._pofSpcShort || spc;

  const vals = [];
  if (!isNaN(l1)) vals.push(l1);
  if (!isNaN(s2)) vals.push(s2);

  let b1 = NaN, b2 = NaN;
  if (p && p.types?.includes('bobbin')) {
    b1 = parseFloat(document.getElementById('m-bobbin1')?.value);
    b2 = parseFloat(document.getElementById('m-bobbin2')?.value);
    if (!isNaN(b1)) vals.push(b1);
    if (!isNaN(b2)) vals.push(b2);
  }

  if (vals.length === 0) { resetResultBox(); return; }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const max = Math.max(...vals);
  const min = Math.min(...vals);

  document.getElementById('r-avg').textContent = fmt(avg);
  document.getElementById('r-max').textContent = fmt(max);
  document.getElementById('r-min').textContent = fmt(min);

  // Separate spec check for Long and Short
  const longSpecMin = longSpc ? longSpc.spec : 25;
  const shortSpecMin = shortSpc ? shortSpc.spec : 25;

  const longOk = !isNaN(l1) ? (l1 >= longSpecMin) : true;
  const shortOk = !isNaN(s2) ? (s2 >= shortSpecMin) : true;
  const inSpec = longOk && shortOk;

  const resEl = document.getElementById('r-result');
  if (resEl) {
    resEl.textContent = inSpec ? 'IN' : 'OUT';
    resEl.style.color = inSpec ? 'var(--pass)' : 'var(--fail)';
  }

  const sel = document.getElementById('m-out-spec');
  if (sel && sel.value === '') sel.value = inSpec ? 'IN' : 'OUT';

  colorInput('m-long1', l1, longSpecMin);
  colorInput('m-short2', s2, shortSpecMin);
  colorInput('m-bobbin1', b1, spc?.spec ?? 25);
  colorInput('m-bobbin2', b2, spc?.spec ?? 25);

  // Gauge uses long spc for display
  if (longSpc) updateGauge(avg, longSpc);
}

function colorInput(id, val, specMin) {
  const el = document.getElementById(id);
  if (!el || isNaN(val)) return;
  el.classList.remove('input-ok', 'input-warn', 'input-error');
  if (val < specMin) el.classList.add('input-error');
  else if (val < specMin * 1.1) el.classList.add('input-warn');
  else el.classList.add('input-ok');
}

function resetResultBox() {
  ['r-avg', 'r-max', 'r-min', 'r-result'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '—'; el.style.color = 'var(--text3)'; }
  });
  const chips = document.getElementById('spc-chips');
  if (chips) chips.innerHTML = '';
}

function updateGauge(avg, spc) {
  const needle = document.getElementById('spc-needle');
  const chips = document.getElementById('spc-chips');
  if (!needle || !spc) return;
  const range = spc.ucl - spc.lcl;
  const pos = range > 0 ? Math.max(0, Math.min(100, ((avg - spc.lcl) / range) * 100)) : 50;
  needle.style.left = pos + '%';
  const inSpec = avg >= spc.spec;
  const inTrigger = avg >= spc.trigger;
  const inCL = avg >= spc.lcl && avg <= spc.ucl;
  if (chips) chips.innerHTML = [
    { label: 'Spec', ok: inSpec },
    { label: 'Trigger', ok: inTrigger },
    { label: 'Control Limit', ok: inCL },
  ].map(s => `<span class="spc-chip ${s.ok ? 'ok' : 'out'}">${s.ok ? '✅' : '❌'} ${s.label}</span>`).join('');
}

// 
//  Save Record  MySQL DB via API (or localStorage offline)
// 
let DRAFT_STATE = {
  drafts: [],
  requiredQty: 0,
  headerData: null
};

async function addDraft() {
  const prodKey = document.getElementById('m-product')?.value;
  const modeKey = document.getElementById('m-mode')?.value || 'buyoff';
  const typeKey = 'sl';

  if (!prodKey) { showToast('กรุณาเลือก Product', 'warn'); return; }

  const qtyInput = document.getElementById('m-qty')?.value || '';
  const parsedQty = parseInt(qtyInput, 10);
  const requiredQty = (!isNaN(parsedQty) && parsedQty > 0) ? parsedQty : 1;

  if (DRAFT_STATE.drafts.length === 0) {
    DRAFT_STATE.requiredQty = requiredQty;
    DRAFT_STATE.headerData = {
      prodKey, modeKey, typeKey,
      date: document.getElementById('m-date')?.value || todayISO(),
      condition: document.getElementById('m-condition')?.value || 'NTC',
      oven: document.getElementById('m-oven')?.value.trim() || '',
      team: document.getElementById('m-team')?.value || '',
      en: document.getElementById('m-en')?.value.trim() || '',
      traveler: document.getElementById('m-ptno')?.value.trim() || '',
      ptno: document.getElementById('m-ptno')?.value.trim() || '',
      time: document.getElementById('m-time')?.value.trim() || '',
      sample_date: document.getElementById('m-sample-date')?.value.trim() || '',
      lot: document.getElementById('m-lot')?.value.trim() || '',
      qtyInput: qtyInput
    };
  } else {
    // Validate header fields haven't changed
    if (prodKey !== DRAFT_STATE.headerData.prodKey) {
      showToast('ไม่สามารถเปลี่ยน Product ระหว่างที่ทำ Draft ได้', 'warn');
      return;
    }
  }

  const l1 = parseFloat(document.getElementById('m-long1')?.value);
  const s2 = parseFloat(document.getElementById('m-short2')?.value);
  const p = PRODUCTS[prodKey];
  const hasBobbin = p?.types?.includes('bobbin');
  const b1 = hasBobbin ? parseFloat(document.getElementById('m-bobbin1')?.value) : NaN;
  const b2 = hasBobbin ? parseFloat(document.getElementById('m-bobbin2')?.value) : NaN;

  if (isNaN(l1) || isNaN(s2) || (hasBobbin && (isNaN(b1) || isNaN(b2)))) {
    showToast('กรุณากรอกค่าวัดให้ครบ', 'warn');
    return;
  }

  const spc = getSPC(prodKey, modeKey, typeKey);
  if (!spc) { showToast('ไม่พบ SPC config สำหรับ product/mode/type นี้', 'error'); return; }

  const longSpc = window._pofSpcLong || spc;
  const shortSpc = window._pofSpcShort || spc;

  const vals = [l1, s2];
  if (hasBobbin) vals.push(b1, b2);

  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min;

  const longOk = l1 >= longSpc.spec;
  const shortOk = s2 >= shortSpc.spec;
  const inSpec = longOk && shortOk;
  const inTrigger = avg >= (longSpc.trigger ?? longSpc.ucl ?? spc.trigger);
  const inCL = avg >= spc.lcl && avg <= spc.ucl;

  const outSpec = document.getElementById('m-out-spec')?.value || (inSpec ? 'IN' : 'OUT');
  const overall = document.getElementById('m-overall')?.value || (inSpec ? 'Pass' : 'Fail');

  // Push to drafts
  const draftItem = {
    id: Date.now(),
    l1, s2, b1, b2, avg, max, min, range,
    inSpec, inTrigger, inCL, outSpec, overall,
    spc, longSpc, shortSpc,
    remark: document.getElementById('m-remark')?.value.trim() || '',
    eblock_long: window.EP_VALS?.ebl_long ?? null,
    eblock_short: window.EP_VALS?.ebs_long ?? null,
    eblock_avg: document.getElementById('m-eblock-avg')?.value !== '' ? parseFloat(document.getElementById('m-eblock-avg').value) : null,
    ebl_long: window.EP_VALS?.ebl_long, ebl_center: window.EP_VALS?.ebl_center, ebl_short: window.EP_VALS?.ebl_short,
    ebs_long: window.EP_VALS?.ebs_long, ebs_center: window.EP_VALS?.ebs_center, ebs_short: window.EP_VALS?.ebs_short,
    coil_short: document.getElementById('m-coil-short')?.value ? parseFloat(document.getElementById('m-coil-short').value) : null,
    coil_center: document.getElementById('m-coil-center')?.value ? parseFloat(document.getElementById('m-coil-center').value) : null,
    coil_long: document.getElementById('m-coil-long')?.value ? parseFloat(document.getElementById('m-coil-long').value) : null,
    bobbin_short: document.getElementById('m-bobbin-short')?.value ? parseFloat(document.getElementById('m-bobbin-short').value) : null,
    bobbin_center: document.getElementById('m-bobbin-center')?.value ? parseFloat(document.getElementById('m-bobbin-center').value) : null,
    bobbin_long: document.getElementById('m-bobbin-long')?.value ? parseFloat(document.getElementById('m-bobbin-long').value) : null
  };

  DRAFT_STATE.drafts.push(draftItem);
  
  // Clear measurement inputs
  document.getElementById('m-long1').value = '';
  document.getElementById('m-short2').value = '';
  if (hasBobbin) {
    document.getElementById('m-bobbin1').value = '';
    document.getElementById('m-bobbin2').value = '';
  }
  document.getElementById('m-long1').focus();

  updateDraftUI();
  showToast(`บันทึก Draft ${DRAFT_STATE.drafts.length}/${DRAFT_STATE.requiredQty}`);
}

function updateDraftUI() {
  const panel = document.getElementById('draft-panel');
  const container = document.getElementById('draft-container');
  const title = document.getElementById('draft-title');
  const btnSubmit = document.getElementById('btn-submit-drafts');

  if (!panel || !container || !title) return;

  if (DRAFT_STATE.drafts.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  title.textContent = `Pending Drafts Progress (${DRAFT_STATE.drafts.length}/${DRAFT_STATE.requiredQty})`;
  
  let html = `<table class="draft-table"><thead><tr><th>No.</th><th>Long1</th><th>Short2</th><th>Bobbin1</th><th>Bobbin2</th><th>Avg</th><th>Result</th><th>Action</th></tr></thead><tbody>`;

  DRAFT_STATE.drafts.forEach((d, idx) => {
    html += `<tr><td>${idx + 1}</td><td>${d.l1}</td><td>${d.s2}</td><td>${isNaN(d.b1) ? '-' : d.b1}</td><td>${isNaN(d.b2) ? '-' : d.b2}</td><td>${fmt(d.avg, 2)}</td><td style="color:${d.overall === 'Pass' ? 'var(--pass)' : 'var(--fail)'}">${d.overall}</td><td><button class="btn btn-outline btn-sm" onclick="removeDraft(${idx})">ลบ</button></td></tr>`;
  });
  html += `</tbody></table>`;

  container.innerHTML = html;

  if (DRAFT_STATE.drafts.length >= DRAFT_STATE.requiredQty) {
    btnSubmit.disabled = false;
  } else {
    btnSubmit.disabled = true;
  }
}

function removeDraft(idx) {
  DRAFT_STATE.drafts.splice(idx, 1);
  updateDraftUI();
}

function clearDrafts() {
  DRAFT_STATE.drafts = [];
  DRAFT_STATE.headerData = null;
  updateDraftUI();
}

async function _doSubmitDrafts() {
  if (DRAFT_STATE.drafts.length < DRAFT_STATE.requiredQty) {
    showToast('ข้อมูล Draft ยังไม่ครบ', 'warn');
    return;
  }

  const h = DRAFT_STATE.headerData;
  const p = PRODUCTS[h.prodKey];

  const newRecords = [];
  const mysqlRecords = [];

  DRAFT_STATE.drafts.forEach((d, i) => {
    const no = _recordsCache.length + 1 + i;
    const recId = Date.now() + i;

    const rec = {
      id: recId, no,
      date: h.date,
      mode: h.modeKey,
      modeLabel: MODES[h.modeKey]?.label || h.modeKey,
      coilType: h.typeKey,
      product: h.prodKey,
      productLabel: p.label,
      unit: p.unit,
      condition: h.condition,
      oven: h.oven,
      team: h.team,
      en: h.en,
      traveler: h.traveler,
      ptno: h.ptno,
      time: h.time,
      sample_date: h.sample_date,
      lot: h.lot,
      qty: h.qtyInput,
      remark: d.remark,
      long1: d.l1, short2: d.s2, bobbin1: d.b1, bobbin2: d.b2, 
      avg: d.avg, max: d.max, min: d.min, range: d.range,
      spc_ucl: d.spc.ucl,
      spc_cl: d.spc.cl,
      spc_lcl: d.spc.lcl,
      spc_trig: d.spc.trigger,
      spc_spec: d.spc.spec,
      spec_result: d.outSpec,
      eblock_long: d.eblock_long, eblock_short: d.eblock_short, eblock_avg: d.eblock_avg,
      ebl_long: d.ebl_long, ebl_center: d.ebl_center, ebl_short: d.ebl_short,
      ebs_long: d.ebs_long, ebs_center: d.ebs_center, ebs_short: d.ebs_short,
      coil_short: d.coil_short, coil_center: d.coil_center, coil_long: d.coil_long,
      bobbin_short: d.bobbin_short, bobbin_center: d.bobbin_center, bobbin_long: d.bobbin_long,
      trigger: d.inTrigger ? 'IN' : 'OUT',
      out_cl: d.inCL ? 'IN' : 'OUT',
      trend: 'IN',
      nine_pt: 'IN',
      overall: d.overall,
      savedAt: new Date().toISOString()
    };
    newRecords.push(rec);

    mysqlRecords.push({
      no: rec.no, mode: rec.mode, coil_type: rec.coilType,
      product: rec.product, product_label: rec.productLabel, unit: rec.unit,
      condition: rec.condition, date: rec.date, oven: rec.oven,
      team: rec.team, en: rec.en, traveler: rec.traveler, ptno: rec.ptno,
      test_time: rec.time, sample_build_date: rec.sample_date, lot: rec.lot,
      qty: rec.qty, remark: rec.remark,
      long1: rec.long1, short2: rec.short2, bobbin1: rec.bobbin1, bobbin2: rec.bobbin2,
      avg: rec.avg, max: rec.max, min: rec.min, range: rec.range,
      spec_result: rec.spec_result, trigger: rec.trigger, out_cl: rec.out_cl,
      trend: rec.trend, nine_pt: rec.nine_pt, overall: rec.overall,
      spc_ucl: rec.spc_ucl, spc_cl: rec.spc_cl, spc_lcl: rec.spc_lcl,
      spc_trig: rec.spc_trig, spc_spec: rec.spc_spec,
      eblock_long: rec.eblock_long, eblock_short: rec.eblock_short, eblock_avg: rec.eblock_avg,
      coil_short: rec.coil_short, coil_center: rec.coil_center, coil_long: rec.coil_long,
      bobbin_short: rec.bobbin_short, bobbin_center: rec.bobbin_center, bobbin_long: rec.bobbin_long,
      savedAt: rec.savedAt
    });
  });

  _recordsCache.push(...newRecords);
  localStorage.setItem(LS_KEY_POF, JSON.stringify(_recordsCache));

  // Only generate 1 alert even if there are N records, using the first record's data
  const isAlert = newRecords.some(r => r.spec_result === 'OUT' || r.trigger === 'OUT');
  if (isAlert) {
    const failedRec = newRecords.find(r => r.spec_result === 'OUT' || r.trigger === 'OUT') || newRecords[0];
    alert(`แจ้งเตือน: พบข้อมูลอยู่นอกเกณฑ์ (Fail/Out of Spec)! \nโปรดตรวจสอบ Product: ${p.label} EN: ${failedRec.en || '-'}`);

    const alertObj = {
      id: failedRec.id,
      ts: failedRec.savedAt,
      level: failedRec.spec_result === 'OUT' ? 'ng' : 'warn',
      product: p.label,
      mode: h.modeKey,
      modeLabel: failedRec.modeLabel,
      coilType: h.typeKey,
      en: failedRec.en,
      traveler: failedRec.traveler,
      oven: failedRec.oven,
      avg: failedRec.avg.toFixed(2),
      min: failedRec.min.toFixed(2),
      spec_result: failedRec.spec_result,
      trigger: failedRec.trigger,
      msg: failedRec.spec_result === 'OUT'
        ? `Out of Spec: Min = ${failedRec.min.toFixed(2)} ${p.unit} (Spec  ${failedRec.spc_spec})`
        : `Out of Trigger: Avg = ${failedRec.avg.toFixed(2)} ${p.unit} (Trigger  ${failedRec.spc_trig})`,
    };
    _alertsCache.unshift(alertObj);
    localStorage.setItem(LS_KEY_ALERTS, JSON.stringify(_alertsCache));
    if (typeof triggerAutoEml === 'function') triggerAutoEml(failedRec, failedRec.spc_spec); // Adjust spc passing if needed
    renderAlerts();
    if (typeof updateBadge === 'function') updateBadge();
  }

  // Clear Form
  clearForm();
  clearDrafts();
  
  showToast('บันทึกข้อมูลเรียบร้อย (POF)', 'success');

  // Change tab
  const recordsBtn = document.querySelector('.nav-btn[data-tab="records"]');
  if (recordsBtn) {
      switchTab('records', recordsBtn);
  }
  
  // MySQL 
  if (isServerOnline) {
    try {
      const body = {
        records: mysqlRecords,
        alerts: _alertsCache,
      };

      fetch(`${BACKEND_URL}/api/pof/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      .then(res => res.json())
      .then(r => {
        if (r.success) {
          console.log(`ส่งขึ้น MySQL แล้ว (Record #${newRecords[0]?.no})`);
        } else {
          showToast(`บันทึกสำเร็จแต่ส่ง MySQL ไม่ได้: ${r.message}`, 'warn');
        }
      })
      .catch(() => {
        showToast('บันทึกสำเร็จแต่ส่ง MySQL ไม่ได้ (Network Error)', 'warn');
      });
    } catch {
      showToast('บันทึกสำเร็จแต่ส่ง MySQL ไม่ได้ (Network Error)', 'warn');
    }
  } else {
    showToast(`บันทึกข้อมูลลงเครื่องสำเร็จ (โหมดออฟไลน์)`, 'warn');
  }
}

function setOverallPF(val) {
  const toggle = document.getElementById('toggle-overall');
  const input = document.getElementById('m-overall');
  if (!toggle || !input) return;
  input.value = val;
  toggle.setAttribute('data-value', val);
}

function clearForm() {
  ['m-oven', 'm-en', 'm-traveler', 'm-lot', 'm-qty', 'm-long1', 'm-short2', 'm-remark',
    'm-coil-short', 'm-coil-center', 'm-coil-long',
    'm-bobbin-short', 'm-bobbin-center', 'm-bobbin-long'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  resetEpoxySteppers();
  ['m-out-spec', 'm-out-trigger', 'm-out-cl', 'm-trend', 'm-9pt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  setOverallPF('Pass');
  const dt = document.getElementById('m-date');
  if (dt) dt.value = todayISO();
  resetResultBox();
  ['m-long1', 'm-short2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('input-ok', 'input-warn', 'input-error');
  });
}

// ─── Epoxy Coverage Picker ────────────────────────────────────────────────
const EP_VALS = {
  ebl_long: 0,
  ebl_center: 0,
  ebl_short: 0,
  ebs_long: 0,
  ebs_center: 0,
  ebs_short: 0,
};

// Threshold config — loaded from POF config (belton_pof_config_v1) or defaults
const EP_CFG = { rejectBelow: 10, holdBelow: 30, passMin: 30 };

function loadEpoxyCfgFromStorage() {
  try {
    const prodKey = document.getElementById('m-product')?.value;
    if (!prodKey) return;
    const allCfg = JSON.parse(localStorage.getItem('belton_pof_config_v1') || '{}');
    const pCfg = allCfg[prodKey] || allCfg['default'];
    const epoxy = pCfg?.epoxy;
    if (epoxy) {
      EP_CFG.rejectBelow = epoxy.reject ?? 10;
      EP_CFG.holdBelow = epoxy.hold ?? 30;
      EP_CFG.passMin = epoxy.accept ?? 30;
    } else {
      // defaults: 0 = reject, <30 = hold, ≥30 = accept
      EP_CFG.rejectBelow = 10;
      EP_CFG.holdBelow = 30;
      EP_CFG.passMin = 30;
    }
  } catch { }
}

function buildEpoxyPicker(pickerId, key) {
  const container = document.getElementById(pickerId);
  if (!container) return;
  container.innerHTML = '';
  for (let v = 0; v <= 100; v += 10) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ep-pick-btn';
    btn.textContent = v + '%';
    btn.dataset.val = v;
    btn.dataset.key = key;
    btn.onclick = () => selectEpoxyPick(key, v);
    container.appendChild(btn);
  }
  // Reflect current value
  highlightEpoxyPick(pickerId, EP_VALS[key]);
}

function selectEpoxyPick(key, val) {
  EP_VALS[key] = val;

  const pickerId = 'ep-picker-' + key;
  highlightEpoxyPick(pickerId, val);

  // Update individual display box
  const elBox = document.getElementById('epavg-' + key);
  if (elBox) elBox.textContent = val;

  // Update hidden display spans
  const elHidden = document.getElementById('epv-' + key);
  if (elHidden) elHidden.textContent = val;

  calcEpoxyAvg();
}

function highlightEpoxyPick(pickerId, val) {
  const container = document.getElementById(pickerId);
  if (!container) return;
  container.querySelectorAll('.ep-pick-btn').forEach(btn => {
    btn.classList.remove('ep-sel-reject', 'ep-sel-hold', 'ep-sel-accept');
    const bv = parseInt(btn.dataset.val);
    if (bv === val) {
      if (val < EP_CFG.rejectBelow) btn.classList.add('ep-sel-reject');
      else if (val < EP_CFG.holdBelow) btn.classList.add('ep-sel-hold');
      else btn.classList.add('ep-sel-accept');
    }
  });
}

function initEpoxyPickers() {
  loadEpoxyCfgFromStorage();
  buildEpoxyPicker('ep-picker-ebl_long', 'ebl_long');
  buildEpoxyPicker('ep-picker-ebl_center', 'ebl_center');
  buildEpoxyPicker('ep-picker-ebl_short', 'ebl_short');
  buildEpoxyPicker('ep-picker-ebs_long', 'ebs_long');
  buildEpoxyPicker('ep-picker-ebs_center', 'ebs_center');
  buildEpoxyPicker('ep-picker-ebs_short', 'ebs_short');
}

function epStep(key, delta) {
  // Legacy fallback (called from old HTML — no-op if picker UI is used)
  EP_VALS[key] = Math.min(100, Math.max(0, (EP_VALS[key] || 0) + delta));
  calcEpoxyAvg();
}

function calcEpoxyAvg() {
  const avgEbl = Math.round((EP_VALS.ebl_long + EP_VALS.ebl_center + EP_VALS.ebl_short) / 3);
  const avgEbs = Math.round((EP_VALS.ebs_long + EP_VALS.ebs_center + EP_VALS.ebs_short) / 3);

  const elEbl = document.getElementById('epavg-ebl');
  const elEbs = document.getElementById('epavg-ebs');
  if (elEbl) elEbl.textContent = avgEbl;
  if (elEbs) elEbs.textContent = avgEbs;

  // sync hidden inputs for saveRecord()
  const setHidden = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setHidden('m-eblock-long', avgEbl);
  setHidden('m-eblock-short', avgEbs);
  const overallAvg = Math.round((avgEbl + avgEbs) / 2);
  setHidden('m-eblock-avg', overallAvg);

  // Determine result using config thresholds
  let result = overallAvg >= EP_CFG.passMin ? 'pass'
    : overallAvg > EP_CFG.rejectBelow ? 'hold' : 'fail';

  ['pass', 'hold', 'fail'].forEach(r => {
    const btn = document.getElementById('ep-btn-' + r);
    if (btn) btn.className = 'ep-pill' + (result === r ? ' ep-' + r : '');
  });

  // auto-set Overall Result toggle to match
  if (result === 'pass') setOverallPF('Pass');
  else if (result === 'hold') setOverallPF('Hold');
  else setOverallPF('Fail');

  // Re-highlight pickers to reflect thresholds
  highlightEpoxyPick('ep-picker-ebl_long', EP_VALS.ebl_long);
  highlightEpoxyPick('ep-picker-ebl_center', EP_VALS.ebl_center);
  highlightEpoxyPick('ep-picker-ebl_short', EP_VALS.ebl_short);
  highlightEpoxyPick('ep-picker-ebs_long', EP_VALS.ebs_long);
  highlightEpoxyPick('ep-picker-ebs_center', EP_VALS.ebs_center);
  highlightEpoxyPick('ep-picker-ebs_short', EP_VALS.ebs_short);
}

function resetEpoxySteppers() {
  Object.keys(EP_VALS).forEach(k => { EP_VALS[k] = 0; });
  ['ep-picker-ebl_long', 'ep-picker-ebl_center', 'ep-picker-ebl_short', 'ep-picker-ebs_long', 'ep-picker-ebs_center', 'ep-picker-ebs_short'].forEach(pid => {
    const el = document.getElementById(pid);
    if (el) el.querySelectorAll('.ep-pick-btn').forEach(b =>
      b.classList.remove('ep-sel-reject', 'ep-sel-hold', 'ep-sel-accept'));
  });
  ['epavg-ebl_long', 'epavg-ebl_center', 'epavg-ebl_short', 'epavg-ebs_long', 'epavg-ebs_center', 'epavg-ebs_short', 'epavg-ebl', 'epavg-ebs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '0';
  });
  ['ep-btn-pass', 'ep-btn-hold', 'ep-btn-fail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'ep-pill';
  });
  ['m-eblock-long', 'm-eblock-short', 'm-eblock-avg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['ebl_long', 'ebl_center', 'ebl_short', 'ebs_long', 'ebs_center', 'ebs_short'].forEach(k => {
    const el = document.getElementById('epv-' + k);
    if (el) el.textContent = '0';
  });
}

// 
//  KPI & Badges
// 
function updateKPIs() {
  const recs = loadRecords();
  const inSpec = recs.filter(r => r.spec_result === 'IN').length;
  const outSp = recs.filter(r => r.spec_result === 'OUT').length;
  const outTrg = recs.filter(r => r.trigger === 'OUT').length;
  const avgs = recs.map(r => r.avg).filter(v => v > 0);
  const ovgAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const yld = recs.length ? ((inSpec / recs.length) * 100).toFixed(1) : null;
  const today = todayISO();
  const todayN = recs.filter(r => r.date === today).length;

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('kpi-total', recs.length);
  setEl('kpi-today', todayN);
  setEl('kpi-pass', inSpec);
  setEl('kpi-fail', outSp);
  setEl('kpi-trigger', outTrg);
  setEl('kpi-yield', yld !== null ? yld + '%' : '%');
  setEl('kpi-avg', ovgAvg !== null ? fmt(ovgAvg) : '');
}

function updateBadges() {
  const recs = loadRecords();
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('badge-records', recs.length);
}

// 
//  Records Table
// 
function sortTable(col) {
  _sortDir = (_sortCol === col) ? _sortDir * -1 : -1;
  _sortCol = col;
  renderRecords();
}

function resetFilter() {
  ['flt-search', 'flt-mode', 'flt-product', 'flt-result', 'flt-from', 'flt-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderRecords();
}

function renderRecords() {
  let recs = loadRecords();

  const search = document.getElementById('flt-search')?.value.toLowerCase() || '';
  const mode = document.getElementById('flt-mode')?.value || '';
  const product = document.getElementById('flt-product')?.value || '';
  const result = document.getElementById('flt-result')?.value || '';
  const from = document.getElementById('flt-from')?.value || '';
  const to = document.getElementById('flt-to')?.value || '';

  if (search) recs = recs.filter(r =>
    (r.en || '').toLowerCase().includes(search) ||
    (r.traveler || '').toLowerCase().includes(search) ||
    (r.productLabel || '').toLowerCase().includes(search) ||
    (r.lot || '').toLowerCase().includes(search));
  if (mode) recs = recs.filter(r => r.mode === mode);
  if (product) recs = recs.filter(r => r.product === product);
  if (result) recs = recs.filter(r => r.spec_result === result);
  if (from) recs = recs.filter(r => r.date >= from);
  if (to) recs = recs.filter(r => r.date <= to);

  recs.sort((a, b) => {
    const av = a[_sortCol] ?? 0, bv = b[_sortCol] ?? 0;
    return av < bv ? -_sortDir : av > bv ? _sortDir : 0;
  });

  // update sort arrow indicators
  ['no', 'date', 'mode', 'condition', 'productLabel', 'oven', 'team', 'en', 'spec_result', 'trigger', 'overall'].forEach(col => {
    const el = document.getElementById('s-' + col);
    if (!el) return;
    el.textContent = _sortCol === col ? (_sortDir === -1 ? ' ' : ' ') : ' ';
  });

  const tbody = document.getElementById('records-body');
  if (!tbody) return;

  const cl = document.getElementById('records-count-label');
  if (cl) cl.textContent = ` ${recs.length}  ${loadRecords().length} `;

  if (!recs.length) {
    tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;padding:32px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:8px">📋</div>ไม่มีข้อมูล</td></tr>`;
    return;
  }

  const modeTag = m => {
    const md = MODES[m] || {};
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${md.bg || 'var(--bg3)'};color:${md.color || 'var(--text2)'}">${md.label || m}</span>`;
  };
  const typePill = t => {
    const map = { sl: 'Short/Long', bobbin: 'Bobbin' };
    const col = { sl: 'rgba(30,58,138,.12)', bobbin: 'rgba(124,58,237,.12)' };
    return `<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${col[t] || 'var(--bg3)'};color:var(--text2);font-weight:600">${map[t] || t}</span>`;
  };
  const specBadge = v => {
    if (!v || v === '' || v === '') return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:var(--bg3);color:var(--text3)"></span>`;
    return v === 'IN'
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:var(--pass-bg);color:var(--pass)">IN</span>`
      : `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:var(--fail-bg);color:var(--fail)">OUT</span>`;
  };
  const ovBadge = v => {
    if (v === 'Pass') return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:var(--pass-bg);color:var(--pass)">Pass</span>`;
    if (v === 'Fail') return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:var(--fail-bg);color:var(--fail)">Fail</span>`;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:var(--warn-bg);color:var(--warn)">Hold</span>`;
  };

  const renderRow = r => `
    <tr style="border-bottom:1px solid var(--border2)">
      <td style="padding:10px"><input type="checkbox" class="rec-row-chk" value="${r.id ?? r.no}"></td>
      <td style="padding:10px;font-weight:700;color:var(--text3);font-size:12px">${r.no}</td>
      <td style="padding:10px;white-space:nowrap;font-size:12px">${r.date}</td>
      <td style="padding:8px">${modeTag(r.mode)}</td>
      <td style="padding:10px;font-weight:600;font-size:12px">${r.condition || 'NTC'}</td>
      <td style="padding:10px;font-weight:600;font-size:12px">${r.productLabel || r.product}</td>
      <td style="padding:10px;font-size:12px;color:var(--warn);font-weight:700">${r.oven || ''}</td>
      <td style="padding:10px;font-size:12px">${r.team || ''}</td>
      <td style="padding:10px;font-weight:600">${r.en || ''}</td>
      <td style="padding:10px;font-size:11px;color:#0984e3;font-weight:600">${r.traveler || ''}</td>
      <td style="padding:8px">${specBadge(r.spec_result)}</td>
      <td style="padding:8px">${specBadge(r.trigger)}</td>
      <td style="padding:8px">${ovBadge(r.overall)}</td>
      <td style="padding:8px;text-align:right">
        <div style="display:flex;gap:5px;justify-content:flex-end">
          <button onclick="showRecordDetail(${r.id ?? r.no})" title=""
                  style="padding:3px 8px;border-radius:5px;font-size:13px;border:1px solid var(--border2);background:var(--bg);cursor:pointer"></button>
          <button onclick="openEditRecordModal(${r.id ?? r.no})" title=""
                  style="padding:3px 8px;border-radius:5px;font-size:13px;border:1px solid var(--border2);background:var(--bg);cursor:pointer"></button>
          <button onclick="deleteRecord(${r.id ?? r.no})" title=""
                  style="padding:3px 8px;border-radius:5px;font-size:13px;border:1px solid rgba(220,38,38,.3);background:var(--fail-bg);cursor:pointer;color:var(--fail)"></button>
        </div>
      </td>
    </tr>`;

  if (window.BLoader && recs.length > 120) {
    tbody.innerHTML = '';
    window.BLoader.renderInChunks(recs, r => tbody.insertAdjacentHTML('beforeend', renderRow(r)), 80);
  } else {
    tbody.innerHTML = recs.map(renderRow).join('');
  }
}

function deleteRecord(id) {
  const rec = _recordsCache.find(r => r.id === id || r.no === id);
  const no = rec ? rec.no : id;
  showConfirm('ยืนยันการลบ', `ต้องการลบ Record #${no} ใช่หรือไม่?`, async () => {
    if (isServerOnline) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/pof/records/${no}`, { method: 'DELETE' });
        const r = await res.json();
        if (r.success) {
          showToast('ลบข้อมูลจาก MySQL สำเร็จ', 'success');
          await refreshDataFromServer();
        } else {
          showToast('เกิดข้อผิดพลาด: ' + r.message, 'error');
        }
      } catch {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
      }
    } else {
      _recordsCache = _recordsCache.filter(r => r.id !== id);
      _recordsCache.forEach((r, idx) => { r.no = idx + 1; });
      localStorage.setItem(LS_KEY_POF, JSON.stringify(_recordsCache));
      showToast('ลบข้อมูลในเครื่องสำเร็จ (ออฟไลน์)', 'success');
    }
    await refreshDataFromServer();
  });
}

//  About Data: Checkbox bulk-delete 
function toggleAllRecChk(master) {
  document.querySelectorAll('.rec-row-chk').forEach(c => c.checked = master.checked);
}

function deleteSelectedRecords() {
  const ids = Array.from(document.querySelectorAll('.rec-row-chk:checked')).map(c => Number(c.value));
  if (!ids.length) { showToast('', 'warn'); return; }
  showConfirm('ยืนยันการลบข้อมูล', `ลบข้อมูลจำนวน ${ids.length} รายการ? (ไม่สามารถกู้คืนได้)`, async () => {
    if (isServerOnline) {
      for (const id of ids) {
        const rec = _recordsCache.find(r => r.id === id || r.no === id);
        if (!rec) continue;
        try { await fetch(`${BACKEND_URL}/api/pof/records/${rec.no}`, { method: 'DELETE' }); } catch { }
      }
    }
    _recordsCache = _recordsCache.filter(r => !ids.includes(r.id) && !ids.includes(r.no));
    _recordsCache.forEach((r, idx) => { r.no = idx + 1; });
    saveRecords(_recordsCache);
    const masterChk = document.getElementById('rec-chk-all');
    if (masterChk) masterChk.checked = false;
    await refreshDataFromServer();
    showToast(`ลบข้อมูลสำเร็จ ${ids.length} รายการ`, 'success');
  });
}

//  About Data: Detail modal 
function showRecordDetail(id) {
  const r = _recordsCache.find(x => x.id === id || x.no === id);
  if (!r) { showToast('', 'error'); return; }
  const md = MODES[r.mode] || {};
  const body = document.getElementById('rec-detail-body');
  const title = document.getElementById('rec-detail-title');
  if (title) title.textContent = `รายละเอียด Record #${r.no}`;
  const field = (lbl, val, color) =>
    `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px">
       <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${lbl}</div>
       <div style="font-size:14px;font-weight:700;color:${color || 'var(--text)'}">${val ?? ''}</div>
     </div>`;
  body.innerHTML = [
    field('Record No.', r.no, 'var(--text3)'),
    field('Date', r.date),
    field('Mode', md.label || r.mode, md.color || 'var(--text)'),
    field('Condition', r.condition || 'NTC'),
    field('Product', r.productLabel || r.product),
    field('Oven / M/C #', r.oven),
    field('Team', r.team),
    field('EN #', r.en, 'var(--blue)'),
    field('Traveler No.', r.traveler, '#0984e3'),
    field('E-block Lot', r.lot),
    field('Qty Shipment', r.qty),
    field('Long', fmt(r.long1), 'var(--text)'),
    field('Short', fmt(r.short2), 'var(--text)'),
    field('Bobbin 1', fmt(r.bobbin1), 'var(--text)'),
    field('Bobbin 2', fmt(r.bobbin2), 'var(--text)'),
    field('Average', fmt(r.avg), 'var(--blue)'),
    field('Max', fmt(r.max)),
    field('Min', fmt(r.min)),
    field('Spec Result', r.spec_result, r.spec_result === 'IN' ? 'var(--pass)' : 'var(--fail)'),
    field('Out Trigger', r.trigger, r.trigger === 'IN' ? 'var(--pass)' : 'var(--fail)'),
    field('Overall', r.overall, r.overall === 'Pass' ? 'var(--pass)' : r.overall === 'Fail' ? 'var(--fail)' : 'var(--warn)'),
    field('UCL / CL / LCL', `${fmt(r.spc_ucl)} / ${fmt(r.spc_cl)} / ${fmt(r.spc_lcl)}`),
    field('Remark', r.remark),
  ].join('');
  document.getElementById('modal-rec-detail').style.display = 'flex';
}

//  About Data: Edit modal 
function openEditRecordModal(id) {
  const r = _recordsCache.find(x => x.id === id || x.no === id);
  if (!r) { showToast('', 'error'); return; }
  document.getElementById('edit-rec-id').value = r.id ?? r.no;
  document.getElementById('edit-rec-no').textContent = `#${r.no}`;
  document.getElementById('edit-date').value = r.date || '';
  document.getElementById('edit-team').value = r.team || '';
  document.getElementById('edit-en').value = r.en || '';
  document.getElementById('edit-traveler').value = r.traveler || '';
  document.getElementById('edit-oven').value = r.oven || '';
  document.getElementById('edit-lot').value = r.lot || '';
  document.getElementById('edit-long1').value = r.long1 ?? '';
  document.getElementById('edit-short2').value = r.short2 ?? '';
  document.getElementById('edit-bobbin1').value = r.bobbin1 ?? '';
  document.getElementById('edit-bobbin2').value = r.bobbin2 ?? '';
  document.getElementById('edit-condition').value = r.condition || 'NTC';
  document.getElementById('edit-spec').value = r.spec_result || 'IN';
  document.getElementById('edit-trigger').value = r.trigger || 'IN';
  document.getElementById('edit-overall').value = r.overall || 'Pass';
  document.getElementById('edit-remark').value = r.remark || '';
  document.getElementById('modal-rec-edit').style.display = 'flex';
}

function saveEditRecord() {
  const rawId = document.getElementById('edit-rec-id').value;
  const id = Number(rawId);
  const idx = _recordsCache.findIndex(r => r.id === id || r.no === id);
  if (idx < 0) { showToast('ไม่พบ Record ที่ต้องการแก้ไข', 'error'); return; }
  const r = _recordsCache[idx];
  r.date = document.getElementById('edit-date').value;
  r.team = document.getElementById('edit-team').value;
  r.en = document.getElementById('edit-en').value;
  r.traveler = document.getElementById('edit-traveler').value;
  r.oven = document.getElementById('edit-oven').value;
  r.lot = document.getElementById('edit-lot').value;
  const l1 = parseFloat(document.getElementById('edit-long1').value);
  const l2 = parseFloat(document.getElementById('edit-short2').value);
  const b1 = parseFloat(document.getElementById('edit-bobbin1').value);
  const b2 = parseFloat(document.getElementById('edit-bobbin2').value);

  r.long1 = isNaN(l1) ? r.long1 : l1;
  r.short2 = isNaN(l2) ? r.short2 : l2;
  r.bobbin1 = isNaN(b1) ? null : b1;
  r.bobbin2 = isNaN(b2) ? null : b2;

  const vals = [];
  if (!isNaN(r.long1)) vals.push(r.long1);
  if (!isNaN(r.short2)) vals.push(r.short2);
  if (!isNaN(r.bobbin1)) vals.push(r.bobbin1);
  if (!isNaN(r.bobbin2)) vals.push(r.bobbin2);

  if (vals.length > 0) {
    r.avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
    r.max = Math.max(...vals);
    r.min = Math.min(...vals);
    r.range = Math.round((r.max - r.min) * 100) / 100;
  }
  r.condition = document.getElementById('edit-condition').value;
  r.spec_result = document.getElementById('edit-spec').value;
  r.trigger = document.getElementById('edit-trigger').value;
  r.overall = document.getElementById('edit-overall').value;
  r.remark = document.getElementById('edit-remark').value;
  saveRecords(_recordsCache);

  if (isServerOnline) {
    try {
      fetch(`${BACKEND_URL}/api/pof/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_data: { records: [r] } })
      });
    } catch (e) {
      console.error('Sync Edit Error:', e);
    }
  }

  closeModal('modal-rec-edit');
  renderRecords();
  showToast(`บันทึกการแก้ไข Record #${r.no} สำเร็จ`, 'success');
}

function clearAllRecords() {
  showConfirm('ล้างข้อมูลทั้งหมด', 'ยืนยันการลบ Records ทั้งหมด? (รวมทั้งในระบบ)', async () => {
    if (isServerOnline) {
      try { await fetch(`${BACKEND_URL}/api/pof/records`, { method: 'DELETE' }); } catch { }
    }
    saveRecords([]);
    await refreshDataFromServer();
    showToast('ล้างข้อมูลสำเร็จ', 'success');
  });
}

function exportCSV() {
  const recs = loadRecords();
  if (!recs.length) { showToast('', 'warn'); return; }
  const headers = ['No', 'Date', 'Mode', 'CoilType', 'Product', 'Condition', 'Oven', 'Team', 'EN', 'Traveler', 'Lot', 'Qty', 'Long1', 'Short2', 'Bobbin1', 'Bobbin2', 'Avg', 'Max', 'Min', 'Range', 'Remark', 'SpecResult', 'Trigger', 'CtrlLimit', 'Trend', '9Pts', 'Overall', 'SPC_UCL', 'SPC_CL', 'SPC_LCL', 'Epoxy_Eblock_Long', 'Epoxy_Eblock_Short', 'Epoxy_Bobbin'];
  const rows = recs.map(r => [
    r.no, r.date, r.mode, r.coilType || 'sl', r.productLabel, r.condition || 'NTC',
    r.oven, r.team, r.en, r.traveler, r.lot, r.qty,
    r.long1, r.short2, r.bobbin1, r.bobbin2, fmt(r.avg), fmt(r.max), fmt(r.min), fmt(r.range),
    r.remark, r.spec_result, r.trigger, r.out_cl, r.trend, r.nine_pt, r.overall,
    r.spc_ucl, r.spc_cl, r.spc_lcl,
    r.epoxy_coverage_eblock_long, r.epoxy_coverage_eblock_short, r.epoxy_coverage_bobbin
  ]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${v ?? ''}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `POF_Records_${todayISO()}.csv`;
  a.click();
}

// 
//  SPC Charts
// 
let _chartXbar = null, _chartRange = null, _chartDist = null, _chartProd = null;

function renderCharts() {
  const key = document.getElementById('viz-product')?.value || '';
  let recs = loadRecords();
  if (key) recs = recs.filter(r => r.product === key);

  const p = key && PRODUCTS[key] ? PRODUCTS[key] : null;
  const spc = recs[0] ? {
    ucl: recs[0].spc_ucl || (p ? getSPC(recs[0].product, recs[0].mode, recs[0].coilType || 'sl')?.ucl : 0),
    cl: recs[0].spc_cl || (p ? getSPC(recs[0].product, recs[0].mode, recs[0].coilType || 'sl')?.cl : 0),
    lcl: recs[0].spc_lcl || (p ? getSPC(recs[0].product, recs[0].mode, recs[0].coilType || 'sl')?.lcl : 0),
    trigger: recs[0].spc_trig || 0,
    spec: recs[0].spc_spec || 25,
    rucl: p ? (getSPC(recs[0].product, recs[0].mode, recs[0].coilType || 'sl')?.rucl || 30) : 30,
    rcl: p ? (getSPC(recs[0].product, recs[0].mode, recs[0].coilType || 'sl')?.rcl || 15) : 15,
  } : null;

  const labels = recs.map(r => `#${r.no}`);
  const avgs = recs.map(r => r.avg);
  const ranges = recs.map(r => r.range);

  const xbarLbl = document.getElementById('xbar-lbl');
  if (xbarLbl && spc) {
    xbarLbl.textContent = `UCL:${spc.ucl} | CL:${spc.cl} | LCL:${spc.lcl} | Trig:${spc.trigger}`;
  }

  _chartXbar = buildLineChart('chart-xbar', _chartXbar, labels, avgs, 'Avg Force', spc ? [
    { label: 'UCL', val: spc.ucl, color: 'rgba(220,38,38,0.8)' },
    { label: 'CL', val: spc.cl, color: 'rgba(22,163,74,0.8)' },
    { label: 'LCL', val: spc.lcl, color: 'rgba(220,38,38,0.8)' },
    { label: 'Trigger', val: spc.trigger, color: 'rgba(234,179,8,0.7)' },
  ] : []);

  _chartRange = buildLineChart('chart-range', _chartRange, labels, ranges, 'Range', spc ? [
    { label: 'R-UCL', val: spc.rucl, color: 'rgba(220,38,38,0.8)' },
    { label: 'R-CL', val: spc.rcl, color: 'rgba(22,163,74,0.8)' },
  ] : []);

  buildHistogram('chart-dist', recs.map(r => r.avg), spc?.spec || 25);
  buildProductChart('chart-prod');
}

function buildLineChart(canvasId, existing, labels, data, dataLabel, limits = []) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return existing;
  if (existing) existing.destroy();
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: dataLabel, data,
        borderColor: 'rgba(30,58,138,0.85)',
        backgroundColor: 'rgba(30,58,138,0.08)',
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 7,
        tension: 0.3, fill: true,
      }, ...limits.map(l => ({
        label: l.label,
        data: Array(data.length).fill(l.val),
        borderColor: l.color,
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
      }))],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: {
        x: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
        y: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
      },
    },
  });
}

function buildHistogram(canvasId, values, specMin) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (_chartDist) _chartDist.destroy();
  if (!values.length) return;
  const mn = Math.min(...values), mx = Math.max(...values);
  const bins = 10;
  const step = (mx - mn) / bins || 1;
  const counts = Array(bins).fill(0);
  const binLabels = [];
  for (let i = 0; i < bins; i++) {
    const lo = mn + i * step;
    binLabels.push(lo.toFixed(1));
    values.forEach(v => { if (v >= lo && v < lo + step) counts[i]++; });
  }
  const colors = binLabels.map(l => parseFloat(l) < specMin ? 'rgba(220,38,38,0.7)' : 'rgba(30,58,138,0.7)');
  _chartDist = new Chart(ctx, {
    type: 'bar',
    data: { labels: binLabels, datasets: [{ label: 'Count', data: counts, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
        x: { ticks: { font: { size: 9 } } },
      },
    },
  });
}

function buildProductChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (_chartProd) _chartProd.destroy();
  const recs = loadRecords();
  const grouped = {};
  recs.forEach(r => {
    const lbl = r.productLabel || r.product;
    if (!grouped[lbl]) grouped[lbl] = { in: 0, out: 0 };
    if (r.spec_result === 'IN') grouped[lbl].in++; else grouped[lbl].out++;
  });
  const labels = Object.keys(grouped);
  if (!labels.length) return;
  _chartProd = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'IN Spec', data: labels.map(l => grouped[l].in), backgroundColor: 'rgba(22,163,74,0.75)', borderRadius: 4 },
        { label: 'OUT Spec', data: labels.map(l => grouped[l].out), backgroundColor: 'rgba(220,38,38,0.75)', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { stacked: false, ticks: { font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
      },
    },
  });
}

// 
//  Alert Log
// 


// 
//  EML / Outlook
// 
function triggerAutoEml(rec, spc) {
  const cfg = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
  const to = cfg.email || 'supanatt04@gmail.com';
  const p = PRODUCTS[rec.product];
  const lvl = rec.spec_result === 'OUT' ? '[FAIL / OUT SPEC]' : '[WARNING / OUT TRIGGER]';
  const subj = `${lvl} POF Alert  ${p?.label || rec.productLabel} | EN#: ${rec.en}`;
  const typeLabel = { sl: 'Short/Long', bobbin: 'Bobbin' }[rec.coilType || 'sl'] || '';

  //  chart image
  const recentRecs = loadRecords().filter(r => r.product === rec.product).slice(-20);
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 300;
  canvas.style.position = 'absolute';
  canvas.style.left = '-9999px';
  document.body.appendChild(canvas);

  let chartImg = '';
  try {
    const labels = recentRecs.map(r => `#${r.no}`);
    const minVals = recentRecs.map(r => r.min);
    const specLine = spc?.spec || 0;
    const tempChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `Min ${typeLabel} (${p?.unit})`,
            data: minVals,
            borderColor: 'rgba(37,99,235,0.9)',
            backgroundColor: 'rgba(37,99,235,0.1)',
            borderWidth: 2, pointRadius: 4, tension: 0.3,
          },
          {
            label: `LSL (${specLine})`,
            data: Array(labels.length).fill(specLine),
            borderColor: 'rgba(231,76,60,0.7)',
            borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: false, animation: false,
        plugins: {
          title: {
            display: true,
            text: `POF Trend: ${p?.label || rec.productLabel} (Last 20)`,
            font: { size: 13, weight: 'bold' },
          },
          legend: { position: 'top' },
        },
      },
    });
    chartImg = canvas.toDataURL('image/png');
    tempChart.destroy();
  } catch (e) {
    console.error('Chart gen error:', e);
  } finally {
    document.body.removeChild(canvas);
  }

  const html = `
  <div style="font-family:'Prompt','Calibri','Segoe UI',sans-serif;color:#333;max-width:700px;margin:0 auto;
              border:1.5px solid #d1d5db;border-radius:8px;overflow:hidden;">
    <div style="background:#1e3a8a;padding:18px 24px;color:white;">
      <h2 style="margin:0;font-size:20px;font-weight:700;">
        ${rec.spec_result === 'OUT' ? ' CRITICAL FAIL' : ' WARNING'}  Push Out Force
      </h2>
      <p style="margin:4px 0 0;opacity:0.9;font-size:13px;">Belton Automated Real-time Quality Alert System</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563;width:35%">Product</td>
          <td style="padding:8px 0;color:#1f2937"><b>${p?.label || rec.productLabel || ''}</b></td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563">Mode</td>
          <td style="padding:8px 0;color:#1f2937">${rec.modeLabel || rec.mode}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563">EN#</td>
          <td style="padding:8px 0;color:#1f2937">${rec.en || ''}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563">Traveler</td>
          <td style="padding:8px 0;color:#1f2937">${rec.traveler || ''}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563">Date</td>
          <td style="padding:8px 0;color:#1f2937">${rec.date}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563">Coil Type</td>
          <td style="padding:8px 0;color:#1f2937">${typeLabel}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563">Average</td>
          <td style="padding:8px 0;font-weight:bold;color:#1e3a8a">${fmt(rec.avg)} ${p?.unit}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563">Min Value</td>
          <td style="padding:8px 0;font-weight:bold;color:${rec.spec_result === 'IN' ? '#27ae60' : '#dc2626'}">
            ${fmt(rec.min)} ${p?.unit}
          </td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 0;font-weight:700;color:#4b5563">Spec LSL</td>
          <td style="padding:8px 0;color:#1f2937">${spc?.spec} ${p?.unit}</td>
        </tr>
      </table>
      ${chartImg ? `
      <div style="margin:24px 0;text-align:center;">
        <p style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:bold"> POF Min Value Trend (Last 20)</p>
        <img src="${chartImg}" alt="POF Trend" style="max-width:100%;border:1px solid #e5e7eb;border-radius:6px;">
      </div>` : ''}
      <div style="background:#fef9ee;border-left:4px solid #1e3a8a;padding:12px 16px;margin-top:20px;
                  font-size:13px;border-radius:0 4px 4px 0;">
        <span style="font-weight:700;color:#374151;"> Action Required:</span>
        ${rec.spec_result === 'OUT'
      ? 'POF is out of spec. Halt production and investigate immediately!'
      : 'POF is below control trigger limit. Investigate the process!'}
      </div>
    </div>
  </div>`;

  downloadEmlBlob(to, subj, html);
}

function sendSingleAlertEml(id) {
  const a = loadAlerts().find(x => x.id === id);
  if (!a) return;
  const cfg = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
  const to = cfg.email || 'supanatt04@gmail.com';
  const lvl = a.level === 'ng' ? '[FAIL / OUT SPEC]' : '[WARNING / OUT TRIGGER]';
  const subj = `${lvl} POF Alert  ${a.product} | EN#: ${a.en}`;
  const body = `BELTON IPQC  Push Out Force Individual Alert\n${''.repeat(50)}\n` +
    `Severity  : ${lvl}\nDate/Time : ${new Date(a.ts).toLocaleString('th-TH')}\n` +
    `Product   : ${a.product}\nMode      : ${a.modeLabel || a.mode}\nCoil Type : ${a.coilType || 'sl'}\n` +
    `EN#       : ${a.en || ''}\nTraveler  : ${a.traveler || ''}\n` +
    `Avg Value : ${a.avg}\nMin Value : ${a.min}\nSpec Rslt : ${a.spec_result}\nTrigger   : ${a.trigger}\n` +
    `${''.repeat(50)}\n${a.msg}\n\n(Auto-generated by BELTON IPQC Push Out Force System)`;
  downloadEmlBlob(to, subj, `<pre style="font-family:'Prompt','Calibri',sans-serif;font-size:13px">${body}</pre>`);
}

function generateOutlookDraft() {
  const alerts = loadAlerts();
  const threshold = document.getElementById('outlook-threshold')?.value || 'critical';
  const filtered = threshold === 'critical' ? alerts.filter(a => a.level === 'ng') : alerts;
  if (!filtered.length) { showToast('ไม่มี Alert ที่ต้องการส่ง', 'warn'); return; }

  const cfg = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
  const to = document.getElementById('outlook-to')?.value || cfg.email || 'supanatt04@gmail.com';
  const now = new Date().toLocaleString('th-TH');
  const subj = `[IPQC POF Alert Summary] Push Out Force  ${now}`;
  const rows = filtered.map(a => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:7px 10px">${new Date(a.ts).toLocaleString('th-TH')}</td>
      <td style="padding:7px 10px;color:${a.level === 'ng' ? '#dc2626' : '#d97706'};font-weight:700">
        ${a.level === 'ng' ? 'FAIL' : 'WARN'}
      </td>
      <td style="padding:7px 10px">${a.product}</td>
      <td style="padding:7px 10px">${a.modeLabel || a.mode}</td>
      <td style="padding:7px 10px">${{ sl: 'Short/Long', bobbin: 'Bobbin' }[a.coilType || 'sl'] || ''}</td>
      <td style="padding:7px 10px">${a.en || ''}</td>
      <td style="padding:7px 10px;font-weight:700">${a.avg}</td>
      <td style="padding:7px 10px">${a.spec_result}</td>
      <td style="padding:7px 10px;font-size:11px">${a.msg}</td>
    </tr>`).join('');

  const html = `<div style="font-family:'Prompt','Calibri',sans-serif;font-size:13px">
    <h2 style="color:#1e3a8a">BELTON IPQC  Push Out Force Alert Summary</h2>
    <p>Generated: ${now} | Total Alerts: <strong>${filtered.length}</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead style="background:#1e3a8a;color:#fff">
        <tr>
          <th style="padding:8px 10px">Time</th><th>Level</th><th>Product</th><th>Mode</th>
          <th>Type</th><th>EN#</th><th>Avg</th><th>Spec</th><th>Message</th>
        </tr>
      </thead><tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;font-size:11px;color:#6b7280">Auto-generated by BELTON IPQC System</p>
  </div>`;

  _emlCache = { to, subj, html };
  document.getElementById('ol-subject').textContent = subj;
  document.getElementById('ol-body').innerHTML = `${filtered.length} alerts ready to send to ${to}`;
  document.getElementById('export-actions').style.display = 'block';
  showToast(`สร้าง EML draft สำเร็จ (${filtered.length} alerts)`, 'success');
}

function downloadOutlookEml() {
  if (!_emlCache) { showToast('กรุณาสร้าง Draft ก่อน (Step 1)', 'warn'); return; }
  downloadEmlBlob(_emlCache.to, _emlCache.subj, _emlCache.html);
}

function downloadEmlBlob(to, subject, htmlContent) {
  const boundary = 'IPQC_POF_' + Date.now();
  const eml = [
    `From: IPQC System <ipqc@belton.com>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    htmlContent,
    ``,
    `--${boundary}--`,
  ].join('\r\n');
  const blob = new Blob([eml], { type: 'message/rfc822' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `POF_Alert_${todayISO()}.eml`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast('ดาวน์โหลดไฟล์ EML สำเร็จ! เปิดเพื่อส่งผ่าน Outlook', 'success');
}

// 
//  IMPORT EXCEL  Push Out Force
//  :
//
//  FORMAT A  "Input data NTC" / "Input data TC"  (xls )
//    Header row index 5, Data rows 13+
//    Col: 1=Oven, 2=Date, 3=Remark, 4=Qty, 5=Team, 6=EN,
//         7=EblockLot, 8=OBALot, 9=Traveler, 10=No,
//         11=Long1, 12=Short2, 13=Avg, 14=Max, 15=Min,
//         16=SpecResult, 17=Trigger, 18=OutCL, 19=Trend, 20=9Pts,
//         25=Spec, 26=TrigVal, 27=UCL, 28=CL, 29=LCL
//
//  FORMAT B  Roving "Input data TC" ( col -1,  col Remark/Qty)
//    Col: 1=Oven, 2=Date, 4=Team, 5=EN, 6=EblockLot, 7=OBALot,
//         8=Traveler, 9=No, 10=Long1, 11=Short2, 12=Avg, 13=Max, 14=Min,
//         15=SpecResult, 16=Trigger, 17=OutCL, 18=Trend, 19=9Pts
//
//  FORMAT C  OBA "Input data TC" ( 4 : 11,12,13,14)
//    Col: 1=Oven, 2=Date, 3=Remark, 4=Qty, 5=Team, 6=EN,
//         7=EblockLot, 8=OBALot, 9=Traveler, 10=No,
//         11=Long1, 12=Long2, 13=Short3, 14=Short4, 15=Avg,
//         18=SpecResult, 19=Trigger, 20=OutCL, 21=Trend, 22=9Pts
//
//  FORMAT D  New xlsm "Push out force" (ACA format)
//    Header row 5, Data rows 9+ (col 1=Date, 2=Shift, 3=Time,
//    4=EN, 5=Oven, 6=SampleDate, 7=PTNo)
//    Long Fantail: cols 10-21, Short Fantail: cols 22-33, Bobbin: cols 34-45
// 

//  State 
let _impParsedRows = [];

//  Data row start (0-based) 
const IMP_DATA_START_ROW = 13;  // Format A/B/C
const IMP_DATA_START_ROW_D = 9;   // Format D (xlsm ACA)

//  Sheet name candidates 
const IMP_SHEET_NAMES = {
  NTC: ['Input data NTC', 'input data ntc'],
  TC: ['Input data TC', 'input data tc'],
  NEW: ['Push out force', 'push out force'],   // Format D (xlsm)
};

//  Detect Format: A, B, C, D 
// Returns { fmt:'A'|'B'|'C'|'D', colMap:{} }
function detectImpFormat(rows, sheetName) {
  // Format D: sheet name "Push out force"
  const snLow = (sheetName || '').toLowerCase();
  if (snLow.includes('push out force') && !snLow.includes('input')) {
    return { fmt: 'D' };
  }

  //  header row (row index 5)
  const hdr = rows[5] || [];
  const hdrStr = hdr.join('|').toLowerCase();

  // Format B: header row  'remark'  col 4 = 'team'
  const col4 = String(hdr[4] || '').toLowerCase();
  if (col4.includes('team')) {
    return { fmt: 'B' };
  }

  // Format C:  Long2/Short3/Short4  (OBA  4 )
  const row7 = rows[7] || [];
  const hasLong2 = row7.some(v => String(v || '').toLowerCase().includes('long 2'));
  const hasShort3 = row7.some(v => String(v || '').toLowerCase().includes('short 3'));
  if (hasLong2 && hasShort3) {
    return { fmt: 'C' };
  }

  return { fmt: 'A' };
}

//  Column index constants by format (0-based) 
const IMP_COL_A = {
  OVEN: 1, DATE: 2, REMARK: 3, QTY: 4, TEAM: 5, EN: 6,
  EBLOCK_LOT: 7, OBA_LOT: 8, TRAVELER: 9, NO: 10,
  LONG1: 11, SHORT2: 12, AVG: 13, MAX: 14, MIN: 15,
  SPEC_RESULT: 16, TRIGGER: 17, OUT_CL: 18, TREND: 19, NINE_PT: 20,
  SPEC: 25, TRIG_VAL: 26, UCL: 27, CL: 28, LCL: 29,
};
const IMP_COL_B = {  // Roving TC   1   Remark/Qty
  OVEN: 1, DATE: 2, REMARK: null, QTY: null, TEAM: 4, EN: 5,
  EBLOCK_LOT: 6, OBA_LOT: 7, TRAVELER: 8, NO: 9,
  LONG1: 10, SHORT2: 11, AVG: 12, MAX: 13, MIN: 14,
  SPEC_RESULT: 15, TRIGGER: 16, OUT_CL: 17, TREND: 18, NINE_PT: 19,
  SPEC: 24, TRIG_VAL: 25, UCL: 26, CL: 27, LCL: 28,
};
const IMP_COL_C = {  // OBA TC  4 
  OVEN: 1, DATE: 2, REMARK: 3, QTY: 4, TEAM: 5, EN: 6,
  EBLOCK_LOT: 7, OBA_LOT: 8, TRAVELER: 9, NO: 10,
  LONG1: 11, LONG2: 12, SHORT3: 13, SHORT4: 14, AVG: 15,
  SPEC_RESULT: 18, TRIGGER: 19, OUT_CL: 20, TREND: 21, NINE_PT: 22,
  SPEC: 29, TRIG_VAL: 30, UCL: 31, CL: 32, LCL: 33,
};
// Format D col refs (xlsm)   logic   constant map

// Alias compat 
const IMP_COL = IMP_COL_A;

// 
//  UI helpers
// 
function onImpProductChange() {
  const key = document.getElementById('imp-product')?.value;
  const wrap = document.getElementById('imp-coil-type-wrap');
  if (!wrap) return;
  const p = key ? PRODUCTS[key] : null;
  if (p && p.types?.includes('bobbin') && p.types?.includes('sl')) {
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
    const sel = document.getElementById('imp-coil-type');
    if (sel) sel.value = 'sl';
  }
}

function resetImport() {
  _impParsedRows = [];
  const fi = document.getElementById('imp-file-input');
  if (fi) fi.value = '';
  document.getElementById('imp-file-info')?.setAttribute('style', 'display:none');
  document.getElementById('imp-preview-card')?.setAttribute('style', 'display:none');
  document.getElementById('imp-result-card')?.setAttribute('style', 'display:none');
  document.getElementById('imp-preview-body').innerHTML = '';
  document.getElementById('imp-preview-count').textContent = '';
  const badge = document.getElementById('badge-import');
  if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
  showToast('รีเซ็ตข้อมูล Import แล้ว', 'info');
}

function handleImpDrop(event) {
  event.preventDefault();
  document.getElementById('imp-dropzone').style.borderColor = 'var(--border2)';
  const file = event.dataTransfer.files[0];
  if (file) handleImpFile(file);
}

// 
//  Main:  Excel  parse   preview
// 
function handleImpFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xls', 'xlsx'].includes(ext)) {
    showToast('รองรับเฉพาะไฟล์ .xls และ .xlsx เท่านั้น', 'error');
    return;
  }

  // 
  const infoEl = document.getElementById('imp-file-info');
  const nameEl = document.getElementById('imp-file-name');
  const metaEl = document.getElementById('imp-file-meta');
  if (infoEl) infoEl.style.display = 'flex';
  if (nameEl) nameEl.textContent = file.name;
  if (metaEl) metaEl.textContent = `ขนาด: ${(file.size / 1024).toFixed(1)} KB กำลังอ่านข้อมูล...`;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });

      const sheetSel = document.getElementById('imp-sheet-sel')?.value || 'NTC';
      let allRows = [];

      //  Helper:  sheet name  
      const findSheet = (sheetKey) => {
        const candidates = IMP_SHEET_NAMES[sheetKey] || [];
        for (const cn of candidates) {
          const found = wb.SheetNames.find(n => n.toLowerCase() === cn.toLowerCase());
          if (found) return found;
        }
        // fallback fuzzy
        return wb.SheetNames.find(n =>
          n.toLowerCase().includes(sheetKey.toLowerCase())
        ) || null;
      };

      //  Helper:  cell  float 
      const pf = (v) => {
        const n = parseFloat(String(v || '').replace(/,/g, ''));
        return isNaN(n) ? null : n;
      };

      //  Helper: clean remark 
      const cleanRemark = (v) => {
        const s = String(v || '').trim();
        if (!s || s === '0' || (!isNaN(Number(s)) && s !== '')) return '';
        return s;
      };

      // 
      //  parseSheetABC   Format A, B, C (xls )
      // 
      const parseSheetABC = (sheetKey, typeOverride) => {
        const sheetName = findSheet(sheetKey) ||
          (sheetKey === 'NTC' ? null : findSheet('TC'));

        if (!sheetName) {
          //  sheet   Format D
          const newSheet = findSheet('NEW');
          if (newSheet) return parseSheetD(newSheet, typeOverride);
          showToast(`ไม่พบ Sheet "${IMP_SHEET_NAMES[sheetKey]?.[0] || sheetKey}" ในไฟล์`, 'warn');
          return [];
        }

        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '',
        });

        //  format
        const { fmt } = detectImpFormat(rows, sheetName);
        const C = fmt === 'B' ? IMP_COL_B : fmt === 'C' ? IMP_COL_C : IMP_COL_A;

        const parsed = [];
        for (let i = IMP_DATA_START_ROW; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 10) continue;

          const dateStr = parseImpDate(row[C.DATE]);
          if (!dateStr) continue;

          //  : Format C  4 , A/B  2  
          let measVals = [];
          if (fmt === 'C') {
            [C.LONG1, C.LONG2, C.SHORT3, C.SHORT4].forEach(ci => {
              const v = pf(row[ci]);
              if (v !== null) measVals.push(v);
            });
          } else {
            const v1 = pf(row[C.LONG1]);
            const v2 = pf(row[C.SHORT2]);
            if (v1 !== null) measVals.push(v1);
            if (v2 !== null) measVals.push(v2);
          }
          if (!measVals.length) continue;

          //  avg/max/min 
          let avgVal = pf(row[C.AVG]);
          let maxVal = pf(row[C.MAX]);
          let minVal = pf(row[C.MIN]);
          if (avgVal === null || avgVal === 0)
            avgVal = measVals.reduce((a, b) => a + b, 0) / measVals.length;
          if (maxVal === null || maxVal === 0) maxVal = Math.max(...measVals);
          if (minVal === null || minVal === 0) minVal = Math.min(...measVals);

          //  SPC limits 
          // Format A/B: UCL  row 8 (col 11/10),  header 
          //  read  row  fallback PRODUCTS
          const spcUCL = pf(row[C.UCL]);
          const spcCL = pf(row[C.CL]);
          const spcLCL = pf(row[C.LCL]);
          const spcSpec = pf(row[C.SPEC]);
          const spcTrig = pf(row[C.TRIG_VAL]);

          //   SPC   header rows 
          const getHeaderSPC = (label) => {
            for (let hr = 8; hr <= 12; hr++) {
              const hr_row = rows[hr] || [];
              const idx = hr_row.findIndex(v =>
                String(v || '').toLowerCase().includes(label.toLowerCase()));
              if (idx >= 0) {
                //  col 
                for (let j = idx + 1; j < Math.min(idx + 4, hr_row.length); j++) {
                  const n = pf(hr_row[j]);
                  if (n !== null && n > 0) return n;
                }
              }
            }
            return null;
          };
          const finalUCL = spcUCL ?? getHeaderSPC('UCL');
          const finalCL = spcCL ?? getHeaderSPC('CL');
          const finalLCL = spcLCL ?? getHeaderSPC('LCL');
          const finalSpec = spcSpec ?? getHeaderSPC('Spec');
          const finalTrig = spcTrig ?? getHeaderSPC('Trigger');

          const specResult = normalizeInOut(row[C.SPEC_RESULT]);
          const trigResult = normalizeInOut(row[C.TRIGGER]);
          const clResult = normalizeInOut(row[C.OUT_CL]);
          const trendRes = normalizeInOut(row[C.TREND]);
          const ninePt = normalizeInOut(row[C.NINE_PT]);

          // overall
          const lastCols = row.slice(-4);
          let overallVal = 'Pass';
          for (const c of [...lastCols].reverse()) {
            const cv = String(c || '').trim();
            if (cv === 'Pass' || cv === 'Fail' || cv === 'Hold') { overallVal = cv; break; }
          }
          if (specResult === 'OUT') overallVal = 'Fail';

          parsed.push({
            _rowIndex: i,
            _sheetKey: sheetKey,
            _fmt: fmt,
            _typeHint: typeOverride || null,
            date: dateStr,
            oven: String(row[C.OVEN] || '').trim(),
            team: String(row[C.TEAM] || '').trim(),
            en: String(row[C.EN] || '').trim(),
            lot: String(row[C.EBLOCK_LOT] || '').trim(),
            traveler: String(row[C.TRAVELER] || '').trim(),
            remark: cleanRemark(C.REMARK != null ? row[C.REMARK] : ''),
            long1: measVals[0] ?? null,
            short2: measVals[1] ?? null,
            avg: avgVal,
            max: maxVal,
            min: minVal,
            range: maxVal - minVal,
            spec_result: specResult,
            trigger: trigResult,
            out_cl: clResult,
            trend: trendRes,
            nine_pt: ninePt,
            overall: overallVal,
            spc_ucl: finalUCL,
            spc_cl: finalCL,
            spc_lcl: finalLCL,
            spc_spec: finalSpec,
            spc_trig: finalTrig,
          });
        }
        return parsed;
      };

      // 
      //  parseSheetD  Format D: xlsm "Push out force" (ACA)
      //  Col layout:
      //    1=Date, 2=Shift, 3=Time, 4=EN, 5=Oven, 6=SampleDate, 7=PT No.
      //    Long Fantail:   10=val1, 11-21=SPC/judgment
      //    Short Fantail:  22=val2, 23-33=SPC/judgment
      //    Bobbin:         34=val3, 35-45=SPC/judgment
      //    Remark col 53
      //  SPC  header:
      //    row6 col10=UCL(319), row7 col10=CL(244), row8 col10=LCL(169)
      //    row5 col10=Trigger(60)
      // 
      const parseSheetD = (sheetName, typeOverride) => {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '',
        });

        //  SPC  header
        const hdrUCL_L = pf((rows[6] || [])[10]) || 319;
        const hdrCL_L = pf((rows[7] || [])[10]) || 244;
        const hdrLCL_L = pf((rows[8] || [])[10]) || 169;
        const hdrTrig_L = pf((rows[5] || [])[10]) || 60;
        const hdrUCL_B = pf((rows[6] || [])[34]) || 500.92;
        const hdrCL_B = pf((rows[7] || [])[34]) || 344.33;
        const hdrLCL_B = pf((rows[8] || [])[34]) || 187.73;
        const hdrTrig_B = pf((rows[5] || [])[34]) || 103.3;

        const parsed = [];
        for (let i = IMP_DATA_START_ROW_D; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 8) continue;

          const dateStr = parseImpDate(row[1]);
          if (!dateStr) continue;

          const en = String(row[4] || '').trim();
          const oven = String(row[5] || '').trim();
          const pt = String(row[7] || '').trim();

          // : Long Fantail (col10), Short Fantail (col22), Bobbin (col34)
          const longVal = pf(row[10]);
          const shortVal = pf(row[22]);
          const bobbinVal = pf(row[34]);

          // 
          if (longVal === null && shortVal === null && bobbinVal === null) continue;

          //   typeHint 
          //  user  typeOverride  
          //    Bobbin col 
          let typeHint = typeOverride;
          if (!typeHint) {
            typeHint = bobbinVal !== null ? 'bobbin' : 'sl';
          }

          //  record  Long/Short (sl)  Bobbin
          //   record  type 
          const isBobbin = typeHint === 'bobbin';
          const measVals = isBobbin
            ? [bobbinVal].filter(v => v !== null)
            : [longVal, shortVal].filter(v => v !== null);
          if (!measVals.length) continue;

          const avgVal = measVals.reduce((a, b) => a + b, 0) / measVals.length;
          const maxVal = Math.max(...measVals);
          const minVal = Math.min(...measVals);

          const ucl = isBobbin ? hdrUCL_B : hdrUCL_L;
          const cl = isBobbin ? hdrCL_B : hdrCL_L;
          const lcl = isBobbin ? hdrLCL_B : hdrLCL_L;
          const trig = isBobbin ? hdrTrig_B : hdrTrig_L;
          const spec = 25;

          // QC Judgment: col 11 (Long), 23 (Short), 35 (Bobbin)
          const judgCol = isBobbin ? 35 : 11;
          const judgRaw = String(row[judgCol] || '').trim().toUpperCase();
          const specResult = (judgRaw === 'PASS' || judgRaw === 'ACCEPT' || judgRaw === 'OK')
            ? 'IN'
            : judgRaw === 'FAIL' || judgRaw === 'REJECT' || judgRaw === 'NG'
              ? 'OUT'
              : minVal >= spec ? 'IN' : 'OUT';

          // Remark
          const remark = cleanRemark(row[53]);

          parsed.push({
            _rowIndex: i,
            _sheetKey: 'NEW',
            _fmt: 'D',
            _typeHint: typeHint,
            date: dateStr,
            oven: oven,
            team: String(row[2] || '').trim(),  // Shift
            en: en,
            lot: '',
            traveler: pt,
            remark: remark,
            long1: isBobbin ? bobbinVal : longVal,
            short2: isBobbin ? null : shortVal,
            avg: avgVal,
            max: maxVal,
            min: minVal,
            range: maxVal - minVal,
            spec_result: specResult,
            trigger: avgVal >= trig ? 'IN' : 'OUT',
            out_cl: (avgVal >= lcl && avgVal <= ucl) ? 'IN' : 'OUT',
            trend: 'IN',
            nine_pt: 'IN',
            overall: specResult === 'IN' ? 'Pass' : 'Fail',
            spc_ucl: ucl,
            spc_cl: cl,
            spc_lcl: lcl,
            spc_spec: spec,
            spc_trig: trig,
          });
        }
        return parsed;
      };

      //   parse sheet  
      //  Format D (xlsm)
      const newSheetName = findSheet('NEW');
      const hasNTC = !!findSheet('NTC');
      const hasTC = !!findSheet('TC');

      if (!hasNTC && !hasTC && newSheetName) {
        //  xlsm Format D
        const typeOverride = sheetSel === 'TC' ? 'bobbin' : 'sl';
        allRows = parseSheetD(newSheetName, typeOverride);
        if (metaEl) {
          const typeName = typeOverride === 'bobbin' ? 'Bobbin (TC)' : 'Short/Long (NTC)';
          metaEl.textContent = `ขนาด: ${(file.size / 1024).toFixed(1)} KB พบ Format D (ACA xlsm) ประเภท ${typeName} จำนวน ${allRows.length} รายการ`;
        }
      } else {
        // Format A/B/C (xls )
        if (sheetSel === 'NTC') {
          if (hasNTC) {
            allRows = parseSheetABC('NTC', 'sl');
          } else if (newSheetName) {
            allRows = parseSheetD(newSheetName, 'sl');
          } else {
            showToast('ไม่พบ Sheet "Input data NTC"', 'warn');
          }
        } else if (sheetSel === 'TC') {
          if (hasTC) {
            allRows = parseSheetABC('TC', 'bobbin');
          } else if (newSheetName) {
            allRows = parseSheetD(newSheetName, 'bobbin');
          } else {
            showToast('ไม่พบ Sheet "Input data TC"', 'warn');
          }
        } else {
          // BOTH
          const ntcRows = hasNTC ? parseSheetABC('NTC', 'sl') : [];
          const tcRows = hasTC ? parseSheetABC('TC', 'bobbin') : [];
          allRows = [...ntcRows, ...tcRows].sort((a, b) => a.date.localeCompare(b.date));
        }
        if (metaEl) metaEl.textContent = `ขนาด: ${(file.size / 1024).toFixed(1)} KB พบข้อมูล ${allRows.length} รายการ`;
      }

      _impParsedRows = allRows;
      renderImpPreview();
    } catch (err) {
      console.error('Import error:', err);
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// 
//   Preview Table
// 
function renderImpPreview() {
  const rows = _impParsedRows;
  const card = document.getElementById('imp-preview-card');
  const tbody = document.getElementById('imp-preview-body');
  const count = document.getElementById('imp-preview-count');
  if (!card || !tbody) return;

  if (!rows.length) {
    card.style.display = 'none';
    showToast('ไม่พบข้อมูลใน Sheet ที่เลือก', 'warn');
    return;
  }

  card.style.display = '';
  if (count) count.textContent = `พบข้อมูล ${rows.length} รายการ เตรียม Import`;

  const badge = document.getElementById('badge-import');
  if (badge) { badge.style.display = ''; badge.textContent = rows.length; }

  const specBadge = v => {
    if (!v || v === '' || v === '') return `<span style="color:var(--text3)"></span>`;
    return v === 'IN'
      ? `<span style="color:var(--pass);font-weight:700">IN</span>`
      : `<span style="color:var(--fail);font-weight:700">OUT</span>`;
  };

  const fv = (v, d = 2) => (v === null || v === undefined || isNaN(v)) ? '' : Number(v).toFixed(d);

  tbody.innerHTML = rows.map((r, idx) => {
    const typeLabel = r._typeHint === 'bobbin' ? ' Bobbin' : ' S/L';
    const sheetLabel = r._sheetKey === 'TC' ? 'TC' : 'NTC';
    const rowClass = r.spec_result === 'OUT'
      ? 'style="background:rgba(220,38,38,.05)"'
      : '';
    return `<tr ${rowClass}>
      <td style="padding:8px;text-align:center">
        <input type="checkbox" class="imp-row-chk" data-idx="${idx}" checked>
      </td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text3)">${idx + 1}
        <span style="font-size:9px;padding:1px 5px;border-radius:6px;
               background:var(--bg3);color:var(--text3)">${sheetLabel}</span>
      </td>
      <td style="padding:8px 10px;font-size:12px;white-space:nowrap">${r.date}</td>
      <td style="padding:8px 10px;font-size:12px">${r.oven || ''}</td>
      <td style="padding:8px 10px;font-size:12px">${r.team || ''}</td>
      <td style="padding:8px 10px;font-weight:700">${r.en || ''}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text3)">${r.traveler || ''}</td>
      <td style="padding:8px 10px;font-size:11px">${r.remark || ''}</td>
      <td style="padding:8px 10px;font-weight:700">${fv(r.long1)}</td>
      <td style="padding:8px 10px;font-weight:700">${fv(r.short2)}</td>
      <td style="padding:8px 10px;font-weight:700;color:var(--blue)">${fv(r.avg)}</td>
      <td style="padding:8px 10px">${fv(r.max)}</td>
      <td style="padding:8px 10px">${fv(r.min)}</td>
      <td style="padding:8px 10px">${specBadge(r.spec_result)}</td>
      <td style="padding:8px 10px">${specBadge(r.trigger)}</td>
      <td style="padding:8px 10px">${specBadge(r.out_cl)}</td>
      <td style="padding:8px 10px">${specBadge(r.trend)}</td>
      <td style="padding:8px 10px">${specBadge(r.nine_pt)}</td>
      <td style="padding:8px 10px">${r.overall === 'Pass'
        ? `<span style="color:var(--pass);font-weight:700">Pass</span>`
        : `<span style="color:var(--fail);font-weight:700">${r.overall}</span>`}</td>
      <td style="padding:8px 10px;font-size:10px">
        <span style="padding:2px 7px;border-radius:8px;
               background:${r._typeHint === 'bobbin' ? 'rgba(124,58,237,.12)' : 'rgba(30,58,138,.10)'};
               color:var(--text2)">${typeLabel}</span>
      </td>
    </tr>`;
  }).join('');
}

function toggleImpAll(checked) {
  document.querySelectorAll('.imp-row-chk').forEach(c => { c.checked = checked; });
  const allChk = document.getElementById('imp-chk-all');
  if (allChk) allChk.checked = checked;
}

// 
//  Confirm Import   _recordsCache  sync DB
// 
async function confirmImport() {
  const prodKey = document.getElementById('imp-product')?.value;
  const modeKey = document.getElementById('imp-mode')?.value || 'buyoff';

  if (!prodKey) { showToast('กรุณาเลือก Product ก่อน Import', 'warn'); return; }

  //  rows  checkbox
  const selectedIdxs = [];
  document.querySelectorAll('.imp-row-chk:checked').forEach(c => {
    selectedIdxs.push(parseInt(c.getAttribute('data-idx')));
  });
  if (!selectedIdxs.length) { showToast('กรุณาเลือกรายการที่จะ Import อย่างน้อย 1 รายการ', 'warn'); return; }

  const p = PRODUCTS[prodKey];
  const typeFromUI = document.getElementById('imp-coil-type')?.value || 'sl';

  let imported = 0;
  let skipped = 0;
  const newAlerts = [];
  const newApiRecords = [];

  for (const idx of selectedIdxs) {
    const r = _impParsedRows[idx];
    if (!r) { skipped++; continue; }

    //  typeKey:  parse  TC sheet  bobbin, NTC  sl
    //  user override  UI ( Coil Type)  UI 
    // :  import sheet = BOTH   hint  sheet
    //      import sheet = NTC  TC   UI 
    const sheetSel = document.getElementById('imp-sheet-sel')?.value || 'NTC';
    const typeKey = (sheetSel === 'BOTH') ? (r._typeHint || typeFromUI) : typeFromUI;

    const spcFb = getSPC(prodKey, modeKey, typeKey) || {};

    //  SPC  Excel   fallback  PRODUCTS
    const ucl = r.spc_ucl ?? spcFb.ucl ?? null;
    const cl = r.spc_cl ?? spcFb.cl ?? null;
    const lcl = r.spc_lcl ?? spcFb.lcl ?? null;
    const spec = r.spc_spec ?? spcFb.spec ?? 25;
    const trig = r.spc_trig ?? spcFb.trigger ?? null;

    // derive spec_result 
    let specResult = r.spec_result;
    if (!specResult || specResult === '') {
      specResult = (r.min !== null && r.min >= spec) ? 'IN' : 'OUT';
    }

    const no = _recordsCache.length + 1;
    const rec = {
      id: Date.now() + imported,
      no,
      date: r.date,
      mode: modeKey,
      modeLabel: MODES[modeKey]?.label || modeKey,
      coilType: typeKey,
      product: prodKey,
      productLabel: p.label,
      unit: p.unit,
      oven: r.oven,
      team: r.team,
      en: r.en,
      traveler: r.traveler,
      lot: r.lot,
      qty: '',
      remark: r.remark,
      long1: r.long1,
      short2: r.short2,
      avg: r.avg,
      max: r.max,
      min: r.min,
      range: r.range,
      spec_result: specResult,
      trigger: r.trigger || (r.avg !== null && trig !== null ? (r.avg >= trig ? 'IN' : 'OUT') : 'IN'),
      out_cl: r.out_cl || (r.avg !== null && ucl !== null ? (r.avg >= lcl && r.avg <= ucl ? 'IN' : 'OUT') : 'IN'),
      trend: r.trend || 'IN',
      nine_pt: r.nine_pt || 'IN',
      overall: r.overall || (specResult === 'IN' ? 'Pass' : 'Fail'),
      spc_ucl: ucl,
      spc_cl: cl,
      spc_lcl: lcl,
      spc_trig: trig,
      spc_spec: spec,
      savedAt: new Date().toISOString(),
      source: 'import',
    };

    _recordsCache.push(rec);
    imported++;

    // Alert logic
    const isAlert = specResult === 'OUT' || rec.trigger === 'OUT';
    if (isAlert) {
      const alertObj = {
        id: rec.id + 1000000,
        ts: rec.savedAt,
        level: specResult === 'OUT' ? 'ng' : 'warn',
        product: p.label,
        mode: modeKey,
        modeLabel: rec.modeLabel,
        coilType: typeKey,
        en: rec.en,
        traveler: rec.traveler,
        oven: rec.oven,
        avg: fmt(rec.avg),
        min: fmt(rec.min),
        spec_result: specResult,
        trigger: rec.trigger,
        msg: specResult === 'OUT'
          ? `[Import] Out of Spec: Min=${fmt(rec.min)} ${p.unit} (Spec  ${spec})`
          : `[Import] Out of Trigger: Avg=${fmt(rec.avg)} ${p.unit} (Trigger  ${trig})`,
      };
      _alertsCache.unshift(alertObj);
      newAlerts.push(alertObj);
    }

    //  payload  sync API
    newApiRecords.push({
      no: rec.no,
      mode: rec.mode,
      coil_type: rec.coilType,
      condition: rec.condition,
      product: rec.product,
      product_label: rec.productLabel,
      unit: rec.unit,
      date: rec.date,
      oven: rec.oven,
      team: rec.team,
      en: rec.en,
      traveler: rec.traveler,
      lot: rec.lot,
      qty: rec.qty,
      remark: rec.remark,
      long1: rec.long1,
      short2: rec.short2,
      avg: rec.avg,
      max: rec.max,
      min: rec.min,
      range: rec.range,
      spec_result: rec.spec_result,
      trigger: rec.trigger,
      out_cl: rec.out_cl,
      trend: rec.trend,
      nine_pt: rec.nine_pt,
      overall: rec.overall,
      spc_ucl: rec.spc_ucl,
      spc_cl: rec.spc_cl,
      spc_lcl: rec.spc_lcl,
      spc_trig: rec.spc_trig,
      spc_spec: rec.spc_spec,
      savedAt: rec.savedAt,
    });
  }

  //  localStorage
  localStorage.setItem(LS_KEY_POF, JSON.stringify(_recordsCache));
  localStorage.setItem(LS_KEY_ALERTS, JSON.stringify(_alertsCache));

  // Sync  MySQL  online
  let dbStatus = 'บันทึกข้อมูลสำเร็จ (โหมดออฟไลน์)';
  if (isServerOnline && newApiRecords.length) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/pof/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: newApiRecords, alerts: newAlerts }),
      });
      const json = await res.json();
      dbStatus = json.success ? 'นำเข้าและ Sync ข้อมูลกับ MySQL สำเร็จ' : `พบข้อผิดพลาดในการ Sync: ${json.message}`;
    } catch {
      dbStatus = 'บันทึกสำเร็จแต่เกิดข้อผิดพลาดในการเชื่อมต่อ MySQL ระหว่างการ Sync';
    }
  }

  // 
  const resultCard = document.getElementById('imp-result-card');
  const resultBody = document.getElementById('imp-result-body');
  if (resultCard) resultCard.style.display = '';
  if (resultBody) {
    resultBody.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <div style="padding:10px 18px;border-radius:8px;background:rgba(22,163,74,.10);border:1px solid rgba(22,163,74,.25)">
          <div style="font-size:22px;font-weight:800;color:var(--pass)">${imported}</div>
          <div style="font-size:11px;color:var(--text3)"></div>
        </div>
        <div style="padding:10px 18px;border-radius:8px;background:rgba(234,179,8,.10);border:1px solid rgba(234,179,8,.25)">
          <div style="font-size:22px;font-weight:800;color:var(--warn)">${skipped}</div>
          <div style="font-size:11px;color:var(--text3)"></div>
        </div>
        <div style="padding:10px 18px;border-radius:8px;background:rgba(220,38,38,.10);border:1px solid rgba(220,38,38,.25)">
          <div style="font-size:22px;font-weight:800;color:var(--fail)">${newAlerts.length}</div>
          <div style="font-size:11px;color:var(--text3)">แจ้งเตือน Alert</div>
        </div>
      </div>
      <div style="padding:8px 12px;background:var(--bg2);border-radius:6px;font-size:12px">
        ${dbStatus}
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--text3)">
          <b>* หมายเหตุ:</b> ข้อมูลสามารถดูได้ที่หน้ารายการข้อมูลหลัก
      </div>`;
  }

  showToast(`Import สำเร็จ ${imported} รายการ`, 'success');
  updateKPIs();
  updateBadges();
}

// 
//  Utility:  Date  Excel  yyyy-mm-dd
// 
function parseImpDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === 'nan' || s === 'undefined') return null;

  //  yyyy-mm-dd  yyyy/mm/dd 
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  //  mm/dd/yyyy  dd/mm/yyyy (ambiguous  assume mm/dd/yyyy) 
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdy) {
    let [, a, b, y] = mdy;
    if (y.length === 2) y = '20' + y;
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }

  //  JavaScript Date object  string 
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

// 
//  Utility: Normalize IN/OUT string
// 
function normalizeInOut(val) {
  const s = String(val || '').trim().toUpperCase();
  if (s === 'IN' || s === '1' || s === 'TRUE' || s === 'ACCEPT') return 'IN';
  if (s === 'OUT' || s === '0' || s === 'FALSE' || s === 'REJECT') return 'OUT';
  return 'IN'; // default
}


// 
//  Config Tab
// 
function loadProductConfig() {
  const key = document.getElementById('cfg-product-sel')?.value;
  const formEl = document.getElementById('cfg-product-form');
  if (!key || !PRODUCTS[key]) {
    if (formEl) formEl.style.display = 'none';
    return;
  }
  if (formEl) formEl.style.display = 'block';
  const spc = getSPC(key, 'buyoff', 'sl') || {};
  document.getElementById('cfg-ucl').value = spc.ucl || '';
  document.getElementById('cfg-cl').value = spc.cl || '';
  document.getElementById('cfg-lcl').value = spc.lcl || '';
  document.getElementById('cfg-trig').value = spc.trigger || '';
  document.getElementById('cfg-spec').value = spc.spec || '';
  document.getElementById('cfg-rucl').value = spc.rucl || '';
  document.getElementById('cfg-rcl').value = spc.rcl || '';
  document.getElementById('cfg-unit').value = PRODUCTS[key].unit || '';
}

function saveProductConfig() {
  const key = document.getElementById('cfg-product-sel')?.value;
  if (!key || !PRODUCTS[key]) return;
  const updates = {
    ucl: parseFloat(document.getElementById('cfg-ucl').value),
    cl: parseFloat(document.getElementById('cfg-cl').value),
    lcl: parseFloat(document.getElementById('cfg-lcl').value),
    trigger: parseFloat(document.getElementById('cfg-trig').value),
    spec: parseFloat(document.getElementById('cfg-spec').value),
    rucl: parseFloat(document.getElementById('cfg-rucl').value),
    rcl: parseFloat(document.getElementById('cfg-rcl').value),
    unit: document.getElementById('cfg-unit').value,
  };
  ['buyoff', 'roving'].forEach(grp => {
    ['sl', 'bobbin'].forEach(tp => {
      if (PRODUCTS[key].spc?.[grp]?.[tp]) {
        PRODUCTS[key].spc[grp][tp] = { ...PRODUCTS[key].spc[grp][tp], ...updates };
      }
    });
  });
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
    if (!cfg.products) cfg.products = {};
    cfg.products[key] = updates;
    localStorage.setItem(LS_KEY_CFG, JSON.stringify(cfg));
  } catch { }
  showToast(`บันทึก SPC config สำหรับ "${PRODUCTS[key].label}" เรียบร้อย`, 'success');
}

// 
//  Utilities
// 
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showConfirm(title, msg, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('confirm-ok-btn');
  btn.onclick = () => { closeModal('modal-confirm'); onOk(); };
  document.getElementById('modal-confirm').style.display = 'flex';
}

function showToast(msg, type = 'info') {
  const panel = document.getElementById('toast-panel') || (() => {
    const p = document.createElement('div');
    p.className = 'alert-panel';
    document.body.appendChild(p);
    return p;
  })();
  const t = document.createElement('div');
  t.className = `alert-toast ${type}`;
  t.innerHTML = `<div style="font-weight:700;margin-bottom:2px">${type.toUpperCase()}</div><div>${msg}</div>`;
  panel.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

async function importExportedCSV(event) {
  const files = event.target.files;
  if (!files.length) return;
  let importedCount = 0;
  for (const file of files) {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows.length < 2) continue;
      const headers = rows[0].map(h => String(h).replace(/^\uFEFF/, '').trim());
      const idx = {};
      const idxLower = {};
      headers.forEach((h, i) => {
        idx[h] = i;
        idxLower[h.toLowerCase()] = i;
      });
      const getModelKey = (label) => { for (let k in PRODUCTS) if (PRODUCTS[k].label === label || k === label) return k; return label; };
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const getVal = (key) => row[idx[key]] !== undefined ? row[idx[key]] : row[idxLower[key.toLowerCase()]];
        if (!row || row.length === 0 || !row.some(c => String(c).trim() !== '')) continue;
        const pLabel = getVal('Product') || '';
        const modelKey = getModelKey(pLabel);
        let dateVal = String(getVal('Date') || '').trim();
        const num = parseFloat(dateVal);
        if (!isNaN(num) && num > 40000 && num < 60000) {
          const d = new Date(Math.round((num - 25569) * 86400 * 1000));
          if (!isNaN(d.getTime())) dateVal = d.toISOString().slice(0, 10);
        }
        const rec = {
          id: Date.now() + Math.random(),
          no: _recordsCache.length ? Math.max(..._recordsCache.map(r => r.no || 0)) + 1 : 1,
          date: dateVal,
          mode: getVal('Mode') || '',
          coilType: getVal('CoilType') || 'sl',
          product: modelKey,
          productLabel: pLabel,
          condition: getVal('Condition') || 'NTC',
          oven: getVal('Oven') || '',
          team: getVal('Team') || '',
          en: getVal('EN') || '',
          traveler: getVal('Traveler') || '',
          lot: getVal('Lot') || '',
          qty: getVal('Qty') || '',
          long1: parseFloat(getVal('Long1')) || 0,
          short2: parseFloat(getVal('Short2')) || 0,
          bobbin1: parseFloat(getVal('Bobbin1')) || null,
          bobbin2: parseFloat(getVal('Bobbin2')) || null,
          avg: parseFloat(getVal('Avg')) || 0,
          max: parseFloat(getVal('Max')) || 0,
          min: parseFloat(getVal('Min')) || 0,
          range: parseFloat(getVal('Range')) || 0,
          remark: getVal('Remark') || '',
          spec_result: getVal('SpecResult') || '',
          trigger: getVal('Trigger') || '',
          out_cl: getVal('CtrlLimit') || '',
          trend: getVal('Trend') || '',
          nine_pt: getVal('9Pts') || '',
          overall: getVal('Overall') || '',
          spc_ucl: parseFloat(getVal('SPC_UCL')) || 0,
          spc_cl: parseFloat(getVal('SPC_CL')) || 0,
          spc_lcl: parseFloat(getVal('SPC_LCL')) || 0,
        };
        _recordsCache.push(rec);
        importedCount++;
      }
    } catch (err) { console.error('Error importing file:', file.name, err); }
  }
  event.target.value = '';
  if (importedCount > 0) {
    saveRecords(_recordsCache);
    updateKPIs();
    updateBadges();
    renderRecords();
    if (typeof renderCharts === 'function') renderCharts();
    if (typeof syncWithServer === 'function') await syncWithServer();
    showToast(`นำเข้าข้อมูลจาก CSV สำเร็จ ${importedCount} รายการ`, 'success');
  } else { showToast('ไม่พบข้อมูลที่จะนำเข้า (ไฟล์ว่าง)', 'warn'); }
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
    e.preventDefault();
    const container = e.target.closest('form, .modal-content, .card-body, .panel, .container') || document;
    const focusable = Array.from(container.querySelectorAll('input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled])'))
      .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
    const index = focusable.indexOf(e.target);
    if (index > -1 && index < focusable.length - 1) {
      focusable[index + 1].focus();
    }
  }
});

