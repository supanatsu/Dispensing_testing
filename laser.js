// ========================
// CONSTANTS & STORAGE
// ========================
const LS_KEY = 'belton_ipqc_laser_engraving_v2';
const ALERT_KEY = 'belton_alertlog_laser_v2';
const CONFIG_KEY = 'belton_laser_config_v1';

// ============================================================
// PRODUCTS: Bobbin products carry type:'Bobbin' explicitly.
//   All others default to 'Epoch' (2 pcs/Fixture/Shift).
//   Draft qty limit is driven purely by the Type dropdown.
// ============================================================
const _internalProducts = {
  dorado5dalbb: { label: 'Dorado 5D AL BB' },
  dorado10dalbb: { label: 'Dorado 10D AL BB' },
  marlin10d: { label: 'Marlin 10D' },
  cmrbp3d: { label: 'Cimarron BP 3D' },
  cmrbp4d: { label: 'Cimarron BP 4D' },
  cmrbp5d: { label: 'Cimarron BP 5D' },
  comet: { label: 'ComET' },
  dorado5d: { label: 'Dorado 5D' },
  dorado10d: { label: 'Dorado 10D' },
  m11p: { label: 'M11P' },
  rosewood1d: { label: 'Rosewood 1D' },
  rosewood2d: { label: 'Rosewood 2D' },
  skybolt1d: { label: 'Skybolt 1D' },
  skybolt2d: { label: 'Skybolt 2D' },
  skybolt3d: { label: 'Skybolt 3D' },
  skybolt4d: { label: 'Skybolt 4D' },
  summit10d: { label: 'Summit 10D' },
  v111d: { label: 'V11 1D' },
  v112d: { label: 'V11 2D' },
  v114d: { label: 'V11 4D' },
  v15cmr4d: { label: 'V15 CMR 4D' },
};

