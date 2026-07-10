// ═══════════════════════════════════════════════════════════════
//  BELTON IPQC — Damper Install  v3.0  (damper_install.js)
//  Format aligned with ACA Buy Off Damper check sheet
//  Short: Point1(1/1~1/4 @ 1.358±0.010) + Point2(2/1~2/4 @ 0.03±0.010)
//  Long:  Top(1/1~1/4 @ 0.814±0.010)  + Bottom(2/1~2/4 @ 0.03±0.010)
// ═══════════════════════════════════════════════════════════════

// ─── Storage Keys ─────────────────────────────────────────────
const LS_KEY_DMR = 'belton_damper_v3_records';
const LS_KEY_ALERTS = 'belton_damper_v3_alerts';
const LS_KEY_CFG = 'belton_damper_v3_config';
const LS_KEY_DMR_CFG = 'belton_damper_v3_config';
let dmpRecords = [];

async function fetchDamperConfigFromDB() {
    try {
        const res = await fetch((typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3000') + '/api/system/config');
        if (res.ok) {
            const dbCfg = await res.json();
            if (dbCfg && dbCfg[LS_KEY_DMR_CFG]) {
                localStorage.setItem(LS_KEY_DMR_CFG, dbCfg[LS_KEY_DMR_CFG]);
            }
        }
    } catch (e) {
        console.error("Failed to fetch Damper config from DB", e);
    }
}
// Removed early call, moved to DOMContentLoaded

// ─── Backend ──────────────────────────────────────────────────
let isServerOnline = false;

// ─── Sort State ───────────────────────────────────────────────
let _sortCol = 'no';
let _sortDir = -1;

// ─── EML cache ────────────────────────────────────────────────
let _emlCache = null;

// ─── Charts ───────────────────────────────────────────────────
let _cShort = null, _cLong = null, _cProd = null, _cVmi = null;

// --- VMI Defect Types (ตามจริงใน Excel) ---
const VMI_ITEMS = [
    { id: 'fiber', label: 'Fiber' },
    { id: 'double', label: 'Double' },
    { id: 'missing', label: 'Missing' },
    { id: 'misalign', label: 'Misalignment' },
    { id: 'dent', label: 'Dent' },
    { id: 'scratch_arm', label: 'Scratch Arm' },
    { id: 'scratch_bear', label: 'Scratch Bearing' },
    { id: 'squeeze', label: 'Squeeze Out' },
    { id: 'gap', label: 'Gap' },
    { id: 'other', label: 'Other' },
];

// ─── Dimension Point Definitions (ตาม Format Excel) ─────────────
let DIM_GROUPS = { datum: [] };
let DIM_GROUPS_BASE = { datum: [] };

// ─── Product Catalogue ────────────────────────────────────────
const PRODUCTS_DEFAULT = {
    cim3d: { label: 'Cimarron BP 3D', mc: '—', pcs: 4 },
    cim4d: { label: 'Cimarron BP 4D', mc: '33', pcs: 8 },
    cim5d: { label: 'Cimarron BP 5D', mc: '33', pcs: 10 },
    dor10n: { label: 'Dorado 10D NOAR', mc: '—', pcs: 10 },
    dor10d: { label: 'Dorado 10D', mc: '—', pcs: 10 },
    dor5dbb: { label: 'Dorado 5D AL BB', mc: '—', pcs: 4 },
    dor5d: { label: 'Dorado 5D', mc: '—', pcs: 4 },
    mar10d: { label: 'Marlin 10D', mc: '—', pcs: 10 },
    sky1d: { label: 'Skybolt 1D', mc: '—', pcs: 4 },
    sky2d: { label: 'Skybolt 2D', mc: '—', pcs: 4 },
    sky3d: { label: 'Skybolt 3D', mc: '—', pcs: 6 },
    sky4d: { label: 'Skybolt 4D', mc: '—', pcs: 8 },
    sum10d: { label: 'Summit 10D', mc: '—', pcs: 10 },
    v114d: { label: 'V11 4D', mc: '—', pcs: 4 },
    v15: { label: 'V15 CMR 4D', mc: '—', pcs: 4 },
};

let PRODUCTS = {};

// ════════════════════════════════════════════════════════════
//  Startup
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await fetchDamperConfigFromDB();
    loadConfig();
    fetchDynamicProducts();
    buildVMIGrid();
    const d = document.getElementById('m-date');
    if (d) d.value = todayISO();
    startClock();
    updateKPIs();
    updateBadges();
    renderPendingTable();
    checkBackendConnection().then(() => {
        if (isServerOnline) refreshDataFromServer();
    });
    setInterval(() => {
        checkBackendConnection().then(() => {
            if (isServerOnline) refreshDataFromServer();
        });
    }, 10000);
});

function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleString('th-TH', { hour12: false }); };
    tick(); setInterval(tick, 1000);
}

// ─── Config ───────────────────────────────────────────────────
function loadConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
        PRODUCTS = JSON.parse(JSON.stringify(PRODUCTS_DEFAULT));
        if (saved.products) {
            Object.keys(saved.products).forEach(k => {
                if (PRODUCTS[k]) Object.assign(PRODUCTS[k], saved.products[k]);
            });
        }
    } catch {
        PRODUCTS = JSON.parse(JSON.stringify(PRODUCTS_DEFAULT));
    }
}

function generateDimGroupsForProduct(pcs) {
    const datumPts = ['1/1', '1/2', '1/3', '1/4'];
    const nondatumPts = ['2/1', '2/2', '2/3', '2/4'];

    return [
        { 
            key: 'datum', label: '1. Datum', subLabel: '', usl: 1.368, ucl: null, cl: 1.358, lcl: null, lsl: 1.348, points: datumPts, startIdx: 1,
            pointSpecs: {
                '1/1': { usl: 1.368, cl: 1.358, lsl: 1.348 },
                '1/2': { usl: 1.368, cl: 1.358, lsl: 1.348 },
                '1/3': { usl: 0.040, cl: 0.030, lsl: 0.020 },
                '1/4': { usl: 0.040, cl: 0.030, lsl: 0.020 }
            }
        },
        { 
            key: 'nondatum', label: '2. Non-datum', subLabel: '', usl: 0.824, ucl: null, cl: 0.814, lcl: null, lsl: 0.804, points: nondatumPts, startIdx: 1,
            pointSpecs: {
                '2/1': { usl: 0.824, cl: 0.814, lsl: 0.804 },
                '2/2': { usl: 0.824, cl: 0.814, lsl: 0.804 },
                '2/3': { usl: 0.040, cl: 0.030, lsl: 0.020 },
                '2/4': { usl: 0.040, cl: 0.030, lsl: 0.020 }
            }
        }
    ];
}

window.SERVER_PRODUCTS_LIST = [];

