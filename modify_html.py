import re

with open('dispensing.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Navigation Bar
html = html.replace(
    '<button class=\"nav-btn active\" data-tab=\"manual\" onclick=\"switchTab(''manual'',this)\">Manual Input</button>',
    '<button class=\"nav-btn active\" data-tab=\"manual\" onclick=\"switchTab(''manual'',this)\">Stage 1: Manual Input</button>\n      <button class=\"nav-btn\" data-tab=\"stage2\" onclick=\"switchTab(''stage2'',this)\">Stage 2: Bulk Merge</button>'
)

# 2. Split panels
html = html.replace(
    '<!-- PENDING DRAFTS SECTION (below manual form)  -->',
    '</div><!-- end panel-manual -->\n\n      <!-- TAB: STAGE 2 -->\n      <div class=\"tab-panel\" id=\"panel-stage2\">\n        <!-- PENDING DRAFTS SECTION (below manual form)  -->'
)

# Remove the extra </div><!-- end panel-manual --> from its original place
html = html.replace(
    '</div><!-- end panel-manual -->\n\n      <!-- ========================================== -->\n      <!-- TAB 2: AUTO IMPORT',
    '</div><!-- end panel-stage2 -->\n\n      <!-- ========================================== -->\n      <!-- TAB 2: AUTO IMPORT'
)

# 3. Clean up Stage 1 texts and emojis
html = html.replace('<h3>MANUAL DATA ENTRY — QC INSPECTION <span\\n                style=\"font-size:11px;font-weight:600;letter-spacing:.5px;padding:2px 8px;border-radius:10px;background:rgba(9,132,227,0.10);color:var(--blue);border:1px solid rgba(9,132,227,0.2);vertical-align:middle;\">STAGE\\n                1 · MEASUREMENT</span></h3>', '<h3>MANUAL DATA ENTRY</h3>')
html = html.replace('<h3>MANUAL DATA ENTRY — QC INSPECTION <span\n                style=\"font-size:11px;font-weight:600;letter-spacing:.5px;padding:2px 8px;border-radius:10px;background:rgba(9,132,227,0.10);color:var(--blue);border:1px solid rgba(9,132,227,0.2);vertical-align:middle;\">STAGE\n                1 · MEASUREMENT</span></h3>', '<h3>MANUAL DATA ENTRY</h3>')

# Regex for the card-sub in STAGE 1
html = re.sub(r'<div class=\"card-sub\">Stage 1: กรอกเฉพาะ.*?</div>', '', html, flags=re.DOTALL)

html = html.replace('🔴 Buy off', 'Buy off')
html = html.replace('🔵 Roving Audit', 'Roving Audit')
html = html.replace('*Required', '*')

html = html.replace('ล้างจอ</button>', 'ล้างจอ</button>')
html = html.replace('📌 บันทึกค่าวัด (Save Draft)</button>', 'บันทึก (Save)</button>')
html = html.replace('title=\"บันทึก Draft — Stage 1: บันทึกค่าวัด Parallel/DTM/NDTM รอ Merge ข้อมูล SM Flash ใน Stage 2\"', 'title=\"บันทึกข้อมูล (Save to MySQL)\"')

# Clean up bottom tip in STAGE 1
tip_html = '''💡 <b>Tip:</b> กด <kbd
              style=\"background:var(--bg3);border:1px solid var(--border2);border-radius:3px;padding:1px 5px;font-size:11px\">Enter</kbd>
            ในช่องค่าวัด เพื่อเลื่อนไปช่องถัดไปอัตโนมัติ (ช่องสุดท้าย → โฟกัสปุ่มบันทึก) &nbsp;|&nbsp;
            📌 <b>บันทึกค่าวัด (Save Draft)</b> = Stage 1: บันทึกเฉพาะ Parallel/DTM/NDTM รอ Merge ข้อมูล SM Flash ใน
            Stage 2'''
html = html.replace(tip_html, '<b>Tip:</b> กด <kbd style=\"background:var(--bg3);border:1px solid var(--border2);border-radius:3px;padding:1px 5px;font-size:11px\">Enter</kbd> ในช่องค่าวัด เพื่อเลื่อนไปช่องถัดไปอัตโนมัติ')

# 4. Clean up PENDING RECORDS card
html = html.replace('<h3>📋 PENDING RECORDS <span', '<h3>PENDING RECORDS (Waiting for Stage 2) <span')
html = html.replace('🔄 Refresh</button>', 'Refresh</button>')
html = html.replace('🗑️ Clear All Drafts</button>', 'Clear All Waiting</button>')
html = html.replace('📭</div>', '</div>')
html = html.replace('<div class=\"card-sub\">Records ที่บันทึกเฉพาะ Parallel/DTM/NDTM รอ Merge ข้อมูลจาก SM Flash · จัดเป็นชุดๆ\n                ละ 4 ชิ้น/PT Number</div>', '')
html = html.replace('ยังไม่มี Pending Records — กด \"Save as Draft\" เพื่อเริ่มต้น', 'ยังไม่มี Pending Records - กด \"Save\" เพื่อเริ่มต้น')

# 5. Clean up STAGE 2 texts and emojis
html = html.replace('<h3>⚡ STAGE 2 — BULK TEXT DATA MERGE <span', '<h3>STAGE 2 — BULK TEXT DATA MERGE <span')
html = html.replace('<div class=\"card-sub\">วาง (Paste) ข้อมูล SM Flash หลายบรรทัดพร้อมกัน · ระบบจะจับคู่กับ PENDING_DATA\n                อัตโนมัติ (Line 1 → Record 1, ...)</div>', '')

# Remove instruction block
instruction_block = '''<div
                style=\"margin-bottom:10px;padding:10px 14px;background:rgba(9,132,227,0.07);border-radius:6px;border-left:3px solid var(--blue);font-size:12px;color:var(--text2);line-height:1.9\">
                <b>📌 วิธีใช้ Stage 2:</b> Copy ข้อมูลจาก SM Flash (4 บรรทัด = 4 ชิ้น) แล้ว Paste ลงด้านล่าง<br>
                <b>🔄 1-to-1 Logic:</b> Line 1 → Record 1 · Line 2 → Record 2 · Line 3 → Record 3 · Line 4 → Record
                4<br>
                <b>📊 Column Mapping:</b> ค่าตัวเลขแต่ละคอลัมน์จะถูกจับคู่กับ Parameter ตาม <i>ลำดับใน text_dict</i> ของ
                Product ที่เลือก<br>
                <b>🔁 Duplicate Variables:</b> Variables ซ้ำใน dict (เช่น X1/Y1 ปรากฏ 2 ครั้ง) → ถูกจับคู่แบบ positional
                ตามลำดับ dim (X1_pos1, X1_pos2 ฯลฯ)<br>
                <span style=\"color:var(--text3)\">⚠️ Parallel / DTM / NDTM ถูกบันทึกไว้แล้วใน Stage 1 —
                  ไม่ต้องใส่ในข้อมูล SM Flash</span>
              </div>'''
html = html.replace(instruction_block, '')

html = html.replace('📂 Upload .txt / .csv', 'Upload .txt / .csv')
html = html.replace('🔍 Preview Merge</button>', 'Preview Merge</button>')
html = html.replace('⚡ Merge Text Data (0 records)</button>', 'Merge Text Data (0 records)</button>')

with open('dispensing.html', 'w', encoding='utf-8') as f:
    f.write(html)
