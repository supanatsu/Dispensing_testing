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
// Short Damper:
//   Point 1 (col R,S ≡ row 1/1 & 1/2) → spec 1.358 ± 0.010
//   Point 2 (col T,U ≡ row 1/3 & 1/4) → spec 0.03  ± 0.010  (transition zone)
//   แต่ใน format จริงมี 4 sub-points ต่อ group ตาม pcs
//   ดังนั้น: Point-1/1, 1/2, 1/3, 1/4 → spec A (1.358±0.010)
//            Point-2/1, 2/2, 2/3, 2/4 → spec B (0.03 ±0.010)
// Long Damper:
//   Top     1/1, 1/2, 1/3, 1/4 → spec A (0.814±0.010)
//   Bottom  2/1, 2/2, 2/3, 2/4 → spec B (0.03 ±0.010)

const DIM_GROUPS = {
    short: [
        {
            key: 'short_p1',
            label: 'Short — Point 1 (1/1 ~ 1/4)',
            subLabel: 'Spec: 1.358 ± 0.010 in.',
            nom: 1.358,
            tol: 0.010,
            points: ['1/1', '1/2', '1/3', '1/4'],
        },
        {
            key: 'short_p2',
            label: 'Short — Point 2 (2/1 ~ 2/4)',
            subLabel: 'Spec: 0.030 ± 0.010 in.',
            nom: 0.030,
            tol: 0.010,
            points: ['2/1', '2/2', '2/3', '2/4'],
        },
    ],
    long: [
        {
            key: 'long_top',
            label: 'Long — Top (1/1 ~ 1/4)',
            subLabel: 'Spec: 0.814 ± 0.010 in.',
            nom: 0.814,
            tol: 0.010,
            points: ['1/1', '1/2', '1/3', '1/4'],
        },
        {
            key: 'long_bot',
            label: 'Long — Bottom (2/1 ~ 2/4)',
            subLabel: 'Spec: 0.030 ± 0.010 in.',
            nom: 0.030,
            tol: 0.010,
            points: ['2/1', '2/2', '2/3', '2/4'],
        },
    ],
};

const DIM_GROUPS_BASE = JSON.parse(JSON.stringify(DIM_GROUPS));

// ─── Product Catalogue ────────────────────────────────────────
const PRODUCTS_DEFAULT = {
    cim3d: { label: 'Cimarron BP 3D', partno: '11511115-14', mc: '—', pcs: 4 },
    cim4d: { label: 'Cimarron BP 4D', partno: '11511117-25', mc: '33', pcs: 8 },
    cim5d: { label: 'Cimarron BP 5D', partno: '11511117-25', mc: '33', pcs: 10 },
    dor10n: { label: 'Dorado 10D NOAR', partno: '—', mc: '—', pcs: 10 },
    dor10d: { label: 'Dorado 10D', partno: '—', mc: '—', pcs: 10 },
    dor5dbb: { label: 'Dorado 5D AL BB', partno: '—', mc: '—', pcs: 4 },
    dor5d: { label: 'Dorado 5D', partno: '—', mc: '—', pcs: 4 },
    mar10d: { label: 'Marlin 10D', partno: '—', mc: '—', pcs: 10 },
    sky1d: { label: 'Skybolt 1D', partno: '—', mc: '—', pcs: 4 },
    sky2d: { label: 'Skybolt 2D', partno: '—', mc: '—', pcs: 4 },
    sky3d: { label: 'Skybolt 3D', partno: '—', mc: '—', pcs: 6 },
    sky4d: { label: 'Skybolt 4D', partno: '—', mc: '—', pcs: 8 },
    sum10d: { label: 'Summit 10D', partno: '—', mc: '—', pcs: 10 },
    v114d: { label: 'V11 4D', partno: '—', mc: '—', pcs: 4 },
    v15: { label: 'V15 CMR 4D', partno: '—', mc: '—', pcs: 4 },
};

let PRODUCTS = {};

// ════════════════════════════════════════════════════════════
//  Startup
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    populateProductDropdowns();
    buildVMIGrid();
    const d = document.getElementById('m-date');
    if (d) d.value = todayISO();
    startClock();
    updateKPIs();
    updateBadges();
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
                if (PRODUCTS[k]) PRODUCTS[k] = { ...PRODUCTS[k], ...saved.products[k] };
            });
        }

        // Dimensions are now dynamically loaded per-product in onProductChange()
    } catch { PRODUCTS = JSON.parse(JSON.stringify(PRODUCTS_DEFAULT)); }
}

function applyDamperConfigForProduct(productKey) {
    let cfg = {};
    try {
        const raw = localStorage.getItem(LS_KEY_CFG);
        if (raw) cfg = JSON.parse(raw);
    } catch (e) { }

    const prodOverride = (cfg.productDims && cfg.productDims[productKey]) ? cfg.productDims[productKey] : null;
    const globalDefault = cfg.dims || {};

    const allGroups = [...DIM_GROUPS.short, ...DIM_GROUPS.long];
    allGroups.forEach(g => {
        // Find base defaults
        const baseGroups = [...DIM_GROUPS_BASE.short, ...DIM_GROUPS_BASE.long];
        const baseG = baseGroups.find(x => x.key === g.key);

        let nom = baseG.nom;
        let tol = baseG.tol;

        if (prodOverride && prodOverride[g.key]) {
            if (prodOverride[g.key].nom !== undefined) nom = prodOverride[g.key].nom;
            if (prodOverride[g.key].tol !== undefined) tol = prodOverride[g.key].tol;
        } else if (globalDefault[g.key]) {
            if (globalDefault[g.key].nom !== undefined) nom = globalDefault[g.key].nom;
            if (globalDefault[g.key].tol !== undefined) tol = globalDefault[g.key].tol;
        }

        g.nom = nom;
        g.tol = tol;
        
        const lsl = (g.nom - g.tol).toFixed(3);
        const usl = (g.nom + g.tol).toFixed(3);
        g.subLabel = `Spec: ${g.nom.toFixed(4)} ± ${g.tol.toFixed(4)} in. (LSL: ${lsl} ~ USL: ${usl})`;
    });
}

// ─── Populate Dropdowns ───────────────────────────────────────
function populateProductDropdowns() {
    ['m-product', 'flt-product', 'viz-product'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        while (el.options.length > 1) el.remove(1);
        Object.keys(PRODUCTS).forEach(k => {
            const o = document.createElement('option');
            o.value = k; o.textContent = PRODUCTS[k].label;
            el.appendChild(o);
        });
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
    if (partEl) partEl.value = p.partno;
    if (mcEl && !mcEl.value) mcEl.value = (p.mc !== '—') ? p.mc : '';

    if (infoBar) infoBar.textContent =
        `${p.label} · ${p.pcs} pcs/batch | Short P1: 1.358±0.010 | Short P2: 0.030±0.010 | Long Top: 0.814±0.010 | Long Bot: 0.030±0.010`;

    // Update Frequency
    const qtyInput = document.getElementById('m-qty');
    if (qtyInput) {
        try {
            const raw = localStorage.getItem('belton_damper_v3_config');
            let cfg = raw ? JSON.parse(raw) : {};
            if (mode === 'buyoff' || mode === 'oba') {
                qtyInput.value = cfg.freqBuyoff ? `${cfg.freqBuyoff}/Shift/Oven` : '';
            } else if (mode.includes('roving')) {
                qtyInput.value = cfg.freqRoving ? `${cfg.freqRoving}/Shift/Oven` : '';
            } else {
                qtyInput.value = '';
            }
        } catch(e) {
            qtyInput.value = '';
        }
    }

    // Build all 4 dimension groups
    buildAllDimGroups(p.pcs);
}

// ─── Build Dimension Groups ───────────────────────────────────
function buildAllDimGroups(pcs) {
    const container = document.getElementById('dim-groups-container');
    if (!container) return;

    const allGroups = [...DIM_GROUPS.short, ...DIM_GROUPS.long];
    container.innerHTML = allGroups.map(g => buildGroupHTML(g, pcs)).join('');
}

function buildGroupHTML(g, pcs) {
    const lsl = g.nom - g.tol;
    const usl = g.nom + g.tol;
    const isShort = g.key.startsWith('short');
    const accentColor = isShort ? 'var(--blue)' : '#9B59B6';

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
                    placeholder="${g.nom.toFixed(4)}"
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
    const allGroups = [...DIM_GROUPS.short, ...DIM_GROUPS.long];
    const g = allGroups.find(x => x.key === groupKey);
    if (!g) return;

    const lsl = g.nom - g.tol;
    const usl = g.nom + g.tol;
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

    const isShort = groupKey.startsWith('short');
    const accentColor = isShort ? 'var(--blue)' : '#9B59B6';

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
    const allGroups = [...DIM_GROUPS.short, ...DIM_GROUPS.long];
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
function saveBatch() {
    const key = document.getElementById('m-product')?.value;
    if (!key) { showToast('กรุณาเลือก Product ก่อน', 'warn'); return; }
    const p = PRODUCTS[key];

    const mode = document.getElementById('m-mode')?.value || 'buyoff';

    // Collect dimension data from all 4 groups
    const allGroups = [...DIM_GROUPS.short, ...DIM_GROUPS.long];
    const dimData = {};
    let anyDimMissing = false;

    if (mode === 'buyoff') {
        for (const g of allGroups) {
            const lsl = g.nom - g.tol;
            const usl = g.nom + g.tol;
            // Auto-clone logic: If pc-1 is filled but the rest are empty, copy pc-1 to all
            const firstValStr = document.getElementById(`${g.key}-pc-1`)?.value;
            const firstVal = parseFloat(firstValStr);
            if (!isNaN(firstVal)) {
                let othersEmpty = true;
                for (let i = 2; i <= p.pcs; i++) {
                    const vStr = document.getElementById(`${g.key}-pc-${i}`)?.value;
                    if (vStr && vStr.trim() !== '') {
                        othersEmpty = false;
                        break;
                    }
                }
                if (othersEmpty) {
                    for (let i = 2; i <= p.pcs; i++) {
                        const el = document.getElementById(`${g.key}-pc-${i}`);
                        if (el) el.value = firstValStr;
                    }
                }
            }

            const vals = [];
            for (let i = 1; i <= p.pcs; i++) {
                const v = parseFloat(document.getElementById(`${g.key}-pc-${i}`)?.value);
                if (!isNaN(v)) vals.push(v);
            }
            if (!vals.length || vals.length < p.pcs) { anyDimMissing = true; break; }
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            const allOk = vals.every(v => v >= lsl && v <= usl);
            dimData[g.key] = {
                vals,
                avg: +avg.toFixed(5),
                max: +(Math.max(...vals)).toFixed(5),
                min: +(Math.min(...vals)).toFixed(5),
                result: allOk ? 'Pass' : 'Fail',
            };
        }

        if (anyDimMissing) {
            showToast('กรุณากรอกค่าวัดให้ครบทุก group ก่อน', 'warn'); return;
        }
    }

    // VMI
    const vmiData = {};
    const items = VMI_ITEMS.filter(v => mode === 'roving' || v.id !== 'double');
    items.forEach(v => {
        vmiData[v.id] = document.getElementById(`vmi-${v.id}`)?.value || 'Pass';
    });
    const vmiNG = Object.values(vmiData).some(v => v === 'Fail');

    // Summarize short/long results (fail if ANY group fails)
    let shortOk = true, longOk = true;
    let shortAvgMain = null, longAvgMain = null;
    if (mode === 'buyoff') {
        shortOk = dimData['short_p1'].result === 'Pass' && dimData['short_p2'].result === 'Pass';
        longOk = dimData['long_top'].result === 'Pass' && dimData['long_bot'].result === 'Pass';
        shortAvgMain = dimData['short_p1'].avg;
        longAvgMain = dimData['long_top'].avg;
    }

    const records = loadRecords();
    const no = records.length + 1;

    const rec = {
        id: Date.now(),
        no,
        mode,
        date: document.getElementById('m-date')?.value || todayISO(),
        product: key,
        productLabel: p.label,
        partno: p.partno,
        mc: document.getElementById('m-mc')?.value || p.mc,
        team: document.getElementById('m-team')?.value || '',
        qcEn: (document.getElementById('m-en')?.value || '').trim(),
        meEn: (document.getElementById('m-me-en')?.value || '').trim(),
        traveler: (document.getElementById('m-traveler')?.value || '').trim(),
        ptno: (document.getElementById('m-ptno')?.value || '').trim(),
        qty: (document.getElementById('m-qty')?.value || '').trim(),
        partno2: (document.getElementById('m-partno2')?.value || '').trim(),
        sendTime: document.getElementById('m-send-time')?.value || '',
        recvTime: document.getElementById('m-recv-time')?.value || '',
        attribute: document.getElementById('m-attribute')?.value || 'Normal',
        pcs: p.pcs,
        // Dimension data (all 4 groups)
        dimData,
        // Backwards-compat summary for charts
        shortAvg: shortAvgMain,
        shortMax: dimData['short_p1']?.max || null,
        shortMin: dimData['short_p1']?.min || null,
        shortResult: shortOk ? 'Pass' : 'Fail',
        longAvg: longAvgMain,
        longMax: dimData['long_top']?.max || null,
        longMin: dimData['long_top']?.min || null,
        longResult: longOk ? 'Pass' : 'Fail',
        vmi: vmiData,
        vmiNG,
        overall: document.getElementById('m-overall')?.value || 'Pass',
        savedAt: new Date().toISOString(),
    };

    records.push(rec);
    saveRecords(records);
    updateKPIs();
    updateBadges();

    // Alert if any fail
    if (vmiNG || !shortOk || !longOk || rec.overall === 'Fail') {
        alert(`แจ้งเตือน: พบข้อมูลอยู่นอกเกณฑ์ (Fail/Out of Spec)! \nโปรดตรวจสอบ Product: ${p.label} EN: ${rec.qcEn || '-'}`);
        const alerts = loadAlerts();
        const issues = [];
        const items = VMI_ITEMS.filter(v => mode === 'roving' || v.id !== 'double');
        if (vmiNG) issues.push('VMI NG: ' + items.filter(v => vmiData[v.id] === 'Fail').map(v => v.label).join(', '));
        if (!shortOk) {
            if (dimData['short_p1']?.result === 'Fail') issues.push(`Short P1 OUT Spec (Avg: ${dimData['short_p1'].avg})`);
            if (dimData['short_p2']?.result === 'Fail') issues.push(`Short P2 OUT Spec (Avg: ${dimData['short_p2'].avg})`);
        }
        if (!longOk) {
            if (dimData['long_top']?.result === 'Fail') issues.push(`Long Top OUT Spec (Avg: ${dimData['long_top'].avg})`);
            if (dimData['long_bot']?.result === 'Fail') issues.push(`Long Bot OUT Spec (Avg: ${dimData['long_bot'].avg})`);
        }
        alerts.unshift({
            id: rec.id, ts: rec.savedAt, level: 'ng',
            product: p.label, traveler: rec.traveler, qcEn: rec.qcEn,
            msg: issues.join(' | ')
        });
        saveAlerts(alerts);
        updateBadges();
        triggerAutoEml(rec, issues);
    }

    if (isServerOnline) syncWithServer();
    clearForm();
    showToast(`✅ บันทึก Batch #${no} — ${p.label} (${p.pcs} pcs) สำเร็จ`, 'success');
}

function clearForm() {
    ['m-mc', 'm-ptno', 'm-traveler', 'm-qc-en', 'm-en', 'm-me-en', 'm-send-time', 'm-recv-time', 'm-qty', 'm-partno2'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const dateEl = document.getElementById('m-date');
    if (dateEl) dateEl.value = todayISO();
    const prodEl = document.getElementById('m-product');
    if (prodEl) prodEl.value = '';
    setOverallPF('Pass');
    const partEl = document.getElementById('m-partno');
    if (partEl) partEl.value = '';
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
    if (infoBar) infoBar.textContent = 'เลือก Product → ระบบจะโหลด Part No., M/C, จำนวนชิ้น และ Spec อัตโนมัติ';
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
    const sAvgs = recs.map(r => r.shortAvg).filter(v => v && v > 0);
    const lAvgs = recs.map(r => r.longAvg).filter(v => v && v > 0);
    const sAvg = sAvgs.length ? sAvgs.reduce((a, b) => a + b, 0) / sAvgs.length : null;
    const lAvg = lAvgs.length ? lAvgs.reduce((a, b) => a + b, 0) / lAvgs.length : null;

    setKpi('kpi-total', recs.length);
    setKpi('kpi-today', todayR);
    setKpi('kpi-pass', passes);
    setKpi('kpi-fail', fails);
    setKpi('kpi-vmi-ng', vmiNG);
    setKpi('kpi-yield', yield_ !== null ? yield_ + '%' : '—%');
    setKpi('kpi-avg-short', sAvg !== null ? sAvg.toFixed(5) : '—');
    setKpi('kpi-avg-long', lAvg !== null ? lAvg.toFixed(5) : '—');
}

function setKpi(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function updateBadges() {
    const recs = loadRecords();
    setKpi('badge-records', recs.length);
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

    const ovBadge = v => v === 'Pass' ? `<span class="badge-pass">Pass</span>` : `<span class="badge-fail">Fail</span>`;
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
            <td style="font-size:11px;color:var(--text3)">${r.partno || '—'}</td>
            <td>${r.mc || '—'}</td>
            <td style="font-size:12px">${r.team || '—'}</td>
            <td style="font-weight:600">${r.qcEn || '—'}</td>
            <td style="font-size:11px;color:var(--text3)">${r.meEn || '—'}</td>
            <td style="font-size:11px;color:var(--text3)">${r.traveler || '—'}</td>
            <td style="font-size:11px">${r.attribute || '—'}</td>
            <td style="text-align:center">${r.pcs}</td>
            <td style="font-size:12px">${dimDetail(r, 'short_p1')}</td>
            <td style="font-size:12px">${dimDetail(r, 'short_p2')}</td>
            <td style="font-size:12px">${dimDetail(r, 'long_top')}</td>
            <td style="font-size:12px">${dimDetail(r, 'long_bot')}</td>
            <td>${vmiSum(r)}</td>
            <td>${ovBadge(r.overall)}</td>
            <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="viewRecord(${r.id})">👁</button>
                    <button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 6px" onclick="deleteRecord(${r.id})">🗑</button>
                </div>
            </td>
        </tr>`).join('');
}

function viewRecord(id) {
    const r = loadRecords().find(x => x.id === id);
    if (!r) return;
    const p = PRODUCTS[r.product] || {};
    const allGroups = [...DIM_GROUPS.short, ...DIM_GROUPS.long];

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
            <div><span style="color:var(--text3)">M/C:</span> ${r.mc || '—'}</div>
            <div><span style="color:var(--text3)">Team:</span> ${r.team || '—'}</div>
            <div><span style="color:var(--text3)">QC EN#:</span> <b>${r.qcEn || '—'}</b></div>
            <div><span style="color:var(--text3)">ME EN#:</span> ${r.meEn || '—'}</div>
            <div><span style="color:var(--text3)">Traveler:</span> ${r.traveler || '—'}</div>
            <div><span style="color:var(--text3)">Send:</span> ${r.sendTime || '—'}</div>
            <div><span style="color:var(--text3)">Recv:</span> ${r.recvTime || '—'}</div>
            <div><span style="color:var(--text3)">Attribute:</span> ${r.attribute || '—'}</div>
            <div><span style="color:var(--text3)">Pcs:</span> ${r.pcs}</div>
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
            } catch (e) { console.error('Delete Damper Record Error:', e); }
        }
        saveRecords(loadRecords().filter(r => r.id !== id));
        updateKPIs(); updateBadges(); renderRecords();
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
        'No', 'Date', 'Mode', 'Product', 'PartNo', 'MC', 'Team', 'QC_EN', 'ME_EN', 'Traveler',
        'SendTime', 'RecvTime', 'Attribute', 'Pcs',
        'ShortP1_Avg', 'ShortP1_Max', 'ShortP1_Min', 'ShortP1_Result',
        'ShortP2_Avg', 'ShortP2_Max', 'ShortP2_Min', 'ShortP2_Result',
        'LongTop_Avg', 'LongTop_Max', 'LongTop_Min', 'LongTop_Result',
        'LongBot_Avg', 'LongBot_Max', 'LongBot_Min', 'LongBot_Result',
        'VMI_NG', 'Overall',
    ];
    const rows = recs.map(r => {
        const d = r.dimData || {};
        const gd = (k) => d[k] || {};
        return [
            r.no, r.date, r.mode || 'Buy off', r.productLabel, r.partno, r.mc, r.team, r.qcEn, r.meEn, r.traveler,
            r.sendTime || '', r.recvTime || '', r.attribute, r.pcs,
            gd('short_p1').avg || '', gd('short_p1').max || '', gd('short_p1').min || '', gd('short_p1').result || '',
            gd('short_p2').avg || '', gd('short_p2').max || '', gd('short_p2').min || '', gd('short_p2').result || '',
            gd('long_top').avg || '', gd('long_top').max || '', gd('long_top').min || '', gd('long_top').result || '',
            gd('long_bot').avg || '', gd('long_bot').max || '', gd('long_bot').min || '', gd('long_bot').result || '',
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
    const shortAvgs = recs.map(r => r.shortAvg);
    const longAvgs = recs.map(r => r.longAvg);

    // Dynamic specs
    let sLSL = 1.358 - 0.010, sUSL = 1.358 + 0.010, sNom = 1.358;
    let lLSL = 0.814 - 0.010, lUSL = 0.814 + 0.010, lNom = 0.814;

    if (key && typeof DAMPER_LIMITS !== 'undefined' && DAMPER_LIMITS[key]) {
        const bot = DAMPER_LIMITS[key]['bottom'];
        if (bot) {
            if (bot.lsl !== null) sLSL = parseFloat(bot.lsl);
            if (bot.usl !== null) sUSL = parseFloat(bot.usl);
            if (bot.cl !== null) sNom = parseFloat(bot.cl);
        }
        const top = DAMPER_LIMITS[key]['top'];
        if (top) {
            if (top.lsl !== null) lLSL = parseFloat(top.lsl);
            if (top.usl !== null) lUSL = parseFloat(top.usl);
            if (top.cl !== null) lNom = parseFloat(top.cl);
        }
    }

    const slbl = document.getElementById('short-lbl');
    if (slbl) slbl.textContent = `Short P1 • LSL: ${sLSL.toFixed(3)} | Nom: ${sNom.toFixed(3)} | USL: ${sUSL.toFixed(3)}`;
    const llbl = document.getElementById('long-lbl');
    if (llbl) llbl.textContent = `Long Top • LSL: ${lLSL.toFixed(3)} | Nom: ${lNom.toFixed(3)} | USL: ${lUSL.toFixed(3)}`;

    _cShort = buildTrendChart('chart-short', _cShort, labels, shortAvgs, 'Short P1 Avg', [
        { label: 'LSL', val: sLSL, color: 'rgba(231,76,60,.8)' },
        { label: 'Nom', val: sNom, color: 'rgba(39,174,96,.8)' },
        { label: 'USL', val: sUSL, color: 'rgba(231,76,60,.8)' },
    ]);
    _cLong = buildTrendChart('chart-long', _cLong, labels, longAvgs, 'Long Top Avg', [
        { label: 'LSL', val: lLSL, color: 'rgba(231,76,60,.8)' },
        { label: 'Nom', val: lNom, color: 'rgba(155,89,182,.8)' },
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


function sendSingleAlertEml(id) {
    const a = loadAlerts().find(x => String(x.id) === String(id));
    if (!a) return;
    const subj = `[DAMPER FAIL] Damper Install Alert — ${a.product} | QC EN: ${a.qcEn}`;
    const body = `<pre style="font-family:Calibri,sans-serif;font-size:13px">BELTON IPQC — Damper Install Alert\n${'-'.repeat(50)}\nProduct : ${a.product}\nQC EN#  : ${a.qcEn}\nTraveler: ${a.traveler}\nIssues  : ${a.msg}\nTime    : ${new Date(a.ts).toLocaleString('th-TH')}</pre>`;
    const cfg = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
    downloadEmlBlob(cfg.email || 'supanatt04@gmail.com', subj, body);
}

// ------------------- Outlook / EML -------------------
function triggerAutoEml(rec, issues) {
    const cfg = JSON.parse(localStorage.getItem(LS_KEY_CFG) || '{}');
    const to = cfg.email || 'supanatt04@gmail.com';
    const p = PRODUCTS[rec.product];
    const subj = `[DAMPER FAIL] Damper Install — ${p?.label || rec.productLabel} | QC EN: ${rec.qcEn}`;

    // Build offscreen Chart.js trend image (last 20 records)
    const recentRecs = loadRecords().slice(-20);
    const canvas = document.createElement('canvas');
    canvas.width = 750; canvas.height = 300;
    canvas.style.position = 'absolute'; canvas.style.left = '-9999px';
    document.body.appendChild(canvas);

    let chartImg = '';
    try {
        const labels = recentRecs.map(r => `#${r.no}`);
        const sAvgs = recentRecs.map(r => r.shortAvg);
        const lAvgs = recentRecs.map(r => r.longAvg);
        const tempChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Short P1 Avg', data: sAvgs, borderColor: 'rgba(37,99,235,0.9)', backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 2, pointRadius: 4, tension: 0.3 },
                    { label: 'Long Top Avg', data: lAvgs, borderColor: 'rgba(124,58,237,0.9)', backgroundColor: 'rgba(124,58,237,0.1)', borderWidth: 2, pointRadius: 4, tension: 0.3 },
                    { label: 'Short USL (1.368)', data: Array(labels.length).fill(1.368), borderColor: 'rgba(231,76,60,0.7)', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0 },
                    { label: 'Short LSL (1.348)', data: Array(labels.length).fill(1.348), borderColor: 'rgba(231,76,60,0.7)', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0 },
                ]
            },
            options: {
                responsive: false, animation: false,
                plugins: { title: { display: true, text: 'Damper Install Trend (Last 20 Records)', font: { size: 13, weight: 'bold' } }, legend: { position: 'top' } },
                scales: { y: { beginAtZero: false, ticks: { stepSize: 0.005 } } }
            }
        });
        chartImg = canvas.toDataURL('image/png');
        tempChart.destroy();
    } catch (e) { console.error('Chart gen error:', e); }
    finally { document.body.removeChild(canvas); }

    const html = `
    <div style="font-family:'Calibri','Candara','Segoe UI',sans-serif;color:#333;max-width:700px;margin:0 auto;border:1.5px solid #d1d5db;border-radius:8px;overflow:hidden;">
      <div style="background:#7c3aed;padding:18px 24px;color:white;">
        <h2 style="margin:0;font-size:20px;font-weight:700;">🔴 CRITICAL FAIL — Damper Install</h2>
        <p style="margin:4px 0 0;opacity:0.9;font-size:13px;">Belton Automated Real-time Quality Alert System</p>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;color:#4b5563;width:35%">Product</td><td style="padding:8px 0;color:#1f2937"><b>${p?.label || rec.productLabel || '—'}</b></td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;color:#4b5563">QC EN#</td><td style="padding:8px 0;color:#1f2937">${rec.qcEn || '—'}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;color:#4b5563">ME EN#</td><td style="padding:8px 0;color:#1f2937">${rec.meEn || '—'}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;color:#4b5563">Traveler</td><td style="padding:8px 0;color:#1f2937">${rec.traveler || '—'}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;color:#4b5563">Date</td><td style="padding:8px 0;color:#1f2937">${rec.date}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;color:#4b5563">Short P1 Avg</td><td style="padding:8px 0;font-weight:bold;color:${rec.shortResult === 'Pass' ? '#27ae60' : '#e74c3c'}">${rec.shortAvg ?? '—'}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;color:#4b5563">Long Top Avg</td><td style="padding:8px 0;font-weight:bold;color:${rec.longResult === 'Pass' ? '#27ae60' : '#e74c3c'}">${rec.longAvg ?? '—'}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:700;color:#4b5563">Defects Found</td><td style="padding:8px 0;color:#e74c3c;font-weight:bold">${issues.join(' | ')}</td></tr>
        </table>
        ${chartImg ? `
        <div style="margin:24px 0;text-align:center;">
          <p style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:bold">📊 Damper Dimension Trend (Last 20 Records)</p>
          <img src="${chartImg}" alt="Defect Trend" style="max-width:100%;border:1px solid #e5e7eb;border-radius:6px;">
        </div>` : ''}
        <div style="background:#fef9ee;border-left:4px solid #7c3aed;padding:12px 16px;margin-top:20px;font-size:13px;border-radius:0 4px 4px 0;">
          <span style="font-weight:700;color:#374151;">⚠️ Action Required:</span> Damper dimension out of spec. Halt production and perform corrective action immediately!
        </div>
      </div>
    </div>`;
    downloadEmlBlob(to, subj, html);
}


function generateOutlookDraft() {
    const alerts = loadAlerts();
    if (!alerts.length) { showToast('ไม่มี Alert', 'warn'); return; }
    const to = document.getElementById('outlook-to')?.value || 'supanatt04@gmail.com';
    const now = new Date().toLocaleString('th-TH');
    const subj = `[IPQC Damper Alert Summary] ${now}`;
    const rows = alerts.map(a => `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:7px 10px">${new Date(a.ts).toLocaleString('th-TH')}</td>
        <td style="padding:7px 10px;color:#E74C3C;font-weight:700">FAIL</td>
        <td style="padding:7px 10px">${a.product}</td>
        <td style="padding:7px 10px">${a.qcEn || '—'}</td>
        <td style="padding:7px 10px;font-size:11px">${a.msg}</td>
    </tr>`).join('');
    const html = `<div style="font-family:Calibri,sans-serif">
        <h2 style="color:#7c3aed">BELTON IPQC — Damper Install Alert Summary</h2>
        <p>Generated: ${now} | Total: ${alerts.length}</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="background:#7c3aed;color:#fff">
                <tr><th style="padding:8px">Time</th><th>Level</th><th>Product</th><th>QC EN#</th><th>Message</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
    _emlCache = { to, subj, html };
    document.getElementById('ol-subject').textContent = subj;
    document.getElementById('ol-body').innerHTML = `${alerts.length} alerts ready to send to ${to}`;
    document.getElementById('ol-preview').style.display = 'block';
    document.getElementById('export-actions').style.display = 'block';
    showToast(`สร้าง EML draft (${alerts.length} alerts)`, 'success');
}

function downloadOutlookEml() {
    if (!_emlCache) { showToast('กรุณากด Step 1 ก่อน', 'warn'); return; }
    downloadEmlBlob(_emlCache.to, _emlCache.subj, _emlCache.html);
}

function downloadEmlBlob(to, subject, htmlContent) {
    const boundary = 'IPQC_DMR_' + Date.now();
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
    a.download = `Damper_Alert_${todayISO()}.eml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('📧 EML downloaded! เปิดด้วย Outlook', 'success');
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
            const confRes = await fetch(`${BACKEND_URL}/api/system/spc_limits?mode=damper`);
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
                // Map from server format to local format
                const mapped = data.records.map(r => ({
                    id: r.no + '_' + (r.mode || 'Buy off'),
                    no: r.no,
                    mode: r.mode || 'Buy off',
                    date: r.date,
                    product: r.traveler ? r.traveler.split('_')[0] : '',
                    productLabel: r.traveler || '',
                    partno: '',
                    mc: '',
                    team: r.team || '',
                    qcEn: r.qcEn || '',
                    meEn: r.meEn || '',
                    traveler: r.traveler || '',
                    sendTime: r.sendTime || '',
                    recvTime: r.recvTime || '',
                    attribute: r.attribute || 'Normal',
                    pcs: (r.short && r.short.vals) ? r.short.vals.length : 0,
                    dimData: {
                        short_p1: r.short ? { avg: r.short.avg, max: r.short.max, min: r.short.min, vals: r.short.vals || [], result: r.short.inSpec ? 'Pass' : 'Fail' } : null,
                        short_p2: null,
                        long_top: r.long ? { avg: r.long.avg, max: r.long.max, min: r.long.min, vals: r.long.vals || [], result: r.long.inSpec ? 'Pass' : 'Fail' } : null,
                        long_bot: null,
                    },
                    shortAvg: r.short ? r.short.avg : null,
                    shortMax: r.short ? r.short.max : null,
                    shortMin: r.short ? r.short.min : null,
                    shortResult: r.short ? (r.short.inSpec ? 'Pass' : 'Fail') : 'Pass',
                    longAvg: r.long ? r.long.avg : null,
                    longMax: r.long ? r.long.max : null,
                    longMin: r.long ? r.long.min : null,
                    longResult: r.long ? (r.long.inSpec ? 'Pass' : 'Fail') : 'Pass',
                    vmi: r.vmi || {},
                    vmiNG: !r.vmiPass,
                    overall: r.overallPass ? 'Pass' : 'Fail',
                    savedAt: r.savedAt
                }));
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
            body: JSON.stringify({ records: loadRecords(), alerts: loadAlerts() }),
        });
        const r = await res.json();
        showToast(r.success ? '🔄 Synchronized!' : 'Sync failed: ' + r.message, r.success ? 'success' : 'error');
    } catch { showToast('Sync error', 'error'); }
    finally { window.BLoader?.hide(); }
}

