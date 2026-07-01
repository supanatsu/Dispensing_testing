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
const DIM_GROUPS = {
    datum: [
        {
            key: 'datum',
            label: 'Datum',
            subLabel: 'Spec: CL: 1.358',
            usl: 1.368,
            ucl: null,
            cl: 1.358,
            lcl: null,
            lsl: 1.348,
            points: ['1/1', '1/2', '1/3', '1/4'],
        },
        {
            key: 'nondatum',
            label: 'Non-datum',
            subLabel: 'Spec: CL: 0.814',
            usl: 0.824,
            ucl: null,
            cl: 0.814,
            lcl: null,
            lsl: 0.804,
            points: ['2/1', '2/2', '2/3', '2/4'],
        },
    ]
};

const DIM_GROUPS_BASE = JSON.parse(JSON.stringify(DIM_GROUPS));

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

function applyDamperConfigForProduct(productKey) {
    let cfg = {};
    try {
        const raw = localStorage.getItem(LS_KEY_CFG);
        if (raw) cfg = JSON.parse(raw);
    } catch (e) { }

    const prodOverride = (cfg.productDims && cfg.productDims[productKey]) ? cfg.productDims[productKey] : null;
    const globalDefault = cfg.dims || {};

    const allGroups = [...DIM_GROUPS.datum];
    allGroups.forEach(g => {
        const baseGroups = [...DIM_GROUPS_BASE.datum];
        const baseG = baseGroups.find(x => x.key === g.key);

        let usl = baseG.usl;
        let ucl = baseG.ucl;
        let cl = baseG.cl;
        let lcl = baseG.lcl;
        let lsl = baseG.lsl;

        let configKey = g.key;

        if (prodOverride && prodOverride[configKey]) {
            if (prodOverride[configKey].usl !== undefined && prodOverride[configKey].usl !== null) usl = prodOverride[configKey].usl;
            if (prodOverride[configKey].ucl !== undefined && prodOverride[configKey].ucl !== null) ucl = prodOverride[configKey].ucl;
            if (prodOverride[configKey].cl !== undefined && prodOverride[configKey].cl !== null) cl = prodOverride[configKey].cl;
            if (prodOverride[configKey].lcl !== undefined && prodOverride[configKey].lcl !== null) lcl = prodOverride[configKey].lcl;
            if (prodOverride[configKey].lsl !== undefined && prodOverride[configKey].lsl !== null) lsl = prodOverride[configKey].lsl;
        } else if (globalDefault[configKey]) {
            if (globalDefault[configKey].usl !== undefined && globalDefault[configKey].usl !== null) usl = globalDefault[configKey].usl;
            if (globalDefault[configKey].ucl !== undefined && globalDefault[configKey].ucl !== null) ucl = globalDefault[configKey].ucl;
            if (globalDefault[configKey].cl !== undefined && globalDefault[configKey].cl !== null) cl = globalDefault[configKey].cl;
            if (globalDefault[configKey].lcl !== undefined && globalDefault[configKey].lcl !== null) lcl = globalDefault[configKey].lcl;
            if (globalDefault[configKey].lsl !== undefined && globalDefault[configKey].lsl !== null) lsl = globalDefault[configKey].lsl;
        }

        g.usl = usl;
        g.ucl = ucl;
        g.cl = cl;
        g.lcl = lcl;
        g.lsl = lsl;

        let specs = [];
        if (g.lsl !== null) specs.push(`LSL: ${g.lsl.toFixed(3)}`);
        if (g.cl !== null) specs.push(`CL: ${g.cl.toFixed(3)}`);
        if (g.usl !== null) specs.push(`USL: ${g.usl.toFixed(3)}`);
        g.subLabel = `Spec: ${specs.join(' | ')}`;
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

    if (infoBar) infoBar.textContent =
        `${p.label} · ${p.pcs} pcs/batch | Datum: 1.358±0.010 | Non-datum: 0.814±0.010`;

    // Update Frequency
    // หมายเหตุ: ค่านี้คือจำนวนชิ้น "ตาม Frequency" ที่ตั้งไว้ใน System Config (System Config > Damper)
    // เป็นตัวกำหนดว่าต้อง Save Draft กี่ครั้ง (กี่ชิ้น) ถึงจะครบ 1 ชุดและ Push เข้า About Data (Waiting) ได้
    // ถ้าไม่ได้ตั้งค่า Frequency ไว้ ระบบจะ fallback ไปใช้ pcs/batch ของสินค้านั้น (ค่าตั้งต้นในระบบ)
    const qtyInput = document.getElementById('m-qty');
    let freqTarget = p.pcs; // fallback
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
                qtyInput.value = `${freqTarget}/Shift/Oven`;
            } else {
                // ไม่มีค่า Frequency ที่ตั้งไว้ -> แจ้งผู้ใช้และใช้ pcs/batch แทน
                qtyInput.value = `${freqTarget} (default pcs/batch)`;
            }
        } catch (e) {
            qtyInput.value = `${freqTarget} (default pcs/batch)`;
        }
    }
    // เก็บค่า target ที่ใช้จริงไว้ใน dataset เพื่อให้ saveManualDraft() ดึงไปใช้ตอนบันทึก
    if (qtyInput) qtyInput.dataset.freqTarget = freqTarget;

    // Build all 4 dimension groups
    buildAllDimGroups(p.pcs);
}

