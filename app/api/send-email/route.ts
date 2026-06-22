// app/api/send-email/route.ts
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerSupabase } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let grantedPermission: 'users.manage' | 'admin.send_credentials' | null = null

  const usersManage = await requirePermission(supabase, 'users.manage')
  if (usersManage.ok) {
    grantedPermission = 'users.manage'
  } else if (usersManage.status !== 403) {
    return NextResponse.json({ error: usersManage.error }, { status: usersManage.status })
  } else {
    const sendCredentials = await requirePermission(supabase, 'admin.send_credentials')
    if (sendCredentials.ok) {
      grantedPermission = 'admin.send_credentials'
    } else {
      return NextResponse.json({ error: sendCredentials.error }, { status: sendCredentials.status })
    }
  }

  const { email, password } = await req.json()

  if (typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Invalid temporary password' }, { status: 400 })
  }

  try {
    await resend.emails.send({
      from: 'no-reply@onresend.com', // Usa este para pruebas
      to: email,
      subject: '🆕 Your HR System Credentials',
      html: `
        <h2>Welcome to DTT Coaching Services, LLC</h2>
        <p>Here are your temporary login credentials:</p>
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>
        <p><strong>Security note:</strong> Please log in and change this password immediately.</p>
        <p>Login here: <a href="https://dttcoaching-payroll.com/login">dttcoaching-payroll.com/login</a></p>
      `
    })

    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'user_credentials',
        entity_id: user.id,
        action: 'send_credentials_email',
        after_data: {
          recipient_email: email,
          sent_at: new Date().toISOString(),
          permission_used: grantedPermission,
        },
        actor_id: user.id,
      })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error enviando email:", error);
    return NextResponse.json({ success: false, error: 'Email delivery failed' }, { status: 500 })
  }
}