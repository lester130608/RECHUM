// lib/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendCredentialsEmail(email: string, password: string) {
  return await resend.emails.send({
    from: 'HR System <no-reply@dttcoaching-payroll.com>',
    to: email,
    subject: '🆕 Your HR System Credentials',
    html: `
      <h2>Welcome to DTT Coaching Services, LLC</h2>
      <p>Here are your login credentials:</p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Password:</strong> ${password}</li>
      </ul>
      <p>Login here: <a href="https://dttcoaching-payroll.com/login">dttcoaching-payroll.com/login</a></p>
    `,
  })
}