// ------------------------------------------------------------------------------------------
//  Utilities
// ------------------------------------------------------------------------------------------
function loadRecords() { try { return JSON.parse(localStorage.getItem(LS_KEY_DMR) || '[]'); } catch { return []; } }
function saveRecords(a) { localStorage.setItem(LS_KEY_DMR, JSON.stringify(a)); }
function loadAlerts() { try { return JSON.parse(localStorage.getItem(LS_KEY_ALERTS) || '[]'); } catch { return []; } }
function saveAlerts(a) { localStorage.setItem(LS_KEY_ALERTS, JSON.stringify(a)); }
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
                    partno: getVal('PartNo') || '',
                    mc: getVal('MC') || '',
                    team: getVal('Team') || '',
                    qcEn: getVal('QC_EN') || '',
                    meEn: getVal('ME_EN') || '',
                    traveler: getVal('Traveler') || '',
                    sendTime: getVal('SendTime') || '',
                    recvTime: getVal('RecvTime') || '',
                    attribute: getVal('Attribute') || 'Normal',
                    pcs: parseInt(getVal('Pcs')) || 0,
                    shortAvg: parseFloat(getVal('ShortP1_Avg')) || null,
                    shortMax: parseFloat(getVal('ShortP1_Max')) || null,
                    shortMin: parseFloat(getVal('ShortP1_Min')) || null,
                    shortResult: getVal('ShortP1_Result') || 'Pass',
                    longAvg: parseFloat(getVal('LongTop_Avg')) || null,
                    longMax: parseFloat(getVal('LongTop_Max')) || null,
                    longMin: parseFloat(getVal('LongTop_Min')) || null,
                    longResult: getVal('LongTop_Result') || 'Pass',
                    vmiNG: getVal('VMI_NG') === 'YES',
                    overall: getVal('Overall') || 'Pass',
                    savedAt: new Date().toISOString(),
                    dimData: {
                        short_p1: { avg: parseFloat(getVal('ShortP1_Avg')), max: parseFloat(getVal('ShortP1_Max')), min: parseFloat(getVal('ShortP1_Min')), result: getVal('ShortP1_Result') },
                        short_p2: { avg: parseFloat(getVal('ShortP2_Avg')), max: parseFloat(getVal('ShortP2_Max')), min: parseFloat(getVal('ShortP2_Min')), result: getVal('ShortP2_Result') },
                        long_top: { avg: parseFloat(getVal('LongTop_Avg')), max: parseFloat(getVal('LongTop_Max')), min: parseFloat(getVal('LongTop_Min')), result: getVal('LongTop_Result') },
                        long_bot: { avg: parseFloat(getVal('LongBot_Avg')), max: parseFloat(getVal('LongBot_Max')), min: parseFloat(getVal('LongBot_Min')), result: getVal('LongBot_Result') }
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
function renderPendingTable() {
    const recs = loadRecords().filter(r => r.overall === 'Waiting' || r.overall === 'WAITING');
    const tbody = document.getElementById('pending-table-wrap');
    if (!tbody) return;
    if (!recs.length) {
        tbody.innerHTML = '<div class="empty" style="padding:20px"><p>ไม่มี Pending Records</p></div>';
        return;
    }
    
    let html = '<table style="width:100%;text-align:left;">';
    html += '<thead><tr><th>No</th><th>Date</th><th>Product</th><th>PT Number</th><th>Select</th></tr></thead><tbody>';
    recs.forEach(r => {
        html += `<tr>
            <td>${r.no}</td>
            <td>${r.date}</td>
            <td>${r.productLabel}</td>
            <td>${r.partno || '-'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="selectPendingForMerge(${r.id})">Select</button></td>
        </tr>`;
    });
    html += '</tbody></table>';
    tbody.innerHTML = html;
}

let _selectedMergeId = null;
function selectPendingForMerge(id) {
    _selectedMergeId = id;
    showToast('เลือก Record แล้ว ไปที่แถบ Stage 2 เพื่อนำเข้าข้อมูล', 'success');
    const btn = document.querySelector('[data-tab="stage2"]');
    if (btn) btn.click();
}

function parseStage2Data() {
    if (!_selectedMergeId) {
        showToast('กรุณาเลือก Pending Record ก่อน (แถบ Manual Input)', 'warn');
        return;
    }
    const topText = document.getElementById('m-top-data').value;
    const botText = document.getElementById('m-bot-data').value;
    const topNums = topText.trim().split(/[\s\t\n]+/).map(parseFloat).filter(n => !isNaN(n));
    const botNums = botText.trim().split(/[\s\t\n]+/).map(parseFloat).filter(n => !isNaN(n));
    
    let html = `<h4>Extracted Data:</h4>`;
    html += `<p><b>Top</b>: ${topNums.length} values => ${topNums.join(', ')}</p>`;
    html += `<p><b>Bottom</b>: ${botNums.length} values => ${botNums.join(', ')}</p>`;
    document.getElementById('merge-preview-area').innerHTML = html;
    
    if(topNums.length > 0 && botNums.length > 0) {
        document.getElementById('btn-merge-damper').disabled = false;
        window._stage2Data = { topNums, botNums };
    }
}

function commitStage2Damper() {
    if (!_selectedMergeId || !window._stage2Data) return;
    const recs = loadRecords();
    const idx = recs.findIndex(r => r.id === _selectedMergeId);
    if (idx === -1) return;
    
    const r = recs[idx];
    const { topNums, botNums } = window._stage2Data;
    
    if (!r.dimData) r.dimData = {};
    
    const evalGroup = (key, nums, gDef) => {
        const lsl = gDef.nom - gDef.tol;
        const usl = gDef.nom + gDef.tol;
        const avg = nums.reduce((a,b)=>a+b,0)/nums.length;
        const max = Math.max(...nums);
        const min = Math.min(...nums);
        const allOk = nums.every(v => v >= lsl && v <= usl);
        return { vals: nums, avg: +avg.toFixed(5), max: +max.toFixed(5), min: +min.toFixed(5), result: allOk ? 'Pass' : 'Fail' };
    };
    
    const topDef = DIM_GROUPS.long.find(x => x.key === 'long_top');
    const botDef = DIM_GROUPS.long.find(x => x.key === 'long_bot');
    
    r.dimData['long_top'] = evalGroup('long_top', topNums, topDef);
    r.dimData['long_bot'] = evalGroup('long_bot', botNums, botDef);
    
    r.longAvg = r.dimData['long_top'].avg;
    r.longMax = r.dimData['long_top'].max;
    r.longMin = r.dimData['long_top'].min;
    r.longResult = (r.dimData['long_top'].result === 'Pass' && r.dimData['long_bot'].result === 'Pass') ? 'Pass' : 'Fail';
    
    const shortOk = (r.dimData['short_p1']?.result === 'Pass' && r.dimData['short_p2']?.result === 'Pass');
    r.overall = (!r.vmiNG && shortOk && r.longResult === 'Pass') ? 'Pass' : 'Fail';
    
    saveRecords(recs);
    _selectedMergeId = null;
    window._stage2Data = null;
    document.getElementById('m-top-data').value = '';
    document.getElementById('m-bot-data').value = '';
    document.getElementById('merge-preview-area').innerHTML = '<div style="color:var(--pass);font-weight:bold;padding:10px;background:rgba(39,174,96,0.1);border-radius:6px;">✅ Merge สำเร็จ!</div>';
    document.getElementById('btn-merge-damper').disabled = true;
    
    updateKPIs();
    renderRecords();
    renderPendingTable();
    showToast('บันทึกข้อมูลเรียบร้อย', 'success');
    
    if (typeof syncWithServer === 'function') syncWithServer();
}

function clearAllDrafts() {
    showConfirm('Clear Waiting', 'ลบ Waiting Records ทั้งหมด?', () => {
        const recs = loadRecords().filter(r => r.overall !== 'Waiting' && r.overall !== 'WAITING');
        saveRecords(recs);
        renderPendingTable();
        showToast('ลบข้อมูล Waiting เรียบร้อย', 'success');
    });
}

const originalSaveBatch = saveBatch;
saveBatch = function() {
    const allGroups = [...DIM_GROUPS.short, ...DIM_GROUPS.long];
    let anyMissing = false;
    for (const g of allGroups) {
        if (!document.getElementById(`${g.key}-pc-1`) || !document.getElementById(`${g.key}-pc-1`).value) {
            anyMissing = true;
        }
    }
    
    if (anyMissing) {
        showConfirm('ข้อมูลไม่ครบ', 'ต้องการบันทึกเป็น Waiting (Stage 1) เพื่อรอ Merge ข้อมูลทีหลังหรือไม่?', () => {
            const oldOverall = document.getElementById('m-overall').value;
            setOverallPF('Waiting');
            try {
                const oldGroups = [...DIM_GROUPS.long];
                DIM_GROUPS.long = []; 
                originalSaveBatch();
                DIM_GROUPS.long = oldGroups;
                renderPendingTable();
            } finally {
                setOverallPF(oldOverall);
            }
        });
        return;
    }
    originalSaveBatch();
}

// Hook tab switch to render pending table
const originalSwitchTab = switchTab;
switchTab = function(id, btn) {
    originalSwitchTab(id, btn);
    if(id === 'manual' || id === 'stage2') {
        renderPendingTable();
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

