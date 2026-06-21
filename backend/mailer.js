require('dotenv').config();
const nodemailer = require('nodemailer');

// Configure the transporter for Outlook/Office365
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    ciphers: 'SSLv3'
  }
});

/**
 * Sends an email alert for a specific process
 * @param {string} processName - The name of the process (e.g. 'Push Out Force', 'Damper Install')
 * @param {object} alertData - The alert data object containing relevant details
 */
async function sendAlertEmail(processName, alertData) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.ALERT_RECIPIENTS) {
    console.log(`⚠️ [Mailer] Skipping email alert for ${processName}: SMTP credentials or recipients not configured in .env`);
    return;
  }

  // Basic HTML template for the alert
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #d9534f; color: white; padding: 15px; text-align: center;">
        <h2 style="margin: 0;">⚠️ IPQC Alert: ${processName}</h2>
      </div>
      <div style="padding: 20px;">
        <p><strong>Time:</strong> ${new Date().toLocaleString('th-TH')}</p>
        <p><strong>Record No:</strong> ${alertData.no || '-'}</p>
        <p><strong>Traveler / Product:</strong> ${alertData.traveler || alertData.product || '-'}</p>
        <p><strong>Reason / Remark:</strong> <span style="color: #d9534f; font-weight: bold;">${alertData.remark || alertData.reason || alertData.spec || '-'}</span></p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="background-color: #f9f9f9;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Detail</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Value</th>
          </tr>
          ${Object.entries(alertData).filter(([k, v]) => !['no', 'traveler', 'product', 'remark', 'reason', 'spec'].includes(k)).map(([k, v]) => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">${k}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${v}</td>
            </tr>
          `).join('')}
        </table>
        
        <p style="margin-top: 20px; font-size: 12px; color: #777;">This is an automated alert from the BELTON IPQC System. Please do not reply to this email.</p>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"BELTON IPQC Alert" <${process.env.SMTP_USER}>`,
      to: process.env.ALERT_RECIPIENTS,
      subject: `[IPQC ALERT] ${processName} NG Detected`,
      html: htmlContent,
    });
    console.log(`📧 [Mailer] Alert email sent for ${processName}: ${info.messageId}`);
  } catch (error) {
    console.error(`❌ [Mailer] Failed to send email alert for ${processName}:`, error.message);
  }
}

module.exports = { sendAlertEmail };
