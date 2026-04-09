// utils/mailer.js — Gmail OTP Sender
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

async function sendOTP(toEmail, otp) {
  const mailOptions = {
    from: `"ResidenceOS" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Your ResidenceOS Login OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
        <h2 style="color: #4f8ef7;">ResidenceOS</h2>
        <p>Your One Time Password for login is:</p>
        <h1 style="letter-spacing: 8px; color: #111;">${otp}</h1>
        <p style="color: #888;">This OTP is valid for <strong>5 minutes</strong>. Do not share it with anyone.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendOTP };