// system_config.js  v2.0
// – POF: แสดง dimension ตาม types[] ของ product (sl / bobbin) จาก PRODUCTS_DEFAULT
// – แก้บัค product dropdown ซ้ำ (ใช้ product_key เป็น value โดยตรง)
// – เพิ่ม POF SPC Rules editor (Rule1 / Rule2 / Rule3)

let currentModule = 'dispensing';
let currentLimits = [];

// ──────────────────────────────────────────────
//  POF – product catalogue (ดึงจาก push_out_force.js)
//  ถ้า PRODUCTS_DEFAULT ยังไม่โหลด (system_config เปิดแยก)
//  ให้กำหนด fallback ขั้นต่ำตรงนี้
// ──────────────────────────────────────────────
function getPOFProductsDefault() {
    if (typeof PRODUCTS_DEFAULT !== 'undefined') return PRODUCTS_DEFAULT;
    // Fallback: minimal catalogue (key → { label, unit, types[] })
    return {
        cim3d: { label: 'Cimarron BP 3D', unit: 'Lbs', types: ['sl'] },
        cim4d: { label: 'Cimarron BP 4D', unit: 'Lbs', types: ['sl', 'bobbin'] },
        cim5d: { label: 'Cimarron BP 5D', unit: 'Lbs', types: ['sl', 'bobbin'] },
        comet: { label: 'ComET', unit: 'Lbs', types: ['sl'] },
        dor5d: { label: 'Dorado 5D', unit: 'Lbs', types: ['sl'] },
        dor5dbb: { label: 'Dorado 5D AL BB', unit: 'Lbs', types: ['sl', 'bobbin'] },
        dor10d: { label: 'Dorado 10D', unit: 'Lbs', types: ['sl', 'bobbin'] },
        m11p: { label: 'M11 P', unit: 'Lbs', types: ['sl'] },
        mar10d: { label: 'Marlin 10D', unit: 'Lbs', types: ['sl', 'bobbin'] },
        ros1d: { label: 'Rosewood 1D', unit: 'Kgf', types: ['sl'] },
        ros2d: { label: 'Rosewood 2D', unit: 'Kgf', types: ['sl', 'bobbin'] },
        sky1d: { label: 'Skybolt 1D', unit: 'Kgf', types: ['sl'] },
        sky2d: { label: 'Skybolt 2D', unit: 'Kgf', types: ['sl'] },
        sky3d: { label: 'Skybolt 3D', unit: 'Kgf', types: ['sl'] },
        sky4d: { label: 'Skybolt 4D', unit: 'Kgf', types: ['sl'] },
        sum10d: { label: 'Summit 10D', unit: 'Lbs', types: ['sl', 'bobbin'] },
        v111d: { label: 'V11 1D', unit: 'Lbs', types: ['sl'] },
        v112d: { label: 'V11 2D', unit: 'Lbs', types: ['sl'] },
        v114d: { label: 'V11 4D', unit: 'Lbs', types: ['sl'] },
        v15: { label: 'V15 CMR 4D', unit: 'Lbs', types: ['sl'] },
    };
}

// ──────────────────────────────────────────────
//  POF – dimension list ตาม types[]
//  sl  → long_fantail, short_fantail
//  bobbin → bobbin1, bobbin2
// ──────────────────────────────────────────────
function getPOFDimsForProduct(productKey) {
    const cat = getPOFProductsDefault();
    const p = cat[productKey];
    if (!p) return ['long_fantail', 'short_fantail']; // default fallback
    const dims = [];
    if (p.types.includes('sl')) {
        dims.push('long_fantail', 'short_fantail');
    }
    if (p.types.includes('bobbin')) {
        dims.push('bobbin1', 'bobbin2');
    }
    return dims;
}

// ──────────────────────────────────────────────
//  DOMContentLoaded
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initGlobalNavigation('system_config');
    loadProductsDropdown();
    selectModule('dispensing');
});

// ──────────────────────────────────────────────
//  Toast
// ──────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const p = document.getElementById('toast-panel');
    if (!p) return;
    const t = document.createElement('div');
    t.className = `alert alert-${type}`;
    t.innerHTML = msg;
    p.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