async function fetchDynamicProducts() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/damper/products_list`);
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

// ─── Point Colors (4 colors for 4 measurement points) ─────────────────────────
const POINT_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b']; // blue, green, purple, amber

function generateDimGroupsForProduct(pcs) {
    // Damper measurements always have 4 points per piece
    const datumPts = ['1/1', '1/2', '1/3', '1/4'];
    const nondatumPts = ['2/1', '2/2', '2/3', '2/4'];

    return [
        { 
            key: 'datum', label: '1. Datum', subLabel: '', usl: 1.368, ucl: null, cl: 1.358, lcl: null, lsl: 1.348, points: datumPts, startIdx: 1,
            pointSpecs: {
                '1/1': { usl: 1.368, cl: 1.358, lsl: 1.348 },
                '1/2': { usl: 1.368, cl: 1.358, lsl: 1.348 },
                '1/3': { usl: 0.040, cl: 0.030, lsl: 0.020 },
                '1/4': { usl: 0.040, cl: 0.030, lsl: 0.020 }
            }
        },
        { 
            key: 'nondatum', label: '2. Non-datum', subLabel: '', usl: 0.824, ucl: null, cl: 0.814, lcl: null, lsl: 0.804, points: nondatumPts, startIdx: 1,
            pointSpecs: {
                '2/1': { usl: 0.824, cl: 0.814, lsl: 0.804 },
                '2/2': { usl: 0.824, cl: 0.814, lsl: 0.804 },
                '2/3': { usl: 0.040, cl: 0.030, lsl: 0.020 },
                '2/4': { usl: 0.040, cl: 0.030, lsl: 0.020 }
            }
        }
    ];
}

function applyDamperConfigForProduct(productKey) {
    const p = PRODUCTS[productKey];
    if (!p) return;

    DIM_GROUPS.datum = generateDimGroupsForProduct(p.pcs);
    DIM_GROUPS_BASE.datum = JSON.parse(JSON.stringify(DIM_GROUPS.datum));

    let cfg = {};
    try {
        const raw = localStorage.getItem(LS_KEY_CFG);
        if (raw) cfg = JSON.parse(raw);
    } catch (e) { }

    const prodOverride = (cfg.productDims && cfg.productDims[productKey]) ? cfg.productDims[productKey] : null;
    const globalDefault = cfg.dims || {};

    const allGroups = DIM_GROUPS.datum;
    allGroups.forEach(g => {
        let configKey = g.label; // e.g., "1. Datum"
        // 1. Resolve base group limits
        let base_usl = g.usl, base_ucl = g.ucl, base_cl = g.cl, base_lcl = g.lcl, base_lsl = g.lsl;
        
        if (prodOverride && prodOverride[configKey]) {
            if (prodOverride[configKey].usl != null) base_usl = prodOverride[configKey].usl;
            if (prodOverride[configKey].ucl != null) base_ucl = prodOverride[configKey].ucl;
            if (prodOverride[configKey].cl != null) base_cl = prodOverride[configKey].cl;
            if (prodOverride[configKey].lcl != null) base_lcl = prodOverride[configKey].lcl;
            if (prodOverride[configKey].lsl != null) base_lsl = prodOverride[configKey].lsl;
        } else if (globalDefault[configKey]) {
            if (globalDefault[configKey].usl != null) base_usl = globalDefault[configKey].usl;
            if (globalDefault[configKey].ucl != null) base_ucl = globalDefault[configKey].ucl;
            if (globalDefault[configKey].cl != null) base_cl = globalDefault[configKey].cl;
            if (globalDefault[configKey].lcl != null) base_lcl = globalDefault[configKey].lcl;
            if (globalDefault[configKey].lsl != null) base_lsl = globalDefault[configKey].lsl;
        }

        g.usl = base_usl; g.ucl = base_ucl; g.cl = base_cl; g.lcl = base_lcl; g.lsl = base_lsl;

        // 2. Resolve per-point limits and store in g.pointSpecs
        g.pointSpecs = {};
        g.points.forEach(pt => {
            const ptConfigKey = `${g.label} (${pt})`; // e.g., "1. Datum (1/1)"
            let pt_usl = base_usl, pt_ucl = base_ucl, pt_cl = base_cl, pt_lcl = base_lcl, pt_lsl = base_lsl;
            
            if (prodOverride && prodOverride[ptConfigKey]) {
                if (prodOverride[ptConfigKey].usl != null) pt_usl = prodOverride[ptConfigKey].usl;
                if (prodOverride[ptConfigKey].ucl != null) pt_ucl = prodOverride[ptConfigKey].ucl;
                if (prodOverride[ptConfigKey].cl != null) pt_cl = prodOverride[ptConfigKey].cl;
                if (prodOverride[ptConfigKey].lcl != null) pt_lcl = prodOverride[ptConfigKey].lcl;
                if (prodOverride[ptConfigKey].lsl != null) pt_lsl = prodOverride[ptConfigKey].lsl;
            }
            g.pointSpecs[pt] = { usl: pt_usl, ucl: pt_ucl, cl: pt_cl, lcl: pt_lcl, lsl: pt_lsl };
        });

        let specs = [];
        if (g.lsl !== null) specs.push(`LSL: ${g.lsl.toFixed(3)}`);
        if (g.cl !== null) specs.push(`CL: ${g.cl.toFixed(3)}`);
        if (g.usl !== null) specs.push(`USL: ${g.usl.toFixed(3)}`);
        g.subLabel = `Spec: ${specs.join(' | ')}`;

        // ─── Load per-point limits: prefer window.DAMPER_LIMITS (from MySQL/Server),
        // then fall back to specs saved in localStorage (from System Config offline save)
        g.points.forEach((pt, ptIdx) => {
            const ptKey = `${g.key}_pt${ptIdx + 1}`; // e.g. datum_pt1, nondatum_pt3

            let limObj = null;

            // Priority 1: window.DAMPER_LIMITS (populated from server API)
            if (window.DAMPER_LIMITS && window.DAMPER_LIMITS[productKey]) {
                limObj = window.DAMPER_LIMITS[productKey][ptKey] || null;
            }

            // Priority 2: localStorage specs saved by System Config (offline/fallback)
            if (!limObj) {
                try {
                    const rawLs = localStorage.getItem('belton_damper_v3_config');
                    if (rawLs) {
                        const lsCfg = JSON.parse(rawLs);
                        const prodSpecs = (lsCfg.productDims && lsCfg.productDims[productKey])
                            ? lsCfg.productDims[productKey].specs || {}
                            : {};
                        if (prodSpecs[ptKey]) limObj = prodSpecs[ptKey];
                    }
                } catch (e) {}
            }

            if (limObj) {
                const ps = g.pointSpecs[pt] || {};
                if (limObj.lsl != null) ps.lsl = parseFloat(limObj.lsl);
                if (limObj.lcl != null) ps.lcl = parseFloat(limObj.lcl);
                if (limObj.cl != null) ps.cl = parseFloat(limObj.cl);
                if (limObj.ucl != null) ps.ucl = parseFloat(limObj.ucl);
                if (limObj.usl != null) ps.usl = parseFloat(limObj.usl);
                g.pointSpecs[pt] = ps;
            }
        });
    });
}

// ─── Populate Dropdowns ───────────────────────────────────────
function populateProductDropdowns(modeFilter = null) {
    ['m-product', 'flt-product', 'viz-product', 'merge-product'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        while (el.options.length > 1) el.remove(1);

        if (!window.SERVER_PRODUCTS_LIST || window.SERVER_PRODUCTS_LIST.length === 0) {
            Object.keys(PRODUCTS).forEach(k => {
                const o = document.createElement('option');
                o.value = k; o.textContent = PRODUCTS[k].label;
                el.appendChild(o);
            });
        } else {
            let dbMode = modeFilter ? modeFilter.toLowerCase() : null;
            if (dbMode === 'buyoff') dbMode = 'buy-off';

            const filtered = window.SERVER_PRODUCTS_LIST.filter(p => !dbMode || dbMode === 'all' || (p.mode || '').toLowerCase() === dbMode);
            filtered.sort((a, b) => a.product_name.localeCompare(b.product_name));

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

// ─── Build VMI Disposition Grid ───────────────────────────────
function buildVMIGrid() {
    const grid = document.getElementById('vmi-grid');
    if (!grid) return;

    const mode = document.getElementById('m-mode')?.value || 'buyoff';
    const items = VMI_ITEMS.filter(v => mode === 'roving' || v.id !== 'double');

    grid.innerHTML = items.map(v => `
        <div class="vmi-cell">
            <label>${v.label}</label>
            <div class="pf-toggle" id="toggle-vmi-${v.id}" data-value="Pass">
                <div class="pf-btn pf-pass" onclick="setVmiPF('${v.id}', 'Pass')">Pass</div>
                <div class="pf-btn pf-fail" onclick="setVmiPF('${v.id}', 'Fail')">Fail</div>
                <input type="hidden" id="vmi-${v.id}" value="Pass">
            </div>
        </div>`).join('');
}

function onModeChange() {
    const mode = document.getElementById('m-mode')?.value || 'buyoff';
    const badge = document.getElementById('type-badge');
    if (badge) {
        if (mode === 'roving') {
            badge.textContent = 'Damper Install · Roving Audit';
            badge.style.color = '#0ea5e9';
            badge.style.background = 'rgba(14,165,233,.1)';
            badge.style.borderColor = 'rgba(14,165,233,.2)';
        } else {
            badge.textContent = 'Damper Install · Buy Off';
            badge.style.color = '#7c3aed';
            badge.style.background = 'rgba(124,58,237,.1)';
            badge.style.borderColor = 'rgba(124,58,237,.2)';
        }
    }
    buildVMIGrid();
    if (window.SERVER_PRODUCTS_LIST && window.SERVER_PRODUCTS_LIST.length > 0) {
        populateProductDropdowns(mode);
    }
    onProductChange();
}

function setOverallPF(val) {
    const el = document.getElementById('m-overall');
    if (el) el.value = val;
    const t = document.getElementById('toggle-overall');
    if (t) t.setAttribute('data-value', val);
}

function setVmiPF(id, val) {
    const el = document.getElementById(`vmi-${id}`);
    if (el) el.value = val;
    const t = document.getElementById(`toggle-vmi-${id}`);
    if (t) t.setAttribute('data-value', val);
    autoJudgeOverall();
}

// ─── On Product Change ────────────────────────────────────────
function onProductChange() {
    const key = document.getElementById('m-product')?.value;
    const p = key ? PRODUCTS[key] : null;

    const noMsg = document.getElementById('no-product-msg');
    const vmiSec = document.getElementById('vmi-section');
    const dimSec = document.getElementById('dim-section');
    const ovSec = document.getElementById('overall-section');
    const infoBar = document.getElementById('form-spec-label');

    const mode = document.getElementById('m-mode')?.value || 'buyoff';

    if (!p) {
        if (noMsg) noMsg.style.display = 'block';
        if (vmiSec) vmiSec.style.display = 'none';
        if (dimSec) dimSec.style.display = 'none';
        if (ovSec) ovSec.style.display = 'none';
        return;
    }

    if (noMsg) noMsg.style.display = 'none';
    if (vmiSec) vmiSec.style.display = 'block';
    if (ovSec) ovSec.style.display = 'block';

    // Hide dimensions for Roving Audit
    if (dimSec) dimSec.style.display = mode === 'roving' ? 'none' : 'block';

    // Apply specific product specs
    applyDamperConfigForProduct(key);

    // Auto-fill Part No, M/C
    const partEl = document.getElementById('m-partno');
    const mcEl = document.getElementById('m-mc');
    if (partEl) partEl.value = p.partno || '';
    if (mcEl) mcEl.value = (p.mc !== '—') ? p.mc : '';

    // ─── Update Frequency ───────────────────────────────────────
    // หมายเหตุ: ค่านี้คือจำนวนชิ้น "ตาม Frequency" ที่ตั้งไว้ใน System Config (System Config > Damper)
    // เป็นตัวกำหนดว่าต้อง Save Draft กี่ครั้ง (กี่ชิ้น) ถึงจะครบ 1 ชุดและ Push เข้า About Data (Waiting) ได้
    // ถ้าไม่ได้ตั้งค่า Frequency ไว้ ระบบจะ fallback ไปใช้ pcs/batch ของสินค้านั้น (ค่าตั้งต้นในระบบ)
    const qtyInput = document.getElementById('m-qty');
    let freqTarget = p.pcs; // fallback to product default
    let freqSource = 'default';
    if (qtyInput) {
        try {
            const raw = localStorage.getItem('belton_damper_v3_config');
            let cfg = raw ? JSON.parse(raw) : {};
            const prodCfg = (cfg.productDims && key && cfg.productDims[key]) ? cfg.productDims[key] : {};
            const fBuyoff = prodCfg.freqBuyoff !== undefined ? prodCfg.freqBuyoff : cfg.freqBuyoff;
            const fRoving = prodCfg.freqRoving !== undefined ? prodCfg.freqRoving : cfg.freqRoving;

            let activeFreq = null;
            if (mode === 'buyoff' || mode === 'oba') {
                activeFreq = fBuyoff;
            } else if (mode.includes('roving')) {
                activeFreq = fRoving;
            }

            if (activeFreq && !isNaN(parseInt(activeFreq, 10)) && parseInt(activeFreq, 10) > 0) {
                freqTarget = parseInt(activeFreq, 10);
                freqSource = 'config';
                qtyInput.value = `${freqTarget}/Shift/Oven`;
            } else {
                // ไม่มีค่า Frequency ที่ตั้งไว้ -> แจ้งผู้ใช้และใช้ pcs/batch แทน
                qtyInput.value = `${freqTarget} pcs (default)`;
            }
        } catch (e) {
            qtyInput.value = `${freqTarget} pcs (default)`;
        }
    }
    // เก็บค่า target ที่ใช้จริงไว้ใน dataset เพื่อให้ saveManualDraft() ดึงไปใช้ตอนบันทึก
    if (qtyInput) qtyInput.dataset.freqTarget = freqTarget;

    // Update Info Bar with frequency indicator
    if (infoBar) {
        const freqLabel = freqSource === 'config'
            ? `<span style="color:var(--pass);font-weight:700">✅ Freq: ${freqTarget} pcs</span>`
            : `<span style="color:#f39c12;font-weight:700">⚠️ Freq: ${freqTarget} pcs (default — ตั้งค่าใน System Config)</span>`;
        infoBar.innerHTML = `${p.label} &nbsp;|&nbsp; ${freqLabel} &nbsp;|&nbsp; Datum: 1.358±0.010 | Non-datum: 0.814±0.010`;
    }

    // Build dimension groups — pass freqTarget explicitly so grid always uses the correct row count
    buildAllDimGroups(freqTarget);
    buildStage2DimGroups();
}

function buildStage2DimGroups() {
    const container = document.getElementById('stage2-dim-groups-container');
    if (!container) return;

    // Determine number of pieces and selected product
    let pcs = 4;
    let pKey = document.getElementById('m-product')?.value || '';
    let selectedRecord = null;
    
    if (_selectedMergeId) {
        selectedRecord = loadRecords().find(x => x.id === _selectedMergeId);
        if (selectedRecord) {
            pcs = selectedRecord.freqTarget || selectedRecord.pcs || 4;
            pKey = selectedRecord.product; // Use product from the target record
        }
    } else {
        const mergeProdEl = document.getElementById('merge-product');
        const mergeTypeEl = document.getElementById('merge-datatype');
        
        if (mergeProdEl && mergeProdEl.value) {
            pKey = mergeProdEl.value;
            const mode = mergeTypeEl ? (mergeTypeEl.value || 'buyoff').toLowerCase() : 'buyoff';
            pcs = 4;
            const p = PRODUCTS[pKey] || (window.SERVER_PRODUCTS_LIST && window.SERVER_PRODUCTS_LIST.find(x => x.product_key === pKey || x.product_name === pKey)) || {};
            if (p && p.pcs) pcs = p.pcs;
            
            try {
                const raw = localStorage.getItem('belton_damper_v3_config');
                let cfg = raw ? JSON.parse(raw) : {};
                const prodCfg = (cfg.productDims && pKey && cfg.productDims[pKey]) ? cfg.productDims[pKey] : {};
                const fBuyoff = prodCfg.freqBuyoff !== undefined ? prodCfg.freqBuyoff : cfg.freqBuyoff;
                const fRoving = prodCfg.freqRoving !== undefined ? prodCfg.freqRoving : cfg.freqRoving;
    
                let activeFreq = (mode.includes('roving')) ? fRoving : fBuyoff;
                if (activeFreq && !isNaN(parseInt(activeFreq, 10)) && parseInt(activeFreq, 10) > 0) {
                    pcs = parseInt(activeFreq, 10);
                }
            } catch(e) {}
        } else {
            const qtyEl = document.getElementById('m-qty');
            pcs = parseInt(qtyEl?.dataset.freqTarget, 10) || 4;
        }
    }

    const mergeProdEl = document.getElementById('merge-product');
    if (!pKey && mergeProdEl) pKey = mergeProdEl.value;

    if (pKey) {
        applyDamperConfigForProduct(pKey);
    } else if (!DIM_GROUPS.datum || DIM_GROUPS.datum.length === 0) {
        DIM_GROUPS.datum = generateDimGroupsForProduct(4);
    }

    const allGroups = DIM_GROUPS.datum;
    container.style.gridTemplateColumns = '1fr';

    // Create flat column map for all points across all groups
    let colMap = [];
    allGroups.forEach(g => {
        g.points.forEach((pt, i) => {
            colMap.push({ group: g, ptName: pt, localCol: i });
        });
    });

    let tableHTML = `<div style="overflow-x:auto; margin-bottom:8px; border:1px solid var(--border2); border-radius:6px;">
        <table class="damper-grid" style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">
        <thead style="background:var(--bg2); border-bottom:1px solid var(--border2);">
            <tr>
                <th rowspan="2" style="padding:8px; border-right:1px solid var(--border2); text-align:left; min-width:60px; vertical-align:middle;">Piece</th>`;
    
    // Group headers (colspan = number of points in each group)
    allGroups.forEach(g => {
        const isDatum = g.key.startsWith('datum');
        const color = isDatum ? 'var(--blue)' : '#9B59B6';
        tableHTML += `<th colspan="${g.points.length}" style="padding:4px 8px; border-right:1px solid var(--border2); border-bottom:1px solid var(--border2); color:${color}; font-weight:700;">${g.label}</th>`;
    });
    tableHTML += `</tr><tr>`;

    // Point headers
    colMap.forEach((m, idx) => {
        const ptKey = `${m.group.key}_pt${m.localCol + 1}`; // e.g. "datum_pt1"
        const ptSpecs = window.DAMPER_LIMITS && pKey ? window.DAMPER_LIMITS[pKey] && window.DAMPER_LIMITS[pKey][ptKey] : null;
        
        const fallbackSpecs = (m.group.pointSpecs && m.group.pointSpecs[m.ptName]) ? m.group.pointSpecs[m.ptName] : m.group;
        const cl = ptSpecs ? ptSpecs.cl : fallbackSpecs.cl;
        const lsl = ptSpecs ? ptSpecs.lsl : fallbackSpecs.lsl;
        const usl = ptSpecs ? ptSpecs.usl : fallbackSpecs.usl;

        let criteriaStr = '';
        if (cl != null && lsl != null && usl != null) {
             const tolPlus = (usl - cl).toFixed(3);
             const tolMinus = (cl - lsl).toFixed(3);
             if (tolPlus === tolMinus) {
                 criteriaStr = `<br><span style="font-size:10px; color:var(--text3); font-weight:500;">${cl.toFixed(3)} &plusmn;${tolPlus}</span>`;
             } else {
                 criteriaStr = `<br><span style="font-size:10px; color:var(--text3); font-weight:500;">${cl.toFixed(3)} (+${tolPlus}/-${tolMinus})</span>`;
             }
        }

        const colColor = POINT_COLORS[m.localCol % POINT_COLORS.length];
        const isLastInGroup = m.localCol === m.group.points.length - 1;
        const rightBorder = isLastInGroup ? `border-right:1px solid var(--border2);` : '';
        tableHTML += `<th style="padding:8px 4px; min-width:70px; color:${colColor}; font-weight:700; border-bottom:3px solid ${colColor}; ${rightBorder} line-height:1.4;">${m.ptName}${criteriaStr}</th>`;
    });
    tableHTML += `</tr></thead><tbody>`;

    for (let row = 1; row <= pcs; row++) {
        tableHTML += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px; border-right:1px solid var(--border2); text-align:left; font-weight:600;">Pc ${row}</td>`;
        colMap.forEach((m, idx) => {
            const inputId = `s2-${m.group.key}-pc${row}-pt${m.localCol}`;
            const ptColor = POINT_COLORS[m.localCol % POINT_COLORS.length];
            const isLastInGroup = m.localCol === m.group.points.length - 1;
            const rightBorder = isLastInGroup ? `border-right:1px solid var(--border2);` : '';
            
            // Extract existing value if any
            let existingVal = '';
            if (selectedRecord && selectedRecord.dimData && selectedRecord.dimData[m.group.key]) {
                const groupData = selectedRecord.dimData[m.group.key];
                if (groupData.pieces && groupData.pieces[row - 1]) {
                    const v = groupData.pieces[row - 1][m.localCol];
                    if (v !== null && v !== undefined) existingVal = v;
                }
            }

            tableHTML += `<td style="padding:4px; ${rightBorder}">
                <input type="number" id="${inputId}" step="0.0001" value="${existingVal}"
                style="width:100%; padding:6px; border:1px solid var(--border2); border-top:2px solid ${ptColor}; border-radius:4px; text-align:center; background:var(--bg);"
                placeholder="-"
                onpaste="handleStage2Paste(event, ${row}, ${idx}, ${pcs})"
                oninput="previewStage2Data()">
            </td>`;
        });
        tableHTML += `</tr>`;
    }
    tableHTML += `</tbody></table></div>`;

    container.innerHTML = `
        <div class="dim-group-block" style="margin-bottom:20px;">
            <div class="sec-label" style="border-color:var(--blue)40; margin-bottom:10px;">
                📏 Damper Dimensions (Datum & Non-datum)
                <span style="font-size:10px;margin-left:12px;color:var(--text3)">
                    💡 วางข้อมูล 8 คอลัมน์จาก Excel ได้เลย (Ctrl+V ที่ช่องแรก)
                </span>
            </div>
            ${tableHTML}
        </div>`;
        
    // Trigger coloring for existing values
    setTimeout(() => {
        if (selectedRecord) {
            colMap.forEach((m, idx) => {
                for (let row = 1; row <= pcs; row++) {
                    const el = document.getElementById(`s2-${m.group.key}-pc${row}-pt${m.localCol}`);
                    if (el && el.value !== '') {
                        colorStage2Cell(el, m.group.key, m.localCol, parseFloat(el.value));
                    }
                }
            });
            previewStage2Data();
        }
    }, 50);
}


