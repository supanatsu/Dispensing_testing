// 1. ตั้งค่า LocalStorage ใหม่
const LS_KEY = 'belton_ipqc_dispensing_merged';
const ALERT_KEY = 'belton_alertlog_dispensing_merged';

const customCanvasBackgroundColor = {
    id: 'customCanvasBackgroundColor',
    beforeDraw: (chart, args, options) => {
        const { ctx } = chart; ctx.save(); ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = options.color || '#ffffff'; ctx.fillRect(0, 0, chart.width, chart.height); ctx.restore();
    }
};
Chart.register(customCanvasBackgroundColor);

// ══════════════════════════════════════════════════════════════════════
// _internalProducts — Live Proxy อ่าน window.PRODUCTS ณ ขณะที่ถูกเรียก
// (ไม่ capture ตอน parse เพราะ shared_products.js โหลด async)
// ══════════════════════════════════════════════════════════════════════
const _internalProducts = new Proxy({}, {
    get(_, prop) { return (window.PRODUCTS || {})[prop]; },
    ownKeys() { return Object.keys(window.PRODUCTS || {}); },
    has(_, key) { return key in (window.PRODUCTS || {}); },
    getOwnPropertyDescriptor(_, key) {
        if (key in (window.PRODUCTS || {})) return { enumerable: true, configurable: true };
    }
});

// ══════════════════════════════════════════════════════════════════════
// normalizeProductStr + getProductConfig
// Ultra-robust fuzzy resolver: dropdown value → canonical PRODUCTS key
// รองรับ: "Skybolt 1D MM", "skybolt1d", "sky1dmm", "Skybolt-1D-mm" ฯลฯ
// ══════════════════════════════════════════════════════════════════════
function normalizeProductStr(str) {
    return (str || '')
        .toLowerCase()
        .replace(/[\s\-_]+/g, '')       // ลบ space / hyphen / underscore
        .replace(/\binch(es)?\b/g, '')  // ลบ "inch"
        .replace(/\bmm\b/g, '')         // ลบ "mm"
        .replace(/\bnoar\b/g, '')       // ลบ "noar"
        .replace(/\baad\b/g, '')        // ลบ "aad"
        .replace(/\balbb?\b/g, '')      // ลบ "alb/albb"
        .replace(/\bpof\b/g, '')        // ลบ suffix "(POF)"
        .replace(/[()]/g, '')           // ลบวงเล็บ
        .replace(/[^a-z0-9]/g, '');     // เก็บเฉพาะ alphanumeric
}

function getProductConfig(selectedValue) {
    const products = window.PRODUCTS || {};

    // 1. Exact key match (fast path)
    if (selectedValue && products[selectedValue]) {
        return { key: selectedValue, cfg: products[selectedValue] };
    }

    const normSelected = normalizeProductStr(selectedValue);
    if (!normSelected) return null;

    // 2. Normalized key match
    for (const [k, v] of Object.entries(products)) {
        if (normalizeProductStr(k) === normSelected) return { key: k, cfg: v };
    }

    // 3. Normalized label match
    for (const [k, v] of Object.entries(products)) {
        if (normalizeProductStr(v.label || '') === normSelected) return { key: k, cfg: v };
    }

    // 4. Substring match (longest key first)
    const entries = Object.entries(products).sort((a, b) => b[0].length - a[0].length);
    for (const [k, v] of entries) {
        const normKey = normalizeProductStr(k);
        const normLabel = normalizeProductStr(v.label || '');
        if (normKey && (normSelected.includes(normKey) || normKey.includes(normSelected))) return { key: k, cfg: v };
        if (normLabel && (normSelected.includes(normLabel) || normLabel.includes(normSelected))) return { key: k, cfg: v };
    }

    console.warn(`[getProductConfig] ไม่พบ product สำหรับ: "${selectedValue}"`);
    return null;
}

// ══════════════════════════════════════════════════════════════════════
// fetchDynamicProducts
// โหลด 2 สิ่งพร้อมกัน:
//   1. dispensing_product  → SERVER_PRODUCTS_LIST (สำหรับ dropdown display)
//   2. master_products     → window.PRODUCTS      (สำหรับ dims + spec lookup)
// ══════════════════════════════════════════════════════════════════════
window.SERVER_PRODUCTS_LIST = [];

async function fetchDynamicProducts() {
    try {
        // ── โหลด master_products ก่อน (window.PRODUCTS ต้องพร้อมก่อน populateDropdowns)
        if (!window.PRODUCTS || Object.keys(window.PRODUCTS).length === 0) {
            try {
                const mpRes = await fetch(`${API_BASE}/api/system/products`);
                const mpData = await mpRes.json();
                if (mpData.success && mpData.products && mpData.products.length > 0) {
                    const built = {};
                    mpData.products.forEach(p => {
                        built[p.product_key] = {
                            label: p.product_name,
                            dims: p.dims ? (typeof p.dims === 'string' ? JSON.parse(p.dims) : p.dims) : []
                        };
                    });
                    window.PRODUCTS = built;
                    console.log(`[fetchDynamicProducts] window.PRODUCTS โหลดจาก /api/system/products แล้ว (${Object.keys(built).length} products)`);
                }
            } catch (mpErr) {
                console.warn('[fetchDynamicProducts] ไม่สามารถโหลด master_products:', mpErr);
            }
        }

        // ── โหลด dispensing_product สำหรับ dropdown display
        const res = await fetch(`${API_BASE}/api/dispensing/products_list`);
        const data = await res.json();
        if (data.success && data.products) {
            window.SERVER_PRODUCTS_LIST = data.products;
        }
    } catch (e) {
        console.error('[fetchDynamicProducts] Failed:', e);
    } finally {
        // เรียก populateDropdowns เสมอ — แม้ API บางตัวจะ fail
        populateDropdowns();
    }
}

let DB = { records: [], configs: {} }; let ALERT_LOG = []; let tempImport = []; let editId = null; let spcChart = null, histChart = null; let activePTFilter = 'all';
let window_spcCharts = []; // เปลี่ยนเป็น Array เพื่อรองรับหลาย Canvas

// ==========================================
// FORM MEMORY: จำค่าที่กรอกไว้ก่อนหน้า (เมื่อ Product & DataType ยังเหมือนเดิม)
// โครงสร้าง: { model, dataType, fix1, fix2, pt, buytime, mctime, date, team, op, values:{id:val,...} }
// ==========================================
let _formMemory = null;
window.startDate = null; // ตัวแปรเก็บช่วงเวลา
window.endDate = null;

function getLocalToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const TODAY = getLocalToday();

// ── Smart Cache: เก็บเฉพาะ WAITING drafts, records จริงมาจาก MySQL เท่านั้น ──
try {
    // โหลด WAITING + ร่างที่กรอกค้างไว้ (DRAFT_INCOMPLETE/DRAFT_WAITING) ไว้ก่อน (ข้อมูลที่กรอกค้างอยู่ยังไม่ submit)
    const s = localStorage.getItem(LS_KEY) || localStorage.getItem('belton_ipqc_v10');
    if (s) {
        const parsed = JSON.parse(s);
        const draftsOnly = (parsed.records || []).filter(r =>
            r.status === 'WAITING' || r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING'
        );
        DB = { ...parsed, records: draftsOnly };
        DB.records.forEach(r => { if (PRODUCTS[r.model]) r.modelLabel = PRODUCTS[r.model].label; });
        // เก็บ snapshot ไว้เผื่อ server offline ครั้งแรก
        window._dispensingOfflineCache = parsed;
    }
    // ล้าง localStorage records เก่าทิ้งทันที — ป้องกัน stale data
    // (fetchServerRecords จะเซฟใหม่ให้หลัง server ตอบกลับ)
    try {
        const cur = localStorage.getItem(LS_KEY);
        if (cur) {
            const p = JSON.parse(cur);
            p.records = (p.records || []).filter(r =>
                r.status === 'WAITING' || r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING'
            );
            localStorage.setItem(LS_KEY, JSON.stringify(p));
        }
    } catch (e2) { }
    const al = localStorage.getItem(ALERT_KEY) || localStorage.getItem('belton_alertlog_v10');
    if (al) ALERT_LOG = JSON.parse(al);
} catch (e) { }

function getBuyoffSpecs(model, param) {
    const buyoffKey = model;
    if (DB.configs[buyoffKey] && DB.configs[buyoffKey][param]) return DB.configs[buyoffKey][param];
    if (SPEC_BUYOFF[model] && SPEC_BUYOFF[model][param]) return SPEC_BUYOFF[model][param];
    return { lsl: null, lcl: null, cl: null, ucl: null, usl: null };
}

function getRovingSpecs(model, param) {
    const rovingKey = model + '_rov';
    if (DB.configs[rovingKey] && DB.configs[rovingKey][param]) return DB.configs[rovingKey][param];
    if (SPEC_ROVING[model] && SPEC_ROVING[model][param]) return SPEC_ROVING[model][param];
    return { lsl: null, lcl: null, cl: null, ucl: null, usl: null };
}

let isBackendOnline = false;
let isSyncing = false;

function saveDB() {
    // บันทึก WAITING + ร่างที่ยังกรอกไม่ครบ (DRAFT_INCOMPLETE/DRAFT_WAITING) ลง localStorage
    // 🔴 เดิมเก็บแค่ status WAITING ทำให้ข้อมูล Stage 1 ที่กรอกค้างไว้ (ยังไม่กด
    //    "นำเข้า About Data") หายไปทันทีที่ fetchServerRecords() auto-poll ทุก 60 วิ
    //    มาเขียนทับ DB.records ถ้า MySQL sync ไม่ทันหรือล้มเหลวชั่วคราว
    try {
        const toSave = {
            ...DB,
            records: DB.records.filter(r =>
                r.status === 'WAITING' || r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING'
            )
        };
        localStorage.setItem(LS_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.warn('LocalStorage saveDB error:', e);
    }
    // ไม่ auto-sync ทุกครั้งที่ save — sync เฉพาะตอนกด Manual Sync หรือ submit record
}
function saveAlertLog() {
    try {
        localStorage.setItem(ALERT_KEY, JSON.stringify(ALERT_LOG.slice(0, 200)));
    } catch (e) {
        console.warn('LocalStorage quota exceeded in saveAlertLog:', e);
    }
    // ไม่ auto-sync — Alert log บันทึก local เท่านั้น
}

// ─── MySQL: ส่ง record ใหม่ไปบันทึกผ่าน API ทันทีหลังกด Save ─────────────────
async function saveRecordToServer(payload) {
    try {
        const res = await fetch(`${API_BASE}/api/dispensing/record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) console.warn('[Dispensing] saveRecordToServer failed:', data.error);
        return data;
    } catch (err) {
        console.error('[Dispensing] saveRecordToServer error:', err);
        return { success: false };
    }
}

// ─── MySQL: ส่ง alert เข้า system_alert (auto-trigger เมื่อ NG/ALERT) ────────
// level: 'ng' | 'alert' | 'warn'
async function sendSystemAlert(level, msg, context = {}) {
    try {
        const res = await fetch(`${API_BASE}/api/dispensing/alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level, msg, ...context })
        });
        const data = await res.json();
        if (!data.success) console.warn('[Dispensing] sendSystemAlert failed:', data.error);
        return data;
    } catch (err) {
        console.error('[Dispensing] sendSystemAlert error:', err);
        return { success: false };
    }
}

async function checkBackendConnection() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${API_BASE}/api/health`, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            updateConnectionStatus(true);
        } else {
            updateConnectionStatus(false);
        }
    } catch (err) {
        updateConnectionStatus(false);
    }
}

function updateConnectionStatus(online) {
    const wasOnline = isBackendOnline;
    isBackendOnline = online;
    const ind = document.getElementById('sync-status-indicator');
    const text = document.getElementById('sync-status-text');
    const btn = document.getElementById('sync-btn');

    // ── แสดง/ซ่อน offline warning banner ───────────────────────────────────
    let banner = document.getElementById('offline-cache-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offline-cache-banner';
        banner.style.cssText = [
            'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
            'background:#1e293b', 'color:#f8fafc', 'font-size:12px', 'font-weight:600',
            'padding:8px 20px', 'border-radius:20px', 'z-index:99999',
            'box-shadow:0 4px 16px rgba(0,0,0,0.3)', 'display:none',
            'border:1px solid rgba(239,68,68,0.4)', 'letter-spacing:0.3px'
        ].join(';');
        banner.innerHTML = '⚠️ Offline — แสดงข้อมูล Cache อาจไม่ใช่ล่าสุด';
        document.body.appendChild(banner);
    }

    if (!ind || !text || !btn) return;

    if (online) {
        ind.style.backgroundColor = '#10b981';
        ind.style.boxShadow = '0 0 8px #10b981';
        text.textContent = 'Online (Synced)';
        text.style.color = '#10b981';
        btn.style.display = 'inline-block';
        banner.style.display = 'none';
        // ── server กลับมา online: ล้าง cache records เก่า รอ fetchServerRecords() ──
        if (!wasOnline && window._dispensingOfflineCache) {
            window._dispensingOfflineCache = null;
            // เก็บ WAITING + ร่างที่กรอกค้างไว้ (DRAFT_INCOMPLETE/DRAFT_WAITING) ที่เหลือรอ server ส่งมาใหม่
            DB.records = DB.records.filter(r =>
                r.status === 'WAITING' || r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING'
            );
            console.log('[Dispensing] Server กลับมา online → ล้าง cache เก่า รอ fetchServerRecords()');
        }
    } else {
        ind.style.backgroundColor = '#ef4444';
        ind.style.boxShadow = '0 0 8px #ef4444';
        text.textContent = 'Offline Mode';
        text.style.color = 'var(--text3)';
        btn.style.display = 'none';
        // ── server offline: โหลด cache ทั้งหมดมาแสดงชั่วคราว ──────────────────
        if (window._dispensingOfflineCache && window._dispensingOfflineCache.records) {
            const cacheRecords = window._dispensingOfflineCache.records || [];
            const drafts = DB.records.filter(r =>
                r.status === 'WAITING' || r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING'
            );
            const nonDraftCache = cacheRecords.filter(r =>
                r.status !== 'WAITING' && r.status !== 'DRAFT_INCOMPLETE' && r.status !== 'DRAFT_WAITING'
            );
            DB.records = [...drafts, ...nonDraftCache];
            DB.records.forEach(r => { if (PRODUCTS[r.model]) r.modelLabel = PRODUCTS[r.model].label; });
            renderAboutTable();
            updateDashboard();
            console.log('[Dispensing] Server offline → โหลด cache', nonDraftCache.length, 'records');
        }
        banner.style.display = 'block';
    }
}

async function syncWithServer(showNotice = false) {
    if (isSyncing || !isBackendOnline) return;
    isSyncing = true;

    if (showNotice) {
        showToast('🔄 กำลังซิงค์ข้อมูลกับฐานข้อมูลหลัก...', 'info', 2000);
    }

    try {
        const payload = {
            db_data: { records: DB.records },
            alert_log: ALERT_LOG
        };
        // Only send configs if they are populated (prevents overwriting with empty object)
        if (DB.configs && Object.keys(DB.configs).length > 0) {
            payload.db_data.configs = DB.configs;
        }

        const res = await fetch(`${API_BASE}/api/dispensing/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            if (showNotice) {
                showToast(`✅ ซิงค์สำเร็จ! ข้อมูลถูกบันทึกลง MySQL เรียบร้อยแล้ว`, 'success', 3000);
            }
            console.log('Sync completed:', data.message);
            await fetchServerRecords();
        } else {
            if (showNotice) {
                showToast('❌ การซิงค์ล้มเหลว (การตอบรับจากเซิร์ฟเวอร์ผิดปกติ)', 'error', 3000);
            }
        }
    } catch (err) {
        console.error('Sync error:', err);
        if (showNotice) {
            showToast('⚠️ เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว (บันทึกข้อมูลแบบออฟไลน์ไว้ในเครื่อง)', 'warn', 3000);
        }
        updateConnectionStatus(false);
    } finally {
        isSyncing = false;
    }
}

async function fetchServerRecords() {
    try {
        const res = await fetch(`${API_BASE}/api/dispensing/records`);
        if (!res.ok) {
            console.warn('fetchServerRecords failed:', res.status, res.statusText);
            return;
        }

        const data = await res.json();
        if (!data.success || !Array.isArray(data.records)) {
            console.warn('fetchServerRecords returned invalid payload:', data);
            return;
        }

        const drafts = DB.records.filter(r =>
            r.status === 'WAITING' || r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING'
        );
        const mappedRecords = data.records.map(r => {
            const values = r.values || {};
            if (PRODUCTS[r.model]) {
                PRODUCTS[r.model].dims.forEach(d => {
                    if (typeof d === 'object' && d.id) {
                        let sum = 0, count = 0;
                        for (let i = 1; i <= d.n; i++) {
                            const v = values[`${d.id}_${i}`];
                            if (v !== undefined && v !== '-' && v !== null && !isNaN(v)) {
                                sum += parseFloat(v);
                                count++;
                            }
                        }
                        if (count > 0) {
                            values[d.id] = parseFloat((sum / count).toFixed(4));
                        } else if (values[d.id] === undefined || values[d.id] === null) {
                            values[d.id] = null;
                        }
                    }
                });
            }
            return {
                id: r.id != null && !isNaN(Number(r.id)) ? Number(r.id) : r.id,
                dataType: r.dataType || 'Buy off',
                model: r.model,
                modelLabel: PRODUCTS[r.model] ? PRODUCTS[r.model].label : r.model,
                buytime: r.buytime || '00:00',
                pt: r.pt || values.pt_number || values.PT_NUMBER || (r.fixture ? String(r.fixture).split('_')[0] : 'Unknown'),
                fixture: r.fixture || 'Unknown',
                oven: values.oven || values.OVEN || r.oven || '—',
                mctime: r.mctime || '00:00',
                date: r.date || TODAY,
                team: r.team || 'A',
                operator: r.op || 'ADMIN',
                values,
                status: r.status || 'ACCEPT',
                createdAt: r.createdAt
            };
        });

        // ── Server is source of truth: ใช้ server data แทน cache ──────────────
        // เก็บ drafts ที่ยังไม่ถูก sync ไปยัง server (WAITING, DRAFT_INCOMPLETE, DRAFT_WAITING)
        // 🔴 เดิมเช็คเทียบกับ m.status === 'WAITING' เท่านั้น ทำให้ร่างที่ยังกรอกไม่ครบ
        //    (DRAFT_INCOMPLETE/DRAFT_WAITING) ถูกมองว่า "sync แล้ว" ผิดๆ แล้วถูกตัดทิ้ง
        const PENDING_STATUSES = ['WAITING', 'DRAFT_INCOMPLETE', 'DRAFT_WAITING'];
        const unSyncedDrafts = drafts.filter(d => {
            if (!String(d.id).startsWith('DRAFT_')) return false;
            return !mappedRecords.some(m =>
                PENDING_STATUSES.includes(m.status) &&
                m.model === d.model &&
                (m.fixture || '') === (d.fixture || '') &&
                m.date === d.date &&
                (m.buytime || '') === (d.buytime || '') &&
                m.dataType === d.dataType
            );
        });
        DB.records = [...unSyncedDrafts, ...mappedRecords];

        try {
            const [resAlerts, resCfg] = await Promise.all([
                fetch(`${API_BASE}/api/dispensing/alerts`),
                fetch(`${API_BASE}/api/dispensing/configs`)
            ]);

            if (resAlerts.ok) {
                const adata = await resAlerts.json();
                if (adata.success && Array.isArray(adata.alerts)) {
                    ALERT_LOG = adata.alerts.map(a => ({
                        id: a.id || (Date.now() + Math.random()),
                        ts: a.ts,
                        level: a.level,
                        model: a.model,
                        modelLabel: PRODUCTS[a.model] ? PRODUCTS[a.model].label : a.model,
                        fixture: a.fixture,
                        oven: a.oven,
                        param: a.param,
                        value: a.value,
                        specStr: a.specStr,
                        msg: a.msg
                    }));
                    localStorage.setItem(ALERT_KEY, JSON.stringify(ALERT_LOG.slice(0, 200)));
                }
            }

            if (resCfg.ok) {
                const cdata = await resCfg.json();
                if (cdata.success && cdata.configs) {
                    DB.configs = cdata.configs;
                }
            }
        } catch (e) { console.warn('fetchServerRecords alerts/configs error:', e); }

        syncDataConsistency(true);

        // อัปเดต offline cache (ใช้ตอน server offline เท่านั้น)
        window._dispensingOfflineCache = JSON.parse(JSON.stringify(DB));
        // บันทึก localStorage เฉพาะ drafts เท่านั้น
        try {
            const toSave = { ...DB, records: drafts };
            localStorage.setItem(LS_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('LocalStorage save error in fetchServerRecords:', e);
        }

        console.log('[Dispensing] fetchServerRecords → โหลด', mappedRecords.length, 'records จาก server (drafts:', drafts.length, ')');
        // auto-poll: ไม่ set _manualRenderAbout → renderAboutTable จะไม่แสดง full overlay
        _renderAboutTableCore();
        updateDashboard();
    } catch (err) {
        console.error('Error fetching clean records:', err);
    } finally {
        console.log('fetchServerRecords execution finished.');
    }
}

function triggerManualSync() {
    syncWithServer(true);
}
function norm(s) { return s ? s.toString().toLowerCase().replace(/[\s_\/\\\n\r]/g, '') : ''; }
function getDimId(d) { return typeof d === 'string' ? d : d.id; }
function isMulti(d) { return typeof d === 'object' && d.n; }
function valToDisplay(v) { return (v === null || v === undefined || v === '') ? '-' : (typeof v === 'number' ? v.toFixed(4) : v); }

function debounce(func, wait) { let timeout; return function (...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); }; }
const handleAutoSearch = debounce(renderAutoTable, 300); const handleAboutSearch = debounce(renderAboutTable, 300);

function getActiveSpec(model, param, dataType) {
    if (dataType && typeof dataType === 'string' && dataType.toLowerCase().includes('rov')) {
        return getRovingSpecs(model, param);
    }
    return getBuyoffSpecs(model, param);
}

function checkValAgainstSpec(val, cfg) {
    if (!cfg || typeof val !== 'number') return null;
    if (cfg.usl != null && cfg.usl !== '' && val > parseFloat(cfg.usl)) return 'critical';
    if (cfg.lsl != null && cfg.lsl !== '' && val < parseFloat(cfg.lsl)) return 'critical';
    if (cfg.ucl != null && cfg.ucl !== '' && val > parseFloat(cfg.ucl)) return 'warn';
    if (cfg.lcl != null && cfg.lcl !== '' && val < parseFloat(cfg.lcl)) return 'warn';
    return null;
}

function getInternalStatus(vals, mk, dataType) {
    if (!vals) return 'INCOMPLETE';

    // ไม่เช็ค INCOMPLETE จากการขาดหายของ Dimension บางตัวอีกต่อไป
    // เพราะในการทำงานจริง อาจจะวัดแค่บางค่า (เช่น วัดแค่ VMI, Coil Height)
    /*
    if (PRODUCTS[mk] && PRODUCTS[mk].dims) {
        const requiredDims = PRODUCTS[mk].dims.map(d => typeof d === 'string' ? d : d.id);
        const missing = requiredDims.filter(id => (vals[id] === undefined || vals[id] === null || vals[id] === '' || vals[id] === '-'));
        if (missing.length > 0) return 'INCOMPLETE';
    }
    */

    let status = 'ACCEPT';
    Object.entries(vals).forEach(([id, v]) => {
        if (v === undefined || v === null || v === '' || v === '-' || v === '—') return;

        // Handle explicit PASS/FAIL strings
        if (typeof v === 'string') {
            const upV = v.toUpperCase();
            if (upV === 'FAIL' || upV === 'NG' || upV === 'REJECT') {
                status = 'REJECT';
                return;
            }
            if (upV === 'PASS' || upV === 'OK' || upV === 'ACCEPT') {
                return; // pass is fine
            }
        }

        const numVal = parseFloat(v);
        if (isNaN(numVal)) return;

        const cfg = getActiveSpec(mk, id, dataType);
        if (cfg) {
            const level = checkValAgainstSpec(numVal, cfg);
            if (level === 'critical') status = 'REJECT';
            else if (level === 'warn' && status !== 'REJECT') status = 'ALERT';
        }
    });

    return status;
}

