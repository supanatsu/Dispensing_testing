const nodemailer = require('nodemailer');

/**
 * Sends an email alert for a specific process with dynamic DB config
 * @param {object} pool - MySQL connection pool
 * @param {string} moduleName - Process Name (e.g., 'Dispensing', 'Laser Engraving')
 * @param {object[]} alerts - Array of alert objects
 * 
 * Alert Object structure:
 * {
 *    parameter: 'POF NTC Bobbin',
 *    product: 'Rosewood 1D',
 *    fixture: 'FIX-01',
 *    targetCol: 'Row 12', // or any location identifier
 *    actualValue: 25.7,
 *    alertStatus: 'Higher than UCL',
 *    limitCheck: 'UCL=23.18',
 *    chartUrl: 'https://quickchart.io/chart?c=...',
 *    time: '2026-06-22 10:00:00'
 * }
 */
async function sendAlertEmail(pool, moduleName, alerts) {
  if (!alerts || alerts.length === 0) return;

  try {
    // 1. Fetch SMTP Configuration
    const [sysRows] = await pool.query("SELECT config_key, config_value FROM system_config WHERE config_key IN ('SENDER_EMAIL', 'SENDER_PASS')");
    const sysConfig = {};
    sysRows.forEach(r => sysConfig[r.config_key] = r.config_value);

    const smtpUser = sysConfig['SENDER_EMAIL'];
    const smtpPass = sysConfig['SENDER_PASS'];

    if (!smtpUser || !smtpPass) {
      console.log(`⚠️ [Mailer] Skipping email alert for ${moduleName}: SMTP credentials not configured in system_config`);
      return;
    }

    // 2. Fetch Recipients
    const [recipRows] = await pool.query("SELECT email FROM alert_recipients WHERE active = 1");
    if (recipRows.length === 0) {
      console.log(`⚠️ [Mailer] Skipping email alert for ${moduleName}: No active recipients found in alert_recipients`);
      return;
    }
    const toEmails = recipRows.map(r => r.email).join(',');

    // 3. Configure Transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        ciphers: 'SSLv3'
      }
    });

    // 4. Generate HTML Content for multiple alerts (Digest format if bulk)
    let htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 700px; margin: auto; border: 1px solid #e1e4e8; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="background-color: #d9534f; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px; letter-spacing: 0.5px;">⚠️ IPQC Alert: ${moduleName}</h2>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Belton Automated Real-time Quality Alert System</p>
        </div>
        <div style="padding: 24px;">
          <p style="margin-top: 0; margin-bottom: 20px; font-size: 14px;"><strong>Detected ${alerts.length} Out-of-Spec / Danger events.</strong></p>
    `;

    // Limit to 10 alerts per email to prevent giant emails
    const displayAlerts = alerts.slice(0, 10);
    
    displayAlerts.forEach((alert, index) => {
      const headerBg = alert.alertStatus.toLowerCase().includes('reject') || alert.alertStatus.toLowerCase().includes('fail') ? '#d9534f' : '#f0ad4e';
      
      htmlContent += `
        <div style="margin-bottom: 30px; border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
          <div style="background-color: #f9f9f9; padding: 12px 16px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: ${headerBg}; font-size: 16px;">#${index + 1}: ${alert.parameter}</strong>
            <span style="font-size: 12px; color: #777;">${alert.time}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; width: 35%; color: #555;"><strong>Product Model</strong></td>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: #111;">${alert.product}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: #555;"><strong>Fixture / Machine</strong></td>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: #111;">${alert.fixture || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: #555;"><strong>Target / Row</strong></td>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: #111;">${alert.targetCol || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: #555;"><strong>Actual Value</strong></td>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: ${headerBg}; font-weight: bold; font-size: 15px;">${alert.actualValue}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: #555;"><strong>Alert Status</strong></td>
              <td style="padding: 8px 16px; border-bottom: 1px solid #f1f1f1; color: ${headerBg}; font-weight: bold;">${alert.alertStatus}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; color: #555;"><strong>Limit Check</strong></td>
              <td style="padding: 8px 16px; color: #111; font-family: monospace;">${alert.limitCheck}</td>
            </tr>
          </table>
      `;

      if (alert.chartUrl) {
        htmlContent += `
          <div style="padding: 16px; text-align: center; border-top: 1px solid #eee; background-color: #fafafa;">
            <p style="margin: 0 0 10px 0; font-size: 13px; color: #555; text-align: left;"><strong>📉 Current SPC Trend Chart (Last 20 Points):</strong></p>
            <img src="${alert.chartUrl}" alt="SPC Chart" style="max-width: 100%; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />
          </div>
        `;
      }

      htmlContent += `</div>`;
    });

    if (alerts.length > 10) {
      htmlContent += `<p style="text-align: center; color: #777; font-size: 13px;"><em>...and ${alerts.length - 10} more alerts not shown in this email. Please check the system dashboard.</em></p>`;
    }

    htmlContent += `
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; border-radius: 0 4px 4px 0; margin-top: 20px;">
              <p style="margin: 0; font-size: 13px; color: #856404; font-weight: 600;">⚠️ Preventive Action Advice:</p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #856404; line-height: 1.5;">Please hold the production and verify the process parameter. Inspect the machine calibration and immediately check the output product.</p>
          </div>
          <p style="margin-top: 30px; text-align: center; font-size: 11px; color: #999; border-top: 1px dashed #eee; padding-top: 15px;">
            This is an automated message from the BELTON IPQC Master System. Do not reply to this email.
          </p>
        </div>
      </div>
    `;

    // 5. Send Email
    const info = await transporter.sendMail({
      from: `"BELTON IPQC Alert" <${smtpUser}>`,
      to: toEmails,
      subject: `[IPQC ALERT] ${moduleName}: ${alerts.length} NG/Warning Detected`,
      html: htmlContent,
    });
    console.log(`📧 [Mailer] Alert email sent for ${moduleName}: ${info.messageId}`);
    return true;

  } catch (error) {
    console.error(`❌ [Mailer] Failed to send email alert for ${moduleName}:`, error);
    return false;
  }
}

module.exports = { sendAlertEmail };
