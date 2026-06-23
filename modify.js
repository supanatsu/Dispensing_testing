const fs = require('fs');
let html = fs.readFileSync('dispensing.html', 'utf8');

html = html.replace(
    '<button class=\"nav-btn active\" data-tab=\"manual\" onclick=\"switchTab(\\'manual\\',this)\">Manual Input</button>',
    '<button class=\"nav-btn active\" data-tab=\"manual\" onclick=\"switchTab(\\'manual\\',this)\">Stage 1: Manual Input</button>\\n      <button class=\"nav-btn\" data-tab=\"stage2\" onclick=\"switchTab(\\'stage2\\',this)\">Stage 2: Bulk Merge</button>'
);

html = html.replace(
    '<!-- PENDING DRAFTS SECTION (below manual form)  -->',
    '</div><!-- end panel-manual -->\\n\\n      <!-- TAB: STAGE 2 -->\\n      <div class=\"tab-panel\" id=\"panel-stage2\">\\n        <!-- PENDING DRAFTS SECTION (below manual form)  -->'
);

html = html.replace(
    '</div><!-- end panel-manual -->\\n\\n      <!-- ========================================== -->\\n      <!-- TAB 2: AUTO IMPORT',
    '</div><!-- end panel-stage2 -->\\n\\n      <!-- ========================================== -->\\n      <!-- TAB 2: AUTO IMPORT'
);

html = html.replace(/<h3>MANUAL DATA ENTRY — QC INSPECTION <span.*?<\\/span><\\/h3>/s, '<h3>MANUAL DATA ENTRY</h3>');
html = html.replace(/<div class=\"card-sub\">Stage 1: กรอกเฉพาะ.*?<\\/div>/s, '');

html = html.replace('🔴 Buy off', 'Buy off');
html = html.replace('🔵 Roving Audit', 'Roving Audit');
html = html.replace('*Required', '*');
html = html.replace('📌 บันทึกค่าวัด (Save Draft)</button>', 'บันทึก (Save)</button>');
html = html.replace('title=\"บันทึก Draft — Stage 1: บันทึกค่าวัด Parallel/DTM/NDTM รอ Merge ข้อมูล SM Flash ใน Stage 2\"', 'title=\"บันทึกข้อมูล (Save to MySQL)\"');

html = html.replace(/💡 <b>Tip:<\\/b> กด <kbd.*?<\\/div>/s, '<b>Tip:</b> กด <kbd style=\"background:var(--bg3);border:1px solid var(--border2);border-radius:3px;padding:1px 5px;font-size:11px\">Enter</kbd> ในช่องค่าวัด เพื่อเลื่อนไปช่องถัดไปอัตโนมัติ\\n          </div>');

html = html.replace('<h3>📋 PENDING RECORDS <span', '<h3>PENDING RECORDS (Waiting for Stage 2) <span');
html = html.replace('🔄 Refresh</button>', 'Refresh</button>');
html = html.replace('🗑️ Clear All Drafts</button>', 'Clear All Waiting</button>');
html = html.replace('📭</div>', '</div>');
html = html.replace(/<div class=\"card-sub\">Records ที่บันทึกเฉพาะ Parallel\\/DTM\\/NDTM รอ Merge ข้อมูลจาก SM Flash · จัดเป็นชุดๆ.*?<\\/div>/s, '');
html = html.replace('ยังไม่มี Pending Records — กด \"Save as Draft\" เพื่อเริ่มต้น', 'ยังไม่มี Pending Records - กด \"Save\" เพื่อเริ่มต้น');

html = html.replace('<h3>⚡ STAGE 2 — BULK TEXT DATA MERGE <span', '<h3>STAGE 2 — BULK TEXT DATA MERGE <span');
html = html.replace(/<div class=\"card-sub\">วาง \\(Paste\\) ข้อมูล SM Flash หลายบรรทัดพร้อมกัน · ระบบจะจับคู่กับ PENDING_DATA.*?<\\/div>/s, '');

html = html.replace(/<div\\s+style=\"margin-bottom:10px;padding:10px 14px;background:rgba\\(9,132,227,0\\.07\\);border-radius:6px;border-left:3px solid var\\(--blue\\);font-size:12px;color:var\\(--text2\\);line-height:1\\.9\">.*?<\\/div>/s, '');

html = html.replace('📂 Upload .txt / .csv', 'Upload .txt / .csv');
html = html.replace('🔍 Preview Merge</button>', 'Preview Merge</button>');
html = html.replace('⚡ Merge Text Data (0 records)</button>', 'Merge Text Data (0 records)</button>');

fs.writeFileSync('dispensing.html', html);
console.log('HTML Modified Successfully');