// ─── Build Dimension Groups ───────────────────────────────────
function buildAllDimGroups(pcs) {
    const container = document.getElementById('dim-groups-container');
    if (!container) return;

    const allGroups = [...DIM_GROUPS.datum];
    container.innerHTML = allGroups.map(g => buildGroupHTML(g, pcs)).join('');
}

function buildGroupHTML(g, pcs) {
    const lsl = g.lsl;
    const usl = g.usl;
    const isDatum = g.key.startsWith('datum');
    const accentColor = isDatum ? 'var(--blue)' : '#9B59B6';

    let inputsHTML = '';
    for (let i = 0; i < pcs; i++) {
        const ptLabel = g.points[i % g.points.length]; // cycle through 4 points if pcs > 4
        const inputId = `${g.key}-pc-${i + 1}`;
        inputsHTML += `
            <div class="piece-cell">
                <label>Pc ${i + 1}<br><span style="font-size:9px;color:var(--text3)">${ptLabel}</span></label>
                <input
                    type="number"
                    id="${inputId}"
                    step="0.0001"
                    placeholder="${g.cl !== null && g.cl !== undefined ? g.cl.toFixed(4) : ''}"
                    oninput="calcGroupDim('${g.key}', ${pcs})"
                    onkeydown="pieceEnterNav(event,'${inputId}','${g.key}',${i + 1},${pcs})"
                >
            </div>`;
    }

    return `
        <div class="dim-group-block" id="grp-${g.key}">
            <div class="sec-label" style="border-color:${accentColor}40">
                📏 ${g.label}
                <span style="font-size:11px;color:var(--text3);font-weight:400;text-transform:none;letter-spacing:0;margin-left:8px">
                    ${g.subLabel} &nbsp;|&nbsp; LSL: ${lsl.toFixed(4)} ~ USL: ${usl.toFixed(4)}
                </span>
            </div>
            <div class="piece-grid" id="grid-${g.key}">${inputsHTML}</div>
            <div class="dim-sum">
                <div class="dim-sum-item">
                    <span>Average</span>
                    <span id="${g.key}-avg" style="color:${accentColor}">—</span>
                </div>
                <div class="dim-sum-item">
                    <span>Max</span>
                    <span id="${g.key}-max">—</span>
                </div>
                <div class="dim-sum-item">
                    <span>Min</span>
                    <span id="${g.key}-min">—</span>
                </div>
                <div class="dim-sum-item">
                    <span>Result</span>
                    <span id="${g.key}-result">—</span>
                </div>
            </div>
        </div>`;
}

function pieceEnterNav(e, curId, groupKey, idx, total) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = idx < total ? document.getElementById(`${groupKey}-pc-${idx + 1}`) : null;
    if (next) next.focus();
    else document.getElementById('btn-save')?.focus();
}