window.PRODUCTS = new Proxy(_internalProducts, {
    get: function(target, prop) {
        if (typeof prop === 'symbol') return target[prop];
        if (prop in target) return target[prop];
        if (typeof prop === 'string') {
            const sortedKeys = Object.keys(target).sort((a,b) => target[b].label.length - target[a].label.length);
            const match = sortedKeys.find(k => prop.includes(target[k].label));
            if (match) return target[match];
        }
        return undefined;
    },
    ownKeys: function(target) { return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor: function(target, prop) { return Reflect.getOwnPropertyDescriptor(target, prop); }
});

window.SERVER_PRODUCTS_LIST = [];

async function fetchDynamicProducts() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/laser/products_list`);
        const data = await res.json();
        if (data.success) {
            window.SERVER_PRODUCTS_LIST = data.products;
            populateProductDropdowns(_inputMode);
        }
    } catch (e) {
        console.error('Failed to fetch dynamic products:', e);
    }
}


const DEFECT_ITEMS = [
  { id: 'skip', label: 'Skip (ไม่มี)', labelShort: 'Skip' },
  { id: 'incomplete', label: 'Incomplete (ไม่สมบูรณ์)', labelShort: 'Incomplete' },
  { id: 'width', label: 'Width (ความกว้าง)', labelShort: 'Width' },
  { id: 'length', label: 'Length (ความยาว)', labelShort: 'Length' },
  { id: 'position', label: 'Position (ตำแหน่ง)', labelShort: 'Position' },
];

const ZONE_LABELS = {
  z1: 'Zone 1 (Bobbin ด้านที่ 1)',
  z2: 'Zone 2 (Bobbin ด้านที่ 2)',
  z3: 'Zone 3 (Bobbin ด้านที่ 3)',
};

const DEFECT_FIELDS = [
  { id: 'z1_missing', label: 'Z1 Missing', labelFull: 'Zone1 Missing (หายไป)' },
  { id: 'z2_missing', label: 'Z2 Missing', labelFull: 'Zone2 Missing (หายไป)' },
  { id: 'bentwire', label: 'Bent Wire Slot', labelFull: 'Bent Wire Slot' },
  ...DEFECT_ITEMS.map(d => ({ id: `z1_${d.id}`, label: `Z1 ${d.labelShort}`, labelFull: `Zone1 ${d.label}` })),
  ...DEFECT_ITEMS.map(d => ({ id: `z2_${d.id}`, label: `Z2 ${d.labelShort}`, labelFull: `Zone2 ${d.label}` })),
  ...DEFECT_ITEMS.map(d => ({ id: `z3_${d.id}`, label: `Z3 ${d.labelShort}`, labelFull: `Zone3 ${d.label}` })),
];

const DEFECT_FIELDS_LEGACY = [
  ...['skip', 'incomplete', 'width', 'length', 'position'].map(d => ({ id: `lf_${d}`, label: `LF ${d}` })),
  ...['skip', 'incomplete', 'width', 'length', 'position'].map(d => ({ id: `sf_${d}`, label: `SF ${d}` })),
];

// ========================
// DB & STATE
// ========================
let DB = { records: [], nextId: 1 };
let ALERT_LOG = [];
let CONFIG = { typeQty: {}, productQty: {} };  // typeQty: fallback by type, productQty: per-product override

let DRAFT_STATE = {
  drafts: [],
  headerData: null,
  requiredQty: 0,
  productKey: '',
};

let _editId = null;
let _sortAboutCol = 'ts';
let _sortAboutDir = -1; // -1 = descending (newest first)
let _inputMode = 'buyoff';

// ——————————————————————————————
let isServerOnline = false;
let autoSyncInterval = null;
let lastSyncTimestamp = 0;

let chartDefect = null, chartPF = null, chartTrend = null,
  chartProductYield = null, chartPareto = null, chartMachine = null;

const customCanvasBackgroundColor = {
  id: 'customCanvasBackgroundColor',
  beforeDraw: (chart, args, options) => {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = options.color || '#ffffff';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};
if (typeof Chart !== 'undefined') Chart.register(customCanvasBackgroundColor);

// ========================
// CONFIG HELPERS 
// ========================
// Default qty for a given type string
function getDefaultQtyByType(type) {
  return (type === 'Bobbin') ? 15 : 2;
}

// Effective qty for a type, respecting any Config override
function getQtyByType(type) {
  if (!type) return 0;
  const override = CONFIG.typeQty[type];
  if (override !== undefined && override !== '') {
    const n = parseInt(override, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return getDefaultQtyByType(type);
}

// Legacy helper: used by import parser and editRecord
// Priority: productQty override > typeQty override > default
function getProductQty(key, typeStr) {
  if (!key || !PRODUCTS[key]) return 0;
  const type = typeStr || PRODUCTS[key].type || 'Epoch';

  // 1) per-product override (object mapping type to qty)
  if (CONFIG.productQty && CONFIG.productQty[key] !== undefined) {
    if (typeof CONFIG.productQty[key] === 'object') {
      if (CONFIG.productQty[key][type] !== undefined && CONFIG.productQty[key][type] !== '') {
        const n = parseInt(CONFIG.productQty[key][type], 10);
        if (!isNaN(n) && n > 0) return n;
      }
    } else if (CONFIG.productQty[key] !== '') {
      // backward compat: single value override
      const n = parseInt(CONFIG.productQty[key], 10);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  // 2) type-level override
  return getQtyByType(type);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) CONFIG = JSON.parse(raw);
  } catch (e) { }

  if (typeof window !== 'undefined' && window.LASER_CONFIG) {
    CONFIG.typeQty = window.LASER_CONFIG.typeQty || {};
    CONFIG.productQty = window.LASER_CONFIG.productQty || {};
  }

  if (!CONFIG.typeQty) CONFIG.typeQty = {};
  if (!CONFIG.productQty) CONFIG.productQty = {};
  if (!CONFIG.fixtures) CONFIG.fixtures = [];
  if (!CONFIG.shifts) CONFIG.shifts = [];
  // backward compat: ถ้ามี Epoch key แต่ยังไม่มี E-block key ให้ copy มา
  if (CONFIG.typeQty['Epoch'] !== undefined && CONFIG.typeQty['E-block'] === undefined) {
    CONFIG.typeQty['E-block'] = CONFIG.typeQty['Epoch'];
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(CONFIG));
}

function migrateProducts() {
  let migrated = false;
  DB.records.forEach(r => {
    if (r.product === 'bobbindorado5d') { r.product = 'dorado5d'; migrated = true; }
    if (r.product === 'bobbinmr10d') { r.product = 'marlin10d'; migrated = true; }
    if (r.product === 'palmer') { r.product = 'cmrbp3d'; migrated = true; }
  });
  if (migrated) saveDB();
}

function loadDB() {
  try { const d = localStorage.getItem(LS_KEY); if (d) DB = JSON.parse(d); } catch (e) { }
  try { const a = localStorage.getItem(ALERT_KEY); if (a) ALERT_LOG = JSON.parse(a); } catch (e) { }
  migrateProducts();
  // Normalize any stored records to ensure consistent types/values
  try {
    if (DB && Array.isArray(DB.records)) {
      DB.records.forEach(r => {
        if (!r) return;
        if (r.date) r.date = normalizeDate(r.date);
        if (r.en) r.en = normalizeEN(r.en);
        if (r.sendtime) r.sendtime = normalizeTime(r.sendtime);
        if (r.recvtime) r.recvtime = normalizeTime(r.recvtime);
        if (r.vmi) r.vmi = (normalizeDefect(r.vmi) === 'Hold' ? 'Hold' : (normalizeDefect(r.vmi) === 'Fail' ? 'Fail' : 'Pass'));
        if (typeof DEFECT_FIELDS !== 'undefined') {
          DEFECT_FIELDS.forEach(f => { if (r[f.id] !== undefined) r[f.id] = normalizeDefect(r[f.id]); });
        }
        if (r.z1_missing !== undefined) r.z1_missing = normalizeDefect(r.z1_missing);
        if (r.z2_missing !== undefined) r.z2_missing = normalizeDefect(r.z2_missing);
        r.overall = getOverallResult(r);
      });
      saveDB();
    }
  } catch (err) { console.error('Normalization failed:', err); }
}
function saveDB() {
  localStorage.setItem(LS_KEY, JSON.stringify(DB));
  _scheduleSyncDebounced();
}
function saveAlertLog() {
  localStorage.setItem(ALERT_KEY, JSON.stringify(ALERT_LOG));
  _scheduleSyncDebounced();
}

// debounced sync: รอ 2 วินาทีหลังการบันทึกครั้งสุดท้ายค่อย sync ครั้งเดียว
let _syncDebounceTimer = null;
function _scheduleSyncDebounced() {
  if (!isServerOnline) return;
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => {
    _syncDebounceTimer = null;
    syncWithServer();
  }, 2000);
}

// ========================
// CLOCK
// ========================
function updateClock() {
  const now = new Date();
  const el = document.getElementById('clock');
  if (el) {
    el.innerHTML =
      `` +
      now.toLocaleDateString('th-TH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) +
      '  ' +
      now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
setInterval(updateClock, 1000);

// ========================
// ENTER KEY NAVIGATION
// ========================
function setupEnterKeyNavigation() {
  const panel = document.getElementById('panel-manual');
  if (!panel) return;

  panel.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.tagName.toLowerCase() === 'button') return;
    e.preventDefault();

    const sel = 'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), button:not([disabled])';
    const focusables = Array.from(panel.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
    const index = focusables.indexOf(e.target);

    if (index > -1 && index < focusables.length - 1) {
      let next = focusables[index + 1];
      if (next.innerText && next.innerText.includes('ล้างจอ')) next = focusables[index + 2];
      if (next) {
        next.focus();
        if (next.tagName.toLowerCase() === 'input' && next.type !== 'radio' && next.type !== 'checkbox') {
          try { next.select(); } catch (err) { }
        }
      }
    }
  });
}

// ========================
// IMPORT DROP ZONE
// ========================
function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('import-file-main');
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--border2)'; });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border2)';
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleImportExcel({ target: fileInput });
      }
    });
  }
}

// ========================
// TAB SWITCHING & MODE
// ========================
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');

  document.getElementById('page-sub').textContent =
    tab === 'manual' ? 'ACA Laser Engraving Buyoff · v3.0' :
      tab === 'import' ? 'Import Data · Auto Parser' :
        tab === 'about' ? 'All Records — Laser Engraving' :
          tab === 'viz' ? 'Visualization & Statistics' :
            tab === 'alerts' ? 'Alert Log' :
              tab === 'config' ? 'Configuration & Settings' : 'ACA Laser Engraving Buyoff · v3.0';

  if (tab === 'viz') setTimeout(renderViz, 100);
  if (tab === 'about') renderAboutTable();
  if (tab === 'alerts') renderAlertLog();
  if (tab === 'config') renderConfigPanel();
}

function onModeChange() {
  const el = document.getElementById('m-mode');
  if (el) _inputMode = el.value;
  updateFormFieldsByType();
  populateProductDropdowns(_inputMode);
}

function setMode(mode, btn) {
  _inputMode = mode;
  const sel = document.getElementById('m-mode');
  if (sel) sel.value = mode;
  if (window.SERVER_PRODUCTS_LIST && window.SERVER_PRODUCTS_LIST.length > 0) {
      populateProductDropdowns(mode);
  }
}

// ========================
// TOAST & MODAL
// ========================
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : type === 'warn' ? 'warning' : 'info';
  const color = type === 'success' ? 'var(--pass)' : type === 'error' ? 'var(--fail)' : type === 'warn' ? 'var(--warn)' : 'var(--blue)';
  el.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;margin-top:2px"></span><span style="flex:1">${msg}</span><span class="toast-close" onclick="this.parentNode.remove()">✖</span>`;
  const _toastPanel = document.getElementById('toast-panel');
  if (_toastPanel) _toastPanel.appendChild(el);
  else console.warn('toast-panel not found: toast skipped');
  setTimeout(() => el.remove(), 4500);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

let _confirmCallback = null;
function showConfirm(title, text, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  _confirmCallback = callback;
  openModal('confirm-modal');
}
const _confirmBtnEl = document.getElementById('confirm-btn');
if (_confirmBtnEl) {
  _confirmBtnEl.addEventListener('click', () => {
    if (_confirmCallback) _confirmCallback();
    closeModal('confirm-modal');
  });
}

function openImageModal(src) {
  const img = document.getElementById('image-modal-img');
  const label = document.getElementById('image-modal-label');
  if (img) {
    img.style.display = 'block';
    img.onerror = () => {
      img.style.display = 'none';
      if (label) label.textContent = '⚠️ ไม่พบรูปภาพ: ' + src;
    };
    img.onload = () => {
      img.style.display = 'block';
      if (label) label.textContent = '';
    };
    img.src = src;
    if (label) label.textContent = '';
  }
  document.getElementById('image-modal').classList.add('open');
}

function closeImageModal() {
  document.getElementById('image-modal').classList.remove('open');
  const img = document.getElementById('image-modal-img');
  if (img) img.src = "";
}

// ========================
// FORM HELPERS
// ========================
function populateProductDropdowns(modeFilter = null) {
  const pSelect = document.getElementById('m-product');
  const fProduct = document.getElementById('f-product');
  const vProduct = document.getElementById('viz-product');

  let opts = '<option value="">— เลือก Product —</option>';
  
  if (!window.SERVER_PRODUCTS_LIST || window.SERVER_PRODUCTS_LIST.length === 0) {
      Object.keys(_internalProducts).forEach(k => {
        opts += `<option value="${k}">${_internalProducts[k].label}</option>`;
      });
  } else {
      let dbMode = modeFilter ? modeFilter.toLowerCase() : null;
      if (dbMode === 'buyoff') dbMode = 'buy-off';
      const filtered = window.SERVER_PRODUCTS_LIST.filter(p => !dbMode || dbMode === 'all' || (p.mode || '').toLowerCase().trim() === dbMode);
      const sortedKeys = Object.keys(_internalProducts).sort((a,b) => _internalProducts[b].label.length - _internalProducts[a].label.length);

      filtered.forEach(p => {
          let mk = sortedKeys.find(k => p.product_name.includes(_internalProducts[k].label)) || Object.keys(_internalProducts)[0];
          opts += `<option value="${mk}" data-fullname="${p.product_name}">${p.product_name}</option>`;
      });
  }

  if (pSelect) pSelect.innerHTML = opts;
  if (fProduct) fProduct.innerHTML = '<option value="">ทุก Product</option>' + opts.replace('<option value="">— เลือก Product —</option>', '');
  if (vProduct) vProduct.innerHTML = '<option value="">ทุก Product</option>' + opts.replace('<option value="">— เลือก Product —</option>', '');
}

function updateFormFieldsByType() {
  const type = document.getElementById('m-type').value;
  const container = document.getElementById('inspection-sections');
  if (!type) return;

  // Keep qty display in sync whenever Type or Mode dropdown changes
  const qtyEl = document.getElementById('m-qty');
  const prodKey = document.getElementById('m-product')?.value;
  if (qtyEl) {
    let qType = (type === 'Epoch' || type === 'E-block') ? 'E-block' : 'Bobbin';
    let q = prodKey ? getProductQty(prodKey, qType) : getQtyByType(qType);
    qtyEl.textContent = q ? q + '/Shift/Oven' : '—';
  }

  let html = '';
  if (type === 'Bobbin') {
    html += createZoneHTML('z1', ZONE_LABELS.z1, false);
    html += createZoneHTML('z2', ZONE_LABELS.z2, false);
    html += createZoneHTML('z3', ZONE_LABELS.z3, false);
  } else {
    html += createZoneHTML('z1', 'Long Fantail (LF)', true);
    html += createZoneHTML('z2', 'Short Fantail (SF)', true);
    // VMI + Bent wire slot: แยกออกมาเป็นกล่องของตัวเอง ขึ้นบรรทัดใหม่
    // ไม่รวมกับ Long/Short Fantail อีกต่อไป (เฉพาะ Epoxy/E-block type)
    html += createVmiBentWireHTML();
  }
  container.innerHTML = html;
}

// ============================================================
// VMI + Bent Wire Slot — กล่องแยกของตัวเอง (เฉพาะ Epoxy/E-block)
// ============================================================
function createVmiBentWireHTML() {
  return `
    <div class="defect-grid" style="background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border)">
      <div style="grid-column:1/-1;font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px">
        VMI &amp; Bent Wire Slot
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;align-items:start;">
        <div class="defect-item" style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:12px;color:var(--text2)">VMI (Visual / Missing Ink)</label>
          ${buildPFToggle('vmi', ['Pass', 'Fail', 'Hold'])}
        </div>
        <div class="defect-item" style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:12px;color:var(--text2)">Bent Wire Slot</label>
          ${buildPFToggle('bentwire')}
        </div>
      </div>
    </div>`;
}

function createZoneHTML(prefix, label, isEpoxy) {
  let fieldsHtml = '';
  if (isEpoxy) {
    fieldsHtml += `
      <div class="defect-item" style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:12px;color:var(--text2)">Missing (หายไป)</label>
        ${buildPFToggle(`${prefix}-missing`)}
      </div>`;
  }

  DEFECT_ITEMS.forEach(d => {
    let imgPlaceholder = '';
    // Bobbin: มีรูป width, length, position ทุก zone
    // Epoxy (Long/Short Fantail): มีรูปแค่ position เท่านั้น
    const isImgDefect = isEpoxy
      ? (d.id === 'position')
      : (d.id === 'width' || d.id === 'length' || d.id === 'position');

    if (isImgDefect) {
      let imgSrc;
      if (isEpoxy) {
        const fantail = prefix === 'z1' ? 'long_fantail' : 'short_fantail';
        imgSrc = `./image/position_${fantail}.png`;
      } else {
        const zoneNum = prefix.replace('z', '');
        imgSrc = `./image/${d.id}_bobbin_zone${zoneNum}.png`;
      }
      imgPlaceholder = `<button type="button" class="btn btn-outline btn-sm" style="margin-top:4px; width:100%; font-size:10px;" onclick="openImageModal('${imgSrc}')">View ${d.labelShort}</button>`;
    }

    fieldsHtml += `
      <div class="defect-item" style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:12px;color:var(--text2)">${d.labelShort}</label>
        ${buildPFToggle(`${prefix}-${d.id}`)}
        ${imgPlaceholder}
      </div>`;
  });

  return `
    <div class="defect-grid" style="background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border)">
      <div style="grid-column:1/-1;font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px">
        ${label}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;align-items:start;">
        ${fieldsHtml}
      </div>
    </div>`;
}

function updateProductInfo() {
  const key = document.getElementById('m-product').value;
  const partNoEl = document.getElementById('m-partno');
  const qtyEl = document.getElementById('m-qty');
  const typeEl = document.getElementById('m-type');
  const inspectionSections = document.getElementById('inspection-sections');
  const inspectionPlaceholder = document.getElementById('inspection-placeholder');

  if (key && PRODUCTS[key]) {
    partNoEl.value = PRODUCTS[key].part || '';
    typeEl.value = PRODUCTS[key].type || 'Epoch';
    // Uses updateFormFieldsByType to set the correct qty label
    qtyEl.textContent = '—';

    updateFormFieldsByType();
    if (inspectionSections) inspectionSections.style.display = 'grid';
    if (inspectionPlaceholder) inspectionPlaceholder.style.display = 'none';

    updateDraftPanel();
  } else {
    partNoEl.value = '';
    qtyEl.textContent = '—';
    if (inspectionSections) { inspectionSections.style.display = 'none'; inspectionSections.innerHTML = ''; }
    if (inspectionPlaceholder) inspectionPlaceholder.style.display = 'block';
    resetDraftState();
    updateDraftPanel();
  }
}

function colorDefect(sel) {
  if (!sel) return;
  sel.style.borderColor = sel.value === 'Fail' ? 'var(--fail)' : sel.value === 'Hold' ? 'var(--warn)' : 'var(--border2)';
  sel.style.background = sel.value === 'Fail' ? 'var(--fail-bg)' : '';
  sel.style.color = sel.value === 'Fail' ? 'var(--fail)' : '';
  sel.style.fontWeight = sel.value === 'Fail' ? '600' : '400';
}

// ============================================================
// PASS/FAIL TOGGLE BUTTONS (matches Dispensing module style)
// ============================================================
function setDefectPF(id, val) {
  const toggle = document.getElementById(`toggle-${id}`);
  const input = document.getElementById(`pf-${id}`);
  if (!toggle || !input) return;
  input.value = val;
  toggle.setAttribute('data-value', val);
}

function buildPFToggle(id, options) {
  options = options || ['Pass', 'Fail'];
  const btns = options.map(v => {
    const cls = v === 'Pass' ? 'pf-pass' : v === 'Fail' ? 'pf-fail' : 'pf-hold';
    return `<div class="pf-btn ${cls}" onclick="setDefectPF('${id}','${v}')">${v}</div>`;
  }).join('');
  return `
    <div class="pf-toggle" id="toggle-${id}" data-value="Pass">
      ${btns}
      <input type="hidden" id="pf-${id}" value="Pass">
    </div>`;
}

// ============================================================
// DRAFT STATE MANAGEMENT
// ============================================================
function resetDraftState() {
  DRAFT_STATE = { drafts: [], headerData: null, requiredQty: 0, productKey: '' };
}

function collectDefectData() {
  const type = document.getElementById('m-type').value;
  const vmiEl = document.getElementById('pf-vmi');
  const bentwireEl = document.getElementById('pf-bentwire');
  const isEpoxyType = type !== 'Bobbin';
  const data = {
    vmi: vmiEl ? vmiEl.value : 'Pass',
  };
  // Bent Wire Slot ใช้เฉพาะ Epoxy/E-block type เท่านั้น
  if (isEpoxyType) {
    data.bentwire = bentwireEl ? bentwireEl.value : 'Pass';
  }

  const zones = type === 'Bobbin' ? ['z1', 'z2', 'z3'] : ['z1', 'z2'];
  const isEpoxy = type !== 'Bobbin';
  zones.forEach(z => {
    if (isEpoxy) {
      const el = document.getElementById(`pf-${z}-missing`);
      data[`${z}_missing`] = el ? el.value : 'Pass';
    }
    DEFECT_ITEMS.forEach(d => {
      const el = document.getElementById(`pf-${z}-${d.id}`);
      data[`${z}_${d.id}`] = el ? el.value : 'Pass';
    });
  });

  return data;
}

function collectHeaderData() {
  const rawProduct = (document.getElementById('m-product') ? document.getElementById('m-product').value : '') || '';
  let productKey = rawProduct;
  if (!PRODUCTS[productKey]) {
    // try to map from label → key
    const rl = rawProduct.toString().toLowerCase().trim();
    for (const k in PRODUCTS) {
      if ((PRODUCTS[k].label || '').toString().toLowerCase().trim() === rl) { productKey = k; break; }
    }
  }

  const rawDate = document.getElementById('m-date') ? document.getElementById('m-date').value : '';
  const rawEN = document.getElementById('m-en') ? document.getElementById('m-en').value : '';
  const rawSend = document.getElementById('m-sendtime') ? document.getElementById('m-sendtime').value : '';
  const rawRecv = document.getElementById('m-recvtime') ? document.getElementById('m-recvtime').value : '';

  return {
    mode: _inputMode,
    type: document.getElementById('m-type') ? document.getElementById('m-type').value : '',
    product: productKey,
    partno: document.getElementById('m-partno') ? document.getElementById('m-partno').value : '',
    qty: document.getElementById('m-qty') ? document.getElementById('m-qty').textContent : '',
    machine: document.getElementById('m-machine') ? document.getElementById('m-machine').value.trim() : '',
    date: normalizeDate(rawDate),
    en: normalizeEN(rawEN),
    sendtime: normalizeTime(rawSend),
    recvtime: normalizeTime(rawRecv),
    fixture: document.getElementById('m-fixture') ? document.getElementById('m-fixture').value.trim() : '',
    ptno: document.getElementById('m-ptno') ? document.getElementById('m-ptno').value.trim() : '',
    attr: document.getElementById('m-attribute') ? document.getElementById('m-attribute').value : 'Normal',
    remark: document.getElementById('m-remark') ? document.getElementById('m-remark').value : '',
  };
}

function clearDefectFieldsOnly() {
  document.querySelectorAll('#inspection-sections .pf-toggle').forEach(t => {
    const id = t.id.replace(/^toggle-/, '');
    setDefectPF(id, 'Pass');
  });
}

function saveDraft() {
  const productKey = document.getElementById('m-product').value;
  if (!productKey) { showToast('กรุณาเลือก Product ก่อน Save Draft', 'warn'); return; }

  const sendTimeEl = document.getElementById('m-sendtime');
  sendTimeEl.value = new Date().toTimeString().slice(0, 5);

  const header = collectHeaderData();
  const defects = collectDefectData();
  const selectedType = document.getElementById('m-type').value;
  const reqQty = getProductQty(productKey, selectedType) || getQtyByType(selectedType);

  if (!header.date) { showToast('กรุณาระบุ Date', 'warn'); return; }
  if (!header.machine) { showToast('กรุณาระบุ Machine No.', 'warn'); return; }

  // EN# ไม่บังคับ 5 หลักอีกต่อไป — แค่ต้องเป็นตัวเลข (ถ้ากรอก)
  if (!header.en) {
    showToast('กรุณาระบุ EN#', 'warn');
    return;
  }

  if (DRAFT_STATE.productKey && DRAFT_STATE.productKey !== productKey) {
    showToast('เปลี่ยน Product จะล้าง Draft เดิม — บันทึกใหม่', 'warn');
    resetDraftState();
  }

  if (!DRAFT_STATE.productKey) {
    DRAFT_STATE.productKey = productKey;
    DRAFT_STATE.requiredQty = reqQty;
    DRAFT_STATE.headerData = header;
  }

  if (DRAFT_STATE.drafts.length >= DRAFT_STATE.requiredQty) {
    showToast(`ครบ ${DRAFT_STATE.requiredQty} ชิ้นแล้ว กรุณากด Submit เพื่อบันทึก`, 'warn');
    return;
  }

  DRAFT_STATE.headerData = header;
  
  DRAFT_STATE.drafts.push({
    ...defects,
    attr: header.attr,
    ptno: header.ptno,
    partno: header.partno,
    remark: header.remark,
    draftIndex: DRAFT_STATE.drafts.length + 1
  });

  const recvEl = document.getElementById('m-recvtime');
  if (recvEl) recvEl.value = new Date().toTimeString().slice(0, 5);

  const savedCount = DRAFT_STATE.drafts.length;
  const remaining = DRAFT_STATE.requiredQty - savedCount;
  
  if (remaining > 0) {
    showToast(`บันทึกชิ้นที่ ${savedCount} สำเร็จ (เหลืออีก ${remaining} ชิ้น)`, 'success');
  } else {
    showToast(`บันทึกครบ ${DRAFT_STATE.requiredQty} ชิ้นแล้ว กรุณากด Submit`, 'success');
  }

  clearDefectFieldsOnly();
  updateDraftPanel();
}

function submitDraft() {
  // Auto-fill and save drafts if the user clicked Submit directly
  if (DRAFT_STATE.drafts.length === 0) {
    saveDraft();
    // If saveDraft failed validation, it wouldn't have added drafts, so we stop here.
    if (DRAFT_STATE.drafts.length === 0) return;
  }

  const { drafts, headerData, requiredQty, productKey } = DRAFT_STATE;

  if (drafts.length < requiredQty) {
    showToast(`ไม่สามารถ Submit ได้: กรุณาบันทึกข้อมูลให้ครบ ${requiredQty} ชิ้น (ปัจจุบันมี ${drafts.length} ชิ้น)`, 'warn');
    return;
  }

  _doSubmitDrafts();
}

async function _doSubmitDrafts() {
  const { drafts, headerData, productKey } = DRAFT_STATE;
  let hasOverallFail = false;

  const newRecords = drafts.map((d, i) => {
    const rec = {
      ...headerData,
      source: 'manual',
      id: DB.nextId++,
      ts: new Date().toISOString(),
      draftIndex: i + 1,
    };

    // copy draft values
    Object.keys(d).forEach(k => {
      if (k !== 'draftIndex') rec[k] = d[k];
    });

    // Normalize header fields
    rec.date = normalizeDate(rec.date);
    rec.en = normalizeEN(rec.en);
    rec.sendtime = normalizeTime(rec.sendtime);
    rec.recvtime = normalizeTime(rec.recvtime);

    // Normalize defect fields and VMI
    if (typeof DEFECT_FIELDS !== 'undefined') {
      DEFECT_FIELDS.forEach(f => { if (rec[f.id] !== undefined) rec[f.id] = normalizeDefect(rec[f.id]); });
    }
    if (rec.z1_missing !== undefined) rec.z1_missing = normalizeDefect(rec.z1_missing);
    if (rec.z2_missing !== undefined) rec.z2_missing = normalizeDefect(rec.z2_missing);
    rec.vmi = rec.vmi ? (normalizeDefect(rec.vmi) === 'Hold' ? 'Hold' : (normalizeDefect(rec.vmi) === 'Fail' ? 'Fail' : 'Pass')) : 'Pass';

    const hasFail = Object.entries(rec).some(([k, v]) => k !== 'draftIndex' && ((typeof v === 'string' && v === 'Fail')));
    const hasHold = rec.vmi === 'Hold';
    rec.overall = hasFail ? 'Fail' : (hasHold ? 'Hold' : 'Pass');

    return rec;
  });

  if (isServerOnline) {
    try {
      if (typeof _BL !== 'undefined') _BL.show('กำลังบันทึกและตรวจสอบข้อมูลซ้ำ...');
      const res = await fetch(`${BACKEND_URL}/api/laser/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: newRecords })
      });
      const result = await res.json();
      if (typeof _BL !== 'undefined') _BL.hide();

      if (!result.success) {
        showToast('Error: ' + result.message, 'error');
        return;
      }

      if (result.duplicates && result.duplicates.length > 0) {
        showToast(`❌ พบข้อมูลซ้ำ ${result.duplicates.length} ชุด (Machine: ${result.duplicates[0].machine}) ไม่ได้บันทึก`, 'error');
        return;
      }
    } catch (e) {
      if (typeof _BL !== 'undefined') _BL.hide();
      console.error('Save to server error', e);
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ บันทึกลงเครื่อง...', 'warn');
    }
  }

  // หากไม่มีซ้ำ หรือ offline ค่อยบันทึกลง Local
  newRecords.forEach(rec => {
    if (rec.overall === 'Fail') hasOverallFail = true;
    DB.records.push(rec);
    checkAndAlert(rec, false);
  });

  saveDB();
  updateDashboard();
  renderAboutTable();

  const pLabel = PRODUCTS[productKey] ? PRODUCTS[productKey].label : productKey;
  const modeTag = _inputMode === 'roving' ? '[Roving] ' : '[Buy Off] ';

  showToast(
    `${modeTag}Submit สำเร็จ ${drafts.length} ชิ้น (แยกเป็น ${drafts.length} Records) — ${pLabel}`,
    hasOverallFail ? 'error' : 'success'
  );

  resetDraftState();
  clearManualForm();

  if (isServerOnline) {
    setTimeout(refreshDataFromServer, 500);
  }

  // เด้งไปที่แท็บ About Data อัตโนมัติเมื่อ Submit เสร็จสิ้น
  const aboutBtn = document.querySelector('.nav-btn[data-tab="about"]');
  if (aboutBtn) {
      switchTab('about', aboutBtn);
  }
}

function updateDraftPanel() {
  const panel = document.getElementById('draft-panel');
  if (!panel) return;

  const { drafts, requiredQty, productKey } = DRAFT_STATE;

  if (!productKey || requiredQty === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  const pLabel = PRODUCTS[productKey] ? PRODUCTS[productKey].label : productKey;
  const pct = requiredQty > 0 ? Math.round((drafts.length / requiredQty) * 100) : 0;
  const barColor = drafts.length >= requiredQty ? 'var(--pass)' : 'var(--accent)';

  let slots = '';
  for (let i = 0; i < requiredQty; i++) {
    const d = drafts[i];
    const done = !!d;
    const hasFail = done && Object.entries(d).some(([k, v]) => k !== 'draftIndex' && v === 'Fail');
    slots += `
      <div style="
        width:32px; height:32px; border-radius:6px; border:2px solid ${done ? (hasFail ? 'var(--fail)' : 'var(--pass)') : 'var(--border2)'};
        background:${done ? (hasFail ? 'var(--fail-bg)' : 'var(--pass-bg)') : 'var(--bg3)'};
        display:flex; align-items:center; justify-content:center;
        font-size:10px; font-weight:700; color:${done ? (hasFail ? 'var(--fail)' : 'var(--pass)') : 'var(--text3)'}
      ">
        ${done ? (hasFail ? '✗' : '✓') : (i + 1)}
      </div>`;
  }

  panel.innerHTML = `
    <div style="padding:16px 20px; border-top:2px dashed var(--border);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <div>
          <span style="font-size:13px; font-weight:800; color:var(--text)">Draft Progress — ${pLabel}</span>
          <span style="margin-left:10px; font-size:12px; color:var(--text2)">${drafts.length} / ${requiredQty} ชิ้น</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="resetDraftState(); updateDraftPanel(); showToast('ล้าง Draft แล้ว','info')">
            ล้าง Draft
          </button>
          <button class="btn btn-success btn-sm" onclick="submitDraft()" ${drafts.length === 0 ? 'disabled' : ''}>
            ✓ Submit (${drafts.length} ชิ้น)
          </button>
        </div>
      </div>
      <div style="height:6px; background:var(--bg4); border-radius:3px; margin-bottom:12px; overflow:hidden;">
        <div style="height:100%; width:${pct}%; background:${barColor}; border-radius:3px; transition:width 0.3s;"></div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${slots}
      </div>
      ${drafts.length >= requiredQty ? `
        <div style="margin-top:10px; padding:10px 14px; background:var(--pass-bg); border:1px solid rgba(39,174,96,0.3); border-radius:6px; font-size:13px; font-weight:700; color:var(--pass);">
          ครบ ${requiredQty} ชิ้น — กด Submit เพื่อบันทึกข้อมูล
        </div>` : ''}
    </div>
  `;
}

function clearManualForm() {
  document.getElementById('m-product').value = '';
  document.getElementById('m-type').value = 'Epoch';
  document.getElementById('m-qty').textContent = '—';

  ['m-partno', 'm-machine', 'm-en', 'm-sendtime', 'm-recvtime', 'm-fixture', 'm-ptno', 'm-remark'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  document.getElementById('m-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('m-recvtime').value = new Date().toTimeString().slice(0, 5);
  document.getElementById('m-attribute').value = 'Normal';

  const inspSec = document.getElementById('inspection-sections');
  const inspPh = document.getElementById('inspection-placeholder');
  if (inspSec) { inspSec.style.display = 'none'; inspSec.innerHTML = ''; }
  if (inspPh) inspPh.style.display = 'block';

  resetDraftState();
  updateDraftPanel();
}

function getOverallResult(rec) {
  if (!rec) return 'Pass';
  const allFields = [...DEFECT_FIELDS, ...DEFECT_FIELDS_LEGACY];
  const checks = allFields.map(f => rec[f.id]).filter(v => v !== undefined);
  if (rec.z1_missing) checks.push(rec.z1_missing);
  if (rec.z2_missing) checks.push(rec.z2_missing);

  if (checks.some(v => v === 'Fail')) return 'Fail';
  if (rec.vmi === 'Fail') return 'Fail';
  if (rec.vmi === 'Hold') return 'Hold';
  return 'Pass';
}

// ============================================================
// ========================
// ALERT LOGIC REMOVED - centralized
function updateAlertBadge() {
  // Removed
}

// generateOutlookDraft() — see full EML implementation at the bottom of this file

// ========================
// DASHBOARD KPI
// ========================
function updateDashboard() {
  const recs = DB.records;
  const today = new Date().toISOString().slice(0, 10);
  const todayRecs = recs.filter(r => r.date === today);
  const ngCount = recs.filter(r => r.overall === 'Fail').length;
  const passCount = recs.filter(r => r.overall === 'Pass').length;
  const uniqueProds = new Set(recs.map(r => r.product).filter(Boolean));

  const pendingCount = recs.filter(r => r.overall === 'Pending').length;
  const inspectedCount = recs.length - pendingCount;
  const yieldInspected = inspectedCount ? ((passCount / inspectedCount) * 100).toFixed(1) : '—';
  const fmt = n => new Intl.NumberFormat().format(n);

  const totalEl = document.getElementById('kpi-total');
  const passEl = document.getElementById('kpi-pass');
  const failEl = document.getElementById('kpi-fail');
  const holdEl = document.getElementById('kpi-hold');
  const yieldEl = document.getElementById('kpi-yield');

  if (totalEl) totalEl.textContent = fmt(recs.length);
  if (passEl) passEl.textContent = fmt(passCount);
  if (failEl) failEl.textContent = fmt(ngCount);
  if (holdEl) holdEl.textContent = fmt(recs.filter(r => r.overall === 'Hold').length);
  if (yieldEl) yieldEl.textContent = inspectedCount ? yieldInspected + '%' : '—%';

  updateAlertBadge();
}

function pfPill(v) {
  if (!v || v === 'Pending') return '<span class="status-badge" style="background:var(--pend-bg);color:var(--pend)">Pending</span>';
  if (v === 'Pass') return '<span class="status-badge" style="background:var(--pass-bg);color:var(--pass)">Pass</span>';
  if (v === 'Fail') return '<span class="status-badge" style="background:var(--fail-bg);color:var(--fail)">Fail</span>';
  if (v === 'Hold') return '<span class="status-badge" style="background:var(--warn-bg);color:var(--warn)">Hold</span>';
  return `<span class="status-badge" style="background:var(--warn-bg);color:var(--warn)">${v}</span>`;
}

// ========================
// RECORDS TABLE & CRUD
// ========================
function sortAbout(col) {
  if (_sortAboutCol === col) _sortAboutDir *= -1;
  else { _sortAboutCol = col; _sortAboutDir = -1; }
  renderAboutTable();
}

function resetFilters() {
  ['f-search', 'f-product', 'f-mode', 'f-overall'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderAboutTable();
}

function toggleSelectAll(source) {
  document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = source.checked);
}

function deleteSelectedRecords() {
  const checkboxes = document.querySelectorAll('.row-checkbox:checked');
  if (checkboxes.length === 0) { showToast('กรุณาเลือกข้อมูลที่ต้องการลบ', 'warn'); return; }
  const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  showConfirm('ยืนยันการลบข้อมูล', `คุณแน่ใจหรือไม่ที่จะลบข้อมูลที่เลือกจำนวน ${selectedIds.length} รายการ?`, () => {
    DB.records = DB.records.filter(r => !selectedIds.includes(r.id));
    saveDB(); updateDashboard(); renderAboutTable();
    const sel = document.getElementById('selectAll');
    if (sel) sel.checked = false;
    showToast(`ลบข้อมูล ${selectedIds.length} รายการสำเร็จ`, 'success');
  });
}

function renderAboutTable() {
  let recs = [...DB.records].filter(r => {
    if (!r.date) return false;
    const enLC = String(r.en || '').trim().toLowerCase();
    const ptLC = String(r.ptno || '').trim().toLowerCase();

    // Skip empty or filler strings
    if (enLC === '-' || enLC === 'null' || ptLC === '-' || ptLC === 'null') return false;

    // Strict footnote/instruction checks for EN
    if (enLC.length > 12 || enLC.includes('found') || enLC.includes('reject') || enLC.includes('leader') || enLC.includes('must') || enLC.includes('inform') || enLC.includes('operator')) {
      return false;
    }

    // Strict footnote/instruction checks for PT/BTC
    if (ptLC.length > 30 || ptLC.includes('found') || ptLC.includes('reject') || ptLC.includes('leader') || ptLC.includes('must') || ptLC.includes('inform')) {
      return false;
    }

    return true;
  });
  const search = (document.getElementById('f-search')?.value || '').toLowerCase();
  const fProduct = document.getElementById('f-product')?.value || '';
  const fMode = document.getElementById('f-mode')?.value || '';
  const fOverall = document.getElementById('f-overall')?.value || '';

  if (search) recs = recs.filter(r =>
    (r.product || '').toLowerCase().includes(search) ||
    (PRODUCTS[r.product]?.label || '').toLowerCase().includes(search) ||
    (r.ptno || '').toLowerCase().includes(search) ||
    (r.en || '').toLowerCase().includes(search) ||
    (r.machine || '').toLowerCase().includes(search));
  if (fProduct) recs = recs.filter(r => r.product === fProduct);
  if (fMode) recs = recs.filter(r => r.mode === fMode);
  if (fOverall) recs = recs.filter(r => r.overall === fOverall);

  recs.sort((a, b) => {
    const av = a[_sortAboutCol] || '', bv = b[_sortAboutCol] || '';
    return av < bv ? -_sortAboutDir : av > bv ? _sortAboutDir : 0;
  });

  // update sort arrows
  ['ts', 'mode', 'product', 'en', 'machine', 'ptno', 'overall'].forEach(col => {
    const el = document.getElementById('sa-' + col);
    if (!el) return;
    el.textContent = _sortAboutCol === col ? (_sortAboutDir === -1 ? ' ▼' : ' ▲') : ' ⇅';
  });

  const tbody = document.getElementById('about-tbody');
  if (!tbody) return;

  const countEl = document.getElementById('about-count');
  if (countEl) {
    const filteredOut = DB.records.length - recs.length;
    if (filteredOut > 0) {
      countEl.textContent = `แสดง ${recs.length} จาก ${DB.records.length} รายการ (${filteredOut} รายการถูกกรองออกเพราะข้อมูลไม่ครบ/ไม่ถูกต้อง)`;
    } else {
      countEl.textContent = `แสดงทั้งหมด ${recs.length} จาก ${DB.records.length} รายการ`;
    }
  }

  if (recs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:32px">
      <div style="font-size:28px;margin-bottom:8px">📋</div>ไม่พบข้อมูล</td></tr>`;
    return;
  }

  const modeTag = mode => (mode === 'roving')
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:var(--warn-bg);color:var(--warn);font-size:11px;font-weight:700">● Roving</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:rgba(45,156,219,0.15);color:var(--blue);font-size:11px;font-weight:700">● Buy off</span>`;

  tbody.innerHTML = recs.map(r => {
    const pLabel = (PRODUCTS[r.product]?.label) || r.productLabel || r.product_label || r.product || '—';
    const draftTag = r.draftIndex
      ? `<span style="margin-left:4px;display:inline-block;padding:1px 5px;border-radius:4px;background:rgba(108,92,231,0.12);color:var(--purple);font-size:9px;font-weight:700">#${r.draftIndex}</span>`
      : '';
    return `<tr style="border-bottom:1px solid var(--border2)">
      <td style="padding:10px;text-align:center"><input type="checkbox" class="row-checkbox" value="${r.id}"></td>
      <td style="padding:10px;white-space:nowrap;font-size:12px">${r.date || '—'}</td>
      <td style="padding:8px">${modeTag(r.mode)}</td>
      <td style="padding:10px">
        <div style="font-weight:700;font-size:13px">${pLabel}${draftTag}</div>
        <div style="font-size:10px;color:var(--text3)">${r.partno || ''}</div>
      </td>
      <td style="padding:10px;font-weight:600;font-size:13px">${r.en || '—'}</td>
      <td style="padding:10px;font-size:12px;font-weight:700;color:var(--warn)">${r.machine || '—'}</td>
      <td style="padding:10px;font-size:12px;color:#0984e3;font-weight:600">${r.ptno || '—'}</td>
      <td style="padding:8px">${pfPill(r.overall)}</td>
      <td style="padding:8px">${pfPill(r.vmi || 'Pass')}</td>
      <td style="padding:8px;text-align:right">
        <div style="display:flex;gap:5px;justify-content:flex-end">
          <button onclick="viewDetail(${r.id})" title="ดูรายละเอียด"
                  style="padding:3px 8px;border-radius:5px;font-size:13px;border:1px solid var(--border2);background:var(--bg);cursor:pointer">🔍</button>
          <button onclick="editRecord(${r.id})" title="แก้ไข"
                  style="padding:3px 8px;border-radius:5px;font-size:13px;border:1px solid var(--border2);background:var(--bg);cursor:pointer">✏️</button>
          <button onclick="deleteRecord(${r.id})" title="ลบ"
                  style="padding:3px 8px;border-radius:5px;font-size:13px;border:1px solid rgba(220,38,38,.3);background:var(--fail-bg);cursor:pointer;color:var(--fail)">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function viewDetail(id) {
  const rec = DB.records.find(r => r.id === id);
  if (!rec) return;
  const body = document.getElementById('detail-modal-body');

  const pLabel = PRODUCTS[rec.product] ? PRODUCTS[rec.product].label : (rec.product || '—');

  // ── helper: safe value (returns '—' if blank) ──────────────────────────
  const sv = (...vals) => {
    for (const v of vals) {
      const s = (v !== null && v !== undefined) ? String(v).trim() : '';
      if (s !== '') return s;
    }
    return '—';
  };

  // ── date formatter ─────────────────────────────────────────────────────
  const fmtDate = d => {
    if (!d || d === '—') return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/ /g, "'");
  };

  // ── overall / status badge ─────────────────────────────────────────────
  const overall = rec.overall || 'Pass';
  const overallColor = overall === 'Pass' ? '#27ae60' : overall === 'Fail' ? '#e74c3c' : '#f39c12';
  const overallBg = overall === 'Pass' ? '#eafaf1' : overall === 'Fail' ? '#fdedec' : '#fef5e7';
  const overallIcon = overall === 'Pass' ? '✔' : overall === 'Fail' ? '✖' : '⚠';
  const statusBadge = `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 14px;border-radius:8px;background:${overallBg};color:${overallColor};font-size:13px;font-weight:800;border:1.5px solid ${overallColor}30">${overallIcon} ${overall}</span>`;

  // ── mode / source tags ─────────────────────────────────────────────────
  const modeTag = rec.mode === 'roving'
    ? `<span style="padding:2px 8px;border-radius:6px;background:var(--warn-bg);color:var(--warn);font-size:10px;font-weight:700">Roving</span>`
    : `<span style="padding:2px 8px;border-radius:6px;background:rgba(9,132,227,0.1);color:var(--blue);font-size:10px;font-weight:700">Buy Off</span>`;
  const sourceTag = rec.source === 'import'
    ? `<span style="padding:2px 8px;border-radius:6px;background:rgba(108,92,231,0.1);color:var(--purple);font-size:10px;font-weight:700">📥 Import</span>`
    : `<span style="padding:2px 8px;border-radius:6px;background:rgba(39,174,96,0.1);color:var(--pass);font-size:10px;font-weight:700">Manual</span>`;

  // ── mpfPill (pass/fail/hold pill) ──────────────────────────────────────
  const mpfPill = v => {
    if (!v || v === '—') return '<span style="color:var(--text3)">—</span>';
    if (v === 'Pass') return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#27ae60"><span style="width:8px;height:8px;border-radius:50%;background:#27ae60;display:inline-block"></span>OK</span>`;
    if (v === 'Fail') return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#e74c3c"><span style="width:8px;height:8px;border-radius:50%;background:#e74c3c;display:inline-block"></span>NG</span>`;
    if (v === 'Hold') return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#f39c12"><span style="width:8px;height:8px;border-radius:50%;background:#f39c12;display:inline-block"></span>Hold</span>`;
    return `<span style="color:var(--text2);font-size:12px">${v}</span>`;
  };

  // ── info header card row ───────────────────────────────────────────────
  const hCard = (label, value, accent) => `
    <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
      <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px">${label}</div>
      <div style="font-size:13px;font-weight:700;color:${accent || 'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${value}</div>
    </div>`;

  // ── defect zone card: each defect as a value card ─────────────────────
  const buildZoneCards = (prefix, label, hasMissing) => {
    const items = ['skip', 'incomplete', 'width', 'length', 'position'];
    let cards = '';

    if (hasMissing) {
      const v = rec[`${prefix}_missing`] || 'Pass';
      const isFail = v === 'Fail';
      cards += `<div style="background:${isFail ? 'var(--fail-bg)' : '#fff'};border:1px solid ${isFail ? 'var(--fail)' : 'var(--border)'};border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;">
        <div style="font-size:9px;font-weight:700;color:${isFail ? 'var(--fail)' : 'var(--text3)'};text-transform:uppercase;letter-spacing:0.5px">Missing</div>
        <div>${mpfPill(v)}</div>
      </div>`;
    }

    items.forEach(d => {
      const v = rec[`${prefix}_${d}`] || 'Pass';
      const isFail = v === 'Fail';
      cards += `<div style="background:${isFail ? 'var(--fail-bg)' : '#fff'};border:1px solid ${isFail ? 'var(--fail)' : 'var(--border)'};border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;">
        <div style="font-size:9px;font-weight:700;color:${isFail ? 'var(--fail)' : 'var(--text3)'};text-transform:uppercase;letter-spacing:0.5px">${d.charAt(0).toUpperCase() + d.slice(1)}</div>
        <div>${mpfPill(v)}</div>
      </div>`;
    });

    return `<div style="margin-bottom:12px;">
      <div style="font-size:10px;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:6px;display:flex;align-items:center;gap:5px;">
        <span style="width:3px;height:12px;background:var(--accent);border-radius:2px;display:inline-block"></span>${label}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;">${cards}</div>
    </div>`;
  };

  const isEpoxy = rec.type !== 'Bobbin';
  let zoneHtml = '';
  if (isEpoxy) {
    zoneHtml = buildZoneCards('z1', 'Long Fantail (LF)', true)
      + buildZoneCards('z2', 'Short Fantail (SF)', true);
  } else {
    zoneHtml = buildZoneCards('z1', 'Zone 1 — Bobbin Side 1', false)
      + buildZoneCards('z2', 'Zone 2 — Bobbin Side 2', false)
      + buildZoneCards('z3', 'Zone 3 — Bobbin Side 3', false);
  }

  // ── collect all fail defects for summary ──────────────────────────────
  const allDefectFields = [...DEFECT_FIELDS, ...DEFECT_FIELDS_LEGACY];
  const failDefects = allDefectFields.filter(f => rec[f.id] === 'Fail');
  if (rec.z1_missing === 'Fail') failDefects.unshift({ labelFull: 'Zone1 Missing' });
  if (rec.z2_missing === 'Fail') failDefects.unshift({ labelFull: 'Zone2 Missing' });
  if (rec.vmi === 'Fail') failDefects.push({ labelFull: 'VMI Disposition' });
  const seenFail = new Set();
  const uniqueFails = failDefects.filter(f => {
    const k = f.labelFull || f.label;
    if (seenFail.has(k)) return false;
    seenFail.add(k); return true;
  });

  const statusNote = uniqueFails.length > 0
    ? `<div style="margin-top:4px;padding:7px 10px;background:var(--fail-bg);border:1px solid rgba(231,76,60,0.25);border-radius:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
        <span style="font-size:9px;font-weight:700;color:var(--fail);text-transform:uppercase;margin-right:4px;">⚠ Fail Points:</span>
        ${uniqueFails.map(f => `<span style="padding:2px 8px;border-radius:10px;background:#fff;border:1px solid var(--fail);color:var(--fail);font-size:10px;font-weight:600">${f.labelFull || f.label}</span>`).join('')}
      </div>`
    : `<div style="margin-top:4px;padding:6px 10px;background:var(--pass-bg);border:1px solid rgba(39,174,96,0.25);border-radius:6px;font-size:11px;font-weight:600;color:var(--pass)">ไม่พบข้อบกพร่อง (ALL PASS)</div>`;

  body.innerHTML = `


    <!-- ① Title row ──────────────────────────────────────────── -->
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <div style="font-size:18px;font-weight:900;color:var(--text);letter-spacing:-0.3px">${pLabel}</div>
      ${rec.draftIndex ? `<span style="padding:2px 8px;border-radius:8px;background:rgba(108,92,231,0.1);color:var(--purple);font-size:10px;font-weight:700">Piece #${rec.draftIndex}</span>` : ''}
      <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">${modeTag}${sourceTag}</div>
    </div>

    <!-- ② Info header — card strip (เหมือนรูป) ───────────────── -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;margin-bottom:12px;">
      <div style="padding:10px 16px;border-right:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">PRODUCT</div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${pLabel}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:1px">${sv(rec.type) || 'Epoch'}</div>
      </div>
      <div style="padding:10px 16px;border-right:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">FIXTURE</div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${sv(rec.fixture)}</div>
      </div>
      <div style="padding:10px 16px;border-right:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">PT MACHINE</div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${sv(rec.ptno, rec.machine)}</div>
      </div>
      <div style="padding:10px 16px;border-right:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">EN # / MACHINE</div>
        <div style="font-size:13px;font-weight:700;color:var(--accent)">${sv(rec.en)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:1px">${sv(rec.machine)}</div>
      </div>
      <div style="padding:10px 16px;border-right:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">DATE</div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${fmtDate(rec.date)}</div>
      </div>
      <div style="padding:10px 16px;">
        <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">STATUS</div>
        ${statusBadge}
      </div>
    </div>

    <!-- ③ Extra info row (Send/Recv/PartNo/Attr) ──────────────── -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg2);margin-bottom:12px;">
      <div style="padding:7px 14px;border-right:1px solid var(--border)">
        <div style="font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Send Time</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-top:2px">${sv(rec.sendtime)}</div>
      </div>
      <div style="padding:7px 14px;border-right:1px solid var(--border)">
        <div style="font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Recv Time</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-top:2px">${sv(rec.recvtime)}</div>
      </div>
      <div style="padding:7px 14px;border-right:1px solid var(--border)">
        <div style="font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Part Number</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-top:2px">${sv(rec.partno)}</div>
      </div>
      <div style="padding:7px 14px;border-right:1px solid var(--border)">
        <div style="font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Attribute</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-top:2px">${sv(rec.attr, 'Normal')}</div>
      </div>
      <div style="padding:7px 14px;border-right:1px solid var(--border)">
        <div style="font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">VMI Disposition</div>
        <div style="margin-top:2px">${mpfPill(rec.vmi || 'Pass')}</div>
      </div>
      ${isEpoxy ? `<div style="padding:7px 14px;border-right:1px solid var(--border)">
        <div style="font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Bent Wire Slot</div>
        <div style="margin-top:2px">${mpfPill(rec.bentwire || 'Pass')}</div>
      </div>` : ''}
      <div style="padding:7px 14px;">
        <div style="font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">Qty / Shift</div>
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-top:2px">${sv(rec.qty)}</div>
      </div>
    </div>

    <!-- ④ Defect status note ──────────────────────────────────── -->
    ${statusNote}
    ${rec.remark ? `<div style="margin-top:6px;padding:6px 10px;background:var(--warn-bg);border-left:2px solid var(--warn);border-radius:3px;font-size:11px;color:var(--text2)"><b>Remark:</b> ${rec.remark}</div>` : ''}

    <!-- ⑤ Zone Detail heading ────────────────────────────────── -->
    <div class="detail-divider"></div>
    <div style="font-size:10px;font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">
      INSPECTION DETAIL — Zone / Defect Values
    </div>

    <!-- ⑥ Zone cards ─────────────────────────────────────────── -->
    ${zoneHtml}

    <!-- ⑦ Footer ─────────────────────────────────────────────── -->
    <div style="text-align:right;margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
      <button class="btn btn-outline btn-sm" onclick="closeModal('detail-modal')">✕ ปิด</button>
    </div>
  `;
  openModal('detail-modal');
}

function buildEditZoneHtml(prefix, label, rec, isEpoxy) {
  let html = `<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:12px;border:1px solid var(--border);">
    <h5 style="margin:0 0 10px 0;font-size:13px;color:var(--text2);display:flex;align-items:center;gap:4px">
      ${label}
    </h5>
    <div class="form-grid" style="grid-template-columns:repeat(3,1fr);gap:10px;">`;
  if (isEpoxy) {
    const v = rec[`${prefix}_missing`] || 'Pass';
    html += `<div class="form-group"><label>Missing</label><select id="e-${prefix}-missing" class="form-select"><option ${v === 'Pass' ? 'selected' : ''}>Pass</option><option ${v === 'Fail' ? 'selected' : ''}>Fail</option></select></div>`;
  }
  DEFECT_ITEMS.forEach(d => {
    const v = rec[`${prefix}_${d.id}`] || 'Pass';
    html += `<div class="form-group"><label>${d.labelShort}</label><select id="e-${prefix}_${d.id}" class="form-select"><option ${v === 'Pass' ? 'selected' : ''}>Pass</option><option ${v === 'Fail' ? 'selected' : ''}>Fail</option></select></div>`;
  });
  return html + `</div></div>`;
}

function editRecord(id) {
  const rec = DB.records.find(r => r.id === id);
  if (!rec) return;
  _editId = id;
  const body = document.getElementById('edit-form-body');

  let pOpts = '';
  Object.keys(PRODUCTS).forEach(k => {
    pOpts += `<option value="${k}" ${rec.product === k ? 'selected' : ''}>${PRODUCTS[k].label}</option>`;
  });

  const isEpoxy = rec.type !== 'Bobbin';
  let defectHTML = '';
  if (isEpoxy) {
    defectHTML += buildEditZoneHtml('z1', 'Long Fantail (LF)', rec, true);
    defectHTML += buildEditZoneHtml('z2', 'Short Fantail (SF)', rec, true);
  } else {
    defectHTML += buildEditZoneHtml('z1', ZONE_LABELS.z1, rec, false);
    defectHTML += buildEditZoneHtml('z2', ZONE_LABELS.z2, rec, false);
    defectHTML += buildEditZoneHtml('z3', ZONE_LABELS.z3, rec, false);
  }

  body.innerHTML = `
    <div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px;">
      <div class="form-group"><label>Product</label><select id="e-product" class="form-select">${pOpts}</select></div>
      <div class="form-group"><label>Type</label>
        <select id="e-type" class="form-select">
          <option value="Epoch"  ${rec.type !== 'Bobbin' ? 'selected' : ''}>Epoch</option>
          <option value="Bobbin" ${rec.type === 'Bobbin' ? 'selected' : ''}>Bobbin</option>
        </select>
      </div>
      <div class="form-group"><label>Date</label><input type="date" id="e-date" class="form-input" value="${rec.date || ''}"></div>
      <div class="form-group"><label>PT/Bobbin Store lot</label><input type="text" id="e-ptno" class="form-input" value="${rec.ptno || ''}"></div>
      <div class="form-group"><label>Machine</label><input type="text" id="e-machine" class="form-input" value="${rec.machine || ''}"></div>
      <div class="form-group"><label>EN#</label><input type="text" id="e-en" class="form-input" value="${rec.en || ''}"></div>
      <div class="form-group"><label>Send Time</label><input type="time" id="e-sendtime" class="form-input" value="${rec.sendtime || ''}"></div>
      <div class="form-group"><label>Recv Time</label><input type="time" id="e-recvtime" class="form-input" value="${rec.recvtime || ''}"></div>
      <div class="form-group"><label>Fixture</label><input type="text" id="e-fixture" class="form-input" value="${rec.fixture || ''}"></div>
      <div class="form-group"><label>Quantity</label><input type="text" id="e-qty" class="form-input" value="${rec.qty || ''}" readonly style="background:var(--bg2)"></div>
    </div>
    <div style="grid-column:1/-1;padding-top:16px;border-top:1px dashed var(--border);">
      <h4 style="font-size:14px;margin:0 0 12px 0;color:var(--text);display:flex;align-items:center;gap:6px">
        Defect / Visual Inspection
      </h4>
      ${defectHTML}
    </div>
    <div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="form-group"><label>VMI Disposition</label>
        <select id="e-vmi" class="form-select">
          <option ${rec.vmi === 'Pass' ? 'selected' : ''}>Pass</option>
          <option ${rec.vmi === 'Fail' ? 'selected' : ''}>Fail</option>
          <option ${rec.vmi === 'Hold' ? 'selected' : ''}>Hold</option>
        </select>
      </div>
      ${isEpoxy ? `<div class="form-group"><label>Bent Wire Slot</label>
        <select id="e-bentwire" class="form-select">
          <option ${rec.bentwire !== 'Fail' ? 'selected' : ''}>Pass</option>
          <option ${rec.bentwire === 'Fail' ? 'selected' : ''}>Fail</option>
        </select>
      </div>` : ''}
      <div class="form-group" style="grid-column:1/-1;"><label>Remark</label><input type="text" id="e-remark" class="form-input" value="${rec.remark || ''}"></div>
    </div>
  `;
  openModal('edit-modal');
}

function saveEdit() {
  const rec = DB.records.find(r => r.id === _editId);
  if (!rec) return;

  rec.product = document.getElementById('e-product').value;
  rec.type = document.getElementById('e-type').value;
  rec.date = normalizeDate(document.getElementById('e-date').value);
  rec.ptno = document.getElementById('e-ptno').value;
  rec.machine = document.getElementById('e-machine').value;
  rec.en = normalizeEN(document.getElementById('e-en').value);
  rec.sendtime = normalizeTime(document.getElementById('e-sendtime').value);
  rec.recvtime = normalizeTime(document.getElementById('e-recvtime').value);
  rec.fixture = document.getElementById('e-fixture').value;
  rec.remark = document.getElementById('e-remark').value;
  rec.vmi = (function (v) { const n = normalizeDefect(v); return n === 'Hold' ? 'Hold' : (n === 'Fail' ? 'Fail' : 'Pass'); })(document.getElementById('e-vmi').value);

  if (rec.type !== 'Bobbin') {
    const bwEl = document.getElementById('e-bentwire');
    if (bwEl) rec.bentwire = normalizeDefect(bwEl.value);
  } else {
    delete rec.bentwire;
  }

  if (PRODUCTS[rec.product]) {
    const qty = getQtyByType(rec.type || 'Epoch');
    rec.qty = qty + ' pcs / Fixture / Shift';
  }

  const zones = rec.type === 'Bobbin' ? ['z1', 'z2', 'z3'] : ['z1', 'z2'];
  zones.forEach(z => {
    if (rec.type !== 'Bobbin') {
      const mEl = document.getElementById(`e-${z}-missing`);
      if (mEl) rec[`${z}_missing`] = normalizeDefect(mEl.value);
    }
    DEFECT_ITEMS.forEach(d => {
      const el = document.getElementById(`e-${z}_${d.id}`);
      if (el) rec[`${z}_${d.id}`] = normalizeDefect(el.value);
    });
  });

  rec.overall = getOverallResult(rec);
  saveDB(); 

  if (isServerOnline) {
    try {
      fetch(`${API_BASE}/api/laser/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_data: { records: [rec] } })
      }).then(res => res.json()).then(data => {
        if (!data.success) {
          showToast('Failed to sync edit: ' + data.error, 'error');
        } else {
          showToast('Updated and synced successfully', 'success');
          refreshDataFromServer();
        }
      }).catch(err => console.error('Sync edit error:', err));
    } catch (e) {
      console.error('Fetch error:', e);
    }
  } else {
    showToast('Saved locally', 'success');
  }

  updateDashboard(); renderAboutTable(); closeModal('edit-modal');
  
  if (typeof isBackendOnline !== 'undefined' ? isBackendOnline : isServerOnline) {
    try {
      fetch(`${BACKEND_URL}/api/laser/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_data: { records: [rec] } })
      });
    } catch (e) {
      console.error('Laser Edit Sync Error:', e);
    }
  }

  showToast('บันทึกการแก้ไขสำเร็จ', 'success');
}

function deleteRecord(id) {
  showConfirm('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ที่จะลบข้อมูล Record นี้?', async () => {
    if (typeof isBackendOnline !== 'undefined' && isBackendOnline) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/laser/records/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete on server');
      } catch (err) {
        console.error('Delete Record Error:', err);
        showToast('ลบบน Server ไม่สำเร็จ', 'error');
      }
    }
    DB.records = DB.records.filter(r => r.id !== id);
    saveDB(); updateDashboard(); renderAboutTable();
    showToast('ลบข้อมูลสำเร็จ', 'info');
  });
}

function exportToExcel() {
  if (DB.records.length === 0) { showToast('ไม่มีข้อมูลที่จะ Export', 'warn'); return; }
  // clean(v): แปลง undefined/null เป็น '' ป้องกัน SheetJS เขียน text-prefix apostrophe
  const clean = (v) => (v === undefined || v === null) ? '' : String(v);
  const rows = DB.records.map(r => {
    const pLabel = PRODUCTS[r.product] ? PRODUCTS[r.product].label : (r.product || '');
    let exp = {
      'Date': clean(r.date), 'Type': clean(r.type), 'Product': clean(pLabel),
      'Part Number': clean(r.partno), 'Quantity': clean(r.qty),
      'Machine': clean(r.machine), 'EN#': clean(r.en),
      'Sending Time': clean(r.sendtime), 'Receive Time': clean(r.recvtime),
      'Fixture': clean(r.fixture), 'PT/Bobbin Store lot': clean(r.ptno),
      'Attribute': clean(r.attr),
    };
    DEFECT_FIELDS.forEach(f => { exp[f.label] = clean(r[f.id]); });
    exp['VMI Disposition'] = clean(r.vmi);
    exp['Overall'] = clean(r.overall);
    exp['Remark'] = clean(r.remark);
    exp['Draft Index'] = r.draftIndex !== undefined ? String(r.draftIndex) : '';
    return exp;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laser_Buyoff');
  XLSX.writeFile(wb, `Laser_Buyoff_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('Export ไฟล์สำเร็จ', 'success');
}

// ====================================================================
// IMPORT FROM EXCEL (ROBUST DYNAMIC PARSER + PREVIEW MODULE)
// ====================================================================
let TEMP_IMPORT_RECORDS = [];

// ====================================================================
// IMPORT FROM EXCEL (STRICT VALIDATION + PT/BTC LOGIC + REMARK CATCHER + FILE NAME DETECTION)
// ====================================================================
function handleImportExcel(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  // โหมดที่บังคับจาก Dropdown หน้าเว็บ
  const modeSelector = document.getElementById('import-force-mode');
  const forceMode = modeSelector ? modeSelector.value : 'auto';

  const cleanStr = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '').trim();
  const LABEL_TO_KEY = {};
  if (typeof PRODUCTS !== 'undefined') {
    Object.keys(PRODUCTS).forEach(k => {
      LABEL_TO_KEY[cleanStr(PRODUCTS[k].label)] = k;
      LABEL_TO_KEY[cleanStr(k)] = k;
    });
  }

  const findProductKey = (rawText) => {
    const normalized = cleanStr(rawText);
    if (!normalized) return '';
    // 1. exact key match
    if (PRODUCTS && PRODUCTS[normalized]) return normalized;
    // 2. label / key map exact
    if (LABEL_TO_KEY[normalized]) return LABEL_TO_KEY[normalized];
    // 3. loop exact
    for (const k in PRODUCTS) {
      if (cleanStr(PRODUCTS[k].label) === normalized || cleanStr(k) === normalized) return k;
    }
    // 4. fuzzy: partial label contains normalized or vice-versa
    for (const k in PRODUCTS) {
      const lbl = cleanStr(PRODUCTS[k].label);
      if (lbl && (lbl.includes(normalized) || normalized.includes(lbl))) return k;
    }
    // 5. fuzzy key partial
    for (const k in PRODUCTS) {
      if (k.includes(normalized) || normalized.includes(k)) return k;
    }
    return normalized;
  };

  const KW_MACHINE = ['machineno', 'machine', 'mc', 'mcno', 'machinenum', 'หมายเลขเครื่อง', 'เครื่อง'];
  const KW_PARTNO = ['partno', 'partnumber', 'partnum', 'part', 'pn', 'หมายเลขชิ้น', 'partname'];
  const KW_DATE = ['date', 'วันที่', 'datecheck', 'checkdate', 'inspectiondate'];
  const KW_EN = ['en', 'enno', 'eno', 'empno', 'emp', 'operator', 'operatorno', 'รหัสพนักงาน', 'พนักงาน', 'เบอร์พนักงาน', 'op'];
  const KW_SEND = ['sending', 'sendtime', 'timesend', 'send', 'เวลาส่ง', 'timeofsend', 'sendingtime', 'ส่ง', 'timein'];
  const KW_RECV = ['receive', 'recvtime', 'timerecv', 'receive time', 'recv time', 'recv', 'เวลารับ', 'timeofreceive', 'receivetime', 'รับ', 'timeout'];
  const KW_FIX = ['fixture', 'fix', 'fixt', 'fixtno', 'jigno', 'jig', 'ฟิกเจอร์', 'โต๊ะ'];
  const KW_ATTR = ['attribute', 'buyofftype', 'buyoff', 'attr', 'type2', 'insptype'];
  const KW_PIECE = ['no', 'ลำดับ', 'pcs', 'piece', 'samplingresult', 'item', 'seq', 'ลำดับที่', 'ชิ้น', 'num'];
  const KW_REMARK = ['remark', 'หมายเหตุ', 'note', 'comment', 'remarks'];
  const KW_VMI = ['vmidisposition', 'vmi', 'disposition', 'vmijudge'];

  const KW_PT = ['pt', 'ptno', 'ptnumber', 'ptstore', 'ptmachine'];
  const KW_BTC = ['btc', 'btcno', 'btcnumber', 'bobbin', 'bobbinlot', 'bobbinno', 'storelot', 'สต็อก', 'btcmachine'];

  let totalImported = 0;
  let filesProcessed = 0;
  TEMP_IMPORT_RECORDS = [];

  const sanitizeAndValidate = (rec) => {
    if (!rec.date || !rec.en) return false;
    if (!/^\d{5}$/.test(rec.en)) return false;

    let pNo = String(rec.partno || '').toLowerCase().trim();
    let mc = String(rec.machine || '').toLowerCase().trim();
    let pt = String(rec.ptno || '').toLowerCase().trim();
    let fix = String(rec.fixture || '').toLowerCase().trim();

    const garbageWords = ['spec', 'equipment', 'result', 'auto-filled', 'parameter', 'template', 'not allow', 'buyoff', 'limit'];
    if (garbageWords.some(kw => pNo === kw || pNo.includes(kw))) return false;

    const attrWords = ['submit', 'normal', 're-submit', 'resubmit'];
    if (attrWords.some(kw => mc.includes(kw))) rec.machine = '';
    if (attrWords.some(kw => pt.includes(kw))) rec.ptno = '';
    if (attrWords.some(kw => fix.includes(kw))) rec.fixture = '';
    if (attrWords.some(kw => pNo.includes(kw))) rec.partno = '';

    if (mc === 'm01') rec.machine = '';
    if (fix === 'fix-01') rec.fixture = '';

    if (/^[123456789]$/.test(pNo)) rec.partno = '';

    return true;
  };

  function extractModelName(filename) {
    let name = filename.replace(/\.xlsx?$/i, '').trim();
    name = name.replace(/(buy\s*off|roving|audit|laser\s*engraving|bobbin)/ig, '').trim();
    name = name.replace(/\s+/g, ' ');
    name = name.replace(/^[-_\s]+|[-_\s]+$/g, '');
    return name || 'Unknown Model';
  }
  Array.from(files).forEach(file => {
    // 🧠 ใช้วิธีเดียวกับ Dispensing: ตรวจจับโหมดจาก "ชื่อไฟล์"
    const fnLC = file.name.toLowerCase();
    let modeFromFileName = 'buyoff';
    if (fnLC.includes('roving') || fnLC.includes('rov_') || fnLC.includes('_rov') || fnLC.includes('audit')) {
      modeFromFileName = 'roving';
    } else if (fnLC.includes('buy off') || fnLC.includes('buy_off') || fnLC.includes('buy-off') || fnLC.includes('buyoff')) {
      modeFromFileName = 'buyoff';
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        let bestSheet = null;
        let bestDataRows = -1;

        for (const sname of wb.SheetNames) {
          const _ws = wb.Sheets[sname];
          const _aoa = XLSX.utils.sheet_to_json(_ws, { header: 1, defval: '' });
          let dataCount = 0;
          for (let i = 0; i < _aoa.length; i++) {
            if (!_aoa[i]) continue;
            if (Array.isArray(_aoa[i]) && _aoa[i].length > 3 && _aoa[i].some(c => String(c).trim() !== '')) {
              dataCount++;
            }
          }
          if (dataCount > bestDataRows) { bestDataRows = dataCount; bestSheet = sname; }
        }

        const ws = wb.Sheets[bestSheet || wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (aoa.length === 0) throw new Error("ไฟล์ Excel ไม่มีข้อมูล (Empty sheet)");

        const isRawTemplate = aoa.slice(0, 20).some(row => {
          if (!row || !Array.isArray(row)) return false;
          return row.some(cell => {
            const s = cleanStr(cell);
            return s.includes('buyoff') || s.includes('buy-off') || s.includes('laser') || s.includes('machine') || s.includes('model');
          });
        });

        if (isRawTemplate) {
          let productLabel = "", partNumber = "", machine = "", type = "Epoch";

          for (let i = 0; i < Math.min(20, aoa.length); i++) {
            const row = aoa[i];
            if (!row || !Array.isArray(row)) continue;

            for (let j = 0; j < row.length; j++) {
              const raw = String(row[j] || '').trim();
              const val = cleanStr(raw);
              if (!val) continue;

              const isStopKeyword = (v) => KW_MACHINE.some(kw => v.includes(kw)) || KW_PARTNO.some(kw => v.includes(kw)) || KW_DATE.some(kw => v.includes(kw));

              if (val.includes('model')) {
                const inlineMatch = raw.match(/model\s*:?\s*(.+)/i);
                if (inlineMatch && inlineMatch[1] && !/^:+$/.test(inlineMatch[1])) {
                  productLabel = inlineMatch[1].trim();
                } else {
                  for (let k = j + 1; k < Math.min(j + 6, row.length); k++) {
                    const v = cleanStr(row[k]);
                    if (v && !isStopKeyword(v)) { productLabel = String(row[k]).trim(); break; }
                  }
                }
              }
              if (KW_MACHINE.some(kw => val.includes(kw))) {
                const inlineMatch = raw.match(/machine\s*no\.?\s*:?\s*(\S+)/i);
                if (inlineMatch && inlineMatch[1] && !/^:+$/.test(inlineMatch[1])) {
                  machine = inlineMatch[1].trim();
                } else {
                  for (let k = j + 1; k < Math.min(j + 6, row.length); k++) {
                    const v = String(row[k] || '').trim();
                    if (v && !cleanStr(v).includes('model') && !isStopKeyword(cleanStr(v))) { machine = v; break; }
                  }
                }
              }
              if (KW_PARTNO.some(kw => val === kw || val.startsWith(kw))) {
                const inlineMatch = raw.match(/part\s*no[\.\w]*\s*:?\s*(.+)/i);
                if (inlineMatch && inlineMatch[1] && !/^:+$/.test(inlineMatch[1])) {
                  partNumber = inlineMatch[1].trim();
                } else {
                  for (let k = j + 1; k < Math.min(j + 6, row.length); k++) {
                    const v = String(row[k] || '').trim();
                    if (v && !cleanStr(v).startsWith('cell') && !cleanStr(v).startsWith('number') && !isStopKeyword(cleanStr(v))) { partNumber = v; break; }
                  }
                }
              }
            }
          }

          const productKey = findProductKey(productLabel);
          if (typeof PRODUCTS !== 'undefined' && productKey && PRODUCTS[productKey]) {
            type = PRODUCTS[productKey].type || "Epoch";
          }

          let headerRowIdx = -1;
          for (let i = 0; i < 20; i++) {
            if (aoa[i] && Array.isArray(aoa[i]) && aoa[i].some(c => KW_DATE.some(kw => cleanStr(c) === kw))) {
              headerRowIdx = i; break;
            }
          }

          const parseTime = (val) => {
            if (val === undefined || val === null) return '';
            let s = String(val).trim();
            if (!s) return '';
            if (['×', 'x', '-', '–', '—', 'na', 'n/a'].includes(s.toLowerCase())) return '';
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
            if (/^\d{4}$/.test(s)) {
              const hh = s.slice(0, 2);
              const mm = s.slice(2, 4);
              if (parseInt(hh, 10) < 24 && parseInt(mm, 10) < 60) return `${hh}:${mm}`;
            }
            const n = parseFloat(s.replace(',', '.'));
            if (!isNaN(n) && n > 0 && n < 1) {
              const totalMin = Math.round(n * 24 * 60);
              return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
            }
            return '';
          };

          const parseDate = (val) => {
            if (!val) return '';
            const s = String(val).trim();
            if (!s) return '';
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
            if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) {
              const parts = s.split('/');
              if (parts.length === 3) {
                let yr = parts[2];
                if (yr.length === 2) yr = parseInt(yr) < 50 ? '20' + yr : '19' + yr;
                return `${yr}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
              }
            }
            const n = parseFloat(s);
            if (!isNaN(n) && n > 40000 && n < 60000) {
              const d = new Date(Math.round((n - 25569) * 86400 * 1000));
              if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
            }
            return '';
          };

          let dateCol = -1, enCol = -1, sendCol = -1, recvCol = -1, fixCol = -1, ptCol = -1, btcCol = -1, attrCol = -1, pieceCol = -1, vmiCol = -1, remarkCol = -1, modeCol = -1, partnoCol = -1;
          const allDefectFields = [...DEFECT_FIELDS, ...DEFECT_FIELDS_LEGACY];
          let colMap = {};
          const kwMatch = (txt, kwList) => kwList.some(kw => txt === kw || txt.includes(kw));
          const defectMatch = (txt, f) => {
            const targetId = cleanStr(f.id);
            const targetLabel = cleanStr(f.label || '');
            const targetFull = cleanStr(f.labelFull || '');
            return txt === targetId || txt === targetLabel || txt === targetFull || txt.includes(targetId) || txt.includes(targetLabel) || txt.includes(targetFull);
          };

          if (headerRowIdx > -1) {
            const rowX = aoa[headerRowIdx] || [];
            const rowY = aoa[headerRowIdx + 1] || [];

            const scanHeaderRow = (row) => {
              for (let c = 0; c < row.length; c++) {
                const txt = cleanStr(row[c]);
                if (!txt) continue;
                if (dateCol < 0 && kwMatch(txt, KW_DATE)) dateCol = c;
                if (enCol < 0 && kwMatch(txt, KW_EN)) enCol = c;
                if (sendCol < 0 && kwMatch(txt, KW_SEND)) sendCol = c;
                if (recvCol < 0 && kwMatch(txt, KW_RECV)) recvCol = c;
                if (fixCol < 0 && kwMatch(txt, KW_FIX)) fixCol = c;
                if (attrCol < 0 && kwMatch(txt, KW_ATTR)) attrCol = c;
                if (vmiCol < 0 && kwMatch(txt, KW_VMI)) vmiCol = c;
                if (remarkCol < 0 && kwMatch(txt, KW_REMARK)) remarkCol = c;
                if (modeCol < 0 && kwMatch(txt, ['mode', 'inspectionmode', 'inspmode'])) modeCol = c;
                if (partnoCol < 0 && kwMatch(txt, KW_PARTNO)) partnoCol = c;
                if (pieceCol < 0 && KW_PIECE.some(kw => txt === kw || txt.startsWith(kw))) pieceCol = c;
                if (!colMap[c]) {
                  allDefectFields.forEach(f => {
                    if (defectMatch(txt, f)) colMap[c] = f.id;
                  });
                }

                if (txt.includes('pt') && txt.includes('bobbin')) {
                  if (ptCol < 0) ptCol = c;
                  if (btcCol < 0) btcCol = c;
                } else {
                  if (ptCol < 0 && kwMatch(txt, KW_PT)) ptCol = c;
                  if (btcCol < 0 && kwMatch(txt, KW_BTC)) btcCol = c;
                }
              }
            };
            scanHeaderRow(rowX);
            scanHeaderRow(rowY);

            if (dateCol < 0) {
              for (let extra = 2; extra <= 4; extra++) {
                const rowExtra = aoa[headerRowIdx + extra] || [];
                scanHeaderRow(rowExtra);
                if (dateCol > -1) break;
              }
            }

            // 🌟 ADVANCED ZONE SCANNING 🌟
            let currentZone = null;
            const maxCol = Math.max(rowX.length, rowY.length);
            for (let c = 0; c < maxCol; c++) {
              const txtX = cleanStr(rowX[c] || '');

              if (txtX.includes('longfantail') || txtX.includes('zonelf') || (txtX.includes('lf') && !txtX.includes('elf') && !txtX.includes('half'))) {
                currentZone = 'z1';
              } else if (txtX.includes('shortfantail') || txtX.includes('zonesf') || (txtX.includes('sf') && !txtX.includes('asf'))) {
                currentZone = 'z2';
              } else if (txtX.includes('zone1') || txtX === 'z1') {
                currentZone = 'z1';
              } else if (txtX.includes('zone2') || txtX === 'z2') {
                currentZone = 'z2';
              } else if (txtX.includes('zone3') || txtX === 'z3') {
                currentZone = 'z3';
              }

              const txtY = cleanStr(rowY[c] || '');
              const defSrc = txtY || txtX;
              if (currentZone && defSrc) {
                if (defSrc.includes('missing') || defSrc.includes('mis') || defSrc.includes('miss')) {
                  colMap[c] = currentZone + '_missing';
                } else if (defSrc.includes('incomplete') || defSrc.includes('inc')) {
                  colMap[c] = currentZone + '_incomplete';
                } else if (defSrc.includes('skip') && !defSrc.includes('skill')) {
                  colMap[c] = currentZone + '_skip';
                } else if (defSrc.includes('width') && !defSrc.includes('wo')) {
                  colMap[c] = currentZone + '_width';
                } else if (defSrc.includes('length') || defSrc.includes('len')) {
                  colMap[c] = currentZone + '_length';
                } else if (defSrc.includes('position') || defSrc.includes('pos')) {
                  colMap[c] = currentZone + '_position';
                }
              }
            }

            const findDataRow = () => {
              for (let r = headerRowIdx + 1; r < Math.min(headerRowIdx + 8, aoa.length); r++) {
                const rowR = aoa[r];
                if (!rowR || !Array.isArray(rowR)) continue;
                const hasDate = dateCol > -1 && rowR[dateCol] && parseDate(rowR[dateCol]);
                const hasEn = enCol > -1 && rowR[enCol] && String(rowR[enCol]).trim().replace(/\D/g, '').length >= 3;
                const hasPiece = pieceCol > -1 && rowR[pieceCol] && String(rowR[pieceCol]).trim() !== '';
                if (hasDate || hasEn || hasPiece) return r;
              }
              return headerRowIdx + 2;
            };

            startRow = findDataRow();
          }

          const parseDefect = (val) => {
            const s = cleanStr(val);
            if (['fail', 'f', 'ng', 'x', '1'].includes(s)) return 'Fail';
            return 'Pass';
          };

          let startRow = headerRowIdx > -1 ? headerRowIdx + 2 : 10;

          for (let i = startRow; i < aoa.length; i++) {
            const row = aoa[i];
            if (!row || !Array.isArray(row)) continue;

            const isEmptyRow = row.every(c => c === '' || c === null || c === undefined);
            if (isEmptyRow) continue;

            const rowContent = row.join(' ').toLowerCase();
            if (rowContent.includes('prepared') || rowContent.includes('checked') || rowContent.includes('approved')) break;
            if (rowContent.includes('zone') || rowContent.includes('fantail')) continue;
            if (rowContent.includes('if found reject') || rowContent.includes('reject part') || rowContent.includes('inform to leader') || rowContent.includes('leader / su')) continue;

            let inlineRemark = '';
            [dateCol, enCol, sendCol, recvCol, fixCol, ptCol, btcCol].forEach(c => {
              if (c > -1 && row[c]) {
                const str = String(row[c]).trim();
                const low = str.toLowerCase();
                if (str.length > 12 && /[a-zA-Zก-๙]/.test(str) && str.includes(' ')) {
                  if (!str.match(/\d{1,2}[:\/\-]\d{1,2}/) && !low.startsWith('pt') && !low.startsWith('btc')) {
                    inlineRemark = str;
                    row[c] = '';
                  }
                }
              }
            });

            if (inlineRemark) {
              lastRemark = inlineRemark;
            } else if (remarkCol > -1 && row[remarkCol]) {
              lastRemark = String(row[remarkCol]).trim();
            }

            // สกัดโหมดจากในตาราง (ถ้ามี) แล้วเขียนทับค่าจากชื่อไฟล์
            if (modeCol > -1 && row[modeCol]) {
              const cellVal = String(row[modeCol]).trim().toLowerCase();
              if (cellVal) lastMode = cellVal.includes('roving') ? 'roving' : 'buyoff';
            }

            // --- 1) ตรวจจับแถว Remark (2nd/4th row ของชุด) ---
            let hasDate = dateCol > -1 && row[dateCol] && String(row[dateCol]).trim() !== '';
            let hasEn = enCol > -1 && row[enCol] && String(row[enCol]).trim() !== '';
            let hasFix = fixCol > -1 && row[fixCol] && String(row[fixCol]).trim() !== '';
            let hasSend = sendCol > -1 && row[sendCol] && String(row[sendCol]).trim() !== '';
            let hasAttr = attrCol > -1 && row[attrCol] && String(row[attrCol]).trim() !== '';
            let hasDefect = false;
            for (let c in colMap) { if (row[c] && String(row[c]).trim() !== '') hasDefect = true; }

            // ถ้าไม่มีข้อมูลหลักๆ เลย (ไม่มี Date, EN, Fix, Send, Attr) และไม่มีค่า Defect check -> เป็นแถว Remark แน่นอน
            if (!hasDate && !hasEn && !hasFix && !hasSend && !hasAttr && !hasDefect) {
              let rowRemark = inlineRemark || (remarkCol > -1 ? String(row[remarkCol] || '').trim() : '');
              if (rowRemark && TEMP_IMPORT_RECORDS.length > 0) {
                const prevRec = TEMP_IMPORT_RECORDS[TEMP_IMPORT_RECORDS.length - 1];
                prevRec.remark = prevRec.remark ? (prevRec.remark + ' | ' + rowRemark) : rowRemark;
              }
              continue; // ข้ามการสร้าง record ใหม่
            }

            let pieceStr = pieceCol > -1 ? String(row[pieceCol] || '').trim() : '';
            if (pieceStr.startsWith('=')) pieceStr = '';
            let parsedNum = parseInt(pieceStr);

            if (isNaN(parsedNum) || parsedNum <= 0) {
              if (lastDraftIndex === 0) parsedNum = 1;
              else if (lastDraftIndex < 30) parsedNum = lastDraftIndex + 1;
              else continue;
            }
            let pieceNum = parsedNum;
            lastDraftIndex = pieceNum;

            const isShiftLabel = (v) => /^[ABC]\/(night|day|eve)/i.test(String(v).trim());

            if (dateCol > -1 && row[dateCol]) {
              const cellVal = row[dateCol];
              if (cellVal && String(cellVal).trim() !== '' && !isShiftLabel(cellVal)) {
                const parsed = parseDate(cellVal);
                if (parsed) lastDate = parsed;
              }
            }

            if (enCol > -1 && row[enCol]) {
              let cellVal = String(row[enCol]).trim();
              if (cellVal && cellVal !== '' && !/^[=\-_]+$/.test(cellVal)) {
                cellVal = cellVal.replace(/\D/g, '');
                if (cellVal.length > 5) cellVal = cellVal.slice(0, 5);
                else if (cellVal.length > 0) cellVal = cellVal.padStart(5, '0');
                if (cellVal) lastEn = cellVal;
              }
            }

            if (sendCol > -1 && row[sendCol]) {
              const cellVal = row[sendCol];
              if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
                const parsed = parseTime(cellVal);
                if (parsed) lastSend = parsed;
              }
            }

            if (recvCol > -1 && row[recvCol]) {
              const cellVal = row[recvCol];
              if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
                const parsed = parseTime(cellVal);
                if (parsed) lastRecv = parsed;
              }
            }

            if (fixCol > -1) {
              const raw = row[fixCol];
              const cellVal = (raw !== undefined && raw !== null) ? String(raw).trim() : '';
              if (cellVal !== '' && !/^[=\-_]+$/.test(cellVal)) lastFix = cellVal;
            }

            if (partnoCol > -1) {
              const raw = row[partnoCol];
              const cellVal = (raw !== undefined && raw !== null) ? String(raw).trim() : '';
              if (cellVal !== '' && !/^[=\-_]+$/.test(cellVal)) partNumber = cellVal;
            }

            if (ptCol > -1) {
              const raw = row[ptCol];
              const cellVal = (raw !== undefined && raw !== null) ? String(raw).trim() : '';
              if (cellVal !== '' && !/^[=\-_]+$/.test(cellVal)) lastPt = cellVal;
            }

            if (btcCol > -1) {
              const raw = row[btcCol];
              const cellVal = (raw !== undefined && raw !== null) ? String(raw).trim() : '';
              if (cellVal !== '' && !/^[=\-_]+$/.test(cellVal)) lastBtc = cellVal;
            }

            if (attrCol > -1 && row[attrCol]) {
              const attrStr = String(row[attrCol]).trim();
              if (attrStr && !/^[=\-_\s]+$/.test(attrStr)) lastAttr = attrStr;
            }

            let nextId = (typeof DB !== 'undefined' && DB.nextId) ? (DB.nextId + TEMP_IMPORT_RECORDS.length) : (Date.now() + TEMP_IMPORT_RECORDS.length);
            const effectiveQty = getProductQty(productKey, type) || getDefaultQtyByType(type);

            let finalLot = type === 'Bobbin' ? (lastBtc || lastPt) : (lastPt || lastBtc);

            const rec = {
              id: nextId, ts: new Date().toISOString(), source: 'import',
              date: lastDate, en: lastEn, sendtime: lastSend, recvtime: lastRecv,
              fixture: lastFix, ptno: finalLot, attr: lastAttr, machine: machine,
              product: productKey, partno: partNumber, type: type,
              qty: effectiveQty ? effectiveQty + ' pcs / Fixture / Shift' : '',
              remark: lastRemark, vmi: 'Pass',
              // ผสมผสาน: ถ้า Force Mode ไม่ใช่ Auto ให้ยึด Force ถ้าใช่ให้ยึดจากตาราง (หรือชื่อไฟล์)
              mode: forceMode !== 'auto' ? forceMode : lastMode,
              draftIndex: pieceNum, no: pieceNum,
            };

            if (!sanitizeAndValidate(rec)) {
              continue;
            }

            for (let c in colMap) {
              rec[colMap[c]] = parseDefect(row[c]);
            }

            if (vmiCol > -1 && row[vmiCol]) {
              let vmiVal = String(row[vmiCol]).toLowerCase();
              if (vmiVal.includes('fail') || vmiVal.includes('ng')) rec.vmi = 'Fail';
              else if (vmiVal.includes('hold')) rec.vmi = 'Hold';
              else rec.vmi = 'Pass';
            }

            let hasFail = false;
            if (typeof DEFECT_FIELDS !== 'undefined') {
              DEFECT_FIELDS.forEach(f => { if (rec[f.id] === 'Fail') hasFail = true; });
            }
            if (rec.vmi === 'Fail') hasFail = true;
            rec.overall = hasFail ? 'Fail' : (rec.vmi === 'Hold' ? 'Hold' : 'Pass');

            TEMP_IMPORT_RECORDS.push(rec);
          }

        } else {
          // =================================================================
          // --- 3. PARSE STANDARD FORMAT (ข้อมูลธรรมดา) ---
          // รองรับ Excel header ที่มีทั้ง English + ภาษาไทย + newline
          // เช่น "Missing\nมีด้านเดียว", "Width\nความกว้าง", "Skip\nไม่มีเลย"
          // รวมถึงการตรวจจับ Zone (LF/SF → z1/z2, Zone 1-3 → z1/z2/z3)
          // และกรอง Rosewood 5D ออกทั้งหมด
          // =================================================================
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (rows.length) {
            let carryDate = '', carryType = '', carryProdRaw = '', carryPart = '', carryMc = '';
            let carryEn = '', carrySend = '', carryRecv = '', carryFix = '', carryAttr = 'Normal', carryRemark = '';
            let carryPt = '', carryBtc = '';

            // -----------------------------------------------------------------
            // HELPER: normalizeHeaderKey
            // แปลง Excel header ที่ซับซ้อน (bilingual + newline + zone prefix)
            // ให้กลายเป็น defect key มาตรฐาน เช่น "z1_missing", "z2_width"
            // คืนค่า: { zonePrefix: 'z1'|'z2'|'z3'|null, defectKey: string|null }
            // -----------------------------------------------------------------
            const normalizeHeaderKey = (rawHeader) => {
              if (rawHeader === undefined || rawHeader === null) return { zonePrefix: null, defectKey: null };

              // 1. เอาเฉพาะบรรทัดแรก (ตัด newline ทิ้ง) แล้ว lowercase + trim
              const firstLine = String(rawHeader).split(/\r?\n/)[0].trim().toLowerCase();

              // 2. ตรวจหา Zone / Fantail prefix ใน header
              //    รูปแบบที่รองรับ:
              //    "lf missing", "sf width", "long fantail skip",
              //    "short fantail incomplete", "zone1 width", "z1 length",
              //    "zone 1 position", "z 2 skip"
              let zonePrefix = null;
              let remainder = firstLine;

              const ZONE_PATTERNS = [
                { re: /^(?:lf|long\s*fantail)\s+(.+)/, zone: 'z1' },
                { re: /^(?:sf|short\s*fantail)\s+(.+)/, zone: 'z2' },
                { re: /^(?:zone\s*1|z\s*1|z1)\s+(.+)/, zone: 'z1' },
                { re: /^(?:zone\s*2|z\s*2|z2)\s+(.+)/, zone: 'z2' },
                { re: /^(?:zone\s*3|z\s*3|z3)\s+(.+)/, zone: 'z3' },
              ];

              for (const { re, zone } of ZONE_PATTERNS) {
                const m = firstLine.match(re);
                if (m) {
                  zonePrefix = zone;
                  remainder = m[1].trim();
                  break;
                }
              }

              // ถ้าไม่มี zone prefix → ลองว่า header ตรงกับ DEFECT_FIELDS id โดยตรง
              // เช่น "z1_missing", "z2_width" ที่เป็น clean header อยู่แล้ว
              if (!zonePrefix) {
                const directId = firstLine.replace(/\s+/g, '_');
                if (typeof DEFECT_FIELDS !== 'undefined') {
                  const directMatch = DEFECT_FIELDS.find(f => f.id === directId);
                  if (directMatch) return { zonePrefix: null, defectKey: directMatch.id };
                }
                // Bent Wire Slot: ไม่มี zone prefix (ไม่ใช่ LF/SF) — ตรวจจับตรงจาก keyword
                if (firstLine.includes('bentwire') || firstLine.includes('bent wire') || firstLine.includes('สายไฟงอ') || firstLine.includes('ลวดงอ')) {
                  return { zonePrefix: null, defectKey: 'bentwire' };
                }
              }

              // 3. Normalize ชื่อ defect จาก remainder
              //    รองรับทั้ง English variants และ Thai variants
              const DEFECT_KEYWORD_MAP = {
                'missing': 'missing',
                'incomplete': 'incomplete',
                'skip': 'skip',
                'width': 'width',
                'length': 'length',
                'position': 'position',
                // Thai equivalents
                'มีด้านเดียว': 'missing',
                'ไม่สมบูรณ์': 'incomplete',
                'ไม่มีเลย': 'skip',
                'ความกว้าง': 'width',
                'ความยาว': 'length',
                'ตำแหน่ง': 'position',
              };

              let defectId = null;
              for (const [kw, id] of Object.entries(DEFECT_KEYWORD_MAP)) {
                if (remainder === kw || remainder.startsWith(kw) || remainder.includes(kw)) {
                  defectId = id;
                  break;
                }
              }

              // ถ้ามี zonePrefix + defectId ครบ → คืน combined key
              if (zonePrefix && defectId) {
                return { zonePrefix, defectKey: `${zonePrefix}_${defectId}` };
              }

              // ถ้ามีแค่ zonePrefix แต่ไม่รู้ defect → ใช้ remainder เป็น fallback
              if (zonePrefix && remainder) {
                const fallbackKey = `${zonePrefix}_${remainder.replace(/\s+/g, '_')}`;
                return { zonePrefix, defectKey: fallbackKey };
              }

              return { zonePrefix: null, defectKey: null };
            };

            // -----------------------------------------------------------------
            // HELPER: buildNormalizedHeaderMap
            // วิเคราะห์ทุก key ใน rows[0] แล้วสร้าง mapping:
            //   originalHeader → normalizedDefectKey (เช่น "z1_missing")
            // เพื่อให้ loop หลักใช้งาน bilingual / newline header ได้ถูกต้อง
            // -----------------------------------------------------------------
            const buildNormalizedHeaderMap = (sampleRow) => {
              const map = {}; // originalHeader → defectKey
              for (const rawKey of Object.keys(sampleRow)) {
                const { defectKey } = normalizeHeaderKey(rawKey);
                if (defectKey) {
                  const isKnownField = typeof DEFECT_FIELDS !== 'undefined'
                    ? DEFECT_FIELDS.some(f => f.id === defectKey)
                    : true;
                  if (isKnownField) map[rawKey] = defectKey;
                }
              }
              return map;
            };

            // สร้าง normalized header map ครั้งเดียวจาก row แรก
            const normalizedHeaderMap = rows.length > 0
              ? buildNormalizedHeaderMap(rows[0])
              : {};

            // -----------------------------------------------------------------
            // HELPER: cleanRow — ลบ apostrophe prefix/suffix และ trim whitespace
            // -----------------------------------------------------------------
            const cleanRow = (r) => {
              const out = {};
              for (const k in r) {
                const cleanKey = k.replace(/^'*/, '').replace(/'*$/, '').trim();
                out[cleanKey] = (typeof r[k] === 'string')
                  ? r[k].replace(/^'*/, '').replace(/'*$/, '').trim()
                  : r[k];
              }
              return out;
            };

            // -----------------------------------------------------------------
            // HELPER: parseDefectStd — แปลงค่า cell เป็น Pass / Fail / Hold
            // -----------------------------------------------------------------
            const parseDefectStd = (val) => {
              const s = String(val || '').toLowerCase().trim();
              if (['fail', 'f', 'ng', 'x', '1'].includes(s)) return 'Fail';
              if (s === 'hold') return 'Hold';
              return 'Pass';
            };

            // =================================================================
            // MAIN ROW LOOP
            // =================================================================
            for (let idx = 0; idx < rows.length; idx++) {
              const rawRow = rows[idx];
              const row = cleanRow(rawRow);

              // ── pick helper: คืนค่าแรกที่ไม่ว่างเปล่าจาก key list ──
              const pick = (...keys) => {
                for (const k of keys) {
                  const v = row[k];
                  if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
                }
                return '';
              };

              // ── ดึงข้อมูล header fields มาตรฐาน ──
              let curDate = pick('Date', 'date', 'DATE', 'วันที่', 'Inspection Date');
              let curEn = pick('EN#', 'EN #', 'EN', 'en', 'En', 'EmpNo', 'Emp No', 'Operator', 'OPERATOR', 'operator', 'รหัสพนักงาน', 'เบอร์พนักงาน', 'OP', 'OP#');
              let curSend = pick('Sending Time', 'Send Time', 'SendTime', 'sendtime', 'SENDTIME', 'เวลาส่ง', 'Time In', 'Timein');
              let curRecv = pick('Receive Time', 'Recv Time', 'RecvTime', 'recvtime', 'RECVTIME', 'เวลารับ', 'Time Out', 'Timeout');
              let curFix = pick('Fixture', 'fixture', 'FIXTURE', 'Fix', 'Fix No', 'FixNo', 'Jig', 'jig', 'จิ๊ก', 'ฟิกเจอร์');
              let curMc = pick('Machine', 'machine', 'MACHINE', 'Machine No.', 'MachineNo', 'M/C', 'MC', 'MC No.', 'เครื่อง');
              let curProd = pick('Product', 'product', 'MODEL', 'Model', 'Part Name') || extractModelName(file.name);
              let curPart = pick('Part Number', 'Part No.', 'PartNo', 'partno', 'PARTNO', 'Part no', 'part number', 'PN', 'P/N');
              let curAttr = pick('Attribute', 'attribute', 'ATTR', 'Buy-Off Type', 'BuyOffType', 'Buyoff');
              let curRemark = pick('Remark', 'remark', 'Note', 'note', 'Comment', 'comment', 'หมายเหตุ');
              let curPt = pick('PT No.', 'PTNo', 'ptno', 'PT', 'pt', 'PT Number', 'ptstore', 'PT Machine');
              let curBtc = pick('BTC No.', 'BTCNo', 'btcno', 'BTC', 'btc', 'Bobbin Lot', 'BobbinLot', 'Bobbin No.', 'Store Lot', 'สต็อก', 'bobbin', 'BTC Machine');
              let curComb = pick('PT/Bobbin Store lot', 'PT/Bobbin', 'PT Bobbin', 'Machine / PT');
              if (curComb) { curPt = curComb; curBtc = curComb; }

              // ── ป้องกัน field ยาวๆ ถูกแปลผิดเป็น remark ──
              [curDate, curEn, curMc, curFix, curPt, curBtc].forEach(str => {
                const low = (str || '').toLowerCase();
                if (str && str.length > 12 && /[a-zA-Zก-๙]/.test(str) && str.includes(' ')) {
                  if (!str.match(/\d{1,2}[:\/\-]\d{1,2}/) && !low.startsWith('pt') && !low.startsWith('btc')) {
                    curRemark = str;
                    if (str === curDate) curDate = '';
                    if (str === curEn) curEn = '';
                    if (str === curMc) curMc = '';
                    if (str === curFix) curFix = '';
                    if (str === curPt) curPt = '';
                    if (str === curBtc) curBtc = '';
                  }
                }
              });

              // ── Normalize EN# ──
              if (curEn) {
                curEn = curEn.replace(/\D/g, '');
                if (curEn.length > 5) curEn = curEn.slice(0, 5);
                else if (curEn.length > 0) curEn = curEn.padStart(5, '0');
              }

              // ── Carry-forward logic ──
              if (!curDate && carryDate) curDate = carryDate; else carryDate = curDate;
              if (!curEn && carryEn) curEn = carryEn; else carryEn = curEn;
              if (!curMc && carryMc) curMc = carryMc; else carryMc = curMc;
              if (!curFix && carryFix) curFix = carryFix; else carryFix = curFix;
              if (!curSend && carrySend) curSend = carrySend; else carrySend = curSend;
              if (!curRecv && carryRecv) curRecv = carryRecv; else carryRecv = curRecv;
              if (!curAttr && carryAttr) curAttr = carryAttr; else carryAttr = curAttr || 'Normal';
              if (!curRemark && carryRemark) curRemark = carryRemark; else carryRemark = curRemark;
              if (!curPt && carryPt) curPt = carryPt; else carryPt = curPt;
              if (!curBtc && carryBtc) curBtc = carryBtc; else carryBtc = curBtc;

              // ── Product & Type ──
              const rawProd = (curProd || '').toLowerCase().trim();
              const prodKey = findProductKey(rawProd);
              let type = pick('Type', 'type', 'TYPE');
              if (!type) {
                if (PRODUCTS[prodKey] && PRODUCTS[prodKey].type) type = PRODUCTS[prodKey].type;
                else if (file.name.toLowerCase().includes('bobbin') || prodKey.includes('dorado') || prodKey.includes('marlin')) type = 'Bobbin';
                else type = 'Epoch';
              }

              // ── FILTER: ตัด Rosewood 5D ออกทั้งหมด ห้าม push เข้า TEMP_IMPORT_RECORDS ──
              const prodLabel = PRODUCTS[prodKey] ? PRODUCTS[prodKey].label : rawProd;
              const isRosewood5D = (
                cleanStr(rawProd).includes('rosewood5d') ||
                cleanStr(rawProd).replace(/\s/g, '').includes('rosewood5d') ||
                cleanStr(prodLabel).replace(/\s/g, '').includes('rosewood5d') ||
                prodKey === 'rosewood5d'
              );
              if (isRosewood5D) {
                console.warn(`[Import] Skipped row idx=${idx}: Rosewood 5D is excluded from import.`);
                continue;
              }

              // ── Draft Index / Piece Number ──
              let finalPieceNum = Number(pick('Draft Index', 'No.', 'no.', 'No', 'no', 'Item', 'item', 'Seq', 'ลำดับ', 'ลำดับที่'));
              if (isNaN(finalPieceNum) || finalPieceNum <= 0) finalPieceNum = 1;

              // ── ID & Lot ──
              const nextId = (typeof DB !== 'undefined' && DB.nextId)
                ? (DB.nextId + TEMP_IMPORT_RECORDS.length)
                : (Date.now() + TEMP_IMPORT_RECORDS.length);
              const finalLot = type === 'Bobbin' ? (curBtc || curPt) : (curPt || curBtc);

              // ── Mode detection ──
              const cellModeStr = pick('Mode', 'mode', 'InspMode', 'inspectionmode').toLowerCase();
              const currentCellMode = cellModeStr
                ? (cellModeStr.includes('roving') ? 'roving' : 'buyoff')
                : modeFromFileName;

              // ── Build record ──
              const rec = {
                id: nextId,
                ts: new Date().toISOString(),
                source: 'import',
                date: curDate,
                type: type,
                product: prodKey || rawProd,
                // เก็บ label เดิมไว้ด้วยเพื่อ fallback display เมื่อ key ไม่ match PRODUCTS
                productLabel: PRODUCTS[prodKey] ? PRODUCTS[prodKey].label : (rawProd || ''),
                product_label: PRODUCTS[prodKey] ? PRODUCTS[prodKey].label : (rawProd || ''),
                partno: curPart,
                qty: pick('Quantity', 'qty', 'QTY', 'Qty'),
                machine: curMc,
                en: curEn,
                sendtime: curSend,
                recvtime: curRecv,
                fixture: curFix,
                ptno: finalLot,
                attr: curAttr,
                vmi: pick('VMI Disposition', 'VMI', 'vmi', 'Vmi') || 'Pass',
                remark: curRemark,
                mode: forceMode !== 'auto' ? forceMode : currentCellMode,
                draftIndex: finalPieceNum,
                no: finalPieceNum,
              };

              // ── Validate ──
              if (!sanitizeAndValidate(rec)) continue;

              // ── DEFECT EXTRACTION — 3-Pass Strategy ──
              //
              // Pass A: normalizedHeaderMap (bilingual / newline headers)
              //         วน loop ทุก original header ที่ map ไว้แล้ว
              //         ใช้ rawRow เพื่อ bypass cleanRow key collision
              for (const [origHeader, defectKey] of Object.entries(normalizedHeaderMap)) {
                const rawVal = rawRow[origHeader];
                if (rawVal !== undefined && rawVal !== null) {
                  rec[defectKey] = parseDefectStd(rawVal);
                }
              }

              // Pass B: DEFECT_FIELDS label / labelShort / id (clean header fallback)
              if (typeof DEFECT_FIELDS !== 'undefined') {
                DEFECT_FIELDS.forEach(f => {
                  if (rec[f.id] !== undefined) return; // Pass A ได้แล้ว — ข้ามไป
                  const v = pick(f.label, f.labelShort || '', f.id);
                  if (v !== '') rec[f.id] = parseDefectStd(v);
                });
              }

              // Pass C: DEFECT_FIELDS_LEGACY (LF/SF key เก่า → map เป็น z1/z2)
              if (typeof DEFECT_FIELDS_LEGACY !== 'undefined') {
                DEFECT_FIELDS_LEGACY.forEach(f => {
                  const v = pick(f.label, f.id);
                  if (v !== '') {
                    const mappedId = f.id
                      .replace(/^lf_/, 'z1_')
                      .replace(/^sf_/, 'z2_');
                    if (!rec[mappedId]) rec[mappedId] = parseDefectStd(v);
                  }
                });
              }

              // ── Overall result ──
              const hasFail = (typeof DEFECT_FIELDS !== 'undefined')
                ? DEFECT_FIELDS.some(f => rec[f.id] === 'Fail') || rec.vmi === 'Fail'
                : rec.vmi === 'Fail';

              rec.overall = pick('Overall', 'overall') ||
                (hasFail ? 'Fail' : (rec.vmi === 'Hold' ? 'Hold' : 'Pass'));

              TEMP_IMPORT_RECORDS.push(rec);
            }
          }
        }

      } catch (err) {
        console.error("IMPORT ERROR:", err);
        if (typeof showToast === 'function') {
          showToast('เกิดข้อผิดพลาด (ไฟล์: ' + file.name + '): ' + err.message, 'error');
        } else {
          alert('Error: ' + err.message);
        }
      } finally {
        filesProcessed++;
        if (filesProcessed === files.length) {
          event.target.value = '';
          if (TEMP_IMPORT_RECORDS.length > 0) {
            if (typeof renderImportPreview === 'function') renderImportPreview();
          } else {
            if (typeof showToast === 'function') {
              showToast('อ่านไฟล์สำเร็จ แต่ไม่พบข้อมูล (รูปแบบอาจไม่ตรง)', 'warn');
            } else {
              alert('ไม่พบข้อมูลที่จะ Import รูปแบบอาจไม่ตรง');
            }
          }
        }
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
// ฟังก์ชันสร้างหน้าต่าง Preview 
function renderImportPreview() {
  document.getElementById('drop-zone').style.display = 'none';
  document.getElementById('preview-zone').style.display = 'block';
  document.getElementById('preview-count').textContent = TEMP_IMPORT_RECORDS.length;

  const tbody = document.getElementById('preview-tbody');
  tbody.innerHTML = TEMP_IMPORT_RECORDS.map((r, idx) => {
    const pLabel = PRODUCTS[r.product] ? PRODUCTS[r.product].label : (r.product || '—');
    const fails = DEFECT_FIELDS.filter(f => r[f.id] === 'Fail').map(f => f.labelShort || f.label);
    if (r.z1_missing === 'Fail') fails.unshift('Z1 Missing');
    if (r.z2_missing === 'Fail') fails.unshift('Z2 Missing');
    if (r.vmi === 'Fail') fails.push('VMI');

    const defectTxt = fails.length > 0
      ? fails.map(d => `<span style="background:var(--fail-bg);color:var(--fail);padding:2px 6px;border-radius:4px;font-size:10px;margin-right:2px;font-weight:600">${d}</span>`).join('')
      : '<span style="color:var(--text3);font-size:11px;">No Defects</span>';

    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px;white-space:nowrap;font-size:12px">${r.date || '—'}</td>
      <td style="padding:10px"><div style="font-weight:700;font-size:13px">${pLabel}</div><div style="font-size:10px;color:var(--text3)">${r.type || 'Epoch'}</div></td>
      <td style="padding:10px;font-size:12px">
        <div>${r.machine || '—'}</div>
        <div style="font-size:10px;color:var(--text3)">${r.ptno || ''}</div>
      </td>
      <td style="padding:10px;font-weight:600;font-size:13px">${r.en || '—'}</td>
      <td style="padding:10px;font-weight:700;color:var(--purple);font-size:13px">${r.draftIndex ? '#' + r.draftIndex : '—'}</td>
      <td style="padding:10px">${defectTxt}</td>
      <td style="padding:10px">${pfPill(r.overall)}</td>
      <td style="padding:10px">
        <button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:11px" onclick="viewImportDetail(${idx})">
          ดู
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ดูรายละเอียด record ใน Preview (ก่อน confirm import)
function viewImportDetail(idx) {
  const rec = TEMP_IMPORT_RECORDS[idx];
  if (!rec) return;

  // สร้าง temp record ที่มี id ชั่วคราว แล้ว push เข้า DB ชั่วคราว → เรียก viewDetail → ลบออก
  // วิธีนี้ reuse viewDetail ได้เลย 100%
  const tempId = -9999 - idx; // ใช้ id ติดลบเพื่อไม่ชนกับของจริง
  const tempRec = { ...rec, id: tempId };

  // เพิ่มเข้า DB ชั่วคราว
  DB.records.push(tempRec);
  viewDetail(tempId);
  // ลบออกทันทีหลัง modal เปิด (viewDetail ไม่ async)
  DB.records = DB.records.filter(r => r.id !== tempId);
}

// ฟังก์ชันกดยืนยันการนำเข้า
function confirmImport() {
  if (TEMP_IMPORT_RECORDS.length === 0) return;

  // รันระบบแจ้งเตือน Alert
  TEMP_IMPORT_RECORDS.forEach(rec => {
    rec.id = DB.nextId++; // กำหนด Id จริง
    // Normalize key fields to match About Data types
    rec.date = normalizeDate(rec.date);
    rec.en = normalizeEN(rec.en);
    rec.sendtime = normalizeTime(rec.sendtime);
    rec.recvtime = normalizeTime(rec.recvtime);
    rec.vmi = (rec.vmi ? (normalizeDefect(rec.vmi) === 'Hold' ? 'Hold' : (normalizeDefect(rec.vmi) === 'Fail' ? 'Fail' : 'Pass')) : 'Pass');
    // Normalize defect fields
    if (typeof DEFECT_FIELDS !== 'undefined') {
      DEFECT_FIELDS.forEach(f => { if (rec[f.id] !== undefined) rec[f.id] = normalizeDefect(rec[f.id]); });
    }
    if (rec.z1_missing !== undefined) rec.z1_missing = normalizeDefect(rec.z1_missing);
    if (rec.z2_missing !== undefined) rec.z2_missing = normalizeDefect(rec.z2_missing);

    DB.records.push(rec);
    checkAndAlert(rec, false);
  });

  saveDB();
  updateDashboard();
  renderAboutTable();

  showToast(`Import สำเร็จรวม ${TEMP_IMPORT_RECORDS.length} records`, 'success');

  // เคลียร์ค่ากลับสู่หน้าจอปกติ และไปที่แท็บ About Data
  cancelImport();
  switchTab('about', document.querySelectorAll('.nav-btn')[2]);
}

// ฟังก์ชันกดยกเลิก
function cancelImport() {
  TEMP_IMPORT_RECORDS = [];
  document.getElementById('drop-zone').style.display = 'block';
  document.getElementById('preview-zone').style.display = 'none';
  document.getElementById('preview-tbody').innerHTML = '';
}

// ========================
// ALERT LOG (stub — see full implementation below)
// ========================

// ========================
// VISUALIZATION
// ========================
const CHART_COLORS = {
  primary: 'rgba(232,51,58,0.85)', primaryBorder: 'rgba(232,51,58,1)',
  secondary: 'rgba(45,156,219,0.85)', tertiary: 'rgba(245,166,35,0.85)',
  pass: 'rgba(39,174,96,0.85)', fail: 'rgba(231,76,60,0.85)',
  hold: 'rgba(243,156,18,0.85)', text: '#374151', grid: '#E5E7EB',
};

function renderViz() {
  const vpEl = document.getElementById('viz-product');
  const fProduct = vpEl ? vpEl.value : '';
  let recs = fProduct ? DB.records.filter(r => r.product === fProduct) : [...DB.records];
  renderDefectChart(recs); renderPFChart(recs); renderTrendChart(recs);
  renderProductYieldChart(); renderDefectTypeChart(recs); renderMachineChart(recs);
}

function renderDefectChart(recs) {
  const defectTypes = ['skip', 'incomplete', 'width', 'length', 'position'];
  const labels = ['Skip', 'Incomplete', 'Width', 'Length', 'Position'];
  const z1Data = defectTypes.map(d => recs.filter(r => r[`z1_${d}`] === 'Fail').length);
  const z2Data = defectTypes.map(d => recs.filter(r => r[`z2_${d}`] === 'Fail').length);
  const z3Data = defectTypes.map(d => recs.filter(r => r[`z3_${d}`] === 'Fail').length);
  const canvas = document.getElementById('chart-defect');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartDefect) chartDefect.destroy();
  chartDefect = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Zone 1 / LF', data: z1Data, backgroundColor: CHART_COLORS.secondary, borderRadius: 4 },
        { label: 'Zone 2 / SF', data: z2Data, backgroundColor: CHART_COLORS.tertiary, borderRadius: 4 },
        { label: 'Zone 3', data: z3Data, backgroundColor: CHART_COLORS.primary, borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: CHART_COLORS.text } } },
      scales: {
        x: { stacked: false, grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } },
        y: { beginAtZero: true, grid: { color: CHART_COLORS.grid }, ticks: { stepSize: 1, color: CHART_COLORS.text }, title: { display: true, text: 'จำนวน (ชิ้น)', color: CHART_COLORS.text } },
      },
    },
  });
}

function renderDefectTypeChart(recs) {
  const canvas = document.getElementById('chart-pareto');
  if (!canvas) return;
  const defectTypes = ['skip', 'incomplete', 'width', 'length', 'position'];
  const defectLabels = ['Skip', 'Incomplete', 'Width', 'Length', 'Position'];
  const counts = defectTypes.map(d => recs.filter(r => r[`z1_${d}`] === 'Fail' || r[`z2_${d}`] === 'Fail' || r[`z3_${d}`] === 'Fail').length);
  const paired = defectLabels.map((l, i) => ({ l, c: counts[i] })).sort((a, b) => b.c - a.c);
  const total = paired.reduce((s, p) => s + p.c, 0);
  let cumPct = 0;
  const cumData = paired.map(p => { cumPct += total ? (p.c / total * 100) : 0; return parseFloat(cumPct.toFixed(1)); });

  if (chartPareto) chartPareto.destroy();
  chartPareto = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: paired.map(p => p.l),
      datasets: [
        { label: 'จำนวน Defect', data: paired.map(p => p.c), backgroundColor: CHART_COLORS.secondary, borderRadius: 4, yAxisID: 'y' },
        { label: 'สะสม %', data: cumData, type: 'line', borderColor: CHART_COLORS.primaryBorder, pointRadius: 4, fill: false, tension: 0.3, yAxisID: 'y2' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: CHART_COLORS.text } } },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } },
        y: { beginAtZero: true, grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text }, title: { display: true, text: 'จำนวน', color: CHART_COLORS.text } },
        y2: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'สะสม %', color: CHART_COLORS.text }, ticks: { callback: v => v + '%', color: CHART_COLORS.text } },
      },
    },
  });
}

function renderMachineChart(recs) {
  const canvas = document.getElementById('chart-machine');
  if (!canvas) return;
  const machines = {};
  recs.forEach(r => {
    if (!r.machine) return;
    if (!machines[r.machine]) machines[r.machine] = { total: 0, fail: 0 };
    machines[r.machine].total++;
    if (r.overall === 'Fail') machines[r.machine].fail++;
  });
  const mKeys = Object.keys(machines);
  if (mKeys.length === 0) { canvas.parentElement.style.display = 'none'; return; }
  canvas.parentElement.style.display = '';
  const yields = mKeys.map(m => machines[m].total ? parseFloat(((1 - machines[m].fail / machines[m].total) * 100).toFixed(1)) : 100);
  if (chartMachine) chartMachine.destroy();
  chartMachine = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: mKeys, datasets: [{ label: 'Yield % by Machine', data: yields, backgroundColor: yields.map(y => y >= 95 ? CHART_COLORS.pass : y >= 80 ? CHART_COLORS.hold : CHART_COLORS.fail), borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } }, y: { beginAtZero: true, max: 100, grid: { color: CHART_COLORS.grid }, ticks: { callback: v => v + '%', color: CHART_COLORS.text } } } },
  });
}

function renderPFChart(recs) {
  const pass = recs.filter(r => r.overall === 'Pass').length;
  const fail = recs.filter(r => r.overall === 'Fail').length;
  const hold = recs.filter(r => r.overall === 'Hold').length;
  const total = pass + fail + hold;
  const canvas = document.getElementById('chart-pf');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartPF) chartPF.destroy();
  chartPF = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [
        `Pass (${total ? ((pass / total) * 100).toFixed(1) : 0}%)`,
        `Fail (${total ? ((fail / total) * 100).toFixed(1) : 0}%)`,
        `Hold (${total ? ((hold / total) * 100).toFixed(1) : 0}%)`,
      ],
      datasets: [{ data: [pass || 0.001, fail, hold], backgroundColor: [CHART_COLORS.pass, CHART_COLORS.fail, CHART_COLORS.hold], borderWidth: 2, borderColor: '#fff' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: CHART_COLORS.text } }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw === 0.001 ? 0 : ctx.raw} ชิ้น` } } } },
  });
}

function renderTrendChart(recs) {
  const byDate = {};
  recs.forEach(r => {
    if (!r.date) return;
    if (!byDate[r.date]) byDate[r.date] = { total: 0, fail: 0, pass: 0 };
    byDate[r.date].total++;
    if (r.overall === 'Fail') byDate[r.date].fail++;
    else if (r.overall === 'Pass') byDate[r.date].pass++;
  });
  const dates = Object.keys(byDate).sort();
  const yieldData = dates.map(d => byDate[d].total ? parseFloat(((byDate[d].pass / byDate[d].total) * 100).toFixed(1)) : null);
  const canvas = document.getElementById('chart-trend');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        { label: 'Total', data: dates.map(d => byDate[d].total), borderColor: CHART_COLORS.secondary, backgroundColor: 'rgba(45,156,219,0.1)', fill: true, tension: 0.3, pointRadius: 4, yAxisID: 'y' },
        { label: 'Fail', data: dates.map(d => byDate[d].fail), borderColor: CHART_COLORS.primaryBorder, backgroundColor: 'rgba(232,51,58,0.1)', fill: true, tension: 0.3, pointRadius: 4, yAxisID: 'y' },
        { label: 'Yield %', data: yieldData, borderColor: CHART_COLORS.pass, borderDash: [5, 3], pointRadius: 4, tension: 0.3, fill: false, yAxisID: 'y2' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: CHART_COLORS.text } } },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text }, title: { display: true, text: 'จำนวน', color: CHART_COLORS.text } },
        y2: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Yield %', color: CHART_COLORS.text }, ticks: { callback: v => v + '%', color: CHART_COLORS.text } },
      },
    },
  });
}

