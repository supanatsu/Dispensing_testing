const { sendAlertEmail } = require('./mailer');

async function processAlerts(pool, moduleName, alerts) {
    if (!alerts || alerts.length === 0) return;

    // Filter to true alerts if needed (some modules send "ACCEPT" alerts too, though usually they only send Fails)
    const validAlerts = alerts.filter(a => {
        const statusStr = (a.level || a.status || a.alertStatus || a.overall || a.msg || '').toLowerCase();
        return ['fail', 'reject', 'warning', 'higher', 'lower', 'ng', 'out of spec'].some(k => statusStr.includes(k));
    });

    if (validAlerts.length === 0) return;

    const formattedAlerts = [];

    // Limit chart generation to first 5 to avoid heavy DB load / API rate limits on bulk merge
    for (let i = 0; i < validAlerts.length; i++) {
        const a = validAlerts[i];

        let chartUrl = null;
        if (i < 5) {
            chartUrl = await generateChartUrl(pool, moduleName, a.product, a.param || a.parameter || a.attribute);
        }

        formattedAlerts.push({
            parameter: a.param || a.parameter || a.attribute || '-',
            product: a.product || '-',
            fixture: a.fixture || a.machine || a.oven || '-',
            targetCol: a.traveler || a.no || a.record_no || '-',
            actualValue: a.value != null ? a.value : (a.avg != null ? a.avg : '-'),
            alertStatus: a.level || a.status || a.alertStatus || 'Out of Spec',
            limitCheck: a.spec || a.spec_str || a.limitCheck || '-',
            chartUrl: chartUrl,
            time: a.time || new Date().toLocaleString('th-TH')
        });
    }

    await sendAlertEmail(pool, moduleName, formattedAlerts);
}

async function generateChartUrl(pool, moduleName, product, param) {
    if (!product || !param) return null;

    let table = '';
    let dateCol = 'test_date';
    if (moduleName === 'Dispensing') { table = 'dispensing_records'; dateCol = 'created_at'; }
    else if (moduleName === 'Laser') { table = 'laser_records'; }
    else if (moduleName === 'POF') { table = 'pof_records'; }
    else if (moduleName === 'Damper') { table = 'damper_records'; }
    else return null;

    try {
        // Only laser_records has defects_json; use values_json for all modules
        const [rows] = await pool.query(`SELECT ${dateCol} as date, values_json FROM ${table} WHERE product = ? ORDER BY ${dateCol} DESC LIMIT 20`, [product]);

        if (rows.length === 0) return null;

        const dataPoints = rows.reverse().map(r => {
            let valObj = {};
            try {
                valObj = typeof r.values_json === 'string' ? JSON.parse(r.values_json) : (r.values_json || {});
            } catch (e) { }

            let v = valObj[param] !== undefined ? valObj[param] : valObj[param.toLowerCase()];
            if (v == null && param.includes(' ')) {
                v = valObj[param.replace(/ /g, '_').toLowerCase()];
            }
            return v != null ? parseFloat(v) : null;
        }).filter(v => v !== null && !isNaN(v));

        if (dataPoints.length === 0) return null;

        // Fetch limits to draw lines
        let ucl = null, lcl = null, target = null;
        const [limitRows] = await pool.query(`SELECT cl, ucl, lcl FROM spc_config_limits WHERE product_key = ? AND dimension_name = ? LIMIT 1`, [product, param]);
        if (limitRows.length > 0) {
            ucl = limitRows[0].ucl;
            lcl = limitRows[0].lcl;
            target = limitRows[0].cl;
        }

        const labels = dataPoints.map((_, i) => i + 1);

        const chartConfig = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: param, data: dataPoints, borderColor: '#0984e3', backgroundColor: 'rgba(9,132,227,0.1)', fill: true, tension: 0.3 }
                ]
            },
            options: {
                plugins: {
                    annotation: {
                        annotations: {}
                    }
                }
            }
        };

        if (ucl != null) {
            chartConfig.options.plugins.annotation.annotations.ucl = { type: 'line', yMin: ucl, yMax: ucl, borderColor: '#d63031', borderWidth: 2, label: { enabled: true, content: 'UCL' } };
        }
        if (lcl != null) {
            chartConfig.options.plugins.annotation.annotations.lcl = { type: 'line', yMin: lcl, yMax: lcl, borderColor: '#d63031', borderWidth: 2, label: { enabled: true, content: 'LCL' } };
        }
        if (target != null) {
            chartConfig.options.plugins.annotation.annotations.target = { type: 'line', yMin: target, yMax: target, borderColor: '#00b894', borderWidth: 2, borderDash: [5, 5], label: { enabled: true, content: 'Target' } };
        }

        return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=300`;
    } catch (err) {
        console.error('generateChartUrl error:', err);
        return null;
    }
}

module.exports = { processAlerts };