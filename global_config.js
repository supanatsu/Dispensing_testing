// ==========================================
// global_config.js
// Handles centralized configuration for all modules
// ==========================================

const LS_KEY_POF_CFG = 'belton_pof_v4_config';
const LS_KEY_LASER_CFG = 'belton_laser_config_v1';

// We pull the default POF products to populate the UI if no config exists
const POF_PRODUCTS_DEFAULT = {
    cim3d: { label: 'Cimarron BP 3D', unit: 'Lbs', types: ['sl'], spc: { buyoff: { sl: { spec: 25, trigger: 92.35, ucl: 217.11, cl: 167.21, lcl: 117.31, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 92.35, ucl: 217.11, cl: 167.21, lcl: 117.31, rucl: 25, rcl: 12.5 } }, roving: { sl: { spec: 25, trigger: 92.35, ucl: 217.11, cl: 167.21, lcl: 117.31, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 92.35, ucl: 217.11, cl: 167.21, lcl: 117.31, rucl: 25, rcl: 12.5 } } } },
    cim4d: { label: 'Cimarron BP 4D', unit: 'Lbs', types: ['sl', 'bobbin'], spc: { buyoff: { sl: { spec: 25, trigger: 64.5, ucl: 215, cl: 154.80, lcl: 94.60, rucl: 25, rcl: 12.5 }, bobbin: { spec: 2.5, trigger: 37.59, ucl: 343.03, cl: 272.85, lcl: 202.67, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 25, trigger: 64.5, ucl: 215, cl: 154.80, lcl: 94.60, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 37.59, ucl: 343.03, cl: 272.85, lcl: 202.67, rucl: 5, rcl: 2.5 } } } },
    cim5d: { label: 'Cimarron BP 5D', unit: 'Lbs', types: ['sl', 'bobbin'], spc: { buyoff: { sl: { spec: 25, trigger: 64.5, ucl: 215, cl: 154.80, lcl: 94.60, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 37.59, ucl: 343.03, cl: 272.85, lcl: 202.67, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 25, trigger: 64.5, ucl: 215, cl: 154.80, lcl: 94.60, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 37.59, ucl: 343.03, cl: 272.85, lcl: 202.67, rucl: 5, rcl: 2.5 } } } },
    comet: { label: 'ComET', unit: 'Lbs', types: ['sl'], spc: { buyoff: { sl: { spec: 25, trigger: 80, ucl: 220, cl: 160, lcl: 100, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 80, ucl: 220, cl: 160, lcl: 100, rucl: 30, rcl: 15 } }, roving: { sl: { spec: 25, trigger: 80, ucl: 220, cl: 160, lcl: 100, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 80, ucl: 220, cl: 160, lcl: 100, rucl: 30, rcl: 15 } } } },
    dor5d: { label: 'Dorado 5D', unit: 'Lbs', types: ['sl'], spc: { buyoff: { sl: { spec: 25, trigger: 100, ucl: 250, cl: 150, lcl: 80, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 100, ucl: 250, cl: 150, lcl: 80, rucl: 30, rcl: 15 } }, roving: { sl: { spec: 25, trigger: 100, ucl: 250, cl: 150, lcl: 80, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 100, ucl: 250, cl: 150, lcl: 80, rucl: 30, rcl: 15 } } } },
    dor5dbb: { label: 'Dorado 5D AL BB', unit: 'Lbs', types: ['sl', 'bobbin'], spc: { buyoff: { sl: { spec: 25, trigger: 100, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 100, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 } }, roving: { sl: { spec: 25, trigger: 100, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 100, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 } } } },
    dor10d: { label: 'Dorado 10D', unit: 'Lbs', types: ['sl', 'bobbin'], spc: { buyoff: { sl: { spec: 25, trigger: 60, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 }, bobbin: { spec: 2.5, trigger: 3.4, ucl: 15.53, cl: 9.94, lcl: 4.34, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 5, rcl: 2.5 } } } },
    dor10naad: { label: 'Dorado 10D NOAR-AAD', unit: 'Lbs', types: ['sl', 'bobbin'], spc: { buyoff: { sl: { spec: 25, trigger: 60, ucl: 253, cl: 165, lcl: 77, rucl: 30, rcl: 15 }, bobbin: { spec: 2.5, trigger: 3.4, ucl: 15.53, cl: 9.94, lcl: 4.34, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 5, rcl: 2.5 } } } },
    m11p: { label: 'M11 P', unit: 'Lbs', types: ['sl'], spc: { buyoff: { sl: { spec: 30, trigger: 65.2, ucl: 250.2, cl: 179.8, lcl: 109.4, rucl: 15, rcl: 7.5 }, bobbin: { spec: 30, trigger: 53.75, ucl: 150.49, cl: 103, lcl: 55.51, rucl: 10, rcl: 5 } }, roving: { sl: { spec: 30, trigger: 65.2, ucl: 250.2, cl: 179.8, lcl: 109.4, rucl: 15, rcl: 7.5 }, bobbin: { spec: 30, trigger: 53.75, ucl: 150.49, cl: 103, lcl: 55.51, rucl: 10, rcl: 5 } } } },
    mar10d: { label: 'Marlin 10D', unit: 'Lbs', types: ['sl', 'bobbin'], spc: { buyoff: { sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 10, rcl: 5 } }, roving: { sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 10, rcl: 5 } } } },
    ros1d: { label: 'Rosewood 1D', unit: 'Kgf', types: ['sl'], spc: { buyoff: { sl: { spec: 5.9, trigger: 10.1, ucl: 23.7, cl: 15.2, lcl: 6.6, rucl: 5, rcl: 2.5 }, bobbin: { spec: 2.5, trigger: 7.17, ucl: 23.18, cl: 13.86, lcl: 4.54, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 5.9, trigger: 10.1, ucl: 23.7, cl: 15.2, lcl: 6.6, rucl: 5, rcl: 2.5 }, bobbin: { spec: 2.5, trigger: 7.17, ucl: 23.18, cl: 13.86, lcl: 4.54, rucl: 5, rcl: 2.5 } } } },
    ros2d: { label: 'Rosewood 2D', unit: 'Kgf', types: ['sl', 'bobbin'], spc: { buyoff: { sl: { spec: 5.9, trigger: 10.1, ucl: 23.7, cl: 15.2, lcl: 6.6, rucl: 5, rcl: 2.5 }, bobbin: { spec: 2.5, trigger: 7.17, ucl: 23.18, cl: 13.86, lcl: 4.54, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 5.9, trigger: 10.1, ucl: 23.7, cl: 15.2, lcl: 6.6, rucl: 5, rcl: 2.5 }, bobbin: { spec: 2.5, trigger: 7.17, ucl: 23.18, cl: 13.86, lcl: 4.54, rucl: 5, rcl: 2.5 } } } },
    sky1d: { label: 'Skybolt 1D', unit: 'Kgf', types: ['sl'], spc: { buyoff: { sl: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 }, bobbin: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 }, bobbin: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 } } } },
    sky1dmm: { label: 'Skybolt 1D MM', unit: 'Kgf', types: ['sl'], spc: { buyoff: { sl: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 }, bobbin: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 }, bobbin: { spec: 6.81, trigger: 13.05, ucl: 25.77, cl: 17.46, lcl: 9.16, rucl: 5, rcl: 2.5 } } } },
    sky2d: { label: 'Skybolt 2D', unit: 'Kgf', types: ['sl'], spc: { buyoff: { sl: { spec: 11.34, trigger: 17.48, ucl: 37.55, cl: 25.27, lcl: 12.99, rucl: 5, rcl: 2.5 }, bobbin: { spec: 11.34, trigger: 17.48, ucl: 37.55, cl: 25.27, lcl: 12.99, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 11.34, trigger: 17.48, ucl: 37.55, cl: 25.27, lcl: 12.99, rucl: 5, rcl: 2.5 }, bobbin: { spec: 11.34, trigger: 17.48, ucl: 37.55, cl: 25.27, lcl: 12.99, rucl: 5, rcl: 2.5 } } } },
    sky3d: { label: 'Skybolt 3D', unit: 'Kgf', types: ['sl'], spc: { buyoff: { sl: { spec: 11.34, trigger: 17.34, ucl: 44.14, cl: 36.14, lcl: 28.14, rucl: 5, rcl: 2.5 }, bobbin: { spec: 11.34, trigger: 17.34, ucl: 44.14, cl: 36.14, lcl: 28.14, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 11.34, trigger: 17.34, ucl: 44.14, cl: 36.14, lcl: 28.14, rucl: 5, rcl: 2.5 }, bobbin: { spec: 11.34, trigger: 17.34, ucl: 44.14, cl: 36.14, lcl: 28.14, rucl: 5, rcl: 2.5 } } } },
    sky4d: { label: 'Skybolt 4D', unit: 'Kgf', types: ['sl'], spc: { buyoff: { sl: { spec: 11.34, trigger: 22.17, ucl: 79.09, cl: 57.44, lcl: 35.78, rucl: 5, rcl: 2.5 }, bobbin: { spec: 11.34, trigger: 22.17, ucl: 79.09, cl: 57.44, lcl: 35.78, rucl: 5, rcl: 2.5 } }, roving: { sl: { spec: 11.34, trigger: 22.17, ucl: 79.09, cl: 57.44, lcl: 35.78, rucl: 5, rcl: 2.5 }, bobbin: { spec: 11.34, trigger: 22.17, ucl: 79.09, cl: 57.44, lcl: 35.78, rucl: 5, rcl: 2.5 } } } },
    sum10d: { label: 'Summit 10D', unit: 'Lbs', types: ['sl', 'bobbin'], spc: { buyoff: { sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 10, rcl: 5 } }, roving: { sl: { spec: 25, trigger: 60, ucl: 319, cl: 244, lcl: 169, rucl: 30, rcl: 15 }, bobbin: { spec: 25, trigger: 103.3, ucl: 500.92, cl: 344.33, lcl: 187.73, rucl: 10, rcl: 5 } } } },
    v111d: { label: 'V11 1D', unit: 'Lbs', types: ['sl'], spc: { buyoff: { sl: { spec: 25, trigger: 87.03, ucl: 172.13, cl: 115.39, lcl: 58.66, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 60, ucl: 120, cl: 90, lcl: 60, rucl: 10, rcl: 5 } }, roving: { sl: { spec: 25, trigger: 87.03, ucl: 172.13, cl: 115.39, lcl: 58.66, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 60, ucl: 130, cl: 90, lcl: 50, rucl: 10, rcl: 5 } } } },
    v112d: { label: 'V11 2D', unit: 'Lbs', types: ['sl'], spc: { buyoff: { sl: { spec: 25, trigger: 93.97, ucl: 169.01, cl: 118.98, lcl: 68.95, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 93.97, ucl: 169.01, cl: 118.98, lcl: 68.95, rucl: 25, rcl: 12.5 } }, roving: { sl: { spec: 25, trigger: 93.97, ucl: 169.01, cl: 118.98, lcl: 68.95, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 93.97, ucl: 169.01, cl: 118.98, lcl: 68.95, rucl: 25, rcl: 12.5 } } } },
    v114d: { label: 'V11 4D', unit: 'Lbs', types: ['sl'], spc: { buyoff: { sl: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 } }, roving: { sl: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 } } } },
    v15: { label: 'V15 CMR 4D', unit: 'Lbs', types: ['sl'], spc: { buyoff: { sl: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 } }, roving: { sl: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 }, bobbin: { spec: 25, trigger: 60.22, ucl: 317.89, cl: 247.46, lcl: 177.03, rucl: 25, rcl: 12.5 } } } }
};

