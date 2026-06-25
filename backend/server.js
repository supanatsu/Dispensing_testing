require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const path = require('path');

const app = express();

// เปิดใช้งาน CORS เพื่อให้หน้าเว็บ HTML/JS จาก origin อื่นสามารถเข้าถึง API ได้
app.use(cors({ origin: true, credentials: true }));
app.set('trust proxy', true);

// Request Logger Middleware
app.use((req, res, next) => {
  const time = new Date().toLocaleTimeString('th-TH', { hour12: false });
  console.log(`[${time}] 📡 ${req.method} ${req.originalUrl || req.url} - IP: ${req.ip}`);
  next();
});

// Serve shared_products.js dynamically from DB
app.get('/shared_products.js', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  try {
    let jsContent = 'window.PRODUCTS = {};\nwindow.SPEC_BUYOFF = {};\nwindow.SPEC_ROVING = {};\n\n';

    // 1. Fetch products from master_products
    const [prodRows] = await pool.query('SELECT * FROM master_products');
    let productsObj = {};
    for (const row of prodRows) {
      productsObj[row.product_key] = {
        label: row.product_name,
        dims: row.dims ? (typeof row.dims === 'string' ? JSON.parse(row.dims) : row.dims) : []
      };
    }
    jsContent += `window.PRODUCTS = ${JSON.stringify(productsObj, null, 4)};\n\n`;

    // 2. Fetch specs from spc_config_limits
    const [specRows] = await pool.query('SELECT * FROM spc_config_limits');
    let buyoffObj = {};
    let rovingObj = {};

    for (const row of specRows) {
      const key = row.product_key;
      const dim = row.dimension_name;
      const mode = row.process_mode;

      const specData = {};
      if (row.lsl !== null) specData.lsl = row.lsl;
      if (row.lcl !== null) specData.lcl = row.lcl;
      if (row.cl !== null) specData.cl = row.cl;
      if (row.ucl !== null) specData.ucl = row.ucl;
      if (row.usl !== null) specData.usl = row.usl;

      if (mode === 'buyoff' || mode === 'buy-off') {
        if (!buyoffObj[key]) buyoffObj[key] = {};
        buyoffObj[key][dim] = specData;
      } else if (mode === 'roving') {
        if (!rovingObj[key]) rovingObj[key] = {};
        rovingObj[key][dim] = specData;
      }
    }
    jsContent += `window.SPEC_BUYOFF = ${JSON.stringify(buyoffObj, null, 4)};\n\n`;
    jsContent += `window.SPEC_ROVING = ${JSON.stringify(rovingObj, null, 4)};\n`;

    // 3. Fetch laser configurations (separate try/catch — table may not exist yet)
    let laserCfg = { typeQty: {}, productQty: {} };
    try {
      const [laserRows] = await pool.query('SELECT * FROM laser_config');
      for (const row of laserRows) {
        if (row.product_key === 'DEFAULT') {
          if (row.eblock_qty !== null) {
            laserCfg.typeQty['E-block'] = row.eblock_qty.toString();
            laserCfg.typeQty['Epoch'] = row.eblock_qty.toString(); // for backward compatibility
          }
          if (row.bobbin_qty !== null) laserCfg.typeQty['Bobbin'] = row.bobbin_qty.toString();
        } else {
          laserCfg.productQty[row.product_key] = {};
          if (row.eblock_qty !== null) laserCfg.productQty[row.product_key]['E-block'] = row.eblock_qty.toString();
          if (row.bobbin_qty !== null) laserCfg.productQty[row.product_key]['Bobbin'] = row.bobbin_qty.toString();
        }
      }
    } catch (laserErr) {
      console.warn('laser_config table not found, skipping LASER_CONFIG:', laserErr.message);
    }
    jsContent += `window.LASER_CONFIG = ${JSON.stringify(laserCfg, null, 4)};\n\n`;

    res.type('application/javascript');
    res.send(jsContent);
  } catch (err) {
    console.error('Error serving shared_products.js dynamically:', err);
    res.status(500).send('// Error generating shared_products.js');
  }
});

// Serve static frontend files directly from root
app.use(express.static(path.join(__dirname, '../')));