// ──────────────────────────────────────────────
//  selectModule
// ──────────────────────────────────────────────
function selectModule(mod) {
    currentModule = mod;

    // Active button highlight
    document.querySelectorAll('.mod-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.module === mod) btn.classList.add('active');
    });

    const labels = {
        dispensing: 'Dispensing',
        laser: 'Laser Engraving',
        pof: 'Push Out Force',
        damper: 'Damper Install',
    };
    document.getElementById('lbl-current-module').innerText = labels[mod] || mod;

    // แสดง / ซ่อน POF Rules section
    const rulesSection = document.getElementById('pof-rules-section');
    if (rulesSection) {
        rulesSection.style.display = (mod === 'pof') ? 'block' : 'none';
    }

    updateTableHeader(mod);
    loadSPCLimits();

    // โหลด POF rules ถ้าเปลี่ยนมาหน้า pof
    if (mod === 'pof') loadPOFRules();
}

// ──────────────────────────────────────────────
//  Table header ตาม module
// ──────────────────────────────────────────────
function updateTableHeader(mod) {
    const thead = document.getElementById('spc-head');
    if (mod === 'laser') {
        thead.innerHTML = `
      <tr>
        <th>Product</th>
        <th>Qty</th>
        <th>Fixture</th>
        <th>Shift</th>
      </tr>`;
    } else if (mod === 'damper') {
        thead.innerHTML = `
      <tr>
        <th>Product</th>
        <th>Dimension</th>
        <th>Frequency (pcs)</th>
        <th>LCL</th>
        <th>CL</th>
        <th>UCL</th>
      </tr>`;
    } else if (mod === 'pof') {
        thead.innerHTML = `
      <tr>
        <th>Product</th>
        <th>Dimension</th>
        <th>Mode</th>
        <th>Frequency (pcs)</th>
        <th>LSL</th>
        <th>LCL</th>
        <th>CL</th>
        <th>UCL</th>
        <th>USL</th>
      </tr>`;
    } else {
        thead.innerHTML = `
      <tr>
        <th>Product</th>
        <th>Dimension</th>
        <th>Frequency (pcs)</th>
        <th>LSL</th>
        <th>LCL</th>
        <th>CL</th>
        <th>UCL</th>
        <th>USL</th>
      </tr>`;
    }
}

