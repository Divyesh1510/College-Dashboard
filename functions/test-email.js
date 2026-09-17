require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_PASSWORD
  }
});

const mailOptions = {
  from: `"Campus Nav Test" <${process.env.GMAIL_EMAIL}>`,
  to: 'divyeshatla@gmail.com',
  subject: "Test Welcome to Campus Nav! 🚀",
  html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0F172A; color: #F8FAFC; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">Campus Nav</h1>
        </div>
        
        <div style="background-color: #1E293B; padding: 30px; border-radius: 12px; border: 1px solid #334155;">
          <h2 style="margin-top: 0; color: #FFFFFF;">Welcome, Divyesh! 👋</h2>
          <p style="color: #CBD5E1; line-height: 1.6; font-size: 16px;">
            This is a TEST email sent directly from your local development environment!
          </p>
          <p style="color: #CBD5E1; line-height: 1.6; font-size: 16px;">
            If you are reading this, your Gmail App Password and Nodemailer configuration are working perfectly, and the Firebase Cloud Functions are ready to take over!
          </p>
        </div>
      </div>
  `
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error("FAILED to send test email:", error);
  } else {
    console.log("SUCCESS! Test email sent:", info.response);
  }
});
