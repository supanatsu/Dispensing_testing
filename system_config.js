// const BACKEND_URL removed
let currentModule = 'dispensing';
let currentLimits = [];

document.addEventListener('DOMContentLoaded', () => {
    initGlobalNavigation('system_config');
    loadProductsDropdown();
    selectModule('dispensing');
});

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

function selectModule(mod) {
    currentModule = mod;

    // Update active button
    document.querySelectorAll('.mod-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.toLowerCase().includes(mod.substring(0, 4))) {
            btn.classList.add('active');
        }
    });

    const labels = {
        'dispensing': 'Dispensing',
        'laser': 'Laser Engraving',
        'pof': 'Push Out Force',
        'damper': 'Damper Install'
    };
    document.getElementById('lbl-current-module').innerText = labels[mod] || mod;

    updateTableHeader(mod);
    loadSPCLimits();
}

function updateTableHeader(mod) {
    const thead = document.getElementById('spc-head');
    if (mod === 'laser') {
        thead.innerHTML = `
            <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Fixture</th>
                <th>Shift</th>
            </tr>
        `;
    } else if (mod === 'damper') {
        thead.innerHTML = `
            <tr>
                <th>Product</th>
                <th>Dimension</th>
                <th>Frequency (pcs)</th>
                <th>LCL</th>
                <th>CL</th>
                <th>UCL</th>
            </tr>
        `;
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
            </tr>
        `;
    }
}

async function loadProductsDropdown() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/system/products`);
        if (!res.ok) throw new Error('Failed to fetch products');
        const data = await res.json();

        const sel = document.getElementById('filter-product');
        sel.innerHTML = '<option value="">-- All Products --</option>';
        if (data.products) {
            data.products.forEach(p => {
                sel.innerHTML += `<option value="${p.product_key}">${p.product_name}</option>`;
            });
        }
    } catch (err) {
        console.warn('Could not load products', err);
    }
}