function renderProductYieldChart() {
  const productKeys = Object.keys(PRODUCTS);
  const filteredProds = productKeys.filter(k => DB.records.some(r => r.product === k));
  const filteredYields = filteredProds.map(k => {
    const recs = DB.records.filter(r => r.product === k);
    if (!recs.length) return null;
    const pass = recs.filter(r => r.overall === 'Pass').length;
    return parseFloat(((pass / recs.length) * 100).toFixed(1));
  });
  const counts = filteredProds.map(k => DB.records.filter(r => r.product === k).length);
  const canvas = document.getElementById('chart-product-yield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartProductYield) chartProductYield.destroy();
  chartProductYield = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: filteredProds.map(k => PRODUCTS[k].label),
      datasets: [
        { label: 'Yield %', data: filteredYields, backgroundColor: filteredYields.map(y => y === null ? 'rgba(200,200,200,0.3)' : y >= 95 ? CHART_COLORS.pass : y >= 80 ? CHART_COLORS.hold : CHART_COLORS.fail), borderRadius: 4, yAxisID: 'y' },
        { label: 'จำนวน (ชิ้น)', data: counts, backgroundColor: 'rgba(45,156,219,0.2)', borderColor: CHART_COLORS.secondary, borderWidth: 1.5, borderRadius: 4, type: 'bar', yAxisID: 'y2' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: CHART_COLORS.text } } },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, font: { size: 10 }, maxRotation: 30 } },
        y: { beginAtZero: true, max: 100, grid: { color: CHART_COLORS.grid }, title: { display: true, text: 'Yield %', color: CHART_COLORS.text }, ticks: { callback: v => v + '%', color: CHART_COLORS.text } },
        y2: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: CHART_COLORS.text }, title: { display: true, text: 'จำนวน', color: CHART_COLORS.text } },
      },
    },
  });
}

