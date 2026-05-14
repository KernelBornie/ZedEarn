const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const buildTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM_EMAIL) {
    logger.warn('[Email] SMTP config missing. Emails will be skipped.');
    return null;
  }

  const port = Number(SMTP_PORT);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
};

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = buildTransporter();
  }
  return transporter;
};

const otpEmailHtml = (otp, name) => `
  <div style="font-family: 'Segoe UI', sans-serif; background:#f4f6fb; padding: 24px;">
    <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px;">
      <h2 style="color:#6c63ff; margin-bottom: 8px;">ZedEarn Password Reset</h2>
      <p style="font-size: 14px; color: #4b5563;">Hi ${name || 'there'},</p>
      <p style="font-size: 14px; color: #4b5563;">Your password reset code is:</p>
      <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 16px 0; color:#111827;">
        ${otp}
      </div>
      <p style="font-size: 13px; color: #6b7280;">This code expires in 10 minutes.</p>
      <p style="font-size: 13px; color: #6b7280;">If you did not request this, you can safely ignore this email.</p>
      <div style="margin-top: 24px; font-size: 12px; color: #9ca3af;">ZedEarn Team</div>
    </div>
  </div>
`;

const sendPasswordResetOTP = async ({ to, name, otp }) => {
  const transport = getTransporter();
  if (!transport) return false;

  const from = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  try {
    await transport.sendMail({
      from,
      to,
      subject: 'ZedEarn Password Reset Code',
      text: `Your ZedEarn password reset code is ${otp}. This code expires in 10 minutes.`,
      html: otpEmailHtml(otp, name),
    });
    return true;
  } catch (err) {
    logger.error('[Email] Send failed', { error: err.message });
    return false;
  }
};

module.exports = { sendPasswordResetOTP };