// Called when the Module Config tab is opened
function initGlobalConfig() {
    if (typeof window.populateFilteredDropdown === 'function') {
        const dtLaser = document.getElementById('gc-laser-datatype')?.value || 'buyoff';
        window.populateFilteredDropdown('laser', 'gc-laser-product', dtLaser);

        const dtDmp = document.getElementById('gc-dmp-datatype')?.value || 'buyoff';
        window.populateFilteredDropdown('damper', 'gc-dmp-product', dtDmp);
        
        const dtPof = document.getElementById('gc-pof-datatype')?.value || 'buyoff';
        window.populateFilteredDropdown('pof', 'gc-pof-product', dtPof);
    }

    loadGlobalLaserConfig();
    loadGlobalDamperConfig();
    if (typeof loadGlobalPofConfig === 'function') {
        loadGlobalPofConfig();
    } else {
        document.getElementById('gc-pof-product').value = '';
    }
}

// ========================
// LASER CONFIG
// ========================
function loadGlobalLaserConfig() {
    let cfg = { typeQty: {}, productQty: {}, fixtures: [], shifts: [] };

    // Fallback to localStorage if any legacy arrays exist, but prefer window.LASER_CONFIG
    try {
        const raw = localStorage.getItem(LS_KEY_LASER_CFG);
        if (raw) cfg = JSON.parse(raw);
    } catch (e) { }

    if (typeof window !== 'undefined' && window.LASER_CONFIG) {
        cfg.typeQty = window.LASER_CONFIG.typeQty || {};
        cfg.productQty = window.LASER_CONFIG.productQty || {};
    }

    if (!cfg.typeQty) cfg.typeQty = {};
    if (!cfg.productQty) cfg.productQty = {};

    if (!cfg.typeQty) cfg.typeQty = {};
    if (!cfg.fixtures) cfg.fixtures = [];
    if (!cfg.typeQty) cfg.typeQty = {};
    if (!cfg.productQty) cfg.productQty = {};

    // Get selected product and category
    const prodSel = document.getElementById('gc-laser-product');
    const selectedKey = prodSel ? prodSel.value : '';
    const catSel = document.getElementById('gc-laser-category');
    const category = catSel ? catSel.value : 'E-block';

    const freqInput = document.getElementById('gc-laser-freq');
    const infoText = document.getElementById('gc-laser-freq-info');

    if (freqInput) {
        let val = '';
        if (selectedKey) {
            val = (cfg.productQty[selectedKey] && cfg.productQty[selectedKey][category]) || '';
            if (infoText) {
                const globalVal = cfg.typeQty[category] || (category === 'E-block' ? 2 : 15);
                infoText.innerHTML = val ? `(Override from default ${globalVal})` : `(Using default: <b>${globalVal}</b>)`;
            }
        } else {
            val = cfg.typeQty[category] || '';
            if (infoText) infoText.innerHTML = `(System Default: E-block=2, Bobbin=15)`;
        }
        freqInput.value = val;
    }

    // --- Summary cards (index.html) ---
    const storedEblock = document.getElementById('gc-laser-stored-eblock');
    const storedBobbin = document.getElementById('gc-laser-stored-bobbin');
    const ebVal = cfg.typeQty['E-block'];
    const bbVal = cfg.typeQty['Bobbin'];
    if (storedEblock) storedEblock.textContent = (ebVal && !isNaN(parseInt(ebVal))) ? parseInt(ebVal) : '2 (default)';
    if (storedBobbin) storedBobbin.textContent = (bbVal && !isNaN(parseInt(bbVal))) ? parseInt(bbVal) : '15 (default)';

    renderLaserConfigTable(cfg);
}