function syncDataConsistency(silent = false) {
    let changed = false;
    DB.records.forEach(r => {
        // WAITING, DRAFT_INCOMPLETE, and DRAFT_WAITING are manually-assigned statuses for pending Merge/Stage 2.
        // Do NOT let getInternalStatus() overwrite them — those records are intentionally
        // incomplete (no text-dim values yet) and must stay in their draft state until explicitly progressed.
        if (r.status === 'WAITING' || r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING') return;
        const correctStatus = getInternalStatus(r.values, r.model, r.dataType);
        if (r.status !== correctStatus) { r.status = correctStatus; changed = true; }
    });
    if (changed) saveDB();
    ALERT_LOG = []; let violationCount = 0;

    DB.records.forEach(rec => {
        if (!rec.values) return;
        let recTs = new Date().toISOString();
        if (rec.date) { try { recTs = new Date(`${rec.date}T${rec.buytime || '00:00'}:00`).toISOString(); } catch (e) { } }

        let missingParams = [];
        if (PRODUCTS[rec.model]) {
            PRODUCTS[rec.model].dims.forEach(d => {
                const param = getDimId(d); const val = rec.values[param];
                // if (val === undefined || val === null || val === '-' || val === '') missingParams.push(param);
            });
        }
        if (missingParams.length > 0) {
            ALERT_LOG.push({ id: Date.now() + Math.random(), ts: recTs, level: 'incomplete', model: rec.model, modelLabel: PRODUCTS[rec.model] ? PRODUCTS[rec.model].label : rec.model, fixture: rec.fixture, oven: rec.oven || '—', param: 'MISSING_DATA', value: '-', specStr: 'Required', msg: `❓ INCOMPLETE: ข้อมูลไม่ครบ ขาดการวัด (${missingParams.length} จุด)`, suppressed: false });
            violationCount++;
        }

        Object.entries(rec.values).forEach(([param, val]) => {
            if (typeof val !== 'number') return;
            if (PRODUCTS[rec.model] && !PRODUCTS[rec.model].dims.map(d => getDimId(d)).includes(param)) return;
            const cfg = getActiveSpec(rec.model, param, rec.dataType);
            const level = checkValAgainstSpec(val, cfg);
            if (level) {
                const isExtreme = level === 'critical';
                ALERT_LOG.push({ id: Date.now() + Math.random(), ts: recTs, level, model: rec.model, modelLabel: PRODUCTS[rec.model] ? PRODUCTS[rec.model].label : rec.model, fixture: rec.fixture, oven: rec.oven || '—', param, value: val, specStr: cfg ? `LSL:${cfg.lsl ?? '—'} LCL:${cfg.lcl ?? '—'} UCL:${cfg.ucl ?? '—'} USL:${cfg.usl ?? '—'}` : '—', msg: level === 'critical' ? `🔴 NG: ${param} = ${val.toFixed(4)} (เกิน Spec Limit)` : `🟡 ALERT: ${param} = ${val.toFixed(4)} (เกิน Control Limit)`, suppressed: !isExtreme });
                violationCount++;
            }
        });
    });

    ALERT_LOG.sort((a, b) => new Date(b.ts) - new Date(a.ts)); if (ALERT_LOG.length > 1000) ALERT_LOG = ALERT_LOG.slice(0, 1000); saveAlertLog();
    updateDashboard(); renderAutoTable(); renderAboutTable(); renderAlertLog(); updateNotifBadge();
    if (!silent) showToast(`🔄 ซิงค์ข้อมูลสำเร็จ: ตรวจพบ ${violationCount} จุดที่ผิดปกติ/ข้อมูลไม่ครบ`, 'success');
}

function parseTime(raw) {
    if (raw === undefined || raw === null || raw === '') return '';
    if (typeof raw === 'number') { const t = Math.round(raw * 1440), h = Math.floor(t / 60) % 24, m = t % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
    const s = raw.toString().trim(), m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    return s;
}

function parseDate(raw) {
    if (raw === undefined || raw === null || raw === '') return '';
    if (typeof raw === 'number') { const d = new Date((raw - 25569) * 86400 * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
    const s = raw.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmy) { let y = parseInt(dmy[3]); if (y < 100) y += 2000; return `${y}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`; }
    // รองรับ format "Mar 07'26" / "Ma r07'26" (space แทรกกลางชื่อเดือน) — collapse spaces แล้ว match
    const monAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const sc = s.replace(/\s+/g, ' ');
    // Mon DD'YY: "Mar 07'26" หรือ "Ma r07'26"
    const mda = sc.match(/^([A-Za-z ]{2,}?)\s*(\d{1,2})['''\u2019\u2018](\d{2,4})$/);
    if (mda) {
        const mi = monAbbr.indexOf(mda[1].toLowerCase().replace(/\s/g, '').slice(0, 3));
        if (mi !== -1) { let y = parseInt(mda[3]); if (y < 100) y += 2000; return `${y}-${String(mi + 1).padStart(2, '0')}-${String(parseInt(mda[2])).padStart(2, '0')}`; }
    }
    // DD Mon'YY: "07 Mar'26"
    const dma = sc.match(/^(\d{1,2})\s+([A-Za-z ]{2,})['''\u2019\s](\d{2,4})$/);
    if (dma) {
        const mi = monAbbr.indexOf(dma[2].toLowerCase().replace(/\s/g, '').slice(0, 3));
        if (mi !== -1) { let y = parseInt(dma[3]); if (y < 100) y += 2000; return `${y}-${String(mi + 1).padStart(2, '0')}-${String(parseInt(dma[1])).padStart(2, '0')}`; }
    }
    const dt = new Date(s); if (!isNaN(dt)) return dt.toISOString().split('T')[0];
    return s;
}

// toISO: แปลง r.date ทุก format ให้เป็น "YYYY-MM-DD" เพื่อเปรียบเทียบกับ window.startDate/endDate
function toISO(d) { return parseDate(d) || ''; }

function upsertSingleRecord(newRec) {
    // ── Priority 1: Match by unique ID (critical for bulk merge 1-to-1 correctness) ──
    // Without ID-first matching, merged records sharing the same fixture/date/buytime
    // would overwrite each other — leaving only 1 record in DB instead of 4 (the bug).
    if (newRec.id) {
        const idxById = DB.records.findIndex(r => r.id === newRec.id);
        if (idxById !== -1) { DB.records[idxById] = newRec; return true; }
    }

    // ── Priority 2: Composite-key match (legacy path for imported/non-merged records) ──
    // Merged records are always excluded here via _mergedAt flag, so they never collide.
    if (!newRec._mergedAt) {
        const newType = newRec.dataType || 'Buy off';
        const idx = DB.records.findIndex(r =>
            r.model === newRec.model &&
            r.fixture === newRec.fixture &&
            r.date === newRec.date &&
            (r.buytime || '') === (newRec.buytime || '') &&
            (r.mctime || '') === (newRec.mctime || '') &&
            (r.pt || '') === (newRec.pt || '') &&
            (r.dataType || 'Buy off') === newType
        );
        if (idx !== -1) { newRec.id = DB.records[idx].id; DB.records[idx] = newRec; return true; }
    }

    // ── New record: prepend to DB ──
    DB.records.unshift(newRec);
    return false;
}

function statusBadge(st) {
    const map = {
        ACCEPT: '✅ ACCEPT',
        ALERT: '⚠️ ALERT',
        REJECT: '❌ REJECT',
        WAITING: '⏳ WAITING',
        INCOMPLETE: '❓ INCOMPLETE'
    };
    const bg = {
        ACCEPT: 'rgba(39, 174, 96, 0.1)',
        ALERT: 'rgba(241, 196, 15, 0.1)',
        REJECT: 'rgba(231, 76, 60, 0.1)',
        WAITING: 'rgba(52, 152, 219, 0.1)',
        INCOMPLETE: 'rgba(155, 89, 182, 0.1)'
    };
    const col = {
        ACCEPT: '#27ae60',
        ALERT: '#d97706',
        REJECT: '#e74c3c',
        WAITING: '#2980b9',
        INCOMPLETE: '#8e44ad'
    };
    const border = {
        ACCEPT: 'rgba(39, 174, 96, 0.2)',
        ALERT: 'rgba(241, 196, 15, 0.2)',
        REJECT: 'rgba(231, 76, 60, 0.2)',
        WAITING: 'rgba(52, 152, 219, 0.2)',
        INCOMPLETE: 'rgba(155, 89, 182, 0.2)'
    };
    return `<span style="display:inline-flex; align-items:center; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; background:${bg[st] || 'var(--bg3)'}; color:${col[st] || 'var(--text3)'}; border:1px solid ${border[st] || 'var(--border2)'};">${map[st] || st || '—'}</span>`;
}

function typeBadge(type) {
    if (type === 'Buy off') {
        return `<span style="display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; background:rgba(39,174,96,0.1); color:#27ae60; border:1px solid rgba(39,174,96,0.2);"><span style="width:6px; height:6px; border-radius:50%; background:#27ae60; display:inline-block;"></span>Buy off</span>`;
    } else if (type === 'Roving Audit') {
        return `<span style="display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; background:rgba(9,132,227,0.1); color:#0984e3; border:1px solid rgba(9,132,227,0.2);"><span style="width:6px; height:6px; border-radius:50%; background:#0984e3; display:inline-block;"></span>Roving</span>`;
    }
    return `<span style="display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; background:rgba(39,174,96,0.1); color:#27ae60; border:1px solid rgba(39,174,96,0.2);"><span style="width:6px; height:6px; border-radius:50%; background:#27ae60; display:inline-block;"></span>Buy off</span>`;
}

function formatCustomDate(dateStr) {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const year = parts[0]; // 2026
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = String(parts[2]).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[monthIndex] || '—';
        return `${day}-${monthName}-${year}`;
    }
    return dateStr;
}

function mapHeaderToKey(rawH, mKey, colIndex = -1, allHeaders = [], dataType = 'Buy off') {
    if (!rawH) return null;
    const rawLower = rawH.toString().toLowerCase().trim();
    const cleanStr = (s) => s.replace(/[\s\-_/\\\.\(\)]/g, '').toLowerCase();
    const cleanedRaw = cleanStr(rawLower);

    const validDims = (mKey && PRODUCTS[mKey]) ? PRODUCTS[mKey].dims.map(d => typeof d === 'string' ? d : d.id) : [];

    const SMFLASH_KEYWORD_MAP = [
        // Coil outer/inner profile
        { keys: ['coil outer profile u', 'coilouterprofileu', 'coil_outer_profile_u', 'outer_u', 'outer u', 'coil outer u'], dim: 'Coil_outer_profile_u' },
        { keys: ['coil outer profile v', 'coilouterprofilev', 'coil_outer_profile_v', 'outer_v', 'outer v', 'coil outer v'], dim: 'Coil_outer_profile_v' },
        { keys: ['coil outer profile w', 'coilouterprofilew', 'coil_outer_profile_w', 'outer_w', 'outer w', 'coil outer w'], dim: 'Coil_outer_profile_w' },
        { keys: ['coil inner profile u-v', 'coil inner profile uv', 'inner uv', 'inner_uv', 'coil inner uv', 'inner profile u-v', 'inner profile uv'], dim: 'Coil_inner_profile_UV' },
        { keys: ['coil inner profile 1', 'coil_inner_profile_1', 'inner profile 1', 'inner_1', 'coil inner 1'], dim: 'Coil_inner_profile_1' },
        { keys: ['coil inner profile 2', 'coil_inner_profile_2', 'inner profile 2', 'inner_2', 'coil inner 2'], dim: 'Coil_inner_profile_2' },
        { keys: ['coil inner profile u', 'coil_inner_profile_u', 'inner_u', 'inner u', 'coil inner u'], dim: 'Coil_inner_profile_u' },
        { keys: ['coil inner profile v', 'coil_inner_profile_v', 'inner_v', 'inner v', 'coil inner v'], dim: 'Coil_inner_profile_v' },
        { keys: ['coil inner profile w', 'coil_inner_profile_w', 'inner_w', 'inner w', 'coil inner w'], dim: 'Coil_inner_profile_w' },
        // Coil position
        { keys: ['coil position 1 s', 'coil pos 1s', 'coilpos1s', 'position 1_s', 'coilpos1 s', 'coil pos1s', 'coilpos1(s)'], dim: 'Coil_position_1_S' },
        { keys: ['coil position 2 l', 'coil pos 2l', 'coilpos2l', 'position 2_l', 'coilpos2 l', 'coil pos2l', 'coilpos2(l)'], dim: 'Coil_position_2_L' },
        { keys: ['coil position 1', 'coil pos 1', 'coilpos1', 'position 1', 'coil pos1'], dim: 'Coil_position_1' },
        { keys: ['coil position 2', 'coil pos 2', 'coilpos2', 'position 2', 'coil pos2'], dim: 'Coil_position_2' },
        { keys: ['coil symmetry', 'coilsym', 'coil sym', 'sym'], dim: 'Coil_symmetry' },
        // Epoxy
        { keys: ['epoxy length 1 s', 'epoxy1s', 'epoxy 1s', 'epoxy_1_s', 'epoxy l 1 s', 'epoxy 1 s'], dim: 'Epoxy_length_1_S' },
        { keys: ['epoxy length 2 l', 'epoxy2l', 'epoxy 2l', 'epoxy_2_l', 'epoxy l 2 l', 'epoxy 2 l'], dim: 'Epoxy_length_2_L' },
        { keys: ['epoxy length 1 l', 'epoxy1l', 'epoxy_1_l', 'epoxy 1 l'], dim: 'Epoxy_length_1_L' },
        { keys: ['epoxy length 2 s', 'epoxy2s', 'epoxy_2_s', 'epoxy 2 s'], dim: 'Epoxy_length_2_S' },
        { keys: ['epoxy length 1', 'epoxy 1', 'epoxy1', 'epoxy_1', 'epoxy l 1', 'epoxy l1', 'epoxylength1'], dim: 'Epoxy_length_1' },
        { keys: ['epoxy length 2', 'epoxy 2', 'epoxy2', 'epoxy_2', 'epoxy l 2', 'epoxy l2', 'epoxylength2'], dim: 'Epoxy_length_2' },
        // Crash stop — CRASH_STOP_PROF patterns from Rosewood
        { keys: ['crash stop profile 1 l', 'cs1l', 'crash 1l', 'crashstop 1l', 'cs_1l', 'cs_1 l'], dim: 'Crash_stop_profile_1_L' },
        { keys: ['crash stop profile 2 s', 'cs2s', 'crash 2s', 'crashstop 2s', 'cs_2s', 'cs_2 s'], dim: 'Crash_stop_profile_2_S' },
        { keys: ['crash stop profile 1', 'crash_stop_prof_1', 'crashstopprof1', 'crash 1', 'cs1', 'cs_1', 'crashstop1', 'crashstop 1'], dim: 'Crash_stop_profile_1' },
        { keys: ['crash stop profile 2', 'crash_stop_prof_2', 'crashstopprof2', 'crash 2', 'cs2', 'cs_2', 'crashstop2', 'crashstop 2'], dim: 'Crash_stop_profile_2' },
        { keys: ['crash stop profile 3', 'crash_stop_prof_3', 'crashstopprof3', 'crash 3', 'cs3', 'cs_3', 'crashstop3', 'crashstop 3'], dim: 'Crash_stop_profile_3' },
        // Bobbin
        { keys: ['bobbin position 1', 'bobbin pos 1', 'bobbinpos1', 'bobbin pos1'], dim: 'Bobbin_position_1' },
        { keys: ['bobbin position 2', 'bobbin pos 2', 'bobbinpos2', 'bobbin pos2'], dim: 'Bobbin_position_2' },
        { keys: ['bobbin hole true', 'bobbin hole', 'hole true'], dim: 'Bobbin_hole_true' },
        { keys: ['bobbin slote true', 'bobbin slot true', 'slote true', 'slot true'], dim: 'Bobbin_slote_true' },
        // Bobbin recess NTDM typo (missing D) → NDTM
        { keys: ['bobbin recess ntdm', 'bobbin recess ndtm', 'bobbin_recess_ntdm', 'bobbin_recess_ndtm'], dim: 'Bobbin_recess_NDTM_1' },
        // Fantail
        { keys: ['fantail profile 1', 'fantail 1', 'fantail1'], dim: 'Fantail_profile_1' },
        { keys: ['fantail profile 2', 'fantail 2', 'fantail2'], dim: 'Fantail_profile_2' },
        { keys: ['fantail profile 3', 'fantail 3', 'fantail3'], dim: 'Fantail_profile_3' },
        { keys: ['fantail profile 4', 'fantail 4', 'fantail4'], dim: 'Fantail_profile_4' },
        { keys: ['fantail profile 5', 'fantail 5', 'fantail5'], dim: 'Fantail_profile_5' },
    ];

    const SMFLASH_SKIP_MULTI = ['Coil_parallel', 'Bobbin_parallel', 'Coil_recess_DTM', 'Coil_recess_NDTM', 'Bobbin_recess_DTM', 'Bobbin_recess_NDTM'];

    // Strip all non-alphanumeric for occurrence-based matching
    let h = rawH.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

    // Calculate appearanceCount (how many times same header appeared before this col)
    let appearanceCount = 0;
    if (colIndex > 0 && allHeaders && allHeaders.length > 0) {
        for (let i = 0; i < colIndex; i++) {
            if (allHeaders[i] && cleanStr(allHeaders[i]) === cleanedRaw) {
                appearanceCount++;
            }
        }
    }

    // A. Model-specific overrides

    // A. Model-specific and DataType-specific Strict Overrides
    // -----------------------------------------------------------

    // Exact match check first
    for (let dim of validDims) {
        if (cleanStr(dim) === cleanedRaw) return dim;
    }

    if (dataType === 'Roving Audit') {
        // [FIX] Roving Audit parser: แยก parser อย่างชัดเจน สำหรับ Roving
        if (mKey === 'rosewood2d') {
            if (h.includes('inner1') || h === '1') return validDims.includes('Coil_inner_profile_1') ? 'Coil_inner_profile_1' : null;
            if (h.includes('inner2') || h === '2') return validDims.includes('Coil_inner_profile_2') ? 'Coil_inner_profile_2' : null;
            if (h.includes('inneruv') || h === 'uv') return validDims.includes('Coil_inner_profile_UV') ? 'Coil_inner_profile_UV' : null;
        }
        if (mKey && mKey.startsWith('skybolt')) {
            if (h === 'x1') return validDims.includes('X1') ? 'X1' : null;
            if (h === 'y1') return validDims.includes('Y1') ? 'Y1' : null;
            if (h === 'x2') return validDims.includes('X2') ? 'X2' : null;
            if (h === 'y2') return validDims.includes('Y2') ? 'Y2' : null;
            if (h === 'pos1' || h === 'coilpos1') return validDims.includes('Coil_position_1') ? 'Coil_position_1' : null;
            if (h === 'pos2' || h === 'coilpos2') return validDims.includes('Coil_position_2') ? 'Coil_position_2' : null;
        }
    }

    // 1. comet — X1/Y1/X2/Y2 by occurrence; Epoxy Recess DTM/NDTM; Coil Sym
    if (mKey === 'comet') {
        if (h.includes('coilsym') || (h.includes('coil') && h.includes('sym'))) return null;
        if (h.includes('biaspin')) return null;
        if ((h.includes('coilpos') || (h.includes('pos') && !h.includes('prof'))) && h.includes('1')) return 'Coil_position_1';
        if ((h.includes('coilpos') || (h.includes('pos') && !h.includes('prof'))) && h.includes('2')) return 'Coil_position_2';
        if (h.includes('epoxy') && !h.includes('recess') && h.includes('1')) return 'Epoxy_length_1';
        if (h.includes('epoxy') && !h.includes('recess') && h.includes('2')) return 'Epoxy_length_2';
        if (h.includes('epoxy') && h.includes('recess')) {
            if (h.includes('ndtm') || h.includes('ntdm')) return validDims.includes(`Coil_recess_NDTM_${appearanceCount + 1}`) ? `Coil_recess_NDTM_${appearanceCount + 1}` : (validDims.includes('Coil_recess_NDTM_1') ? 'Coil_recess_NDTM_1' : null);
            if (h.includes('dtm')) return validDims.includes(`Coil_recess_DTM_${appearanceCount + 1}`) ? `Coil_recess_DTM_${appearanceCount + 1}` : (validDims.includes('Coil_recess_DTM_1') ? 'Coil_recess_DTM_1' : null);
        }
        if (h.includes('cs') || h.includes('crash') || h.includes('stop')) return h.includes('2') ? 'Crash_stop_profile_2' : 'Crash_stop_profile_1';
        if (h === 'x1' || h === 'x') return appearanceCount === 0 ? (validDims.includes('X1') ? 'X1' : null) : (appearanceCount === 1 ? (validDims.includes('X2') ? 'X2' : null) : null);
        if (h === 'y1' || h === 'y') return appearanceCount === 0 ? (validDims.includes('Y1') ? 'Y1' : null) : (appearanceCount === 1 ? (validDims.includes('Y2') ? 'Y2' : null) : null);
    }

    // 2. dorado5d, dorado10d, marlin10d, v112d, v114d, v15cmr4d
    // Use rawH parentheses (S)/(L) instead of h.includes('l') — 'coil' itself contains 'l'!
    if (['dorado5d', 'dorado10d', 'marlin10d', 'v112d', 'v114d', 'v15cmr4d'].includes(mKey)) {
        const rawNorm = rawH.toString().toLowerCase();
        // "Coil X1 (S)" / "Coil Y1 (S)" → X1 / Y1
        if (rawNorm.includes('coil') && rawNorm.includes('x') && rawNorm.includes('(s)')) return validDims.includes('X1') ? 'X1' : null;
        if (rawNorm.includes('coil') && rawNorm.includes('y') && rawNorm.includes('(s)')) return validDims.includes('Y1') ? 'Y1' : null;
        // "Coil X2 (L)" / "Coil Y2 (L)" → X2 / Y2
        if (rawNorm.includes('coil') && rawNorm.includes('x') && rawNorm.includes('(l)')) return validDims.includes('X2') ? 'X2' : null;
        if (rawNorm.includes('coil') && rawNorm.includes('y') && rawNorm.includes('(l)')) return validDims.includes('Y2') ? 'Y2' : null;
        // Without parentheses: "Coil X1" / "Coil X2"
        if (rawNorm.includes('coil') && /coil[\s_]*x[\s_]*1/.test(rawNorm) && !rawNorm.includes('x2') && !rawNorm.includes('(l)')) return validDims.includes('X1') ? 'X1' : null;
        if (rawNorm.includes('coil') && /coil[\s_]*y[\s_]*1/.test(rawNorm) && !rawNorm.includes('y2') && !rawNorm.includes('(l)')) return validDims.includes('Y1') ? 'Y1' : null;
        if (rawNorm.includes('coil') && /coil[\s_]*x[\s_]*2/.test(rawNorm)) return validDims.includes('X2') ? 'X2' : null;
        if (rawNorm.includes('coil') && /coil[\s_]*y[\s_]*2/.test(rawNorm)) return validDims.includes('Y2') ? 'Y2' : null;
        // X1 Center
        if ((h.includes('x1') && h.includes('center')) || h.includes('x1center')) return validDims.includes('X1_Center') ? 'X1_Center' : null;

        // Custom override for V11 Series: map "epoxy 1" to "Epoxy_length_1_S", "epoxy 2" to "Epoxy_length_2_L"
        if (mKey === 'v112d' || mKey === 'v114d') {
            if (h.includes('coilpos') && h.includes('1')) return validDims.includes('Coil_position_1') ? 'Coil_position_1' : null;
            if (h.includes('coilpos') && h.includes('2')) return validDims.includes('Coil_position_2') ? 'Coil_position_2' : null;
            if (h.includes('epoxy') && h.includes('1')) return validDims.includes('Epoxy_length_1_S') ? 'Epoxy_length_1_S' : null;
            if (h.includes('epoxy') && h.includes('2')) return validDims.includes('Epoxy_length_2_L') ? 'Epoxy_length_2_L' : null;
        }
    }

    // 2.5. V11 1D mapping
    if (mKey === 'v111d') {
        if (h.includes('coilpos') && h.includes('1')) return validDims.includes('Coil_position_1') ? 'Coil_position_1' : null;
        if (h.includes('coilpos') && h.includes('2')) return validDims.includes('Coil_position_2') ? 'Coil_position_2' : null;
        if (h.includes('epoxy') && h.includes('1')) return validDims.includes('Epoxy_length_1') ? 'Epoxy_length_1' : null;
        if (h.includes('epoxy') && h.includes('2')) return validDims.includes('Epoxy_length_2') ? 'Epoxy_length_2' : null;
    }

    // 3. summit10d — "Coil X1" (1st) → X3, (2nd) → X4; bare "X" / "X1" → X1/X2 by occurrence
    if (mKey === 'summit10d') {
        if (h === 'coilx1' || (h.includes('coilx') && h.includes('1') && !h.includes('2'))) {
            if (appearanceCount === 0 && validDims.includes('X3')) return 'X3';
            if (appearanceCount === 1 && validDims.includes('X4')) return 'X4';
        }
        if (h === 'coily1' || (h.includes('coily') && h.includes('1') && !h.includes('2'))) {
            if (appearanceCount === 0 && validDims.includes('Y3')) return 'Y3';
            if (appearanceCount === 1 && validDims.includes('Y4')) return 'Y4';
        }
    }

    // 4. skybolt
    if (mKey && mKey.startsWith('skybolt')) {
        if (h.includes('biaspin')) return null;
    }

    // 5. General occurrence-based X/Y mapping
    if (h === 'x1' || h === 'x') {
        if (appearanceCount === 0 && validDims.includes('X1')) return 'X1';
        if (appearanceCount === 1 && validDims.includes('X2')) return 'X2';
        if (appearanceCount === 2 && validDims.includes('X3')) return 'X3';
        if (appearanceCount === 3 && validDims.includes('X4')) return 'X4';
    }
    if (h === 'y1' || h === 'y') {
        if (appearanceCount === 0 && validDims.includes('Y1')) return 'Y1';
        if (appearanceCount === 1 && validDims.includes('Y2')) return 'Y2';
        if (appearanceCount === 2 && validDims.includes('Y3')) return 'Y3';
        if (appearanceCount === 3 && validDims.includes('Y4')) return 'Y4';
    }
    if (h === 'x2' && validDims.includes('X2')) return 'X2';
    if (h === 'y2' && validDims.includes('Y2')) return 'Y2';
    if (h === 'x3' && validDims.includes('X3')) return 'X3';
    if (h === 'y3' && validDims.includes('Y3')) return 'Y3';
    if (h === 'x4' && validDims.includes('X4')) return 'X4';
    if (h === 'y4' && validDims.includes('Y4')) return 'Y4';

    // B. SMFLASH_KEYWORD_MAP
    for (const entry of SMFLASH_KEYWORD_MAP) {
        if (!validDims.includes(entry.dim)) continue;
        for (const k of entry.keys) {
            const cleanedK = cleanStr(k);
            if (cleanedRaw === cleanedK || cleanedRaw.includes(cleanedK) || cleanedK.includes(cleanedRaw)) {
                return entry.dim;
            }
        }
    }

    // C. SMFLASH_SKIP_MULTI
    for (const skipMulti of SMFLASH_SKIP_MULTI) {
        const cleanMulti = cleanStr(skipMulti);
        if (cleanedRaw.includes(cleanMulti)) {
            const indexMatch = cleanedRaw.match(/\d+$/);
            const idx = indexMatch ? indexMatch[0] : (appearanceCount + 1);
            const candidate = `${skipMulti}_${idx}`;
            if (validDims.includes(candidate)) return candidate;
        }
    }

    // D. Generic fallback
    const matched = validDims.find(d => {
        return cleanStr(d) === cleanedRaw || cleanedRaw.includes(cleanStr(d)) || cleanStr(d).includes(cleanedRaw);
    });
    if (matched) return matched;

    return rawH;
}

function processFile(inp) {
    const files = Array.from(inp.files || []); if (!files.length) return;
    _importQueue = files; _importProcessing = false; tempImport = [];
    _processNextFile();
    inp.value = '';
}

function _processNextFile() {
    if (_importQueue.length === 0) {
        _importProcessing = false;
        renderImportPreview();
        return;
    }
    const file = _importQueue.shift();
    _importProcessing = true;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array', cellDates: false, cellFormula: false });
            const fn = file.name.toLowerCase();
            const isExcel = fn.endsWith('.xlsx') || fn.endsWith('.xlsm') || fn.endsWith('.xls');
            if (isExcel) {
                const inputDataSheet = wb.SheetNames.find(n => n.toLowerCase().replace(/\s/g, '') === 'inputdata');
                if (inputDataSheet) { _parseInputDataSheetMulti(wb, inputDataSheet, file.name); }
                else { _parseFirstSheetMulti(wb, file.name); }
            } else {
                _parseFirstSheetMulti(wb, file.name);
            }
        } catch (err) { showToast(`❌ ไม่สามารถอ่านไฟล์ ${file.name}: ${err.message}`, 'error', 6000); }
        _processNextFile();
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// FEATURE 2: Import SM Flash .txt / raw text
// สำหรับ non-parallel, non-DTM, non-NDTM dims
// เช่น Coil_outer_profile, Epoxy_length, Crash_stop_profile, Coil_position, etc.
// ==========================================

// รายชื่อ dim ที่เป็น "multi-point" (parallel/DTM/NDTM) → ไม่ดึงจาก SM Flash
const SMFLASH_SKIP_MULTI = ['Coil_parallel', 'Bobbin_parallel', 'Coil_recess_DTM', 'Coil_recess_NDTM', 'Bobbin_recess_DTM', 'Bobbin_recess_NDTM'];

// Keyword mapping สำหรับ SM Flash: pattern ที่อาจปรากฏในไฟล์ txt/flash output
const SMFLASH_KEYWORD_MAP = [
    // ลำดับความสำคัญ: ยิ่ง specific ยิ่งควรมาก่อน
    { keys: ['coil outer profile u', 'outer_u', 'outer u', 'coil outer u'], dim: 'Coil_outer_profile_u' },
    { keys: ['coil outer profile v', 'outer_v', 'outer v', 'coil outer v'], dim: 'Coil_outer_profile_v' },
    { keys: ['coil outer profile w', 'outer_w', 'outer w', 'coil outer w'], dim: 'Coil_outer_profile_w' },
    { keys: ['coil inner profile 1', 'inner profile 1', 'inner_1', 'coil inner 1'], dim: 'Coil_inner_profile_1' },
    { keys: ['coil inner profile 2', 'inner profile 2', 'inner_2', 'coil inner 2'], dim: 'Coil_inner_profile_2' },
    { keys: ['coil inner profile uv', 'inner uv', 'inner_uv', 'coil inner uv'], dim: 'Coil_inner_profile_UV' },
    { keys: ['coil inner profile u', 'inner_u', 'inner u', 'coil inner u'], dim: 'Coil_inner_profile_u' },
    { keys: ['coil inner profile v', 'inner_v', 'inner v', 'coil inner v'], dim: 'Coil_inner_profile_v' },
    { keys: ['coil inner profile w', 'inner_w', 'inner w', 'coil inner w'], dim: 'Coil_inner_profile_w' },
    { keys: ['coil position 1 s', 'coil pos 1s', 'coilpos1s', 'position 1_s', 'coilpos1 s'], dim: 'Coil_position_1_S' },
    { keys: ['coil position 2 l', 'coil pos 2l', 'coilpos2l', 'position 2_l', 'coilpos2 l'], dim: 'Coil_position_2_L' },
    { keys: ['coil position 1', 'coil pos 1', 'coilpos1', 'position 1'], dim: 'Coil_position_1' },
    { keys: ['coil position 2', 'coil pos 2', 'coilpos2', 'position 2'], dim: 'Coil_position_2' },
    { keys: ['coil symmetry', 'coilsym', 'sym'], dim: 'Coil_symmetry' },
    { keys: ['epoxy length 1 s', 'epoxy1s', 'epoxy 1s', 'epoxy_1_s', 'epoxy l 1 s'], dim: 'Epoxy_length_1_S' },
    { keys: ['epoxy length 2 l', 'epoxy2l', 'epoxy 2l', 'epoxy_2_l', 'epoxy l 2 l'], dim: 'Epoxy_length_2_L' },
    { keys: ['epoxy length 1 l', 'epoxy1l', 'epoxy_1_l'], dim: 'Epoxy_length_1_L' },
    { keys: ['epoxy length 2 s', 'epoxy2s', 'epoxy_2_s'], dim: 'Epoxy_length_2_S' },
    { keys: ['epoxy length 1', 'epoxy 1', 'epoxy1', 'epoxy_1', 'epoxy l 1'], dim: 'Epoxy_length_1' },
    { keys: ['epoxy length 2', 'epoxy 2', 'epoxy2', 'epoxy_2', 'epoxy l 2'], dim: 'Epoxy_length_2' },
    { keys: ['crash stop profile 1 l', 'cs1l', 'crash 1l', 'crashstop 1l'], dim: 'Crash_stop_profile_1_L' },
    { keys: ['crash stop profile 2 s', 'cs2s', 'crash 2s', 'crashstop 2s'], dim: 'Crash_stop_profile_2_S' },
    { keys: ['crash stop profile 1', 'crash 1', 'cs1', 'crashstop1', 'crashstop 1'], dim: 'Crash_stop_profile_1' },
    { keys: ['crash stop profile 2', 'crash 2', 'cs2', 'crashstop2', 'crashstop 2'], dim: 'Crash_stop_profile_2' },
    { keys: ['crash stop profile 3', 'crash 3', 'cs3', 'crashstop3', 'crashstop 3'], dim: 'Crash_stop_profile_3' },
    { keys: ['bobbin position 1', 'bobbin pos 1', 'bobbinpos1'], dim: 'Bobbin_position_1' },
    { keys: ['bobbin position 2', 'bobbin pos 2', 'bobbinpos2'], dim: 'Bobbin_position_2' },
    { keys: ['bobbin hole true', 'bobbin hole', 'hole true'], dim: 'Bobbin_hole_true' },
    { keys: ['bobbin slote true', 'bobbin slot true', 'slote true', 'slot true'], dim: 'Bobbin_slote_true' },
    { keys: ['fantail profile 1', 'fantail 1', 'fantail1'], dim: 'Fantail_profile_1' },
    { keys: ['fantail profile 2', 'fantail 2', 'fantail2'], dim: 'Fantail_profile_2' },
    { keys: ['fantail profile 3', 'fantail 3', 'fantail3'], dim: 'Fantail_profile_3' },
    { keys: ['fantail profile 4', 'fantail 4', 'fantail4'], dim: 'Fantail_profile_4' },
    { keys: ['fantail profile 5', 'fantail 5', 'fantail5'], dim: 'Fantail_profile_5' },
];

/**
 * แปลง SM Flash text เป็น object { dimKey: value }
 * รองรับ 2 รูปแบบหลัก:
 *   แบบ 1 (column-pair):  "Coil outer profile U   0.9570"
 *   แบบ 2 (key=value):    "Coil_outer_profile_u=0.9570"
 *   แบบ 3 (tab/space):    "Coil_outer_profile_u\t0.9570"
 *
 * @param {string} rawText - เนื้อหาไฟล์ .txt หรือ paste text
 * @param {string} modelKey - รหัส model เพื่อ filter เฉพาะ dim ที่มีใน product นั้น
 * @returns {{ values: Object, unmapped: string[], rawLines: string[] }}
 */
function parseSMFlashText(rawText, modelKey) {
    const validDims = (modelKey && PRODUCTS[modelKey])
        ? PRODUCTS[modelKey].dims.map(d => getDimId(d)).filter(id => !SMFLASH_SKIP_MULTI.includes(id))
        : [];

    const values = {};
    const unmapped = [];
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // normalize helper: lowercase + remove special chars except digits and dot/minus
    const normKey = s => s.toLowerCase().replace(/[_\-\/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
    const extractNum = s => {
        const m = s.match(/-?[\d]+\.[\d]+|-?[\d]+/);
        return m ? parseFloat(m[0]) : null;
    };

    lines.forEach(line => {
        // ข้ามบรรทัดที่เป็น header/spec/label
        if (/^(usl|lsl|ucl|lcl|cl|target|spec|limit|parameter|param|no\.|#)/i.test(line)) return;

        let matched = false;

        // --- รูปแบบ key=value ---
        const eqMatch = line.match(/^([^=]+)=\s*(.+)$/);
        if (eqMatch) {
            const rawK = normKey(eqMatch[1]);
            const rawV = eqMatch[2].trim();
            const num = extractNum(rawV);
            if (num !== null) {
                for (const entry of SMFLASH_KEYWORD_MAP) {
                    if (!validDims.includes(entry.dim)) continue;
                    if (entry.keys.some(k => normKey(k) === rawK || rawK.includes(normKey(k)))) {
                        values[entry.dim] = num;
                        matched = true;
                        break;
                    }
                }
                if (!matched) unmapped.push(line);
                return;
            }
        }

        // --- รูปแบบ tab / whitespace separated: "Label  Value" ---
        // ตัวเลขน่าจะอยู่ที่ท้ายบรรทัด
        const parts = line.split(/\t+|\s{2,}/); // split by tab or 2+ spaces
        if (parts.length >= 2) {
            const lastPart = parts[parts.length - 1].trim();
            const num = extractNum(lastPart);
            if (num !== null && !isNaN(num)) {
                const labelPart = parts.slice(0, parts.length - 1).join(' ');
                const normLabel = normKey(labelPart);
                for (const entry of SMFLASH_KEYWORD_MAP) {
                    if (!validDims.includes(entry.dim)) continue;
                    if (entry.keys.some(k => normKey(k) === normLabel || normLabel.includes(normKey(k)))) {
                        values[entry.dim] = num;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    // fallback: ลองใช้ mapHeaderToKey ที่มีอยู่แล้ว
                    const sysId = mapHeaderToKey(labelPart, modelKey);
                    if (sysId && validDims.includes(sysId) && !SMFLASH_SKIP_MULTI.includes(sysId)) {
                        values[sysId] = num;
                        matched = true;
                    }
                }
                if (!matched) unmapped.push(line);
                return;
            }
        }

        // --- รูปแบบเดียว (แค่ตัวเลข): ใช้ตำแหน่งลำดับ (positional) ---
        const singleNum = extractNum(line);
        if (singleNum !== null && line.replace(/[-.\d\s]/g, '').length === 0) {
            // บรรทัดที่มีแต่ตัวเลข → เก็บไว้ใน unmapped เพื่อแจ้งผู้ใช้
            unmapped.push(line);
        }
    });

    return { values, unmapped, rawLines: lines };
}

/**
 * เปิด Modal สำหรับ Paste / Upload SM Flash text
 */
function openSMFlashModal() {
    const mk = document.getElementById('m-model').value;
    if (!mk) { showToast('กรุณาเลือก Product ก่อน', 'warn'); return; }
    document.getElementById('smflash-modal').classList.add('open');
    document.getElementById('smflash-textarea').value = '';
    document.getElementById('smflash-result').innerHTML = '';
    document.getElementById('smflash-model-display').textContent = PRODUCTS[mk]?.label || mk;
}

function closeSMFlashModal() {
    document.getElementById('smflash-modal').classList.remove('open');
}

function parseSMFlashFromTextarea() {
    const mk = document.getElementById('m-model').value;
    if (!mk) { showToast('กรุณาเลือก Product ก่อน', 'warn'); return; }

    const raw = document.getElementById('smflash-textarea').value.trim();
    if (!raw) { showToast('กรุณาวางข้อมูล SM Flash ก่อน', 'warn'); return; }

    const { values, unmapped } = parseSMFlashText(raw, mk);
    const matchedCount = Object.keys(values).length;

    if (matchedCount === 0) {
        document.getElementById('smflash-apply-btn').style.display = 'none';
        document.getElementById('smflash-result').innerHTML =
            `<div style="color:var(--fail);font-size:13px;padding:10px;background:var(--fail-bg);border-radius:6px">
        ❌ ไม่พบข้อมูลที่ match ได้เลย — กรุณาตรวจสอบ format ของไฟล์/text<br>
        <small style="color:var(--text3)">(ตรวจสอบว่า label ชัดเจนหรือไม่ เช่น "Coil outer profile U  0.9570")</small>
      </div>`;
        return;
    }

    // แสดงผล preview
    const validDims = PRODUCTS[mk].dims.map(d => getDimId(d)).filter(id => !SMFLASH_SKIP_MULTI.includes(id));
    let previewHtml = `<div style="font-size:12px;font-weight:700;color:var(--pass);margin-bottom:8px">✅ Match ได้ ${matchedCount} จาก ${validDims.length} parameter${unmapped.length > 0 ? ` · ⚠️ ${unmapped.length} บรรทัดไม่ match` : ''}</div>`;
    previewHtml += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;margin-bottom:10px">`;
    Object.entries(values).forEach(([k, v]) => {
        const cfg = (DB.configs[mk] && DB.configs[mk][k]) || {};
        const status = checkValAgainstSpec(v, cfg);
        const color = status === 'critical' ? 'var(--fail)' : status === 'warn' ? 'var(--warn)' : 'var(--pass)';
        previewHtml += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:6px 8px">
      <div style="font-size:10px;color:var(--text3)">${k.replace(/_/g, ' ')}</div>
      <div style="font-weight:700;color:${color};font-size:13px">${v.toFixed(4)}</div>
    </div>`;
    });
    previewHtml += `</div>`;

    if (unmapped.length > 0) {
        previewHtml += `<details style="font-size:11px;color:var(--text3)"><summary style="cursor:pointer">⚠️ บรรทัดที่ไม่ match (${unmapped.length} บรรทัด)</summary><pre style="margin-top:6px;padding:6px;background:var(--bg4);border-radius:4px;white-space:pre-wrap">${unmapped.slice(0, 20).join('\n')}</pre></details>`;
    }

    document.getElementById('smflash-result').innerHTML = previewHtml;
    document.getElementById('smflash-apply-btn').style.display = matchedCount > 0 ? '' : 'none';

    // บันทึก parsed values ไว้ใน window สำหรับ apply
    window._smflashParsed = { mk, values };
}

function applySMFlashValues() {
    if (!window._smflashParsed) { showToast('กด "อ่านค่า" ก่อน', 'warn'); return; }
    const { mk, values } = window._smflashParsed;

    if (mk !== document.getElementById('m-model').value) {
        showToast('Product เปลี่ยนไปแล้ว กรุณาอ่านค่าใหม่', 'warn');
        return;
    }

    // กรอกค่าลงใน input fields ของ Manual Form
    let applied = 0;
    Object.entries(values).forEach(([dimId, val]) => {
        const inp = document.getElementById(`val-${dimId}`);
        if (inp) {
            inp.value = val;
            evalDim(dimId, mk);
            applied++;
        }
    });

    closeSMFlashModal();
    showToast(`✅ กรอกค่าจาก SM Flash สำเร็จ ${applied} parameter — ตรวจสอบและกด Enter หรือ บันทึก`, 'success');
    window._smflashParsed = null;
}

function handleSMFlashFileUpload(inp) {
    const file = inp.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('smflash-textarea').value = e.target.result;
        parseSMFlashFromTextarea();
    };
    reader.readAsText(file, 'utf-8');
    inp.value = '';
}

function _detectModel(fn, json = []) {
    let mLabel = null;
    // Scan up to 20 rows in the JSON to find the model name
    for (let i = 0; i < Math.min(20, json.length); i++) {
        const row = json[i];
        if (!Array.isArray(row)) continue;
        for (let j = 0; j < row.length; j++) {
            const val = String(row[j] || '').trim().toLowerCase();
            if (val.includes('model')) {
                const inline = String(row[j]).match(/model\s*:?\s*(.+)/i);
                if (inline && inline[1] && !/^:+$/.test(inline[1])) mLabel = inline[1].trim();
                else mLabel = String(row[j + 2] || '').trim() || String(row[j + 1] || '').trim();
                if (mLabel) break;
            }
        }
        if (mLabel) break;
    }

    if (mLabel) {
        const mlLower = mLabel.toLowerCase().replace(/[\s_\-]/g, '');
        for (let key in PRODUCTS) {
            if (PRODUCTS[key].label.toLowerCase().replace(/[\s_\-]/g, '') === mlLower || key === mlLower) {
                return key;
            }
        }
        fn = fn + ' ' + mLabel; // Append the extracted model name to fn to use the existing fallback logic
    }

    fn = fn.toLowerCase();
    if (fn.includes('marlin') && fn.includes('10d')) return 'marlin10d';
    if (fn.includes('rosewood') && fn.includes('1d')) return 'rosewood1d';
    if (fn.includes('rosewood') && fn.includes('2d')) return 'rosewood2d';
    if (fn.includes('skybolt') && fn.includes('1d')) return 'skybolt1d';
    if (fn.includes('skybolt') && fn.includes('2d')) return 'skybolt2d';
    if (fn.includes('skybolt') && fn.includes('3d')) return 'skybolt3d';
    if (fn.includes('skybolt') && fn.includes('4d')) return 'skybolt4d';
    if (fn.includes('summit') && fn.includes('10d')) return 'summit10d';
    if (fn.includes('dorado') && fn.includes('10d')) return 'dorado10d';
    if (fn.includes('dorado')) return 'dorado5d';
    if (fn.includes('v11') && fn.includes('1d')) return 'v111d';
    if (fn.includes('v11') && fn.includes('2d')) return 'v112d';
    if (fn.includes('v11') && fn.includes('4d')) return 'v114d';
    if (fn.includes('v15') && fn.includes('cmr') && fn.includes('4d')) return 'v15cmr4d';
    if (fn.includes('cmr') && fn.includes('4d')) return 'cmr4d';
    if (fn.includes('cmr') && fn.includes('5d')) return 'cmr5d';
    if (fn.includes('4d')) return 'cmr4d';
    if (fn.includes('5d')) return 'cmr5d';
    if (fn.includes('m11')) return 'm11';
    if (fn.includes('comet')) return 'comet';
    return 'cmr3d';
}

function _parseRecordsFromSheet(json, fileName, dModel, detectedDataType) {
    let hIdx = json.findIndex(row => row.some(c => norm(c) === 'no' || norm(c) === 'no.')); if (hIdx === -1) hIdx = json.findIndex(row => row.some(c => norm(c).includes('fixture'))); if (hIdx === -1) hIdx = 0;
    const rawHdrs = json[hIdx].map(h => h ? h.toString().trim() : ''); const findCol = (...patterns) => rawHdrs.findIndex(h => { const hn = norm(h); return patterns.some(p => hn.includes(norm(p))); });
    const cNo = findCol('no.', 'no', 'ลำดับ'); const cFix = findCol('fixture', 'fix'); const cDate = findCol('date', 'วันที่'); const cMC = findCol('time_mc', 'timemc', 'timem/c', 'time m/c', 'mc time', 'mct', 'เวลาm/c'); const cBuy = findCol('buy off', 'buyoff', 'time buy', 'buytime', 'เวลาbuy', 'roving', 'timeroving', 'time roving', 'เวลาroving', 'buy');
    let ptDefault = 'IMPORT'; let ovenDefault = 'INCOMPLETE';
    json.slice(0, hIdx).forEach(row => {
        const rs = row.join(' ');
        // Extract Oven number — patterns: "Oven#5/2", "Oven# 5/1", "Oven:5/2"
        const ovenM = rs.match(/[Oo]ven\s*[#:]\s*(\d+\/\d+)/);
        if (ovenM) ovenDefault = ovenM[1];
        const m = rs.match(/PT[\s:]*([\w\/\-]+)/i); if (m) ptDefault = m[0].trim();
    });
    let dataRows = json.slice(hIdx + 1).filter(row => { const joined = row.join('').toLowerCase(); return !joined.includes('usl') && !joined.includes('lsl') && !joined.includes('ucl') && !joined.includes('cl') && !joined.includes('target') && row.some(c => c !== '' && c !== undefined); });

    let lastDate = '', lastBuy = '', lastMC = '', lastPT = ptDefault, lastTeam = 'A', currFix = ''; let added = 0;
    const tBase = Date.now();
    dataRows.forEach((row, idx) => {
        const rNo = cNo >= 0 ? row[cNo] : undefined, rDate = cDate >= 0 ? row[cDate] : undefined, rBuy = cBuy >= 0 ? row[cBuy] : undefined, rMC = cMC >= 0 ? row[cMC] : undefined, rFix = cFix >= 0 ? row[cFix] : undefined;

        // ดึงลอจิกหาวันที่จาก web1.js กลับมาใช้ (ลบลอจิกที่เช็ค String ขยะของ Claude ออกไป)
        if (rNo == 1 || (rMC !== undefined && rMC !== '')) {
            lastDate = parseDate(rDate) || lastDate;
            lastBuy = parseTime(rBuy) || lastBuy;
            lastMC = parseTime(rMC) || lastMC;
            currFix = (rFix !== undefined && rFix !== '') ? rFix.toString().trim() : currFix;

            if (idx + 1 < dataRows.length) {
                const r2 = dataRows[idx + 1];
                const r2Date = cDate >= 0 ? r2[cDate] : undefined;
                const r2Buy = cBuy >= 0 ? r2[cBuy] : undefined;
                if (r2Date !== undefined && r2Date !== '') lastTeam = r2Date.toString().trim();
                if (r2Buy !== undefined && r2Buy !== '') lastPT = r2Buy.toString().trim();
            }
        } else if (rFix !== undefined && rFix !== '') {
            currFix = rFix.toString().trim();
        }

        // Skybolt Roving: No. 1-4 หมายถึง 4 positions ของ fixture เดิม → ใช้ currFix + rNo เป็น fixture ID
        const isSkyboltRov = currFix && typeof currFix === 'string' && /^[A-Za-z]+\s*$/i.test(currFix.trim()) && rNo >= 1 && rNo <= 4;
        const effectiveFix = isSkyboltRov ? (currFix.trim() + '-' + rNo) : currFix;

        const vals = {}; let validValueCount = 0; const validModelDims = PRODUCTS[dModel] ? PRODUCTS[dModel].dims.map(d => getDimId(d)) : [];
        // Per-row: scan row text for Oven# pattern; fallback to ovenDefault
        let rowOven = ovenDefault;
        const rowText = row.join(' ');
        const rowOvenM = rowText.match(/[Oo]ven\s*[#:]\s*(\d+\/\d+)/);
        if (rowOvenM) rowOven = rowOvenM[1];
        // Validate rowOven — must be \d+/\d+, else mark INCOMPLETE
        const ovenValidRegex = /^\d+\/\d+$/;
        if (!ovenValidRegex.test(rowOven)) rowOven = 'INCOMPLETE';
        rawHdrs.forEach((h, i) => { if (h) { const sysId = mapHeaderToKey(h, dModel, i, rawHdrs, detectedDataType); if (sysId && !["no", "date", "timemc", "timebuyoff", "fixture", "disposition", "status", "team", "pt"].includes(sysId.toLowerCase())) { if (!validModelDims.includes(sysId)) return; let v = row[i]; if (v !== undefined && v !== null && v.toString().trim() !== '') { let vStr = v.toString().trim(); if (vStr === '-' || vStr === '---' || vStr.includes('#DIV') || vStr.includes('#REF') || vStr === 'N/A' || vStr.toLowerCase() === 'null') return; let parsed = parseFloat(v); if (!isNaN(parsed)) { vals[sysId] = parsed; validValueCount++; } } } } });
        if (validValueCount > 0 && effectiveFix && effectiveFix !== '-' && effectiveFix !== '') {
            const normalizedVals = {}; Object.entries(vals).forEach(([k, v]) => { const normKey = k.replace(/[\s\-\/\\]+/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, ''); normalizedVals[normKey] = typeof v === 'number' ? parseFloat(v.toFixed(4)) : v; });

            // Filter out empty rows that have no parallel or recess values
            let hasCritical = false;
            for (const [key, val] of Object.entries(normalizedVals)) {
                if (key === 'pt_number' || key === 'oven') continue;
                if (val !== '-' && val !== null && val !== undefined && val !== '') {
                    const kLower = key.toLowerCase();
                    if (kLower.includes('parallel') || kLower.includes('recess')) {
                        const num = parseFloat(val);
                        if (!isNaN(num)) { hasCritical = true; break; }
                    }
                }
            }
            if (!hasCritical) return;

            if (PRODUCTS[dModel]) { PRODUCTS[dModel].dims.forEach(d => { const id = getDimId(d); if (!(id in normalizedVals)) normalizedVals[id] = '-'; }); }
            const status = getInternalStatus(normalizedVals, dModel, detectedDataType || '');
            const rec = { id: tBase + tempImport.length + idx, model: dModel, modelLabel: PRODUCTS[dModel] ? PRODUCTS[dModel].label : dModel, fixture: effectiveFix, oven: rowOven, date: lastDate, buytime: lastBuy, mctime: lastMC, pt: lastPT, team: lastTeam, operator: 'IMPORT', status, values: normalizedVals, _srcFile: fileName, _detectedDataType: detectedDataType || null };
            tempImport.push(rec); added++;
        }
    });
    return added;
}

function _detectDataTypeFromFileName(fn) {
    fn = fn.toLowerCase();
    if (fn.includes('roving') || fn.includes('rov_') || fn.includes('_rov') || fn.includes('audit')) return 'Roving Audit';
    if (fn.includes('buyoff') || fn.includes('buy off') || fn.includes('buy_off') || fn.includes('_bo') || fn.includes('bo_')) return 'Buy off';
    // ถ้า detect ไม่ได้ → default เป็น Buy off (user ยังเปลี่ยนได้ใน per-file dropdown)
    return 'Buy off';
}

function _parseFirstSheetMulti(wb, fileName) {
    const sheet = wb.Sheets[wb.SheetNames[0]]; const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const dModel = _detectModel(fileName, json);
    const detectedType = _detectDataTypeFromFileName(fileName);
    _parseRecordsFromSheet(json, fileName, dModel, detectedType);
}

function _parseInputDataSheetMulti(wb, sheetName, fileName) {
    const sheet = wb.Sheets[sheetName]; const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const dModel = _detectModel(fileName, json);
    const detectedType = _detectDataTypeFromFileName(fileName);
    _parseRecordsFromSheet(json, fileName, dModel, detectedType);
}

function renderImportPreview() {
    const outlierCount = tempImport.filter(r => r.status === 'REJECT' || r.status === 'ALERT' || r.status === 'INCOMPLETE').length;
    document.getElementById('auto-drop-area').style.display = 'none';
    document.getElementById('auto-preview-area').style.display = 'block';

    const fileCounts = {}; const fileTypes = {};
    tempImport.forEach(r => {
        const f = r._srcFile || 'unknown';
        fileCounts[f] = (fileCounts[f] || 0) + 1;
        if (!fileTypes[f]) fileTypes[f] = r._detectedDataType;
    });
    const fileCount = Object.keys(fileCounts).length;

    // แสดงชิปไฟล์พร้อม per-file dropdown ให้ user เลือก type เอง
    const fileChips = Object.entries(fileCounts).map(([fn, cnt]) => {
        const dtype = fileTypes[fn];
        const safeId = fn.replace(/[^a-zA-Z0-9]/g, '_');
        const buySelected = dtype !== 'Roving Audit' ? 'selected' : '';
        const rovSelected = dtype === 'Roving Audit' ? 'selected' : '';
        const borderColor = dtype === 'Roving Audit' ? '#2D9CDB' : '#27AE60';
        return `
        <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;
                    background:var(--bg4);border:1px solid var(--border);font-size:11px;flex-wrap:wrap;">
          <span style="font-family:'Calibri','Candara','Segoe UI',sans-serif;color:var(--text2)">📄 ${fn}</span>
          <span style="background:var(--blue);color:#fff;border-radius:10px;padding:1px 6px;font-size:10px">${cnt}</span>
          <select id="filetype-${safeId}"
                  data-filename="${fn}"
                  onchange="updateFileDataType(this)"
                  style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:12px;border:1.5px solid ${borderColor};background:var(--bg3);cursor:pointer;font-family:'Calibri','Candara','Segoe UI',sans-serif">
            <option value="Buy off" ${buySelected}>🟢 Buy off</option>
            <option value="Roving Audit" ${rovSelected}>🔵 Roving Audit</option>
          </select>
        </div>`;
    }).join('');

    document.getElementById('import-count-msg').innerHTML = `
    <div style="margin-bottom:8px;font-weight:700;color:var(--text2)">
      ดึงข้อมูลสำเร็จ <b style="color:var(--accent)">${tempImport.length}</b> รายการ จาก <b>${fileCount}</b> ไฟล์ 
      <span style="font-size:11px;color:var(--text3);font-weight:400">— กำหนด Type แต่ละไฟล์ด้านล่าง แล้วกด ✓ ยืนยันบันทึก</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">${fileChips}</div>`;

    const outSum = document.getElementById('import-outlier-summary');
    if (outlierCount > 0) {
        outSum.style.display = 'block';
        outSum.innerHTML = `⚠️ พบ <b>${outlierCount}</b> รายการที่มีค่าเกิน Spec/Control Limit หรือ <b>ข้อมูลไม่ครบ (INCOMPLETE)</b>`;
    } else outSum.style.display = 'none';

    document.getElementById('import-thead').innerHTML = `
    <th>Status</th><th>Type</th><th>ไฟล์</th><th>Time Buy Off</th>
    <th>PT Name</th><th>Product</th><th>Fixture</th><th>Oven</th><th>Date</th><th>ค่าที่วัด</th>`;

    const preview = tempImport.slice(0, 60);
    document.getElementById('import-tbody').innerHTML = preview.map(r => {
        const dtype = r._detectedDataType;
        const typeBadge = dtype === 'Roving Audit'
            ? `<span class="type-label-roving">🔵 Roving</span>`
            : dtype === 'Buy off'
                ? `<span class="type-label-buyoff">🔴 Buy off</span>`
                : `<span style="color:var(--warn);font-size:11px;font-weight:700;background:rgba(243,156,18,0.1);padding:2px 6px;border-radius:4px">❓ ดู Dropdown</span>`;
        const valCount = r.values ? Object.values(r.values).filter(v => typeof v === 'number').length : 0;
        const totalDims = r.model && PRODUCTS[r.model] ? PRODUCTS[r.model].dims.length : '?';
        const valColor = valCount === 0 ? 'var(--fail)' : valCount < (typeof totalDims === 'number' ? totalDims : 999) ? 'var(--warn)' : 'var(--pass)';
        const shortFile = (r._srcFile || '').replace(/\.[^.]+$/, '').slice(0, 18);
        const ovenColor = (!r.oven || r.oven === 'INCOMPLETE') ? 'var(--fail)' : 'var(--warn)';
        return `<tr>
          <td>${statusBadge(r.status)}</td>
          <td>${typeBadge}</td>
          <td style="font-size:10px;color:var(--text3);font-family:'Calibri','Candara','Segoe UI',sans-serif;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r._srcFile || ''}">${shortFile}</td>
          <td class="mono">${r.buytime || '—'}</td>
          <td><span style="font-weight:700;color:var(--blue)">${r.pt || '—'}</span></td>
          <td><span style="font-weight:700;font-size:11px">${r.modelLabel}</span></td>
          <td class="mono" style="font-weight:700">${r.fixture}</td>
          <td class="mono" style="font-weight:700;color:${ovenColor}">${r.oven || '—'}</td>
          <td class="mono">${r.date || '—'}</td>
          <td style="text-align:center">
            <span style="font-weight:700;color:${valColor};font-family:'Calibri','Candara','Segoe UI',sans-serif">${valCount}/${totalDims}</span>
          </td>
      </tr>`;
    }).join('') + (tempImport.length > 60 ? `<tr><td colspan="10" style="text-align:center;color:var(--text3);font-size:11px">... และอีก ${tempImport.length - 60} รายการ</td></tr>` : '');
}

// อัปเดต _detectedDataType ของทุก record ในไฟล์นั้นเมื่อ user เปลี่ยน dropdown
function updateFileDataType(selectEl) {
    const fn = selectEl.dataset.filename;
    const newType = selectEl.value;
    // อัปเดตสีกรอบ dropdown
    selectEl.style.borderColor = newType === 'Roving Audit' ? '#2D9CDB' : '#27AE60';
    // อัปเดตทุก record ที่มาจากไฟล์นี้
    tempImport.forEach(r => {
        if ((r._srcFile || 'unknown') === fn) {
            r._detectedDataType = newType;
        }
    });
    // refresh preview table
    const preview = tempImport.slice(0, 60);
    document.getElementById('import-tbody').innerHTML = preview.map(r => {
        const dtype = r._detectedDataType;
        const typeBadge = dtype === 'Roving Audit'
            ? `<span class="type-label-roving">🔵 Roving</span>`
            : dtype === 'Buy off'
                ? `<span class="type-label-buyoff">🔴 Buy off</span>`
                : `<span style="color:var(--warn);font-size:11px;font-weight:700">❓</span>`;
        const valCount = r.values ? Object.values(r.values).filter(v => typeof v === 'number').length : 0;
        const totalDims = r.model && PRODUCTS[r.model] ? PRODUCTS[r.model].dims.length : '?';
        const valColor = valCount === 0 ? 'var(--fail)' : valCount < (typeof totalDims === 'number' ? totalDims : 999) ? 'var(--warn)' : 'var(--pass)';
        const shortFile = (r._srcFile || '').replace(/\.[^.]+$/, '').slice(0, 18);
        const ovenColor2 = (!r.oven || r.oven === 'INCOMPLETE') ? 'var(--fail)' : 'var(--warn)';
        return `<tr>
            <td>${statusBadge(r.status)}</td>
            <td>${typeBadge}</td>
            <td style="font-size:10px;color:var(--text3);font-family:'Calibri','Candara','Segoe UI',sans-serif;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${shortFile}</td>
            <td class="mono">${r.buytime || '—'}</td>
            <td><span style="font-weight:700;color:var(--blue)">${r.pt || '—'}</span></td>
            <td><span style="font-weight:700;font-size:11px">${r.modelLabel}</span></td>
            <td class="mono" style="font-weight:700">${r.fixture}</td>
            <td class="mono" style="font-weight:700;color:${ovenColor2}">${r.oven || '—'}</td>
            <td class="mono">${r.date || '—'}</td>
            <td style="text-align:center"><span style="font-weight:700;color:${valColor};font-family:'Calibri','Candara','Segoe UI',sans-serif">${valCount}/${totalDims}</span></td>
        </tr>`;
    }).join('') + (tempImport.length > 60 ? `<tr><td colspan="10" style="text-align:center;color:var(--text3);font-size:11px">... และอีก ${tempImport.length - 60} รายการ</td></tr>` : '');
}

// ─── Toast deduplication: ป้องกัน toast ข้อความเดิมซ้ำกันภายใน 3 วินาที ──────
const _toastHistory = new Map(); // key(msg prefix) → timestamp

function showToast(msg, type = 'info', duration = 4000) {
    const panel = document.getElementById('toast-panel');
    const now = Date.now();
    // ใช้ 80 ตัวอักษรแรกเป็น dedup key
    const dedupKey = String(msg).slice(0, 80);
    if (_toastHistory.has(dedupKey) && (now - _toastHistory.get(dedupKey)) < 3000) {
        return; // suppress duplicate within 3 s
    }
    _toastHistory.set(dedupKey, now);
    const div = document.createElement('div');
    div.className = `alert-toast ${type}`;
    const icons = { error: '🔴', warn: '🟡', success: '🟢', info: '🔵', purple: '❓' };
    div.innerHTML = `<span style="font-size:16px">${icons[type] || 'ℹ️'}</span><div><div style="font-weight:700;color:var(--text);margin-bottom:2px">${msg}</div></div><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;margin-left:auto;font-size:16px">✕</button>`;
    panel.appendChild(div);
    setTimeout(() => div.remove(), duration);
}

function updateNotifBadge() {
    // Alert logic has been centralized
}

function renderAlertLog() { }
function generateOutlookDraft() { }
function sendAutoAlertViaPython() { }
function checkRealtimeAlertAndNotify(rec) {
    if (rec && (rec.status === 'REJECT' || rec.status === 'FAIL' || rec.status === 'NG')) {
        alert(`แจ้งเตือน: พบข้อมูลอยู่นอกเกณฑ์ (REJECT/Fail)! \nโปรดตรวจสอบ Product: ${rec.product || rec.model || '-'} Fixture: ${rec.fixture || '-'}`);
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
window.addEventListener('DOMContentLoaded', () => {
    migrateOldData();
    initConfigs();
    syncDataConsistency(true);

    // ⭐ URGENT FIX: Delay populateDropdowns() เพื่อให้ initConfigs() เสร็จก่อน
    setTimeout(() => {
        console.log('[DOMContentLoaded] Calling populateDropdowns() after initConfigs()');
        fetchDynamicProducts(); // THIS calls populateDropdowns() when done
    }, 50);

    setDefaultDate();
    populateDailyDateDropdown();
    updateDashboard();
    renderAutoTable();
    renderAboutTable();

    // Initialize Connection Health Checking
    checkBackendConnection().then(() => {
        if (isBackendOnline) fetchServerRecords();
    });
    setInterval(() => {
        checkBackendConnection().then(() => {
            if (isBackendOnline) {
                window.BLoader?.showIfSlow('กำลังดึงข้อมูล');
                fetchServerRecords().finally(() => window.BLoader?.hideIfSlow());
            }
        });
    }, 60000);

    setInterval(() => { document.getElementById('clock').textContent = new Date().toLocaleString('th-TH'); }, 1000);
    document.getElementById('clock').textContent = new Date().toLocaleString('th-TH');
    updateNotifBadge(); renderAlertLog();

    // ==========================================
    // [เพิ่มใหม่] ระบบไล่ Navigation ในส่วน Header ด้วยปุ่ม Enter
    // เรียงลำดับ ID ตามที่คุณต้องการให้มันกระโดดไป
    // ==========================================
    const headerFields = [
        'm-datatype', // Data Type
        'm-model',     // Product
        'm-fix1',     // Fixture
        'm-pt',       // PT Number
        'm-buytime',  // Time Buy Off
        'm-team',     // Team
        'm-op',       // EN Number
        'm-oven'      // Oven Number
    ];

    headerFields.forEach((id, index) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // ป้องกันข้ามบรรทัดหรือ submit มั่ว

                    // หาฟิลด์ถัดไปในอาร์เรย์
                    const nextFieldId = headerFields[index + 1];
                    if (nextFieldId) {
                        const nextElement = document.getElementById(nextFieldId);
                        if (nextElement) nextElement.focus();
                    } else {
                        // ถ้าหมดชุด Header แล้ว ให้กระโดดไปฟิลด์วัดค่าช่องแรก
                        const firstDimInput = document.querySelector('#dim-container input.manual-field:not([disabled])')
                            || document.querySelector('input.manual-field:not([disabled])');
                        if (firstDimInput) {
                            firstDimInput.focus();
                            if (typeof firstDimInput.select === 'function') firstDimInput.select();
                        } else {
                            // ถ้าไม่มีช่องมิติ ให้โฟกัสปุ่มบันทึกแทน
                            const saveBtn = document.getElementById('btn-save-draft');
                            if (saveBtn) saveBtn.focus();
                        }
                    }
                }
            });
        }
    });
});

// ⭐ EXTRA SAFETY: เพิ่มเติม 'load' event ในกรณีที่ DOMContentLoaded ยังไม่เสร็จ
window.addEventListener('load', () => {
    console.log('[window load event] Ensuring all dropdowns are populated');
    const mModel = document.getElementById('m-model');
    if (mModel && mModel.querySelectorAll('option').length <= 1) {
        console.warn('[load] m-model dropdown ยังไม่มี options — ทำการ repopulate');
        populateDropdowns();
    }
});

function migrateOldData() {
    let changed = false;
    DB.records.forEach(r => {
        if (!r.values || !PRODUCTS[r.model]) return;
        const newVals = {}; const dims = PRODUCTS[r.model].dims.map(d => getDimId(d));
        Object.keys(r.values).forEach(oldKey => {
            let val = r.values[oldKey]; let mappedKey = mapHeaderToKey(oldKey, r.model);
            if (dims.includes(mappedKey)) newVals[mappedKey] = val;
        });
        if (JSON.stringify(r.values) !== JSON.stringify(newVals)) { r.values = newVals; changed = true; }
    });

    Object.keys(DB.configs).forEach(cfgKey => {
        const mk = cfgKey.replace('_rov', ''); // ตัด _rov ออกเพื่อหาชื่อโมเดลตั้งต้น
        if (PRODUCTS[mk]) {
            const newModelCfg = {}; const dims = PRODUCTS[mk].dims.map(d => getDimId(d));
            Object.keys(DB.configs[cfgKey]).forEach(oldKey => {
                let cfg = DB.configs[cfgKey][oldKey];
                let mappedKey = mapHeaderToKey(oldKey, mk);
                if (dims.includes(mappedKey)) newModelCfg[mappedKey] = cfg;
            });

            // แยกว่าจะดึง Default จากก้อน Roving หรือ Buy off
            const isRov = cfgKey.endsWith('_rov');
            const defSource = isRov ? SPEC_ROVING : SPEC_BUYOFF;

            dims.forEach(id => {
                if (!newModelCfg[id]) newModelCfg[id] = (defSource[mk] && defSource[mk][id]) || { lsl: null, lcl: null, cl: null, ucl: null, usl: null };
            });

            if (JSON.stringify(DB.configs[cfgKey]) !== JSON.stringify(newModelCfg)) { DB.configs[cfgKey] = newModelCfg; changed = true; }
        }
    });
    if (changed) saveDB();
}

function initConfigs() {
    Object.keys(PRODUCTS).forEach(mk => {

        // --- 1. สำหรับ Config Buy off ---
        if (!DB.configs[mk]) DB.configs[mk] = {};
        PRODUCTS[mk].dims.forEach(d => {
            const id = getDimId(d);
            const def = (SPEC_BUYOFF[mk] && SPEC_BUYOFF[mk][id]) || { lsl: null, lcl: null, cl: null, ucl: null, usl: null };
            DB.configs[mk][id] = { ...def };

            let p = DB.configs[mk][id];
            if (p.lsl != null && p.usl != null && p.lsl >= p.usl) { let t = p.lsl; p.lsl = p.usl; p.usl = t; }
            if (p.lsl != null && p.cl != null && p.lsl >= p.cl) { let t = p.lsl; p.lsl = p.cl; p.cl = t; }
            if (p.cl != null && p.usl != null && p.cl >= p.usl) { let t = p.cl; p.cl = p.usl; p.usl = t; }
            if (p.lcl != null && p.ucl != null && p.lcl >= p.ucl) { let t = p.lcl; p.lcl = p.ucl; p.ucl = t; }
        });
        const validIds = PRODUCTS[mk].dims.map(d => getDimId(d));
        Object.keys(DB.configs[mk]).forEach(existingKey => { if (!validIds.includes(existingKey)) delete DB.configs[mk][existingKey]; });

        // --- 2. สำหรับ Config Roving ---
        const rovKey = mk + '_rov';
        if (!DB.configs[rovKey]) DB.configs[rovKey] = {};
        PRODUCTS[mk].dims.forEach(d => {
            const id = getDimId(d);
            const defRov = (SPEC_ROVING[mk] && SPEC_ROVING[mk][id]) || { lsl: null, lcl: null, cl: null, ucl: null, usl: null };
            DB.configs[rovKey][id] = { ...defRov };
        });
        Object.keys(DB.configs[rovKey]).forEach(existingKey => { if (!validIds.includes(existingKey)) delete DB.configs[rovKey][existingKey]; });

    });
    saveDB();
}

// ==========================================
// [เพิ่มใหม่] ฟังก์ชันสร้างตัวเลือก Product แบบแยกประเภท
// ==========================================
function getProductOptions(dataType, includeAll = false, includeSelectFirst = false, onlyExisting = false) {
    let options = '';

    // สร้าง Set ของ product keys ที่มี data อยู่จริงๆ (ถ้า onlyExisting = true)
    let existingKeys = new Set();
    if (onlyExisting) {
        DB.records.forEach(r => {
            if (dataType && dataType !== 'all' && dataType !== 'compare') {
                if ((r.dataType || 'Buy off') !== dataType) return;
            }
            const resolved = getProductConfig(r.model);
            if (resolved) existingKeys.add(resolved.key);
        });
    }

    if (includeSelectFirst) {
        options += '<option value="">— เลือก Product —</option>';
    }
    if (includeAll) {
        options += '<option value="">ทุก Product</option>';
    }

    // ── Helper: สร้าง options จาก window.PRODUCTS โดยตรง (guaranteed correct keys)
    function buildFromProducts(filterFn = () => true) {
        const products = window.PRODUCTS || {};
        Object.entries(products).forEach(([k, v]) => {
            if (!filterFn(k, v)) return;
            if (dataType === 'Roving Audit' && k === 'dorado5d') return;
            if (k.toLowerCase() === 'rosewood5d') return;
            if (onlyExisting && !existingKeys.has(k)) return; // ข้ามถ้าไม่มี data
            options += `<option value="${k}">${v.label || k}</option>`;
        });
    }

    // ── Path A: SERVER_PRODUCTS_LIST ว่าง → ใช้ window.PRODUCTS fallback
    if (!window.SERVER_PRODUCTS_LIST || window.SERVER_PRODUCTS_LIST.length === 0) {
        const products = window.PRODUCTS || {};
        if (Object.keys(products).length > 0) {
            // มี window.PRODUCTS แล้ว — ใช้โดยตรง (key ถูกต้องแน่นอน)
            buildFromProducts();
        } else {
            // window.PRODUCTS ยังไม่มี → ใช้ SPEC_BUYOFF keys เป็น last-resort
            const specKeys = Object.keys(window.SPEC_BUYOFF || SPEC_BUYOFF || {});
            specKeys.forEach(k => {
                if (dataType === 'Roving Audit' && k === 'dorado5d') return;
                if (k.toLowerCase() === 'rosewood5d') return;

                // ถ้าระบุว่าต้องมี data แต่ key นี้ไม่อยู่ใน existingKeys ให้ข้าม
                if (onlyExisting) {
                    const resolved = getProductConfig(k);
                    if (!resolved || !existingKeys.has(resolved.key)) return;
                }

                // format label: "skybolt1d" → "Skybolt 1D" (best-effort)
                const label = k.replace(/([a-z])(\d)/g, '$1 $2').replace(/([a-z])([a-z]+)/g, (_, a, b) => a.toUpperCase() + b).trim();
                options += `<option value="${k}">${label}</option>`;
            });
        }
        return options;
    }

    // ── Path B: SERVER_PRODUCTS_LIST มีข้อมูล → filter ตาม dataType
    let dbMode = dataType ? dataType.toLowerCase().trim().replace(/\s+/g, '') : null;
    if (dbMode === 'buy-off') dbMode = 'buyoff';
    if (dbMode === 'rovingaudit') dbMode = 'roving';
    if (dbMode === 'compare') dbMode = 'all';

    const filtered = window.SERVER_PRODUCTS_LIST.filter(p => {
        if (!dbMode || dbMode === 'all') return true;
        if (!p.mode) return true;
        let pMode = (p.mode || '').toLowerCase().trim().replace(/\s+/g, '');
        if (pMode === 'buy-off') pMode = 'buyoff';
        if (pMode === 'rovingaudit') pMode = 'roving';
        return pMode === dbMode;
    });

    // [BUG FIX] ใช้ getProductConfig() แทน sortedKeys.find() แบบเดิม
    // เพราะ _internalProducts อาจว่างถ้า window.PRODUCTS โหลดไม่ทัน
    filtered.forEach(p => {
        // p.product_key คือ key จาก dispensing_product table (ตรงกับ master_products.product_key)
        // ลอง resolve ให้แน่ใจว่า key ตรงกับ window.PRODUCTS
        const resolvedEntry = getProductConfig(p.product_key || p.product_name);
        const mk = resolvedEntry
            ? resolvedEntry.key
            : (p.product_key || p.product_name || '');
        if (!mk) return; // ข้ามถ้า key ว่าง
        if (onlyExisting && !existingKeys.has(mk)) return; // ข้ามถ้าไม่มี data
        options += `<option value="${mk}" data-fullname="${p.product_name}">${p.product_name}</option>`;
    });

    return options;
}

// ==========================================
// [เพิ่มใหม่] ฟังก์ชันอัปเดตหน้าจอเมื่อมีการคลิกเปลี่ยนโหมด
// ==========================================
function updateDynamicDropdowns(scope = 'all') {
    const getVal = id => document.getElementById(id) ? document.getElementById(id).value : '';

    if (scope === 'all' || scope === 'manual') {
        const mEl = document.getElementById('m-model');
        if (mEl) {
            const prev = mEl.value;
            const opts = getProductOptions(getVal('m-datatype'), false, true);
            mEl.innerHTML = opts;
            // ตรวจสอบและคืนค่าเดิมหากยังคงอยู่ในรายการใหม่
            if (mEl.querySelector(`option[value="${prev}"]`)) {
                mEl.value = prev;
            } else {
                mEl.value = '';
            }
        }
    }
    if (scope === 'all' || scope === 'config') {
        const cfgEl = document.getElementById('cfg-model');
        if (cfgEl) {
            const prev = cfgEl.value;
            cfgEl.innerHTML = getProductOptions(getVal('cfg-datatype'), false, true);
            if (cfgEl.querySelector(`option[value="${prev}"]`)) cfgEl.value = prev; else cfgEl.value = '';
        }
    }
    if (scope === 'all' || scope === 'viz') {
        const vEl = document.getElementById('v-model');
        if (vEl) {
            const vDataType = getVal('v-datatype');
            if (!vDataType) {
                vEl.innerHTML = '<option value="">— เลือก Data Type ก่อน —</option>';
                vEl.value = '';
            } else {
                const prev = vEl.value;
                vEl.innerHTML = getProductOptions(vDataType, false, true, true);
                if (vEl.querySelector(`option[value="${prev}"]`)) vEl.value = prev; else vEl.value = '';
            }
        }
    }
}

// ==========================================
// [แก้ของเดิม] ฟังก์ชันผูก Dropdown เข้ากับระบบทั้งหมด
// ==========================================
function populateDropdowns() {
    // 1. จัดการ Dropdown เมนูค้นหาและเมนูตั้งค่าที่ไม่แปรผันตาม Data Type
    ['auto-model-filter', 'about-model-filter', 'log-model-filter', 'e-model', 'i-model'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'e-model' || id === 'i-model') {
                el.innerHTML = getProductOptions('all', false, false);
            } else {
                el.innerHTML = getProductOptions('all', true, false);
            }
        }
    });

    // 2. จัดการ Dropdown สำหรับฟอร์มกรอกและดูข้อมูลเบื้องต้น
    updateDynamicDropdowns();

    // 3. ฝัง Event Listener ให้ Dropdown เปลี่ยนแปลงทันทีเมื่อสลับโหมด Buy off / Roving
    const mDataType = document.getElementById('m-datatype');
    if (mDataType) {
        mDataType.addEventListener('change', () => {
            // เปลี่ยน DataType → ล้าง memory เพื่อไม่ให้ restore ค่าเดิม
            _formMemory = null;
            updateDynamicDropdowns('manual');
            renderManualForm();
        });
    }

    // 4. ตรวจสอบและ reinitialize dropdown หากจำเป็น (URGENT FIX)
    const checkEl = document.getElementById('m-model');
    if (checkEl && checkEl.querySelectorAll('option').length <= 1) {
        console.warn('[Dispensing] WARNING: m-model dropdown ยังไม่มี options — ทำการ reinitialize');
        updateDynamicDropdowns('manual');
        // ยืนยันว่า options ถูกเติมแล้ว
        const optCount = checkEl.querySelectorAll('option').length;
        console.log(`[Dispensing] m-model dropdown มี ${optCount} options หลัง reinitialize`);
    }
}

const cfgDataType = document.getElementById('cfg-datatype');
if (cfgDataType) {
    cfgDataType.addEventListener('change', () => {
        updateDynamicDropdowns('config');
        renderConfigTable();
    });
}

const vDataType = document.getElementById('v-datatype');
if (vDataType) {
    vDataType.addEventListener('change', () => {
        updateDynamicDropdowns('viz');
        updateVizParams();
    });
}

// 4. ตรวจสอบและ reinitialize dropdown หากจำเป็น
const checkEl = document.getElementById('m-model');
if (checkEl && checkEl.querySelectorAll('option').length <= 1) {
    console.warn('[Dispensing] Warning: m-model dropdown ยังไม่มี options — ทำการ reinitialize');
    setTimeout(() => {
        updateDynamicDropdowns('manual');
        // ยืนยันว่า options ถูกเติมแล้ว
        const optCount = checkEl.querySelectorAll('option').length;
        console.log(`[Dispensing] m-model dropdown มี ${optCount} options หลัง reinitialize`);
    }, 50);
}

// 5. Force initialize ทุก dropdown สำหรับแบบฟอร์ม Config และ Visualization
setTimeout(() => {
    const cfgModel = document.getElementById('cfg-model');
    const vModel = document.getElementById('v-model');
    if (cfgModel && cfgModel.querySelectorAll('option').length <= 1) {
        const dataType = document.getElementById('cfg-datatype') ? document.getElementById('cfg-datatype').value : 'Buy off';
        cfgModel.innerHTML = getProductOptions(dataType, false, true);
    }
    if (vModel && vModel.querySelectorAll('option').length <= 1) {
        vModel.innerHTML = getProductOptions('all', true, false);
    }
}, 100);

function setDefaultDate() { const d = document.getElementById('m-date'); if (d) d.value = TODAY; const i = document.getElementById('i-date'); if (i) i.value = TODAY; const mc = document.getElementById('m-mctime'); if (mc) { const n = new Date(); mc.value = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; } }

function switchTab(id, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active')); document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-' + id).classList.add('active'); if (btn) btn.classList.add('active');

    if (id === 'manual') {
        renderPendingTable();
        populateMergeDropdown();
        updatePendingBadge();
    }

    if (id === 'viz') {
        // ตั้งค่าวันที่เริ่มต้นครั้งแรกเมื่อเปิด tab
        const startEl = document.getElementById('daily-start');
        const endEl = document.getElementById('daily-end');
        if (startEl && endEl && !startEl.value) {
            const dates = [...new Set(DB.records.filter(r => r.date).map(r => toISO(r.date)).filter(Boolean))].sort();
            if (dates.length) {
                window.startDate = dates[0];
                window.endDate = dates[dates.length - 1];
            } else {
                window.startDate = TODAY;
                window.endDate = TODAY;
            }
            startEl.value = window.startDate;
            endEl.value = window.endDate;
        }
        populateDailyDateDropdown();
        updateVizParams();
        setTimeout(drawSPCChart, 200);
        // ไม่ auto-render daily compare — ผู้ใช้ต้องกดปุ่ม "แสดงผล"
    }
    if (id === 'config') renderConfigTable(); if (id === 'about') { window._manualRenderAbout = true; renderAboutTable(); } if (id === 'auto') renderAutoTable(); if (id === 'alerts') renderAlertLog();
}

function renderManualForm() {
    const rawMk = document.getElementById('m-model').value; const container = document.getElementById('manual-form-body');
    if (!rawMk) { container.innerHTML = '<div class="empty"><div class="ei">🔧</div><p>กรุณาเลือก Product ด้านบน</p></div>'; return; }

    // [BUG FIX] ใช้ getProductConfig() แทน PRODUCTS[mk] โดยตรง
    const resolved = getProductConfig(rawMk);
    if (!resolved || !resolved.cfg || !Array.isArray(resolved.cfg.dims)) {
        container.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>ไม่พบข้อมูล Product "<b>${rawMk}</b>"<br><small>กรุณาตรวจสอบ master_products ใน DB</small></p></div>`;
        console.error(`[renderManualForm] getProductConfig("${rawMk}") → null`);
        return;
    }
    const mk = resolved.key;       // canonical internal key
    const dims = resolved.cfg.dims;

    // ── Stage 1 (Manual Input) แสดงเฉพาะค่าที่ QC ต้องวัดเองจริง:
    //    Coil/Bobbin Parallel, Recess DTM, Recess NDTM เท่านั้น
    //    ส่วนพารามิเตอร์อื่น (X1/Y1/Coil position/Epoxy length/Crash stop ฯลฯ)
    //    จะมาจาก Stage 2: Bulk Merge (SM Flash text dictionary) แทน
    //    แต่ละ Product จะมีจำนวนค่าที่ต้องกรอกไม่เท่ากัน ขึ้นกับ dims ที่กำหนดไว้
    const measureDims = dims.filter(d => isMeasurementDim(getDimId(d)));

    let html = '';

    if (measureDims.length === 0) {
        html += `<div style="padding:20px;text-align:center;color:var(--text3)">
      <p>Product นี้ไม่มีพารามิเตอร์</p>
    </div>`;
        container.innerHTML = html;
        return;
    }

    html += '<div class="dim-grid" id="dim-container">';


    measureDims.forEach(d => {
        const id = getDimId(d);
        const cfg = getManualFormCfg(mk, id);
        let inputHtml;
        if (isMulti(d)) {
            const inputs = Array(d.n).fill(0).map((_, i) =>
                `<input type="number" step="0.0001" class="mi-${id} manual-field" oninput="calcAvg('${id}','${mk}')" placeholder="${i + 1}">`
            ).join('');
            inputHtml = `<div class="multi-inputs">${inputs}</div><div class="dim-avg">Avg: <b id="avg-${id}">—</b></div>`;
        } else {
            inputHtml = `<input type="number" step="0.0001" class="form-input manual-field" id="val-${id}" oninput="evalDim('${id}','${mk}')" style="margin-top:4px">`;
        }
        html += `<div class="dim-card" id="dcard-${id}">
      <div class="dim-label">${id.replace(/_/g, ' ')}</div>
      <div class="dim-spec">LSL:${cfg.lsl ?? '—'} | LCL:${cfg.lcl ?? '—'} | CL:${cfg.cl ?? '—'} | UCL:${cfg.ucl ?? '—'} | USL:${cfg.usl ?? '—'}</div>
      ${inputHtml}
      <div class="dim-hint" id="hint-${id}"></div>
    </div>`;
    });

    // Add VMI, Coil Height, Hi-pot as fixed PASS/FAIL dropdowns at the END of QC Measurements
    html += `
        <div class="dim-card" style="grid-column: span 1; display: flex; flex-direction: column; justify-content: center;">
          <div class="dim-label" style="margin-bottom:8px">VMI</div>
          <div class="pf-toggle" id="toggle-vmi" data-value="">
            <div class="pf-btn pf-pass" onclick="setPF('vmi', 'PASS')">PASS</div>
            <div class="pf-btn pf-fail" onclick="setPF('vmi', 'FAIL')">FAIL</div>
            <input type="hidden" id="m-vmi" value="">
          </div>
        </div>
        <div class="dim-card" style="grid-column: span 1; display: flex; flex-direction: column; justify-content: center;">
          <div class="dim-label" style="margin-bottom:8px">Coil Height</div>
          <div class="pf-toggle" id="toggle-coil_height" data-value="">
            <div class="pf-btn pf-pass" onclick="setPF('coil_height', 'PASS')">PASS</div>
            <div class="pf-btn pf-fail" onclick="setPF('coil_height', 'FAIL')">FAIL</div>
            <input type="hidden" id="m-coil_height" value="">
          </div>
        </div>
        <div class="dim-card" style="grid-column: span 1; display: flex; flex-direction: column; justify-content: center;">
          <div class="dim-label" style="margin-bottom:8px">Hi-pot</div>
          <div class="pf-toggle" id="toggle-hi_pot" data-value="">
            <div class="pf-btn pf-pass" onclick="setPF('hi_pot', 'PASS')">PASS</div>
            <div class="pf-btn pf-fail" onclick="setPF('hi_pot', 'FAIL')">FAIL</div>
            <input type="hidden" id="m-hi_pot" value="">
          </div>
        </div>
    `;

    html += '</div>';
    container.innerHTML = html;
    updateValidationBanner(mk);

    // ==========================================
    // FEATURE 1: Enter key → เลื่อนไปช่องถัดไป (เหมือน Tab)
    // ==========================================
    const dimContainer = document.getElementById('dim-container');
    if (!dimContainer) return;

    const getManualFocusableFields = () => Array.from(dimContainer.querySelectorAll('input.manual-field:not([disabled])'));
    const focusNextManualField = (currentInput) => {
        const allInputs = getManualFocusableFields();
        const idx = allInputs.indexOf(currentInput);
        if (idx >= 0 && idx < allInputs.length - 1) {
            const nextInput = allInputs[idx + 1];
            nextInput.focus();
            if (typeof nextInput.select === 'function') nextInput.select();
        } else {
            // FIXED: Updated to correct button ID
            const saveBtn = document.getElementById('btn-save-draft');
            if (saveBtn) saveBtn.focus();
        }
    };

    dimContainer.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== 'NumpadEnter') return;
        const currentInput = e.target.closest('input.manual-field');
        if (!currentInput || !dimContainer.contains(currentInput)) return;
        e.preventDefault();
        focusNextManualField(currentInput);
    });

    // ===== FORM MEMORY: restore measurement values ถ้า model+datatype ตรงกัน =====
    const _mem = _formMemory;
    const _curDT = (document.getElementById('m-datatype') || {}).value || 'Buy off';
    if (_mem && _mem.model === mk && _mem.dataType === _curDT && _mem.values) {
        PRODUCTS[mk].dims.forEach(d => {
            const id = getDimId(d);
            const saved = _mem.values[id];
            if (saved === undefined || saved === null) return;
            if (isMulti(d)) {
                if (Array.isArray(saved)) {
                    const inputs = document.querySelectorAll('.mi-' + id);
                    inputs.forEach((inp, i) => { if (saved[i] !== undefined) inp.value = saved[i]; });
                    calcAvg(id, mk);
                }
            } else {
                const inp = document.getElementById('val-' + id);
                if (inp && saved !== '') {
                    inp.value = saved;
                    evalDim(id, mk);
                }
            }
        });
        updateValidationBanner(mk);
        // Toast ยิงครั้งแรกเท่านั้น (ป้องกันยิงซ้ำเมื่อ renderManualForm ถูก call หลายครั้ง)
        if (!_mem._toastShown) {
            _mem._toastShown = true;
            showToast('🔄 คืนค่าที่กรอกไว้ก่อนหน้า (PT: ' + (_mem.pt || '—') + ')', 'info');
        }
    }
    // ====================================================================
}

// ==========================================
// ล้างจอแบบ Hard Clear (ล้าง memory ด้วย)
// ==========================================
function clearFormMemory() {
    _formMemory = null;
    document.getElementById('m-fix1').value = '';
    document.getElementById('m-pt').value = '';
    document.getElementById('m-model').value = '';
    const ovenEl = document.getElementById('m-oven');
    if (ovenEl) { ovenEl.value = ''; ovenEl.style.borderColor = ''; ovenEl.style.boxShadow = ''; }
    const ovenHint = document.getElementById('m-oven-hint');
    if (ovenHint) { ovenHint.style.color = 'var(--text3)'; ovenHint.textContent = 'รูปแบบ: ตัวเลข/ตัวเลข เช่น 5/1 หรือ 10/2'; }
    document.getElementById('manual-form-body').innerHTML = '<div class="empty"><div class="ei">🔧</div><p>กรุณาเลือก Product ด้านบน</p></div>';
    document.getElementById('val-banner').style.display = 'none';
    const btn = document.getElementById('btn-save-draft'); btn.disabled = false; btn.style.opacity = '1';
    updateMemoryIndicator();
}

function updateMemoryIndicator() {
    const badge = document.getElementById('form-memory-badge');
    if (!badge) return;
    if (_formMemory) {
        badge.style.display = 'inline-flex';
        badge.textContent = '🔄 จำค่าไว้: ' + (_formMemory.model ? (PRODUCTS[_formMemory.model]?.label || _formMemory.model) : '—') + ' / ' + (_formMemory.dataType || '—');
    } else {
        badge.style.display = 'none';
    }
}

function onManualModelChange() {
    const newModel = document.getElementById('m-model').value;
    const newDType = (document.getElementById('m-datatype') || {}).value || 'Buy off';
    if (_formMemory && (_formMemory.model !== newModel || _formMemory.dataType !== newDType)) {
        _formMemory = null;
    }
    renderManualForm();
}

// ─── Helper: คืน config ที่ถูกต้องตาม DataType ที่เลือกในฟอร์ม ───────────────
// ใช้ '_rov' suffix สำหรับ Roving Audit; fallback ไป Buy off ถ้าไม่มี key
function getManualFormCfg(mk, id) {
    const dType = (document.getElementById('m-datatype') || {}).value || 'Buy off';
    const cfgKey = dType === 'Roving Audit' ? mk + '_rov' : mk;
    return (DB.configs[cfgKey] && DB.configs[cfgKey][id])
        || (DB.configs[mk] && DB.configs[mk][id])
        || {};
}

// ─── applyInlineInputStyle: ทำ inline color บน input/avg ทันที ───────────────
// สำหรับ single-input: เปลี่ยน border-color + box-shadow ของ input element
// สำหรับ multi-input: เปลี่ยน avg display background color
function applyInlineInputStyle(id, status) {
    // Single input field
    const singleInp = document.getElementById('val-' + id);
    if (singleInp) {
        if (status === 'critical') {
            singleInp.style.borderColor = 'var(--fail)';
            singleInp.style.boxShadow = '0 0 0 2px rgba(231,76,60,0.18)';
            singleInp.style.background = 'rgba(231,76,60,0.06)';
            singleInp.style.color = 'var(--fail)';
        } else if (status === 'warn') {
            singleInp.style.borderColor = 'var(--warn)';
            singleInp.style.boxShadow = '0 0 0 2px rgba(243,156,18,0.18)';
            singleInp.style.background = 'rgba(243,156,18,0.06)';
            singleInp.style.color = 'var(--warn-dark, #b7791f)';
        } else if (status === 'ok') {
            singleInp.style.borderColor = 'var(--pass)';
            singleInp.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.15)';
            singleInp.style.background = 'rgba(39,174,96,0.04)';
            singleInp.style.color = 'var(--pass)';
        } else {
            singleInp.style.borderColor = '';
            singleInp.style.boxShadow = '';
            singleInp.style.background = '';
            singleInp.style.color = '';
        }
    }
    // Multi-input: color the avg display badge
    const avgEl = document.getElementById('avg-' + id);
    if (avgEl) {
        if (status === 'critical') {
            avgEl.style.color = 'var(--fail)';
            // tint each sub-input red
            document.querySelectorAll('.mi-' + id).forEach(i => {
                i.style.borderColor = 'var(--fail)';
                i.style.boxShadow = '0 0 0 2px rgba(231,76,60,0.15)';
                i.style.color = 'var(--fail)';
            });
        } else if (status === 'warn') {
            avgEl.style.color = 'var(--warn)';
            document.querySelectorAll('.mi-' + id).forEach(i => {
                i.style.borderColor = 'var(--warn)';
                i.style.boxShadow = '0 0 0 2px rgba(243,156,18,0.15)';
                i.style.color = '';
            });
        } else if (status === 'ok') {
            avgEl.style.color = 'var(--pass)';
            document.querySelectorAll('.mi-' + id).forEach(i => {
                i.style.borderColor = 'var(--pass)';
                i.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.12)';
                i.style.color = '';
            });
        } else {
            avgEl.style.color = '';
            document.querySelectorAll('.mi-' + id).forEach(i => {
                i.style.borderColor = '';
                i.style.boxShadow = '';
                i.style.color = '';
            });
        }
    }
}

function calcAvg(id, mk) {
    const inputs = document.querySelectorAll(`.mi-${id}`);
    let sum = 0, cnt = 0;
    inputs.forEach(i => { if (i.value !== '') { sum += parseFloat(i.value); cnt++; } });
    const avg = cnt > 0 ? sum / cnt : null;
    const el = document.getElementById(`avg-${id}`);
    if (el) el.textContent = avg !== null ? avg.toFixed(4) : '—';
    evalDimVal(id, mk, avg);
}

function evalDim(id, mk) {
    const inp = document.getElementById(`val-${id}`);
    const val = inp && inp.value !== '' ? parseFloat(inp.value) : null;
    evalDimVal(id, mk, val);
}

function evalDimVal(id, mk, val) {
    // ── ใช้ config ตาม DataType ที่เลือก (Buy off หรือ Roving Audit) ──
    const cfg = getManualFormCfg(mk, id);
    const card = document.getElementById(`dcard-${id}`);
    const hint = document.getElementById(`hint-${id}`);
    if (!card) return;

    if (val === null || isNaN(val)) {
        card.className = 'dim-card';
        applyInlineInputStyle(id, 'empty');
        if (hint) { hint.textContent = ''; hint.style.display = 'none'; }
        updateValidationBanner(mk);
        return;
    }

    const status = checkValAgainstSpec(val, cfg);

    if (status === 'critical') {
        card.className = 'dim-card state-fail';
        applyInlineInputStyle(id, 'critical');
        if (hint) {
            const lsl = cfg.lsl != null ? `LSL ${cfg.lsl}` : '';
            const usl = cfg.usl != null ? `USL ${cfg.usl}` : '';
            hint.textContent = `🚫 เกิน Spec! ${[lsl, usl].filter(Boolean).join(' / ')}`;
            hint.style.display = 'block';
            hint.style.color = 'var(--fail)';
        }
    } else if (status === 'warn') {
        card.className = 'dim-card state-warn';
        applyInlineInputStyle(id, 'warn');
        if (hint) {
            const lcl = cfg.lcl != null ? `LCL ${cfg.lcl}` : '';
            const ucl = cfg.ucl != null ? `UCL ${cfg.ucl}` : '';
            hint.textContent = `⚠️ เกิน Control Limit  ${[lcl, ucl].filter(Boolean).join(' / ')}`;
            hint.style.display = 'block';
            hint.style.color = 'var(--warn)';
        }
    } else {
        card.className = 'dim-card state-pass';
        applyInlineInputStyle(id, 'ok');
        if (hint) { hint.textContent = ''; hint.style.display = 'none'; }
    }

    updateValidationBanner(mk);
}

function updateValidationBanner(mk) {
    if (!mk) return;
    const dims = PRODUCTS[mk].dims;
    const ngParams = [], warnParams = [], missingParams = [];

    // Stage 1: validate only the measurement dims visible in the form
    const visibleDims = dims.filter(d => isMeasurementDim(getDimId(d)));
    const totalMeasure = visibleDims.length;

    visibleDims.forEach(d => {
        const id = getDimId(d);
        // ── ใช้ config ตาม DataType ที่เลือก ──
        const cfg = getManualFormCfg(mk, id);
        let val = null;
        if (isMulti(d)) {
            const el = document.getElementById(`avg-${id}`);
            val = el && el.textContent !== '—' ? parseFloat(el.textContent) : null;
        } else {
            const inp = document.getElementById(`val-${id}`);
            val = inp && inp.value !== '' ? parseFloat(inp.value) : null;
        }
        if (val === null || isNaN(val)) { missingParams.push(id); return; }
        const status = checkValAgainstSpec(val, cfg);
        if (status === 'critical') ngParams.push(id);
        else if (status === 'warn') warnParams.push(id);
    });

    const banner = document.getElementById('val-banner');
    const saveBtn = document.getElementById('btn-save-draft');
    let bannerHtml = '', bannerType = 'ok';

    // ── NG / Out-of-Spec ──
    if (ngParams.length > 0) {
        bannerType = 'fail';
        bannerHtml += `🚫 <b>NG — เกิน Spec Limit:</b> <b style="color:var(--fail)">${ngParams.map(p => p.replace(/_/g, ' ')).join(', ')}</b><br>`;
    }
    // ── Warning / Out-of-Control ──
    if (warnParams.length > 0) {
        if (bannerType === 'ok') bannerType = 'warn';
        bannerHtml += `⚠️ <b>Alert — เกิน Control Limit:</b> ${warnParams.map(p => p.replace(/_/g, ' ')).join(', ')}<br>`;
    }
    // ── ยังกรอกไม่ครบ — แสดงจำนวนที่เหลือ ──
    if (missingParams.length > 0) {
        if (bannerType === 'ok') bannerType = 'purple';
        bannerHtml += `❓ <b>ยังกรอกไม่ครบ:</b> ${missingParams.length}/${totalMeasure} พารามิเตอร์ `;
        bannerHtml += `<span style="font-size:11px;font-weight:400">(${missingParams.map(p => p.replace(/_/g, ' ')).join(', ')})</span><br>`;
    }

    if (bannerHtml) {
        banner.style.display = 'block';
        if (bannerType === 'fail') {
            banner.style.background = 'var(--fail-bg)';
            banner.style.border = '1px solid rgba(231,76,60,0.3)';
            banner.style.color = 'var(--fail)';
        } else if (bannerType === 'warn') {
            banner.style.background = 'var(--warn-bg)';
            banner.style.border = '1px solid rgba(243,156,18,0.3)';
            banner.style.color = 'var(--warn)';
        } else {
            banner.style.background = 'var(--incomplete-bg, rgba(155,89,182,0.07))';
            banner.style.border = '1px solid rgba(155,89,182,0.3)';
            banner.style.color = 'var(--purple)';
        }
        banner.innerHTML = bannerHtml;
    } else {
        // ทุก measurement dim กรอกครบและ OK
        banner.style.display = 'block';
        banner.style.background = 'rgba(39,174,96,0.08)';
        banner.style.border = '1px solid rgba(39,174,96,0.3)';
        banner.style.color = 'var(--pass)';
        banner.innerHTML = `✅ <b>ข้อมูลครบ (${totalMeasure}/${totalMeasure})</b> — พร้อม Save Draft`;
    }

    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
    saveBtn.style.cursor = 'pointer';
}

// =========================================================================
// 🔒 OPERATOR ID VALIDATION — Regex: ^[A-Za-z0-9]*$ (ความยาวเท่าไรก็ได้ ไม่บังคับกรอก)
// =========================================================================
function validateOperatorId(input) {
    const val = input.value.toUpperCase();
    input.value = val; // auto-uppercase
    const hint = document.getElementById('m-op-hint');
    const regex = /^[A-Za-z0-9]*$/;
    if (val.length === 0) {
        // ยังไม่ได้กรอก — neutral (ไม่บังคับกรอก)
        input.style.borderColor = 'var(--border)';
        if (hint) { hint.style.color = 'var(--text3)'; hint.textContent = 'ตัวอักษรภาษาอังกฤษ และตัวเลขเท่านั้น (A-Z, 0-9) — ไม่บังคับกรอก'; }
    } else if (regex.test(val)) {
        // ✅ Valid
        input.style.borderColor = 'var(--pass)';
        input.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.15)';
        if (hint) { hint.style.color = 'var(--pass)'; hint.textContent = '✅ EN Number ถูกต้อง'; }
    } else {
        // ❌ Invalid
        input.style.borderColor = 'var(--fail)';
        input.style.boxShadow = '0 0 0 2px rgba(231,76,60,0.15)';
        if (hint) { hint.style.color = 'var(--fail)'; hint.textContent = '❌ EN Number ต้องเป็นตัวอักษร A-Z หรือตัวเลข 0-9 เท่านั้น ห้ามมีอักขระพิเศษ หรือภาษาไทย'; }
    }
}

// =========================================================================
// 🔒 OVEN NUMBER VALIDATION — Regex: ^\d+\/\d+$
// =========================================================================
function validateOvenNumber(input) {
    const val = input.value.trim();
    const hint = document.getElementById('m-oven-hint');
    const regex = /^\d+\/\d+$/;
    if (val.length === 0) {
        input.style.borderColor = 'var(--border)';
        input.style.boxShadow = '';
        if (hint) { hint.style.color = 'var(--text3)'; hint.textContent = 'รูปแบบ: ตัวเลข/ตัวเลข เช่น 5/1 หรือ 10/2'; }
    } else if (regex.test(val)) {
        input.style.borderColor = 'var(--pass)';
        input.style.boxShadow = '0 0 0 2px rgba(39,174,96,0.15)';
        if (hint) { hint.style.color = 'var(--pass)'; hint.textContent = '✅ Oven Number ถูกต้อง (รูปแบบ ' + val + ')'; }
    } else {
        input.style.borderColor = 'var(--fail)';
        input.style.boxShadow = '0 0 0 2px rgba(231,76,60,0.15)';
        if (hint) { hint.style.color = 'var(--fail)'; hint.textContent = '❌ รูปแบบไม่ถูกต้อง — ต้องเป็นตัวเลข/ตัวเลข เช่น 5/1, 10/2'; }
    }
}

function saveManual() {
    try {
        const mk = document.getElementById('m-model').value;
        if (!mk) return showToast('กรุณาเลือก Product', 'warn');

        const dType = document.getElementById('m-datatype').value || 'Buy off';

        const vals = {};
        PRODUCTS[mk].dims.forEach(d => {
            const id = getDimId(d); let val = null;
            if (isMulti(d)) {
                const el = document.getElementById(`avg-${id}`);
                val = el && el.textContent !== '—' ? parseFloat(el.textContent) : null;
            } else {
                const inp = document.getElementById(`val-${id}`);
                val = inp && inp.value !== '' ? parseFloat(inp.value) : null;
            }
            if (val !== null && !isNaN(val)) { vals[id] = val; }
        });

        const fix1 = document.getElementById('m-fix1').value;
        const buytime = document.getElementById('m-buytime').value || '00:00';
        const pt = document.getElementById('m-pt').value.trim();

        // ==========================================
        // [แก้ไข] Auto-fill & Overwrite Time M/C เสมอ
        // ==========================================
        const now = new Date();
        const currentTime = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');
        const mctimeInput = document.getElementById('m-mctime');
        if (mctimeInput) mctimeInput.value = currentTime; // อัปเดตในหน้าจอเผื่อไว้
        const mctime = currentTime; // นำไปบันทึกลงระบบทันที
        // ==========================================

        const date = document.getElementById('m-date').value || TODAY;
        const team = document.getElementById('m-team').value || 'A/Day';
        const op = document.getElementById('m-op').value || '';

        // ─── EN Number (Operator ID) Validation — ไม่บังคับกรอก, ถ้ากรอกต้องเป็น A-Z/0-9 เท่านั้น ─
        const opRegex = /^[A-Za-z0-9]*$/;
        if (!opRegex.test(op)) {
            showToast('❌ EN Number ต้องเป็นตัวอักษร/ตัวเลข ภาษาอังกฤษเท่านั้น (เช่น EN001)', 'error');
            const opEl = document.getElementById('m-op');
            if (opEl) { opEl.focus(); opEl.style.borderColor = 'var(--fail)'; }
            return;
        }
        // ─────────────────────────────────────────────────────────────────

        // ─── Oven Number Validation ───────────────────────────────────────
        const ovenInput = document.getElementById('m-oven');
        const ovenVal = ovenInput ? ovenInput.value.trim() : '';
        const ovenRegex = /^\d+\/\d+$/;
        if (!ovenVal || !ovenRegex.test(ovenVal)) {
            showToast('❌ Oven Number ไม่ถูกต้อง — ต้องเป็นรูปแบบ ตัวเลข/ตัวเลข เช่น 5/1 หรือ 10/2', 'error');
            if (ovenInput) { ovenInput.focus(); ovenInput.style.borderColor = 'var(--fail)'; ovenInput.style.boxShadow = '0 0 0 2px rgba(231,76,60,0.15)'; }
            return;
        }
        const oven = ovenVal;
        // ─────────────────────────────────────────────────────────────────

        // ─── Mandatory Fields: บังคับกรอก Fixture และ PT Number ──────────────
        if (!fix1 || fix1.trim() === '') {
            showToast('❌ กรุณาระบุ Fixture (บังคับกรอก)', 'error');
            document.getElementById('m-fix1').focus();
            return;
        }
        if (!pt || pt.trim() === '') {
            showToast('❌ กรุณาระบุ PT Number (บังคับกรอก)', 'error');
            document.getElementById('m-pt').focus();
            return;
        }
        // ─────────────────────────────────────────────────────────────────

        // ─── Double Confirmation: ตรวจสอบข้อมูลไม่ครบ / ค่าเกิน Spec ──────
        const internalStatus_preview = getInternalStatus(vals, mk, (typeof _formMemory !== "undefined" && _formMemory) ? _formMemory.dataType : "");
        const totalDims = PRODUCTS[mk].dims.length;
        const filledCount = Object.keys(vals).length;
        const isIncomplete = filledCount < totalDims;
        const isOutOfRange = internalStatus_preview === 'REJECT' || internalStatus_preview === 'ALERT';

        if (isIncomplete || isOutOfRange) {
            let warningLines = [];
            if (isIncomplete) warningLines.push(`⚠️ ข้อมูลไม่ครบ: กรอกแล้ว ${filledCount}/${totalDims} พารามิเตอร์ (จะบันทึกเป็น INCOMPLETE)`);
            if (internalStatus_preview === 'REJECT') warningLines.push(`❌ มีค่าที่เกิน USL/LSL (NG/REJECT) จำนวนหนึ่งรายการขึ้นไป`);
            else if (internalStatus_preview === 'ALERT') warningLines.push(`🟡 มีค่าที่เกิน UCL/LCL (ALERT) จำนวนหนึ่งรายการขึ้นไป`);

            const confirmMsg = warningLines.join('\n') +
                '\n\n─────────────────────────────\nข้อมูลบางรายการ ไม่ครบ หรือเกินมาตรฐาน\nต้องการบันทึกข้อมูลนี้ต่อไปหรือไม่?';

            if (!confirm(confirmMsg)) {
                showToast('ยกเลิกการบันทึก — กรุณาตรวจสอบข้อมูลก่อน', 'warn');
                return; // หยุดการบันทึก
            }
        }
        // ─────────────────────────────────────────────────────────────────

        const internalStatus = internalStatus_preview;

        const base = { dataType: dType, model: mk, modelLabel: PRODUCTS[mk].label, pt, oven, buytime, mctime, date, team, operator: op, status: internalStatus, values: vals };

        let upserted = 0;
        const fix1Rec = { ...base, id: 'LOCAL_' + Date.now(), fixture: fix1 };
        if (upsertSingleRecord(fix1Rec)) upserted++;

        saveDB();
        syncDataConsistency(true);
        populateDailyDateDropdown();
        updateDashboard();

        // ─── Persist to MySQL immediately on save ────────────────────────
        if (isBackendOnline) {
            const serverPayload = {
                model: mk,
                fixture: fix1,
                date,
                buytime,
                mctime,
                team,
                op,
                oven,
                pt,
                dataType: dType,
                status: internalStatus,
                values: vals
            };
            saveRecordToServer(serverPayload).then(result => {
                if (result && result.success && result.id) {
                    // Back-fill ด้วย real DB id เพื่อป้องกัน duplicate ตอน sync
                    const localRec = DB.records.find(r =>
                        r.fixture === fix1 && r.pt === pt && r.date === date && r.buytime === buytime
                    );
                    if (localRec) localRec.id = result.id;
                }
            });

            // ─── Auto-alert ถ้า NG หรือ ALERT ───────────────────────────
            if (internalStatus === 'REJECT' || internalStatus === 'ALERT') {
                const alertLevel = internalStatus === 'REJECT' ? 'ng' : 'alert';
                const alertMsg = `[${dType}] ${PRODUCTS[mk].label} | Fixture: ${fix1} | PT: ${pt} | Status: ${internalStatus}`;
                sendSystemAlert(alertLevel, alertMsg, {
                    product: mk,
                    fixture: fix1,
                    oven,
                    pt,
                    dataType: dType,
                    values: vals
                });
            }
        }
        // ────────────────────────────────────────────────────────────────

        // ===== FORM MEMORY: เก็บ snapshot ก่อน reset =====
        const _memVals = {};
        PRODUCTS[mk].dims.forEach(d => {
            const id = getDimId(d);
            if (isMulti(d)) {
                const inputs = document.querySelectorAll(`.mi-${id}`);
                const arr = Array.from(inputs).map(inp => inp.value);
                _memVals[id] = arr;
            } else {
                const inp = document.getElementById(`val-${id}`);
                _memVals[id] = inp ? inp.value : '';
            }
        });
        _formMemory = {
            model: mk,
            dataType: dType,
            fix1: document.getElementById('m-fix1').value,
            pt: document.getElementById('m-pt').value,
            oven: document.getElementById('m-oven').value,
            buytime: document.getElementById('m-buytime').value,
            mctime: document.getElementById('m-mctime').value, // เก็บค่าที่ overwrite ไปแล้ว
            date: document.getElementById('m-date').value,
            team: document.getElementById('m-team').value,
            op: document.getElementById('m-op').value,
            values: _memVals
        };
        updateMemoryIndicator();
        // =================================================

        showToast(upserted > 0 ? `✅ อัปเดตข้อมูลเดิมเรียบร้อย (${dType})` : `✅ บันทึกข้อมูลใหม่สำเร็จ (${dType})`, 'success');
        resetManual();

    } catch (error) {
        console.error("Save Manual Error:", error);
        showToast('❌ เกิดข้อผิดพลาดในการบันทึก: ' + error.message, 'error');
    }
}

function resetManual() {
    const mem = _formMemory;

    if (mem) {
        // ── A. Restore dataType dropdown first so model list populates correctly ──
        const dtEl = document.getElementById('m-datatype');
        if (dtEl && dtEl.value !== mem.dataType) {
            dtEl.value = mem.dataType;
            updateDynamicDropdowns('manual');
        }

        // ── B. Restore model ──────────────────────────────────────────────────────
        const mEl = document.getElementById('m-model');
        if (mEl) mEl.value = mem.model;

        // ── C. KEEP all header/identity fields intact ────────────────────────────
        //       Operator can continue measuring the next piece on the same machine
        //       without re-typing the header.
        document.getElementById('m-fix1').value = mem.fix1 || '';
        document.getElementById('m-pt').value = mem.pt || '';
        document.getElementById('m-oven').value = mem.oven || '';
        document.getElementById('m-buytime').value = mem.buytime || '';
        document.getElementById('m-mctime').value = mem.mctime || '';
        document.getElementById('m-date').value = mem.date || TODAY;
        document.getElementById('m-team').value = mem.team || 'A/Day';
        document.getElementById('m-op').value = mem.op || '';

        // ── D. Wipe measurement snapshot BEFORE renderManualForm() runs ──────────
        //       The restore-from-memory block inside renderManualForm() checks
        //       _formMemory.values — clearing it here means inputs stay blank.
        if (_formMemory && _formMemory.values) {
            _formMemory.values = {};
        }

        // ── E. Rebuild the measurement input DOM (fresh empty fields) ────────────
        renderManualForm();

        // ── F. Belt-and-suspenders: explicitly clear every measurement input ─────
        const dimContainer = document.getElementById('dim-container');
        if (dimContainer) {
            dimContainer.querySelectorAll('input.manual-field').forEach(inp => {
                inp.value = '';
                inp.style.borderColor = '';
                inp.style.boxShadow = '';
                inp.style.background = '';
                inp.style.color = '';
            });
            dimContainer.querySelectorAll('[id^="avg-"]').forEach(el => {
                el.textContent = '—';
                el.style.color = '';
            });
            dimContainer.querySelectorAll('[id^="hint-"]').forEach(el => {
                el.textContent = '';
                el.style.display = 'none';
                el.className = 'dim-hint';
            });
            dimContainer.querySelectorAll('.dim-card').forEach(card => {
                card.style.borderColor = '';
                card.className = 'dim-card';
            });
        }

        updateValidationBanner(mem.model);
        updateMemoryIndicator();

    } else {
        // No memory → full hard-reset (first use or after clearFormMemory)
        document.getElementById('m-fix1').value = '';
        document.getElementById('m-pt').value = '';
        document.getElementById('m-model').value = '';
        const ovenEl2 = document.getElementById('m-oven');
        if (ovenEl2) { ovenEl2.value = ''; ovenEl2.style.borderColor = ''; ovenEl2.style.boxShadow = ''; }
        document.getElementById('manual-form-body').innerHTML =
            '<div class="empty"><div class="ei">🔧</div><p>กรุณาเลือก Product ด้านบน</p></div>';
        document.getElementById('val-banner').style.display = 'none';
    }

    const btn = document.getElementById('btn-save-draft');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}

function commitImport() {
    const dTypeFallback = document.getElementById('auto-datatype').value || 'Buy off';
    let added = 0, skipped = 0, incompleteCount = 0;
    const snap = [...tempImport];
    const actualAddedRecords = [];

    snap.forEach(newRec => {
        newRec.dataType = newRec._detectedDataType || dTypeFallback;
        delete newRec._detectedDataType;

        // INCOMPLETE records from import must NEVER enter the WAITING pool.
        // They go into DB.records as INCOMPLETE — visible in About Data but excluded
        // from bulkTextMerge which strictly targets WAITING status only.

        const isDuplicate = DB.records.some(r =>
            r.model === newRec.model &&
            r.fixture === newRec.fixture &&
            r.date === newRec.date &&
            r.buytime === newRec.buytime &&
            (r.dataType || 'Buy off') === newRec.dataType
        );

        if (isDuplicate) {
            skipped++;
        } else {
            if (newRec.status === 'INCOMPLETE') incompleteCount++;
            DB.records.unshift(newRec);
            actualAddedRecords.push(newRec);
            added++;
        }
    });

    // เซฟและอัปเดตหน้าจอ
    saveDB();
    cancelImport();
    syncDataConsistency(true);
    populateDailyDateDropdown();

    // 3. สรุปผลการแจ้งเตือน (นับเฉพาะตัวที่เพิ่มสำเร็จ)
    const buyCount = actualAddedRecords.filter(r => r.dataType === 'Buy off').length;
    const rovCount = actualAddedRecords.filter(r => r.dataType === 'Roving Audit').length;

    let typeMsg = '';
    if (buyCount > 0 && rovCount > 0) typeMsg = ` (🟢 Buy off: ${buyCount}, 🔵 Roving: ${rovCount})`;
    else if (rovCount > 0) typeMsg = ` (🔵 Roving Audit: ${rovCount})`;
    else if (buyCount > 0) typeMsg = ` (🟢 Buy off: ${buyCount})`;

    let skipMsg = skipped > 0 ? ` [ข้ามซ้ำ ${skipped}]` : '';
    let incMsg = incompleteCount > 0 ? ` [❓ INCOMPLETE ${incompleteCount} รายการ]` : '';

    let hasOutliers = actualAddedRecords.some(r => r.status === 'REJECT' || r.status === 'ALERT' || r.status === 'INCOMPLETE');

    // แจ้งเตือนผู้ใช้งานตามผลลัพธ์
    if (added === 0 && skipped > 0) {
        showToast(`ℹ️ ไม่มีข้อมูลใหม่ถูกเพิ่ม (เป็นข้อมูลซ้ำทั้งหมด ${skipped} รายการ)`, 'info', 5000);
    } else if (hasOutliers) {
        showToast(`⚠️ นำเข้าใหม่ ${added} รายการ${typeMsg}${skipMsg}${incMsg} พบค่าผิดปกติ! กำลังวิเคราะห์...`, 'warn', 5000);
        switchTab('alerts', _navBtn('alerts'));
        setTimeout(() => { generateOutlookDraft(); sendAutoAlertViaPython(); }, 1500);
    } else {
        showToast(`✅ นำเข้าข้อมูลใหม่ ${added} รายการสำเร็จ${typeMsg}${skipMsg}${incMsg}`, 'success', 5000);
    }
}

function cancelImport() { document.getElementById('auto-drop-area').style.display = 'block'; document.getElementById('auto-preview-area').style.display = 'none'; tempImport = []; }

function renderAutoTable() {
    const tbody = document.getElementById('auto-tbody');
    const thead = document.getElementById('auto-thead-dynamic');
    const search = (document.getElementById('auto-search') || {}).value || '';
    const typeF = (document.getElementById('auto-type-filter') || {}).value || '';
    const mf = (document.getElementById('auto-model-filter') || {}).value || '';
    const tf = (document.getElementById('auto-team-filter') || {}).value || '';

    thead.innerHTML = `<tr><th>Status</th><th>Type</th><th>Time</th><th>PT Name</th><th>Product</th><th>Fixture</th><th>Oven</th><th>Time M/C</th><th>Date</th><th>Team</th><th>Detail</th></tr>`;

    let rows = DB.records.filter(r => {
        // Search includes oven name
        const txt = `${r.fixture}${r.pt}${r.modelLabel}${r.date}${r.oven || ''}`.toLowerCase();
        return txt.includes(search.toLowerCase()) &&
            (!mf || r.model === mf) &&
            (!tf || r.team === tf) &&
            (!typeF || (r.dataType || 'Buy off') === typeF);
    });

    document.getElementById('auto-count').textContent = `แสดง ${Math.min(rows.length, 100)} จาก ${DB.records.length} รายการ`;

    tbody.innerHTML = rows.slice(0, 100).map(r => {
        return `<tr id="row-${r.id}">
        <td>${statusBadge(r.status)}</td>
        <td>${typeBadge(r.dataType || 'Buy off')}</td>
        <td class="mono">${valToDisplay(r.buytime)}</td>
        <td><span style="font-weight:700;color:var(--blue);font-size:13px;">${valToDisplay(r.pt)}</span></td>
        <td><span style="font-weight:700">${r.modelLabel || r.model}</span></td>
        <td class="mono" style="font-weight:700;">${valToDisplay(r.fixture)}</td>
        <td class="mono" style="color:var(--warn);font-weight:700;">${valToDisplay(r.oven || '—')}</td>
        <td class="mono">${valToDisplay(r.mctime)}</td>
        <td class="mono">${formatCustomDate(r.date)}</td>
        <td><span style="font-weight:600;color:var(--${r.team === 'A' ? 'blue' : 'purple'})">${valToDisplay(r.team)}</span></td>
        <td><button class="btn btn-outline btn-sm" onclick="showDetail('${r.id}')">🔍</button></td>
      </tr>`;
    }).join('');
}

let _aboutSort = { col: 'date', dir: 'desc' };

function _sortAbout(col) {
    if (_aboutSort.col === col) { _aboutSort.dir = _aboutSort.dir === 'asc' ? 'desc' : 'asc'; }
    else { _aboutSort.col = col; _aboutSort.dir = 'asc'; }
    renderAboutTable();
}

function _sortArrow(col) {
    if (_aboutSort.col !== col) return '<span style="opacity:0.4;font-size:10px;margin-left:4px">⇅</span>';
    return _aboutSort.dir === 'asc'
        ? '<span style="color:#0984E3;font-size:11px;margin-left:4px">▲</span>'
        : '<span style="color:#0984E3;font-size:11px;margin-left:4px">▼</span>';
}

// ── renderAboutTable: โผล่ loader เฉพาะตอนที่ใช้เวลานานเกิน threshold ──
// ถ้า render เสร็จเร็ว ผู้ใช้จะไม่เห็น loader เลย
function renderAboutTable() {
    if (window.BLoader) window.BLoader.showIfSlow('กำลังโหลดตารางข้อมูล');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            _renderAboutTableCore();
            if (window.BLoader) window.BLoader.hideIfSlow();
        });
    });
    window._manualRenderAbout = false;
}

function _renderAboutTableCore() {
    try {
        const thead = document.getElementById('about-thead');
        const tbody = document.getElementById('about-tbody');
        if (!tbody || !thead) return;

        // 1. สร้าง Header ใหม่พร้อมรองรับการกดเรียงลำดับคอลัมน์ (Sorting)
        thead.innerHTML = `
        <tr style="background:var(--bg2);color:var(--text3);font-size:12px;text-align:left;">
            <th style="padding:10px;width:40px"><input type="checkbox" id="selectAllAbout" onclick="toggleAllAboutChk(this)"></th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('dataType')">TYPE ${_sortArrow('dataType')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('status')">STATUS ${_sortArrow('status')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('buytime')">TIME BUY OFF ${_sortArrow('buytime')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('pt')">PT NAME ${_sortArrow('pt')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('model')">PRODUCT ${_sortArrow('model')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('fixture')">FIXTURE ${_sortArrow('fixture')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('oven')">OVEN ${_sortArrow('oven')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('mctime')">TIME M/C ${_sortArrow('mctime')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('date')">DATE ${_sortArrow('date')}</th>
            <th style="padding:10px;cursor:pointer;user-select:none;" onclick="_sortAbout('team')">TEAM ${_sortArrow('team')}</th>
            <th style="padding:10px;text-align:left;">MEASUREMENT DATA</th>
            <th style="padding:10px;text-align:right">ACTIONS</th>
        </tr>`;

        const search = (document.getElementById('about-search') || {}).value || '';
        const typeF = (document.getElementById('about-type-filter') || {}).value || '';
        const mf = (document.getElementById('about-model-filter') || {}).value || '';
        const sf = (document.getElementById('about-status-filter') || {}).value || '';

        // 2. กรองข้อมูลจากฐานข้อมูลหลัก
        let rows = DB.records.filter(r => {
            if (r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING') return false; // Hide pending drafts from About Data
            const txt = `${r.fixture || ''}${r.pt || ''}${r.modelLabel || ''}${r.date || ''}${r.team || ''}${r.oven || ''}`.toLowerCase();
            return txt.includes(search.toLowerCase()) &&
                (!mf || r.model === mf) &&
                (!sf || r.status === sf) &&
                (!typeF || (r.dataType || 'Buy off') === typeF);
        });

        // 3. เรียงข้อมูลตามคอลัมน์และทิศทางที่กำหนด (Sorting Logic)
        const col = _aboutSort.col;
        const dir = _aboutSort.dir === 'asc' ? 1 : -1;

        rows.sort((a, b) => {
            let valA = '';
            let valB = '';

            if (col === 'date') {
                let timeA = a.mctime || a.buytime || '00:00';
                let timeB = b.mctime || b.buytime || '00:00';
                if (!/^\d{2}:\d{2}$/.test(timeA)) timeA = '00:00';
                if (!/^\d{2}:\d{2}$/.test(timeB)) timeB = '00:00';
                valA = new Date(`${a.date || '2000-01-01'}T${timeA}:00`).getTime() || 0;
                valB = new Date(`${b.date || '2000-01-01'}T${timeB}:00`).getTime() || 0;
            } else if (col === 'status') {
                valA = a.status || '';
                valB = b.status || '';
            } else if (col === 'pt') {
                valA = a.pt || '';
                valB = b.pt || '';
            } else if (col === 'oven') {
                valA = a.oven || '';
                valB = b.oven || '';
            } else if (col === 'fixture') {
                valA = a.fixture || '';
                valB = b.fixture || '';
            } else if (col === 'model') {
                valA = a.modelLabel || a.model || '';
                valB = b.modelLabel || b.model || '';
            } else if (col === 'operator') {
                valA = a.operator || '';
                valB = b.operator || '';
            } else if (col === 'dataType') {
                valA = a.dataType || 'Buy off';
                valB = b.dataType || 'Buy off';
            } else if (col === 'buytime') {
                valA = a.buytime || '';
                valB = b.buytime || '';
            } else if (col === 'mctime') {
                valA = a.mctime || '';
                valB = b.mctime || '';
            } else if (col === 'team') {
                valA = a.team || '';
                valB = b.team || '';
            } else {
                valA = a.id;
                valB = b.id;
            }

            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        const countEl = document.getElementById('about-count');
        if (countEl) countEl.textContent = `แสดงทั้งหมด ${rows.length} จาก ${DB.records.length} รายการ`;

        // 4. กรณีไม่มีข้อมูล
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--text3)">📭 ไม่พบข้อมูล (ลองตรวจสอบ Filter หรือช่องค้นหาดูนะครับ)</td></tr>`;
            return;
        }

        const renderRow = (r) => {
            const status = r.status || 'INCOMPLETE';
            const rowBg = status === 'WAITING' ? 'rgba(9,132,227,0.05)' : status === 'INCOMPLETE' ? 'rgba(155,89,182,0.05)' : 'transparent';

            // Extract measurement data like in import preview
            const tdVals = Object.entries(r.values || {})
                .filter(([k, v]) => v !== undefined && v !== null && v !== '' && v !== '-')
                .map(([k, v]) => `<span style="white-space:nowrap;">${k.replace(/_/g, ' ')}: <b style="color:var(--text)">${typeof v === 'number' ? v.toFixed(4) : v}</b></span>`)
                .join(' <span style="color:var(--border2)">|</span> ');

            return `<tr style="border-bottom:1px solid var(--border2);background:${rowBg}">
                <td style="padding:10px;"><input type="checkbox" class="about-row-chk" value="${r.id}"></td>
                <td style="padding:10px;">${typeBadge(r.dataType || 'Buy off')}</td>
                <td style="padding:10px;">${statusBadge(status)}</td>
                <td style="padding:10px;" class="mono">${r.buytime || '—'}</td>
                <td style="padding:10px;font-weight:600;color:#0984e3;" class="mono">${r.pt || '—'}</td>
                <td style="padding:10px;font-weight:500;">${r.modelLabel || r.model || '—'}</td>
                <td style="padding:10px;" class="mono"><b>${r.fixture || '—'}</b></td>
                <td style="padding:10px;color:var(--warn);font-weight:700;">${r.oven || '—'}</td>
                <td style="padding:10px;" class="mono">${r.mctime || '—'}</td>
                <td style="padding:10px;" class="mono">${formatCustomDate(r.date)}</td>
                <td style="padding:10px;">${r.team || '—'}</td>
                <td style="padding:10px;font-size:10.5px;color:var(--text2);max-width:350px;white-space:normal;line-height:1.5;">${tdVals || '—'}</td>
                <td style="padding:10px;text-align:right;">
                    <div style="display:flex; gap:6px; justify-content:flex-end;">
                        <button class="btn btn-outline btn-sm" onclick="showDetail('${r.id}')" title="ดูรายละเอียด" style="padding:2px 8px;font-size:11px;">🔍</button>
                        <button class="btn btn-outline btn-sm" onclick="openEditModal('${r.id}')" title="แก้ไข" style="padding:2px 8px;font-size:11px;">✏️</button>
                        <button class="btn btn-outline btn-sm" onclick="deleteRecord('${r.id}')" title="ลบ" style="padding:2px 8px;font-size:11px;color:var(--fail)">🗑️</button>
                    </div>
                </td>
            </tr>`;
        };

        tbody.innerHTML = '';
        if (rows.length > 120) {
            window.BLoader?.renderInChunks(rows, row => tbody.insertAdjacentHTML('beforeend', renderRow(row)), 80, () => {
                window.BLoader?.hideIfSlow();
            });
        } else {
            tbody.innerHTML = rows.map(renderRow).join('');
            window.BLoader?.hideIfSlow();
        }

    } catch (err) {
        console.error("Render About Table Error:", err);
        const tbody = document.getElementById('about-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="color:red;text-align:center;padding:20px;">⚠️ ระบบมีปัญหาในการแสดงผล: ${err.message}</td></tr>`;
    }
}

function toggleAllAboutChk(master) { document.querySelectorAll('.about-row-chk').forEach(c => c.checked = master.checked); }
async function deleteSelectedAbout() {
    const ids = Array.from(document.querySelectorAll('.about-row-chk:checked')).map(c => c.value);
    if (!ids.length) return showToast('กรุณาเลือกรายการในตารางก่อน', 'warn');
    if (!confirm(`⚠️ ยืนยันการลบข้อมูลจำนวน ${ids.length} รายการที่เลือก? (ไม่สามารถกู้คืนได้)`)) return;

    try {
        if (isBackendOnline) {
            // ยิง API ไปลบข้อมูลที่ Server ทีเดียวแบบ Bulk
            const res = await fetch(`${API_BASE}/api/dispensing/records/delete-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: ids })
            });
            if (!res.ok) throw new Error('Failed to bulk delete on server');
        }

        // ลบออกจากหน่วยความจำในหน้าเว็บ
        DB.records = DB.records.filter(r => !ids.includes(r.id.toString()));
        saveDB();
        syncDataConsistency(true);
        updateDashboard();

        const masterChk = document.getElementById('selectAllAbout') || document.getElementById('about-chk-all');
        if (masterChk) masterChk.checked = false;

        showToast(`ลบข้อมูลจำนวน ${ids.length} รายการเรียบร้อย`, 'success');
        renderAboutTable();
    } catch (err) {
        console.error("Delete Selected Error:", err);
        showToast('เกิดข้อผิดพลาดในการลบข้อมูลที่เซิร์ฟเวอร์', 'error');
    }
}

async function deleteRecord(id) {
    if (!confirm('⚠️ ยืนยันการลบข้อมูลนี้? (ไม่สามารถกู้คืนได้)')) return;

    try {
        if (isBackendOnline) {
            const res = await fetch(`${API_BASE}/api/dispensing/records/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete on server');
        }

        DB.records = DB.records.filter(r => r.id.toString() !== id.toString());
        saveDB();
        syncDataConsistency(true);
        updateDashboard();
        showToast('ลบข้อมูลเรียบร้อย', 'success');
        renderAboutTable();
    } catch (err) {
        console.error("Delete Record Error:", err);
        showToast('เกิดข้อผิดพลาดในการลบข้อมูลที่เซิร์ฟเวอร์', 'error');
    }
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
            const stdHeaders = ['Status', 'Data Type', 'Time Buy Off', 'PT', 'PT NAME', 'Product', 'Fixture', 'Time M/C', 'Date', 'Team', 'Operator', 'Oven'];
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
                    id: 'LOCAL_' + Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
                    status: getVal('Status') || 'WAITING',
                    dataType: getVal('Data Type') || 'Buy off',
                    buytime: getVal('Time Buy Off') || '',
                    pt: getVal('PT') || getVal('PT NAME') || '',
                    model: modelKey,
                    modelLabel: PRODUCTS[modelKey] ? PRODUCTS[modelKey].label : pLabel,
                    fixture: getVal('Fixture') || '',
                    mctime: getVal('Time M/C') || '',
                    date: dateVal,
                    team: getVal('Team') || '',
                    operator: getVal('Operator') || '',
                    oven: getVal('Oven') || '',
                    values: {}
                };
                headers.forEach((h, colIdx) => {
                    if (!stdHeaders.includes(h)) {
                        const val = row[colIdx];
                        if (val !== '' && val !== '-') rec.values[h] = val;
                    }
                });
                DB.records.push(rec);
                importedCount++;
            }
        } catch (err) { console.error('Error importing file:', file.name, err); }
    }
    event.target.value = '';
    if (importedCount > 0) {
        saveDB();
        syncDataConsistency(false); // Don't sync yet
        updateDashboard();

        if (window.BLoader) window.BLoader.show('กำลังซิงค์ข้อมูล...');
        if (typeof syncWithServer === 'function') await syncWithServer(true);
        if (typeof renderAboutTable === 'function') renderAboutTable();
        if (window.BLoader) window.BLoader.hide();

        showToast(`นำเข้าข้อมูล ${importedCount} รายการ และบันทึกเข้าฐานข้อมูลเรียบร้อย`, 'success');
    } else { showToast('ไม่พบข้อมูลที่จะนำเข้า (รูปแบบไฟล์ไม่ถูกต้อง หรือไม่มีข้อมูล)', 'warn'); }
}


function showDetail(id) {
    const rec = DB.records.find(r => r.id.toString() === id.toString()); if (!rec) return;
    let html = `<div style="margin-bottom:16px"><div class="detail-row" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)"><div class="detail-item"><div class="dlbl">Product</div><div class="dval">${rec.modelLabel}</div></div><div class="detail-item"><div class="dlbl">Fixture</div><div class="dval">${rec.fixture}</div></div><div class="detail-item"><div class="dlbl">PT Machine</div><div class="dval">${rec.pt}</div></div><div class="detail-item"><div class="dlbl">Oven</div><div class="dval" style="color:var(--warn);font-weight:700;">${rec.oven || '—'}</div></div><div class="detail-item"><div class="dlbl">Date</div><div class="dval">${rec.date}</div></div><div class="detail-item"><div class="dlbl">Status</div><div class="dval">${statusBadge(rec.status)}</div></div></div><div style="font-size:11px;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:10px">MEASUREMENT VALUES (Null/Empty แสดงเป็น -)</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">`;
    if (rec.values) {
        const allVals = Object.entries(rec.values);
        if (!allVals.length) { html += '<p style="color:var(--text3);font-size:13px">ไม่มีข้อมูลการวัด</p>'; }
        else allVals.forEach(([k, v]) => {
            const cfg = getActiveSpec(rec.model, k, rec.dataType); let sStyle = '', sLabel = ''; const displayVal = valToDisplay(v);

            // Check if value is numeric even if it comes as a string from DB
            const isNumeric = v !== '' && v !== null && v !== undefined && !isNaN(parseFloat(v)) && isFinite(v);
            const parsedV = isNumeric ? parseFloat(v) : v;

            if (v === undefined || v === null || v === '-' || v === '') {
                sStyle = 'color:var(--purple)'; sLabel = '❓ ขาดข้อมูล';
            } else if (isNumeric) {
                if (cfg) {
                    const status = checkValAgainstSpec(parsedV, cfg);
                    if (status === 'critical') { sStyle = 'color:var(--fail)'; sLabel = '🔴 NG'; }
                    else if (status === 'warn') { sStyle = 'color:var(--warn)'; sLabel = '🟡 Alert'; }
                    else { sStyle = 'color:var(--pass)'; sLabel = '🟢 OK'; }
                } else {
                    sStyle = 'color:var(--text1)'; sLabel = ''; // No config, just show number
                }
            } else if (typeof v === 'string') {
                const lowerV = v.toLowerCase();
                if (lowerV.includes('accept') || lowerV === 'ok' || lowerV.includes('pass')) {
                    sStyle = 'color:var(--pass)'; sLabel = '🟢 OK';
                } else if (lowerV.includes('reject') || lowerV === 'ng' || lowerV.includes('fail')) {
                    sStyle = 'color:var(--fail)'; sLabel = '🔴 NG';
                } else {
                    sStyle = 'color:var(--text1)'; sLabel = ''; // Don't show 'Text' icon
                }
            }
            html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:8px"><div style="font-size:10px;color:var(--text3);margin-bottom:3px;font-weight:600">${k.replace(/_/g, ' ')}</div><div style="font-family:'Calibri','Candara','Segoe UI',sans-serif;font-size:14px;font-weight:700;${sStyle}">${displayVal} <span style="font-size:10px">${sLabel}</span></div></div>`;
        });
    }
    html += '</div></div>'; document.getElementById('detail-modal-body').innerHTML = html; document.getElementById('detail-modal').classList.add('open');
}

function exportRecords() {
    const productFilter = document.getElementById('about-model-filter').value;
    let recordsToExport = DB.records;
    let exportFileName = 'All_Products_IPQC_Data.xlsx';

    if (productFilter && PRODUCTS[productFilter]) {
        recordsToExport = DB.records.filter(r => r.model === productFilter);
        exportFileName = `${PRODUCTS[productFilter].label.replace(/\s+/g, '_')}_IPQC_Data.xlsx`;
    }

    if (!recordsToExport.length) return showToast('ไม่มีข้อมูล', 'warn');

    const dynamicKeys = new Set();
    recordsToExport.forEach(r => {
        if (r.values) Object.keys(r.values).forEach(k => {
            if (r.values[k] !== null && r.values[k] !== undefined) dynamicKeys.add(k);
        });
    });

    const dynHeaders = [...dynamicKeys];
    const h = ['Status', 'Data Type', 'Time Buy Off', 'PT', 'Product', 'Fixture', 'Time M/C', 'Date', 'Team', 'Operator', 'Oven', ...dynHeaders];

    const rows = [h, ...recordsToExport.map(r => {
        const row = [r.status || '', r.dataType || 'Buy off', r.buytime, r.pt, r.modelLabel, r.fixture, r.mctime, r.date, r.team, r.operator, r.oven || ''];
        dynHeaders.forEach(k => {
            let val = '-';
            if (r.values && r.values[k] !== undefined && r.values[k] !== null && r.values[k] !== '') {
                val = r.values[k];
                // Convert to number if possible for better Excel formatting
                if (!isNaN(val) && val !== '') val = Number(val);
            }
            row.push(val);
        });
        return row;
    })];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IPQC_Data");
    XLSX.writeFile(wb, exportFileName);
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('open');
        el.style.display = 'none';
    }
    editId = null;
}
function openEditModal(id) {
    const rec = DB.records.find(r => r.id.toString() === id.toString()); if (!rec) return;
    editId = rec.id;
    document.getElementById('e-datatype').value = rec.dataType || 'Buy off';
    document.getElementById('e-buytime').value = rec.buytime || '';
    document.getElementById('e-pt').value = rec.pt || '';
    document.getElementById('e-model').value = rec.model || '';
    document.getElementById('e-fixture').value = rec.fixture || '';
    document.getElementById('e-mctime').value = rec.mctime || '';
    document.getElementById('e-date').value = rec.date || '';
    document.getElementById('e-team').value = rec.team || '';
    const valSection = document.getElementById('e-values-section');
    if (valSection && rec.values && PRODUCTS[rec.model]) {
        const dims = PRODUCTS[rec.model].dims.map(d => getDimId(d));
        const cfg = DB.configs[rec.model] || {};
        let html = '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)"><div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">📐 ค่าวัด (Measurement Values)</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">';
        const extraDims = ['VMI', 'Coil_height', 'Hi_pot'];
        const allDims = [...dims, ...extraDims];

        allDims.forEach(key => {
            const v = rec.values[key]; const c = cfg[key] || {};
            const specStr = (key === 'VMI' || key === 'Coil_height' || key === 'Hi_pot') ? 'PASS/FAIL' : `LSL:${c.lsl ?? '-'} USL:${c.usl ?? '-'}`;
            const curVal = (v !== undefined && v !== null && v !== '') ? v : '';
            const inputType = (key === 'VMI' || key === 'Coil_height' || key === 'Hi_pot') ? 'text' : 'number';
            const stepHtml = inputType === 'number' ? 'step="0.0001"' : '';
            html += `<div class="form-group"><label style="display:flex;justify-content:space-between">${key.replace(/_/g, ' ')}<span style="font-size:9px;font-family:'Calibri','Candara','Segoe UI',sans-serif;color:var(--text3)">${specStr}</span></label><input type="${inputType}" ${stepHtml} id="ev-${key}" class="form-input" value="${curVal}" placeholder="—"></div>`;
        });
        html += '</div></div>';
        valSection.innerHTML = html;
    } else if (valSection) { valSection.innerHTML = ''; }
    document.getElementById('edit-modal').classList.add('open');
}

function saveEdit() {
    if (!editId) return;
    const idx = DB.records.findIndex(r => r.id.toString() === editId.toString()); if (idx === -1) return;
    const rec = DB.records[idx];
    rec.dataType = document.getElementById('e-datatype').value;
    rec.buytime = document.getElementById('e-buytime').value;
    rec.pt = document.getElementById('e-pt').value;
    rec.model = document.getElementById('e-model').value;
    rec.modelLabel = PRODUCTS[rec.model] ? PRODUCTS[rec.model].label : rec.model;
    rec.fixture = document.getElementById('e-fixture').value;
    rec.mctime = document.getElementById('e-mctime').value;
    rec.date = document.getElementById('e-date').value;
    rec.team = document.getElementById('e-team').value;
    if (rec.values && PRODUCTS[rec.model]) {
        const dims = PRODUCTS[rec.model].dims.map(d => getDimId(d));
        const extraDims = ['VMI', 'Coil_height', 'Hi_pot'];
        const allDims = [...dims, ...extraDims];

        allDims.forEach(key => {
            const inp = document.getElementById(`ev-${key}`);
            if (inp) {
                const raw = inp.value.trim();
                if (raw === '' || raw === undefined) rec.values[key] = null;
                else {
                    if (key === 'VMI' || key === 'Coil_height' || key === 'Hi_pot') {
                        rec.values[key] = raw.toUpperCase(); // Save as text PASS/FAIL
                    } else {
                        const n = parseFloat(raw); rec.values[key] = isNaN(n) ? raw : n;
                    }
                }
            }
        });
    }
    rec.status = getInternalStatus(rec.values, rec.model, rec.dataType);
    saveDB(); syncDataConsistency(true);

    // Sync to backend immediately
    if (typeof isBackendOnline !== 'undefined' && isBackendOnline) {
        try {
            fetch(`${API_BASE}/api/dispensing/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db_data: { records: [rec] } })
            });
        } catch (e) { console.error('Sync Edit Error:', e); }
    }

    showToast('✅ แก้ไขข้อมูลเรียบร้อย', 'success'); closeModal('edit-modal');
    checkRealtimeAlertAndNotify(rec); // 📢 Trigger automatic real-time Outlook email with complete graph
    renderAboutTable();
}

function openInsertModal() { document.getElementById('insert-modal').classList.add('open'); }
async function insertRecord() { const mk = document.getElementById('i-model').value; if (!mk) return showToast('กรุณาเลือก Product', 'warn'); const draftId = 'DRAFT_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); const rec = { id: draftId, dataType: 'Buy off', model: mk, modelLabel: PRODUCTS[mk].label, buytime: document.getElementById('i-buytime').value || '00:00', pt: document.getElementById('i-pt').value || 'Unknown', fixture: document.getElementById('i-fixture').value || 'FIX-NEW', mctime: document.getElementById('i-mctime').value || '00:00', date: document.getElementById('i-date').value || TODAY, team: document.getElementById('i-team').value || 'A', operator: document.getElementById('i-op').value || 'ADMIN', values: { draft_id: draftId }, status: 'INCOMPLETE' }; DB.records.unshift(rec); saveDB(); if (window.BLoader) window.BLoader.show('กำลังซิงค์ข้อมูล...'); if (isBackendOnline) { await syncWithServer(false); } else { syncDataConsistency(false); } if (window.BLoader) window.BLoader.hide(); showToast('✅ เพิ่มข้อมูลใหม่เรียบร้อย (ข้อมูลเป็น INCOMPLETE)', 'success'); closeModal('insert-modal'); renderAboutTable(); }

// ==========================================
// ส่วนที่ปรับปรุง Daily Date Range (ช่วงวันที่)
// ==========================================
function populateDailyDateDropdown() {
    const mk = document.getElementById('daily-model') ? document.getElementById('daily-model').value : '';

    // ดึงวันที่จาก DB
    const dates = [...new Set(
        DB.records.filter(r => (!mk || r.model === mk) && r.date).map(r => toISO(r.date)).filter(Boolean)
    )].sort();

    // ตั้งค่าเริ่มต้นเฉพาะครั้งแรก (ยังไม่มี startDate/endDate)
    const startEl = document.getElementById('daily-start');
    const endEl = document.getElementById('daily-end');
    if (!startEl || !endEl) return;

    if (!window.startDate) {
        window.startDate = dates.length ? dates[0] : TODAY;
        startEl.value = window.startDate;
    }
    if (!window.endDate) {
        window.endDate = dates.length ? dates[dates.length - 1] : TODAY;
        endEl.value = window.endDate;
    }

    // อัปเดต count label เท่านั้น — ไม่แตะ input value
    const cnt = document.getElementById('daily-date-count');
    if (cnt) {
        const n = dates.filter(d => d >= window.startDate && d <= window.endDate).length; // dates already ISO
        cnt.textContent = n > 0 ? `(${n} วันที่มีข้อมูล)` : '(ไม่มีข้อมูลในช่วงนี้)';
    }

    if (typeof updateDailyModelDropdown === 'function') {
        updateDailyModelDropdown();
    }
}

function updateDailyModelDropdown() {
    const el = document.getElementById('daily-model');
    if (!el) return;

    // ถ้ายังไม่ได้เลือก Date ให้เป็นค่าว่าง
    if (!window.startDate || !window.endDate) {
        el.innerHTML = '<option value="">— เลือก Date Range ก่อน —</option>';
        el.disabled = true;
        return;
    }

    // บังคับให้ต้องเลือก Data Type ก่อน (ไม่ใช่ all)
    if (!activeDailyTypeFilter || activeDailyTypeFilter === 'all') {
        el.innerHTML = '<option value="">— เลือก Data Type ก่อน —</option>';
        el.disabled = true;
        return;
    }

    el.disabled = false;

    // กรองข้อมูลตาม Date และ DataType
    let rows = DB.records.filter(r => isInDateRange(r.date, window.startDate, window.endDate));
    rows = rows.filter(r => (r.dataType || 'Buy off') === activeDailyTypeFilter);

    // หา Product ที่มีข้อมูลจริง
    const availableModels = [...new Set(rows.map(r => r.model).filter(Boolean))];
    const currVal = el.value;

    if (availableModels.length === 0) {
        el.innerHTML = '<option value="">— ไม่มีข้อมูล —</option>';
    } else {
        let html = '<option value="">— เลือก Product —</option>';
        availableModels.sort().forEach(mk => {
            const lbl = PRODUCTS[mk] ? PRODUCTS[mk].label : mk;
            html += `<option value="${mk}">${lbl}</option>`;
        });
        el.innerHTML = html;
        if (availableModels.includes(currVal)) {
            el.value = currVal;
        } else {
            el.value = '';
        }
    }
}

function handleDailyDateChange() {
    // เก็บค่าวันที่ไว้ใน window แต่ไม่ render ทันที
    // ผู้ใช้ต้องกดปุ่ม "🔍 แสดงผล" เพื่อ render
    const startEl = document.getElementById('daily-start');
    const endEl = document.getElementById('daily-end');
    if (!startEl || !endEl) return;
    let s = startEl.value || TODAY;
    let e = endEl.value || TODAY;
    if (s > e) { [s, e] = [e, s]; startEl.value = s; endEl.value = e; }
    window.startDate = s;
    window.endDate = e;
    populateDailyDateDropdown(); // อัปเดต label count เท่านั้น
    updateDailyModelDropdown();
}

function applyDailyFilter() {
    const startEl = document.getElementById('daily-start');
    const endEl = document.getElementById('daily-end');
    if (!startEl || !endEl) return;
    let s = startEl.value;
    let e = endEl.value;
    if (!s || !e) {
        showToast('กรุณาเลือก Date Range ก่อนกดแสดงผล', 'warn');
        return;
    }
    if (s > e) { [s, e] = [e, s]; startEl.value = s; endEl.value = e; }
    window.startDate = s;
    window.endDate = e;
    // reset PT filter
    activePTFilter = 'all';
    const lbl = document.getElementById('pt-dropdown-label');
    if (lbl) lbl.textContent = '🔘 ALL PT';
    populateDailyDateDropdown();
    renderDailyCompare();
    const tf = document.getElementById('v-time-filter');
    if (tf && tf.value === 'selected_date') drawSPCChart();
}

function onDailyModelChange() {
    // เปลี่ยน product → reset PT filter แต่ไม่ auto-render (รอกดปุ่ม)
    activePTFilter = 'all';
    const lbl = document.getElementById('pt-dropdown-label');
    if (lbl) lbl.textContent = '🔘 ALL PT (ทั้งหมด)';
    populateDailyDateDropdown();
    // ถ้ามีข้อมูลแสดงผลอยู่แล้ว ให้ re-render ด้วย product ใหม่
    if (window.startDate && window.endDate) renderDailyCompare();
}

function togglePTTag(el) { activePTFilter = el.dataset.pt; document.querySelectorAll('.pt-tag').forEach(t => t.classList.remove('active')); el.classList.add('active'); if (window.startDate && window.endDate) renderDailyCompare(); }

// ============================================================
// PT Searchable Dropdown — ฟังก์ชันที่จำเป็นสำหรับ Daily Compare
// ============================================================
function togglePTDropdown() {
    const panel = document.getElementById('pt-dropdown-panel');
    const caret = document.getElementById('pt-caret');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (caret) caret.style.transform = isOpen ? '' : 'rotate(180deg)';
    if (!isOpen) {
        const inp = document.getElementById('pt-search-input');
        if (inp) { inp.value = ''; filterPTList(); inp.focus(); }
    }
}

function _rebuildPTOptionList(pts) {
    const list = document.getElementById('pt-option-list');
    if (!list) return;
    let html = `<div class="pt-opt" onclick="selectPTOption('all')">🔘 ALL PT (ทั้งหมด)</div>`;
    pts.forEach(pt => {
        const active = pt === activePTFilter ? 'style="background:var(--bg4);font-weight:700;"' : '';
        html += `<div class="pt-opt" onclick="selectPTOption('${pt}')" ${active}>${pt}</div>`;
    });
    list._allPTs = pts;
    list.innerHTML = html;
}

function filterPTList() {
    const inp = document.getElementById('pt-search-input');
    const list = document.getElementById('pt-option-list');
    if (!inp || !list) return;
    const q = inp.value.toLowerCase();
    const pts = (list._allPTs || []).filter(p => p.toLowerCase().includes(q));
    let html = `<div class="pt-opt" onclick="selectPTOption('all')">🔘 ALL PT (ทั้งหมด)</div>`;
    pts.forEach(pt => {
        const active = pt === activePTFilter ? 'style="background:var(--bg4);font-weight:700;"' : '';
        html += `<div class="pt-opt" onclick="selectPTOption('${pt}')" ${active}>${pt}</div>`;
    });
    list.innerHTML = html;
}

function selectPTOption(pt) {
    activePTFilter = pt;
    const lbl = document.getElementById('pt-dropdown-label');
    if (lbl) lbl.textContent = pt === 'all' ? '🔘 ALL PT' : `⚙️ ${pt}`;
    const panel = document.getElementById('pt-dropdown-panel');
    const caret = document.getElementById('pt-caret');
    if (panel) panel.style.display = 'none';
    if (caret) caret.style.transform = '';
    if (window.startDate && window.endDate) renderDailyCompare();
}

// ปิด PT Dropdown เมื่อคลิกนอก
document.addEventListener('click', function (e) {
    const wrap = document.getElementById('pt-dropdown-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const panel = document.getElementById('pt-dropdown-panel');
        const caret = document.getElementById('pt-caret');
        if (panel) panel.style.display = 'none';
        if (caret) caret.style.transform = '';
    }
});

// ============================================================
// Daily Compare — Data Type & Status Filter (Chip toggles)
// ============================================================
let activeDailyTypeFilter = 'all'; // 'all' | 'Buy off' | 'Roving Audit'
let activeDailyStatusFilter = 'all'; // 'all' | 'ACCEPT' | 'REJECT' | 'ALERT'

function setDailyTypeFilter(el, val) {
    activeDailyTypeFilter = val;
    document.querySelectorAll('.df-chip[data-dtype]').forEach(c => {
        c.classList.remove('active-buyoff', 'active-roving', 'active-all');
    });
    if (val === 'all') el.classList.add('active-all');
    else if (val === 'Buy off') el.classList.add('active-buyoff');
    else el.classList.add('active-roving');

    updateDailyModelDropdown();

    if (window.startDate && window.endDate) renderDailyCompare();
}

function setDailyStatusFilter(el, val) {
    activeDailyStatusFilter = val;
    document.querySelectorAll('.df-chip[data-status]').forEach(c => {
        c.classList.remove('active-all', 'active-accept', 'active-reject', 'active-alert');
    });
    if (val === 'all') el.classList.add('active-all');
    else if (val === 'ACCEPT') el.classList.add('active-accept');
    else if (val === 'REJECT') el.classList.add('active-reject');
    else if (val === 'ALERT') el.classList.add('active-alert');
    if (window.startDate && window.endDate) renderDailyCompare();
}

// ai prediction
// =========================================================================
// 🧠 AI Prediction Tab Logic (Pure JavaScript)
// =========================================================================

// 1. อัลกอริทึมทำนายผล (Linear Regression)
function trainAILinearModel(data) {
    const n = data.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) {
        sx += i; sy += data[i];
        sxy += i * data[i]; sxx += i * i;
    }
    const den = (n * sxx) - (sx * sx);
    if (den === 0) return { m: 0, c: sy / n };
    return { m: (n * sxy - sx * sy) / den, c: (sy - ((n * sxy - sx * sy) / den) * sx) / n };
}



// ============================================================
// [SECURITY] escapeHTML — ป้องกัน XSS
// ครอบตัวแปรทุกตัวที่รับมาจากข้อมูลดิบ (Excel/user input)
// ก่อนนำไปแสดงผลผ่าน .innerHTML
// ============================================================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// [BUG FIX #1] parseTimeToMinutes — แปลง "H:MM" เป็นนาที
// แก้: localeCompare() ทำให้ '9:00' > '10:00' (ผิด)
// ใช้: เปรียบเทียบตัวเลขนาที → ถูกต้องทุกกรณี
// ============================================================
function parseTimeToMinutes(t) {
    if (!t || typeof t !== 'string') return 0;
    const parts = t.trim().split(':');
    if (parts.length < 2) return 0;
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
}

// ============================================================
// [BUG FIX #2] isInDateRange — เปรียบเทียบวันที่ด้วย Timestamp
// แก้: toISO(r.date) >= window.startDate string compare ผิด
// ใช้: Date.getTime() numeric timestamp ถูกต้องเสมอ
// ============================================================
function isInDateRange(recordDate, start, end) {
    const iso = toISO(recordDate);
    if (!iso) return false;
    const recTs = new Date(iso + 'T00:00:00').getTime();
    const startTs = new Date((start || '') + 'T00:00:00').getTime();
    const endTs = new Date((end || '') + 'T23:59:59').getTime();
    return recTs >= startTs && recTs <= endTs;
}

function buildCompareTableHtml(rows, title, colorHex, emptyMsg, modelKey) {
    if (!rows || rows.length === 0) {
        return `<div style="padding:20px; background:var(--bg2); border-radius:8px; border:1px dashed var(--border); text-align:center; color:var(--text3); font-size:13px; margin-bottom:20px;">
                    <div style="font-size:24px; margin-bottom:8px;">📭</div>
                    ${emptyMsg}
                </div>`;
    }

    // [BUG FIX #1] เรียง buytime ด้วย parseTimeToMinutes() แทน localeCompare()
    // เดิม: string compare → '9:00' > '10:00' (ผิด)
    // ใหม่: numeric compare → 540 < 600 (ถูกต้อง)
    rows.sort((a, b) =>
        (a.pt || '').localeCompare(b.pt || '') ||
        (a.fixture || '').localeCompare(b.fixture || '') ||
        parseTimeToMinutes(a.buytime) - parseTimeToMinutes(b.buytime)
    );

    // ---- สร้าง canonical params ----
    // ถ้ารู้ model → ใช้ลำดับจาก PRODUCTS dims (ข้อมูลครบ + ลำดับตรง)
    // ถ้าหลาย model → union ของ keys จากข้อมูลจริง เรียงตาม name
    let params = [];
    const resolvedCfg = modelKey ? getProductConfig(modelKey) : null;
    if (resolvedCfg && resolvedCfg.cfg) {
        params = resolvedCfg.cfg.dims.map(d => getDimId(d));
    } else {
        // multi-model: union เรียงตาม PRODUCTS dim order ก่อน แล้วต่อด้วย key ที่ไม่รู้จัก
        const seenSet = new Set();
        // รวบ model ทุกตัวในชุดข้อมูล
        const modelsInRows = [...new Set(rows.map(r => r.model).filter(Boolean))];
        modelsInRows.forEach(mk => {
            if (PRODUCTS[mk]) PRODUCTS[mk].dims.forEach(d => seenSet.add(getDimId(d)));
        });
        // เพิ่ม key ที่อาจหลุดมา
        rows.forEach(r => { if (r.values) Object.keys(r.values).forEach(k => seenSet.add(k)); });
        params = [...seenSet];
    }
    // กรองเฉพาะ params ที่มีข้อมูลจริงในชุดนี้ (ไม่งั้นคอลัมน์จะว่างทั้งหมด)
    const hasData = new Set();
    rows.forEach(r => {
        if (r.values) Object.entries(r.values).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '' && v !== '-') hasData.add(k);
        });
    });
    params = params.filter(p => hasData.has(p));

    let html = `
    <div style="margin-bottom: 24px; border: 1px solid ${colorHex}55; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <div style="background: ${colorHex}15; color: ${colorHex}; padding: 10px 16px; font-weight: 700; font-size: 14px; display:flex; justify-content:space-between; align-items:center;">
            <span>${title}</span>
            <span style="font-size:12px; font-weight:500;">${rows.length} รายการ</span>
        </div>
        <div style="overflow-x:auto; background:var(--bg3);">
            <table style="min-width:800px; margin:0; border:none; border-collapse:collapse;">
                <thead>
                    <tr style="background:var(--bg2);">
                        <!-- [UX/UI #2] Sticky: Date=0, PT=56px, Fixture=126px (ไม่ซ้อนทับ) -->
                        <th style="border-bottom:2px solid ${colorHex}55; position:sticky; left:0; background:var(--bg2); z-index:3; min-width:56px;">Date</th>
                        <th style="border-bottom:2px solid ${colorHex}55; position:sticky; left:56px; background:var(--bg2); z-index:3; min-width:70px;">PT</th>
                        <th style="border-bottom:2px solid ${colorHex}55; position:sticky; left:126px; background:var(--bg2); z-index:3; min-width:80px;">Fixture</th>
                        <th style="border-bottom:2px solid ${colorHex}55; min-width:70px;">Oven</th>
                        <th style="border-bottom:2px solid ${colorHex}55;">Time</th>
                        <th style="border-bottom:2px solid ${colorHex}55;">Status</th>
                        ${params.map(p => `<th style="font-size:10px; white-space:nowrap; border-bottom:2px solid ${colorHex}55; letter-spacing:0.3px;">${p.replace(/_/g, ' ')}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>`;

    let lastPT = '';
    rows.forEach(r => {
        const ptChange = r.pt !== lastPT; lastPT = r.pt;
        const parts = (r.date || '').split('-');
        const pDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : (r.date || '');
        const rowBg = ptChange ? 'border-top:2px solid var(--border2);' : '';

        // เลือก spec จาก DB.configs ก่อน ถ้าไม่มีให้ fallback ไป default spec
        const getSpec = (param) => {
            const mk = r.model;
            if (DB.configs[mk] && DB.configs[mk][param]) return DB.configs[mk][param];
            if (SPEC_BUYOFF && SPEC_BUYOFF[mk] && SPEC_BUYOFF[mk][param]) return SPEC_BUYOFF[mk][param];
            if (SPEC_ROVING && SPEC_ROVING[mk] && SPEC_ROVING[mk][param]) return SPEC_ROVING[mk][param];
            return null;
        };

        html += `<tr style="${rowBg}">
            <!-- [UX/UI #2] Date sticky 0px | [SECURITY] escapeHTML -->
            <td class="mono" style="font-size:11px; color:var(--text3); white-space:nowrap; position:sticky; left:0; background:var(--bg3); z-index:1;">${escapeHTML(pDate)}</td>
            <!-- [UX/UI #2] PT sticky 56px -->
            <td style="position:sticky; left:56px; background:var(--bg3); z-index:1; white-space:nowrap;">
              <!-- [SECURITY] escapeHTML -->
              <b style="color:var(--text2); font-size:13px;">${ptChange ? escapeHTML(r.pt || '—') : ''}</b>
            </td>
            <!-- [SECURITY] escapeHTML ป้องกัน XSS | [UX/UI #2] Fixture sticky 126px -->
            <td class="mono" style="font-weight:700; color:var(--text); white-space:nowrap; position:sticky; left:126px; background:var(--bg3); z-index:1;">${escapeHTML(r.fixture || '—')}</td>
            <!-- Oven column -->
            <td class="mono" style="font-weight:700; color:var(--warn); white-space:nowrap;">${escapeHTML(r.oven || '—')}</td>
            <!-- [SECURITY] escapeHTML -->
            <td class="mono" style="white-space:nowrap;">${escapeHTML(r.buytime || '—')}</td>
            <td style="white-space:nowrap;">${statusBadge(r.status)}</td>
            ${params.map(p => {
            const raw = r.values ? r.values[p] : undefined;
            // ค่าที่ถือว่าว่าง
            if (raw === undefined || raw === null || raw === '' || raw === '-') {
                return `<td style="color:var(--text3); font-size:12px; text-align:center;">-</td>`;
            }
            const cfg = getSpec(p);
            let sty = 'color:var(--text);';
            let bgSty = ''; // [UX/UI #1] background heatmap
            if (cfg && typeof raw === 'number') {
                const lvl = checkValAgainstSpec(raw, cfg);
                if (lvl === 'critical') {
                    sty = 'color:var(--fail); font-weight:700;';
                    bgSty = 'background-color:rgba(231,76,60,0.10);'; // [UX/UI #1] แดงอ่อน
                } else if (lvl === 'warn') {
                    sty = 'color:var(--warn); font-weight:700;';
                    bgSty = 'background-color:rgba(243,156,18,0.10);'; // [UX/UI #1] ส้มอ่อน
                } else {
                    sty = 'color:var(--pass);';
                    bgSty = '';
                }
            }
            const disp = typeof raw === 'number' ? raw.toFixed(4) : raw;
            // [UX/UI #1] bgSty = heatmap background (critical=red, warn=orange)
            return `<td class="mono" style="${bgSty}${sty} font-size:12px;">${disp}</td>`;
        }).join('')}
        </tr>`;
    });

    html += `</tbody></table></div></div>`;
    return html;
}

function renderDailyCompare() {
    const mk = document.getElementById('daily-model').value;
    const body = document.getElementById('daily-compare-body');
    const limit = parseInt(document.getElementById('daily-sample-limit').value) || 0;

    // ต้องมีวันที่ก่อน
    if (!window.startDate || !window.endDate) {
        body.innerHTML = `<div class="empty"><div style="font-size:40px;margin-bottom:12px;">📅</div><p style="font-size:13px;color:var(--text3);">เลือก Date Range เพื่อดูข้อมูล</p></div>`;
        return;
    }

    // [BUG FIX #2] ใช้ isInDateRange() แทน string comparison
    // เดิม: toISO(r.date) >= window.startDate → string compare อาจผิดถ้า format ต่างกัน
    // ใหม่: isInDateRange() เปรียบเทียบ timestamp ถูกต้องเสมอ
    let rows = DB.records.filter(r =>
        isInDateRange(r.date, window.startDate, window.endDate) && // [FIX #2]
        (!mk || r.model === mk) && r.values
    );

    // อัปเดต PT Dropdown list
    const allPTs = [...new Set(rows.map(r => r.pt).filter(Boolean))].sort();
    _rebuildPTOptionList(allPTs);
    const lbl = document.getElementById('pt-dropdown-label');
    if (activePTFilter !== 'all' && !allPTs.includes(activePTFilter)) {
        activePTFilter = 'all';
        if (lbl) lbl.textContent = '🔘 ALL PT';
        _rebuildPTOptionList(allPTs);
    }
    if (lbl && activePTFilter === 'all') lbl.textContent = '🔘 ALL PT';

    // กรอง PT
    if (activePTFilter !== 'all') rows = rows.filter(r => r.pt === activePTFilter);

    // กรอง Status
    if (activeDailyStatusFilter !== 'all') rows = rows.filter(r => r.status === activeDailyStatusFilter);

    if (!rows.length) {
        body.innerHTML = `<div class="empty"><div class="ei">📭</div><p>ไม่มีข้อมูลในช่วงวันที่ ${window.startDate} ถึง ${window.endDate}</p></div>`;
        return;
    }

    // แยก Buy off / Roving ตาม activeDailyTypeFilter
    let buyOffRows = [];
    let rovingRows = [];
    if (activeDailyTypeFilter === 'all' || activeDailyTypeFilter === 'Buy off') {
        buyOffRows = rows.filter(r => (r.dataType || 'Buy off') === 'Buy off');
    }
    if (activeDailyTypeFilter === 'all' || activeDailyTypeFilter === 'Roving Audit') {
        rovingRows = rows.filter(r => r.dataType === 'Roving Audit');
    }

    const applyLimit = (data) => {
        if (limit > 0 && data.length > limit)
            // [BUG FIX #1] Sort ด้วย timestamp แทน localeCompare
            return [...data].sort((a, b) => {
                const da = new Date((toISO(a.date) || '') + 'T' + (a.buytime || '00:00') + ':00').getTime();
                const db = new Date((toISO(b.date) || '') + 'T' + (b.buytime || '00:00') + ':00').getTime();
                return db - da;
            }).slice(0, limit);
        return data;
    };

    const finalBuyOff = applyLimit(buyOffRows);
    const finalRoving = applyLimit(rovingRows);

    // สร้าง summary bar
    const totalShown = finalBuyOff.length + finalRoving.length;
    const statusLabel = activeDailyStatusFilter !== 'all'
        ? ` &nbsp;·&nbsp; Status: <b style="color:var(--accent)">${activeDailyStatusFilter}</b>` : '';
    const typeLabel = activeDailyTypeFilter !== 'all'
        ? ` &nbsp;·&nbsp; Type: <b style="color:var(--blue)">${activeDailyTypeFilter}</b>` : '';
    const ptLabel = activePTFilter !== 'all'
        ? ` &nbsp;·&nbsp; PT: <b style="color:var(--text2)">${activePTFilter}</b>` : '';

    // [UX/UI #3] คำนวณ Yield/NG/Pass จากข้อมูลที่ filter+limit แล้วเท่านั้น
    const allFinal = [...finalBuyOff, ...finalRoving];
    const totalPass = allFinal.filter(r => r.status === 'ACCEPT').length;
    const totalNG = allFinal.filter(r => r.status === 'REJECT').length;
    const yieldDenom = totalPass + totalNG;
    const yieldPct = yieldDenom > 0 ? ((totalPass / yieldDenom) * 100).toFixed(1) : '—';
    const yieldColor = yieldDenom > 0 ? (parseFloat(yieldPct) >= 95 ? 'var(--pass)' : 'var(--fail)') : 'var(--text3)';
    const yieldBg = yieldDenom > 0 ? (parseFloat(yieldPct) >= 95 ? 'rgba(39,174,96,0.10)' : 'rgba(231,76,60,0.10)') : '';

    body.innerHTML = `
    <div class="daily-summary-row">
      <div class="daily-summary-title">
        ช่วงวันที่: <span>${window.startDate} — ${window.endDate}</span>${statusLabel}${typeLabel}${ptLabel}
      </div>
      <div class="daily-summary-chips">
        <span class="ds-chip" style="background:rgba(39,174,96,0.10);border-color:rgba(39,174,96,0.25);color:var(--pass);">🟢 Buy off: <b>${finalBuyOff.length}</b></span>
        <span class="ds-chip" style="background:rgba(45,156,219,0.10);border-color:rgba(45,156,219,0.25);color:var(--blue);">🔵 Roving: <b>${finalRoving.length}</b></span>
        <span class="ds-chip">Total: <b>${totalShown}</b>${limit > 0 ? ` (จำกัด ${limit}/ประเภท)` : ''}</span>
        <!-- [UX/UI #3] ชิปใหม่: Pass / NG / Yield -->
        <span class="ds-chip" style="background:rgba(39,174,96,0.10);border-color:rgba(39,174,96,0.25);color:var(--pass);">✅ Pass: <b>${totalPass}</b></span>
        <span class="ds-chip" style="background:rgba(231,76,60,0.10);border-color:rgba(231,76,60,0.30);color:var(--fail);">❌ NG: <b>${totalNG}</b></span>
        <span class="ds-chip" style="background:${yieldBg};color:${yieldColor};font-weight:700;">📊 Yield: <b>${yieldPct}${yieldDenom > 0 ? '%' : ''}</b></span>
      </div>
    </div>
    ${buildCompareTableHtml(finalBuyOff, '🟢 Buy Off Inspection', '#27AE60', 'ไม่มีข้อมูล Buy Off ในช่วงนี้', mk)}
    ${buildCompareTableHtml(finalRoving, '🔵 Roving Audit', '#2D9CDB', 'ไม่มีข้อมูล Roving Audit ในช่วงนี้', mk)}
  `;
}

function exportDailyCompareCSV() {
    if (!window.startDate || !window.endDate) { showToast('เลือก Date ก่อน', 'warn'); return; } const mk = document.getElementById('daily-model').value;
    // [BUG FIX #2] ใช้ isInDateRange() แทน string comparison
    let rows = DB.records.filter(r => isInDateRange(r.date, window.startDate, window.endDate) && (!mk || r.model === mk) && r.values); if (activePTFilter !== 'all') rows = rows.filter(r => r.pt === activePTFilter); rows.sort((a, b) => (a.pt || '').localeCompare(b.pt || '') || (a.fixture || '').localeCompare(b.fixture || ''));
    const paramSet = new Set(); rows.forEach(r => { if (r.values) { Object.entries(r.values).forEach(([k, v]) => { if (PRODUCTS[r.model] && !PRODUCTS[r.model].dims.map(d => getDimId(d)).includes(k)) return; if (v !== null && v !== undefined && v !== '' && v !== '-' && v !== '—') paramSet.add(k); }); } });
    let params = [...paramSet]; if (mk && PRODUCTS[mk]) { const orderedDims = PRODUCTS[mk].dims.map(d => getDimId(d)); params.sort((a, b) => { let idxA = orderedDims.indexOf(a); let idxB = orderedDims.indexOf(b); if (idxA === -1) idxA = 999; if (idxB === -1) idxB = 999; return idxA - idxB; }); } else { params.sort(); }
    const h = ['Date', 'PT', 'Fixture', 'Team', 'Type', 'Buy Off', 'Status', ...params]; const csv = [h, ...rows.map(r => [r.date, r.pt || '', r.fixture || '', r.team || '', r.dataType || 'Buy off', r.buytime || '', r.status || '', ...params.map(p => (r.values && r.values[p] != null) ? r.values[p] : '-')])].map(row => row.map(c => `"${c || ''}"`).join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `IPQC_Range_${window.startDate}_to_${window.endDate}.csv`; a.click();
}

function updateVizParams() {
    const rawMk = document.getElementById('v-model').value; const pSel = document.getElementById('v-param'); const btnGrid = document.getElementById('v-param-btns');
    if (!rawMk) { pSel.innerHTML = '<option>— เลือก Product ก่อน —</option>'; btnGrid.innerHTML = ''; return; }
    const resolved = getProductConfig(rawMk);
    if (!resolved || !resolved.cfg || !resolved.cfg.dims) { pSel.innerHTML = '<option>— ไม่พบ Product ในระบบ —</option>'; btnGrid.innerHTML = ''; return; }
    const dims = resolved.cfg.dims; pSel.innerHTML = dims.map(d => { const id = getDimId(d); return `<option value="${id}">${id.replace(/_/g, ' ')}</option>`; }).join('');
    btnGrid.innerHTML = dims.map(d => { const id = getDimId(d); return `<button class="param-btn" onclick="selectParam('${id}')" id="pbtn-${id}">${id.replace(/_/g, ' ')}</button>`; }).join(''); drawSPCChart();
}

function selectParam(id) { document.getElementById('v-param').value = id; document.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active')); const btn = document.getElementById(`pbtn-${id}`); if (btn) btn.classList.add('active'); drawSPCChart(); }

function fmtDT(date, time) {
    if (!date) return time || '—';
    const p = date.split('-');
    const s = p.length === 3 ? `${p[2]}/${p[1]}` : date;
    return time ? `${s} ${time}` : s;
}

function _getVal(r, param) {
    const raw = r.values && r.values[param];
    if (raw === undefined || raw === null || raw === '-' || raw === '') return null;
    const p = parseFloat(raw);
    return isNaN(p) ? null : p;
}

function _ptColor(v, cfg, dataType) {
    const s = checkValAgainstSpec(v, cfg);
    if (s === 'critical') return '#E74C3C';   // NG → แดง
    if (s === 'warn') return '#F39C12';   // Alert → เหลือง/ส้ม
    // OK: Buy off → เขียว (#27AE60), Roving → ฟ้า (#2D9CDB)
    return (dataType === 'Roving Audit') ? '#2D9CDB' : '#27AE60';
}

function drawSPCChart() {
    const dTypeFilter = document.getElementById('v-datatype').value;
    const rawMk = document.getElementById('v-model').value;
    const param = document.getElementById('v-param').value;
    const timeFilter = document.getElementById('v-time-filter') ? document.getElementById('v-time-filter').value : 'all';

    if (!rawMk || !param) return;

    const resolved = getProductConfig(rawMk);
    if (!resolved) return;
    const mk = resolved.key;
    const mkLabel = resolved.cfg.label || mk;

    const n = parseInt(document.getElementById('v-count').value) || 0;
    const cfg = (DB.configs[mk] && DB.configs[mk][param]) || {};

    const sortByDT = arr => arr.sort((a, b) => {
        const da = `${a.date || ''} ${a.buytime || '00:00'}`;
        const db = `${b.date || ''} ${b.buytime || '00:00'}`;
        return da.localeCompare(db);
    });

    let baseRows = DB.records.filter(r => {
        const rResolved = getProductConfig(r.model);
        return rResolved && rResolved.key === mk && r.values;
    });
    if (timeFilter === 'selected_date' && window.startDate && window.endDate) {
        // ใช้ Date Range Filter
        baseRows = baseRows.filter(r => toISO(r.date) >= window.startDate && toISO(r.date) <= window.endDate);
    }

    if (dTypeFilter && dTypeFilter !== 'compare') {
        // Single-type mode
        let rows = baseRows.filter(r => (r.dataType || 'Buy off') === dTypeFilter);
        sortByDT(rows);
        if (n > 0) rows = rows.slice(-n);
        _drawSingleSPCOnOriginalCanvas(rows, mk, param, cfg, dTypeFilter === 'Buy off' ? '#27AE60' : '#2D9CDB');
        drawStatsAndHist(rows.map(r => _getVal(r, param)).filter(v => v !== null), cfg, rows, param);

        const ap = document.getElementById('all-params-section');
        if (ap) ap.style.display = 'none';
        return;
    }

    // COMPARE MODE: Split Charts (บน-ล่าง แกนเวลาร่วมกัน)
    let buyRows = baseRows.filter(r => (r.dataType || 'Buy off') === 'Buy off');
    let rovRows = baseRows.filter(r => r.dataType === 'Roving Audit');
    sortByDT(buyRows); sortByDT(rovRows);
    if (n > 0) { buyRows = buyRows.slice(-n); rovRows = rovRows.slice(-n); }

    const allRows = [...buyRows, ...rovRows];
    sortByDT(allRows);

    // ── Shared Timeline (แกนเวลาร่วมกัน) ──
    const timelineRows = [];
    let lastKey = '';
    allRows.forEach(r => {
        let key = `${r.date || ''} ${r.buytime || '00:00'}`;
        if (key !== lastKey) {
            timelineRows.push(r);
            lastKey = key;
        }
    });
    const allLabels = timelineRows.map(r => fmtDT(r.date, r.buytime));

    const buyIndexed = [];
    buyRows.forEach(r => {
        const v = _getVal(r, param);
        if (v !== null) {
            let key = `${r.date || ''} ${r.buytime || '00:00'}`;
            let idx = timelineRows.findIndex(tr => `${tr.date || ''} ${tr.buytime || '00:00'}` === key);
            buyIndexed.push({ x: idx, y: v, lbl: fmtDT(r.date, r.buytime), fix: r.fixture || '' });
        }
    });

    const rovIndexed = [];
    rovRows.forEach(r => {
        const v = _getVal(r, param);
        if (v !== null) {
            let key = `${r.date || ''} ${r.buytime || '00:00'}`;
            let idx = timelineRows.findIndex(tr => `${tr.date || ''} ${tr.buytime || '00:00'}` === key);
            rovIndexed.push({ x: idx, y: v, lbl: fmtDT(r.date, r.buytime), fix: r.fixture || '' });
        }
    });

    document.getElementById('v-chart-title').textContent =
        `${param.replace(/_/g, ' ')} — ${mkLabel} · 🔴 Buy off vs 🔵 Roving (Shared Timeline)`;

    const legendEl = document.querySelector('#panel-viz .spc-legend');
    if (legendEl) legendEl.innerHTML = `
        <div class="spc-leg-item"><div style="width:20px;height:3px;background:#27AE60;border-radius:2px;display:inline-block"></div> Buy off</div>
        <div class="spc-leg-item"><div style="width:20px;border-top:2px dashed rgba(39,174,96,0.5);display:inline-block"></div> x̄ Mean 🟢</div>
        <div class="spc-leg-item"><div style="width:20px;height:3px;background:#2D9CDB;border-radius:2px;display:inline-block"></div> Roving</div>
        <div class="spc-leg-item"><div style="width:20px;border-top:2px dashed rgba(45,156,219,0.5);display:inline-block"></div> x̄ Mean 🔵</div>
        <div class="spc-leg-item"><div style="width:20px;border-top:2px dashed #F39C12;display:inline-block"></div> UCL/LCL</div>
        <div class="spc-leg-item"><div style="width:20px;border-top:2px dashed #E74C3C;display:inline-block"></div> USL/LSL</div>
        <div class="spc-leg-item">🔴 NG &nbsp; 🟡 Alert &nbsp; 🟢 OK</div>`;

    // SPC-style: mean line แบบแนวนอน ครอบคลุมแค่ช่วง x ของ dataset ตัวเอง (ไม่ข้ามกราฟ)
    const calculateMeanLine = (indexedData) => {
        const valid = indexedData.filter(d => d.y !== null && d.y !== undefined);
        if (valid.length < 2) return [];
        const mean = valid.reduce((s, d) => s + d.y, 0) / valid.length;
        const minX = Math.min(...valid.map(d => d.x));
        const maxX = Math.max(...valid.map(d => d.x));
        // คืนแค่ 2 จุด: จุดเริ่มต้นและสิ้นสุดของ dataset นั้น
        return [
            { x: minX, y: mean },
            { x: maxX, y: mean }
        ];
    };

    const buyTrend = calculateMeanLine(buyIndexed);
    const rovTrend = calculateMeanLine(rovIndexed);

    const specDs = [];
    const nSpec = Math.max(1, allLabels.length);
    const specLine = (val, col, dash) => {
        return {
            data: [{ x: 0, y: val }, { x: nSpec - 1, y: val }],
            borderColor: col, borderWidth: 1.5, borderDash: dash, pointRadius: 0, fill: false, order: 9, parsing: false
        };
    };
    if (cfg.usl != null) specDs.push({ ...specLine(cfg.usl, '#E74C3C', [3, 3]), label: `USL(${cfg.usl})` });
    if (cfg.lsl != null) specDs.push({ ...specLine(cfg.lsl, '#E74C3C', [3, 3]), label: `LSL(${cfg.lsl})` });
    if (cfg.ucl != null) specDs.push({ ...specLine(cfg.ucl, '#F39C12', [5, 3]), label: `UCL(${cfg.ucl})` });
    if (cfg.lcl != null) specDs.push({ ...specLine(cfg.lcl, '#F39C12', [5, 3]), label: `LCL(${cfg.lcl})` });
    if (cfg.cl != null) specDs.push({ ...specLine(cfg.cl, '#27AE60', [6, 3]), label: `CL(${cfg.cl})` });

    // ล้าง Canvas เก่า
    window_spcCharts.forEach(c => { try { c.destroy(); } catch (e) { } });
    window_spcCharts = [];

    // สร้าง Dual Canvas Container เพื่อแยกกราฟบนล่าง 
    const wrapper = document.querySelector('.chart-wrap');
    wrapper.innerHTML = `
        <div style="height: 100%; display: flex; flex-direction: column; position: relative;">
            <div style="flex: 1; min-height: 180px; position: relative;"><canvas id="spc-chart-buy"></canvas></div>
            <div style="flex: 1; min-height: 180px; position: relative; border-top: 1px dashed var(--border); margin-top: 10px; padding-top: 10px;"><canvas id="spc-chart-rov"></canvas></div>
        </div>
    `;

    // เตรียมฟังก์ชันสร้างกราฟ โดยตั้งค่า tension กลับมาเป็น 0.25 และจุดกลับมาขนาดใหญ่ตามเดิม
    const buildChart = (ctxId, title, dataPoints, trendPoints, lineCol, bgCol, specArr, showXAxisLabels, chartDataType) => {
        const ctx = document.getElementById(ctxId).getContext('2d');
        const datasetsToDraw = [
            {
                label: title, data: dataPoints, borderColor: lineCol, borderWidth: 2.5, tension: 0.25, fill: false,
                pointRadius: 5, pointHoverRadius: 8, spanGaps: true,
                pointBackgroundColor: dataPoints.map(d => _ptColor(d.y, cfg, chartDataType)),
                pointBorderColor: 'rgba(255,255,255,0.7)', pointBorderWidth: 1.5, order: 1, parsing: false
            }
        ];

        if (trendPoints.length) datasetsToDraw.push({ label: `x̄ Mean ${title.split(' ')[0]}`, data: trendPoints, borderColor: bgCol, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, fill: false, order: 3, parsing: false, spanGaps: false });
        datasetsToDraw.push(...specArr);

        return new Chart(ctx, {
            type: 'line',
            data: { datasets: datasetsToDraw },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                plugins: {
                    legend: { display: false }, // ซ่อน Legend ในตัวกราฟ เพราะเรามี Global Legend ข้างบนแล้ว
                    tooltip: {
                        callbacks: {
                            title: items => { const d = items[0]; return d.raw.lbl || allLabels[d.raw.x] || ''; },
                            label: c => {
                                if (c.dataset.label.includes('x̄') || c.dataset.label.includes('LSL') || c.dataset.label.includes('USL') || c.dataset.label.includes('UCL') || c.dataset.label.includes('LCL') || c.dataset.label.includes('CL(')) return null;
                                const v = c.raw.y; let fix = c.raw.fix || '';
                                return `${c.dataset.label}: ${v != null ? v.toFixed(4) : '—'}${fix ? ' (' + fix + ')' : ''}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear', min: 0, max: nSpec - 1, // บังคับให้แกน X กว้างเท่ากันทั้งคู่
                        ticks: {
                            display: showXAxisLabels, // ซ่อนแกน X สำหรับกราฟบนเพื่อความสวยงาม
                            font: { size: 9, family: 'Calibri' },
                            callback: (val) => { return allLabels[val] || ''; },
                            maxTicksLimit: 12, maxRotation: 45
                        },
                        grid: { color: 'rgba(0,0,0,0.04)' }
                    },
                    y: {
                        ticks: { font: { size: 10, family: 'Calibri' } },
                        grid: { color: 'rgba(0,0,0,0.06)' },
                        // พยายามล็อค Max Min ถ้าตั้ง Spec ไว้ จะได้สเกลกราฟบนล่างเท่ากัน
                        suggestedMax: cfg.usl != null ? cfg.usl + Math.abs(cfg.usl - cfg.cl) * 0.5 : undefined,
                        suggestedMin: cfg.lsl != null ? cfg.lsl - Math.abs(cfg.cl - cfg.lsl) * 0.5 : undefined
                    }
                }
            }
        });
    };

    window_spcCharts.push(buildChart('spc-chart-buy', '🟢 Buy off', buyIndexed, buyTrend, '#27AE60', 'rgba(39,174,96,0.5)', specDs, false, 'Buy off')); // กราฟบน (ซ่อน Label แกน X)
    window_spcCharts.push(buildChart('spc-chart-rov', '🔵 Roving', rovIndexed, rovTrend, '#2D9CDB', 'rgba(45,156,219,0.5)', specDs, true, 'Roving Audit'));  // กราฟล่าง (แสดง Label แกน X)

    const buyValid = buyRows.map(r => _getVal(r, param)).filter(v => v !== null);
    const rovValid = rovRows.map(r => _getVal(r, param)).filter(v => v !== null);
    _drawCompareStats(buyValid, rovValid, cfg, buyRows, rovRows, param);
    _drawCompareHist(buyValid, rovValid, cfg);

    _renderAllParamsCompare(mk, n);
}

function _drawSingleSPCOnOriginalCanvas(rows, mk, param, cfg, lineColor) {
    const n = rows.length;
    const vals = rows.map(r => _getVal(r, param));
    const labels = rows.map(r => { const p = (r.date || '').split('-'); const s = p.length === 3 ? `${p[2]}/${p[1]}` : (r.date || '?'); return r.buytime ? [s, r.buytime] : [s]; });
    const ptColors = vals.map((v, i) => v === null ? 'transparent' : _ptColor(v, cfg, rows[i]?.dataType || 'Buy off'));
    const missingData = vals.map((v, i) => v === null ? (cfg.cl ?? 0) : null);
    const validVals = vals.filter(v => v !== null);

    const trendData = [];
    if (validVals.length > 1) {
        const xs = [], ys = []; vals.forEach((v, i) => { if (v !== null) { xs.push(i); ys.push(v); } });
        const xm = xs.reduce((a, b) => a + b, 0) / xs.length; const ym = ys.reduce((a, b) => a + b, 0) / ys.length;
        const num = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0); const den = xs.reduce((s, x) => s + (x - xm) ** 2, 0);
        const sl = den ? num / den : 0; const ic = ym - sl * xm;
        const minI = Math.min(...xs); const maxI = Math.max(...xs);
        for (let i = 0; i < vals.length; i++) {
            if (i >= minI && i <= maxI) trendData.push(sl * i + ic);
            else trendData.push(null);
        }
    }

    const resolved = getProductConfig(mk);
    const mkLabel = resolved ? (resolved.cfg.label || mk) : mk;
    document.getElementById('v-chart-title').textContent = `${param.replace(/_/g, ' ')} — ${mkLabel}`;
    const legendEl = document.querySelector('#panel-viz .spc-legend');
    if (legendEl) legendEl.innerHTML = `
        <div class="spc-leg-item"><div style="width:20px;height:2px;background:${lineColor};border-radius:2px;display:inline-block"></div> Measured</div>
        <div class="spc-leg-item"><div style="width:20px;border-top:2px dashed #F39C12;display:inline-block"></div> UCL/LCL</div>
        <div class="spc-leg-item"><div style="width:20px;border-top:2px dashed #E74C3C;display:inline-block"></div> USL/LSL</div>
        <div class="spc-leg-item">🔴 NG &nbsp; 🟡 Alert &nbsp; 🟢 OK</div>
        <div class="spc-leg-item"><span style="color:var(--purple)">◆</span> ข้อมูลไม่ครบ</div>`;

    const wrapper = document.querySelector('.chart-wrap');
    wrapper.innerHTML = `<div style="height:100%; position:relative;"><canvas id="spc-chart-single"></canvas></div>`;

    window_spcCharts.forEach(c => { try { c.destroy(); } catch (e) { } });
    window_spcCharts = [];

    const ctx = document.getElementById('spc-chart-single').getContext('2d');
    const datasets = [
        { label: 'Measured', data: vals, borderColor: lineColor, borderWidth: 2, tension: 0.25, fill: false, pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: ptColors, pointBorderColor: vals.map(v => v === null ? 'transparent' : 'rgba(255,255,255,0.8)'), pointBorderWidth: 1.5, spanGaps: true, order: 1 },
        { label: 'Missing', data: missingData, borderColor: 'transparent', backgroundColor: '#9B59B6', pointStyle: 'rectRot', pointRadius: 7, showLine: false, order: 0 },
        { label: 'Trend', data: trendData, borderColor: 'rgba(100,100,100,0.3)', borderWidth: 1.5, borderDash: [8, 4], tension: 0, fill: false, pointRadius: 0, order: 2 }
    ];
    if (cfg.cl != null) datasets.push({ label: `CL(${cfg.cl})`, data: Array(n).fill(cfg.cl), borderColor: '#27AE60', borderWidth: 1.5, borderDash: [6, 3], pointRadius: 0, fill: false, order: 3 });
    if (cfg.ucl != null) datasets.push({ label: `UCL(${cfg.ucl})`, data: Array(n).fill(cfg.ucl), borderColor: '#F39C12', borderWidth: 1.5, borderDash: [4, 2], pointRadius: 0, fill: false, order: 3 });
    if (cfg.lcl != null) datasets.push({ label: `LCL(${cfg.lcl})`, data: Array(n).fill(cfg.lcl), borderColor: '#F39C12', borderWidth: 1.5, borderDash: [4, 2], pointRadius: 0, fill: false, order: 3 });
    if (cfg.usl != null) datasets.push({ label: `USL(${cfg.usl})`, data: Array(n).fill(cfg.usl), borderColor: '#E74C3C', borderWidth: 1.5, borderDash: [2, 2], pointRadius: 0, fill: false, order: 3 });
    if (cfg.lsl != null) datasets.push({ label: `LSL(${cfg.lsl})`, data: Array(n).fill(cfg.lsl), borderColor: '#E74C3C', borderWidth: 1.5, borderDash: [2, 2], pointRadius: 0, fill: false, order: 3 });

    let singleChart = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#374151', font: { size: 11, family: 'Calibri' } } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (typeof c.raw === 'number' ? c.raw.toFixed(4) : c.raw) } }
            },
            scales: { x: { ticks: { font: { size: 9, family: 'Calibri' }, maxRotation: 45, maxTicksLimit: 12 } }, y: { ticks: { font: { size: 11, family: 'Calibri' } } } }
        }
    });
    window_spcCharts.push(singleChart);
}

function drawStatsAndHist(vals, cfg, rows, param) {
    const statsBox = document.getElementById('v-stats'); const vList = document.getElementById('violations-list'); vList.innerHTML = '';
    if (!vals.length) { statsBox.innerHTML = 'ไม่มีข้อมูลตัวเลขสำหรับประมวลผล'; vList.innerHTML = '<div class="empty" style="padding:20px"><div class="ei" style="font-size:24px">✅</div><p style="font-size:12px">ไม่มี Violation</p></div>'; if (histChart) histChart.destroy(); return; }

    const min = Math.min(...vals), max = Math.max(...vals); const mean = vals.reduce((a, b) => a + b, 0) / vals.length; const range = max - min;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (vals.length > 1 ? vals.length - 1 : 1); const std = Math.sqrt(variance);
    let cp = '—', cpk = '—';
    if (cfg.usl != null && cfg.lsl != null && std > 0) { cp = ((cfg.usl - cfg.lsl) / (6 * std)).toFixed(2); const cpu = (cfg.usl - mean) / (3 * std); const cpl = (mean - cfg.lsl) / (3 * std); cpk = Math.min(cpu, cpl).toFixed(2); }

    statsBox.innerHTML = `N: <b>${vals.length}</b><br>Mean: <b>${mean.toFixed(4)}</b><br>Max: <b style="color:var(--fail)">${max.toFixed(4)}</b><br>Min: <b style="color:var(--blue)">${min.toFixed(4)}</b><br>Range: <b>${range.toFixed(4)}</b><br>StdDev (σ): <b>${std.toFixed(4)}</b><br>Cp: <b style="color:var(--purple)">${cp}</b><br>Cpk: <b style="color:var(--purple)">${cpk}</b>`;

    if (histChart) histChart.destroy();
    const histCtx = document.getElementById('hist-chart').getContext('2d');

    const n = vals.length;
    const hasBounds = cfg && cfg.usl != null && cfg.lsl != null;

    const k = Math.max(5, Math.min(20, Math.ceil(Math.log2(n) + 1)));

    const xLow = hasBounds ? Math.min(cfg.lsl - Math.abs(cfg.usl - cfg.lsl) * 0.2, min) : min;
    const xHigh = hasBounds ? Math.max(cfg.usl + Math.abs(cfg.usl - cfg.lsl) * 0.2, max) : max;
    const binWidth = (xHigh - xLow) / k || 1;

    const bins = Array.from({ length: k }, (_, i) => ({ x0: xLow + i * binWidth, x1: xLow + (i + 1) * binWidth, count: 0 }));
    vals.forEach(v => { let idx = Math.floor((v - xLow) / binWidth); if (idx < 0) idx = 0; if (idx >= k) idx = k - 1; bins[idx].count++; });

    const barLabels = bins.map(b => ((b.x0 + b.x1) / 2).toFixed(4));
    const barCounts = bins.map(b => b.count);

    const barColors = bins.map(b => {
        const mid = (b.x0 + b.x1) / 2;
        if (cfg) {
            if ((cfg.lsl != null && mid < cfg.lsl) || (cfg.usl != null && mid > cfg.usl)) return 'rgba(231,76,60,0.75)';
            if ((cfg.lcl != null && mid < cfg.lcl) || (cfg.ucl != null && mid > cfg.ucl)) return 'rgba(243,156,18,0.75)';
        }
        return 'rgba(45,156,219,0.70)';
    });
    const barBorderColors = barColors.map(c => c.replace('0.70', '1').replace('0.75', '1'));

    const CURVE_POINTS = 120;
    const curveStep = (xHigh - xLow) / (CURVE_POINTS - 1);
    const normalPDF = (x, mu, sigma) => sigma === 0 ? 0 : (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
    const curveXArr = Array.from({ length: CURVE_POINTS }, (_, i) => xLow + i * curveStep);
    const peakPDF = normalPDF(mean, mean, std === 0 ? 0.0001 : std);
    const peakCount = Math.max(...barCounts) || 1;
    const scale = peakCount / (peakPDF || 1);
    const curveData = curveXArr.map(x => ({ x, y: normalPDF(x, mean, std === 0 ? 0.0001 : std) * scale }));

    const yMax = Math.max(...barCounts) * 1.25 || 1;
    const makeVLine = (xVal, color, lbl = '') => ({
        type: 'scatter', label: lbl, data: [{ x: xVal.toFixed(4), y: 0 }, { x: xVal.toFixed(4), y: yMax }],
        borderColor: color, backgroundColor: color, showLine: true,
        borderWidth: 2, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0, xAxisID: 'x2', yAxisID: 'y'
    });

    const datasets = [
        { type: 'bar', label: 'Count', data: barCounts, backgroundColor: barColors, borderColor: barBorderColors, borderWidth: 1.5, borderRadius: 3, order: 2 },
        { type: 'line', label: 'Normal Curve', data: curveData, borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.08)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 0, xAxisID: 'x2', yAxisID: 'y', order: 1 }
    ];
    if (cfg && cfg.lsl != null) datasets.push(makeVLine(cfg.lsl, '#E74C3C', `LSL(${cfg.lsl})`));
    if (cfg && cfg.usl != null) datasets.push(makeVLine(cfg.usl, '#E74C3C', `USL(${cfg.usl})`));
    if (cfg && cfg.lcl != null) datasets.push(makeVLine(cfg.lcl, '#F39C12', `LCL(${cfg.lcl})`));
    if (cfg && cfg.ucl != null) datasets.push(makeVLine(cfg.ucl, '#F39C12', `UCL(${cfg.ucl})`));
    if (cfg && cfg.cl != null) datasets.push(makeVLine(cfg.cl, '#27AE60', `CL(${cfg.cl})`));
    datasets.push(makeVLine(mean, '#2D9CDB', `Mean(${mean.toFixed(4)})`));

    histChart = new Chart(histCtx, {
        type: 'bar', data: { labels: barLabels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
            plugins: {
                legend: { display: true, labels: { color: '#374151', font: { size: 10, family: 'Calibri' }, filter: item => item.text !== '' } },
                tooltip: { callbacks: { title: ctx => ctx[0]?.dataset?.type === 'bar' ? `Value ≈ ${ctx[0].label}` : '', label: ctx => { if (ctx.dataset.type === 'bar') return `Count: ${ctx.parsed.y}`; if (ctx.dataset.label === 'Normal Curve') return `Normal Curve: ${ctx.parsed.y.toFixed(2)}`; return ctx.dataset.label || null; } } }
            },
            scales: { x: { type: 'category', title: { display: true, text: 'Measured Value', color: '#6B7280', font: { size: 10, family: 'Calibri' } }, ticks: { font: { size: 9, family: 'Calibri' }, maxTicksLimit: 10, maxRotation: 45 }, grid: { color: 'rgba(0,0,0,0.05)' } }, x2: { type: 'linear', display: false, min: xLow, max: xHigh }, y: { title: { display: true, text: 'Count', color: '#6B7280', font: { size: 10, family: 'Calibri' } }, ticks: { font: { size: 9, family: 'Calibri' }, maxTicksLimit: 6, callback: v => Number.isInteger(v) ? v : null, stepSize: 1 }, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } } }
        }
    });

    let viol = [];
    [...rows].reverse().forEach(r => {
        let rawV = r.values && r.values[param];
        if (rawV === undefined || rawV === null || rawV === '-' || rawV === '') { viol.push(`<div class="violation-item incomplete"><span style="font-weight:700">[${r.date} ${r.buytime || ''}] Fix:${r.fixture}</span><br>❓ <b>ข้อมูลไม่ครบ</b> (Missing Data)</div>`); return; }
        const v = parseFloat(rawV); if (isNaN(v)) return;
        const status = checkValAgainstSpec(v, cfg);
        if (status === 'critical') { viol.push(`<div class="violation-item"><span style="font-weight:700">[${r.date} ${r.buytime || ''}] Fix:${r.fixture}</span><br>🔴 <b>NG:</b> ${v.toFixed(4)} <span style="font-size:10px;color:var(--text3)">(Spec: L:${cfg.lsl ?? '-'}, U:${cfg.usl ?? '-'})</span></div>`); }
        else if (status === 'warn') { viol.push(`<div class="violation-item warn"><span style="font-weight:700">[${r.date} ${r.buytime || ''}] Fix:${r.fixture}</span><br>🟡 <b>Alert:</b> ${v.toFixed(4)} <span style="font-size:10px;color:var(--text3)">(Control: L:${cfg.lcl ?? '-'}, U:${cfg.ucl ?? '-'})</span></div>`); }
    });
    if (!viol.length) { vList.innerHTML = '<div class="empty" style="padding:20px"><div class="ei" style="font-size:24px">✅</div><p style="font-size:12px">ไม่มี Violation ในชุดข้อมูลนี้</p></div>'; } else { vList.innerHTML = viol.join(''); }
}

function _drawCompareStats(buyValid, rovValid, cfg, buyRows, rovRows, param) {
    const statsBox = document.getElementById('v-stats');
    const vList = document.getElementById('violations-list');

    const calcS = (vals, label, color) => {
        if (!vals.length) return `<div style="color:var(--text3);font-size:12px">— ${label}: ไม่มีข้อมูล</div>`;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const std = Math.sqrt(vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (vals.length > 1 ? vals.length - 1 : 1));
        const min = Math.min(...vals), max = Math.max(...vals);
        let cp = '—', cpk = '—';
        if (cfg.usl != null && cfg.lsl != null && std > 0) { cp = ((cfg.usl - cfg.lsl) / (6 * std)).toFixed(2); cpk = Math.min((cfg.usl - mean) / (3 * std), (mean - cfg.lsl) / (3 * std)).toFixed(2); }
        const cpkNum = parseFloat(cpk);
        const cpkColor = isNaN(cpkNum) ? 'var(--text3)' : cpkNum >= 1.33 ? '#27AE60' : cpkNum >= 1.0 ? '#F39C12' : '#E74C3C';
        return `<div style="padding:8px 12px;border-radius:6px;border-left:4px solid ${color};background:${color}11;margin-bottom:8px">
            <b style="color:${color};font-size:12px">${label}</b> <span style="color:var(--text3);font-size:11px">(N=${vals.length})</span><br>
            <span style="font-size:11px;line-height:2">
            Mean: <b>${mean.toFixed(4)}</b> · σ: <b>${std.toFixed(4)}</b><br>
            Min: <b style="color:#2D9CDB">${min.toFixed(4)}</b> · Max: <b style="color:#E74C3C">${max.toFixed(4)}</b><br>
            Cp: <b style="color:var(--purple)">${cp}</b> · Cpk: <b style="color:${cpkColor}">${cpk}</b>
            </span></div>`;
    };
    statsBox.innerHTML = calcS(buyValid, '🟢 Buy off', '#27AE60') + calcS(rovValid, '🔵 Roving', '#2D9CDB');

    const allViolRows = [...buyRows.map(r => ({ ...r, _t: 'buy' })), ...rovRows.map(r => ({ ...r, _t: 'rov' }))];
    allViolRows.sort((a, b) => `${a.date} ${a.buytime}`.localeCompare(`${b.date} ${b.buytime}`));
    let viol = [];
    allViolRows.reverse().forEach(r => {
        const v = _getVal(r, param); const col = r._t === 'buy' ? '#27AE60' : '#2D9CDB'; const tLbl = r._t === 'buy' ? 'Buy off' : 'Roving';
        if (v === null) { viol.push(`<div class="violation-item incomplete"><span style="font-weight:700">[${r.date} ${r.buytime || ''}] Fix:${r.fixture} <span style="color:${col};font-size:10px">${tLbl}</span></span><br>❓ ข้อมูลไม่ครบ</div>`); return; }
        const s = checkValAgainstSpec(v, cfg);
        if (s === 'critical') viol.push(`<div class="violation-item"><span style="font-weight:700">[${r.date} ${r.buytime || ''}] Fix:${r.fixture} <span style="color:${col};font-size:10px">${tLbl}</span></span><br>🔴 NG: ${v.toFixed(4)}</div>`);
        else if (s === 'warn') viol.push(`<div class="violation-item warn"><span style="font-weight:700">[${r.date} ${r.buytime || ''}] Fix:${r.fixture} <span style="color:${col};font-size:10px">${tLbl}</span></span><br>🟡 Alert: ${v.toFixed(4)}</div>`);
    });
    vList.innerHTML = viol.length ? viol.join('') : '<div class="empty" style="padding:20px"><div class="ei" style="font-size:24px">✅</div><p style="font-size:12px">ไม่มี Violation</p></div>';
}

function _drawCompareHist(buyValid, rovValid, cfg) {
    const allValid = [...buyValid, ...rovValid];
    if (!allValid.length) return;
    const globalMin = Math.min(...allValid), globalMax = Math.max(...allValid);
    const hasBounds = cfg.usl != null && cfg.lsl != null;
    const xLow = hasBounds ? Math.min(cfg.lsl - Math.abs(cfg.usl - cfg.lsl) * 0.15, globalMin) : globalMin;
    const xHigh = hasBounds ? Math.max(cfg.usl + Math.abs(cfg.usl - cfg.lsl) * 0.15, globalMax) : globalMax;
    const range = xHigh - xLow || 1; const k = Math.max(6, Math.min(16, Math.ceil(Math.log2(allValid.length) + 1)));
    const bw = range / k;
    const makeBins = vals => {
        const bins = Array.from({ length: k }, (_, i) => ({ x0: xLow + i * bw, x1: xLow + (i + 1) * bw, count: 0 }));
        vals.forEach(v => { let i = Math.floor((v - xLow) / bw); i = Math.max(0, Math.min(k - 1, i)); bins[i].count++; });
        return bins;
    };
    const buyBins = makeBins(buyValid); const rovBins = makeBins(rovValid);
    const histLabels = buyBins.map(b => ((b.x0 + b.x1) / 2).toFixed(4));

    // คำนวณความสูงกราฟเผื่อพื้นที่ให้เส้นแนวตั้ง
    const allCounts = [...buyBins.map(b => b.count), ...rovBins.map(b => b.count)];
    const yMax = Math.max(...allCounts) * 1.25 || 1;

    // ฟังก์ชันสร้างเส้น Indicator Line (ชัดเจนตัดเต็มพื้นที่)
    const makeVLine = (xVal, color, lbl = '', thick = 1.5, solid = false) => ({
        type: 'scatter', label: lbl, data: [{ x: xVal.toFixed(4), y: 0 }, { x: xVal.toFixed(4), y: yMax }],
        borderColor: color, backgroundColor: color, showLine: true,
        borderWidth: thick, borderDash: solid ? [] : [6, 4], pointRadius: 0, pointHoverRadius: 0, xAxisID: 'x2', yAxisID: 'y', order: 1
    });

    const datasets = [
        { type: 'bar', label: '🟢 Buy off', data: buyBins.map(b => b.count), backgroundColor: 'rgba(39,174,96,0.55)', borderColor: '#27AE60', borderWidth: 1.5, borderRadius: 3, order: 3 },
        { type: 'bar', label: '🔵 Roving', data: rovBins.map(b => b.count), backgroundColor: 'rgba(45,156,219,0.55)', borderColor: '#2D9CDB', borderWidth: 1.5, borderRadius: 3, order: 4 }
    ];

    // ใส่เส้น Spec Limits สีแดง
    if (cfg && cfg.lsl != null) datasets.push(makeVLine(cfg.lsl, '#E74C3C', `LSL(${cfg.lsl})`, 2));
    if (cfg && cfg.usl != null) datasets.push(makeVLine(cfg.usl, '#E74C3C', `USL(${cfg.usl})`, 2));
    // ใส่เส้น Control Limits สีส้ม
    if (cfg && cfg.lcl != null) datasets.push(makeVLine(cfg.lcl, '#F39C12', `LCL(${cfg.lcl})`, 1.5));
    if (cfg && cfg.ucl != null) datasets.push(makeVLine(cfg.ucl, '#F39C12', `UCL(${cfg.ucl})`, 1.5));
    // ใส่ Target/Center
    if (cfg && cfg.cl != null) datasets.push(makeVLine(cfg.cl, '#27AE60', `CL/Target(${cfg.cl})`, 2, true)); // เส้นทึบสีเขียว

    // เส้นค่าเฉลี่ยของข้อมูล (Mean) - สีม่วงทึบ เพื่อแยกความแตกต่างให้ชัดเจน
    const mean = allValid.reduce((a, b) => a + b, 0) / allValid.length;
    datasets.push(makeVLine(mean, '#9B59B6', `Mean(${mean.toFixed(4)})`, 2, true));

    if (histChart) histChart.destroy();
    const hctx = document.getElementById('hist-chart').getContext('2d');
    histChart = new Chart(hctx, {
        data: { labels: histLabels, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#374151', font: { size: 10, family: 'Calibri' } } },
                tooltip: { callbacks: { title: ctx => ctx[0]?.dataset?.type === 'bar' ? `Value ≈ ${ctx[0].label}` : '', label: ctx => { if (ctx.dataset.type === 'bar') return `Count: ${ctx.parsed.y}`; return ctx.dataset.label || null; } } }
            },
            scales: {
                x: { type: 'category', ticks: { font: { size: 9, family: 'Calibri' }, maxRotation: 45, maxTicksLimit: 10 } },
                x2: { type: 'linear', display: false, min: xLow, max: xHigh },
                y: { beginAtZero: true, ticks: { font: { size: 9, family: 'Calibri' }, stepSize: 1, callback: v => Number.isInteger(v) ? v : null }, title: { display: true, text: 'Count', font: { size: 10 } } }
            }
        }
    });
}

function _renderAllParamsCompare(mk, n) {
    if (!PRODUCTS[mk]) return;
    const dims = PRODUCTS[mk].dims.map(d => getDimId(d));
    const timeFilter = document.getElementById('v-time-filter') ? document.getElementById('v-time-filter').value : 'all';

    let baseRows = DB.records.filter(r => r.model === mk && r.values);
    if (timeFilter === 'selected_date' && window.startDate && window.endDate) {
        baseRows = baseRows.filter(r => toISO(r.date) >= window.startDate && toISO(r.date) <= window.endDate);
    }

    let buyRows = baseRows.filter(r => (r.dataType || 'Buy off') === 'Buy off');
    let rovRows = baseRows.filter(r => r.dataType === 'Roving Audit');
    const sortByDT = arr => arr.sort((a, b) => (`${a.date || ''} ${a.buytime || ''}`).localeCompare(`${b.date || ''} ${b.buytime || ''}`));
    sortByDT(buyRows); sortByDT(rovRows);
    if (n > 0) { buyRows = buyRows.slice(-n); rovRows = rovRows.slice(-n); }

    let section = document.getElementById('all-params-section');
    if (!section) {
        section = document.createElement('div');
        section.id = 'all-params-section';
        section.style.marginTop = '16px';
        document.getElementById('panel-viz').appendChild(section);
    }
    section.style.display = 'block';

    const calcS = (rows, param, cfg) => {
        const vals = rows.map(r => _getVal(r, param)).filter(v => v !== null);
        if (!vals.length) return null;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const std = Math.sqrt(vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (vals.length > 1 ? vals.length - 1 : 1));
        let cp = '—', cpk = '—';
        if (cfg && cfg.usl != null && cfg.lsl != null && std > 0) {
            cp = ((cfg.usl - cfg.lsl) / (6 * std)).toFixed(2);
            cpk = Math.min((cfg.usl - mean) / (3 * std), (mean - cfg.lsl) / (3 * std)).toFixed(2);
        }
        const ngCount = vals.filter(v => checkValAgainstSpec(v, cfg) === 'critical').length;
        const warnCount = vals.filter(v => checkValAgainstSpec(v, cfg) === 'warn').length;
        return { n: vals.length, mean, std, cp, cpk, ngCount, warnCount, vals };
    };

    let tableRows = '';

    dims.forEach(param => {
        const cfg = (DB.configs[mk] && DB.configs[mk][param]) || {};
        const bs = calcS(buyRows, param, cfg);
        const rs = calcS(rovRows, param, cfg);
        const paramLabel = param.replace(/_/g, ' ');

        const fmtStat = (s, color) => {
            if (!s) return `<td colspan="5" style="color:var(--text3);text-align:center;font-size:11px">—</td>`;
            const cpCol = s.cp !== '—' ? (parseFloat(s.cp) >= 1.33 ? '#27AE60' : 'var(--text2)') : 'var(--text3)';
            const cpkN = parseFloat(s.cpk); const cpkCol = isNaN(cpkN) ? 'var(--text3)' : cpkN >= 1.33 ? '#27AE60' : cpkN >= 1.0 ? '#F39C12' : '#E74C3C';
            const ngBadge = s.ngCount > 0 ? `<span style="background:rgba(231,76,60,0.15);color:#E74C3C;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700">${s.ngCount} NG</span>` : '';
            const wBadge = s.warnCount > 0 ? `<span style="background:rgba(243,156,18,0.15);color:#F39C12;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700">${s.warnCount} Warn</span>` : '';
            return `<td style="font-family:'Calibri','Candara','Segoe UI',sans-serif;font-size:12px;color:${color}">${s.mean.toFixed(4)}</td>
                    <td style="font-family:'Calibri','Candara','Segoe UI',sans-serif;font-size:12px">${s.std.toFixed(4)}</td>
                    <td style="font-family:'Calibri','Candara','Segoe UI',sans-serif;font-size:12px;color:${cpCol};font-weight:700">${s.cp}</td>
                    <td style="font-family:'Calibri','Candara','Segoe UI',sans-serif;font-size:12px;color:${cpkCol};font-weight:700">${s.cpk}</td>
                    <td>${ngBadge}${wBadge}</td>`;
        };
        tableRows += `<tr style="cursor:pointer" onclick="selectParam('${param}'); document.getElementById('v-param').value='${param}'; drawSPCChart();" title="คลิกเพื่อดู SPC Chart">
            <td style="font-weight:700;font-size:12px;color:var(--text2);white-space:nowrap">${paramLabel}</td>
            ${fmtStat(bs, '#27AE60')}
            ${fmtStat(rs, '#2D9CDB')}
        </tr>`;
    });

    section.innerHTML = `
    <div class="card" style="margin-bottom:0">
      <div class="card-hdr">
        <h3>📋 ALL PARAMETERS — Buy off vs Roving Summary</h3>
        <div class="card-sub">คลิกที่แถวเพื่อดู SPC Chart · แสดงทุก Parameter พร้อมกัน</div>
      </div>
      <div class="card-body">
        <div style="overflow-x:auto">
          <table style="min-width:1000px">
            <thead>
              <tr style="background:var(--bg2)">
                <th rowspan="2" style="white-space:nowrap;vertical-align:middle">Parameter</th>
                <th colspan="5" style="text-align:center;color:#27AE60;border-bottom:2px solid #27AE6033">🟢 Buy off (N=${buyRows.length})</th>
                <th colspan="5" style="text-align:center;color:#2D9CDB;border-bottom:2px solid #2D9CDB33">🔵 Roving (N=${rovRows.length})</th>
              </tr>
              <tr style="background:var(--bg2)">
                <th style="font-size:11px;color:#27AE60">Mean</th><th style="font-size:11px">σ</th><th style="font-size:11px">Cp</th><th style="font-size:11px">Cpk</th><th style="font-size:11px">Status</th>
                <th style="font-size:11px;color:#2D9CDB">Mean</th><th style="font-size:11px">σ</th><th style="font-size:11px">Cp</th><th style="font-size:11px">Cpk</th><th style="font-size:11px">Status</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// Fix Bug 5: copyAndOpenGmail was referenced in HTML but never defined
async function copyAndOpenGmail() {
    if (!window._outlookBody) return showToast('กด "ดึงข้อมูล Report" ก่อน', 'warn');
    await writeRichReportToClipboard();
    const subject = encodeURIComponent(window._outlookSubject || '');
    const to = encodeURIComponent(document.getElementById('outlook-to').value || '');
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}`, '_blank');
    showToast('📋 คัดลอกเนื้อหาแล้ว — วางใน Gmail ที่เปิดขึ้นมา (Ctrl+V)', 'success', 6000);
}

// Fix Bug 6: helper to reliably find nav button by data-tab attribute
function _navBtn(tabId) {
    return document.querySelector(`.nav-btn[data-tab="${tabId}"]`) || null;
}

function updateDashboard() {
    // --- 1. อัปเดตตัวเลข KPI ด้านบน ---
    const finalizedRecs = DB.records.filter(r => r.status === 'ACCEPT' || r.status === 'ALERT' || r.status === 'REJECT');
    const waitingRecs = DB.records.filter(r => r.status === 'WAITING');
    const incompleteRecs = DB.records.filter(r => r.status === 'INCOMPLETE');
    const ngs = DB.records.filter(r => r.status === 'REJECT').length;

    document.getElementById('kpi-total').textContent = DB.records.length;
    document.getElementById('kpi-today').textContent = DB.records.filter(r => r.date === TODAY).length;
    document.getElementById('kpi-fixture').textContent = new Set(DB.records.map(r => r.fixture)).size;
    document.getElementById('kpi-alert').textContent = ALERT_LOG.filter(l => l.level === 'warn' || l.level === 'critical').length;
    document.getElementById('kpi-ng').textContent = ngs;

    // Yield คำนวณเฉพาะ records ที่ finalize แล้ว (ACCEPT/ALERT/REJECT) ไม่นับ WAITING/INCOMPLETE
    const yieldBase = finalizedRecs.length;
    document.getElementById('kpi-yield').textContent = yieldBase > 0
        ? (((yieldBase - ngs) / yieldBase) * 100).toFixed(2) + '%'
        : '—%';

    // KPI ใหม่: WAITING และ INCOMPLETE
    const elWaiting = document.getElementById('kpi-waiting');
    if (elWaiting) elWaiting.textContent = waitingRecs.length;
    const elIncomplete = document.getElementById('kpi-incomplete');
    if (elIncomplete) elIncomplete.textContent = incompleteRecs.length;

    // --- 2. อัปเดตตัวเลขบน Tab เมนู ---
    // ใช้ filter เดียวกับ _renderAboutTableCore() (ซ่อน DRAFT_INCOMPLETE/DRAFT_WAITING)
    // ไม่งั้นตัวเลข badge จะไม่ตรงกับจำนวนแถวที่แสดงจริงในตาราง About Data
    const badgeRecords = document.getElementById('badge-records');
    const badgeImport = document.getElementById('badge-import');
    const aboutVisibleRecs = DB.records.filter(r => r.status !== 'DRAFT_INCOMPLETE' && r.status !== 'DRAFT_WAITING');
    if (badgeRecords) badgeRecords.textContent = aboutVisibleRecs.length;
    if (badgeImport) badgeImport.textContent = aboutVisibleRecs.filter(r => r.date === TODAY).length;

    if (typeof refreshNavBadges === 'function') {
        refreshNavBadges({ dispensing: DB.records.length });
    }
}

function exportConfig() {
    const blob = new Blob([JSON.stringify(DB.configs, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `IPQC_Config_${Date.now()}.json`;
    a.click();
}

function importConfig(inp) {
    const file = inp.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            DB.configs = data;
            saveDB();
            syncDataConsistency();
            showToast('✅ นำเข้า Config สำเร็จ', 'success');
            renderConfigTable();
        } catch (err) { showToast('อ่านไฟล์ JSON ไม่สำเร็จ', 'error'); }
    };
    reader.readAsText(file);
    inp.value = '';
}

function renderConfigTable() {
    const mk = document.getElementById('cfg-model').value;
    const dtype = document.getElementById('cfg-datatype').value;
    const tbody = document.getElementById('cfg-tbody');
    if (!mk) { tbody.innerHTML = '<tr><td colspan="7" class="empty">กรุณาเลือก Product ด้านบน</td></tr>'; return; }

    // แยก Key สำหรับ Roving
    const cfgKey = dtype === 'Roving Audit' ? mk + '_rov' : mk;
    if (!DB.configs[cfgKey]) DB.configs[cfgKey] = {}; // สร้างถ้ายังไม่มี

    let html = '';
    const dims = PRODUCTS[mk].dims.map(d => getDimId(d));
    const cfg = DB.configs[cfgKey] || {};

    dims.forEach(id => {
        const c = cfg[id] || { lsl: '', lcl: '', cl: '', ucl: '', usl: '' };
        html += `<tr>
            <td style="font-weight:700;">${id.replace(/_/g, ' ')}</td>
            <td><input type="number" step="0.0001" class="spec-input" id="cfg-${id}-lsl" value="${c.lsl !== null && c.lsl !== undefined ? c.lsl : ''}"></td>
            <td><input type="number" step="0.0001" class="spec-input" id="cfg-${id}-lcl" value="${c.lcl !== null && c.lcl !== undefined ? c.lcl : ''}"></td>
            <td><input type="number" step="0.0001" class="spec-input" id="cfg-${id}-cl" value="${c.cl !== null && c.cl !== undefined ? c.cl : ''}"></td>
            <td><input type="number" step="0.0001" class="spec-input" id="cfg-${id}-ucl" value="${c.ucl !== null && c.ucl !== undefined ? c.ucl : ''}"></td>
            <td><input type="number" step="0.0001" class="spec-input" id="cfg-${id}-usl" value="${c.usl !== null && c.usl !== undefined ? c.usl : ''}"></td>
            <td><button class="btn btn-outline btn-sm" onclick="saveSingleConfig('${mk}', '${id}')">💾</button></td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function saveSingleConfig(mk, id) {
    const dtype = document.getElementById('cfg-datatype').value;
    const cfgKey = dtype === 'Roving Audit' ? mk + '_rov' : mk;

    if (!DB.configs[cfgKey]) DB.configs[cfgKey] = {};
    const parse = val => val === '' ? null : parseFloat(val);

    DB.configs[cfgKey][id] = {
        lsl: parse(document.getElementById(`cfg-${id}-lsl`).value),
        lcl: parse(document.getElementById(`cfg-${id}-lcl`).value),
        cl: parse(document.getElementById(`cfg-${id}-cl`).value),
        ucl: parse(document.getElementById(`cfg-${id}-ucl`).value),
        usl: parse(document.getElementById(`cfg-${id}-usl`).value)
    };
    saveDB(); syncDataConsistency();
    syncWithServer(false); // Sync to SQL instantly
    showToast(`✅ บันทึก Config: ${id} (${dtype})`, 'success');
}

function saveAllConfigs() {
    const mk = document.getElementById('cfg-model').value;
    const dtype = document.getElementById('cfg-datatype').value;
    if (!mk) return showToast('กรุณาเลือก Product', 'warn');

    const cfgKey = dtype === 'Roving Audit' ? mk + '_rov' : mk;
    const dims = PRODUCTS[mk].dims.map(d => getDimId(d));
    const parse = val => val === '' ? null : parseFloat(val);

    if (!DB.configs[cfgKey]) DB.configs[cfgKey] = {};
    dims.forEach(id => {
        DB.configs[cfgKey][id] = {
            lsl: parse(document.getElementById(`cfg-${id}-lsl`).value),
            lcl: parse(document.getElementById(`cfg-${id}-lcl`).value),
            cl: parse(document.getElementById(`cfg-${id}-cl`).value),
            ucl: parse(document.getElementById(`cfg-${id}-ucl`).value),
            usl: parse(document.getElementById(`cfg-${id}-usl`).value)
        };
    });
    saveDB(); syncDataConsistency();
    syncWithServer(false);
    showToast(`✅ บันทึก Config ทั้งหมดสำเร็จ (${dtype})`, 'success');
}

function resetModelConfig() {
    const mk = document.getElementById('cfg-model').value;
    const dtype = document.getElementById('cfg-datatype').value;
    if (!mk) return;

    if (!confirm(`ย้อนกลับการตั้งค่าของ ${mk} (${dtype}) เป็นค่าเริ่มต้นหรือไม่?`)) return;

    // เลือกก้อน Default ให้ตรงกับที่เลือก
    const defaultSpecs = (dtype === 'Roving Audit') ? SPEC_ROVING : SPEC_BUYOFF;
    const cfgKey = (dtype === 'Roving Audit') ? mk + '_rov' : mk;

    if (!DB.configs[cfgKey]) DB.configs[cfgKey] = {};

    if (defaultSpecs[mk]) {
        PRODUCTS[mk].dims.forEach(d => {
            const id = getDimId(d);
            // ดึงค่า Default มาเซ็ตทับ (ถ้าไม่มีให้เป็น null)
            DB.configs[cfgKey][id] = { ...(defaultSpecs[mk][id] || { lsl: null, lcl: null, cl: null, ucl: null, usl: null }) };
        });

        saveDB();
        syncDataConsistency();
        syncWithServer(false);
        renderConfigTable(); // อัปเดตตารางหน้าจอ
        showToast(`✅ รีเซ็ตค่า ${dtype} ของ ${PRODUCTS[mk].label} สำเร็จ`, 'success');
    } else {
        showToast(`❌ ไม่พบค่า Default สำหรับ ${PRODUCTS[mk].label}`, 'error');
    }
}

function addConfigRow() {
    showToast('การเพิ่ม Parameter ใหม่ต้องทำการแก้ไขที่ Source Code (PRODUCTS) เท่านั้น', 'info');
}



// ============================================================
// [UX] TASK 2A — Auto-select-on-focus for all measurement inputs
// Allows operator to overwrite existing values immediately on a
// numpad without pressing Backspace first.
// Uses event delegation on document so it covers inputs that are
// dynamically rendered AFTER page load (renderManualForm etc.)
// ============================================================
document.addEventListener('focusin', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;

    const isManualField = t.classList.contains('manual-field');
    const isFormInput = t.classList.contains('form-input');
    // Multi-point inputs use class names like "mi-coil_od", "mi-bobbin_ht" etc.
    const isMultiInput = [...t.classList].some(cls => cls.startsWith('mi-'));

    if (isManualField || isFormInput || isMultiInput) {
        // setTimeout 0 prevents the browser from cancelling the selection
        // when the focus was triggered by a mouse click (click sets cursor
        // position AFTER focus fires; setTimeout lets that settle first).
        setTimeout(() => t.select(), 0);
    }
}, true /* useCapture=true → fires before oninput/onclick handlers */);
// ============================================================
// ████████████████████████████████████████████████████████████
//   TWO-STAGE WORKFLOW — DRAFT / PENDING_DATA / BULK MERGE
//   Tasks 1-4: saveManualDraft, renderPendingTable,
//               bulkTextMerge, persistence helpers
// ████████████████████████████████████████████████████████████
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    renderPendingTable();
    populateMergeDropdown();
    updatePendingBadge();
});

// ─── Identify "measurement-only" dims for a product ─────────
// These are multi-point dims (Parallel/DTM/NDTM) collected physically by QC.
// They are flagged as DRAFT_MEASUREMENT_IDS when building the form.
const MEASUREMENT_DIM_PATTERNS = [
    /^Coil_parallel$/i, /^Bobbin_parallel$/i,
    /^Coil_recess_DTM$/i, /^Coil_recess_NDTM$/i,
    /^Bobbin_recess_DTM$/i, /^Bobbin_recess_NDTM$/i,
];

function isMeasurementDim(dimId) {
    return MEASUREMENT_DIM_PATTERNS.some(re => re.test(dimId));
}

function getTextDataDims(mk) {
    // Returns dim IDs that come from SM Flash text (not measured by QC physically)
    if (!PRODUCTS[mk]) return [];
    return PRODUCTS[mk].dims
        .map(d => getDimId(d))
        .filter(id => !isMeasurementDim(id));
}

// ============================================================
// TASK 2: saveManualDraft()
// Saves a record with only Parallel/DTM/NDTM filled.
// Status = PENDING_DATA. Batch requirement: up to 4/PT/Oven.
// ============================================================
async function saveManualDraft() {
    const dType = document.getElementById('m-datatype').value;
    const mk = document.getElementById('m-model').value;
    const fix = document.getElementById('m-fix1').value.trim();
    const pt = document.getElementById('m-pt').value.trim();
    const oven = document.getElementById('m-oven').value.trim();
    const op = document.getElementById('m-op').value.trim();

    if (!mk || !fix || !pt || !oven) {
        showToast('กรุณากรอกข้อมูล Required ให้ครบถ้วน (Product, Fixture, PT, Oven)', 'error');
        return;
    }

    const inputs = document.querySelectorAll('#dim-container input.manual-field');
    let isComplete = true;
    inputs.forEach(inp => {
        if (inp.value.trim() === '') {
            isComplete = false;
        }
    });

    if (!isComplete) {
        showToast('⚠️ กรุณากรอกค่าวัดให้ครบทุกช่องก่อนบันทึก (1 Log)', 'error');
        return;
    }

    const vals = {};
    const measureDims = PRODUCTS[mk].dims.filter(d => isMeasurementDim(getDimId(d)));

    measureDims.forEach(d => {
        const id = getDimId(d);
        if (isMulti(d)) {
            const avgEl = document.getElementById(`avg-${id}`);
            if (avgEl && avgEl.textContent !== '—') {
                vals[id] = parseFloat(avgEl.textContent);
            }
        } else {
            const singleInp = document.getElementById(`val-${id}`);
            if (singleInp && singleInp.value !== '') {
                vals[id] = parseFloat(singleInp.value);
            }
        }
    });

    const vmiVal = document.getElementById('m-vmi') ? document.getElementById('m-vmi').value : '';
    if (vmiVal) vals['VMI'] = vmiVal;

    const coilVal = document.getElementById('m-coil_height') ? document.getElementById('m-coil_height').value : '';
    if (coilVal) vals['Coil_height'] = coilVal;

    const hiPotVal = document.getElementById('m-hi_pot') ? document.getElementById('m-hi_pot').value : '';
    if (hiPotVal) vals['Hi_pot'] = hiPotVal;

    const exist = DB.records.filter(r => r.pt === pt && r.oven === oven && r.model === mk && r.dataType === dType && r.status === 'WAITING');
    const fixes = fix.split(',').map(s => s.trim()).filter(s => s);
    let added = 0;

    // ─── ตรวจสอบค่าที่กรอกกับ Spec Limit ทันที (เหมือน Stage 2 bulkTextMerge) ──
    // เดิม Stage 1 ไม่เคยเช็ค Spec เลย ทำให้ค่าที่ REJECT/ALERT (เกิน USL/LSL/UCL/LCL)
    // ไม่เคยถูกบันทึกลงตาราง system_alert ใน MySQL จนกว่าจะผ่าน Stage 2 Merge
    // (ซึ่งบาง Process ไม่จำเป็นต้องผ่าน Stage 2 เลย) — เพิ่มการเช็ค+แจ้งเตือนตรงนี้
    // โดยไม่เปลี่ยน status ของ draft (ยังเป็น DRAFT_INCOMPLETE/DRAFT_WAITING ตามเดิม
    // เพื่อให้ workflow ของ Stage 1→2 ยังทำงานเหมือนเดิม)
    const specStatus = getInternalStatus(vals, mk, dType);
    if (isBackendOnline && (specStatus === 'REJECT' || specStatus === 'ALERT')) {
        const alertLevel = specStatus === 'REJECT' ? 'ng' : 'alert';
        const alertMsg = `[${dType}] ${PRODUCTS[mk] ? PRODUCTS[mk].label : mk} | Fixture: ${fix} | PT: ${pt} | Status: ${specStatus} (Stage 1 Manual Input)`;
        sendSystemAlert(alertLevel, alertMsg, {
            product: mk,
            fixture: fix,
            oven,
            pt,
            dataType: dType,
            values: vals
        });
    }
    // ────────────────────────────────────────────────────────────────────────

    fixes.forEach(fix1 => {
        if (exist.length + added >= 4) return;

        const now = new Date();
        // Change: Always start as DRAFT_INCOMPLETE. Do not bypass to ACCEPT.
        let evalStatus = 'DRAFT_INCOMPLETE';

        const draftRec = {
            id: 'DRAFT_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            status: evalStatus,
            dataType: dType,
            model: mk,
            modelLabel: PRODUCTS[mk] ? PRODUCTS[mk].label : mk,
            pt, oven, fixture: fix1,
            buytime: document.getElementById('m-buytime').value || '00:00',
            mctime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
            date: document.getElementById('m-date').value || TODAY,
            team: document.getElementById('m-team').value || 'A/Day',
            operator: op,
            createdAt: now.toISOString(),
            values: { ...vals, draft_id: 'DRAFT_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) },
        };
        // Ensure id matches the one in values for reliable deduplication
        draftRec.values.draft_id = draftRec.id;

        DB.records.unshift(draftRec);
        added++;
    });

    if (added > 0) {
        const matchingDrafts = DB.records.filter(r =>
            (r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING') &&
            r.model === mk && r.pt === pt && r.oven === oven && r.dataType === dType
        );
        if (matchingDrafts.length >= 4) {
            matchingDrafts.forEach(r => {
                if (r.status === 'DRAFT_INCOMPLETE') r.status = 'DRAFT_WAITING';
            });
            showToast('ครบ 4 Records แล้ว สามารถนำเข้า About Data เพื่อไป Stage 2 ได้', 'success');
        } else {
            showToast(`บันทึก Draft แล้ว (${matchingDrafts.length}/4)`, 'info');
        }
        saveDB();

        if (window.BLoader) window.BLoader.show('กำลังบันทึกลงฐานข้อมูลถาวร...');
        try {
            if (isBackendOnline) await syncWithServer(false);
        } catch (e) {
            console.error('MySQL Sync Error:', e);
        }
        if (window.BLoader) window.BLoader.hide();

        renderAboutTable();
        renderPendingTable();
        updatePendingBadge();
        updateDashboard();

        // ล้างเฉพาะค่าวัด (ไม่ล้าง Fixture / PT / Oven)
        inputs.forEach(inp => {
            inp.value = '';
            inp.style.backgroundColor = '';
            inp.style.borderColor = '';
            inp.style.boxShadow = '';
            inp.style.color = '';
        });

        document.querySelectorAll('#dim-container input[class*="mi-"]').forEach(inp => {
            inp.value = '';
            inp.style.borderColor = '';
            inp.style.boxShadow = '';
            inp.style.color = '';
        });

        document.querySelectorAll('.dim-avg b').forEach(el => {
            el.textContent = '—';
            el.style.color = '';
        });

        document.querySelectorAll('#dim-container .dim-card').forEach(card => {
            card.className = 'dim-card';
        });
        document.querySelectorAll('#dim-container [id^="hint-"]').forEach(el => {
            el.textContent = '';
            el.style.display = 'none';
        });

        // 🔴 เอาคำสั่งล้าง m-fix1 ออกแล้วครับ!

        updateValidationBanner(mk);
        showToast(`✅ บันทึกลง MySQL ถาวรสำเร็จ (${added} ชิ้น)`, 'success');

        // ไม่ต้องเด้งไปแท็บ About Data เพื่อให้ผู้ใช้เห็น PENDING RECORDS
        /*
        const aboutBtn = document.querySelector('.nav-btn[data-tab="about"]');
        if (aboutBtn) {
            switchTab('about', aboutBtn);
        }
        */
    } else {
        showToast('⚠️ ไม่สามารถบันทึกได้ (กลุ่ม PT/Oven นี้ครบ 4 ชิ้นแล้ว)', 'warn');
    }
}
// ============================================================
// TASK 1 (Staging Area): renderPendingTable()
// Shows all PENDING_DATA drafts grouped by PT/Oven
// ============================================================
function renderPendingTable() {
    // 🔴 แก้ไข ID ให้ตรงกับ HTML ของคุณ
    const wrap = document.getElementById('pending-table-wrap');
    if (!wrap) return;

    // จัดกลุ่มตาม PT, Oven, Model, Type (เฉพาะ DRAFT_INCOMPLETE / DRAFT_WAITING)
    const groups = {};
    DB.records.filter(r => r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING').forEach(r => {
        const key = `${r.pt}|${r.oven}|${r.model}|${r.dataType}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    let html = '';
    Object.entries(groups).forEach(([key, recs]) => {
        recs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const sample = recs[0];
        const mLabel = PRODUCTS[sample.model] ? PRODUCTS[sample.model].label : sample.model;
        const batchFill = recs.length;
        const batchPct = Math.round((batchFill / 4) * 100);
        const progressColor = batchFill >= 4 ? 'var(--pass)' : 'var(--blue)';

        html += `<div style="margin-bottom:18px;border:1.5px solid var(--border2);border-radius:8px;overflow:hidden;">
          <div style="padding:10px 16px;background:var(--bg3);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-weight:700;color:var(--text);font-size:13px;">📦 ${mLabel}</span>
            <span class="badge" style="background:rgba(9,132,227,0.12);color:var(--blue);font-weight:600;">${sample.dataType}</span>
            <span style="font-size:12px;color:var(--text2);">PT: <b>${sample.pt}</b> &nbsp;|&nbsp; Oven: <b>${sample.oven}</b> &nbsp;|&nbsp; Date: ${sample.date}</span>
            
            <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
              <button class="btn btn-primary btn-sm" onclick="pushToAboutData('${sample.pt}', '${sample.oven}', '${sample.model}', '${sample.dataType}')">💾 นำเข้า About Data (Waiting)</button>
              
              <div style="width:80px;height:8px;background:var(--bg4);border-radius:4px;overflow:hidden;margin-left:10px;">
                <div style="width:${batchPct}%;height:100%;background:${progressColor};border-radius:4px;transition:width 0.3s;"></div>
              </div>
              <span style="font-size:12px;font-weight:700;color:${progressColor}">${batchFill}/4 ชิ้น</span>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
            <thead style="background:var(--bg2);color:var(--text3);border-bottom:1px solid var(--border2);">
              <tr>
                <th style="padding:8px 16px;width:50px">#</th>
                <th style="padding:8px 16px">FIXTURE</th>
                <th style="padding:8px 16px">CREATED</th>
                <th style="padding:8px 16px">ACTIONS</th>
              </tr>
            </thead>
            <tbody>`;

        recs.forEach((r, idx) => {
            const t = r.createdAt ? new Date(r.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
            html += `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:8px 16px;font-weight:600">${idx + 1}</td>
              <td style="padding:8px 16px">${r.fixture}</td>
              <td style="padding:8px 16px;color:var(--text3)">${r.date} ${t}</td>
              <td style="padding:8px 16px">
                <button class="btn btn-outline btn-sm" onclick="deleteDraft('${r.id}')" style="color:var(--fail);border-color:transparent;background:var(--fail-bg);padding:4px 8px">🗑️</button>
              </td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    });

    if (!html) {
        html = `<div class="empty" style="padding:20px"><div class="ei">📭</div><p>ยังไม่มี Pending Records — กด "Save as Draft" เพื่อเริ่มต้น</p></div>`;
    }
    wrap.innerHTML = html;
}

function pushToAboutData(pt, oven, model, dataType) {
    const drafts = DB.records.filter(r => r.pt === pt && r.oven === oven && r.model === model && r.dataType === dataType && (r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING'));
    if (drafts.length === 0) return;

    drafts.forEach(d => {
        d.status = 'WAITING';
    });

    saveDB();

    renderPendingTable();
    updatePendingBadge();
    renderAboutTable();
    updateDashboard();
    syncToBackend(true);
    // NEW: Sync to backend
    resetManualForm();

    showToast(`✅ ย้ายข้อมูล PT: ${pt} ไปรอที่ About Data เรียบร้อยแล้ว`, 'success');
}

// ─── syncToBackend: wrapper ที่ถูก call จากหลายจุด ──────────────────────────
// Syncs DB to MySQL when online; silently skips when offline.
async function syncToBackend(showNotice = false) {
    if (typeof syncWithServer === 'function') {
        try {
            await syncWithServer(showNotice);
        } catch (e) {
            console.warn('syncToBackend: offline or error —', e);
        }
    }
}

function getMeasurementDimHeaders(mk) {
    if (!PRODUCTS[mk]) return '';
    return PRODUCTS[mk].dims
        .filter(d => isMeasurementDim(getDimId(d)))
        .map(d => `<th>${getDimId(d).replace(/_/g, ' ')}</th>`)
        .join('');
}

function getMeasurementDimCells(rec) {
    if (!PRODUCTS[rec.model]) return '';
    return PRODUCTS[rec.model].dims
        .filter(d => isMeasurementDim(getDimId(d)))
        .map(d => {
            const id = getDimId(d);
            const v = rec.values[id];
            const display = (v !== undefined && v !== null) ? v.toFixed(4) : '<span style="color:var(--text3)">—</span>';
            return `<td style="font-family:monospace;font-size:11px;">${display}</td>`;
        })
        .join('');
}

async function deleteDraft(draftId) {
    await deleteRecord(draftId);
    renderPendingTable();
    updatePendingBadge();
}

async function clearAllDrafts() {
    if (!confirm('ลบ Draft ทั้งหมดที่ยังรอ Merge?')) return;

    const waitingRecords = DB.records.filter(r => r.status === 'WAITING');
    DB.records = DB.records.filter(r => r.status !== 'WAITING');
    saveDB();

    if (isBackendOnline) {
        for (const r of waitingRecords) {
            if (!String(r.id).startsWith('DRAFT_')) {
                try {
                    await fetch(`${API_BASE}/api/dispensing/records/${r.id}`, { method: 'DELETE' });
                } catch (e) { console.error('Failed to delete draft on server', e); }
            }
        }
    }

    renderPendingTable();
    updatePendingBadge();
    showToast('🗑️ ล้าง Drafts ทั้งหมดแล้ว', 'info');
}

function updatePendingBadge(count) {
    const badge = document.getElementById('badge-pending');
    if (!badge) return;
    // 🔴 แก้ไข: ให้นับจำนวนจากสถานะ DRAFT_INCOMPLETE หรือ DRAFT_WAITING
    const n = count !== undefined ? count : DB.records.filter(r => r.status === 'DRAFT_INCOMPLETE' || r.status === 'DRAFT_WAITING').length;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-block' : 'none';
}

// ============================================================
// TASK 3: Bulk Text Parser + Auto-Mapping
// ============================================================

// Determine which dims receive text data (SM Flash cols) for a model.
// They are the non-measurement dims, in their declaration order.
function getTextDimOrder(mk) {
    if (!PRODUCTS[mk]) return [];
    return PRODUCTS[mk].dims
        .map(d => getDimId(d))
        .filter(id => !isMeasurementDim(id));
}

function parseBulkText(rawText) {
    // Returns array of arrays of numbers, one per line (empty lines skipped)
    if (!rawText || !rawText.trim()) return [];
    return rawText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && /[\d.\-]/.test(line))
        .map(line => {
            // Prefer tab split; fallback to multi-space, then single-space
            let parts;
            if (line.includes('\t')) {
                parts = line.split('\t');
            } else if (/  +/.test(line)) {
                parts = line.split(/\s{2,}/);
            } else {
                parts = line.split(/\s+/);
            }
            return parts
                .map(p => p.trim())
                .filter(p => p !== '')
                .map(p => parseFloat(p))
                .filter(n => !isNaN(n));
        })
        .filter(row => row.length > 0);
}

// ============================================================
// TASK 3: Smart Dictionary-Aware Dim Map Builder
// Handles duplicate variable headers from text_dict.txt structure.
// e.g. "X1 Y1 Bobbin_pos1 X1 Y1 Bobbin_pos2" → second X1/Y1 map
// to different dims because PRODUCTS already has unique IDs.
// Positional mapping: column[i] → textDims[i]
// ============================================================
function buildDictDimMap(mk) {
    // Returns the ordered text-data dim IDs for positional mapping.
    // Already deduplicated via unique PRODUCTS dim names.
    return getTextDimOrder(mk);
}

function parseTextLineToValues(numbers, textDims) {
    // Map numbers positionally to textDims. Returns { dimId: value }.
    const vals = {};
    textDims.forEach((dimId, i) => {
        if (i < numbers.length && !isNaN(numbers[i])) {
            vals[dimId] = parseFloat(numbers[i].toFixed(4));
        }
    });
    return vals;
}

function parseBulkTextSmart(rawText, mk) {
    if (!rawText || !rawText.trim()) return [];
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return [];

    const validTextDims = getTextDimOrder(mk);
    const parsedRecords = [];

    let headerMapping = null;
    let dataStartIndex = 0;

    // 1. ค้นหา Header Row (เช็คจาก 5 บรรทัดแรก เพื่อจับคู่ชื่อคอลัมน์)
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i];
        let parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
        if (parts.length < 2) parts = line.split(/\s+/);

        let mapping = {};
        let matchCount = 0;
        let colHeaders = [];

        parts.forEach((p, colIdx) => {
            const cleanP = p.trim();
            colHeaders.push(cleanP);
            const dimId = mapHeaderToKey(cleanP, mk, colIdx, colHeaders);
            if (dimId && validTextDims.includes(dimId)) {
                mapping[colIdx] = dimId;
                matchCount++;
            }
        });

        // ถ้าเจอชื่อคอลัมน์ที่ตรงกับตัวแปรอย่างน้อย 3 ตัว ถือว่าเป็น Header
        if (matchCount >= 3 || (matchCount > 0 && matchCount === validTextDims.length)) {
            headerMapping = mapping;
            dataStartIndex = i + 1;
            break;
        }
    }

    if (headerMapping) {
        // 2A. มี Header (Copy มาจาก Excel ทั้งตาราง) -> ดึงค่าตรงช่องเป๊ะๆ
        for (let i = dataStartIndex; i < lines.length; i++) {
            const line = lines[i];
            let parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
            if (parts.length < 2) parts = line.split(/\s+/);

            let rowVals = {};
            let hasValidNumber = false;

            Object.entries(headerMapping).forEach(([colIdx, dimId]) => {
                if (colIdx < parts.length) {
                    let valStr = parts[colIdx].trim();
                    if (valStr !== '' && valStr !== '-') {
                        let val = parseFloat(valStr);
                        if (!isNaN(val)) {
                            rowVals[dimId] = parseFloat(val.toFixed(4));
                            hasValidNumber = true;
                        }
                    }
                }
            });

            if (hasValidNumber) parsedRecords.push(rowVals);
        }
    } else {
        // 2B. ไม่มี Header (Copy มาแต่ตัวเลข) -> ดึงตามลำดับจากขวาไปซ้าย
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!/[\d.\-]/.test(line)) continue;

            let parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
            if (parts.length < 2) parts = line.split(/\s+/);

            let numbers = parts.map(p => parseFloat(p.trim())).filter(n => !isNaN(n));

            if (numbers.length > 0) {
                let rowVals = {};
                // ตัดเอาตัวเลขจากขวาสุด เผื่อมีคอลัมน์ No, Date, Time เกินมาด้านซ้าย
                let startIdx = 0;
                if (numbers.length > validTextDims.length) {
                    startIdx = numbers.length - validTextDims.length;
                }

                validTextDims.forEach((dimId, idx) => {
                    let nIdx = startIdx + idx;
                    if (nIdx < numbers.length) {
                        rowVals[dimId] = parseFloat(numbers[nIdx].toFixed(4));
                    }
                });
                parsedRecords.push(rowVals);
            }
        }
    }
    return parsedRecords;
}

function onMergeModelChange() {
    refreshMergePreview();
}

function refreshMergePreview() {
    const mk = document.getElementById('merge-model').value;
    const ptFilter = document.getElementById('merge-pt').value.trim();
    const ovFilter = document.getElementById('merge-oven').value.trim();
    const batch = parseInt(document.getElementById('merge-batch').value) || 4;
    const rawText = document.getElementById('bulk-merge-textarea').value;
    const previewArea = document.getElementById('merge-preview-area');
    const mergeBtn = document.getElementById('btn-bulk-merge');

    if (!mergeBtn) return;

    if (!mk) {
        if (previewArea) previewArea.innerHTML = '<p style="color:var(--text3);font-size:12px;">เลือก Product ก่อน</p>';
        mergeBtn.disabled = true;
        mergeBtn.textContent = '⚡ Merge Text Data (0 records)';
        return;
    }

    // ── Use smart parser ──
    const textDims = buildDictDimMap(mk);
    const parsedRows = parseBulkTextSmart(rawText, mk);

    // ─── Fix: ค้นหา WAITING records จาก DRAFT_DB (ไม่ใช่ DB.records) ───────
    // เหตุผล: records ที่ save ด้วย saveManualDraft() จะอยู่ใน DRAFT_DB เสมอ
    // จะถูกย้ายไป DB.records ก็ต่อเมื่อ merge สำเร็จเท่านั้น
    const candidates = DB.records.filter(r =>
        r.status === 'WAITING' && r.model === mk &&
        (ptFilter === '' || r.pt === ptFilter) &&
        (ovFilter === '' || r.oven === ovFilter)
    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const targetCount = Math.min(parsedRows.length, candidates.length);

    mergeBtn.disabled = targetCount === 0;
    mergeBtn.textContent = `⚡ Merge Text Data (${targetCount} records)`;

    if (!previewArea) return;

    if (parsedRows.length === 0 && rawText.trim().length > 0) {
        previewArea.innerHTML = '<p style="color:var(--fail);font-size:12px;">❌ ไม่พบข้อมูลตัวเลขในข้อความที่วาง — ตรวจสอบ format อีกครั้ง</p>';
        return;
    }

    if (candidates.length === 0) {
        previewArea.innerHTML = `<p style="color:var(--text3);font-size:12px;">⚠️ ไม่พบ WAITING Drafts สำหรับ ${PRODUCTS[mk].label}${ptFilter ? ` / PT: ${ptFilter}` : ''}${ovFilter ? ` / Oven: ${ovFilter}` : ''} — กรอกข้อมูล Stage 1 ก่อนแล้วกดปุ่ม "บันทึกค่าวัด (Save Draft)"</p>`;
        return;
    }

    const requiredBatch = parseInt(document.getElementById('merge-batch').value) || 4;
    if (candidates.length < requiredBatch) {
        previewArea.innerHTML = `<p style="color:var(--fail);font-size:12px;">❌ ${PRODUCTS[mk].label} ต้องบันทึกให้ครบ ${requiredBatch} Drafts ก่อนถึงจะ Merge ได้ (ตอนนี้มี ${candidates.length}/${requiredBatch})</p>`;
        mergeBtn.disabled = true;
        return;
    }

    if (parsedRows.length === 0) {
        previewArea.innerHTML = '<p style="color:var(--text3);font-size:12px;">วางข้อมูลในช่อง Textarea เพื่อ Preview</p>';
        return;
    }

    // ── Build 1-to-1 preview table ──────────────────────────────────────────
    let html = `<div style="font-size:12px;margin-bottom:8px;color:var(--text2);">
      <b>📋 Preview — 1-to-1 Merge: Line → Record</b><br>
      ${targetCount} records จะถูก Merge (คัดลอกร่าง WAITING 1 ตัว กระจายให้ ${parsedRows.length} บรรทัด)<br>
      <span style="color:var(--blue);font-size:11px;">Column mapping: ${textDims.join(' → ')}</span>
    </div>
    <div class="tbl-wrap" style="max-height:260px;overflow:auto;">
      <table style="font-size:11px;">
        <thead><tr>
          <th style="background:rgba(108,92,231,0.08)">Line#</th>
          <th>Draft ID</th><th>Fixture</th><th>PT / Oven</th>
          ${textDims.map(d => `<th style="white-space:nowrap">${d.replace(/_/g, ' ')}</th>`).join('')}
          <th>→ Status</th>
        </tr></thead>
        <tbody>`;

    for (let i = 0; i < targetCount; i++) {
        const draft = candidates[i];
        const lineVals = parsedRows[i];
        // Simulate merged status — same logic as bulkTextMerge (completeness gate first)
        const simVals = { ...draft.values };
        Object.entries(lineVals).forEach(([k, v]) => { simVals[k] = v; }); // merge ALL SM Flash values
        const simAllDims = PRODUCTS[mk].dims.map(d => getDimId(d));
        const simMissing = simAllDims.filter(id => { const v = simVals[id]; return v === undefined || v === null || v === '' || v === '-'; });
        const simStatus = simMissing.length > 0 ? 'INCOMPLETE' : getInternalStatus(simVals, mk, draft.dataType || '');
        const statusColor = { ACCEPT: 'var(--pass)', ALERT: 'var(--warn)', REJECT: 'var(--fail)', INCOMPLETE: 'var(--purple)' }[simStatus] || 'var(--text3)';

        html += `<tr style="border-left:3px solid var(--blue)">
          <td style="font-weight:700;color:var(--primary);text-align:center;">L${i + 1}→R${i + 1}</td>
          <td style="font-size:10px;color:var(--text3)">${draft.id.slice(-8)}</td>
          <td style="font-weight:700">${draft.fixture}</td>
          <td>${draft.pt} / ${draft.oven}</td>
          ${textDims.map(dimId => {
            const v = lineVals[dimId];
            const hasVal = v !== undefined && !isNaN(v);
            return `<td style="font-family:monospace;color:${hasVal ? 'var(--pass)' : 'var(--text3)'}">
                ${hasVal ? v.toFixed(4) : '—'}
              </td>`;
        }).join('')}
          <td style="font-weight:700;color:${statusColor};">→ ${simStatus}</td>
        </tr>`;
    }

    html += '</tbody></table></div>';
    previewArea.innerHTML = html;
}

// ============================================================
// TASK 3: bulkTextMerge() — The main merge function
// ============================================================
// ============================================================
// TASK 2 + TASK 3: bulkTextMerge() — Strict 1-to-1 Individual Merge
// Line 1 → PENDING Record 1 | Line 2 → Record 2 | etc.
// Each merged record becomes its own COMPLETE entry in DB.
// Uses parseBulkTextSmart for smart positional dim mapping.
// ============================================================
function bulkTextMerge() {
    const mk = document.getElementById('merge-model').value;
    const ptFilter = document.getElementById('merge-pt').value.trim();
    const ovFilter = document.getElementById('merge-oven').value.trim();
    const rawText = document.getElementById('bulk-merge-textarea').value;

    if (!mk) { showToast('กรุณาเลือก Product', 'warn'); return; }

    const parsedRows = parseBulkTextSmart(rawText, mk);
    if (parsedRows.length === 0) { showToast('❌ ไม่พบข้อมูล SM Flash ในข้อความที่วาง', 'error'); return; }

    // ─── Fix: ค้นหา WAITING drafts จาก DRAFT_DB โดยตรง ───────────────────────
    const candidates = DB.records.filter(r =>
        r.status === 'WAITING' && r.model === mk &&
        (ptFilter === '' || r.pt === ptFilter) &&
        (ovFilter === '' || r.oven === ovFilter)
    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (candidates.length === 0) {
        showToast('❌ ไม่พบ WAITING Drafts — กรุณา Save Draft ใน Stage 1 ก่อน', 'error');
        return;
    }

    const requiredBatch = parseInt(document.getElementById('merge-batch').value) || 4;
    if (candidates.length < requiredBatch) {
        showToast(`❌ ${PRODUCTS[mk].label} ต้องการ Draft ครบ ${requiredBatch} ชิ้นก่อน Merge (ปัจจุบันมี ${candidates.length}/${requiredBatch})`, 'error');
        return;
    }

    const targetCount = Math.min(parsedRows.length, candidates.length);
    let updatedCount = 0;
    const mergedDraftIds = [];

    for (let i = 0; i < targetCount; i++) {
        // Update the candidate draft IN-PLACE to preserve its database ID
        const draftRec = candidates[i];
        const lineVals = parsedRows[i];

        // 1. รวมข้อมูล (Merge Stage 1 Measurement + Stage 2 SM Flash)
        Object.entries(lineVals).forEach(([dimId, val]) => {
            draftRec.values[dimId] = val;
        });

        // 2. ตรวจสอบความสมบูรณ์
        const allDimIds = PRODUCTS[draftRec.model].dims.map(d => getDimId(d));
        const missing = allDimIds.filter(id => (
            draftRec.values[id] === undefined || draftRec.values[id] === null || draftRec.values[id] === ''
        ));

        // 3. คำนวณสถานะใหม่
        let finalStatus;
        if (missing.length > 0) {
            finalStatus = 'INCOMPLETE';
        } else {
            finalStatus = getInternalStatus(draftRec.values, draftRec.model, draftRec.dataType);
        }

        // 4. อัปเดต record ใน DB.records
        const now = new Date();
        draftRec.status = finalStatus;
        draftRec._mergedAt = now.toISOString();
        delete draftRec.createdAt; // ลบ field ที่ใช้เฉพาะ draft

        updatedCount++;

        checkRealtimeAlertAndNotify(draftRec); // 📢 Trigger alert ถ้าค่าเกิน Spec

        // ─── Auto-alert เข้า System Alert Center ถ้า NG หรือ ALERT ─────────
        // (เดิม Stage 2 ไม่เคยเรียก sendSystemAlert เลย ทำให้ warning จาก
        //  การ Merge ไม่เคยถูกบันทึกลงตาราง system_alert ใน MySQL)
        if (finalStatus === 'REJECT' || finalStatus === 'ALERT') {
            const alertLevel = finalStatus === 'REJECT' ? 'ng' : 'alert';
            const alertMsg = `[${draftRec.dataType}] ${PRODUCTS[draftRec.model] ? PRODUCTS[draftRec.model].label : draftRec.model} | Fixture: ${draftRec.fixture} | PT: ${draftRec.pt} | Status: ${finalStatus} (Stage 2 Merge)`;
            sendSystemAlert(alertLevel, alertMsg, {
                product: draftRec.model,
                fixture: draftRec.fixture,
                oven: draftRec.oven,
                pt: draftRec.pt,
                dataType: draftRec.dataType,
                values: draftRec.values
            });
        }
    }

    // 6. บันทึก localStorage
    saveDB();

    // 7. อัปเดต UI
    renderPendingTable();
    updatePendingBadge();
    renderAboutTable();
    updateDashboard();

    // 8. Sync ขึ้น MySQL ทันที
    if (isBackendOnline) {
        syncWithServer(false).then(() => {
            showToast(`✅ Merge + บันทึก MySQL สำเร็จ ${updatedCount} รายการ — สถานะอัปเดตตามเกณฑ์แล้ว`, 'success');
        }).catch(() => {
            showToast(`✅ Merge สำเร็จ ${updatedCount} รายการ (ออฟไลน์ — จะ sync เมื่อออนไลน์)`, 'warn');
        });
    } else {
        showToast(`✅ Merge สำเร็จ ${updatedCount} รายการ (Offline Mode — จะ sync เมื่อออนไลน์)`, 'warn');
    }

    document.getElementById('bulk-merge-textarea').value = '';
    document.getElementById('merge-preview-area').innerHTML = '';
    const mergeBtn = document.getElementById('btn-bulk-merge');
    if (mergeBtn) { mergeBtn.disabled = true; mergeBtn.textContent = '⚡ Merge Text Data (0 records)'; }
}

// ─── Handle .txt/.csv file upload for bulk merge ─────────────
function handleMergeFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        document.getElementById('bulk-merge-textarea').value = e.target.result;
        refreshMergePreview();
    };
    reader.readAsText(file);
    input.value = '';
}

// ─── Populate merge-model dropdown when tabs switch ──────────
function populateMergeDropdown() {
    const el = document.getElementById('merge-model');
    if (!el) return;
    const prev = el.value;

    // ใช้ getProductOptions('all', false, true) เพื่อดึง Product แบบเดียวกับ Manual Input
    el.innerHTML = getProductOptions('all', false, true);

    if (el.querySelector(`option[value="${prev}"]`)) {
        el.value = prev;
    } else {
        el.value = '';
    }
}

// ─── Hook into existing switchTab to refresh pending panel ───
const _origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
if (_origSwitchTab) {
    window.switchTab = function (tab, btn) {
        _origSwitchTab(tab, btn);
        if (tab === 'manual' || tab === 'stage2') {
            renderPendingTable();
            populateMergeDropdown();
            updatePendingBadge();
        }
    };
}

// ─── Also make both the manual sub-panels visible together ──
// The pending panel has id="panel-manual-pending" but uses class tab-panel.
// We need it to show whenever manual tab is active.
(function patchManualPanelVisibility() {
    const orig = document.getElementById.bind(document);
    // Override switchTab directly (safe re-wrap)
    const _st2 = window.switchTab;
    window.switchTab = function (tab, btn) {
        _st2(tab, btn);
        const pendingPanel = document.getElementById('panel-manual-pending');
        if (pendingPanel) {
            pendingPanel.classList.toggle('active', tab === 'manual');
        }
    };

    // Ensure it's visible on first load if manual tab is active
    document.addEventListener('DOMContentLoaded', () => {
        const pendingPanel = document.getElementById('panel-manual-pending');
        if (pendingPanel) pendingPanel.classList.add('active');
        renderPendingTable();
        populateMergeDropdown();
        updatePendingBadge();
    });
})();

function setPF(id, val) {
    const toggle = document.getElementById(`toggle-${id}`);
    const input = document.getElementById(`m-${id}`);
    if (!toggle || !input) return;

    // Toggle logic (click again to unselect)
    if (input.value === val) {
        input.value = '';
        toggle.setAttribute('data-value', '');
    } else {
        input.value = val;
        toggle.setAttribute('data-value', val);
    }
}

function resetManualForm() {
    // 🔴 เอาบรรทัดรีเซ็ต Fixture ออกแล้วครับ (ไม่ต้องกรอกใหม่)
    // document.getElementById('m-fix1').value = ''; 

    document.getElementById('m-pt').value = '';
    document.getElementById('m-oven').value = '';

    // ล้างค่า PF-toggles
    ['vmi', 'coil_height', 'hi_pot'].forEach(id => {
        const t = document.getElementById(`toggle-${id}`);
        const i = document.getElementById(`m-${id}`);
        if (t) t.setAttribute('data-value', '');
        if (i) i.value = '';
    });

    // ล้างค่าในช่องกรอก Manual
    const dimContainer = document.getElementById('manual-dim-cards');
    if (dimContainer) {
        dimContainer.querySelectorAll('input.manual-field').forEach(inp => {
            inp.value = '';
            inp.style.borderColor = '';
            inp.style.backgroundColor = '';
        });
        dimContainer.querySelectorAll('[id^="avg-"]').forEach(el => el.innerHTML = '<b>—</b>');
    }
}