// ========================
// INIT
// ========================
function init() {
  loadConfig();
  fetchDynamicProducts();
  loadDB();
  setupDropZone();

  const today = new Date();
  const dateEl = document.getElementById('m-date');
  if (dateEl) dateEl.value = today.toISOString().slice(0, 10);

  const recvEl = document.getElementById('m-recvtime');
  if (recvEl) recvEl.value = today.toTimeString().slice(0, 5);

  // Make sure records are sorted newest first by default on init
  _sortAboutCol = 'ts';
  _sortAboutDir = -1;

  updateDashboard();
  renderAboutTable();
  renderAlertLog();
  const defaultModeBtn = document.querySelector('.mode-btn[data-mode="buyoff"]');
  if (defaultModeBtn) setMode('buyoff', defaultModeBtn);

  setupEnterKeyNavigation();
  updateDraftPanel();

  // ─── Offline-First Backend Sync Polling ─────────────────
  checkBackendConnection();
  autoSyncInterval = setInterval(checkBackendConnection, 10000);
}

document.addEventListener('DOMContentLoaded', init);

// ============================================================
//  📡 Backend Connection & Sync (Laser Engraving Module)
// ============================================================

// ── BLoader helper (กันพังถ้า loader.js โหลดไม่ทัน) ──
const _BL = {
  show: (t) => { try { window.BLoader?.show(t); } catch (e) { } },
  hide: () => { try { window.BLoader?.hide(); } catch (e) { } },
  showIfSlow: (t) => { try { window.BLoader?.showIfSlow(t); } catch (e) { } },
  hideIfSlow: () => { try { window.BLoader?.hideIfSlow(); } catch (e) { } },
};