// ─── Calc Dimension for one group ────────────────────────────
function calcGroupDim(groupKey, pcs) {
    const allGroups = [...DIM_GROUPS.datum];
    const g = allGroups.find(x => x.key === groupKey);
    if (!g) return;

    const lsl = g.lsl;
    const usl = g.usl;
    const vals = [];

    for (let i = 1; i <= pcs; i++) {
        const el = document.getElementById(`${groupKey}-pc-${i}`);
        if (!el) continue;
        const v = parseFloat(el.value);
        el.classList.remove('p-ok', 'p-warn', 'p-ng');
        if (!isNaN(v)) {
            vals.push(v);
            if (v < lsl || v > usl) el.classList.add('p-ng');
            else if (v < lsl + (usl - lsl) * 0.1 || v > usl - (usl - lsl) * 0.1) el.classList.add('p-warn');
            else el.classList.add('p-ok');
        }
    }

    if (!vals.length) {
        [`${groupKey}-avg`, `${groupKey}-max`, `${groupKey}-min`, `${groupKey}-result`]
            .forEach(id => setEl(id, '—', 'var(--text3)'));
        autoJudgeOverall();
        return;
    }

    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const allOk = vals.every(v => v >= lsl && v <= usl);

    const isDatum = groupKey.startsWith('datum');
    const accentColor = isDatum ? 'var(--blue)' : '#9B59B6';

    setEl(`${groupKey}-avg`, fmt(avg, 5), allOk ? accentColor : 'var(--fail)');
    setEl(`${groupKey}-max`, fmt(max, 5));
    setEl(`${groupKey}-min`, fmt(min, 5));
    const resEl = document.getElementById(`${groupKey}-result`);
    if (resEl) {
        resEl.textContent = allOk ? '✓ PASS' : '✗ FAIL';
        resEl.style.color = allOk ? 'var(--pass)' : 'var(--fail)';
        resEl.style.fontWeight = '800';
    }

    autoJudgeOverall();
}

function autoJudgeOverall() {
    const allGroups = [...DIM_GROUPS.datum];
    const dimAllPass = allGroups.every(g => {
        const el = document.getElementById(`${g.key}-result`);
        if (!el || el.textContent === '—') return true; // not yet filled = skip
        return el.textContent.includes('PASS');
    });
    const vmiNG = VMI_ITEMS.some(v => document.getElementById(`vmi-${v.id}`)?.value === 'Fail');
    const val = (vmiNG || !dimAllPass) ? 'Fail' : 'Pass';
    setOverallPF(val);
}

