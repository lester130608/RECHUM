// app/api/send-email/route.ts
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  const { email, password } = await req.json()
  console.log("Intentando enviar email a:", email);

  try {
    const data = await resend.emails.send({
      from: 'no-reply@onresend.com', // Usa este para pruebas
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
      `
    })
    console.log("Respuesta de Resend:", data);

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error enviando email:", error);
    return NextResponse.json({ success: false, error })
  }
}