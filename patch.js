const fs = require('fs');
const content = fs.readFileSync('system_config.html', 'utf8');
const lines = content.split('\n');

let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<!-- LASER CONFIG PANEL -->')) {
        startIdx = i;
    }
    if (lines[i].includes('<!-- DAMPER CONFIG PANEL -->')) {
        endIdx = i;
        break;
    }
}

if (startIdx !== -1 && endIdx !== -1) {
    const newLines = lines.slice(0, startIdx).concat([
`                <!-- LASER CONFIG PANEL -->
                <div id="cfg-panel-laser" style="display:none;">
                    <div style="background:var(--bg2); padding: 20px; border-radius:8px; border-left: 4px solid #f59e0b;">
                        <h3 style="color:var(--text); margin-top:0; margin-bottom:16px; font-size:14px; display:flex; align-items:center; gap:8px;">
                            Laser Engraving — SPC Parameters
                        </h3>

                        <!-- Product Selector -->
                        <div style="margin-bottom:20px; padding:16px; background:rgba(245,158,11,0.05); border-radius:8px; border:1px solid rgba(245,158,11,0.2);">
                            <div class="form-grid" style="grid-template-columns:auto auto 1fr; align-items:end; margin-bottom:0;">
                                <div class="form-group">
                                    <label style="display:block; font-size:12px; font-weight:700; color:var(--text3); margin-bottom:6px;">??????????? (Data Type)</label>
                                    <select id="sys-laser-datatype" class="form-select" onchange="renderLaserConfigTable()" style="font-weight:600; min-width:150px;">
                                        <option value="Buy-off">Buy-off</option>
                                        <option value="Roving">Roving</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label style="display:block; font-size:12px; font-weight:700; color:var(--text3); margin-bottom:6px;">????? Product</label>
                                    <select id="sys-laser-model" class="form-select" onchange="renderLaserConfigTable()" style="font-weight:600; min-width:250px;">
                                        <option value="">— ????? Product —</option>
                                    </select>
                                </div>
                                <div class="form-group" style="justify-content:flex-end; flex-direction:row; align-items:flex-end; gap:12px;">
                                    <button class="btn btn-outline" onclick="addLaserConfigRow()" style="padding:10px 16px; font-weight:600;">+ ????????????????</button>
                                </div>
                            </div>
                        </div>

                        <div class="tbl-wrap" style="border-radius: 8px; overflow: hidden; border: 1px solid #eee;">
                            <table style="margin: 0; width: 100%;">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="padding: 12px 16px; font-weight: 700; color: #334155;">Parameter Name</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--fail);">LSL</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--warn);">LCL</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--green);">CL (Target)</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--warn);">UCL</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--fail);">USL</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: #334155;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="sys-laser-tbody" style="background: #fff;"></tbody>
                            </table>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:12px; padding-top:16px; margin-top:8px; border-top:1px solid #f1f5f9;">
                            <button class="btn btn-primary" onclick="saveLaserConfigs()" style="background:#f59e0b; border:none; padding:10px 24px; font-weight:bold;">?? ?????? Laser Settings</button>
                        </div>
                    </div>
                </div>

                <!-- POF CONFIG PANEL -->
                <div id="cfg-panel-pof" style="display:none;">
                    <div style="background:var(--bg2); padding: 20px; border-radius:8px; border-left: 4px solid #a855f7;">
                        <h3 style="color:var(--text); margin-top:0; margin-bottom:16px; font-size:14px; display:flex; align-items:center; gap:8px;">
                            POF — SPC Parameters
                        </h3>

                        <div style="margin-bottom:20px; padding:16px; background:rgba(168,85,247,0.05); border-radius:8px; border:1px solid rgba(168,85,247,0.2);">
                            <div class="form-grid" style="grid-template-columns:auto auto 1fr; align-items:end; margin-bottom:0;">
                                <div class="form-group">
                                    <label style="display:block; font-size:12px; font-weight:700; color:var(--text3); margin-bottom:6px;">??????????? (Data Type)</label>
                                    <select id="sys-pof-datatype" class="form-select" onchange="renderPofConfigTable()" style="font-weight:600; min-width:150px;">
                                        <option value="Buy-off">Buy-off</option>
                                        <option value="Roving">Roving</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label style="display:block; font-size:12px; font-weight:700; color:var(--text3); margin-bottom:6px;">????? Product</label>
                                    <select id="sys-pof-model" class="form-select" onchange="renderPofConfigTable()" style="font-weight:600; min-width:250px;">
                                        <option value="">— ????? Product —</option>
                                    </select>
                                </div>
                                <div class="form-group" style="justify-content:flex-end; flex-direction:row; align-items:flex-end; gap:12px;">
                                    <button class="btn btn-outline" onclick="addPofConfigRow()" style="padding:10px 16px; font-weight:600;">+ ????????????????</button>
                                </div>
                            </div>
                        </div>

                        <div class="tbl-wrap" style="border-radius: 8px; overflow: hidden; border: 1px solid #eee;">
                            <table style="margin: 0; width: 100%;">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="padding: 12px 16px; font-weight: 700; color: #334155;">Parameter Name</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--fail);">LSL</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--warn);">LCL</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--green);">CL (Target)</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--warn);">UCL</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: var(--fail);">USL</th>
                                        <th style="padding: 12px 16px; font-weight: 700; color: #334155;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="sys-pof-tbody" style="background: #fff;"></tbody>
                            </table>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:12px; padding-top:16px; margin-top:8px; border-top:1px solid #f1f5f9;">
                            <button class="btn btn-primary" onclick="savePofConfigs()" style="background:#a855f7; border:none; padding:10px 24px; font-weight:bold;">?? ?????? POF Settings</button>
                        </div>
                    </div>
                </div>`
    ]).concat(lines.slice(endIdx));

    fs.writeFileSync('system_config.html', newLines.join('\n'), 'utf8');
    console.log('SUCCESS');
} else {
    console.log('FAILED TO FIND TAGS');
}