// ════════════════════════════════════════════════════════════
//  Save Batch
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//  Save Draft (Piece by Piece)
// ════════════════════════════════════════════════════════════
async function saveManualDraft() {
    const key = document.getElementById('m-product')?.value;
    if (!key) { showToast('กรุณาเลือก Product ก่อน', 'warn'); return; }
    const p = PRODUCTS[key];

    const mode = document.getElementById('m-mode')?.value || 'buyoff';

    // VMI (สำหรับ 1 ชิ้น)
    const vmiData = {};
    const items = VMI_ITEMS.filter(v => mode === 'roving' || v.id !== 'double');
    items.forEach(v => {
        vmiData[v.id] = document.getElementById(`vmi-${v.id}`)?.value || 'Pass';
    });
    const vmiNG = Object.values(vmiData).some(v => v === 'Fail');

    const draftId = 'DRAFT_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    // จำนวนชิ้นที่ต้องกรอกให้ครบ 1 ชุด: อิงตาม Frequency ที่ตั้งค่าไว้ใน System Config ก่อน
    // (เก็บไว้ใน dataset ตอน onProductChange()) ถ้าไม่มีค่า fallback ไปที่ pcs/batch ของสินค้า
    const qtyEl = document.getElementById('m-qty');
    const freqTarget = parseInt(qtyEl?.dataset.freqTarget, 10) || p.pcs;

    const dateStr = document.getElementById('m-date')?.value || todayISO();
    const mcStr = document.getElementById('m-mc')?.value || p.mc;
    const sendTimeStr = document.getElementById('m-send-time')?.value || '';
    const groupKey = `${key}|${mcStr}|${dateStr}|${sendTimeStr}|${mode}`;

    const records = loadRecords();
    
    // นับจำนวนชิ้นที่บันทึกแล้วในชุดเดียวกัน (product+mc+date+sendTime+mode)
    const currentCount = records.filter(r => r.overall === 'DRAFT_WAITING' &&
        `${r.product}|${r.mc}|${r.date}|${r.sendTime}|${r.mode}` === groupKey).length;

    if (currentCount >= freqTarget) {
        showToast(`⚠️ ไม่สามารถบันทึกเพิ่มได้ (กรอกครบ ${freqTarget} ชิ้นตาม Frequency แล้ว กรุณากด "นำเข้า About Data")`, 'error');
        return;
    }

    const rec = {
        id: draftId,
        no: 0, // Will be assigned when pushed to About Data or Completed
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
        freqTarget,
        sendTime: sendTimeStr,
        recvTime: document.getElementById('m-recv-time')?.value || '',
        attribute: document.getElementById('m-attribute')?.value || 'Normal',
        pcs: p.pcs,
        dimData: {},
        datumAvg: null, datumMax: null, datumMin: null, datumResult: null,
        nondatumAvg: null, nondatumMax: null, nondatumMin: null, nondatumResult: null,
        vmi: vmiData,
        vmiNG,
        overall: 'DRAFT_WAITING',
        savedAt: new Date().toISOString(),
    };

    records.unshift(rec);
    saveRecords(records);

    const newCount = currentCount + 1;
    showToast(`✅ บันทึก Draft สำเร็จ (${newCount}/${freqTarget} ชิ้น ตาม Frequency)`, 'success');

    resetVmiForm();
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
        for (const rec of finalizedDrafts) {
            sendToBackendAndAlert(rec);
        }
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
        tbody.innerHTML = `<tr><td colspan="20" style="text-align:center;padding:32px;color:var(--text3)"><div style="font-size:28px;margin-bottom:8px">📋</div>ไม่พบข้อมูล</td></tr>`;
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
    const dimDetail = (r, groupKey) => {
        const g = r.dimData?.[groupKey];
        if (!g) return `<span style="color:var(--text3)">—</span>`;
        const color = g.result === 'Pass' ? 'var(--blue)' : 'var(--fail)';
        return `<span style="font-weight:700;color:${color}">${g.avg?.toFixed(5) || '—'}</span> ${dimBadge(g.result)}`;
    };

    tbody.innerHTML = recs.map(r => `
        <tr>
            <td style="font-weight:700;color:var(--text3)">${r.no}</td>
            <td style="font-size:12px;white-space:nowrap">${r.date}</td>
            <td style="font-weight:600;font-size:12px">${r.productLabel}</td>
            <td>${r.mc || '—'}</td>
            <td style="font-size:12px">${r.team || '—'}</td>
            <td style="font-weight:600">${r.qcEn || '—'}</td>
            <td style="font-size:11px;color:var(--text3)">${r.meEn || '—'}</td>
            <td style="font-size:11px;color:var(--text3)">${r.traveler || '—'}</td>
            <td style="font-size:11px">${r.attribute || '—'}</td>
            <td style="text-align:center">${r.pcs}</td>
            <td style="font-size:12px">${dimDetail(r, 'datum')}</td>
            <td style="font-size:12px">${dimDetail(r, 'nondatum')}</td>
            <td>${vmiSum(r)}</td>
            <td>${ovBadge(r.overall)}</td>
            <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                    ${(r.overall === 'WAITING' || r.overall === 'Waiting') ? `<button class="btn btn-primary btn-sm" style="font-size:10px;padding:2px 6px;background:var(--blue)" onclick="selectPendingForMerge('${r.id}')" title="ไปที่ Stage 2 เพื่อกรอกค่า Datum/Non-datum สำหรับ Record นี้">➡️ Stage 2</button>` : ''}
                    <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="viewRecord('${r.id}')">👁</button>
                    <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="editRecord('${r.id}')">✏️</button>
                    <button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 6px" onclick="deleteRecord('${r.id}')">🗑</button>
                </div>
            </td>
        </tr>`).join('');
}