async function checkBackendConnection() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    isServerOnline = data.status === 'ok' || data.status === 'OK';
  } catch (e) {
    isServerOnline = false;
  }
  updateConnectionUI();
  if (isServerOnline) refreshDataFromServer();
}

// โหลดข้อมูลล่าสุดจาก MySQL มาแสดงที่หน้าเว็บ
async function refreshDataFromServer() {
  _BL.showIfSlow('กำลังดึงข้อมูล');
  try {
    // ─── 1. ดึง Records ──────────────────────────────────────────────────────
    const resRecs = await fetch(`${BACKEND_URL}/api/laser/records`);
    if (resRecs.ok) {
      const data = await resRecs.json();
      if (data.success && Array.isArray(data.records)) {
        const serverIds = new Set(data.records.map(r => r.id));

        // Normalize records จาก server ให้ตรงกับ schema ของหน้าบ้านทุก field
        const normalizedServerRecs = data.records.map(r => {
          // ─ Resolve product key: server normalizes to lowercase-alphanum,
          //   we need to find the matching key in PRODUCTS
          if (r.product) {
            const rawKey = r.product;
            if (!PRODUCTS[rawKey]) {
              const cleanedKey = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (PRODUCTS[cleanedKey]) {
                r.product = cleanedKey;
              } else {
                // Try match via product_label or productLabel
                const lbl = (r.product_label || r.productLabel || '').toLowerCase().trim();
                if (lbl) {
                  const foundByLabel = Object.keys(PRODUCTS).find(k =>
                    PRODUCTS[k].label.toLowerCase().trim() === lbl
                  );
                  if (foundByLabel) {
                    r.product = foundByLabel;
                  } else {
                    // fuzzy: cleaned label contains cleaned product or vice-versa
                    const cleanLbl = lbl.replace(/[^a-z0-9]/g, '');
                    const foundFuzzy = Object.keys(PRODUCTS).find(k => {
                      const kLbl = PRODUCTS[k].label.toLowerCase().replace(/[^a-z0-9]/g, '');
                      return kLbl && (kLbl.includes(cleanLbl) || cleanLbl.includes(kLbl));
                    });
                    if (foundFuzzy) r.product = foundFuzzy;
                  }
                }
                // Try fuzzy on raw key
                if (!PRODUCTS[r.product]) {
                  const foundFuzzyKey = Object.keys(PRODUCTS).find(k =>
                    k.includes(cleanedKey) || cleanedKey.includes(k)
                  );
                  if (foundFuzzyKey) r.product = foundFuzzyKey;
                }
              }
            }
          }
          // เก็บ product_label ไว้เสมอ เพื่อ fallback display
          if (!r.product_label && !r.productLabel) {
            r.product_label = PRODUCTS[r.product] ? PRODUCTS[r.product].label : (r.product || '');
            r.productLabel = r.product_label;
          } else if (!r.product_label) {
            r.product_label = r.productLabel;
          } else if (!r.productLabel) {
            r.productLabel = r.product_label;
          }
          if (r.date) r.date = normalizeDate(r.date);
          // ─ en: ตัวเลข 5 หลักเสมอ
          if (r.en) r.en = normalizeEN(r.en);
          // ─ time: HH:MM
          if (r.sendtime) r.sendtime = normalizeTime(r.sendtime);
          if (r.recvtime) r.recvtime = normalizeTime(r.recvtime);
          // ─ ts: ต้องเป็น ISO string (server อาจส่งมาเป็น Date object หรือ string)
          if (r.ts) {
            try {
              const d = r.ts instanceof Date ? r.ts : new Date(r.ts);
              r.ts = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
            } catch (e) { r.ts = new Date().toISOString(); }
          } else {
            r.ts = new Date().toISOString();
          }
          // ─ draftIndex: ต้องเป็น number หรือ null
          if (r.draftIndex !== null && r.draftIndex !== undefined) {
            r.draftIndex = parseInt(r.draftIndex, 10) || null;
          }
          // ─ type: server ส่ง type ถูกต้องแล้ว (map จาก product_type) 
          //   ถ้าว่างให้ fallback เป็น Epoch
          if (!r.type) r.type = 'Epoch';
          // ─ vmi: normalize เป็น Pass / Fail / Hold เท่านั้น
          if (r.vmi) {
            const nv = normalizeDefect(r.vmi);
            r.vmi = (nv === 'Hold' ? 'Hold' : nv === 'Fail' ? 'Fail' : 'Pass');
          } else { r.vmi = 'Pass'; }
          // ─ defect fields: normalize ทุก field
          DEFECT_FIELDS.forEach(f => {
            if (r[f.id] !== undefined) r[f.id] = normalizeDefect(r[f.id]);
            else r[f.id] = 'Pass'; // ถ้าไม่มีให้ default เป็น Pass
          });
          if (r.z1_missing !== undefined) r.z1_missing = normalizeDefect(r.z1_missing);
          if (r.z2_missing !== undefined) r.z2_missing = normalizeDefect(r.z2_missing);
          // ─ overall: คำนวณใหม่จาก defect fields ที่ normalize แล้ว
          r.overall = getOverallResult(r);
          return r;
        });

        // รวม records จาก server กับที่มีเฉพาะใน local (ยังไม่ได้ sync)
        // เพื่อป้องกัน duplicate record (local ใช้ id=Date.now(), server ใช้ id=AutoIncrement)
        // เราจะ discard local record ถ้ามี record บน server ที่มี (product, machine, test_date, fixture, sendtime) ตรงกัน
        const localOnly = DB.records.filter(r => {
          if (serverIds.has(r.id)) return false;
          // Check if this record already exists in server records by matching key fields
          const exists = normalizedServerRecs.some(sr => 
            sr.product === r.product &&
            sr.machine === r.machine &&
            sr.date === r.date &&
            sr.fixture === r.fixture &&
            sr.sendtime === r.sendtime
          );
          return !exists;
        });
        
        DB.records = [...normalizedServerRecs, ...localOnly];
        // อัปเดต nextId ให้ไม่ชนกับ id ที่มีอยู่ใน DB
        const maxId = DB.records.reduce((m, r) => Math.max(m, typeof r.id === 'number' ? r.id : 0), DB.nextId || 1);
        DB.nextId = maxId + 1;
        localStorage.setItem(LS_KEY, JSON.stringify(DB));
        console.log(`[Laser] refreshed ${data.records.length} records from server (${localOnly.length} local-only)`);
      }
    } else {
      console.warn('[Laser] /api/laser/records returned HTTP', resRecs.status);
    }

    // ─── 2. ดึง Alerts ──────────────────────────────────────────────────────
    const resAlerts = await fetch(`${BACKEND_URL}/api/laser/alerts`);
    if (resAlerts.ok) {
      const adata = await resAlerts.json();
      if (adata.success && Array.isArray(adata.alerts) && adata.alerts.length > 0) {
        // map field ให้ตรงกับ ALERT_LOG structure ที่ renderAlertLog() ต้องการ
        ALERT_LOG = adata.alerts.map(a => ({
          id: a.id,
          // ts: ต้องเป็น ISO string
          ts: (() => { try { const d = new Date(a.ts); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); } catch (e) { return new Date().toISOString(); } })(),
          level: a.level || 'ng',
          product: a.product || '',
          // machine: laser.js เก็บใน field 'machine' แต่ alert เก็บจาก 'fixture'
          machine: a.fixture || a.machine || '',
          defects: a.defects || [],
          msg: a.msg || ''
        }));
        localStorage.setItem(ALERT_KEY, JSON.stringify(ALERT_LOG));
        console.log(`[Laser] refreshed ${adata.alerts.length} alerts from server`);
      }
    }

    // ─── 3. ดึง Config ──────────────────────────────────────────────────────
    const resCfg = await fetch(`${BACKEND_URL}/api/config/laser`);
    if (resCfg.ok) {
      const cdata = await resCfg.json();
      if (cdata.success && cdata.limits) {
        let pQty = {};
        let fSet = new Set();
        let sSet = new Set();
        cdata.limits.forEach(lim => {
          if (lim.laser_qty !== null && lim.laser_qty !== undefined) pQty[lim.product_key] = lim.laser_qty;
          if (lim.laser_fixture) lim.laser_fixture.split(',').forEach(x => { if (x.trim()) fSet.add(x.trim()); });
          if (lim.laser_shift) lim.laser_shift.split(',').forEach(x => { if (x.trim()) sSet.add(x.trim()); });
        });
        CONFIG.productQty = pQty;
        CONFIG.fixtures = Array.from(fSet);
        CONFIG.shifts = Array.from(sSet);
        localStorage.setItem(CONFIG_KEY, JSON.stringify(CONFIG));
        console.log('[Laser] config refreshed from server');
      }
    }

  } catch (e) {
    console.warn('[Laser] refreshDataFromServer error:', e.message || e);
  } finally {
    // อัปเดต UI เสมอ ไม่ว่า fetch จะสำเร็จหรือไม่
    updateDashboard();
    renderAboutTable();
    updateAlertBadge();
    _BL.hideIfSlow();
  }
}