// ─── Build Dimension Groups ───────────────────────────────────
function buildAllDimGroups(freqOverride) {
    const container = document.getElementById('dim-groups-container');
    if (!container) return;

    // Use the explicitly passed freqOverride first, then fall back to dataset, then default to 4
    const qtyEl = document.getElementById('m-qty');
    const pcs = (freqOverride && !isNaN(freqOverride) && freqOverride > 0)
        ? parseInt(freqOverride, 10)
        : (parseInt(qtyEl?.dataset.freqTarget, 10) || 4);

    const allGroups = DIM_GROUPS.datum;
    container.innerHTML = allGroups.map(g => buildGroupHTML(g, pcs)).join('');
}

function buildGroupHTML(g, pcs) {
    const lsl = g.lsl;
    const usl = g.usl;
    const isDatum = g.key.startsWith('datum');
    const accentColor = isDatum ? 'var(--blue)' : '#9B59B6';

    let tableHTML = `<div style="overflow-x:auto; margin-bottom:15px; border:1px solid var(--border2); border-radius:6px;">
        <table class="damper-grid" style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">
        <thead style="background:var(--bg2); color:var(--text3); border-bottom:1px solid var(--border2);">
            <tr>
                <th style="padding:8px; border-right:1px solid var(--border2); text-align:left; min-width:60px;">Piece</th>`;
    
    g.points.forEach(pt => {
        tableHTML += `<th style="padding:8px; min-width:80px;">${pt}</th>`;
    });
    tableHTML += `</tr></thead><tbody>`;

    for (let row = 1; row <= pcs; row++) {
        tableHTML += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px; border-right:1px solid var(--border2); text-align:left; font-weight:600;">Pc ${row}</td>`;
        for (let col = 0; col < g.points.length; col++) {
            const inputId = `${g.key}-pc${row}-pt${col}`;
            const ptName = g.points[col];
            const ptSpecs = g.pointSpecs && g.pointSpecs[ptName] ? g.pointSpecs[ptName] : g;
            const ptCL = ptSpecs.cl;
            
            tableHTML += `<td style="padding:4px;">
                <input type="number" id="${inputId}" step="0.0001" style="width:100%; padding:6px; border:1px solid var(--border2); border-radius:4px; text-align:center; background:var(--bg);" 
                placeholder="${ptCL !== null && ptCL !== undefined ? ptCL.toFixed(4) : ''}"
                oninput="calcGroupDim('${g.key}', ${pcs})"
                onkeydown="pieceEnterNav(event,'${inputId}','${g.key}',${row},${col},${pcs},${g.points.length})">
            </td>`;
        }
        tableHTML += `</tr>`;
    }
    tableHTML += `</tbody>`;

    // Summary Rows
    const summaryRows = ['Avg', 'Max', 'Min', 'Result'];
    tableHTML += `<tfoot style="background:var(--bg3); font-weight:600;">`;
    summaryRows.forEach(stat => {
        tableHTML += `<tr style="border-top:1px solid var(--border2);">
            <td style="padding:8px; border-right:1px solid var(--border2); text-align:left;">${stat}</td>`;
        g.points.forEach((pt, col) => {
            const id = `${g.key}-${stat.toLowerCase()}-pt${col}`;
            tableHTML += `<td id="${id}" style="padding:8px;">-</td>`;
        });
        tableHTML += `</tr>`;
    });
    tableHTML += `</tfoot></table></div>`;

    return `
        <div class="dim-group-block" id="grp-${g.key}" style="margin-bottom:24px;">
            <div class="sec-label" style="border-color:${accentColor}40; margin-bottom:12px;">
                📏 ${g.label}
                <span style="font-size:11px;color:var(--text3);font-weight:400;text-transform:none;letter-spacing:0;margin-left:8px">
                    ${g.subLabel} &nbsp;|&nbsp; LSL: ${lsl.toFixed(4)} ~ USL: ${usl.toFixed(4)}
                </span>
            </div>
            ${tableHTML}
        </div>`;
}

function pieceEnterNav(e, curId, groupKey, r, c, totalRows, totalCols) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    let nextId = null;
    if (r < totalRows) {
    nextId = `${groupKey}-pc${r + 1}-pt${c}`;
    } else if (c < totalCols - 1) {
        nextId = `${groupKey}-pc1-pt${c + 1}`;
    }
    const next = nextId ? document.getElementById(nextId) : null;
    if (next) next.focus();
    else document.getElementById('btn-save')?.focus();
}

// Handle paste into Stage 2 grid — fills cells from top-left (startRow, startCol) going right then down
function handleStage2Paste(e, startRow, absStartCol, totalRows) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text) return;

    // Parse pasted data: rows by newline, cols by tab (Excel default)
    const pastedRows = text.trim().split(/\r?\n/).map(row =>
        row.split(/\t/).map(cell => cell.trim().replace(',', '.'))
    );

    let colMap = [];
    DIM_GROUPS.datum.forEach(g => {
        g.points.forEach((pt, i) => {
            colMap.push({ groupKey: g.key, ptCol: i });
        });
    });

    let r = startRow;
    for (const rowData of pastedRows) {
        if (r > totalRows) break;
        let absC = absStartCol;
        for (const cellData of rowData) {
            if (absC >= colMap.length) break;
            
            const mapping = colMap[absC];
            const inputId = `s2-${mapping.groupKey}-pc${r}-pt${mapping.ptCol}`;
            const el = document.getElementById(inputId);
            if (el) {
                const v = parseFloat(cellData);
                el.value = isNaN(v) ? '' : v;
                // Update cell color based on spec
                colorStage2Cell(el, mapping.groupKey, mapping.ptCol, v);
            }
            absC++;
        }
        r++;
    }
    previewStage2Data();
}

function colorStage2Cell(el, groupKey, colIdx, v) {
    const g = DIM_GROUPS.datum.find(x => x.key === groupKey);
    if (!g || isNaN(v)) { el.style.background = 'var(--bg)'; return; }
    const ptName = g.points[colIdx];
    const ptSpecs = (g.pointSpecs && g.pointSpecs[ptName]) ? g.pointSpecs[ptName] : g;
    const lsl = ptSpecs.lsl ?? g.lsl;
    const usl = ptSpecs.usl ?? g.usl;
    if (v < lsl || v > usl) {
        el.style.background = 'var(--fail-bg)'; el.style.color = 'var(--fail)';
    } else if (lsl && usl && (v < lsl + (usl - lsl) * 0.1 || v > usl - (usl - lsl) * 0.1)) {
        el.style.background = 'rgba(243,156,18,0.1)'; el.style.color = '#f39c12';
    } else {
        el.style.background = 'var(--pass-bg)'; el.style.color = 'var(--pass)';
    }
}

function previewStage2Data() {
    parseStage2Data();
}

function parseStage2Data() {
    window._stage2Data = {};
    let html = `<h4 style="margin-bottom:8px;font-size:13px;">📊 Extracted Data Preview:</h4>`;
    let canMerge = true;

    // Determine pcs from selected merge record
    let pcs = 4;
    if (_selectedMergeId) {
        const rec = loadRecords().find(x => x.id === _selectedMergeId);
        if (rec) pcs = rec.freqTarget || rec.pcs || 4;
    } else {
        const qtyEl = document.getElementById('m-qty');
        pcs = parseInt(qtyEl?.dataset.freqTarget, 10) || 4;
    }

    DIM_GROUPS.datum.forEach(g => {
        const parsed2D = [];
        let hasAnyData = false;

        for (let row = 1; row <= pcs; row++) {
            const pcVals = [];
            for (let col = 0; col < g.points.length; col++) {
                const el = document.getElementById(`s2-${g.key}-pc${row}-pt${col}`);
                const v = el ? parseFloat(el.value) : NaN;
                pcVals.push(isNaN(v) ? null : v);
                if (!isNaN(v)) hasAnyData = true;
            }
            parsed2D.push(pcVals);
        }

        const filledRows = parsed2D.filter(r => r.some(v => v !== null)).length;
        const isDatum = g.key.startsWith('datum');
        const statusColor = filledRows === pcs ? 'var(--pass)' : (filledRows > 0 ? '#f39c12' : 'var(--text3)');
        html += `<div style="padding:6px 10px;margin-bottom:6px;background:var(--bg2);border-radius:6px;font-size:12px;">
            <b>${g.label}</b>: <span style="color:${statusColor};font-weight:700">${filledRows}/${pcs} pieces</span> filled
        </div>`;
        if (!hasAnyData) canMerge = false;
        window._stage2Data[g.key] = parsed2D;
    });

    const previewArea = document.getElementById('merge-preview-area');
    if (previewArea) previewArea.innerHTML = html;

    const btn = document.getElementById('btn-merge-damper');
    if (btn) btn.disabled = !canMerge;
}

