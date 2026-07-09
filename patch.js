const fs = require('fs');
let content = fs.readFileSync('damper_install.js', 'utf8');

const selectPendingForMergeCode = \
function selectPendingForMerge(id) {
    _selectedMergeId = id;
    const recs = loadRecords();
    const r = recs.find(x => x.id === id);
    if (!r) { showToast('ไม่พบ Record ที่ต้องการเชื่อมข้อมูล', 'error'); return; }
    if (r.overall !== 'WAITING' && r.overall !== 'Waiting' && r.overall !== 'DRAFT_WAITING') {
        showToast('Record นี้ไม่ได้อยู่ในสถานะ Waiting/Draft', 'warn'); return;
    }
    const prodSel = document.getElementById('merge-product');
    if (prodSel) prodSel.value = r.product;
    const ptInput = document.getElementById('merge-pt');
    if (ptInput) ptInput.value = r.ptno || '';
    const mcInput = document.getElementById('merge-mc');
    if (mcInput) mcInput.value = r.mc || '';
    const targetInfo = document.getElementById('stage2-target-info');
    if(targetInfo) targetInfo.style.display = 'block';
    const targetDetails = document.getElementById('stage2-target-details');
    if(targetDetails) {
        targetDetails.innerHTML = \\\
        <b>Product:</b> \\\ <br>
        <b>PT No:</b> \\\ &nbsp;|&nbsp; <b>M/C:</b> \\\ &nbsp;|&nbsp; <b>Date:</b> \\\
        \\\;
    }
    const btn = document.querySelector('[data-tab="stage2"]');
    if (btn) btn.click();
}
\;

content = content.replace('function parseStage2Data() {', selectPendingForMergeCode + '\\nfunction parseStage2Data() {');
fs.writeFileSync('damper_install.js', content, 'utf8');
console.log('Patched');