function updateConnectionUI() {
  const dot = document.getElementById('sync-status-indicator');
  const text = document.getElementById('sync-status-text');
  const syncBtn = document.getElementById('sync-now-btn');

  if (isServerOnline) {
    if (dot) { dot.className = 'sync-dot online'; }
    if (text) { text.textContent = 'Online (Synced)'; text.style.color = 'var(--pass)'; }
    if (syncBtn) syncBtn.style.display = 'inline-flex';
  } else {
    if (dot) { dot.className = 'sync-dot offline'; }
    if (text) { text.textContent = 'Offline Mode'; text.style.color = 'var(--text3)'; }
    if (syncBtn) syncBtn.style.display = 'none';
  }
}

async function syncWithServer() {
  if (!isServerOnline) {
    showToast('Cannot sync: server is offline.', 'error');
    return;
  }
  _BL.show('กำลังซิงค์ข้อมูล...');
  try {
    const res = await fetch(`${BACKEND_URL}/api/laser/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        db_data: DB,
        alert_log: ALERT_LOG,
        config: CONFIG
      })
    });
    const result = await res.json();
    if (result.success) {
      lastSyncTimestamp = Date.now();
      showToast('Synchronized successfully with MySQL!', 'success');
      // หลัง sync เสร็จ ดึงข้อมูลกลับมาจาก DB เลย
      await refreshDataFromServer();
    } else {
      showToast('Sync failed: ' + (result.message || result.error), 'error');
    }
  } catch (e) {
    console.error('[Laser] sync error:', e);
    showToast('Sync error: ' + e.message, 'error');
  } finally {
    _BL.hide();
  }
}



// ========================
// NORMALIZATION HELPERS
// Ensure fields match About Data expectations (date, time, EN, defects)
// ========================
function normalizeEN(val) {
  if (val === undefined || val === null) return '';
  let s = String(val).replace(/\D/g, '');
  return s;
}

function normalizeTime(val) {
  if (val === undefined || val === null) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
  if (/^\d{4}$/.test(s)) {
    const hh = s.slice(0, 2); const mm = s.slice(2, 4);
    if (parseInt(hh, 10) < 24 && parseInt(mm, 10) < 60) return `${hh}:${mm}`;
  }
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0 && n < 1) {
    const totalMin = Math.round(n * 24 * 60);
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
  }
  return s;
}

function normalizeDate(val) {
  if (val === undefined || val === null) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) {
    const parts = s.split('/');
    if (parts.length === 3) {
      let yr = parts[2];
      if (yr.length === 2) yr = parseInt(yr, 10) < 50 ? '20' + yr : '19' + yr;
      return `${yr}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
    }
  }
  const n = parseFloat(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return s;
}

function normalizeDefect(val) {
  const s = String(val || '').toLowerCase().trim();
  if (['fail', 'f', 'ng', 'x', '1'].includes(s)) return 'Fail';
  if (s === 'hold') return 'Hold';
  return 'Pass';
}

async function importExportedExcel(event) {
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
          date: dateVal,
          type: getVal('Type') || '',
          product: modelKey,
          productLabel: pLabel,
          partno: getVal('Part Number') || '',
          qty: getVal('Quantity') || '',
          machine: getVal('Machine') || '',
          en: getVal('EN#') || '',
          sendtime: getVal('Sending Time') || '',
          recvtime: getVal('Receive Time') || '',
          fixture: getVal('Fixture') || '',
          ptno: getVal('PT/Bobbin Store lot') || '',
          attr: getVal('Attribute') || '',
          vmi: getVal('VMI Disposition') || '',
          overall: getVal('Overall') || '',
          remark: getVal('Remark') || '',
          draftIndex: getVal('Draft Index') || ''
        };
        if (typeof DEFECT_FIELDS !== 'undefined') {
          DEFECT_FIELDS.forEach(f => {
            rec[f.id] = getVal(f.label) || '';
          });
        }
        DB.records.push(rec);
        importedCount++;
      }
    } catch (err) { console.error('Error importing file:', file.name, err); }
  }
  event.target.value = '';
  if (importedCount > 0) {
    saveDB();
    updateDashboard();
    if (typeof renderAboutTable === 'function') renderAboutTable();
    if (typeof syncWithServer === 'function') await syncWithServer();
    showToast(`นำเข้าข้อมูล ${importedCount} รายการ และบันทึกเข้าฐานข้อมูลเรียบร้อย`, 'success');
  } else { showToast('ไม่พบข้อมูลที่จะนำเข้า (รูปแบบไฟล์ไม่ถูกต้อง หรือไม่มีข้อมูล)', 'warn'); }
}