// ──────────────────────────────────────────────
//  loadProductsDropdown – แก้บัค value ซ้ำ
//  ใช้ product_key จาก DB โดยตรง
// ──────────────────────────────────────────────
async function loadProductsDropdown() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/system/products`);
        if (!res.ok) throw new Error('Failed to fetch products');
        const data = await res.json();

        const sel = document.getElementById('filter-product');
        sel.innerHTML = '<option value="">-- All Products --</option>';

        if (data.products && data.products.length) {
            // Group by module ถ้า API ส่ง module_name มาด้วย
            data.products.forEach(p => {
                const opt = document.createElement('option');
                // ใช้ product_key เป็น value (ไม่ใช่ label) เพื่อกัน duplicate
                opt.value = p.product_key;
                opt.textContent = p.product_name || p.product_key;
                // เก็บ module ไว้ filter
                if (p.module_name) opt.dataset.module = p.module_name;
                sel.appendChild(opt);
            });
        }
    } catch (err) {
        console.warn('Could not load products', err);
        // Fallback: สร้างจาก PRODUCTS_DEFAULT (POF catalogue)
        if (currentModule === 'pof') {
            _fillDropdownFromCatalogue();
        }
    }
}

// Fallback กรณี API ไม่ตอบ – ใช้ catalogue ใน JS
function _fillDropdownFromCatalogue() {
    const sel = document.getElementById('filter-product');
    sel.innerHTML = '<option value="">-- All Products --</option>';
    const cat = getPOFProductsDefault();
    Object.entries(cat).forEach(([key, p]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = p.label;
        sel.appendChild(opt);
    });
}

// Filter dropdown เมื่อเปลี่ยน module
function filterProductDropdown() {
    const sel = document.getElementById('filter-product');
    Array.from(sel.options).forEach(opt => {
        if (!opt.value) return; // All Products – ไม่ซ่อน
        const m = opt.dataset.module || '';
        // ถ้า API ไม่ได้ส่ง module ข้อมูล ก็แสดงทุก option
        opt.style.display = (!m || m === currentModule) ? '' : 'none';
    });
    // reset ถ้า option ปัจจุบัน hidden
    if (sel.selectedOptions[0]?.style.display === 'none') sel.value = '';
}

// ──────────────────────────────────────────────
//  loadSPCLimits
// ──────────────────────────────────────────────
async function loadSPCLimits() {
    filterProductDropdown();

    const mode = currentModule;
    const product = document.getElementById('filter-product').value;
    const tbody = document.getElementById('spc-body');
    const colSpan = mode === 'laser' ? 4 : mode === 'damper' ? 6 : mode === 'pof' ? 9 : 8;

    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center">Loading…</td></tr>`;

    try {
        let url = `${BACKEND_URL}/api/system/spc_limits?mode=${mode}`;
        if (product) url += `&product=${product}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('API not available');
        const data = await res.json();
        const dbLimits = data.limits || [];

        currentLimits = [];

        if (product) {
            let dims = _getDimsForModule(mode, product);

            dims.forEach(dimName => {
                // POF มี buyoff + roving แยกกัน
                if (mode === 'pof') {
                    ['buyoff', 'roving'].forEach(pofMode => {
                        let found = dbLimits.find(x =>
                            x.product_key === product &&
                            x.dimension_name === dimName &&
                            x.process_mode === pofMode
                        );
                        if (!found) {
                            found = _blankLimit(mode, product, dimName, pofMode);
                        }
                        currentLimits.push(found);
                    });
                } else {
                    let found = dbLimits.find(x =>
                        x.product_key === product && x.dimension_name === dimName
                    );
                    if (!found) found = _blankLimit(mode, product, dimName);
                    currentLimits.push(found);
                }
            });

            if (dims.length === 0 && dbLimits.length > 0) currentLimits = dbLimits;
        } else {
            currentLimits = dbLimits;
        }

        renderTable();
    } catch (err) {
        console.error(err);
        const colSpan2 = mode === 'laser' ? 4 : mode === 'damper' ? 6 : mode === 'pof' ? 9 : 8;
        tbody.innerHTML = `<tr><td colspan="${colSpan2}" style="text-align:center;color:var(--danger)">
      API Endpoint Not Found</td></tr>`;
    }
}

// คืน dimension list ตาม module + product_key
function _getDimsForModule(mode, productKey) {
    if (mode === 'laser') return ['laser_config'];
    if (mode === 'pof') return getPOFDimsForProduct(productKey);
    if (mode === 'damper') return ['bottom', 'top'];
    // dispensing – ใช้ PRODUCTS หรือ SPEC_BUYOFF ถ้ามี
    if (typeof PRODUCTS !== 'undefined' && PRODUCTS[productKey]) {
        const dims = PRODUCTS[productKey].dims || [];
        return dims.map(d => (typeof d === 'object' ? d.id : d));
    }
    return [];
}

// สร้าง blank limit row
function _blankLimit(mode, product, dimName, pofMode = null) {
    return {
        id: null,
        process_mode: pofMode || mode,
        product_key: product,
        dimension_name: dimName,
        lsl: null, lcl: null, cl: null, ucl: null, usl: null,
        frequency: null,
        laser_qty: null, laser_fixture: null, laser_shift: null,
    };
}

// ──────────────────────────────────────────────
//  renderTable
// ──────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('spc-body');
    tbody.innerHTML = '';

    if (currentLimits.length === 0) {
        const colSpan = currentModule === 'laser' ? 4 : currentModule === 'damper' ? 6 : currentModule === 'pof' ? 9 : 8;
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center">
      กรุณาเลือก Product เพื่อกำหนดค่า SPC limits</td></tr>`;
        return;
    }

    currentLimits.forEach((lim, idx) => {
        const tr = document.createElement('tr');

        if (currentModule === 'laser') {
            tr.innerHTML = `
        <td style="font-weight:600">${lim.product_key}</td>
        <td class="editable-cell"><input type="number" step="1" value="${_v(lim.laser_qty)}"
            onchange="updateLimit(${idx},'laser_qty',this.value)"></td>
        <td class="editable-cell"><input type="number" step="1" value="${_v(lim.laser_fixture)}"
            onchange="updateLimit(${idx},'laser_fixture',this.value)"></td>
        <td class="editable-cell"><input type="number" step="1" value="${_v(lim.laser_shift)}"
            onchange="updateLimit(${idx},'laser_shift',this.value)"></td>`;

        } else if (currentModule === 'damper') {
            tr.innerHTML = `
        <td style="font-weight:600">${lim.product_key}</td>
        <td>${_dimLabel(lim.dimension_name)}</td>
        <td class="editable-cell"><input type="number" step="1" value="${_v(lim.frequency)}"
            onchange="updateLimit(${idx},'frequency',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.0001" value="${_v(lim.lcl)}"
            onchange="updateLimit(${idx},'lcl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.0001" value="${_v(lim.cl)}"
            onchange="updateLimit(${idx},'cl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.0001" value="${_v(lim.ucl)}"
            onchange="updateLimit(${idx},'ucl',this.value)"></td>`;

        } else if (currentModule === 'pof') {
            // แสดง mode badge (buyoff / roving)
            const modeLabel = lim.process_mode === 'buyoff'
                ? '<span style="color:#dc2626;font-weight:700;font-size:10px">BUY OFF</span>'
                : '<span style="color:#2563eb;font-weight:700;font-size:10px">ROVING</span>';
            tr.innerHTML = `
        <td style="font-weight:600">${lim.product_key}</td>
        <td>${_dimLabel(lim.dimension_name)}</td>
        <td style="text-align:center">${modeLabel}</td>
        <td class="editable-cell"><input type="number" step="1" value="${_v(lim.frequency)}"
            onchange="updateLimit(${idx},'frequency',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.01" value="${_v(lim.lsl)}"
            onchange="updateLimit(${idx},'lsl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.01" value="${_v(lim.lcl)}"
            onchange="updateLimit(${idx},'lcl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.01" value="${_v(lim.cl)}"
            onchange="updateLimit(${idx},'cl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.01" value="${_v(lim.ucl)}"
            onchange="updateLimit(${idx},'ucl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.01" value="${_v(lim.usl)}"
            onchange="updateLimit(${idx},'usl',this.value)"></td>`;

        } else {
            // dispensing (default)
            tr.innerHTML = `
        <td style="font-weight:600">${lim.product_key}</td>
        <td>${_dimLabel(lim.dimension_name)}</td>
        <td class="editable-cell"><input type="number" step="1" value="${_v(lim.frequency)}"
            onchange="updateLimit(${idx},'frequency',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.0001" value="${_v(lim.lsl)}"
            onchange="updateLimit(${idx},'lsl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.0001" value="${_v(lim.lcl)}"
            onchange="updateLimit(${idx},'lcl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.0001" value="${_v(lim.cl)}"
            onchange="updateLimit(${idx},'cl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.0001" value="${_v(lim.ucl)}"
            onchange="updateLimit(${idx},'ucl',this.value)"></td>
        <td class="editable-cell"><input type="number" step="0.0001" value="${_v(lim.usl)}"
            onchange="updateLimit(${idx},'usl',this.value)"></td>`;
        }

        tbody.appendChild(tr);
    });
}