process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// อนุญาตให้รับ Payload ขนาดใหญ่ (สูงถึง 50MB) เนื่องจากโมดูล Dispensing และ Damper 
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// บันทึกการตั้งค่า Laser
app.post('/api/laser_config', async (req, res) => {
  const { product_key, eblock_qty, bobbin_qty } = req.body;
  try {
    const key = product_key || 'DEFAULT';
    await pool.query(
      `INSERT INTO laser_config (product_key, eblock_qty, bobbin_qty) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE eblock_qty = VALUES(eblock_qty), bobbin_qty = VALUES(bobbin_qty)`,
      [key, eblock_qty, bobbin_qty]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving laser config:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// AUTO-SEEDING MECHANISM
// -------------------------------------------------------------------------
const { exec } = require('child_process');
const fs = require('fs');

async function autoSeedData() {
  try {
    try {
      const rawSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
        .replace(/^\uFEFF/, '')
        .replace(/--.*$/gm, '') // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

      // mysql2 ไม่รัน multi-statement ใน pool.query() โดย default
      // → split เป็น statement ย่อย แล้วรันทีละอัน
      // กรองเอาเฉพาะ statement ที่ไม่ว่างเปล่าออกมา
      const statements = rawSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      let ok = 0, skip = 0;
      for (const stmt of statements) {
        try {
          await pool.query(stmt);
          ok++;
        } catch (stmtErr) {
          // ไม่หยุดถ้า error เป็น "already exists" หรือ duplicate key
          if (/already exists|Duplicate entry/i.test(stmtErr.message)) {
            skip++;
          } else {
            console.warn(`⚠️ Schema stmt skipped: ${stmtErr.message.substring(0, 80)}`);
            skip++;
          }
        }
      }
      console.log(`✅ Database schema verified/created successfully! (${ok} ok, ${skip} skipped)`);
    } catch (e) {
      console.error('⚠️ Schema import failed:', e.message);
    }

    // Auto-migrate to support Text QC data
    try {
      await pool.query('ALTER TABLE dispensing_measurements MODIFY measured_value VARCHAR(255)');
      console.log('✅ Auto-migrated dispensing_measurements for VARCHAR support');
    } catch (e) { }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS dispensing_config (
          config_key VARCHAR(100) PRIMARY KEY,
          config_value TEXT
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alert_recipients (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) UNIQUE,
          name VARCHAR(255),
          role VARCHAR(100),
          active BOOLEAN DEFAULT true
        );
      `);
      console.log('✅ Verified dispensing config & alert tables exist.');
    } catch (e) {
      console.error('⚠️ Could not verify config tables:', e.message);
    }

    const [laserRows] = await pool.query('SELECT COUNT(*) as cnt FROM laser_records');
    if (laserRows[0].cnt === 0) {
      console.log('🤖 [Auto-Seed] No Laser Engraving data found. Seeding from Excel via Node...');
      exec(`"${process.execPath}" backend/seed_laser.js`, { cwd: path.join(__dirname, '../') }, (err, stdout, stderr) => {
        if (err) console.error('❌ [Auto-Seed] Laser Engraving failed:', err.message);
        else console.log('✅ [Auto-Seed] Laser Engraving data seeded successfully! Please refresh the page.');
      });
    }

    const [pofRows] = await pool.query('SELECT COUNT(*) as cnt FROM pof_records');
    if (pofRows[0].cnt === 0) {
      console.log('🤖 [Auto-Seed] No Push Out Force data found. Seeding...');
      exec(`"${process.execPath}" backend/seed_pof.js`, { cwd: path.join(__dirname, '../') });
    }

    const [dispRows] = await pool.query('SELECT COUNT(*) as cnt FROM dispensing_records');
    if (dispRows[0].cnt === 0) {
      console.log('🤖 [Auto-Seed] No Dispensing data found. Seeding...');
      exec(`"${process.execPath}" backend/seed_dispensing.js`, { cwd: path.join(__dirname, '../') });
    }

    const [damperRows] = await pool.query('SELECT COUNT(*) as cnt FROM damper_records');
    if (damperRows[0].cnt === 0) {
      console.log('🤖 [Auto-Seed] No Damper data found. Seeding...');
      exec(`"${process.execPath}" backend/seed_damper.js`, { cwd: path.join(__dirname, '../') });
    }
  } catch (e) {
    console.error('⚠️ [Auto-Seed] Check failed (Table might not exist yet):', e.message);
  }
}
autoSeedData();

// -------------------------------------------------------------------------
// HEALTH CHECK API
// -------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'IPQC Backend API is fully functional!' });
});

app.get('/api/debug/inspect-xlsx', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const XLSX = require('./xlsx.js');

    const file = path.join(__dirname, '../dataset/3.IPQC Buy off and Roving audit Laser engraving_2026/01.Buy off Laser engraving_2026/05.Buy off Laser engraving_May\'2026/Buy off Laser engraving Bobbin MR 10D.xlsx');
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: `File not found at ${file}` });
    }

    const buf = fs.readFileSync(file);
    const wb = XLSX.read(buf, { type: 'buffer' });

    let bestSheetName = wb.SheetNames[0];
    let maxRows = -1;
    for (const name of wb.SheetNames) {
      if (name.toLowerCase().includes('cover')) continue;
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length > maxRows) {
        maxRows = rows.length;
        bestSheetName = name;
      }
    }

    const ws = wb.Sheets[bestSheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const printedRows = [];
    for (let r = 0; r < Math.min(rows.length, 35); r++) {
      const row = rows[r];
      const nonEmpties = row.map((v, i) => v !== '' ? `[col ${i}]: ${JSON.stringify(v)}` : '').filter(Boolean);
      printedRows.push(`Row ${r}: ${nonEmpties.join(', ')}`);
    }

    res.json({
      file,
      selectedSheet: bestSheetName,
      maxRows,
      first35Rows: printedRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});


// =========================================================================
// TEMPORARY DISPENSING DEBUG API
// =========================================================================
app.get('/api/debug/inspect-dispensing', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const XLSX = require('./xlsx.js');

    const dir = path.join(__dirname, '../dataset/1.IPQC Buy off Dispensing_New_2026/01.Buy off Dispensing_2026');
    let targetFile = null;
    fs.readdirSync(dir).forEach(subDir => {
      const fullPath = path.join(dir, subDir);
      if (fs.statSync(fullPath).isDirectory()) {
        const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.xlsx') && !f.includes('~'));
        if (files.length > 0 && !targetFile) {
          targetFile = path.join(fullPath, files[0]);
        }
      }
    });

    if (!targetFile) return res.json({ error: "no file" });

    const buf = fs.readFileSync(targetFile);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    res.json({
      file: targetFile,
      rows: rows.slice(0, 20)
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// =========================================================================
// 1. PUSH OUT FORCE API ROUTES
// =========================================================================

// ดึงค่าตั้งค่าของ POF (SPC Config Mapping)
app.get('/api/pof/config', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT process_mode, product_key, dimension_name, lsl, lcl, cl, ucl, usl FROM spc_config_limits WHERE process_mode IN ("pof", "buyoff", "roving")');
    res.json({ success: true, limits: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ดึงผลบันทึกของ Push Out Force ทั้งหมด
app.get('/api/pof/records', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pof_records ORDER BY record_no ASC');
    const records = rows.map(r => {
      let vj = {};
      try { vj = typeof r.values_json === 'string' ? JSON.parse(r.values_json) : (r.values_json || {}); } catch (e) { }
      return {
        no: r.record_no,
        date: r.test_date
          ? (r.test_date instanceof Date
            ? `${r.test_date.getFullYear()}-${String(r.test_date.getMonth() + 1).padStart(2, '0')}-${String(r.test_date.getDate()).padStart(2, '0')}`
            : String(r.test_date).slice(0, 10))
          : '',
        // ── fields ที่เคยหายไป ──
        mode: r.mode || 'buyoff',
        coil_type: r.coil_type || 'sl',
        condition: r.category || 'NTC',
        product: r.product || '',
        product_label: r.product_label || '',
        unit: r.unit || 'Lbs',
        overall: r.overall || 'Pass',
        // ── SPC snapshot ──
        spc_ucl: r.spc_ucl != null ? parseFloat(r.spc_ucl) : null,
        spc_cl: r.spc_cl != null ? parseFloat(r.spc_cl) : null,
        spc_lcl: r.spc_lcl != null ? parseFloat(r.spc_lcl) : null,
        spc_trig: r.spc_trig != null ? parseFloat(r.spc_trig) : null,
        spc_spec: r.spc_spec != null ? parseFloat(r.spc_spec) : null,
        // ── ค่าวัด ──
        oven: r.oven,
        remark: r.remark,
        team: r.team,
        en: r.en,
        traveler: r.traveler,
        long1: r.long1 != null ? parseFloat(r.long1) : null,
        short2: r.short2 != null ? parseFloat(r.short2) : null,
        avg: r.avg_val != null ? parseFloat(r.avg_val) : null,
        max: r.max_val != null ? parseFloat(r.max_val) : null,
        min: r.min_val != null ? parseFloat(r.min_val) : null,
        range: r.range_val != null ? parseFloat(r.range_val) : null,
        spec_result: r.spec_result,
        trigger: r.trigger_val,
        out_cl: r.out_cl,
        trend: r.trend,
        nine_pt: r.nine_pt,
        savedAt: r.saved_at,
        values_json: r.values_json,
        lot: (vj && vj.lot) ? vj.lot : '',
        qty: (vj && vj.qty) ? vj.qty : ''
      };
    });
    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ดึงการแจ้งเตือนทั้งหมดของ Push Out Force
app.get('/api/pof/alerts', async (req, res) => {
  try {
    // JOIN กับ pof_records เพื่อดึง product, mode, coil_type, en, min ที่ JS ต้องการ
    const [rows] = await pool.query(
      `SELECT a.*, r.product, r.product_label, r.mode, r.coil_type, r.en, r.min_val
       FROM pof_alerts a
       LEFT JOIN pof_records r ON r.record_no = a.record_no
       ORDER BY a.alert_time DESC LIMIT 500`
    );
    const alerts = rows.map(r => ({
      id: r.id,
      time: new Date(r.alert_time).toLocaleString('th-TH'),
      ts: r.alert_time ? new Date(r.alert_time).toISOString() : new Date().toISOString(),
      no: r.record_no,
      level: r.spec_result === 'OUT' ? 'ng' : 'warn',
      product: r.product_label || r.product || '',
      mode: r.mode || 'buyoff',
      coil_type: r.coil_type || 'sl',
      en: r.en || '',
      traveler: r.traveler || '',
      avg: r.avg_val != null ? parseFloat(r.avg_val).toFixed(2) : '—',
      min: r.min_val != null ? parseFloat(r.min_val).toFixed(2) : '—',
      spec: r.spec_result || '',
      trigger: r.trigger_val || '',
      remark: r.remark || '',
      msg: r.remark || ''
    }));
    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ซิงค์ข้อมูลจาก LocalStorage (ทั้ง Records และ Alerts)
app.post('/api/pof/sync', async (req, res) => {
  const payload = req.body;
  const db_data = payload.db_data || payload;
  const records = db_data.records || [];
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const r of records) {
      const valuesJson = JSON.stringify(r);

      let existingId = null;
      if (r.id) {
        const [rows] = await connection.query('SELECT id FROM pof_records WHERE id = ?', [r.id]);
        if (rows.length > 0) existingId = rows[0].id;
      }
      if (!existingId && r.no) {
        const [rows] = await connection.query("SELECT id FROM pof_records WHERE record_no = ?", [r.no]);
        if (rows.length > 0) existingId = rows[0].id;
      }

      let dataType = r.mode || 'Buy off';
      if (dataType.toLowerCase().includes('roving')) dataType = 'Roving Audit';
      else if (dataType.toLowerCase().includes('oba')) dataType = 'OBA';
      else if (dataType.toLowerCase().includes('special')) dataType = 'Special';
      else dataType = 'Buy off';

      let status = r.overall || r.status || 'WAITING';
      if (status.toLowerCase() === 'pass') status = 'ACCEPT';
      if (status.toLowerCase() === 'fail') status = 'REJECT';

      // Parse explicit POF measurement fields
      const config_id = r.config_id || null;
      const mode = r.mode || 'buyoff';
      const coil_type = r.coil_type || r.coilType || 'sl';
      const product_label = r.product_label || r.productLabel || '';
      const unit = r.unit || 'Lbs';
      const overall = r.overall || 'Pass';
      const spc_ucl = r.spc_ucl != null ? parseFloat(r.spc_ucl) : null;
      const spc_cl = r.spc_cl != null ? parseFloat(r.spc_cl) : null;
      const spc_lcl = r.spc_lcl != null ? parseFloat(r.spc_lcl) : null;
      const spc_trig = r.spc_trig != null ? parseFloat(r.spc_trig) : null;
      const spc_spec = r.spc_spec != null ? parseFloat(r.spc_spec) : null;
      const remark = r.remark || '';
      const en = r.en || r.op || '';
      const traveler = r.traveler || r.ptno || '';
      const long1 = r.long1 != null ? parseFloat(r.long1) : null;
      const short2 = r.short2 != null ? parseFloat(r.short2) : null;
      const avg_val = r.avg != null ? parseFloat(r.avg) : null;
      const max_val = r.max != null ? parseFloat(r.max) : null;
      const min_val = r.min != null ? parseFloat(r.min) : null;
      const range_val = r.range != null ? parseFloat(r.range) : null;
      const spec_result = r.spec_result || null;
      const trigger_val = r.trigger_val || r.trigger || null;
      const out_cl = r.out_cl || null;
      const trend = r.trend || null;
      const nine_pt = r.nine_pt || null;
      const eblock_long = r.eblock_long != null ? parseFloat(r.eblock_long) : null;
      const eblock_short = r.eblock_short != null ? parseFloat(r.eblock_short) : null;
      const eblock_avg = r.eblock_avg != null ? parseFloat(r.eblock_avg) : null;
      const coil_short = r.coil_short != null ? parseFloat(r.coil_short) : null;
      const coil_center = r.coil_center != null ? parseFloat(r.coil_center) : null;
      const coil_long = r.coil_long != null ? parseFloat(r.coil_long) : null;
      const bobbin_short = r.bobbin_short != null ? parseFloat(r.bobbin_short) : null;
      const bobbin_center = r.bobbin_center != null ? parseFloat(r.bobbin_center) : null;
      const bobbin_long = r.bobbin_long != null ? parseFloat(r.bobbin_long) : null;

      if (existingId) {
        await connection.query(
          `UPDATE pof_records SET product=?, fixture=?, pt_number=?, test_date=?, oven=?, team=?, op=?, data_type=?, category=?, status=?, config_id=?, mode=?, coil_type=?, product_label=?, unit=?, overall=?, spc_ucl=?, spc_cl=?, spc_lcl=?, spc_trig=?, spc_spec=?, remark=?, en=?, traveler=?, long1=?, short2=?, avg_val=?, max_val=?, min_val=?, range_val=?, spec_result=?, trigger_val=?, out_cl=?, trend=?, nine_pt=?, eblock_long=?, eblock_short=?, eblock_avg=?, coil_short=?, coil_center=?, coil_long=?, bobbin_short=?, bobbin_center=?, bobbin_long=?, values_json=? WHERE id=?`,
          [
            r.product || '', r.fixture || '', r.ptno || '', r.date || new Date(), r.oven || '', r.team || '', en,
            dataType, r.condition || r.category || 'NTC', status, config_id, mode, coil_type, product_label, unit, overall, spc_ucl, spc_cl, spc_lcl, spc_trig, spc_spec, remark, en, traveler, long1, short2, avg_val, max_val, min_val, range_val, spec_result, trigger_val, out_cl, trend, nine_pt, eblock_long, eblock_short, eblock_avg, coil_short, coil_center, coil_long, bobbin_short, bobbin_center, bobbin_long, valuesJson, existingId
          ]
        );
      } else {
        await connection.query(
          `INSERT INTO pof_records (id, product, fixture, pt_number, test_date, oven, team, op, data_type, category, status, config_id, mode, coil_type, product_label, unit, overall, spc_ucl, spc_cl, spc_lcl, spc_trig, spc_spec, remark, en, traveler, long1, short2, avg_val, max_val, min_val, range_val, spec_result, trigger_val, out_cl, trend, nine_pt, eblock_long, eblock_short, eblock_avg, coil_short, coil_center, coil_long, bobbin_short, bobbin_center, bobbin_long, values_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            null, r.product || '', r.fixture || '', r.ptno || '', r.date || new Date(), r.oven || '', r.team || '', en,
            dataType, r.condition || r.category || 'NTC', status, config_id, mode, coil_type, product_label, unit, overall, spc_ucl, spc_cl, spc_lcl, spc_trig, spc_spec, remark, en, traveler, long1, short2, avg_val, max_val, min_val, range_val, spec_result, trigger_val, out_cl, trend, nine_pt, eblock_long, eblock_short, eblock_avg, coil_short, coil_center, coil_long, bobbin_short, bobbin_center, bobbin_long, valuesJson
          ]
        );
      }
    }

    const alerts = payload.alerts || db_data.alerts || payload.alert_log || db_data.alert_log || [];
    if (alerts && alerts.length > 0) {
      for (const a of alerts) {
        await connection.query(
          "INSERT INTO system_alert (process_type, alert_time, level, product, fixture, oven, traveler, param, value_val, spec_str, msg, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ['POF', new Date(a.ts || a.time), a.level, a.product, '', a.oven || '', a.traveler || '', 'POF', a.avg || null, a.spec_result || '', a.msg, JSON.stringify(a)]
        );
      }
      require('./alert_service').processAlerts(pool, 'POF', alerts).catch(console.error);
    }

    await connection.commit();
    res.json({ success: true, message: 'POF synced' });
  } catch (e) {
    await connection.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    if (connection) connection.release();
  }
});
app.delete('/api/pof/records/:no', async (req, res) => {
  const { no } = req.params;
  try {
    await pool.query('DELETE FROM pof_records WHERE record_no = ?', [no]);
    // ปรับ record_no ที่เหลือให้เรียงลำดับใหม่
    await pool.query('UPDATE pof_records SET record_no = record_no - 1 WHERE record_no > ?', [no]);
    res.json({ success: true, message: `Deleted record #${no} successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ล้างผลบันทึกของ Push Out Force ทั้งหมด
app.delete('/api/pof/records', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE pof_records');
    res.json({ success: true, message: 'All POF records cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ล้างผลบันทึกของการแจ้งเตือนทั้งหมด
app.delete('/api/pof/alerts', async (req, res) => {
  try {
    await pool.query("DELETE FROM system_alert WHERE process_type = 'POF'");
    res.json({ success: true, message: 'All POF alerts cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// =========================================================================
// 2. DAMPER INSTALL BUY OFF API ROUTES
// =========================================================================

// ดึงผลบันทึกของ Damper Install ทั้งหมด
app.get('/api/damper/records', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM damper_records ORDER BY test_date DESC, id DESC');
    const records = rows.map(r => ({
      no: r.record_no,
      mode: r.mode || 'Buy off',
      date: r.test_date
        ? (r.test_date instanceof Date
          ? `${r.test_date.getFullYear()}-${String(r.test_date.getMonth() + 1).padStart(2, '0')}-${String(r.test_date.getDate()).padStart(2, '0')}`
          : String(r.test_date).slice(0, 10))
        : '',
      sendTime: r.send_time,
      recvTime: r.recv_time,
      attribute: r.attribute,
      traveler: r.traveler,
      qcEn: r.qc_en,
      meEn: r.me_en,
      team: r.team,
      vmi: r.vmi_results ? JSON.parse(r.vmi_results) : {},
      vmiPass: r.vmi_pass === 1,
      short: {
        vals: r.short_vals ? r.short_vals.split(',').map(v => v === 'null' ? null : parseFloat(v)) : [],
        avg: r.short_avg ? parseFloat(r.short_avg) : null,
        max: r.short_max ? parseFloat(r.short_max) : null,
        min: r.short_min ? parseFloat(r.short_min) : null,
        inSpec: r.short_in_spec === 1
      },
      long: {
        vals: r.long_vals ? r.long_vals.split(',').map(v => v === 'null' ? null : parseFloat(v)) : [],
        avg: r.long_avg ? parseFloat(r.long_avg) : null,
        max: r.long_max ? parseFloat(r.long_max) : null,
        min: r.long_min ? parseFloat(r.long_min) : null,
        inSpec: r.long_in_spec === 1
      },
      overallPass: r.overall_pass === 1,
      savedAt: r.saved_at
    }));
    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ดึงค่าตั้งค่าของ Damper Install (SPC Config Mapping)
app.get('/api/damper/config', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT process_mode, product_key, dimension_name, lsl, lcl, cl, ucl, usl FROM spc_config_limits WHERE process_mode IN ("damper", "buyoff", "roving")');
    res.json({ success: true, limits: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ดึงแจ้งเตือนของ Damper
app.get('/api/damper/alerts', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM system_alert WHERE process_type = 'Damper' ORDER BY alert_time DESC LIMIT 500");
    const alerts = rows.map(r => ({
      id: r.id,
      ts: r.alert_time ? new Date(r.alert_time).toISOString() : new Date().toISOString(),
      time: r.alert_time ? new Date(r.alert_time).toLocaleString('th-TH') : '',
      no: r.record_no,
      traveler: r.traveler,
      attribute: r.attribute,
      reason: r.reason || '',
      msg: (r.reason || r.attribute || ''),
      shortResult: r.short_result || '',
      longResult: r.long_result
    }));
    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ซิงค์ระบบ Damper Install
app.post('/api/damper/sync', async (req, res) => {
  const payload = req.body;
  const db_data = payload.db_data || payload;
  const records = db_data.records || [];
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const r of records) {
      const valuesJson = JSON.stringify(r);

      let existingId = null;
      if (r.id) {
        const [rows] = await connection.query('SELECT id FROM damper_records WHERE id = ?', [r.id]);
        if (rows.length > 0) existingId = rows[0].id;
      }
      if (!existingId && r.no) {
        const [rows] = await connection.query('SELECT id FROM damper_records WHERE record_no = ?', [r.no]);
        if (rows.length > 0) existingId = rows[0].id;
      }

      let dataType = r.mode || 'Buy off';
      if (dataType.toLowerCase().includes('roving')) dataType = 'Roving Audit';
      else dataType = 'Buy off';

      let status = r.overall || r.status || 'waiting';
      if (status === 'Pass' || status === 'pass') status = 'ACCEPT';
      if (status === 'Fail' || status === 'fail') status = 'REJECT';

      const config_id = r.config_id || null;

      // Parse explicit Damper measurement fields
      const mode = r.mode || 'Buy off';
      const send_time = r.sendTime || r.send_time || '';
      const recv_time = r.recvTime || r.recv_time || '';
      const attribute = r.attribute || 'Normal';
      const traveler = r.traveler || '';
      const qc_en = r.qcEn || r.qc_en || '';
      const me_en = r.meEn || r.me_en || '';
      const team = r.team || '';
      const vmi_results = r.vmi ? JSON.stringify(r.vmi) : (r.vmi_results || null);
      const vmi_pass = r.vmiNG !== undefined ? !r.vmiNG : (r.vmiPass !== undefined ? (r.vmiPass ? 1 : 0) : (r.vmi_pass !== undefined ? r.vmi_pass : 1));

      const shortObj = r.dimData ? (r.dimData['datum'] || r.dimData['short_p1']) : r.short;
      const longObj = r.dimData ? (r.dimData['nondatum'] || r.dimData['long_top']) : r.long;

      const short_vals = shortObj?.vals ? shortObj.vals.join(',') : (r.datumAvg != null ? '' : (r.shortAvg != null ? '' : (r.short_vals || '')));
      const short_avg = shortObj?.avg != null ? parseFloat(shortObj.avg) : (r.datumAvg != null ? parseFloat(r.datumAvg) : (r.shortAvg != null ? parseFloat(r.shortAvg) : null));
      const short_max = shortObj?.max != null ? parseFloat(shortObj.max) : (r.datumMax != null ? parseFloat(r.datumMax) : (r.shortMax != null ? parseFloat(r.shortMax) : null));
      const short_min = shortObj?.min != null ? parseFloat(shortObj.min) : (r.datumMin != null ? parseFloat(r.datumMin) : (r.shortMin != null ? parseFloat(r.shortMin) : null));
      const short_in_spec = shortObj?.result ? (shortObj.result === 'Pass' ? 1 : 0) : (shortObj?.inSpec !== undefined ? (shortObj.inSpec ? 1 : 0) : (r.datumResult === 'Pass' ? 1 : (r.datumResult === 'Fail' ? 0 : (r.shortResult === 'Pass' ? 1 : (r.shortResult === 'Fail' ? 0 : 1)))));

      const long_vals = longObj?.vals ? longObj.vals.join(',') : (r.nondatumAvg != null ? '' : (r.longAvg != null ? '' : (r.long_vals || '')));
      const long_avg = longObj?.avg != null ? parseFloat(longObj.avg) : (r.nondatumAvg != null ? parseFloat(r.nondatumAvg) : (r.longAvg != null ? parseFloat(r.longAvg) : null));
      const long_max = longObj?.max != null ? parseFloat(longObj.max) : (r.nondatumMax != null ? parseFloat(r.nondatumMax) : (r.longMax != null ? parseFloat(r.longMax) : null));
      const long_min = longObj?.min != null ? parseFloat(longObj.min) : (r.nondatumMin != null ? parseFloat(r.nondatumMin) : (r.longMin != null ? parseFloat(r.longMin) : null));
      const long_in_spec = longObj?.result ? (longObj.result === 'Pass' ? 1 : 0) : (longObj?.inSpec !== undefined ? (longObj.inSpec ? 1 : 0) : (r.nondatumResult === 'Pass' ? 1 : (r.nondatumResult === 'Fail' ? 0 : (r.longResult === 'Pass' ? 1 : (r.longResult === 'Fail' ? 0 : 1)))));

      const overall_pass = r.overall === 'Pass' ? 1 : (r.overallPass ? 1 : (r.overall_pass !== undefined ? r.overall_pass : 0));

      const actualProduct = r.productKey || r.product || '';
      const actualFixture = r.mc || r.fixture || '';

      if (existingId) {
        await connection.query(
          `UPDATE damper_records SET product=?, fixture=?, pt_number=?, test_date=?, op=?, data_type=?, category=?, status=?, config_id=?, mode=?, send_time=?, recv_time=?, attribute=?, traveler=?, qc_en=?, me_en=?, team=?, vmi_results=?, vmi_pass=?, short_vals=?, short_avg=?, short_max=?, short_min=?, short_in_spec=?, long_vals=?, long_avg=?, long_max=?, long_min=?, long_in_spec=?, overall_pass=?, values_json=? WHERE id=?`,
          [
            actualProduct, actualFixture, r.ptno || r.partno || '', r.date || new Date(), r.op || r.qcEn || r.en || '',
            dataType, r.category || 'TC', status, config_id, mode, send_time, recv_time, attribute, traveler, qc_en, me_en, team, vmi_results, vmi_pass, short_vals, short_avg, short_max, short_min, short_in_spec, long_vals, long_avg, long_max, long_min, long_in_spec, overall_pass, valuesJson, existingId
          ]
        );
      } else {
        await connection.query(
          `INSERT INTO damper_records (id, record_no, product, fixture, pt_number, test_date, op, data_type, category, status, config_id, mode, send_time, recv_time, attribute, traveler, qc_en, me_en, team, vmi_results, vmi_pass, short_vals, short_avg, short_max, short_min, short_in_spec, long_vals, long_avg, long_max, long_min, long_in_spec, overall_pass, values_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            null, r.no, actualProduct, actualFixture, r.ptno || r.partno || '', r.date || new Date(), r.op || r.qcEn || r.en || '',
            dataType, r.category || 'TC', status, config_id, mode, send_time, recv_time, attribute, traveler, qc_en, me_en, team, vmi_results, vmi_pass, short_vals, short_avg, short_max, short_min, short_in_spec, long_vals, long_avg, long_max, long_min, long_in_spec, overall_pass, valuesJson
          ]
        );
      }
    }
    const alerts = payload.alerts || db_data.alerts || [];
    if (alerts && alerts.length > 0) {
      for (const a of alerts) {
        await connection.query(
          "INSERT INTO system_alert (process_type, alert_time, level, product, fixture, oven, traveler, param, value_val, spec_str, msg, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ['Damper', new Date(a.ts || a.time), a.level, a.product, '', a.oven || '', a.traveler || '', 'Damper', a.avg || null, a.spec_result || '', a.msg, JSON.stringify(a)]
        );
      }
      require('./alert_service').processAlerts(pool, 'Damper', alerts).catch(console.error);
    }
    await connection.commit();
    res.json({ success: true, message: 'Damper synced' });
  } catch (e) {
    await connection.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    if (connection) connection.release();
  }
});
app.delete('/api/damper/records/:no', async (req, res) => {
  const { no } = req.params;
  try {
    await pool.query('DELETE FROM damper_records WHERE record_no = ?', [no]);
    // ปรับ record_no ที่เหลือให้เรียงลำดับใหม่
    await pool.query('UPDATE damper_records SET record_no = record_no - 1 WHERE record_no > ?', [no]);
    res.json({ success: true, message: `Deleted damper record #${no} successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ล้างผลบันทึกของ Damper Install ทั้งหมด
app.delete('/api/damper/records', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE damper_records');
    res.json({ success: true, message: 'All damper records cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ล้างประวัติแจ้งเตือนของ Damper ทั้งหมด
app.delete('/api/damper/alerts', async (req, res) => {
  try {
    await pool.query("DELETE FROM system_alert WHERE process_type = 'Damper'");
    res.json({ success: true, message: 'All damper alerts cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// =========================================================================
// 3. LASER ENGRAVING API ROUTES
// =========================================================================

// helper: แปลง Date object หรือ string ให้เป็น ISO string ปลอดภัย
function toISOSafe(val) {
  if (!val) return null;
  try {
    const d = val instanceof Date ? val : new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch (e) { return null; }
}

// ดึงบันทึก Laser — ส่ง field ให้ตรงกับ schema ของ laser.js ทุก field
app.get('/api/laser/records', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM laser_records ORDER BY created_at DESC, record_id DESC');
    const records = rows.map(r => {
      let parsedDefectsRaw = {};
      try {
        parsedDefectsRaw = r.defects_json ? JSON.parse(r.defects_json) : {};
      } catch (e) { parsedDefectsRaw = {}; }

      let productKey = String(r.product || '').trim();
      if (!productKey && r.product_label) productKey = String(r.product_label).trim();
      // Keep the key as-is (frontend will match it); do NOT lowercase/strip it here
      // so that keys like 'dorado5dalbb' remain intact for PRODUCTS lookup

      // Normalize defect keys so frontend `laser.js` (which expects names like z1_missing, z2_skip)
      // can find them even if the importer stripped non-alphanum characters.
      const parsedDefects = {};
      Object.keys(parsedDefectsRaw).forEach(k => {
        if (!k) return;
        const low = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

        // map keys like z1missing or z2skip -> z1_missing, z2_skip
        const m = low.match(/^z([123])(.*)$/);
        if (m) {
          const zone = m[1];
          let rest = m[2] || '';
          rest = rest.replace(/^_+/, '');
          const normalized = `z${zone}_${rest}`;
          parsedDefects[normalized] = parsedDefectsRaw[k];
          return;
        }

        // map legacy LF/SF keys like lfskip, sfwidth -> lf_skip, sf_width
        const legacy = low.match(/^(lf|sf)(skip|incomplete|width|length|position)(.*)$/);
        if (legacy) {
          const prefix = legacy[1];
          const field = legacy[2];
          const rest = (legacy[3] || '').replace(/^_+/, '');
          const normalized = `${prefix}_${field}${rest ? `_${rest}` : ''}`;
          parsedDefects[normalized] = parsedDefectsRaw[k];
          return;
        }

        // fallback: keep cleaned key as-is
        parsedDefects[low] = parsedDefectsRaw[k];
      });

      // Normalize defect values to standardized labels used by frontend
      function normVal(v) {
        if (v === undefined || v === null) return '-';
        const s = String(v).toLowerCase().trim();
        if (s === '' || s === '-') return '-';
        if (['1', '/', 'pass', 'ok', 'p'].includes(s)) return 'Pass';
        if (['0', 'x', 'fail', 'ng'].includes(s)) return 'Fail';
        if (s.includes('hold')) return 'Hold';
        return (s.charAt(0).toUpperCase() + s.slice(1));
      }
      Object.keys(parsedDefects).forEach(k => { parsedDefects[k] = normVal(parsedDefects[k]); });

      // ── Ensure ALL defect keys that laser.js expects exist at root level ──
      // laser.js DEFECT_FIELDS ต้องการ key เหล่านี้ที่ root ของ record object
      // ถ้า defects_json ไม่มี key ไหน → default '-' (ไม่ใช่ 'Pass' เพื่อไม่ให้ false positive)
      const REQUIRED_DEFECT_KEYS = [
        'lf_skip', 'lf_incomplete', 'lf_width', 'lf_length', 'lf_position',
        'sf_skip', 'sf_incomplete', 'sf_width', 'sf_length', 'sf_position',
        'z1_skip', 'z1_incomplete', 'z1_width', 'z1_length', 'z1_position',
        'z2_skip', 'z2_incomplete', 'z2_width', 'z2_length', 'z2_position',
        'z3_skip', 'z3_incomplete', 'z3_width', 'z3_length', 'z3_position',
        'z1_missing', 'z2_missing'
      ];
      REQUIRED_DEFECT_KEYS.forEach(k => {
        if (parsedDefects[k] === undefined) parsedDefects[k] = '-';
      });

      return {
        id: r.id,
        mode: r.mode || 'buyoff',
        // ฟิลด์ชื่อ 'type' ใน laser.js ตรงกับ column 'product_type' ใน DB
        type: r.product_type || 'Epoch',
        product: productKey || '',
        // Provide product_label as well for nicer display (fallback to product)
        product_label: r.product_label || r.product || '',
        productLabel: r.product_label || r.product || '',
        partno: r.partno || '',
        qty: r.qty || '',
        machine: r.machine || '',
        // test_date อาจเป็น Date object จาก MySQL ต้องแปลงเป็น string ก่อน ป้องกัน timezone shift
        date: r.test_date ? (r.test_date instanceof Date ? `${r.test_date.getFullYear()}-${String(r.test_date.getMonth() + 1).padStart(2, '0')}-${String(r.test_date.getDate()).padStart(2, '0')}` : String(r.test_date).slice(0, 10)) : '',
        en: r.en || '',
        sendtime: r.sendtime || '',
        recvtime: r.recvtime || '',
        fixture: r.fixture || '',
        ptno: r.ptno || '',
        attr: r.attr || 'Normal',
        remark: r.remark || '',
        source: r.source || 'manual',
        // ts: returns ISO string for frontend sorting
        ts: toISOSafe(r.created_at) || new Date().toISOString(),
        // draftIndex: ต้องเป็น number (laser.js แสดง #1, #2, ...)
        draftIndex: r.draft_index != null ? parseInt(r.draft_index, 10) : null,
        overall: r.overall || 'Pass',
        vmi: r.vmi || 'Pass',
        // กระจาย defect fields (z1_skip, z2_fail, ...) ออกมาที่ root object
        ...parsedDefects
      };
    });
    res.json({ success: true, records });
  } catch (error) {
    console.error('GET /api/laser/records error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ดึงแจ้งเตือนของ Laser — ส่ง field ให้ตรงกับที่ refreshDataFromServer ใน laser.js ต้องการ
app.get('/api/laser/alerts', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM system_alert WHERE process_type = 'Laser' ORDER BY alert_time DESC LIMIT 500");

    const alerts = rows.map(r => {
      return {
        id: r.id,
        ts: r.alert_time ? new Date(r.alert_time).toISOString() : new Date().toISOString(),
        time: r.alert_time ? new Date(r.alert_time).toLocaleString('th-TH') : '',
        recordId: r.record_id,
        traveler: r.traveler || '',
        product: r.product || '',
        product_label: r.product_label || '',
        productLabel: r.product_label || '',
        fixture: r.fixture || '',
        machine: r.machine || '',
        level: r.level || 'ng',
        msg: r.msg || '',
        defects: r.details?.defects || []
      };
    });
    res.json({ success: true, alerts });
  } catch (error) {
    console.error('GET /api/laser/alerts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ดึงค่าตั้งค่าของ Laser
app.get('/api/laser/config', async (req, res) => {
  try {
    // Read from laser_config table (product_key-based rows)
    const [rows] = await pool.query('SELECT * FROM laser_config');
    let cfg = { typeQty: {}, productQty: {} };
    for (const row of rows) {
      if (row.product_key === 'DEFAULT') {
        if (row.eblock_qty !== null) {
          cfg.typeQty['E-block'] = row.eblock_qty.toString();
          cfg.typeQty['Epoch'] = row.eblock_qty.toString();
        }
        if (row.bobbin_qty !== null) cfg.typeQty['Bobbin'] = row.bobbin_qty.toString();
      } else {
        cfg.productQty[row.product_key] = {};
        if (row.eblock_qty !== null) cfg.productQty[row.product_key]['E-block'] = row.eblock_qty.toString();
        if (row.bobbin_qty !== null) cfg.productQty[row.product_key]['Bobbin'] = row.bobbin_qty.toString();
      }
    }
    res.json({ success: true, config: cfg });
  } catch (error) {
    console.error('GET /api/laser/config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// บันทึก Record ใหม่ (พร้อมตรวจจับ Duplicate: Date, Machine, PT/LOT, Mode, Attribute)
app.post('/api/laser/records', async (req, res) => {
  const records = req.body.records || [];
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid records array' });
  }

  const STANDARD_FIELDS = new Set([
    'mode', 'type', 'product', 'product_label', 'productLabel', 'partno', 'qty', 'machine', 'date',
    'en', 'sendtime', 'recvtime', 'fixture', 'ptno', 'attr', 'remark',
    'source', 'id', 'ts', 'draftIndex', 'overall', 'vmi', 'no'
  ]);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const insertedIds = [];
    const duplicates = [];

    for (const r of records) {
      const mode = r.mode || 'buyoff';
      const machine = String(r.machine || '').trim();
      const ptno = String(r.ptno || '').trim();
      const attr = String(r.attr || 'Normal').trim();
      const testDate = r.date || null;

      // Check duplicate removed to allow auto-cloned identical records
      // const [dupRows] = await connection.query(
      //   `SELECT id FROM laser_records 
      //    WHERE mode = ? AND machine = ? AND ptno = ? AND attr = ? AND test_date = ? 
      //    LIMIT 1`,
      //   [mode, machine, ptno, attr, testDate]
      // );
      // 
      // if (dupRows.length > 0) {
      //   duplicates.push({ machine, ptno, attr, date: testDate });
      //   continue; // ข้ามการ insert ถ้าเป็น duplicate
      // }

      // แยก defect fields
      const defects = {};
      Object.keys(r).forEach(key => {
        if (!STANDARD_FIELDS.has(key)) defects[key] = r[key];
      });

      const defectsJson = JSON.stringify(defects);
      const recId = null; // Do not use r.id because it's usually Date.now() which is out of range for INT
      const recTs = r.ts ? new Date(r.ts) : new Date();
      const draftIdx = r.draftIndex != null ? parseInt(r.draftIndex, 10) : null;

      // Extract individual defect columns from the record
      const lf_skip = r.lf_skip || defects.lf_skip || null;
      const lf_incomplete = r.lf_incomplete || defects.lf_incomplete || null;
      const lf_width = r.lf_width != null ? r.lf_width : (defects.lf_width != null ? defects.lf_width : null);
      const lf_length = r.lf_length != null ? r.lf_length : (defects.lf_length != null ? defects.lf_length : null);
      const lf_position = r.lf_position != null ? r.lf_position : (defects.lf_position != null ? defects.lf_position : null);
      const sf_skip = r.sf_skip || defects.sf_skip || null;
      const sf_incomplete = r.sf_incomplete || defects.sf_incomplete || null;
      const sf_width = r.sf_width != null ? r.sf_width : (defects.sf_width != null ? defects.sf_width : null);
      const sf_length = r.sf_length != null ? r.sf_length : (defects.sf_length != null ? defects.sf_length : null);
      const sf_position = r.sf_position != null ? r.sf_position : (defects.sf_position != null ? defects.sf_position : null);
      const z1_skip = r.z1_skip || defects.z1_skip || null;
      const z1_incomplete = r.z1_incomplete || defects.z1_incomplete || null;
      const z1_width = r.z1_width != null ? r.z1_width : (defects.z1_width != null ? defects.z1_width : null);
      const z1_length = r.z1_length != null ? r.z1_length : (defects.z1_length != null ? defects.z1_length : null);
      const z1_position = r.z1_position != null ? r.z1_position : (defects.z1_position != null ? defects.z1_position : null);
      const z2_skip = r.z2_skip || defects.z2_skip || null;
      const z2_incomplete = r.z2_incomplete || defects.z2_incomplete || null;
      const z2_width = r.z2_width != null ? r.z2_width : (defects.z2_width != null ? defects.z2_width : null);
      const z2_length = r.z2_length != null ? r.z2_length : (defects.z2_length != null ? defects.z2_length : null);
      const z2_position = r.z2_position != null ? r.z2_position : (defects.z2_position != null ? defects.z2_position : null);
      const z3_skip = r.z3_skip || defects.z3_skip || null;
      const z3_incomplete = r.z3_incomplete || defects.z3_incomplete || null;
      const z3_width = r.z3_width != null ? r.z3_width : (defects.z3_width != null ? defects.z3_width : null);
      const z3_length = r.z3_length != null ? r.z3_length : (defects.z3_length != null ? defects.z3_length : null);
      const z3_position = r.z3_position != null ? r.z3_position : (defects.z3_position != null ? defects.z3_position : null);
      const z1_missing = r.z1_missing || defects.z1_missing || null;
      const z2_missing = r.z2_missing || defects.z2_missing || null;

      await connection.query(
        `INSERT INTO laser_records
           (id, mode, product_type, product, product_label, partno, qty, machine,
            test_date, en, sendtime, recvtime, fixture, ptno,
            attr, remark, source, ts, draft_index, overall, vmi, defects_json,
            lf_skip, lf_incomplete, lf_width, lf_length, lf_position,
            sf_skip, sf_incomplete, sf_width, sf_length, sf_position,
            z1_skip, z1_incomplete, z1_width, z1_length, z1_position,
            z2_skip, z2_incomplete, z2_width, z2_length, z2_position,
            z3_skip, z3_incomplete, z3_width, z3_length, z3_position,
            z1_missing, z2_missing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recId, mode, r.type || 'Epoch', r.product || '', r.product_label || r.productLabel || r.product || '',
          r.partno || '', r.qty || '', machine, testDate, r.en || '', r.sendtime || '', r.recvtime || '',
          r.fixture || '', ptno, attr, r.remark || '', r.source || 'manual', recTs, draftIdx,
          r.overall || 'Pass', r.vmi || 'Pass', defectsJson,
          lf_skip, lf_incomplete, lf_width, lf_length, lf_position,
          sf_skip, sf_incomplete, sf_width, sf_length, sf_position,
          z1_skip, z1_incomplete, z1_width, z1_length, z1_position,
          z2_skip, z2_incomplete, z2_width, z2_length, z2_position,
          z3_skip, z3_incomplete, z3_width, z3_length, z3_position,
          z1_missing, z2_missing
        ]
      );
      insertedIds.push(recId);
    }

    await connection.commit();
    res.json({
      success: true,
      inserted: insertedIds.length,
      duplicates: duplicates,
      message: duplicates.length > 0 ? `พบข้อมูลซ้ำ ${duplicates.length} รายการ` : 'บันทึกสำเร็จ'
    });
  } catch (error) {
    await connection.rollback();
    console.error('POST /api/laser/records error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
});

// ซิงค์ระบบ Laser (ทั้ง Records, Alerts และ Config)
app.post('/api/laser/sync', async (req, res) => {
  const payload = req.body;
  const db_data = payload.db_data || payload;
  const records = db_data.records || [];
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const r of records) {
      const valuesJson = JSON.stringify(r);

      let existingId = null;
      if (r.id) {
        const [rows] = await connection.query('SELECT id FROM laser_records WHERE id = ?', [r.id]);
        if (rows.length > 0) existingId = rows[0].id;
      }
      if (!existingId && r.product && r.fixture && r.date) {
        const [rows] = await connection.query('SELECT id FROM laser_records WHERE product=? AND fixture=? AND test_date=?', [r.product, r.fixture, r.date]);
        if (rows.length > 0) existingId = rows[0].id;
      }

      const pType = (r.type && r.type.toLowerCase() === 'bobbin') ? 'Bobbin' : 'E-block';
      let status = r.overall || 'WAITING';
      if (status.toLowerCase() === 'pass') status = 'ACCEPT';
      if (status.toLowerCase() === 'fail') status = 'REJECT';

      // Extract defect fields from the record for explicit column storage
      const LASER_DEFECT_KEYS = [
        'lf_skip', 'lf_incomplete', 'lf_width', 'lf_length', 'lf_position',
        'sf_skip', 'sf_incomplete', 'sf_width', 'sf_length', 'sf_position',
        'z1_skip', 'z1_incomplete', 'z1_width', 'z1_length', 'z1_position',
        'z2_skip', 'z2_incomplete', 'z2_width', 'z2_length', 'z2_position',
        'z3_skip', 'z3_incomplete', 'z3_width', 'z3_length', 'z3_position',
        'z1_missing', 'z2_missing'
      ];
      const defectVals = LASER_DEFECT_KEYS.map(k => r[k] != null ? r[k] : null);
      const defectsJson = JSON.stringify(r);

      // Build defects_json from non-standard fields
      const STANDARD_SYNC = new Set(['id', 'mode', 'type', 'product', 'product_label', 'productLabel', 'partno', 'qty', 'machine', 'date', 'en', 'sendtime', 'recvtime', 'fixture', 'ptno', 'attr', 'remark', 'source', 'ts', 'draftIndex', 'overall', 'vmi', 'no', 'config_id', 'op', 'category']);
      const defectsObj = {};
      Object.keys(r).forEach(k => { if (!STANDARD_SYNC.has(k)) defectsObj[k] = r[k]; });
      const defectsJsonClean = JSON.stringify(defectsObj);

      if (existingId) {
        await connection.query(
          `UPDATE laser_records SET product=?, product_label=?, product_type=?, mode=?, fixture=?, ptno=?, partno=?, test_date=?, en=?, machine=?, sendtime=?, recvtime=?, attr=?, remark=?, source=?, overall=?, vmi=?, config_id=?, defects_json=?, values_json=?,
            lf_skip=?, lf_incomplete=?, lf_width=?, lf_length=?, lf_position=?,
            sf_skip=?, sf_incomplete=?, sf_width=?, sf_length=?, sf_position=?,
            z1_skip=?, z1_incomplete=?, z1_width=?, z1_length=?, z1_position=?,
            z2_skip=?, z2_incomplete=?, z2_width=?, z2_length=?, z2_position=?,
            z3_skip=?, z3_incomplete=?, z3_width=?, z3_length=?, z3_position=?,
            z1_missing=?, z2_missing=?
           WHERE id=?`,
          [
            r.product || '', r.product_label || r.productLabel || r.product || '', pType, r.mode || 'buyoff',
            r.fixture || '', r.ptno || r.partno || '', r.partno || '', r.date || new Date(), r.en || r.op || '',
            r.machine || '', r.sendtime || '', r.recvtime || '', r.attr || 'Normal', r.remark || '',
            r.source || 'manual', r.overall || 'Pass', r.vmi || 'Pass', r.config_id || null,
            defectsJsonClean, valuesJson,
            ...defectVals,
            existingId
          ]
        );
      } else {
        await connection.query(
          `INSERT INTO laser_records (id, product, product_label, product_type, mode, fixture, ptno, partno, test_date, en, machine, sendtime, recvtime, attr, remark, source, overall, vmi, config_id, defects_json, values_json,
            lf_skip, lf_incomplete, lf_width, lf_length, lf_position,
            sf_skip, sf_incomplete, sf_width, sf_length, sf_position,
            z1_skip, z1_incomplete, z1_width, z1_length, z1_position,
            z2_skip, z2_incomplete, z2_width, z2_length, z2_position,
            z3_skip, z3_incomplete, z3_width, z3_length, z3_position,
            z1_missing, z2_missing)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            null, r.product || '', r.product_label || r.productLabel || r.product || '', pType, r.mode || 'buyoff',
            r.fixture || '', r.ptno || r.partno || '', r.partno || '', r.date || new Date(), r.en || r.op || '',
            r.machine || '', r.sendtime || '', r.recvtime || '', r.attr || 'Normal', r.remark || '',
            r.source || 'manual', r.overall || 'Pass', r.vmi || 'Pass', r.config_id || null,
            defectsJsonClean, valuesJson,
            ...defectVals
          ]
        );
      }
    }
    const alerts = payload.alerts || db_data.alerts || payload.alert_log || db_data.alert_log || [];
    if (alerts && alerts.length > 0) {
      for (const a of alerts) {
        await connection.query(
          "INSERT INTO system_alert (process_type, alert_time, level, product, fixture, oven, traveler, param, value_val, spec_str, msg, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ['Laser', new Date(a.ts || a.time), a.level, a.product, '', a.oven || '', a.traveler || '', 'Laser', a.avg || null, a.spec_result || '', a.msg, JSON.stringify(a)]
        );
      }
      require('./alert_service').processAlerts(pool, 'Laser', alerts).catch(console.error);
    }
    await connection.commit();
    res.json({ success: true, message: 'Laser synced' });
  } catch (e) {
    await connection.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    connection.release();
  }
});
app.delete('/api/laser/records/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM laser_records WHERE id = ?', [id]);
    res.json({ success: true, message: `Deleted laser record ID ${id} successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ล้างผลบันทึกของ Laser ทั้งหมด
app.delete('/api/laser/records', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE laser_records');
    res.json({ success: true, message: 'All laser records cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ล้างประวัติแจ้งเตือนของ Laser ทั้งหมด
app.delete('/api/laser/alerts', async (req, res) => {
  try {
    await pool.query("DELETE FROM system_alert WHERE process_type = 'Laser'");
    res.json({ success: true, message: 'All laser alerts cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// =========================================================================
// 4. DISPENSING MERGED API ROUTES
// =========================================================================

// ดึงผลบันทึกทั้งหมดของ Dispensing
app.get('/api/dispensing/records', async (req, res) => {
  try {
    const [rows] = await pool.query(`
        SELECT *, DATE_FORMAT(test_date, '%Y-%m-%d') AS test_date_formatted
        FROM dispensing_records
        ORDER BY id DESC
      `);

    const records = rows.map(r => {
      let values = {};
      try {
        if (r.values_json) values = JSON.parse(r.values_json);
      } catch (e) { }

      return {
        id: r.id,
        dataType: r.data_type,
        model: r.product || '',
        fixture: r.fixture || '',
        pt: values.pt || values.ptno || '',
        date: r.test_date_formatted || '',
        buytime: r.buytime || '',
        mctime: r.mctime || '',
        team: r.team || '',
        op: r.op || '',
        oven: values.oven || '',
        status: r.status || '',
        values,
        createdAt: r.created_at
      };
    });
    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ดึงประวัติการตกสเปก/Control Limit ของ Dispensing
app.get('/api/dispensing/alerts', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM system_alert WHERE process_type = 'Dispensing' ORDER BY alert_time DESC LIMIT 1000");
    const alerts = rows.map(r => ({
      id: r.id,
      ts: r.alert_time ? new Date(r.alert_time).toISOString() : new Date().toISOString(),
      level: r.level,
      model: r.product,
      fixture: r.fixture,
      oven: r.oven,
      param: r.param,
      value: r.value_val != null ? parseFloat(r.value_val) : null,
      specStr: r.spec_str || '',
      msg: r.msg || ''
    }));
    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ดึงการตั้งค่า Specs ของแต่ละโมเดลชิ้นงาน
app.get('/api/dispensing/configs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM dispensing_config');
    const configs = {};
    rows.forEach(r => {
      configs[r.config_key] = JSON.parse(r.config_value);
    });
    res.json({ success: true, configs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ซิงค์ฐานข้อมูล Dispensing ทั้งชิ้นงาน, บันทึกตกสเปก และ สเปกควบคุม
app.post('/api/dispensing/sync', async (req, res) => {
  const payload = req.body;
  if (!payload || !payload.db_data) return res.status(400).json({ success: false, error: 'No payload provided' });

  const { records, configs: config } = payload.db_data;
  const alert_log = payload.alert_log;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Sync Configs
    /* Removed config sync */

    // 2. Sync Records
    if (records && Array.isArray(records)) {
      // All explicit dispensing dimension column names in the DB
      const DISP_DIM_COLS = [
        'x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'x4', 'y4', 'x1_center',
        'coil_position_1', 'coil_position_2', 'coil_position_1_s', 'coil_position_2_l',
        'epoxy_length_1', 'epoxy_length_2', 'epoxy_length_1_s', 'epoxy_length_2_l', 'epoxy_length_1_l', 'epoxy_length_2_s',
        'crash_stop_profile_1', 'crash_stop_profile_2', 'crash_stop_profile_3', 'crash_stop_profile_1_l', 'crash_stop_profile_2_s',
        'coil_outer_profile_u', 'coil_outer_profile_v', 'coil_outer_profile_w',
        'coil_inner_profile_1', 'coil_inner_profile_2', 'coil_inner_profile_u', 'coil_inner_profile_v', 'coil_inner_profile_w', 'coil_inner_profile_uv',
        'coil_symmetry',
        'fantail_profile_1', 'fantail_profile_2', 'fantail_profile_3', 'fantail_profile_4', 'fantail_profile_5',
        'bobbin_position_1', 'bobbin_position_2', 'bobbin_hole_true', 'bobbin_slote_true',
        'coil_parallel', 'coil_recess_dtm', 'coil_recess_ndtm',
        'bobbin_parallel', 'bobbin_recess_dtm', 'bobbin_recess_ndtm'
      ];

      // Helper: find value from r.values by case-insensitive key match
      function findDimVal(values, colName) {
        if (!values || typeof values !== 'object') return null;
        // direct match
        if (values[colName] !== undefined) return values[colName];
        // Try capitalized variants (Coil_position_1 vs coil_position_1)
        const lower = colName.toLowerCase();
        for (const k of Object.keys(values)) {
          if (k.toLowerCase() === lower) return values[k];
        }
        return null;
      }

      for (const r of records) {
        // Ensure pt and oven are preserved in valuesJson so GET /api/dispensing/records can extract them
        const fullValues = { ...r.values, pt: r.pt, oven: r.oven };
        const valuesJson = JSON.stringify(fullValues);
        const opName = r.op || r.operator || 'ADMIN';
        const product = r.model || r.product || '';

        let existingId = null;
        if (r.id && typeof r.id === 'number') {
          const [rowsById] = await connection.query('SELECT id FROM dispensing_records WHERE id = ?', [r.id]);
          if (rowsById.length > 0) existingId = rowsById[0].id;
        }

        if (!existingId) {
          const [rowsByComposite] = await connection.query(
            `SELECT id FROM dispensing_records 
               WHERE product = ? AND fixture = ? AND test_date = ? AND buytime = ? AND data_type = ?`,
            [product, r.fixture || '', r.date, r.buytime || '', r.dataType || 'Buy off']
          );
          if (rowsByComposite.length > 0) existingId = rowsByComposite[0].id;
        }

        // Extract explicit dimension values from r.values
        const dimVals = DISP_DIM_COLS.map(col => {
          const raw = findDimVal(r.values, col);
          if (raw === null || raw === undefined || raw === '' || raw === '-') return null;
          const n = parseFloat(raw);
          return isNaN(n) ? null : n;
        });

        const dimSetClause = DISP_DIM_COLS.map(c => `${c}=?`).join(', ');
        const dimColList = DISP_DIM_COLS.join(', ');
        const dimPlaceholders = DISP_DIM_COLS.map(() => '?').join(', ');

        if (existingId) {
          await connection.query(
            `UPDATE dispensing_records 
               SET mctime = ?, team = ?, op = ?, status = ?, config_id = ?, values_json = ?, ${dimSetClause}
               WHERE id = ?`,
            [r.mctime || '', r.team || '', opName, r.status || 'ACCEPT', r.config_id || null, valuesJson, ...dimVals, existingId]
          );
        } else {
          await connection.query(
            `INSERT INTO dispensing_records 
               (product, fixture, test_date, buytime, mctime, team, op, data_type, status, config_id, values_json, created_at, ${dimColList}) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${dimPlaceholders})`,
            [
              product, r.fixture || '', r.date, r.buytime || '', r.mctime || '',
              r.team || '', opName, r.dataType || 'Buy off', r.status || 'ACCEPT', r.config_id || null, valuesJson,
              new Date(), ...dimVals
            ]
          );
        }
      }
    }

    // 3. Sync Alerts
    if (alert_log && Array.isArray(alert_log)) {
      const times = alert_log.map(a => {
        if (!a.ts) return null;
        try { const d = new Date(a.ts); return !isNaN(d.getTime()) ? d.toISOString().slice(0, 19) : null; } catch (e) { return null; }
      }).filter(Boolean);

      let existingTimes = new Set();
      if (times.length > 0) {
        // DELETE matching timestamps to replace with incoming
        const [existingAlerts] = await connection.query('SELECT alert_time FROM system_alert WHERE process_type = "Dispensing"');
        existingTimes = new Set(existingAlerts.map(r => r.alert_time.toISOString().slice(0, 19)));

        for (const t of times) {
          await connection.query('DELETE FROM system_alert WHERE process_type = "Dispensing" AND alert_time >= ? AND alert_time <= ?', [t, t]);
        }
      }
      const newAlerts = [];
      for (const a of alert_log) {
        let alertTime = new Date();
        if (a.ts) {
          try { const d = new Date(a.ts); if (!isNaN(d.getTime())) alertTime = d; } catch (e) { }
        }

        const timeStr = alertTime.toISOString().slice(0, 19);
        if (!existingTimes.has(timeStr)) {
          newAlerts.push(a);
        }

        await connection.query(
          `INSERT INTO system_alert (process_type, alert_time, level, product, fixture, oven, param, value_val, spec_str, msg) VALUES ('Dispensing', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            alertTime, a.level || '', a.product || '', a.fixture || '', a.oven || '',
            a.param || '', a.value != null ? parseFloat(a.value) : null, a.spec || '', a.msg || ''
          ]
        );
      }
      if (newAlerts.length > 0) {
        require('./alert_service').processAlerts(pool, 'Dispensing', newAlerts).catch(console.error);
      }
    }

    await connection.commit();
    res.json({ success: true, message: 'Sync complete' });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    connection.release();
  }
});