function renderLaserConfigTable(cfg) {
    const tbody = document.getElementById('sys-cfg-laser-tbody');
    if (!tbody) return;

    let html = '';

    // 1. Default row
    const defEb = cfg.typeQty['E-block'] || '2 (System Default)';
    const defBb = cfg.typeQty['Bobbin'] || '15 (System Default)';
    html += `
        <tr>
            <td style="padding: 12px 16px; font-weight:700; color:var(--text); background:rgba(0,0,0,0.02);">— ค่าเริ่มต้น (Default ทุกรุ่น) —</td>
            <td style="padding: 12px 16px; text-align:center;">${defEb}</td>
            <td style="padding: 12px 16px; text-align:center;">${defBb}</td>
            <td style="padding: 12px 16px; text-align:center;"><button class="btn btn-outline btn-sm" onclick="editLaserConfig('')">แก้ไข</button></td>
        </tr>
    `;

    // 2. Product overrides
    if (typeof PRODUCTS !== 'undefined') {
        for (let k in PRODUCTS) {
            let pq = cfg.productQty[k];
            if (pq) {
                let eb = pq['E-block'] || '-';
                let bb = pq['Bobbin'] || '-';
                html += `
                    <tr style="border-top: 1px solid #f1f5f9;">
                        <td style="padding: 12px 16px; font-weight:600;">${PRODUCTS[k].label || k}</td>
                        <td style="padding: 12px 16px; text-align:center; color: ${eb !== '-' ? '#059669' : 'var(--text3)'}; font-weight: ${eb !== '-' ? '700' : '400'};">${eb}</td>
                        <td style="padding: 12px 16px; text-align:center; color: ${bb !== '-' ? '#059669' : 'var(--text3)'}; font-weight: ${bb !== '-' ? '700' : '400'};">${bb}</td>
                        <td style="padding: 12px 16px; text-align:center;"><button class="btn btn-outline btn-sm" onclick="editLaserConfig('${k}')">แก้ไข</button></td>
                    </tr>
                `;
            }
        }
    }
    tbody.innerHTML = html;
}