// helpers
function _v(val) { return (val !== null && val !== undefined) ? val : ''; }
function _dimLabel(name) {
    const map = {
        long_fantail: 'Long Fantail',
        short_fantail: 'Short Fantail',
        bobbin1: 'Bobbin 1',
        bobbin2: 'Bobbin 2',
        bottom: 'Bottom',
        top: 'Top',
        laser_config: 'Laser Config',
    };
    return map[name] || name;
}

// ──────────────────────────────────────────────
//  updateLimit
// ──────────────────────────────────────────────
function updateLimit(idx, field, val) {
    currentLimits[idx][field] = (val === '') ? null : parseFloat(val);
}

// ──────────────────────────────────────────────
//  saveSPCLimits
// ──────────────────────────────────────────────
async function saveSPCLimits() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/system/spc_limits/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limits: currentLimits }),
        });
        const data = await res.json();
        if (data.success) {
            showToast('บันทึกค่า SPC ลง MySQL สำเร็จ ✅');
            loadSPCLimits();
        } else {
            showToast('Error: ' + data.error, 'danger');
        }
    } catch (err) {
        showToast('Server error', 'danger');
        console.error(err);
    }
}

// ══════════════════════════════════════════════
//  POF SPC RULES
//  Rule1 : Out of control (UCL/LCL)
//  Rule2 : 9-point trend Up/Down
//  Rule3 : 6-point Increases / Decreases
// ══════════════════════════════════════════════