async function loadSPCLimits() {
    const mode = currentModule; // filter-mode is removed or repurposed, we just use currentModule
    const product = document.getElementById('filter-product').value;

    const tbody = document.getElementById('spc-body');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';

    try {
        let url = `${BACKEND_URL}/api/system/spc_limits?mode=${mode}`;
        if (product) url += `&product=${product}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('API not available yet');
        const data = await res.json();

        const dbLimits = data.limits || [];

        // Merge with defined logic
        currentLimits = [];

        if (product) {
            let dims = [];
            if (mode === 'laser') {
                dims = ['laser_config'];
            } else if (mode === 'pof') {
                dims = ['long', 'short', 'bobbin'];
            } else if (mode === 'damper') {
                dims = ['bottom', 'top'];
            } else {
                let pKey = product.toLowerCase();
                dims = (typeof PRODUCTS !== 'undefined' && PRODUCTS[pKey]) ? PRODUCTS[pKey].dims : [];
            }

            dims.forEach(d => {
                const dimName = typeof d === 'object' ? d.id : d;
                let found = dbLimits.find(x => x.product_key === product && x.dimension_name === dimName);
                if (!found) {
                    let pKey = product.toLowerCase();
                    const fallback = (typeof SPEC_BUYOFF !== 'undefined' && SPEC_BUYOFF[pKey] && SPEC_BUYOFF[pKey][dimName]) || {};
                    found = {
                        id: null,
                        process_mode: mode,
                        product_key: product,
                        dimension_name: dimName,
                        lsl: fallback.lsl !== undefined ? fallback.lsl : null,
                        lcl: fallback.lcl !== undefined ? fallback.lcl : null,
                        cl: fallback.cl !== undefined ? fallback.cl : null,
                        ucl: fallback.ucl !== undefined ? fallback.ucl : null,
                        usl: fallback.usl !== undefined ? fallback.usl : null,
                        frequency: null,
                        laser_qty: null,
                        laser_fixture: null,
                        laser_shift: null
                    };
                }
                currentLimits.push(found);
            });
            if (dims.length === 0 && dbLimits.length > 0) {
                currentLimits = dbLimits;
            }
        } else {
            currentLimits = dbLimits;
        }

        renderTable();
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger)">
            API Endpoint Not Found
        </td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('spc-body');
    tbody.innerHTML = '';

    if (currentLimits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Please select a specific Product to configure its limits.</td></tr>';
        return;
    }

    currentLimits.forEach((lim, idx) => {
        const tr = document.createElement('tr');
        if (currentModule === 'laser') {
            tr.innerHTML = `
                <td style="font-weight:600">${lim.product_key}</td>
                <td class="editable-cell"><input type="number" step="1" value="${lim.laser_qty !== null && lim.laser_qty !== undefined ? lim.laser_qty : ''}" onchange="updateLimit(${idx}, 'laser_qty', this.value)"></td>
                <td class="editable-cell"><input type="number" step="1" value="${lim.laser_fixture !== null && lim.laser_fixture !== undefined ? lim.laser_fixture : ''}" onchange="updateLimit(${idx}, 'laser_fixture', this.value)"></td>
                <td class="editable-cell"><input type="number" step="1" value="${lim.laser_shift !== null && lim.laser_shift !== undefined ? lim.laser_shift : ''}" onchange="updateLimit(${idx}, 'laser_shift', this.value)"></td>
            `;
        } else if (currentModule === 'damper') {
            tr.innerHTML = `
                <td style="font-weight:600">${lim.product_key}</td>
                <td>${lim.dimension_name}</td>
                <td class="editable-cell"><input type="number" step="1" value="${lim.frequency !== null && lim.frequency !== undefined ? lim.frequency : ''}" onchange="updateLimit(${idx}, 'frequency', this.value)"></td>
                <td class="editable-cell"><input type="number" step="0.0001" value="${lim.lcl !== null ? lim.lcl : ''}" onchange="updateLimit(${idx}, 'lcl', this.value)"></td>
                <td class="editable-cell"><input type="number" step="0.0001" value="${lim.cl !== null ? lim.cl : ''}" onchange="updateLimit(${idx}, 'cl', this.value)"></td>
                <td class="editable-cell"><input type="number" step="0.0001" value="${lim.ucl !== null ? lim.ucl : ''}" onchange="updateLimit(${idx}, 'ucl', this.value)"></td>
            `;
        } else {
            tr.innerHTML = `
                <td style="font-weight:600">${lim.product_key}</td>
                <td>${lim.dimension_name}</td>
                <td class="editable-cell"><input type="number" step="1" value="${lim.frequency !== null && lim.frequency !== undefined ? lim.frequency : ''}" onchange="updateLimit(${idx}, 'frequency', this.value)"></td>
                <td class="editable-cell"><input type="number" step="0.0001" value="${lim.lsl !== null ? lim.lsl : ''}" onchange="updateLimit(${idx}, 'lsl', this.value)"></td>
                <td class="editable-cell"><input type="number" step="0.0001" value="${lim.lcl !== null ? lim.lcl : ''}" onchange="updateLimit(${idx}, 'lcl', this.value)"></td>
                <td class="editable-cell"><input type="number" step="0.0001" value="${lim.cl !== null ? lim.cl : ''}" onchange="updateLimit(${idx}, 'cl', this.value)"></td>
                <td class="editable-cell"><input type="number" step="0.0001" value="${lim.ucl !== null ? lim.ucl : ''}" onchange="updateLimit(${idx}, 'ucl', this.value)"></td>
                <td class="editable-cell"><input type="number" step="0.0001" value="${lim.usl !== null ? lim.usl : ''}" onchange="updateLimit(${idx}, 'usl', this.value)"></td>
            `;
        }
        tbody.appendChild(tr);
    });
}

function updateLimit(idx, field, val) {
    if (val === '') {
        currentLimits[idx][field] = null;
    } else {
        currentLimits[idx][field] = parseFloat(val);
    }
}

async function saveSPCLimits() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/system/spc_limits/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limits: currentLimits })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Settings saved to MySQL successfully.');
            loadSPCLimits();
        } else {
            showToast('Error saving: ' + data.error, 'danger');
        }
    } catch (err) {
        showToast('Server error', 'danger');
        console.error(err);
    }
}