window.editLaserConfig = function (key) {
    const prodSel = document.getElementById('gc-laser-product');
    if (prodSel) {
        prodSel.value = key;
        loadGlobalLaserConfig();
        prodSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

async function saveGlobalLaserConfig() {
    const prodSel = document.getElementById('gc-laser-product');
    const selectedKey = prodSel ? prodSel.value : '';

    let payload = {
        product_key: selectedKey || 'DEFAULT',
        eblock_qty: null,
        bobbin_qty: null
    };

    const dt = document.getElementById('gc-laser-datatype')?.value || 'buyoff';
    const category = document.getElementById('gc-laser-category')?.value || 'E-block';
    const freq = document.getElementById('gc-laser-freq')?.value.trim();

    // In current system, we assume frequency is per category (E-block or Bobbin) and per Product (if selected).
    // The previous API /api/laser_config stores eblock_qty and bobbin_qty per product.

    // We must fetch existing to preserve the other category's value
    let existingEblock = null;
    let existingBobbin = null;
    if (window.LASER_CONFIG) {
        if (selectedKey) {
            existingEblock = window.LASER_CONFIG.productQty[selectedKey]?.['E-block'];
            existingBobbin = window.LASER_CONFIG.productQty[selectedKey]?.['Bobbin'];
        } else {
            existingEblock = window.LASER_CONFIG.typeQty['E-block'];
            existingBobbin = window.LASER_CONFIG.typeQty['Bobbin'];
        }
    }

    payload.eblock_qty = category === 'E-block' ? (freq ? freq : null) : existingEblock;
    payload.bobbin_qty = category === 'Bobbin' ? (freq ? freq : null) : existingBobbin;

    try {
        const res = await fetch(API_BASE + '/api/laser_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Network response was not ok');

        alert('บันทึก Laser Settings สำเร็จ\\n(กำลังโหลดข้อมูลใหม่...)');
        window.location.reload();
    } catch (e) {
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        console.error(e);
    }
}

// ========================
// POF CONFIG
// ========================
function loadGlobalPofConfig() {
    const key = document.getElementById('gc-pof-product').value;
    const formEl = document.getElementById('gc-pof-form');

    if (!key) {
        formEl.style.display = 'none';
        return;
    }
    formEl.style.display = 'block';

    // Check if product has Bobbin
    const prodDef = POF_PRODUCTS_DEFAULT[key] || {};
    const hasBobbin = prodDef.types && prodDef.types.includes('bobbin');

    document.getElementById('gc-pof-bobbin-wrap-buyoff').style.display = hasBobbin ? 'table-row' : 'none';
    document.getElementById('gc-pof-bobbin-wrap-roving').style.display = hasBobbin ? 'table-row' : 'none';

    // Get default
    let defaultBuyoff = prodDef.spc?.buyoff || {};
    let defaultRoving = prodDef.spc?.roving || {};
    let unit = prodDef.unit || '';

    // Get override from LS
    let cfg = {};
    try {
        const raw = localStorage.getItem(LS_KEY_POF_CFG);
        if (raw) cfg = JSON.parse(raw);
    } catch (e) { }

    const userSpc = cfg.products?.[key] || {};

    // Merge Buyoff
    const b_sl = { ...(defaultBuyoff.sl || {}), ...(userSpc.buyoff?.sl || {}) };
    const b_bobbin = { ...(defaultBuyoff.bobbin || {}), ...(userSpc.buyoff?.bobbin || {}) };
    const b_epoxy = { ...(defaultBuyoff.epoxy || {}), ...(userSpc.buyoff?.epoxy || {}) };

    // Merge Roving
    const r_sl = { ...(defaultRoving.sl || {}), ...(userSpc.roving?.sl || {}) };
    const r_bobbin = { ...(defaultRoving.bobbin || {}), ...(userSpc.roving?.bobbin || {}) };
    const r_epoxy = { ...(defaultRoving.epoxy || {}), ...(userSpc.roving?.epoxy || {}) };

    document.getElementById('gc-pof-unit').value = userSpc.unit || unit;

    // Set Buy Off - SL
    document.getElementById('gc-pof-buyoff-sl-spec').value = b_sl.spec || '';
    document.getElementById('gc-pof-buyoff-sl-trig').value = b_sl.trigger || '';
    document.getElementById('gc-pof-buyoff-sl-ucl').value = b_sl.ucl || '';
    document.getElementById('gc-pof-buyoff-sl-cl').value = b_sl.cl || '';
    document.getElementById('gc-pof-buyoff-sl-lcl').value = b_sl.lcl || '';
    document.getElementById('gc-pof-buyoff-sl-rucl').value = b_sl.rucl || '';
    document.getElementById('gc-pof-buyoff-sl-rcl').value = b_sl.rcl || '';

    // Set Buy Off - Bobbin
    document.getElementById('gc-pof-buyoff-bobbin-spec').value = b_bobbin.spec || '';
    document.getElementById('gc-pof-buyoff-bobbin-trig').value = b_bobbin.trigger || '';
    document.getElementById('gc-pof-buyoff-bobbin-ucl').value = b_bobbin.ucl || '';
    document.getElementById('gc-pof-buyoff-bobbin-cl').value = b_bobbin.cl || '';
    document.getElementById('gc-pof-buyoff-bobbin-lcl').value = b_bobbin.lcl || '';
    document.getElementById('gc-pof-buyoff-bobbin-rucl').value = b_bobbin.rucl || '';
    document.getElementById('gc-pof-buyoff-bobbin-rcl').value = b_bobbin.rcl || '';

    // Set Buy Off - Epoxy
    document.getElementById('gc-pof-buyoff-epoxy-spec').value = b_epoxy.spec || '';

    // Set Roving - SL
    document.getElementById('gc-pof-roving-sl-spec').value = r_sl.spec || '';
    document.getElementById('gc-pof-roving-sl-trig').value = r_sl.trigger || '';
    document.getElementById('gc-pof-roving-sl-ucl').value = r_sl.ucl || '';
    document.getElementById('gc-pof-roving-sl-cl').value = r_sl.cl || '';
    document.getElementById('gc-pof-roving-sl-lcl').value = r_sl.lcl || '';
    document.getElementById('gc-pof-roving-sl-rucl').value = r_sl.rucl || '';
    document.getElementById('gc-pof-roving-sl-rcl').value = r_sl.rcl || '';

    // Set Roving - Bobbin
    document.getElementById('gc-pof-roving-bobbin-spec').value = r_bobbin.spec || '';
    document.getElementById('gc-pof-roving-bobbin-trig').value = r_bobbin.trigger || '';
    document.getElementById('gc-pof-roving-bobbin-ucl').value = r_bobbin.ucl || '';
    document.getElementById('gc-pof-roving-bobbin-cl').value = r_bobbin.cl || '';
    document.getElementById('gc-pof-roving-bobbin-lcl').value = r_bobbin.lcl || '';
    document.getElementById('gc-pof-roving-bobbin-rucl').value = r_bobbin.rucl || '';
    document.getElementById('gc-pof-roving-bobbin-rcl').value = r_bobbin.rcl || '';

    // Set Roving - Epoxy
    document.getElementById('gc-pof-roving-epoxy-spec').value = r_epoxy.spec || '';
}

function saveGlobalPofConfig() {
    const key = document.getElementById('gc-pof-product').value;
    if (!key) return;

    const parseNum = (val) => isNaN(parseFloat(val)) ? null : parseFloat(val);

    const updates = {
        unit: document.getElementById('gc-pof-unit').value,
        buyoff: {
            sl: {
                spec: parseNum(document.getElementById('gc-pof-buyoff-sl-spec').value),
                trigger: parseNum(document.getElementById('gc-pof-buyoff-sl-trig').value),
                ucl: parseNum(document.getElementById('gc-pof-buyoff-sl-ucl').value),
                cl: parseNum(document.getElementById('gc-pof-buyoff-sl-cl').value),
                lcl: parseNum(document.getElementById('gc-pof-buyoff-sl-lcl').value),
                rucl: parseNum(document.getElementById('gc-pof-buyoff-sl-rucl').value),
                rcl: parseNum(document.getElementById('gc-pof-buyoff-sl-rcl').value)
            },
            bobbin: {
                spec: parseNum(document.getElementById('gc-pof-buyoff-bobbin-spec').value),
                trigger: parseNum(document.getElementById('gc-pof-buyoff-bobbin-trig').value),
                ucl: parseNum(document.getElementById('gc-pof-buyoff-bobbin-ucl').value),
                cl: parseNum(document.getElementById('gc-pof-buyoff-bobbin-cl').value),
                lcl: parseNum(document.getElementById('gc-pof-buyoff-bobbin-lcl').value),
                rucl: parseNum(document.getElementById('gc-pof-buyoff-bobbin-rucl').value),
                rcl: parseNum(document.getElementById('gc-pof-buyoff-bobbin-rcl').value)
            },
            epoxy: {
                spec: parseNum(document.getElementById('gc-pof-buyoff-epoxy-spec').value)
            }
        },
        roving: {
            sl: {
                spec: parseNum(document.getElementById('gc-pof-roving-sl-spec').value),
                trigger: parseNum(document.getElementById('gc-pof-roving-sl-trig').value),
                ucl: parseNum(document.getElementById('gc-pof-roving-sl-ucl').value),
                cl: parseNum(document.getElementById('gc-pof-roving-sl-cl').value),
                lcl: parseNum(document.getElementById('gc-pof-roving-sl-lcl').value),
                rucl: parseNum(document.getElementById('gc-pof-roving-sl-rucl').value),
                rcl: parseNum(document.getElementById('gc-pof-roving-sl-rcl').value)
            },
            bobbin: {
                spec: parseNum(document.getElementById('gc-pof-roving-bobbin-spec').value),
                trigger: parseNum(document.getElementById('gc-pof-roving-bobbin-trig').value),
                ucl: parseNum(document.getElementById('gc-pof-roving-bobbin-ucl').value),
                cl: parseNum(document.getElementById('gc-pof-roving-bobbin-cl').value),
                lcl: parseNum(document.getElementById('gc-pof-roving-bobbin-lcl').value),
                rucl: parseNum(document.getElementById('gc-pof-roving-bobbin-rucl').value),
                rcl: parseNum(document.getElementById('gc-pof-roving-bobbin-rcl').value)
            },
            epoxy: {
                spec: parseNum(document.getElementById('gc-pof-roving-epoxy-spec').value)
            }
        }
    };

    let cfg = { products: {} };
    try {
        const raw = localStorage.getItem(LS_KEY_POF_CFG);
        if (raw) cfg = JSON.parse(raw);
    } catch (e) { }

    if (!cfg.products) cfg.products = {};

    // Merge existing configs for this product (in case there's something else not overwritten here)
    const existingSpc = cfg.products[key] || {};
    cfg.products[key] = {
        ...existingSpc,
        unit: updates.unit,
        buyoff: {
            ...existingSpc.buyoff,
            sl: updates.buyoff.sl,
            bobbin: updates.buyoff.bobbin,
            epoxy: updates.buyoff.epoxy
        },
        roving: {
            ...existingSpc.roving,
            sl: updates.roving.sl,
            bobbin: updates.roving.bobbin,
            epoxy: updates.roving.epoxy
        }
    };

    localStorage.setItem(LS_KEY_POF_CFG, JSON.stringify(cfg));
    alert('บันทึก SPC Parameters สำหรับ ' + key + ' สำเร็จ\n(รีเฟรชหน้า Push Out Force เพื่อใช้งานค่าใหม่)');
}

// ========================
// DAMPER CONFIG
// ========================
const LS_KEY_DMR_CFG = 'belton_damper_v3_config';

// Default spec values matching damper_install.js DIM_GROUPS
const DMR_DIM_DEFAULTS = {
    datum: { usl: 1.368, ucl: null, cl: 1.358, lcl: null, lsl: 1.348 },
    nondatum: { usl: 0.824, ucl: null, cl: 0.814, lcl: null, lsl: 0.804 }
};

function loadGlobalDamperConfig() {
    let cfg = {};
    try {
        const raw = localStorage.getItem(LS_KEY_DMR_CFG);
        if (raw) cfg = JSON.parse(raw);
    } catch (e) { }

    const prodSel = document.getElementById('gc-dmp-product');
    const selectedKey = prodSel ? prodSel.value : '';

    let dims;
    if (selectedKey) {
        const prodOverride = (cfg.productDims && cfg.productDims[selectedKey]) ? cfg.productDims[selectedKey] : {};
        const globalDefault = cfg.dims || {};
        dims = {};
        const keys = ['datum', 'nondatum'];
        const fields = ['usl', 'ucl', 'cl', 'lcl', 'lsl'];
        keys.forEach(k => {
            dims[k] = {};
            fields.forEach(f => {
                if (prodOverride[k] && prodOverride[k][f] !== undefined) {
                    dims[k][f] = prodOverride[k][f];
                    dims[k][f + '_isOverride'] = true;
                } else if (globalDefault[k] && globalDefault[k][f] !== undefined) {
                    dims[k][f] = globalDefault[k][f];
                } else {
                    dims[k][f] = DMR_DIM_DEFAULTS[k][f];
                }
            });
        });
    } else {
        dims = cfg.dims || {};
    }

    const keys = ['datum', 'nondatum'];
    const fields = ['usl', 'ucl', 'cl', 'lcl', 'lsl'];
    keys.forEach(k => {
        fields.forEach(f => {
            const el = document.getElementById(`gc-dmp-${k}-${f}`);
            if (el) {
                el.value = (dims[k] && dims[k][f] !== undefined && dims[k][f] !== null) ? dims[k][f] : (DMR_DIM_DEFAULTS[k][f] !== null ? DMR_DIM_DEFAULTS[k][f] : '');
                el.style.borderColor = (selectedKey && dims[k] && dims[k][f + '_isOverride']) ? '#059669' : '';
                el.style.backgroundColor = (selectedKey && dims[k] && dims[k][f + '_isOverride']) ? 'rgba(16,185,129,0.05)' : '';
            }
        });
    });

    // Load Frequencies (per product, fallback to global)
    const prodOverride = (cfg.productDims && selectedKey && cfg.productDims[selectedKey]) ? cfg.productDims[selectedKey] : {};
    const freqBuyoffEl = document.getElementById('gc-dmp-freq-buyoff');
    const freqRovingEl = document.getElementById('gc-dmp-freq-roving');

    if (freqBuyoffEl) {
        freqBuyoffEl.value = prodOverride.freqBuyoff !== undefined ? prodOverride.freqBuyoff : (cfg.freqBuyoff !== undefined ? cfg.freqBuyoff : '');
    }
    if (freqRovingEl) {
        freqRovingEl.value = prodOverride.freqRoving !== undefined ? prodOverride.freqRoving : (cfg.freqRoving !== undefined ? cfg.freqRoving : '');
    }

    if (typeof filterDamperRows === 'function') {
        filterDamperRows();
    }
}

function saveGlobalDamperConfig() {
    let cfg = {};
    try {
        const raw = localStorage.getItem(LS_KEY_DMR_CFG);
        if (raw) cfg = JSON.parse(raw);
    } catch (e) { }

    const prodSel = document.getElementById('gc-dmp-product');
    const selectedKey = prodSel ? prodSel.value : '';

    if (!cfg.dims) cfg.dims = {};
    if (!cfg.productDims) cfg.productDims = {};

    const keys = ['datum', 'nondatum'];
    let changed = false;

    let targetObj;
    if (selectedKey) {
        if (!cfg.productDims[selectedKey]) cfg.productDims[selectedKey] = {};
        targetObj = cfg.productDims[selectedKey];
    } else {
        targetObj = cfg.dims;
    }

    const fields = ['usl', 'ucl', 'cl', 'lcl', 'lsl'];
    
    keys.forEach(k => {
        let allEmpty = true;
        let anyValid = false;
        let tempVals = {};

        fields.forEach(f => {
            const str = document.getElementById(`gc-dmp-${k}-${f}`)?.value.trim();
            if (str !== '' && str !== undefined) {
                allEmpty = false;
                const val = parseFloat(str);
                if (!isNaN(val)) {
                    tempVals[f] = val;
                    anyValid = true;
                }
            }
        });

        if (allEmpty && selectedKey) {
            // Delete product override for this point if all empty
            if (targetObj[k]) { delete targetObj[k]; changed = true; }
        } else if (anyValid) {
            if (!targetObj[k]) targetObj[k] = {};
            fields.forEach(f => {
                if (tempVals[f] !== undefined) {
                    targetObj[k][f] = tempVals[f];
                } else {
                    targetObj[k][f] = null;
                }
            });
            changed = true;
        }
    });

    // Frequencies (per product)
    const freqBuyoffVal = parseInt(document.getElementById('gc-dmp-freq-buyoff')?.value, 10);
    const freqRovingVal = parseInt(document.getElementById('gc-dmp-freq-roving')?.value, 10);

    if (!isNaN(freqBuyoffVal) && freqBuyoffVal > 0) { targetObj.freqBuyoff = freqBuyoffVal; changed = true; }
    else if (targetObj.freqBuyoff !== undefined) { delete targetObj.freqBuyoff; changed = true; }

    if (!isNaN(freqRovingVal) && freqRovingVal > 0) { targetObj.freqRoving = freqRovingVal; changed = true; }
    else if (targetObj.freqRoving !== undefined) { delete targetObj.freqRoving; changed = true; }

    if (changed || selectedKey) {
        const cfgStr = JSON.stringify(cfg);
        localStorage.setItem(LS_KEY_DMR_CFG, cfgStr);

        // Sync with DB
        fetch((typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/system/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [LS_KEY_DMR_CFG]: cfgStr })
        }).catch(e => console.error("Sync Damper to DB failed", e));

        alert('บันทึก Damper Specifications สำเร็จ\n(รีเฟรชหน้า Damper Install เพื่อใช้งานค่าใหม่)');
        loadGlobalDamperConfig();
    } else {
        alert('กรุณากรอกข้อมูลที่ต้องการบันทึก');
    }
}

// ========================
// RESET CONFIGURATIONS
// ========================
function resetGlobalLaserConfig() {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตค่า Laser Config คืนค่าเดิมทั้งหมด?")) {
        localStorage.removeItem(LS_KEY_LSR_CFG);
        alert("รีเซ็ตค่า Laser Config สำเร็จ");
        loadGlobalLaserConfig();
    }
}

function resetGlobalPofConfig() {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตค่า POF Config คืนค่าเดิมทั้งหมด?")) {
        localStorage.removeItem(LS_KEY_POF_CFG);
        alert("รีเซ็ตค่า POF Config สำเร็จ");
        loadGlobalPofConfig();
    }
}

function resetGlobalDamperConfig() {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตค่า Damper Config คืนค่าเดิมทั้งหมด?")) {
        localStorage.removeItem(LS_KEY_DMR_CFG);
        alert("รีเซ็ตค่า Damper Config สำเร็จ");
        loadGlobalDamperConfig();
    }
}