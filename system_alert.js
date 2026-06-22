// system_alert.js

let currentAlerts = [];

async function loadAlerts() {
    const tbody = document.getElementById('alerts-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading...</td></tr>';

    try {
        const processType = document.getElementById('filter-module').value;
        const level = document.getElementById('filter-level').value;

        let url = 'http://localhost:3001/api/system-alerts';
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
        if (alert.level === 'NG' || alert.level === 'Critical') levelClass = 'critical';
        else if (alert.level === 'Warning') levelClass = 'warning';

        let moduleClass = 'tag-' + alert.process_type;
        let moduleName = alert.process_type;

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
                </td>
                <td>${alert.msg || '-'}</td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

function updateKPIs() {
    document.getElementById('kpi-total').textContent = currentAlerts.length;
    
    const criticalCount = currentAlerts.filter(a => a.level === 'NG' || a.level === 'Critical').length;
    document.getElementById('kpi-critical').textContent = criticalCount;
    
    const warningCount = currentAlerts.filter(a => a.level === 'Warning').length;
    document.getElementById('kpi-warning').textContent = warningCount;
}

async function clearAlerts() {
    if (!confirm('Are you sure you want to delete the displayed alerts?')) return;

    try {
        const processType = document.getElementById('filter-module').value;
        let url = 'http://localhost:3001/api/system-alerts';
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
