// system_alert.js

let currentAlerts = [];

async function loadAlerts() {
    const tbody = document.getElementById('alerts-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading...</td></tr>';

    try {
        const processType = document.getElementById('filter-module').value;
        const level = document.getElementById('filter-level').value;

        let url = `${API_BASE}/api/system-alerts`;
        const params = new URLSearchParams();
        if (processType) params.append('process_type', processType);
        if (level) params.append('level', level);

        if (params.toString()) {
            url += '?' + params.toString();
        }

        const res = await fetch(url);
        const data = await res.json();

        if (data.success) {
            currentAlerts = data.alerts;
            renderAlerts();
            updateKPIs();
        } else {
            throw new Error(data.error || 'Failed to fetch alerts');
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--fail)">Error loading alerts: ${err.message}</td></tr>`;
    }
}

function renderAlerts() {
    const tbody = document.getElementById('alerts-tbody');
    if (!currentAlerts || currentAlerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No alerts found</td></tr>';
        return;
    }

    let html = '';
    for (const alert of currentAlerts) {
        let levelClass = 'info';
        
        // Comprehensive checking for NG/Critical synonyms
        const lvlStr = (alert.level || '').toLowerCase();
        const msgStr = (alert.msg || '').toLowerCase();
        
        if (lvlStr.includes('ng') || lvlStr.includes('critical') || lvlStr.includes('reject') || lvlStr.includes('fail') || lvlStr.includes('out of spec') || lvlStr.includes('higher than ucl') || lvlStr.includes('lower than lcl') || msgStr.includes('reject') || msgStr.includes('fail')) {
            levelClass = 'critical';
        } else if (lvlStr.includes('warning') || lvlStr.includes('warn') || lvlStr.includes('hold') || lvlStr.includes('alert') || lvlStr.includes('higher than lcl') || lvlStr.includes('lower than ucl')) {
            levelClass = 'warning';
        }

        let moduleClass = 'tag-' + (alert.process_type || '').toLowerCase();
        let moduleName = alert.process_type || 'Unknown';

        // Add Chart Button for supported modules
        let chartBtnHtml = '';
        if (alert.product && alert.param && (moduleName.toLowerCase() === 'pof' || moduleName.toLowerCase() === 'dispensing')) {
            chartBtnHtml = `<button class="btn btn-primary" style="margin-top:8px; padding:4px 8px; font-size:11px;" onclick="viewChart('${alert.process_type}', '${alert.product}', '${alert.param}')">📉 View Trend Chart</button>`;
        }

        html += `
            <tr>
                <td style="white-space:nowrap">${new Date(alert.alert_time).toLocaleString('th-TH')}</td>
                <td><span class="module-tag ${moduleClass}">${moduleName}</span></td>
                <td><span class="pill ${levelClass}">${alert.level || '-'}</span></td>
                <td>
                    ${alert.product ? `<div>Product: ${alert.product}</div>` : ''}
                    ${alert.fixture ? `<div style="color:var(--text-muted);font-size:11px">Fixture: ${alert.fixture}</div>` : ''}
                </td>
                <td>
                    ${alert.traveler ? `<div>Traveler: ${alert.traveler}</div>` : ''}
                    ${alert.oven ? `<div style="color:var(--text-muted);font-size:11px">Oven: ${alert.oven}</div>` : ''}
                </td>
                <td>
                    ${alert.param ? `<b>${alert.param}</b><br>` : ''}
                    ${alert.value_val != null ? `Value: ${alert.value_val}` : ''}
                    ${alert.spec_str ? `<br><span style="color:var(--text-muted);font-size:11px">Spec: ${alert.spec_str}</span>` : ''}
                    ${chartBtnHtml}
                </td>
                <td>${alert.msg || '-'}</td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

function updateKPIs() {
    document.getElementById('kpi-total').textContent = currentAlerts.length;

    const criticalCount = currentAlerts.filter(a => {
        const lvlStr = (a.level || '').toLowerCase();
        return lvlStr.includes('ng') || lvlStr.includes('critical') || lvlStr.includes('reject') || lvlStr.includes('fail') || lvlStr.includes('out of spec') || lvlStr.includes('higher than ucl') || lvlStr.includes('lower than lcl');
    }).length;
    document.getElementById('kpi-critical').textContent = criticalCount;

    const warningCount = currentAlerts.filter(a => {
        const lvlStr = (a.level || '').toLowerCase();
        return lvlStr.includes('warning') || lvlStr.includes('higher than lcl') || lvlStr.includes('lower than ucl');
    }).length;
    document.getElementById('kpi-warning').textContent = warningCount;
}

async function clearAlerts() {
    if (!confirm('Are you sure you want to delete the displayed alerts?')) return;

    try {
        const processType = document.getElementById('filter-module').value;
        let url = `${API_BASE}/api/system-alerts`;
        if (processType) {
            url += `?process_type=${processType}`;
        }

        const res = await fetch(url, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            alert('Alerts cleared successfully');
            loadAlerts();
        } else {
            throw new Error(data.error || 'Failed to clear alerts');
        }
    } catch (err) {
        console.error(err);
        alert('Error clearing alerts: ' + err.message);
    }
}

async function viewChart(module, product, param) {
    try {
        const res = await fetch(`${API_BASE}/api/alerts/chart?module=${encodeURIComponent(module)}&product=${encodeURIComponent(product)}&param=${encodeURIComponent(param)}`);
        const data = await res.json();
        if (data.success && data.url) {
            // Open chart in a new tab/window
            const win = window.open('', '_blank');
            win.document.write(`<html><head><title>Trend Chart</title><style>body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#f8fafc;}img{max-width:100%;max-height:100%;box-shadow:0 4px 12px rgba(0,0,0,0.15);border-radius:8px;}</style></head><body><img src="${data.url}" /></body></html>`);
        } else {
            alert('ไม่สามารถสร้างกราฟได้: ' + (data.error || 'No URL returned'));
        }
    } catch (err) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการโหลดกราฟ: ' + err.message);
    }
}