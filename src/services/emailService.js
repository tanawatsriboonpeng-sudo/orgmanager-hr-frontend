const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const sendOTPEmail = async (to, name, otp) => {
  await transporter.sendMail({
    from: `"สิริคอนส์ HR" <${process.env.SMTP_USER}>`,
    to,
    subject: 'รหัส OTP สำหรับรีเซ็ตรหัสผ่าน - OrgManager HR',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="background:#1D9E75;padding:20px;border-radius:12px 12px 0 0;text-align:center">
          <h2 style="color:white;margin:0;font-size:20px">🔐 รีเซ็ตรหัสผ่าน</h2>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">บริษัท สิริคอนส์ คอนสตรัคชั่น จำกัด</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee">
          <p style="margin:0 0 16px;color:#333">สวัสดี <strong>${name}</strong></p>
          <p style="margin:0 0 16px;color:#555;font-size:14px">
            เราได้รับคำขอรีเซ็ตรหัสผ่านของคุณ กรุณาใช้รหัส OTP ด้านล่าง:
          </p>
          <div style="background:white;border:2px solid #1D9E75;border-radius:10px;padding:20px;text-align:center;margin:20px 0">
            <div style="font-size:36px;font-weight:bold;color:#1D9E75;letter-spacing:8px">${otp}</div>
            <p style="color:#999;font-size:12px;margin:8px 0 0">รหัสนี้หมดอายุใน <strong>10 นาที</strong></p>
          </div>
          <p style="margin:0 0 8px;color:#888;font-size:12px">
            ⚠️ หากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน กรุณาเพิกเฉยต่ออีเมลนี้
          </p>
          <p style="margin:0;color:#888;font-size:12px">
            ระบบ HR • บริษัท สิริคอนส์ คอนสตรัคชั่น จำกัด
          </p>
        </div>
      </div>
    `,
  })
}

const sendWelcomeEmail = async (to, name, employeeId, password) => {
  await transporter.sendMail({
    from: `"สิริคอนส์ HR" <${process.env.SMTP_USER}>`,
    to,
    subject: 'ยินดีต้อนรับสู่ระบบ HR - บริษัท สิริคอนส์ คอนสตรัคชั่น จำกัด',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="background:#1D9E75;padding:20px;border-radius:12px 12px 0 0;text-align:center">
          <h2 style="color:white;margin:0;font-size:20px">🎉 ยินดีต้อนรับ!</h2>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">บริษัท สิริคอนส์ คอนสตรัคชั่น จำกัด</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee">
          <p style="margin:0 0 16px;color:#333">สวัสดี <strong>${name}</strong></p>
          <p style="margin:0 0 16px;color:#555;font-size:14px">บัญชีของคุณในระบบ HR ถูกสร้างแล้ว:</p>
          <div style="background:white;border-radius:10px;padding:16px;margin:16px 0;border:1px solid #eee">
            <table style="width:100%;font-size:14px">
              <tr><td style="color:#888;padding:4px 0">อีเมล:</td><td style="font-weight:bold">${to}</td></tr>
              <tr><td style="color:#888;padding:4px 0">รหัสพนักงาน:</td><td style="font-weight:bold">${employeeId}</td></tr>
              <tr><td style="color:#888;padding:4px 0">รหัสผ่าน:</td><td style="font-weight:bold;color:#1D9E75">${password}</td></tr>
            </table>
          </div>
          <div style="text-align:center;margin:20px 0">
            <a href="${process.env.FRONTEND_URL}/login"
               style="background:#1D9E75;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">
              เข้าสู่ระบบ →
            </a>
          </div>
          <p style="margin:16px 0 0;color:#E24B4A;font-size:12px">
            ⚠️ กรุณาเปลี่ยนรหัสผ่านหลังจาก Login ครั้งแรก
          </p>
        </div>
      </div>
    `,
  })
}

module.exports = { sendOTPEmail, sendWelcomeEmail }