const POF_RULES_KEY = 'belton_pof_spc_rules';

const POF_RULES_DEFAULT = {
    rule1: { enabled: true, label: 'Rule 1 – Out of Control (UCL / LCL)', description: 'จุดข้อมูลอยู่นอก UCL หรือ LCL' },
    rule2: { enabled: true, label: 'Rule 2 – 9-Point Trend Up / Down', description: '9 จุดติดต่อกันอยู่ฝั่งเดียวกันของ CL (ทั้งหมด > CL หรือ < CL)' },
    rule3: { enabled: true, label: 'Rule 3 – 6-Point Monotone Increase / Decrease', description: '6 จุดติดต่อกันเพิ่มขึ้นหรือลดลงต่อเนื่อง' },
};

// โหลด rules จาก DB หรือ localStorage
async function loadPOFRules() {
    let rules = { ...POF_RULES_DEFAULT };

    // ลอง load จาก DB ก่อน
    try {
        const res = await fetch(`${BACKEND_URL}/api/system/config?key=${POF_RULES_KEY}`);
        if (res.ok) {
            const data = await res.json();
            if (data.value) {
                const parsed = JSON.parse(data.value);
                // merge ไม่ให้ label/description หาย
                Object.keys(rules).forEach(k => {
                    if (parsed[k] !== undefined) rules[k].enabled = !!parsed[k].enabled;
                });
            }
        }
    } catch {
        // fallback localStorage
        try {
            const saved = JSON.parse(localStorage.getItem(POF_RULES_KEY) || '{}');
            Object.keys(rules).forEach(k => {
                if (saved[k] !== undefined) rules[k].enabled = !!saved[k].enabled;
            });
        } catch { /* ignore */ }
    }

    _renderPOFRules(rules);
}

function _renderPOFRules(rules) {
    const container = document.getElementById('pof-rules-body');
    if (!container) return;
    container.innerHTML = '';

    Object.entries(rules).forEach(([key, rule]) => {
        const row = document.createElement('div');
        row.className = 'pof-rule-row';
        row.innerHTML = `
      <label class="pof-rule-toggle">
        <input type="checkbox" id="rule-chk-${key}" ${rule.enabled ? 'checked' : ''}
               onchange="onPOFRuleToggle()">
        <span class="pof-rule-slider"></span>
      </label>
      <div class="pof-rule-info">
        <div class="pof-rule-label">${rule.label}</div>
        <div class="pof-rule-desc">${rule.description}</div>
      </div>
      <div class="pof-rule-status" id="rule-status-${key}">
        ${rule.enabled
                ? '<span class="badge badge-pass">เปิดใช้งาน</span>'
                : '<span class="badge badge-fail">ปิดใช้งาน</span>'}
      </div>`;
        container.appendChild(row);
    });
}

function onPOFRuleToggle() {
    // อัปเดต status badge ทันที (UX)
    ['rule1', 'rule2', 'rule3'].forEach(k => {
        const chk = document.getElementById(`rule-chk-${k}`);
        const status = document.getElementById(`rule-status-${k}`);
        if (!chk || !status) return;
        status.innerHTML = chk.checked
            ? '<span class="badge badge-pass">เปิดใช้งาน</span>'
            : '<span class="badge badge-fail">ปิดใช้งาน</span>';
    });
}

async function savePOFRules() {
    const payload = {};
    ['rule1', 'rule2', 'rule3'].forEach(k => {
        const chk = document.getElementById(`rule-chk-${k}`);
        payload[k] = { enabled: chk ? chk.checked : true };
    });

    // บันทึกลง localStorage เสมอ (offline-safe)
    localStorage.setItem(POF_RULES_KEY, JSON.stringify(payload));

    // พยายามบันทึกลง DB
    try {
        const res = await fetch(`${BACKEND_URL}/api/system/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: POF_RULES_KEY, value: JSON.stringify(payload) }),
        });
        const data = await res.json();
        if (data.success) {
            showToast('บันทึก POF Rules สำเร็จ ✅');
        } else {
            showToast('บันทึก Rules ลง DB ไม่สำเร็จ (บันทึก local แล้ว)', 'warning');
        }
    } catch {
        showToast('บันทึก Rules ไว้ใน Local Storage แล้ว (offline mode)', 'warning');
    }
}