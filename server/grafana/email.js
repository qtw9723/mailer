// server/grafana/email.js
import nodemailer from 'nodemailer'

export async function sendReportEmail(html) {
  const from = process.env.GRAFANA_EMAIL_FROM
  const pass = process.env.GRAFANA_EMAIL_PASSWORD
  const to = process.env.GRAFANA_EMAIL_TO
  if (!from || !pass || !to) throw new Error('GRAFANA_EMAIL_* 미설정')

  const recipients = to.split(',').map((s) => s.trim()).filter(Boolean)
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: from, pass },
  })
  await transporter.sendMail({
    from,
    to: recipients,
    subject: '[Next-TI 운영] 그라파나 모니터링 보고서',
    html,
  })
}