async function commitStage2Damper() {
    if (!_selectedMergeId || !window._stage2Data) return;
    const recs = loadRecords();
    const idx = recs.findIndex(r => r.id === _selectedMergeId);
    if (idx === -1) return;


    const parsedDataMap = window._stage2Data;
    const mk = document.getElementById('merge-product').value;
    const p = PRODUCTS[mk] || { pcs: 4 };

    const r = recs[idx];

    let overallDimOk = true;

    DIM_GROUPS.datum.forEach(g => {
        const parsed2D = parsedDataMap[g.key] || [];
        const groupData = { points: g.points, pieces: [], result: 'Pass' };
        let allOk = true;
        let groupVals = [];

        for (let row = 0; row < r.freqTarget && row < parsed2D.length; row++) {
            const pcVals = parsed2D[row];
            groupData.pieces.push(pcVals);
            for (let col = 0; col < g.points.length && col < pcVals.length; col++) {
                const ptName = g.points[col];
                const ptSpecs = g.pointSpecs && g.pointSpecs[ptName] ? g.pointSpecs[ptName] : g;
                const val = pcVals[col];
                groupVals.push(val);
                if (val !== null) {
                    if (ptSpecs.lsl !== null && val < ptSpecs.lsl) allOk = false;
                    if (ptSpecs.usl !== null && val > ptSpecs.usl) allOk = false;
                }
            }
        }
        
        groupData.result = allOk ? 'Pass' : 'Fail';
        if (!allOk) overallDimOk = false;
        
        if (groupVals.length > 0) {
            groupData.avg = parseFloat((groupVals.reduce((a, b) => a + b, 0) / groupVals.length).toFixed(4));
            groupData.max = Math.max(...groupVals);
            groupData.min = Math.min(...groupVals);
        } else {
            groupData.avg = null; groupData.max = null; groupData.min = null;
        }

        r.dimData[g.key] = groupData;
    });

    r.overall = (r.vmiNG || !overallDimOk) ? 'Fail' : 'Pass';
    
    // Fallbacks for backward compatibility
    if (r.dimData['datum']) {
        r.short = { avg: r.dimData['datum'].avg, max: r.dimData['datum'].max, min: r.dimData['datum'].min, inSpec: r.dimData['datum'].result === 'Pass' };
    }
    if (r.dimData['nondatum']) {
        r.long = { avg: r.dimData['nondatum'].avg, max: r.dimData['nondatum'].max, min: r.dimData['nondatum'].min, inSpec: r.dimData['nondatum'].result === 'Pass' };
    }

    saveRecords(recs);
    await sendToBackendAndAlert(r);

    showToast(`✅ นำเข้าข้อมูล CMM สำเร็จ! Record #${r.no} ย้ายไปที่ Completed แล้ว`, 'success');
    _selectedMergeId = null;
    window._stage2Data = null;
    document.getElementById('merge-preview-area').innerHTML = '';
    document.getElementById('stage2-target-info').style.display = 'none';
    DIM_GROUPS.datum.forEach(g => {
        // Clear stage 2 grid inputs
        const r = loadRecords().find(x => x.id === _selectedMergeId);
        const pcs2 = r ? (r.freqTarget || r.pcs || 4) : 4;
        for (let row = 1; row <= pcs2; row++) {
            for (let col = 0; col < g.points.length; col++) {
                const el = document.getElementById(`s2-${g.key}-pc${row}-pt${col}`);
                if (el) { el.value = ''; el.style.background = 'var(--bg)'; el.style.color = 'var(--text)'; }
            }
        }
    });
    document.getElementById('btn-merge-damper').disabled = true;

    renderPendingTable();
    updateKPIs();
    updateBadges();
}

// ─── Calc Dimension for one group ────────────────────────────
function calcGroupDim(groupKey, pcs) {
    const allGroups = DIM_GROUPS.datum;
    const g = allGroups.find(x => x.key === groupKey);
    if (!g) return;

    const lsl = g.lsl;
    const usl = g.usl;
    
    // Validate values and styles per cell
    for (let row = 1; row <= pcs; row++) {
        for (let col = 0; col < g.points.length; col++) {
            const el = document.getElementById(`${groupKey}-pc${row}-pt${col}`);
            if (!el) continue;
            const v = parseFloat(el.value);
            el.style.backgroundColor = 'var(--bg)';
            el.style.color = 'var(--text)';
            if (!isNaN(v)) {
                // BUG FIX: use per-point specs instead of group-level only
                const ptName = g.points[col];
                const ptSpecs = (g.pointSpecs && g.pointSpecs[ptName]) ? g.pointSpecs[ptName] : g;
                const ptLsl = ptSpecs.lsl ?? lsl;
                const ptUsl = ptSpecs.usl ?? usl;
                if (v < ptLsl || v > ptUsl) {
                    el.style.backgroundColor = 'var(--fail-bg)';
                    el.style.color = 'var(--fail)';
                } else if (ptLsl != null && ptUsl != null && (v < ptLsl + (ptUsl - ptLsl) * 0.1 || v > ptUsl - (ptUsl - ptLsl) * 0.1)) {
                    el.style.backgroundColor = 'rgba(243, 156, 18, 0.1)';
                    el.style.color = '#f39c12';
                } else {
                    el.style.backgroundColor = 'var(--pass-bg)';
                    el.style.color = 'var(--pass)';
                }
            }
        }
    }

    let groupAllPass = true;

    // Calculate column summaries
    for (let col = 0; col < g.points.length; col++) {
        const colVals = [];
        for (let row = 1; row <= pcs; row++) {
            const el = document.getElementById(`${groupKey}-pc${row}-pt${col}`);
            if (el && !isNaN(parseFloat(el.value))) colVals.push(parseFloat(el.value));
        }

        if (!colVals.length) {
            setEl(`${groupKey}-avg-pt${col}`, '-', 'var(--text3)');
            setEl(`${groupKey}-max-pt${col}`, '-', 'var(--text)');
            setEl(`${groupKey}-min-pt${col}`, '-', 'var(--text)');
            setEl(`${groupKey}-result-pt${col}`, '-', 'var(--text)');
            groupAllPass = false;
            continue;
        }

        const avg = colVals.reduce((a, b) => a + b, 0) / colVals.length;
        const max = Math.max(...colVals);
        const min = Math.min(...colVals);
        // BUG FIX: use per-point specs for column pass/fail determination
        const ptName = g.points[col];
        const ptSpecs = (g.pointSpecs && g.pointSpecs[ptName]) ? g.pointSpecs[ptName] : g;
        const ptLsl = ptSpecs.lsl ?? lsl;
        const ptUsl = ptSpecs.usl ?? usl;
        const allOk = colVals.every(v => v >= ptLsl && v <= ptUsl);
        if (!allOk) groupAllPass = false;

        const accentColor = groupKey.startsWith('datum') ? 'var(--blue)' : '#9B59B6';
        
        setEl(`${groupKey}-avg-pt${col}`, fmt(avg, 5), allOk ? accentColor : 'var(--fail)');
        setEl(`${groupKey}-max-pt${col}`, fmt(max, 5));
        setEl(`${groupKey}-min-pt${col}`, fmt(min, 5));
        const resEl = document.getElementById(`${groupKey}-result-pt${col}`);
        if (resEl) {
            resEl.textContent = allOk ? 'PASS' : 'FAIL';
            resEl.style.color = allOk ? 'var(--pass)' : 'var(--fail)';
            resEl.style.fontWeight = '700';
        }
    }

    autoJudgeOverall();
}

function autoJudgeOverall() {
    const mode = document.getElementById('m-mode')?.value || 'buyoff';
    const isRoving = mode.includes('roving');

    const vmiNG = VMI_ITEMS.some(v => document.getElementById(`vmi-${v.id}`)?.value === 'Fail');

    // In Roving mode there are no dimension measurements — only VMI determines the result
    if (isRoving) {
        setOverallPF(vmiNG ? 'Fail' : 'Pass');
        return;
    }

    // Buy Off / OBA mode: check both VMI and dimension results
    const allGroups = DIM_GROUPS.datum;
    let dimAllPass = true;
    let dimHasData = false;
    allGroups.forEach(g => {
        if (!g.points) return;
        for (let col = 0; col < g.points.length; col++) {
            const el = document.getElementById(`${g.key}-result-pt${col}`);
            if (el && el.textContent === 'FAIL') { dimAllPass = false; dimHasData = true; }
            if (el && el.textContent !== '-') dimHasData = true;
        }
    });

    // If no dimension data entered yet, don't force Fail — leave Pass as default
    const val = (vmiNG || (dimHasData && !dimAllPass)) ? 'Fail' : 'Pass';
    setOverallPF(val);
}

// ════════════════════════════════════════════════════════════
//  Save Batch
// ════════════════════════════════════════════════════════════
async function saveManualDraft() {
    const key = document.getElementById('m-product')?.value;
    if (!key) { showToast('กรุณาเลือก Product ก่อน', 'warn'); return; }
    const p = PRODUCTS[key];

    const mode = document.getElementById('m-mode')?.value || 'buyoff';

    // VMI (สำหรับ 1 Batch)
    const vmiData = {};
    const items = VMI_ITEMS.filter(v => mode === 'roving' || v.id !== 'double');
    items.forEach(v => {
        vmiData[v.id] = document.getElementById(`vmi-${v.id}`)?.value || 'Pass';
    });
    const vmiNG = Object.values(vmiData).some(v => v === 'Fail');

    const draftId = 'DRAFT_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    const qtyEl = document.getElementById('m-qty');
    const pcs = parseInt(qtyEl?.dataset.freqTarget, 10) || p.pcs;

    const dateStr = document.getElementById('m-date')?.value || todayISO();
    const mcStr = document.getElementById('m-mc')?.value || p.mc;
    const sendTimeStr = document.getElementById('m-send-time')?.value || '';
    const groupKey = `${key}|${mcStr}|${dateStr}|${sendTimeStr}|${mode}`;

    const records = loadRecords();

    // Extract Data from Grid
    const dimData = {};
    DIM_GROUPS.datum.forEach(g => {
        const groupData = { points: g.points, pieces: [] };
        let allOk = true;
        for (let row = 1; row <= pcs; row++) {
            const pcVals = [];
            for (let col = 0; col < g.points.length; col++) {
                const ptName = g.points[col];
                const ptSpecs = g.pointSpecs && g.pointSpecs[ptName] ? g.pointSpecs[ptName] : g;
                
                const el = document.getElementById(`${g.key}-pc${row}-pt${col}`);
                const val = el && el.value !== '' ? parseFloat(el.value) : null;
                pcVals.push(val);
                
                if (val !== null) {
                    if (ptSpecs.lsl !== null && val < ptSpecs.lsl) allOk = false;
                    if (ptSpecs.usl !== null && val > ptSpecs.usl) allOk = false;
                }
            }
            groupData.pieces.push(pcVals);
        }
        groupData.result = allOk ? 'Pass' : 'Fail';
        dimData[g.key] = groupData;
    });

    const isGridEmpty = Object.values(dimData).every(g => g.pieces.every(row => row.every(v => v === null)));

    const rec = {
        id: draftId,
        no: 0,
        mode,
        date: dateStr,
        product: key,
        productLabel: p.label,
        mc: mcStr,
        team: document.getElementById('m-team')?.value || '',
        qcEn: (document.getElementById('m-en')?.value || '').trim(),
        meEn: (document.getElementById('m-me-en')?.value || '').trim(),
        traveler: (document.getElementById('m-traveler')?.value || '').trim(),
        partno: (document.getElementById('m-partno')?.value || '').trim(),
        ptno: (document.getElementById('m-ptno')?.value || '').trim(),
        qty: (document.getElementById('m-qty')?.value || '').trim(),
        freqTarget: pcs,
        sendTime: sendTimeStr,
        recvTime: document.getElementById('m-recv-time')?.value || '',
        attribute: document.getElementById('m-attribute')?.value || 'Normal',
        pcs: pcs, // number of pieces
        dimData: dimData,
        vmi: vmiData,
        vmiNG,
        overall: isGridEmpty ? 'DRAFT_WAITING' : 'WAITING',
        savedAt: new Date().toISOString(),
    };

    if (mode === 'roving' && !isGridEmpty) {
        rec.overall = (vmiNG || Object.values(dimData).some(g => g.result === 'Fail')) ? 'Fail' : 'Pass';
    }

    records.unshift(rec);
    saveRecords(records);

    if (isGridEmpty) {
        showToast(`✅ สร้าง Draft เปล่าสำหรับ Stage 2 สำเร็จ`, 'success');
    } else {
        showToast(`✅ บันทึกข้อมูลทั้ง Batch สำเร็จ`, 'success');
    }

    resetVmiForm();
    
    // Clear grid inputs
    DIM_GROUPS.datum.forEach(g => {
        for (let row = 1; row <= pcs; row++) {
            for (let col = 0; col < g.points.length; col++) {
                const el = document.getElementById(`${g.key}-pc${row}-pt${col}`);
                if (el) { el.value = ''; el.style.backgroundColor = 'var(--bg)'; el.style.color = 'var(--text)'; }
            }
        }
        for (let col = 0; col < g.points.length; col++) {
            setEl(`${g.key}-avg-pt${col}`, '-', 'var(--text3)');
            setEl(`${g.key}-max-pt${col}`, '-', 'var(--text)');
            setEl(`${g.key}-min-pt${col}`, '-', 'var(--text)');
            setEl(`${g.key}-result-pt${col}`, '-', 'var(--text)');
        }
    });

    renderPendingTable();
    updateKPIs();
    updateBadges();
}