function viewRecord(id) {
    const r = loadRecords().find(x => x.id === id);
    if (!r) return;
    const p = PRODUCTS[r.product] || {};
    const allGroups = [...DIM_GROUPS.datum];

    let dimHTML = allGroups.map(g => {
        const d = r.dimData?.[g.key];
        if (!d) return '';
        const vals = (d.vals || []).map((v, i) => `<span style="background:var(--bg2);padding:2px 6px;border-radius:4px;font-size:11px">${g.points[i % g.points.length]}: <b>${v}</b></span>`).join(' ');
        return `
            <div style="margin-bottom:10px">
                <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px">${g.label}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">${vals}</div>
                <div style="font-size:12px">
                    Avg: <b style="color:${d.result === 'Pass' ? 'var(--blue)' : 'var(--fail)'}">${d.avg}</b> &nbsp;
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
            gd('datum').avg || '', gd('datum').max || '', gd('datum').min || '', gd('datum').result || '',
            gd('nondatum').avg || '', gd('nondatum').max || '', gd('nondatum').min || '', gd('nondatum').result || '',
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
    let recs = loadRecords();
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
                x: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' } },
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
            scales: { x: { ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { stepSize: 1 } } },
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
            scales: { x: { ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
    });
}

// ------------------------------------------------------------------------------------------




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
            if (confData.success && confData.limits) {
                if (!window.DAMPER_LIMITS) window.DAMPER_LIMITS = {};
                confData.limits.forEach(lim => {
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
                saveRecords(mapped);
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
            body: JSON.stringify({ records: loadRecords() }),
        });
        const r = await res.json();
        showToast(r.success ? '🔄 Synchronized!' : 'Sync failed: ' + r.message, r.success ? 'success' : 'error');
    } catch { showToast('Sync error', 'error'); }
    finally { window.BLoader?.hide(); }
}

// ------------------------------------------------------------------------------------------
//  Utilities
// ------------------------------------------------------------------------------------------
function loadRecords() { return dmpRecords; }
function saveRecords(a) { dmpRecords = a; }

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
                const records = loadRecords();
                const rec = {
                    id: Date.now() + Math.random(),
                    no: records.length ? Math.max(...records.map(r => r.no || 0)) + 1 : 1,
                    date: dateVal,
                    mode: getVal('Mode') || 'buyoff',
                    product: modelKey,
                    productLabel: pLabel,
                    partno: getVal('PartNo') || getVal('Part No') || '',
                    ptno: getVal('PTNo') || getVal('PT Number') || '',
                    mc: getVal('MC') || '',
                    team: getVal('Team') || '',
                    qcEn: getVal('QC_EN') || '',
                    meEn: getVal('ME_EN') || '',
                    traveler: getVal('Traveler') || '',
                    sendTime: getVal('SendTime') || '',
                    recvTime: getVal('RecvTime') || '',
                    attribute: getVal('Attribute') || 'Normal',
                    pcs: parseInt(getVal('Pcs')) || 0,
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
    if (!r) {
        showToast('❌ ไม่พบ Record ที่ต้องการเชื่อมข้อมูล', 'error');
        return;
    }

    if (r.overall !== 'WAITING' && r.overall !== 'Waiting') {
        showToast('⚠️ Record นี้ไม่ได้อยู่ในสถานะ Waiting', 'warn');
        return;
    }

    document.getElementById('stage2-target-info').style.display = 'block';
    document.getElementById('stage2-target-details').innerHTML = `
        <b>Product:</b> ${r.productLabel || r.product} <br>
        <b>Part No:</b> ${r.partno || '-'} &nbsp;|&nbsp; <b>PT No:</b> ${r.ptno || '-'} &nbsp;|&nbsp; <b>M/C:</b> ${r.mc || '-'} &nbsp;|&nbsp; <b>Date:</b> ${r.date}
    `;

    // เชื่อมข้อมูล Waiting record นี้เข้ากับฟิลด์เลือก Target ในแท็บ Stage 2 โดยตรง
    // เพื่อให้ Stage 2 อ่าน/กรองข้อมูลของ Record นี้ได้ทันที ไม่ต้องเลือกใหม่
    const prodSel = document.getElementById('merge-product');
    if (prodSel) prodSel.value = r.product;
    const ptInput = document.getElementById('merge-pt');
    if (ptInput) ptInput.value = r.ptno || '';
    const mcInput = document.getElementById('merge-mc');
    if (mcInput) mcInput.value = r.mc || '';

    // ระบุ record เป้าหมายให้ตรงตัวเลย (ไม่ใช่แค่ candidate แรกที่ filter เจอ)
    _selectedMergeId = r.id;
    const html = `<h4>Linked Waiting Record:</h4>
        <p><b>Traveler:</b> ${r.traveler || '-'} | <b>Product:</b> ${r.productLabel} | <b>PT:</b> ${r.ptno || '-'} | <b>M/C:</b> ${r.mc || '-'}</p>
        <p style="color:var(--text3);font-size:12px">กรอก Datum Data / Non-datum Data ด้านล่างแล้วกด "Preview & Extract" เพื่อตรวจสอบค่าก่อน Merge</p>`;
    const previewArea = document.getElementById('merge-preview-area');
    if (previewArea) previewArea.innerHTML = html;

    showToast('✅ เชื่อมข้อมูล Waiting Record แล้ว ไปที่แถบ Stage 2 เพื่อกรอกค่า Datum/Non-datum', 'success');
    const btn = document.querySelector('[data-tab="stage2"]');
    if (btn) btn.click();
}

function parseStage2Data() {
    const mk = document.getElementById('merge-product').value;
    const ptFilter = document.getElementById('merge-pt').value.trim();
    const mcFilter = document.getElementById('merge-mc').value.trim();

    if (!mk) {
        showToast('กรุณาเลือก Target Product ก่อน', 'warn');
        return;
    }

    const recs = loadRecords();
    const candidates = recs.filter(r =>
        (r.overall === 'WAITING' || r.overall === 'Waiting') &&
        r.product === mk &&
        (ptFilter === '' || r.ptno === ptFilter) &&
        (mcFilter === '' || r.mc === mcFilter)
    ).sort((a, b) => new Date(a.date + 'T' + a.recvTime) - new Date(b.date + 'T' + b.recvTime));

    if (candidates.length === 0) {
        showToast('❌ ไม่พบ WAITING Drafts ที่ตรงกับเงื่อนไข — กรุณา Save Batch ใน Stage 1 ก่อน', 'error');
        return;
    }

    _selectedMergeId = candidates[0].id;

    const r = candidates[0];
    document.getElementById('stage2-target-info').style.display = 'block';
    document.getElementById('stage2-target-details').innerHTML = `
        <strong>Traveler:</strong> ${r.traveler || '-'} <br>
        <strong>Product:</strong> ${r.productLabel} | <strong>PT:</strong> ${r.ptno} | <strong>M/C:</strong> ${r.mc}
    `;
    const topText = document.getElementById('m-top-data').value;
    const botText = document.getElementById('m-bot-data').value;
    const topNums = topText.trim().split(/[\s\t\n]+/).map(parseFloat).filter(n => !isNaN(n));
    const botNums = botText.trim().split(/[\s\t\n]+/).map(parseFloat).filter(n => !isNaN(n));

    let html = `<h4>Extracted Data:</h4>`;
    html += `<p><b>Datum</b>: ${topNums.length} values => ${topNums.join(', ')}</p>`;
    html += `<p><b>Non-datum</b>: ${botNums.length} values => ${botNums.join(', ')}</p>`;
    document.getElementById('merge-preview-area').innerHTML = html;

    if (topNums.length > 0 && botNums.length > 0) {
        document.getElementById('btn-merge-damper').disabled = false;
        window._stage2Data = { topNums, botNums };
    }
}

async function commitStage2Damper() {
    if (!_selectedMergeId || !window._stage2Data) return;
    const recs = loadRecords();
    const idx = recs.findIndex(r => r.id === _selectedMergeId);
    if (idx === -1) return;

    const { topNums, botNums } = window._stage2Data;
    const mk = document.getElementById('merge-product').value;
    const ptFilter = document.getElementById('merge-pt').value.trim();
    const mcFilter = document.getElementById('merge-mc').value.trim();

    // Select all waiting records that match the current filter
    const allCandidates = recs.filter(r =>
        (r.overall === 'WAITING' || r.overall === 'Waiting') &&
        r.product === mk &&
        (ptFilter === '' || r.ptno === ptFilter) &&
        (mcFilter === '' || r.mc === mcFilter)
    ).sort((a, b) => new Date(a.date + 'T' + a.recvTime) - new Date(b.date + 'T' + b.recvTime));

    if (allCandidates.length === 0) return;

    // จำกัดจำนวนที่ merge ให้เท่ากับจำนวนข้อมูลที่มีการ Extract มา
    // เช่น ถ้า CMM ให้มา 4 ค่า ก็จะ merge แค่ 4 Record แรกที่รออยู่
    const mergeCount = Math.max(topNums.length, botNums.length);
    const candidates = allCandidates.slice(0, mergeCount || 1);

    for (let i = 0; i < candidates.length; i++) {
        const r = candidates[i];

        // If the text block has fewer values than candidates, fallback to the first value
        const dVal = topNums[i] !== undefined ? topNums[i] : topNums[0];
        const nVal = botNums[i] !== undefined ? botNums[i] : botNums[0];

        if (dVal === undefined || nVal === undefined) continue;

        if (!r.dimData) r.dimData = {};

        const topDef = DIM_GROUPS.datum.find(x => x.key === 'datum');
        const botDef = DIM_GROUPS.datum.find(x => x.key === 'nondatum');

        const evalSingle = (val, gDef) => {
            const lsl = gDef.lsl;
            const usl = gDef.usl;
            const ok = val >= lsl && val <= usl;
            return { vals: [val], avg: +val.toFixed(5), max: +val.toFixed(5), min: +val.toFixed(5), result: ok ? 'Pass' : 'Fail' };
        };

        r.dimData['datum'] = evalSingle(dVal, topDef);
        r.dimData['nondatum'] = evalSingle(nVal, botDef);

        r.datumAvg = dVal;
        r.datumMax = dVal;
        r.datumMin = dVal;
        r.datumResult = r.dimData['datum'].result;

        r.nondatumAvg = nVal;
        r.nondatumMax = nVal;
        r.nondatumMin = nVal;
        r.nondatumResult = r.dimData['nondatum'].result;

        const datumOk = r.datumResult === 'Pass';
        const nondatumOk = r.nondatumResult === 'Pass';
        r.overall = (!r.vmiNG && datumOk && nondatumOk) ? 'Pass' : 'Fail';

        if (r.overall === 'Fail') {
            const issues = [];
            if (r.vmiNG) {
                const vmiItems = VMI_ITEMS.filter(v => r.mode === 'roving' || v.id !== 'double');
                issues.push('VMI NG: ' + vmiItems.filter(v => r.vmi && r.vmi[v.id] === 'Fail').map(v => v.label).join(', '));
            }
            if (!datumOk) issues.push(`Datum out of spec (${fmt(r.datumAvg)})`);
            if (!nondatumOk) issues.push(`Non-datum out of spec (${fmt(r.nondatumAvg)})`);
            await sendSystemAlert('ng', issues.join(' | ') || 'Damper Inspection Fail', r, issues);
        }
    }

    saveRecords(recs);
    _selectedMergeId = null;
    window._stage2Data = null;
    document.getElementById('m-top-data').value = '';
    document.getElementById('m-bot-data').value = '';
    document.getElementById('merge-preview-area').innerHTML = '<div style="color:var(--pass);font-weight:bold;padding:10px;background:rgba(39,174,96,0.1);border-radius:6px;">✅ Merge สำเร็จ!</div>';
    document.getElementById('btn-merge-damper').disabled = true;
    document.getElementById('stage2-target-info').style.display = 'none';

    updateKPIs();
    renderRecords();
    renderPendingTable();
    if (window.BLoader) window.BLoader.show('กำลังอัปเดตและบันทึกลงฐานข้อมูลถาวร...');
    try {
        if (isServerOnline) await syncWithServer();
    } catch (e) {
        console.error('MySQL Sync Error:', e);
    }
    if (window.BLoader) window.BLoader.hide();

    showToast('✅ Merge + บันทึกลง MySQL สำเร็จ', 'success');

    // เด้งไปที่แท็บ About Data อัตโนมัติเมื่อบันทึกเสร็จ
    const aboutBtn = document.querySelector('.nav-btn[data-tab="records"]');
    if (aboutBtn) {
        switchTab('records', aboutBtn);
    } else {
        switchTab('records', null);
    }
}

// Hook tab switch to render pending table
const originalSwitchTab = switchTab;
switchTab = function (id, btn) {
    originalSwitchTab(id, btn);
    if (id === 'manual' || id === 'stage2') {
        renderPendingTable();
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