// ลบผลบันทึกของ Dispensing รายรายการ
app.post('/api/dispensing/records/delete-bulk', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
  try {
    // Filter out client-side timestamps which are larger than INT
    const dbIds = ids.filter(id => Number(id) <= 2147483647);
    if (dbIds.length > 0) {
      await pool.query('DELETE FROM dispensing_measurements WHERE record_id IN (?)', [dbIds]);
      await pool.query('DELETE FROM dispensing_records WHERE id IN (?)', [dbIds]);
    }
    res.json({ success: true, message: `Deleted ${dbIds.length} records successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/dispensing/records/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // If the ID is a client-side timestamp (larger than max INT), it's not in DB, just return success
    if (Number(id) > 2147483647) {
      return res.json({ success: true, message: `Ignored local record ID ${id}` });
    }
    await pool.query('DELETE FROM dispensing_measurements WHERE record_id = ?', [id]);
    await pool.query('DELETE FROM dispensing_records WHERE id = ?', [id]);
    res.json({ success: true, message: `Deleted dispensing record ID ${id} successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ล้างผลบันทึกของ Dispensing ทั้งหมด
app.delete('/api/dispensing/records', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE dispensing_records');
    res.json({ success: true, message: 'All dispensing records cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ล้างประวัติแจ้งเตือนของ Dispensing ทั้งหมด
app.delete('/api/dispensing/alerts', async (req, res) => {
  try {
    await pool.query("DELETE FROM system_alert WHERE process_type = 'Dispensing'");
    res.json({ success: true, message: 'All dispensing alerts cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// =========================================================================
// 4.5. DISPENSING ALERT SETTINGS & EMAIL SENDER
// =========================================================================

// ดึงรายชื่ออีเมลที่ตั้งไว้
app.get('/api/system/alert-recipients', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM alert_recipients');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// บันทึกแก้ไขรายชื่ออีเมล
app.post('/api/system/alert-recipients', async (req, res) => {
  const { email, name, role, active } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO alert_recipients (email, name, role, active) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=?, role=?, active=?',
      [email, name, role, active, name, role, active]
    );
    res.json({ success: true, insertId: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/system/alert-recipients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM alert_recipients WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงการตั้งค่าระบบ (เช่น อีเมลผู้ส่ง)
app.get('/api/system/config', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT config_key, config_value FROM system_config');
    let config = {};
    rows.forEach(r => config[r.config_key] = r.config_value);

    // Also fetch alert recipients config
    const [emailRows] = await pool.query('SELECT email, password FROM alert_recipients WHERE is_sender = TRUE LIMIT 1');
    if (emailRows.length > 0) {
      config.SENDER_EMAIL = emailRows[0].email || '';
      config.SENDER_PASS = emailRows[0].password || '';
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// บันทึกการตั้งค่าระบบ
app.post('/api/system/config', async (req, res) => {
  const configs = req.body; 
  try {
    for (const [key, val] of Object.entries(configs)) {
      if (key === 'SENDER_EMAIL' || key === 'SENDER_PASS') {
        continue; // Handled separately below
      }
      // Save everything else to system_config generic table
      await pool.query(
        'INSERT INTO system_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value=?',
        [key, val, val]
      );
    }

    if (configs.SENDER_EMAIL !== undefined) {
      // Upsert into alert_recipients where is_sender = true
      const [existing] = await pool.query('SELECT id FROM alert_recipients WHERE is_sender = TRUE LIMIT 1');
      if (existing.length > 0) {
        await pool.query('UPDATE alert_recipients SET email=?, password=? WHERE id=?', [configs.SENDER_EMAIL, configs.SENDER_PASS || '', existing[0].id]);
      } else {
        await pool.query('INSERT INTO alert_recipients (email, password, is_sender, active) VALUES (?, ?, TRUE, TRUE)', [configs.SENDER_EMAIL, configs.SENDER_PASS || '']);
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// รับคำสั่งส่งอีเมลแจ้งเตือน (ใช้ PowerShell แทน nodemailer เพื่อหลบ Firewall)


function sendEmailViaPowerShell(toEmails, subject, htmlBody, senderEmail, senderPass) {
  return new Promise((resolve, reject) => {
    const user = senderEmail || process.env.EMAIL_USER || "your_email@outlook.com";
    const pass = senderPass || process.env.EMAIL_PASS || "your_password";

    // แปลง Single Quote ให้ปลอดภัยสำหรับ PowerShell
    const safeHtml = htmlBody.replace(/'/g, "''");

    const psScript = `
      $SMTPClient = New-Object Net.Mail.SmtpClient("smtp-mail.outlook.com", 587)
      $SMTPClient.EnableSsl = $true
      $SMTPClient.Credentials = New-Object System.Net.NetworkCredential('${user}', '${pass}')
      
      $MailMessage = New-Object Net.Mail.MailMessage
      $MailMessage.From = '${user}'
      $MailMessage.Subject = '${subject}'
      $MailMessage.Body = '${safeHtml}'
      $MailMessage.IsBodyHtml = $true
      
      $toAddresses = "${toEmails}" -split ","
      foreach($addr in $toAddresses) {
          if(![string]::IsNullOrWhiteSpace($addr)) {
              $MailMessage.To.Add($addr.Trim())
          }
      }
      
      try {
          $SMTPClient.Send($MailMessage)
          Write-Output "SUCCESS"
      } catch {
          Write-Error $_.Exception.Message
      }
    `;

    const tempFile = path.join(__dirname, `temp_mail_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
    fs.writeFileSync(tempFile, psScript, 'utf8');

    // ใช้ Bypass เพื่อให้รัน Script ได้แม้จะติด Execution Policy
    exec(`powershell -ExecutionPolicy Bypass -File "${tempFile}"`, (error, stdout, stderr) => {
      try { fs.unlinkSync(tempFile); } catch (e) { } // ลบไฟล์ทิ้ง
      if (error || stderr) reject(error || stderr);
      else resolve(stdout);
    });
  });

}

app.post('/api/dispensing/send-alert', async (req, res) => {
  const { product, pt, fixture, oven, time, date, failedValues, allValues, imageBase64, status } = req.body;
  try {
    // 1. Save to dispensing_alert_log
    const [ins] = await pool.query(
      `INSERT INTO dispensing_alert_log (product_key, pt_number, fixture_no, oven_number, buytime, record_date, level, failed_dims, all_values, trend_image) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [product, pt, fixture, oven, time, date, status === 'REJECT' ? 'critical' : 'warn', JSON.stringify(failedValues), JSON.stringify(allValues), imageBase64 || null]
    );

    // 2. Send email
    const [targets] = await pool.query('SELECT email FROM alert_recipients WHERE active=1');
    if (targets.length === 0) return res.json({ success: true, message: 'Saved to log, but no active recipients.' });

    let toList = targets.map(t => t.email).join(',');

    // Create HTML content
    let html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: ${status === 'REJECT' ? '#e74c3c' : '#f39c12'};">⚠️ ${status === 'REJECT' ? 'CRITICAL ALERT' : 'WARNING'}: Out of Spec (Dispensing)</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
          <tr style="background: #f8f9fa;"><th>Product</th><td>${product}</td><th>PT Machine</th><td>${pt}</td></tr>
          <tr><th>Fixture</th><td>${fixture}</td><th>Oven</th><td>${oven}</td></tr>
          <tr style="background: #f8f9fa;"><th>Date</th><td>${date}</td><th>Time</th><td>${time}</td></tr>
        </table>
        
        <h3>Failed Dimensions:</h3>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
          <tr style="background: #e74c3c; color: white;"><th>Dimension</th><th>Value</th><th>LSL</th><th>USL</th></tr>
          ${failedValues.map(fv => `
            <tr>
              <td><strong>${fv.dim}</strong></td>
              <td style="color: red; font-weight: bold;">${fv.value}</td>
              <td>${fv.lsl !== undefined ? fv.lsl : '-'}</td>
              <td>${fv.usl !== undefined ? fv.usl : '-'}</td>
            </tr>
          `).join('')}
        </table>
    `;

    if (imageBase64) {
      html += `<h3>Trend Chart:</h3><img src="${imageBase64}" style="max-width: 100%; border: 1px solid #ccc; border-radius: 8px;" alt="Trend Chart" />`;
    }

    // ดึงบัญชีผู้ส่งจากฐานข้อมูล (alert_recipients)
    const [sysRows] = await pool.query("SELECT email, password FROM alert_recipients WHERE is_sender = TRUE LIMIT 1");
    let senderEmail = '', senderPass = '';
    if (sysRows.length > 0) {
      senderEmail = sysRows[0].email;
      senderPass = sysRows[0].password;
    }

    // ส่งอีเมลโดยใช้ PowerShell (หลบ Firewall)
    await sendEmailViaPowerShell(toList, `[${status}] Alert - Dispensing ${product} - ${fixture}`, html, senderEmail, senderPass);


    res.json({ success: true, message: 'Alert logged and email sent successfully.' });
  } catch (err) {
    console.error('Send alert error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 5. UNIFIED DASHBOARD OVERVIEW API
// =========================================================================

// รวบรวมสถิติจากทุกโมดูลเพื่อนำไปแสดงผลบน Dashboard ภาพรวมของ index.html
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    // ดึงจำนวนของแต่ละโมดูลมาหาผลรวมและผลรวม Yield
    const [pofCount] = await pool.query('SELECT COUNT(*) AS total, SUM(CASE WHEN spec_result="IN" THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN spec_result="OUT" THEN 1 ELSE 0 END) AS ng FROM pof_records');
    const [damperCount] = await pool.query('SELECT COUNT(*) AS total, SUM(CASE WHEN overall_pass=1 THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN overall_pass=0 THEN 1 ELSE 0 END) AS ng FROM damper_records');
    const [laserCount] = await pool.query('SELECT COUNT(*) AS total, SUM(CASE WHEN overall="Pass" THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN overall="Fail" THEN 1 ELSE 0 END) AS ng FROM laser_records');
    const [dispensingCount] = await pool.query('SELECT COUNT(*) AS total, SUM(CASE WHEN status="ACCEPT" THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN status IN ("REJECT","INCOMPLETE","ALERT") THEN 1 ELSE 0 END) AS ng FROM dispensing_records');

    const totalRecords =
      (Number(pofCount[0].total) || 0) +
      (Number(damperCount[0].total) || 0) +
      (Number(laserCount[0].total) || 0) +
      (Number(dispensingCount[0].total) || 0);

    const totalPass =
      (Number(pofCount[0].ok) || 0) +
      (Number(damperCount[0].ok) || 0) +
      (Number(laserCount[0].ok) || 0) +
      (Number(dispensingCount[0].ok) || 0);

    const totalFail =
      (Number(pofCount[0].ng) || 0) +
      (Number(damperCount[0].ng) || 0) +
      (Number(laserCount[0].ng) || 0) +
      (Number(dispensingCount[0].ng) || 0);

    const yieldRate = (totalPass + totalFail) > 0 ? ((totalPass / (totalPass + totalFail)) * 100).toFixed(1) + '%' : '0%';

    // ดึงกิจกรรมการทำงานล่าสุด (Recent 15 activities จากโมดูลหลัก Dispensing / Laser / POF / Damper)
    const [dispActivities] = await pool.query(
      `SELECT 'Dispensing' AS module, product, fixture, op AS operator, status, test_date AS date, buytime AS time 
       FROM dispensing_records 
       ORDER BY test_date DESC, buytime DESC 
       LIMIT 10`
    );

    const [laserActivities] = await pool.query(
      `SELECT 'Laser Engraving' AS module, product AS model, fixture, en AS operator, overall AS status, test_date AS date, recvtime AS time 
       FROM laser_records 
       ORDER BY test_date DESC, recvtime DESC 
       LIMIT 10`
    );

    const [pofActivities] = await pool.query(
      `SELECT 'Push Out Force' AS module, COALESCE(product_label, product) AS model, coil_type AS fixture, en AS operator, overall AS status, test_date AS date, saved_at AS time 
       FROM pof_records 
       ORDER BY test_date DESC, saved_at DESC 
       LIMIT 10`
    );

    const [damperActivities] = await pool.query(
      `SELECT 'Damper Install' AS module, COALESCE(attribute, traveler) AS model, traveler AS fixture, qc_en AS operator, 
              CASE WHEN overall_pass = 1 THEN 'Pass' ELSE 'Fail' END AS status, test_date AS date, recv_time AS time
       FROM damper_records
       ORDER BY test_date DESC, recv_time DESC
       LIMIT 10`
    );

    // ทำการรวบและเรียงลำดับกิจกรรมล่าสุดตามเวลา
    const activities = [...dispActivities, ...laserActivities, ...pofActivities, ...damperActivities]
      .map(act => ({
        ...act,
        date: act.date ? (act.date instanceof Date ? `${act.date.getFullYear()}-${String(act.date.getMonth() + 1).padStart(2, '0')}-${String(act.date.getDate()).padStart(2, '0')}` : String(act.date).slice(0, 10)) : ''
      }))
      .sort((a, b) => new Date(`${b.date}T${b.time || '00:00'}`) - new Date(`${a.date}T${a.time || '00:00'}`))
      .slice(0, 15);

    // ส่งสถิติแยกตามโมดูลเพื่อหน้าเว็บนำไปแสดงผลใน Module Cards
    const modules = {
      dispensing: { total: Number(dispensingCount[0].total) || 0, pass: Number(dispensingCount[0].ok) || 0, fail: Number(dispensingCount[0].ng) || 0 },
      laser: { total: Number(laserCount[0].total) || 0, pass: Number(laserCount[0].ok) || 0, fail: Number(laserCount[0].ng) || 0 },
      pof: { total: Number(pofCount[0].total) || 0, pass: Number(pofCount[0].ok) || 0, fail: Number(pofCount[0].ng) || 0 },
      damper: { total: Number(damperCount[0].total) || 0, pass: Number(damperCount[0].ok) || 0, fail: Number(damperCount[0].ng) || 0 },
    };

    res.json({
      success: true,
      summary: {
        total: totalRecords,
        pass: totalPass,
        fail: totalFail,
        yield: yieldRate
      },
      modules,
      recentActivities: activities
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// -------------------------------------------------------------------------
// NEW ROUTE: LASER CONFIGURATION (Save to MySQL)
// -------------------------------------------------------------------------
app.post('/api/laser_config', async (req, res) => {
  try {
    const { product_key, eblock_qty, bobbin_qty } = req.body;
    if (!product_key) {
      return res.status(400).json({ error: 'Missing product_key' });
    }

    const e_val = (eblock_qty === null || eblock_qty === '' || isNaN(parseInt(eblock_qty))) ? null : parseInt(eblock_qty);
    const b_val = (bobbin_qty === null || bobbin_qty === '' || isNaN(parseInt(bobbin_qty))) ? null : parseInt(bobbin_qty);

    // if both are null and it's not DEFAULT, delete it.
    if (e_val === null && b_val === null && product_key !== 'DEFAULT') {
      await pool.query('DELETE FROM laser_config WHERE product_key = ?', [product_key]);
    } else {
      await pool.query(
        `INSERT INTO laser_config (product_key, eblock_qty, bobbin_qty) 
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE eblock_qty = VALUES(eblock_qty), bobbin_qty = VALUES(bobbin_qty)`,
        [product_key, e_val, b_val]
      );
    }
    res.json({ message: 'Laser config updated successfully' });
  } catch (err) {
    console.error('Error updating laser config:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});


// ==========================================
// SYSTEM ALERT API
// ==========================================

app.get('/api/system-alerts', async (req, res) => {
  try {
    const { process_type, level, limit } = req.query;
    let query = 'SELECT * FROM system_alert WHERE 1=1';
    const params = [];

    if (process_type) {
      query += ' AND process_type = ?';
      params.push(process_type);
    }
    if (level) {
      query += ' AND level = ?';
      params.push(level);
    }

    query += ' ORDER BY alert_time DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(Number(limit));
    }

    const [rows] = await pool.query(query, params);
    res.json({ success: true, alerts: rows });
  } catch (err) {
    console.error('Error fetching system alerts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/system-alerts', async (req, res) => {
  try {
    const { process_type } = req.query;
    let query = 'DELETE FROM system_alert';
    const params = [];

    if (process_type) {
      query += ' WHERE process_type = ?';
      params.push(process_type);
    }

    await pool.query(query, params);
    res.json({ success: true, message: 'Alerts deleted successfully' });
  } catch (err) {
    console.error('Error deleting system alerts:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// DYNAMIC PRODUCT LIST ENDPOINTS
// ==========================================
app.get('/api/dispensing/products_list', async (req, res) => {
  try {
    const q = `
      SELECT * FROM dispensing_product ORDER BY product_name`;
    const [rows] = await pool.query(q);
    res.json({ success: true, products: rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/laser/products_list', async (req, res) => {
  try {
    const q = `
      SELECT * FROM laser_product ORDER BY product_name`;
    const [rows] = await pool.query(q);
    res.json({ success: true, products: rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/pof/products_list', async (req, res) => {
  try {
    const q = `
      SELECT * FROM pof_product ORDER BY product_name`;
    const [rows] = await pool.query(q);
    res.json({ success: true, products: rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/damper/products_list', async (req, res) => {
  try {
    const q = `
      SELECT dp.product_name AS product_key, COALESCE(mp.product_name, dp.product_name) AS product_name, dp.mode 
      FROM damper_product dp 
      LEFT JOIN master_products mp ON dp.product_name = mp.product_key 
      ORDER BY product_name ASC
    `;
    const [rows] = await pool.query(q);
    res.json({ success: true, products: rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==========================================
// SYSTEM CONFIG & SPC LIMITS API
// ==========================================

app.get('/api/system/products', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT product_key, product_name, dims FROM master_products ORDER BY product_key');
    res.json({ success: true, products: rows });
  } catch (err) {
    // Fallback if table doesn't exist yet
    res.json({
      success: true, products: [
        { product_key: "cmr3d", product_name: "Cimarron 3D" },
        { product_key: "cmr4d", product_name: "Cimarron 4D" },
        { product_key: "cmr5d", product_name: "Cimarron 5D" },
        { product_key: "comet", product_name: "Comet" },
        { product_key: "dorado10d", product_name: "Dorado 10D" },
        { product_key: "dorado5d", product_name: "Dorado 5D" },
        { product_key: "dorado5dbb", product_name: "Dorado 5D AL BB" },
        { product_key: "dor10n", product_name: "Dorado 10N" },
        { product_key: "dor10naad", product_name: "Dorado 10D NOAR-AAD" },
        { product_key: "marlin10d", product_name: "Marlin 10D" },
        { product_key: "m11", product_name: "M11" },
        { product_key: "rosewood1d", product_name: "Rosewood 1D" },
        { product_key: "rosewood2d", product_name: "Rosewood 2D" },
        { product_key: "skybolt1d", product_name: "Skybolt 1D" },
        { product_key: "sky1dmm", product_name: "Skybolt 1D MM" },
        { product_key: "skybolt2d", product_name: "Skybolt 2D" },
        { product_key: "skybolt3d", product_name: "Skybolt 3D" },
        { product_key: "skybolt4d", product_name: "Skybolt 4D" },
        { product_key: "summit10d", product_name: "Summit 10D" },
        { product_key: "v111d", product_name: "V11 1D" },
        { product_key: "v112d", product_name: "V11 2D" },
        { product_key: "v114d", product_name: "V11 4D" },
        { product_key: "v15cmr4d", product_name: "V15 Cimarron 4D" },
        { product_key: "cim3d", product_name: "Cimarron 3D (POF)" },
        { product_key: "cim4d", product_name: "Cimarron 4D (POF)" },
        { product_key: "cim5d", product_name: "Cimarron 5D (POF)" },
        { product_key: "dor5d", product_name: "Dorado 5D (POF)" },
        { product_key: "dor5dbb", product_name: "Dorado 5D AL BB (POF)" },
        { product_key: "dor10d", product_name: "Dorado 10D (POF)" },
        { product_key: "dor10naad", product_name: "Dorado 10D NOAR-AAD (POF)" },
        { product_key: "m11p", product_name: "M11 P (POF)" },
        { product_key: "mar10d", product_name: "Marlin 10D (POF)" },
        { product_key: "ros1d", product_name: "Rosewood 1D (POF)" },
        { product_key: "ros2d", product_name: "Rosewood 2D (POF)" },
        { product_key: "sky1d", product_name: "Skybolt 1D (POF)" },
        { product_key: "sky1dmm", product_name: "Skybolt 1D MM (POF)" },
        { product_key: "sky2d", product_name: "Skybolt 2D (POF)" },
        { product_key: "sky3d", product_name: "Skybolt 3D (POF)" },
        { product_key: "sky4d", product_name: "Skybolt 4D (POF)" },
        { product_key: "sum10d", product_name: "Summit 10D (POF)" },
        { product_key: "v15", product_name: "V15 Cimarron 4D (POF)" }
      ]
    });
  }
});

app.get('/api/config/dispensing', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM dispensing_config ORDER BY product_key, dimension_name');
    res.json({ success: true, limits: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/config/dispensing/batch', async (req, res) => {
  try {
    const { limits } = req.body;
    if (!limits || !limits.length) return res.json({ success: true });
    for (const lim of limits) {
      await pool.query(
        `INSERT INTO dispensing_config (process_mode, product_key, dimension_name, lsl, lcl, cl, ucl, usl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE lsl=VALUES(lsl), lcl=VALUES(lcl), cl=VALUES(cl), ucl=VALUES(ucl), usl=VALUES(usl)`,
        [lim.process_mode, lim.product_key, lim.dimension_name, lim.lsl, lim.lcl, lim.cl, lim.ucl, lim.usl]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/config/pof', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pof_config ORDER BY product_key, data_type, type_parameter');
    res.json({ success: true, limits: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/config/pof/batch', async (req, res) => {
  try {
    const { limits } = req.body;
    if (!limits || !limits.length) return res.json({ success: true });
    for (const lim of limits) {
      await pool.query(
        `INSERT INTO pof_config (product_key, data_type, type_parameter, frequency, usl, ucl, cl, lcl, lsl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE frequency=VALUES(frequency), usl=VALUES(usl), ucl=VALUES(ucl), cl=VALUES(cl), lcl=VALUES(lcl), lsl=VALUES(lsl)`,
        [lim.product_key, lim.data_type, lim.type_parameter, lim.frequency, lim.usl, lim.ucl, lim.cl, lim.lcl, lim.lsl]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/config/damper', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM damper_config ORDER BY product_key, data_type, process_mode, damper_type');
    res.json({ success: true, limits: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/config/damper/batch', async (req, res) => {
  try {
    const { limits } = req.body;
    if (!limits || !limits.length) return res.json({ success: true });
    for (const lim of limits) {
      await pool.query(
        `INSERT INTO damper_config (product_key, process_mode, data_type, damper_type, frequency, usl, ucl, cl, lcl, lsl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE frequency=VALUES(frequency), usl=VALUES(usl), ucl=VALUES(ucl), cl=VALUES(cl), lcl=VALUES(lcl), lsl=VALUES(lsl)`,
        [lim.product_key, lim.process_mode, lim.data_type, lim.damper_type, lim.frequency, lim.usl, lim.ucl, lim.cl, lim.lcl, lim.lsl]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/config/laser', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM laser_config ORDER BY product_key, data_type');
    res.json({ success: true, limits: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/config/laser/batch', async (req, res) => {
  try {
    const { limits } = req.body;
    if (!limits || !limits.length) return res.json({ success: true });
    for (const lim of limits) {
      await pool.query(
        `INSERT INTO laser_config (product_key, data_type, qty_eblock, qty_bobbin, frequency, laser_fixture, laser_shift)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE qty_eblock=VALUES(qty_eblock), qty_bobbin=VALUES(qty_bobbin), frequency=VALUES(frequency), laser_fixture=VALUES(laser_fixture), laser_shift=VALUES(laser_shift)`,
        [lim.product_key, lim.data_type, lim.qty_eblock, lim.qty_bobbin, lim.frequency, lim.laser_fixture, lim.laser_shift]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

const PORT = process.env.PORT || 3001;
const XAMPP_PORT = process.env.XAMPP_PORT || '80';
const phpMyAdminUrl = XAMPP_PORT === '80' || XAMPP_PORT === ''
  ? `http://localhost/phpmyadmin`
  : `http://localhost:${XAMPP_PORT}/phpmyadmin`;

app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🚀 BELTON IPQC Backend server is successfully running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🐬  phpMyAdmin: ${phpMyAdminUrl}`);
  console.log(`🔐 CORS and JSON Limits (50mb) are configured.`);
  console.log(`================================================================`);
});

// === AUTO-SYNC WATCHER ===
const watcherPath = path.join(__dirname, 'sync_watcher.js');

if (fs.existsSync(watcherPath)) {
  try {
    require('./sync_watcher.js');
  } catch (e) {
    console.error('⚠️ Watcher failed to start:', e.message);
  }
}