function resetVmiForm() {
    VMI_ITEMS.forEach(v => {
        const el = document.getElementById(`vmi-${v.id}`);
        if (el) {
            el.value = 'Pass';
            el.classList.remove('ng-value');
        }
    });
    const overallEl = document.getElementById('m-vmi-overall');
    if (overallEl) {
        overallEl.className = 'badge badge-in';
        overallEl.textContent = 'PASS';
    }
}

function pushToAboutData(groupKey) {
    const records = loadRecords();
    const drafts = records.filter(r =>
        r.overall === 'DRAFT_WAITING' &&
        `${r.product}|${r.mc}|${r.date}|${r.sendTime}|${r.mode}` === groupKey
    );

    if (drafts.length === 0) return;

    const sample = drafts[0];
    // จำนวนที่ต้องครบ: อิงตาม Frequency ที่ตั้งค่าไว้ (freqTarget) เป็นหลัก ไม่ใช่ pcs/batch ที่ fix ไว้ในระบบ
    const requiredQty = sample.freqTarget || sample.pcs;
    if (drafts.length < requiredQty) {
        showToast(`⚠️ ไม่สามารถบันทึกได้ (ต้องกรอกให้ครบ ${requiredQty} ชิ้นตาม Frequency ก่อน — ตอนนี้มี ${drafts.length} ชิ้น)`, 'warn');
        return;
    }

    const draftsToMerge = drafts.slice(0, requiredQty);
    const baseNo = records.filter(r => r.overall !== 'DRAFT_WAITING' && r.overall !== 'WAITING').length;

    const finalizedDrafts = draftsToMerge.map((draft, i) => {
        return {
            ...draft,
            id: Date.now().toString() + '_' + i,
            no: baseNo + i + 1,
            overall: sample.mode === 'roving' ? (draft.vmiNG ? 'Fail' : 'Pass') : 'WAITING',
            mergedQty: 1
        };
    });

    const newRecords = records.filter(r => !draftsToMerge.find(d => d.id === r.id));
    newRecords.push(...finalizedDrafts);
    saveRecords(newRecords);

    if (sample.mode === 'roving') {
        for (const rec of finalizedDrafts) {
            sendToBackendAndAlert(rec);
        }
        showToast(`🎉 Roving Audit ข้อมูล ${sample.productLabel} ครบ ${requiredQty} ชิ้นแล้ว บันทึกเรียบร้อย!`, 'success');
    } else {
        showToast(`🎉 นำเข้าข้อมูล ${sample.productLabel} จำนวน ${requiredQty} รายการ ไปยัง Stage 2 สำเร็จ!`, 'success');
    }

    renderPendingTable();
    updateKPIs();
    updateBadges();
}

async function sendToBackendAndAlert(rec) {
    const failIssues = [];
    if (rec.vmiNG) {
        const items = VMI_ITEMS.filter(v => rec.mode === 'roving' || v.id !== 'double');
        failIssues.push('VMI NG: ' + items.filter(v => rec.vmi[v.id] === 'Fail').map(v => v.label).join(', '));
        updateBadges();
    }

    if (window.BLoader) window.BLoader.show('กำลังบันทึกลงฐานข้อมูลถาวร...');
    await saveRecordToServer(rec);
    if (failIssues.length) await sendSystemAlert('ng', failIssues.join(' | '), rec, failIssues);
    if (window.BLoader) window.BLoader.hide();
    await refreshDataFromServer();
}

function renderPendingTable() {
    const wrap = document.getElementById('pending-table-wrap');
    if (!wrap) return;

    const records = loadRecords();
    const groups = {};
    records.filter(r => r.overall === 'DRAFT_WAITING').forEach(r => {
        const key = `${r.product}|${r.mc}|${r.date}|${r.sendTime}|${r.mode}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    let html = '';
    Object.entries(groups).forEach(([key, recs]) => {
        recs.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
        const sample = recs[0];
        const batchFill = recs.length;
        const totalReq = sample.freqTarget || sample.pcs;
        const batchPct = Math.min(100, Math.round((batchFill / totalReq) * 100));
        const progressColor = batchFill >= totalReq ? 'var(--pass)' : 'var(--blue)';
        const canPush = batchFill >= totalReq;

        html += `<div style="margin-bottom:18px;border:1.5px solid var(--border2);border-radius:8px;overflow:hidden;">
          <div style="padding:10px 16px;background:var(--bg3);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-weight:700;color:var(--text);font-size:13px;">📦 ${sample.productLabel}</span>
            <span class="badge" style="background:rgba(9,132,227,0.12);color:var(--blue);font-weight:600;">${sample.mode === 'roving' ? 'Roving Audit' : 'Buy off'}</span>
            <span style="font-size:12px;color:var(--text2);">M/C: <b>${sample.mc}</b> &nbsp;|&nbsp; Date: ${sample.date}</span>
            
            <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
              <button class="btn btn-primary btn-sm" onclick="pushToAboutData('${key}')" ${canPush ? '' : 'disabled title="กรอกข้อมูลให้ครบตาม Frequency ก่อน"'}>💾 ${sample.mode === 'roving' ? 'บันทึกเข้าระบบ' : 'นำเข้า About Data (Waiting)'}</button>
              
              <div style="width:80px;height:8px;background:var(--bg4);border-radius:4px;overflow:hidden;margin-left:10px;">
                <div style="width:${batchPct}%;height:100%;background:${progressColor};border-radius:4px;transition:width 0.3s;"></div>
              </div>
              <span style="font-size:12px;font-weight:700;color:${progressColor}">${batchFill}/${totalReq} ชิ้น (ตาม Frequency)</span>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
            <thead style="background:var(--bg2);color:var(--text3);border-bottom:1px solid var(--border2);">
              <tr>
                <th style="padding:8px 16px;width:50px">#</th>
                <th style="padding:8px 16px">DRAFT ID</th>
                <th style="padding:8px 16px">CREATED</th>
                <th style="padding:8px 16px">ACTIONS</th>
              </tr>
            </thead>
            <tbody>`;

        recs.forEach((r, idx) => {
            const t = r.savedAt ? new Date(r.savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
            html += `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:8px 16px;font-weight:600">${idx + 1}</td>
              <td style="padding:8px 16px">${r.id.slice(0, 15)}...</td>
              <td style="padding:8px 16px;color:var(--text3)">${r.date} ${t}</td>
              <td style="padding:8px 16px">
                <button class="btn btn-outline btn-sm" onclick="deleteDraft('${r.id}')" style="color:var(--fail);border-color:transparent;background:var(--fail-bg);padding:4px 8px">🗑️</button>
              </td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    });

    if (!html) {
        html = `<div class="empty" style="padding:20px"><div class="ei">📭</div><p>ยังไม่มี Pending Records — กด "Save Draft" เพื่อเริ่มต้น</p></div>`;
    }
    wrap.innerHTML = html;

    const pendingCount = Object.keys(groups).length;
    const badge = document.getElementById('badge-pending');
    if (badge) badge.textContent = pendingCount;
}

function deleteDraft(id) {
    const records = loadRecords().filter(r => r.id !== id);
    saveRecords(records);
    renderPendingTable();
    showToast('ลบ Draft สำเร็จ', 'success');
}

function clearAllDrafts() {
    showConfirm('Clear All Drafts', 'ต้องการลบ Drafts ทั้งหมดใช่หรือไม่?', () => {
        const records = loadRecords().filter(r => r.overall !== 'DRAFT_WAITING' && r.overall !== 'WAITING' && r.overall !== 'Waiting');
        saveRecords(records);
        renderPendingTable();
        showToast('ล้าง Drafts เรียบร้อย', 'success');
    });
}