function renderAlertLog() {}

function checkAndAlert(rec, showToastFlag) {
  if (rec.overall === 'Fail') {
    alert(`แจ้งเตือน: พบข้อมูลอยู่นอกเกณฑ์ (Fail)! \nโปรดตรวจสอบ Part No: ${rec.partno || '-'} เครื่อง: ${rec.machine || '-'}`);
    
    // Generate alert log entry
    let fails = [];
    if (typeof DEFECT_FIELDS !== 'undefined') {
      DEFECT_FIELDS.forEach(f => { if (rec[f.id] === 'Fail') fails.push(f.label); });
    }
    if (rec.z1_missing === 'Fail') fails.unshift('Z1 Missing');
    if (rec.z2_missing === 'Fail') fails.unshift('Z2 Missing');
    if (rec.vmi === 'Fail') fails.push('VMI');
    
    const alertObj = {
      id: rec.id,
      ts: rec.ts || new Date().toISOString(),
      level: 'ng',
      product: rec.product_label || rec.product,
      machine: rec.machine || '',
      fixture: rec.fixture || '',
      defects: fails,
      msg: 'Laser Inspection Failed: ' + fails.join(', ')
    };
    ALERT_LOG.unshift(alertObj);
    localStorage.setItem(ALERT_KEY, JSON.stringify(ALERT_LOG));
  }
}

document.addEventListener('keydown', function(e) {
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