function clearForm() {
    ['m-mc', 'm-partno', 'm-ptno', 'm-traveler', 'm-qc-en', 'm-en', 'm-me-en', 'm-send-time', 'm-recv-time', 'm-qty'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const qtyEl = document.getElementById('m-qty');
    if (qtyEl) delete qtyEl.dataset.freqTarget;
    const dateEl = document.getElementById('m-date');
    if (dateEl) dateEl.value = todayISO();
    const prodEl = document.getElementById('m-product');
    if (prodEl) prodEl.value = '';
    setOverallPF('Pass');
    const attrEl = document.getElementById('m-attribute');
    if (attrEl) attrEl.value = 'Normal';

    VMI_ITEMS.forEach(v => {
        setVmiPF(v.id, 'Pass');
    });

    const vmiSec = document.getElementById('vmi-section');
    const dimSec = document.getElementById('dim-section');
    const ovSec = document.getElementById('overall-section');
    const noMsg = document.getElementById('no-product-msg');
    if (vmiSec) vmiSec.style.display = 'none';
    if (dimSec) dimSec.style.display = 'none';
    if (ovSec) ovSec.style.display = 'none';
    if (noMsg) noMsg.style.display = 'block';

    const infoBar = document.getElementById('form-spec-label');
    if (infoBar) infoBar.textContent = 'เลือก Product → ระบบจะโหลด M/C, จำนวนชิ้น และ Spec อัตโนมัติ';
}

// ════════════════════════════════════════════════════════════
//  KPI & Badges
// ════════════════════════════════════════════════════════════
function updateKPIs() {
    const recs = loadRecords();
    const today = todayISO();
    const passes = recs.filter(r => r.overall === 'Pass').length;
    const fails = recs.filter(r => r.overall === 'Fail').length;
    const vmiNG = recs.filter(r => r.vmiNG).length;
    const todayR = recs.filter(r => r.date === today).length;
    const yield_ = recs.length ? ((passes / recs.length) * 100).toFixed(1) : null;
    const sAvgs = recs.map(r => r.datumAvg).filter(v => v && v > 0);
    const lAvgs = recs.map(r => r.nondatumAvg).filter(v => v && v > 0);
    const sAvg = sAvgs.length ? sAvgs.reduce((a, b) => a + b, 0) / sAvgs.length : null;
    const lAvg = lAvgs.length ? lAvgs.reduce((a, b) => a + b, 0) / lAvgs.length : null;

    setKpi('kpi-total', recs.length);
    setKpi('kpi-today', todayR);
    setKpi('kpi-pass', passes);
    setKpi('kpi-fail', fails);
    setKpi('kpi-vmi-ng', vmiNG);
    setKpi('kpi-yield', yield_ !== null ? yield_ + '%' : '—%');
    setKpi('kpi-avg-datum', sAvg !== null ? sAvg.toFixed(5) : '—');
    setKpi('kpi-avg-nondatum', lAvg !== null ? lAvg.toFixed(5) : '—');
}

function setKpi(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function updateBadges() {
    const recs = loadRecords();
    setKpi('badge-records', recs.length);
    if (typeof refreshNavBadges === 'function') {
        refreshNavBadges({ damper: recs.length });
    }
}

// ════════════════════════════════════════════════════════════
//  Records Table
// ════════════════════════════════════════════════════════════
function sortTable(col) {
    _sortDir = (_sortCol === col) ? _sortDir * -1 : -1;
    _sortCol = col;
    renderRecords();
}

function resetFilter() {
    ['flt-search', 'flt-product', 'flt-result', 'flt-from', 'flt-to'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    renderRecords();
}

function renderRecords() {
    let recs = loadRecords();

    const search = document.getElementById('flt-search')?.value.toLowerCase() || '';
    const product = document.getElementById('flt-product')?.value || '';
    const result = document.getElementById('flt-result')?.value || '';
    const from = document.getElementById('flt-from')?.value || '';
    const to = document.getElementById('flt-to')?.value || '';

    if (search) recs = recs.filter(r => [r.qcEn, r.traveler, r.productLabel].some(s => (s || '').toLowerCase().includes(search)));
    if (product) recs = recs.filter(r => r.product === product);
    if (result) recs = recs.filter(r => r.overall === result);
    if (from) recs = recs.filter(r => r.date >= from);
    if (to) recs = recs.filter(r => r.date <= to);

    recs.sort((a, b) => {
        const av = a[_sortCol] ?? 0, bv = b[_sortCol] ?? 0;
        return av < bv ? -_sortDir : av > bv ? _sortDir : 0;
    });

    const countLabel = document.getElementById('records-count-label');
    if (countLabel) countLabel.textContent = `แสดง ${recs.length} จาก ${loadRecords().length} รายการ`;

    const tbody = document.getElementById('records-body');
    if (!tbody) return;

    if (!recs.length) {
        tbody.innerHTML = `<tr><td colspan="21" style="text-align:center;padding:32px;color:var(--text3)"><div style="font-size:28px;margin-bottom:8px">📋</div>ไม่พบข้อมูล</td></tr>`;
        updateDeleteSelectedState();
        return;
    }

    const ovBadge = v => {
        if (v === 'Pass') return `<span class="badge-pass">Pass</span>`;
        if (v === 'WAITING' || v === 'Waiting') return `<span class="badge-out" style="background:rgba(9,132,227,.12);color:var(--blue)">⏳ Waiting</span>`;
        return `<span class="badge-fail">Fail</span>`;
    };
    const dimBadge = v => v === 'Pass' ? `<span class="badge-in">PASS</span>` : `<span class="badge-out">FAIL</span>`;
    const vmiSum = r => {
        const ng = VMI_ITEMS.filter(v => r.vmi && r.vmi[v.id] === 'Fail').map(v => v.label);
        return ng.length ? `<span class="badge-out" title="${ng.join(', ')}">${ng.length} NG</span>` : `<span class="badge-in">OK</span>`;
    };
    const spcSummary = (r) => {
        if (!r.dimData || Object.keys(r.dimData).length === 0) return `<span style="color:var(--text3)">—</span>`;
        let html = '';
        Object.keys(r.dimData).forEach(k => {
            const g = r.dimData[k];
            const color = g.result === 'Pass' ? 'var(--blue)' : 'var(--fail)';
            html += `<div style="margin-bottom:2px"><b>${k}</b>: <span style="font-weight:700;color:${color}">${g.avg?.toFixed(5) || '—'}</span> ${dimBadge(g.result)}</div>`;
        });
        return html;
    };

    tbody.innerHTML = recs.map(r => `
        <tr>
            <td><input type="checkbox" class="row-chk" data-id="${r.id}" onchange="updateDeleteSelectedState()"></td>
            <td style="font-weight:700;color:var(--text3)">${r.no}</td>
            <td style="font-size:12px;white-space:nowrap">${r.date}</td>
            <td style="font-weight:600;font-size:12px">${r.productLabel}</td>
            <td>${r.mc || '—'}</td>
            <td style="font-weight:600">${r.qcEn || '—'}</td>
            <td style="font-size:11px">${r.attribute || '—'}</td>
            <td style="text-align:center">${r.pcs}</td>
            <td style="font-size:11px">${spcSummary(r)}</td>
            <td>${vmiSum(r)}</td>
            <td>${ovBadge(r.overall)}</td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    ${(r.overall === 'WAITING' || r.overall === 'Waiting') ? `<button class="btn btn-primary btn-sm" style="font-size:10px;padding:2px 6px;background:var(--blue)" onclick="selectPendingForMerge('${r.id}')" title="ไปที่ Stage 2 เพื่อกรอกค่า Datum/Non-datum สำหรับ Record นี้">➡️ Stage 2</button>` : ''}
                    <button class="icon-btn" onclick="viewRecord('${r.id}')" title="View">🔍</button>
                    <button class="icon-btn" onclick="editRecord('${r.id}')" title="Edit">✏️</button>
                    <button class="icon-btn icon-btn-danger" onclick="deleteRecord('${r.id}')" title="Delete">🗑</button>
                </div>
            </td>
        </tr>`).join('');

    updateDeleteSelectedState();
}

// ─── Bulk selection (checkbox column) ─────────────────────────
function toggleSelectAllRecords(master) {
    document.querySelectorAll('.row-chk').forEach(c => { c.checked = master.checked; });
    updateDeleteSelectedState();
}

function updateDeleteSelectedState() {
    const allChk = document.querySelectorAll('.row-chk');
    const checked = document.querySelectorAll('.row-chk:checked');
    const btn = document.getElementById('btn-delete-selected');
    const countEl = document.getElementById('selected-count');
    if (countEl) countEl.textContent = checked.length;
    if (btn) btn.disabled = checked.length === 0;
    const master = document.getElementById('chk-select-all');
    if (master) master.checked = allChk.length > 0 && checked.length === allChk.length;
}

function deleteSelectedRecords() {
    const ids = Array.from(document.querySelectorAll('.row-chk:checked')).map(c => c.dataset.id);
    if (!ids.length) return;
    showConfirm('ลบข้อมูลที่เลือก', `ยืนยันลบ ${ids.length} รายการที่เลือก?`, async () => {
        const recs = loadRecords();
        const toDelete = recs.filter(r => ids.includes(r.id));
        if (typeof isServerOnline !== 'undefined' && isServerOnline) {
            for (const rec of toDelete) {
                try {
                    await fetch(`${BACKEND_URL}/api/damper/records/${rec.no}`, { method: 'DELETE' });
                } catch (e) { console.error('Delete Damper Record Error:', e); }
            }
            await refreshDataFromServer();
        } else {
            saveRecords(recs.filter(r => !ids.includes(r.id)));
            updateKPIs(); updateBadges(); renderRecords();
        }
        showToast(`ลบข้อมูลที่เลือกสำเร็จ (${ids.length} รายการ)`, 'success');
    });
}

function viewRecord(id) {
    const r = loadRecords().find(x => x.id === id);
    if (!r) return;
    const p = PRODUCTS[r.product] || {};
    const allGroups = [...DIM_GROUPS.datum];

    let dimHTML = allGroups.map(g => {
        const d = r.dimData?.[g.key];
        if (!d) return '';
        
        let ptsHTML = '';
        if (d.points) {
            Object.keys(d.points).forEach(ptName => {
                const pt = d.points[ptName];
                const ptVals = (pt.vals || []).map(v => `<span style="background:var(--bg);padding:1px 4px;border-radius:2px;">${v}</span>`).join(' ');
                ptsHTML += `<div style="font-size:11px; margin-bottom:4px; padding:4px; background:var(--bg2); border-radius:4px;">
                    <b style="color:var(--text3)">${ptName}:</b> ${ptVals} 
                    <span style="float:right">
                        Avg: <b style="color:${pt.result === 'Pass' ? 'var(--blue)' : 'var(--fail)'}">${pt.avg}</b> | 
                        Max: ${pt.max} | Min: ${pt.min} | 
                        <b style="color:${pt.result === 'Pass' ? 'var(--pass)' : 'var(--fail)'}">${pt.result}</b>
                    </span>
                </div>`;
            });
        }
        
        return `
            <div style="margin-bottom:10px">
                <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px">${g.label}</div>
                ${ptsHTML}
                <div style="font-size:12px; margin-top:6px; padding-top:6px; border-top:1px dashed var(--border2);">
                    Group Avg: <b style="color:${d.result === 'Pass' ? 'var(--blue)' : 'var(--fail)'}">${d.avg}</b> &nbsp;
                    Max: <b>${d.max}</b> &nbsp;
                    Min: <b>${d.min}</b> &nbsp;
                    Result: <b style="color:${d.result === 'Pass' ? 'var(--pass)' : 'var(--fail)'}">${d.result}</b>
                </div>
            </div>`;
    }).join('');

    const vmiList = VMI_ITEMS.map(v =>
        `<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${r.vmi?.[v.id] === 'Fail' ? 'rgba(231,76,60,.12)' : 'rgba(39,174,96,.08)'};color:${r.vmi?.[v.id] === 'Fail' ? 'var(--fail)' : 'var(--pass)'}">${v.label}: ${r.vmi?.[v.id] || 'Pass'}</span>`
    ).join(' ');

    document.getElementById('modal-view-body').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px;font-size:12px">
            <div><span style="color:var(--text3)">Date:</span> <b>${r.date}</b></div>
            <div><span style="color:var(--text3)">Product:</span> <b>${r.productLabel}</b></div>
            <div><span style="color:var(--text3)">Part No.:</span> ${r.partno || '—'}</div>
            <div><span style="color:var(--text3)">PT No.:</span> ${r.ptno || '—'}</div>
            <div><span style="color:var(--text3)">M/C:</span> ${r.mc || '—'}</div>
            <div><span style="color:var(--text3)">Team:</span> ${r.team || '—'}</div>
            <div><span style="color:var(--text3)">QC EN#:</span> <b>${r.qcEn || '—'}</b></div>
            <div><span style="color:var(--text3)">ME EN#:</span> ${r.meEn || '—'}</div>
            <div><span style="color:var(--text3)">Traveler:</span> ${r.traveler || '—'}</div>
            <div><span style="color:var(--text3)">Send:</span> ${r.sendTime || '—'}</div>
            <div><span style="color:var(--text3)">Recv:</span> ${r.recvTime || '—'}</div>
            <div><span style="color:var(--text3)">Attribute:</span> ${r.attribute || '—'}</div>
            <div><span style="color:var(--text3)">Pcs:</span> ${r.mergedQty || r.pcs} ${r.freqTarget ? `<span style="color:var(--text3);font-size:10px">(ตาม Frequency: ${r.freqTarget})</span>` : ''}</div>
        </div>
        <div style="margin-bottom:12px">
            <div class="sec-label" style="margin-bottom:8px">📏 Dimension Results</div>
            ${dimHTML}
        </div>
        <div style="margin-bottom:12px">
            <div class="sec-label" style="margin-bottom:8px">🔍 VMI Disposition</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">${vmiList}</div>
        </div>
        <div style="padding:10px 14px;border-radius:8px;background:${r.overall === 'Pass' ? 'rgba(39,174,96,.08)' : 'rgba(231,76,60,.08)'};border:1px solid ${r.overall === 'Pass' ? 'rgba(39,174,96,.3)' : 'rgba(231,76,60,.3)'}">
            <span style="font-size:13px;font-weight:800;color:${r.overall === 'Pass' ? 'var(--pass)' : 'var(--fail)'}">Overall: ${r.overall}</span>
        </div>`;

    document.getElementById('modal-view').style.display = 'flex';
}

function deleteRecord(id) {
    showConfirm('ลบข้อมูล', 'ยืนยันลบ Batch นี้?', async () => {
        const rec = loadRecords().find(r => r.id === id);
        if (rec && typeof isServerOnline !== 'undefined' && isServerOnline) {
            try {
                await fetch(`${BACKEND_URL}/api/damper/records/${rec.no}`, { method: 'DELETE' });
                await refreshDataFromServer();
            } catch (e) { console.error('Delete Damper Record Error:', e); }
        } else {
            saveRecords(loadRecords().filter(r => r.id !== id));
            updateKPIs(); updateBadges(); renderRecords();
        }
        showToast('ลบข้อมูลสำเร็จ', 'success');
    });
}

function clearAllRecords() {
    showConfirm('ล้างข้อมูลทั้งหมด', 'ยืนยันล้าง Records ทั้งหมด?', () => {
        saveRecords([]); updateKPIs(); updateBadges(); renderRecords();
        showToast('ล้างข้อมูลทั้งหมดสำเร็จ', 'success');
    });
}

function exportCSV() {
    const recs = loadRecords();
    if (!recs.length) { showToast('ไม่มีข้อมูล', 'warn'); return; }
    const headers = [
        'No', 'Date', 'Mode', 'Product', 'MC', 'Team', 'QC_EN', 'ME_EN', 'Traveler',
        'SendTime', 'RecvTime', 'Attribute', 'Pcs',
        'Datum_Avg', 'Datum_Max', 'Datum_Min', 'Datum_Result',
        'Non_Datum_Avg', 'Non_Datum_Max', 'Non_Datum_Min', 'Non_Datum_Result',
        'VMI_NG', 'Overall',
    ];
    const rows = recs.map(r => {
        const d = r.dimData || {};
        const gd = (k) => d[k] || {};
        return [
            r.no, r.date, r.mode || 'Buy off', r.productLabel, r.mc, r.team, r.qcEn, r.meEn, r.traveler,
            r.sendTime || '', r.recvTime || '', r.attribute, r.pcs,
            r.datumAvg || '', r.datumMax || '', r.datumMin || '', r.datumResult || '',
            r.nondatumAvg || '', r.nondatumMax || '', r.nondatumMin || '', r.nondatumResult || '',
            r.vmiNG ? 'YES' : 'NO', r.overall,
        ];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    a.download = `Damper_Records_${todayISO()}.csv`;
    a.click();
}

// ════════════════════════════════════════════════════════════
//  SPC Charts
// ════════════════════════════════════════════════════════════
function renderCharts() {
    const key = document.getElementById('viz-product')?.value || '';
    let recs = loadRecords().filter(r => r.overall !== 'WAITING' && r.overall !== 'Waiting' && r.overall !== 'DRAFT_WAITING' && r.overall !== 'DRAFT');
    if (key) recs = recs.filter(r => r.product === key);

    const labels = recs.map(r => `#${r.no} ${r.date.slice(5)}`);
    const datumAvgs = recs.map(r => r.datumAvg);
    const nondatumAvgs = recs.map(r => r.nondatumAvg);

    // Dynamic specs from LocalStorage Config
    if (key) {
        applyDamperConfigForProduct(key);
    } else {
        applyDamperConfigForProduct('');
    }

    const datumGroup = DIM_GROUPS.datum.find(x => x.key === 'datum');
    const nondatumGroup = DIM_GROUPS.datum.find(x => x.key === 'nondatum');

    let sLSL = datumGroup.lsl !== null ? datumGroup.lsl : 1.348;
    let sUSL = datumGroup.usl !== null ? datumGroup.usl : 1.368;
    let sNom = datumGroup.cl !== null ? datumGroup.cl : 1.358;

    let lLSL = nondatumGroup.lsl !== null ? nondatumGroup.lsl : 0.804;
    let lUSL = nondatumGroup.usl !== null ? nondatumGroup.usl : 0.824;
    let lNom = nondatumGroup.cl !== null ? nondatumGroup.cl : 0.814;

    const slbl = document.getElementById('datum-lbl');
    if (slbl) slbl.textContent = `Datum • LSL: ${sLSL.toFixed(3)} | CL: ${sNom.toFixed(3)} | USL: ${sUSL.toFixed(3)}`;
    const llbl = document.getElementById('nondatum-lbl');
    if (llbl) llbl.textContent = `Non-datum • LSL: ${lLSL.toFixed(3)} | CL: ${lNom.toFixed(3)} | USL: ${lUSL.toFixed(3)}`;

    _cShort = buildTrendChart('chart-datum', _cShort, labels, datumAvgs, 'Datum Avg', [
        { label: 'LSL', val: sLSL, color: 'rgba(231,76,60,.8)' },
        { label: 'CL', val: sNom, color: 'rgba(39,174,96,.8)' },
        { label: 'USL', val: sUSL, color: 'rgba(231,76,60,.8)' },
    ]);
    _cLong = buildTrendChart('chart-nondatum', _cLong, labels, nondatumAvgs, 'Non-datum Avg', [
        { label: 'LSL', val: lLSL, color: 'rgba(231,76,60,.8)' },
        { label: 'CL', val: lNom, color: 'rgba(155,89,182,.8)' },
        { label: 'USL', val: lUSL, color: 'rgba(231,76,60,.8)' },
    ]);

    buildProductChart();
    buildVMIChart(recs);
}

function buildTrendChart(id, existing, labels, data, label, limits) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return existing;
    if (existing) existing.destroy();
    const limitDS = limits.map(l => ({
        label: l.label, data: Array(data.length).fill(l.val),
        borderColor: l.color, borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, fill: false, tension: 0,
    }));
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label, data,
                borderColor: 'rgba(124,58,237,.85)', backgroundColor: 'rgba(124,58,237,.08)',
                borderWidth: 2, pointRadius: 4, pointHoverRadius: 7, tension: .3, fill: true,
            }, ...limitDS],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
            scales: {
                x: { ticks: {autoSkip: false,  font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' } },
                y: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' } },
            },
        },
    });
}

function buildProductChart() {
    const ctx = document.getElementById('chart-product')?.getContext('2d');
    if (!ctx) return;
    if (_cProd) _cProd.destroy();
    const recs = loadRecords();
    const grouped = {};
    recs.forEach(r => {
        if (!grouped[r.productLabel]) grouped[r.productLabel] = { pass: 0, fail: 0 };
        if (r.overall === 'Pass') grouped[r.productLabel].pass++;
        else grouped[r.productLabel].fail++;
    });
    const labels = Object.keys(grouped);
    if (!labels.length) return;
    _cProd = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Pass', data: labels.map(l => grouped[l].pass), backgroundColor: 'rgba(39,174,96,.75)', borderRadius: 4 },
                { label: 'Fail', data: labels.map(l => grouped[l].fail), backgroundColor: 'rgba(231,76,60,.75)', borderRadius: 4 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { x: { ticks: {autoSkip: false,  font: { size: 9 } } }, y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
    });
}

function buildVMIChart(recs) {
    const ctx = document.getElementById('chart-vmi')?.getContext('2d');
    if (!ctx) return;
    if (_cVmi) _cVmi.destroy();
    const counts = VMI_ITEMS.map(v => recs.filter(r => r.vmi && r.vmi[v.id] === 'Fail').length);
    _cVmi = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: VMI_ITEMS.map(v => v.label),
            datasets: [{ label: 'NG Count', data: counts, backgroundColor: 'rgba(231,76,60,.7)', borderRadius: 4 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: {autoSkip: false,  font: { size: 9 } } }, y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
    });
}

// ------------------------------------------------------------------------------------------
//  Backend
// ------------------------------------------------------------------------------------------
async function checkBackendConnection() {
    try {
        const r = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
        const data = await r.json();
        isServerOnline = data.status === 'ok' || data.status === 'OK';
    } catch { isServerOnline = false; }
    updateConnectionUI();
}

// โหลดข้อมูลจาก MySQL มาแสดงที่หน้าเว็บ
async function refreshDataFromServer() {
    window.BLoader?.showIfSlow('กำลังดึงข้อมูล');
    try {
        try {
            const confRes = await fetch(`${BACKEND_URL}/api/config/damper`);
            const confData = await confRes.json();
            if (confData.success && confData.data) {
                if (!window.DAMPER_LIMITS) window.DAMPER_LIMITS = {};
                confData.data.forEach(lim => {
                    if (!window.DAMPER_LIMITS[lim.product_key]) window.DAMPER_LIMITS[lim.product_key] = {};
                    window.DAMPER_LIMITS[lim.product_key][lim.dimension_name] = lim;
                });
            }
        } catch (e) { console.warn('Failed to fetch damper config', e); }

        const resRecs = await fetch(`${BACKEND_URL}/api/damper/records`);
        if (resRecs.ok) {
            const data = await resRecs.json();
            if (data.success && Array.isArray(data.records)) {
                const mapped = data.records.map(r => {
                    const vj = typeof r.values_json === 'string' ? JSON.parse(r.values_json) : (r.values_json || {});
                    return {
                        id: r.no + '_' + (r.mode || 'Buy off'),
                        no: r.no,
                        mode: r.mode || 'Buy off',
                        date: r.date,
                        product: vj.product || r.traveler ? r.traveler.split('_')[0] : '',
                        productLabel: vj.productLabel || r.traveler || '',
                        partno: vj.partno || '',
                        ptno: vj.ptno || '',
                        mc: vj.mc || '',
                        team: r.team || '',
                        qcEn: r.qcEn || '',
                        meEn: r.meEn || '',
                        traveler: r.traveler || '',
                        sendTime: r.sendTime || '',
                        recvTime: r.recvTime || '',
                        attribute: r.attribute || 'Normal',
                        pcs: (r.short && r.short.vals) ? r.short.vals.length : 0,
                        dimData: vj.dimData || {
                            datum: r.short ? { avg: r.short.avg, max: r.short.max, min: r.short.min, vals: r.short.vals || [], result: r.short.inSpec ? 'Pass' : 'Fail' } : null,
                            nondatum: r.long ? { avg: r.long.avg, max: r.long.max, min: r.long.min, vals: r.long.vals || [], result: r.long.inSpec ? 'Pass' : 'Fail' } : null,
                        },
                        datumAvg: r.short ? r.short.avg : null,
                        datumMax: r.short ? r.short.max : null,
                        datumMin: r.short ? r.short.min : null,
                        datumResult: r.short ? (r.short.inSpec ? 'Pass' : 'Fail') : 'Pass',
                        nondatumAvg: r.long ? r.long.avg : null,
                        nondatumMax: r.long ? r.long.max : null,
                        nondatumMin: r.long ? r.long.min : null,
                        nondatumResult: r.long ? (r.long.inSpec ? 'Pass' : 'Fail') : 'Pass',
                        vmi: r.vmi || {},
                        vmiNG: !r.vmiPass,
                        overall: r.overallPass ? 'Pass' : 'Fail',
                        savedAt: r.savedAt
                    };
                });
                const localDrafts = loadRecords().filter(r => r.overall === 'DRAFT_WAITING' || r.overall === 'WAITING' || r.overall === 'Waiting');
                saveRecords([...mapped, ...localDrafts]);
                renderRecords(); // ← render ทันทีหลัง save
            }
        }

        const resAlerts = await fetch(`${BACKEND_URL}/api/damper/alerts`);
        if (resAlerts.ok) {
            const adata = await resAlerts.json();
            if (adata.success && adata.alerts && adata.alerts.length > 0) {
                const mappedAlerts = adata.alerts.map(a => ({
                    id: Date.now() + Math.random(),
                    ts: a.time,
                    level: 'ng',
                    product: a.traveler || '',
                    qcEn: '',
                    traveler: a.traveler || '',
                    msg: a.reason || ''
                }));
                saveAlerts(mappedAlerts);
            }
        }

        updateKPIs();
        updateBadges();
    } catch (e) {
        console.warn('Damper refreshDataFromServer error:', e);
    } finally {
        window.BLoader?.hideIfSlow();
    }
}

function updateConnectionUI() {
    const dot = document.getElementById('sync-status-indicator');
    const text = document.getElementById('sync-status-text');
    const btn = document.getElementById('sync-btn');
    if (!dot) return;
    if (isServerOnline) {
        dot.style.background = '#22c55e';
        dot.style.boxShadow = '0 0 8px #22c55e';
        dot.style.animation = 'none';
        if (text) { text.textContent = 'Online (Synced)'; text.style.color = 'var(--pass)'; }
        if (btn) btn.style.display = 'inline-flex';
    } else {
        dot.style.background = '#ef4444';
        dot.style.boxShadow = '0 0 8px #ef4444';
        dot.style.animation = 'pulse 2s infinite';
        if (text) { text.textContent = 'Offline Mode'; text.style.color = 'var(--text3)'; }
        if (btn) btn.style.display = 'none';
    }
}

async function syncWithServer() {
    if (!isServerOnline) { showToast('Server offline', 'error'); return; }
    window.BLoader?.show('กำลังซิงค์ข้อมูล...');
    try {
        const res = await fetch(`${BACKEND_URL}/api/damper/sync`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: loadRecords().filter(r => r.overall !== 'DRAFT_WAITING' && r.overall !== 'WAITING' && r.overall !== 'Waiting') }),
        });
        const r = await res.json();
        showToast(r.success ? '🔄 Synchronized!' : 'Sync failed: ' + r.message, r.success ? 'success' : 'error');
    } catch { showToast('Sync error', 'error'); }
    finally { window.BLoader?.hide(); }
}

// ------------------------------------------------------------------------------------------
//  Utilities
// ------------------------------------------------------------------------------------------
// 🔴 เดิม loadRecords()/saveRecords() เก็บข้อมูลไว้ใน dmpRecords (ตัวแปรใน memory)
//    เท่านั้น ไม่เคยเขียนลง localStorage และไม่เคยยิง sync ไปที่ MySQL จนกว่าจะถึง
//    ขั้นตอน commitStage2Damper() (Merge CMM) ท้ายสุด — ถ้า refresh หน้า, ปิดแท็บ,
//    หรือ error ระหว่างทางก่อนถึงขั้น Merge ข้อมูล Draft/Waiting ทั้งหมดจะหายไปเลย
//    และไม่เคยถูกบันทึกลง MySQL แม้แต่ครั้งเดียว → แก้โดยเขียนลง localStorage ทุกครั้ง
//    ที่ saveRecords() ถูกเรียก เพื่อกันข้อมูลหายตอน refresh
const DAMPER_LS_KEY = 'belton_damper_records_cache_v1';

function loadRecords() {
    if (dmpRecords && dmpRecords.length) return dmpRecords;
    try {
        const cached = localStorage.getItem(DAMPER_LS_KEY);
        if (cached) dmpRecords = JSON.parse(cached) || [];
    } catch (e) { console.warn('Damper loadRecords cache parse error:', e); }
    return dmpRecords;
}

function saveRecords(a) {
    dmpRecords = a;
    try {
        localStorage.setItem(DAMPER_LS_KEY, JSON.stringify(dmpRecords));
    } catch (e) {
        console.warn('Damper saveRecords localStorage error:', e);
    }
}

async function saveRecordToServer(rec) {
    if (!isServerOnline) return;
    try {
        const res = await fetch(`${BACKEND_URL}/api/damper/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: [rec] }),
        });
        const r = await res.json();
        if (!r.success) showToast(`MySQL error: ${r.message}`, 'warn');
    } catch (e) {
        showToast('บันทึกสำเร็จแต่ส่ง MySQL ไม่ได้ (Network Error)', 'warn');
    }
}

async function sendSystemAlert(level, msg, rec, issues) {
    if (!isServerOnline) return;
    try {
        await fetch(`${BACKEND_URL}/api/damper/alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level, msg,
                product: rec.product,
                product_label: rec.productLabel,
                qc_en: rec.qcEn,
                traveler: rec.traveler,
                mode: rec.mode,
                overall: rec.overall,
                issues,
            }),
        });
    } catch (e) {
        console.warn('sendSystemAlert (damper) failed', e);
    }
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmt(v, d = 5) { return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toFixed(d); }

function setEl(id, txt, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = txt;
    if (color) el.style.color = color;
}

function switchTab(id, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-' + id)?.classList.add('active');
    btn?.classList.add('active');
    if (id === 'records') renderRecords();
    if (id === 'viz') renderCharts();
    if (id === 'alerts') renderAlerts();
}

function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

function showConfirm(title, msg, onOk) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-ok-btn').onclick = () => { closeModal('modal-confirm'); onOk(); };
    document.getElementById('modal-confirm').style.display = 'flex';
}

function showToast(msg, type = 'info') {
    const panel = document.getElementById('toast-panel');
    if (!panel) return;
    const t = document.createElement('div');
    t.className = `alert-toast ${type}`;
    t.innerHTML = `<div style="font-weight:700;margin-bottom:2px">${type.toUpperCase()}</div><div>${msg}</div>`;
    panel.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ════════════════════════════════════════════════════════════
//  Import CSV (previously exported via exportCSV())
//  FIX: ของเดิมมีฟังก์ชัน parseStage2Data() ทั้งก้อนหลุดไปแทรกอยู่กลาง
//  loop ของ importExportedCSV() ทำให้เกิด syntax error (มี "|" ค้าง และ
//  วงเล็บ/บล็อกไม่ครบ) ทั้งไฟล์เลยรันไม่ได้ ที่นี่แก้โดยเขียน loop
//  ให้ map field ตรงกับ header ที่ exportCSV() สร้างไว้ให้ครบถ้วน
// ════════════════════════════════════════════════════════════
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
                if (!row || row.length === 0 || !getVal('Product')) continue;

                const productLabel = String(getVal('Product') || '').trim();
                const productKey = getModelKey(productLabel);

                const records = loadRecords();
                const rec = {
                    id: Date.now().toString() + '_' + i + '_' + Math.random().toString(36).slice(2, 5),
                    no: parseInt(getVal('No'), 10) || (records.filter(r => r.overall !== 'DRAFT_WAITING' && r.overall !== 'WAITING').length + 1),
                    mode: String(getVal('Mode') || 'Buy off').toLowerCase().includes('roving') ? 'roving' : 'buyoff',
                    date: getVal('Date') || todayISO(),
                    product: productKey,
                    productLabel: productLabel,
                    mc: getVal('MC') || '',
                    team: getVal('Team') || '',
                    qcEn: getVal('QC_EN') || '',
                    meEn: getVal('ME_EN') || '',
                    traveler: getVal('Traveler') || '',
                    sendTime: getVal('SendTime') || '',
                    recvTime: getVal('RecvTime') || '',
                    attribute: getVal('Attribute') || 'Normal',
                    pcs: parseInt(getVal('Pcs'), 10) || 0,
                    datumAvg: parseFloat(getVal('Datum_Avg')) || null,
                    datumMax: parseFloat(getVal('Datum_Max')) || null,
                    datumMin: parseFloat(getVal('Datum_Min')) || null,
                    datumResult: getVal('Datum_Result') || 'Pass',
                    nondatumAvg: parseFloat(getVal('Non_Datum_Avg')) || null,
                    nondatumMax: parseFloat(getVal('Non_Datum_Max')) || null,
                    nondatumMin: parseFloat(getVal('Non_Datum_Min')) || null,
                    nondatumResult: getVal('Non_Datum_Result') || 'Pass',
                    vmiNG: getVal('VMI_NG') === 'YES',
                    overall: getVal('Overall') || 'Pass',
                    savedAt: new Date().toISOString(),
                    dimData: {
                        datum: { avg: parseFloat(getVal('Datum_Avg')), max: parseFloat(getVal('Datum_Max')), min: parseFloat(getVal('Datum_Min')), result: getVal('Datum_Result') },
                        nondatum: { avg: parseFloat(getVal('Non_Datum_Avg')), max: parseFloat(getVal('Non_Datum_Max')), min: parseFloat(getVal('Non_Datum_Min')), result: getVal('Non_Datum_Result') }
                    }
                };
                records.push(rec);
                saveRecords(records);
                importedCount++;
            }
        } catch (err) { console.error('Error importing file:', file.name, err); }
    }
    event.target.value = '';
    if (importedCount > 0) {
        updateKPIs();
        updateBadges();
        renderRecords();
        if (typeof renderCharts === 'function') renderCharts();
        if (typeof syncWithServer === 'function') await syncWithServer();
        showToast(`นำเข้าข้อมูล ${importedCount} รายการ และบันทึกเข้าฐานข้อมูลเรียบร้อย`, 'success');
    } else { showToast('ไม่พบข้อมูลที่จะนำเข้า (รูปแบบไฟล์ไม่ถูกต้อง หรือไม่มีข้อมูล)', 'warn'); }
}

// === STAGE 2 MERGE LOGIC ===

let _selectedMergeId = null;

function selectPendingForMerge(id) {
    _selectedMergeId = id;
    const recs = loadRecords();
    const r = recs.find(x => x.id === id);
    if (!r) { showToast('❌ ไม่พบ Record ที่ต้องการเชื่อมข้อมูล', 'error'); return; }
    
    if (r.overall !== 'WAITING' && r.overall !== 'Waiting' && r.overall !== 'DRAFT_WAITING') {
        showToast('⚠️ Record นี้ไม่ได้อยู่ในสถานะ Waiting/Draft', 'warn'); return;
    }
    
    const prodSel = document.getElementById('merge-product');
    if (prodSel) prodSel.value = r.product;
    const ptInput = document.getElementById('merge-pt');
    if (ptInput) ptInput.value = r.ptno || '';
    const mcInput = document.getElementById('merge-mc');
    if (mcInput) mcInput.value = r.mc || '';
    
    document.getElementById('stage2-target-info').style.display = 'block';
    document.getElementById('stage2-target-details').innerHTML = `
        <b>Product:</b> ${r.productLabel || r.product} <br>
        <b>PT No:</b> ${r.ptno || '-'} &nbsp;|&nbsp; <b>M/C:</b> ${r.mc || '-'} &nbsp;|&nbsp; <b>Date:</b> ${r.date}
    `;
    
    const btn = document.querySelector('[data-tab="stage2"]');
    if (btn) btn.click();
}



// Hook tab switch to render pending table and rebuild stage2 grid
const originalSwitchTab = switchTab;
switchTab = function (id, btn) {
    originalSwitchTab(id, btn);
    if (id === 'manual' || id === 'stage2') {
        renderPendingTable();
    }
    if (id === 'stage2') {
        // Rebuild the stage2 grid each time the tab is opened (so pcs is correct for selected record)
        buildStage2DimGroups();
    }
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

// --- Edit Damper Record ---
document.addEventListener('DOMContentLoaded', () => {
    const editModalHTML = `
    <div id="modal-rec-edit" class="modal-overlay" style="display:none;z-index:9999;">
        <div class="modal-content" style="max-width:800px;width:95%">
            <h3 style="margin-top:0;margin-bottom:16px;font-size:18px;color:var(--text);border-bottom:1px solid var(--border);padding-bottom:10px">
                แก้ไขข้อมูลบันทึก <span id="e-dmp-no" style="color:var(--blue)"></span>
            </h3>
            <input type="hidden" id="e-dmp-id">
            
            <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;">
                <div class="form-group"><label>Date</label><input type="date" id="e-dmp-date" class="form-input"></div>
                <div class="form-group"><label>Product</label><input type="text" id="e-dmp-product" class="form-input"></div>
                <div class="form-group"><label>Traveler</label><input type="text" id="e-dmp-traveler" class="form-input"></div>
                
                <div class="form-group"><label>Part No.</label><input type="text" id="e-dmp-partno" class="form-input"></div>
                <div class="form-group"><label>PT No.</label><input type="text" id="e-dmp-ptno" class="form-input"></div>
                <div class="form-group"><label>Fixture / MC</label><input type="text" id="e-dmp-mc" class="form-input"></div>
                <div class="form-group"><label>Team</label><input type="text" id="e-dmp-team" class="form-input"></div>
                
                <div class="form-group"><label>QC EN</label><input type="text" id="e-dmp-qcEn" class="form-input"></div>
                <div class="form-group"><label>ME EN</label><input type="text" id="e-dmp-meEn" class="form-input"></div>
                <div class="form-group"><label>Attribute</label><input type="text" id="e-dmp-attr" class="form-input"></div>
            </div>

            <div style="font-size:13px;font-weight:700;margin-bottom:8px">Damper Values (Average)</div>
            <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px">
                <div class="form-group"><label>Datum Avg</label><input type="number" step="0.0001" id="e-dmp-datum" class="form-input"></div>
                <div class="form-group"><label>Non-datum Avg</label><input type="number" step="0.0001" id="e-dmp-nondatum" class="form-input"></div>
            </div>

            <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                <div class="form-group">
                    <label>Overall Result</label>
                    <select id="e-dmp-overall" class="form-select">
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                    </select>
                </div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--border);padding-top:16px;">
                <button class="btn btn-outline" onclick="document.getElementById('modal-rec-edit').style.display='none'">ยกเลิก</button>
                <button class="btn btn-primary" onclick="saveEditRecord()">💾 บันทึก</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', editModalHTML);
});

window.editRecord = function (id) {
    const r = loadRecords().find(x => String(x.id) === String(id));
    if (!r) { alert('Record not found'); return; }

    document.getElementById('e-dmp-id').value = r.id;
    document.getElementById('e-dmp-no').textContent = '#' + r.no;
    document.getElementById('e-dmp-date').value = r.date || '';
    document.getElementById('e-dmp-product').value = r.productLabel || r.product || '';
    document.getElementById('e-dmp-traveler').value = r.traveler || '';
    document.getElementById('e-dmp-partno').value = r.partno || '';
    document.getElementById('e-dmp-ptno').value = r.ptno || '';
    document.getElementById('e-dmp-mc').value = r.mc || '';
    document.getElementById('e-dmp-team').value = r.team || '';
    document.getElementById('e-dmp-qcEn').value = r.qcEn || '';
    document.getElementById('e-dmp-meEn').value = r.meEn || '';
    document.getElementById('e-dmp-attr').value = r.attribute || '';

    document.getElementById('e-dmp-datum').value = r.datumAvg || '';
    document.getElementById('e-dmp-nondatum').value = r.nondatumAvg || '';

    document.getElementById('e-dmp-overall').value = r.overall === 'Pass' ? 'Pass' : 'Fail';

    document.getElementById('modal-rec-edit').style.display = 'flex';
};

window.saveEditRecord = async function () {
    const id = document.getElementById('e-dmp-id').value;
    const recs = loadRecords();
    const idx = recs.findIndex(x => String(x.id) === id);
    if (idx < 0) return;

    const r = recs[idx];
    r.date = document.getElementById('e-dmp-date').value;
    r.productLabel = document.getElementById('e-dmp-product').value;
    r.traveler = document.getElementById('e-dmp-traveler').value;
    r.partno = document.getElementById('e-dmp-partno').value;
    r.ptno = document.getElementById('e-dmp-ptno').value;
    r.mc = document.getElementById('e-dmp-mc').value;
    r.team = document.getElementById('e-dmp-team').value;
    r.qcEn = document.getElementById('e-dmp-qcEn').value;
    r.meEn = document.getElementById('e-dmp-meEn').value;
    r.attribute = document.getElementById('e-dmp-attr').value;
    r.overall = document.getElementById('e-dmp-overall').value;

    const sAvg = parseFloat(document.getElementById('e-dmp-datum').value);
    const lAvg = parseFloat(document.getElementById('e-dmp-nondatum').value);

    if (r.dimData) {
        if (!isNaN(sAvg)) r.datumAvg = sAvg;
        if (!isNaN(lAvg)) r.nondatumAvg = lAvg;
    }

    saveRecords(recs);
    renderRecords();
    document.getElementById('modal-rec-edit').style.display = 'none';

    // Sync to Server
    if (typeof BACKEND_URL !== 'undefined') {
        try {
            await fetch(`${BACKEND_URL}/api/damper/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db_data: { records: [r] } })
            });
            console.log('Edit synced to server');
        } catch (e) {
            console.error('Failed to sync edit', e);
        }
    }
};