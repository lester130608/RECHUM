// app/api/payroll/assistant/route.ts
//
// El asistente de consultas. Solo lectura y solo owner (v1).
//
// Decisiones:
//   - Sin SDK: se llama a la API de Anthropic con fetch. Una dependencia
//     menos que mantener.
//   - El modelo NO escribe SQL. Solo puede llamar a las herramientas de
//     lib/payroll/assistantTools.ts, que leen con el cliente de la sesion,
//     asi que las RLS siguen aplicando.
//   - La llave vive solo en el servidor. Nunca se manda al navegador.
//   - Cada pregunta queda en audit_logs.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  REAL_PAYROLL_ROLES,
  getSupervisedAreas,
  isOwner,
  requireAnyRole,
} from '@/lib/auth/roleAccess';
import {
  AREAS,
  ASSISTANT_TOOLS,
  runAssistantTool,
  type AssistantCtx,
} from '@/lib/payroll/assistantTools';
import { GUIA_OWNER, GUIA_SUPERVISOR } from '@/lib/payroll/assistantGuide';
import { getTodayNY } from '@/lib/payroll/periods';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 6;
/** Preguntas por persona y dia. Un descuido no se puede comer el credito. */
const MAX_PREGUNTAS_DIA = 40;
const MAX_HISTORY = 12;

function systemPrompt(ctx: AssistantCtx) {
  return [
    'Eres el asistente de la nomina de DTT Coaching Services. Respondes en espanol,',
    'en pocas frases, y con tablas en markdown cuando la respuesta tenga mas de tres filas.',
    '',
    'Haces dos cosas: consultar datos con tus herramientas, y explicar como se usa la',
    'aplicacion. Si la pregunta es de "como se hace" o "donde esta", respondela con la guia',
    'de abajo, sin llamar a ninguna herramienta.',
    '',
    `Hoy es ${getTodayNY()} (hora de Florida).`,
    '',
    'COMO FUNCIONA LA NOMINA',
    '- Hay cuatro areas que se capturan y aprueban por separado: BA, CMHC, TCM y EMP.',
    '- El periodo se consolida solo cuando las cuatro estan aprobadas.',
    '- BA son RBT, BCaBA y BCBA. CMHC son terapeutas, y se captura en unidades. TCM se captura en',
    '  horas. EMP es oficina, mas los dos psiquiatras (Gayol y Ripoll), que se capturan en dias.',
    '- Edwina Fernandez cobra dos veces en el mismo periodo: sus horas de BA como BCBA, y ademas',
    '  el 1,5% del bruto de los RBT de BA, que se paga dentro de EMP. No es un error ni un duplicado.',
    '- En TCM, quien pasa de 34 horas en una semana cobra toda esa semana a 30 dolares la hora.',
    '',
    'REGLAS',
    '- Usa SIEMPRE las herramientas. No respondas cifras de memoria ni las estimes.',
    '- Si una herramienta devuelve un error o no hay datos, dilo tal cual. No rellenes huecos.',
    '- Un importe solo cuenta como pagado si su run esta aprobado, consolidado, exportado o cerrado.',
    '  Un borrador no es dinero pagado; si mezclas los dos, avisa de que lo estas haciendo.',
    '- Cuando hagas promedios o comparaciones, di sobre cuantas filas y que periodos los hiciste.',
    '- Si la pregunta es ambigua (una persona con varios homonimos, un mes sin periodo claro),',
    '  pregunta antes de calcular.',
    '- No puedes modificar nada: no apruebas, no capturas y no corriges. Si te lo piden, explica',
    '  en que pantalla se hace.',
    ctx.owner
      ? '- Hablas con el owner: puede ver importes de las cuatro areas.'
      : `- Hablas con un supervisor de ${ctx.areas.join(', ')}. NO tiene acceso a importes ni a ` +
        'tarifas, y tus herramientas no te los devuelven. Si pregunta cuanto cobra alguien, dile ' +
        'con naturalidad que los importes los lleva el owner, y ofrece lo que si puedes darle: ' +
        'horas, personas y estado de la captura. No es un castigo, es como esta disenado.',
    '',
    ctx.owner ? GUIA_OWNER : GUIA_SUPERVISOR,
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const owner = isOwner(auth.roleCodes);
    const ctx: AssistantCtx = {
      owner,
      areas: owner
        ? [...AREAS]
        : getSupervisedAreas(auth.roleCodes).filter((area) =>
            (AREAS as readonly string[]).includes(area)
          ),
    };

    if (ctx.areas.length === 0) {
      return NextResponse.json(
        { error: 'Tu usuario no tiene ningun area asignada, asi que no hay nada que consultar.' },
        { status: 403 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Falta ANTHROPIC_API_KEY en el servidor. El asistente no esta configurado.' },
        { status: 503 }
      );
    }

    // Tope diario. Se cuenta sobre audit_logs, que es donde ya queda el rastro.
    const desdeMedianoche = new Date();
    desdeMedianoche.setHours(0, 0, 0, 0);

    const { count: preguntasHoy } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'payroll_assistant')
      .eq('actor_id', auth.userId)
      .gte('created_at', desdeMedianoche.toISOString());

    if ((preguntasHoy ?? 0) >= MAX_PREGUNTAS_DIA) {
      return NextResponse.json(
        {
          error:
            `Has llegado al limite de ${MAX_PREGUNTAS_DIA} preguntas por hoy. ` +
            'Vuelve a intentarlo manana.',
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const incoming = Array.isArray(body?.messages) ? body.messages : null;
    if (!incoming || incoming.length === 0) {
      return NextResponse.json({ error: 'messages es obligatorio' }, { status: 400 });
    }

    // Historial que manda el navegador: solo texto, y acotado.
    const messages: any[] = incoming
      .slice(-MAX_HISTORY)
      .filter((message: any) => message?.role === 'user' || message?.role === 'assistant')
      .map((message: any) => ({
        role: message.role,
        content: String(message.content ?? '').slice(0, 4000),
      }));

    const toolsUsed: string[] = [];
    let answer = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system: systemPrompt(ctx),
          tools: ASSISTANT_TOOLS,
          messages,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.error('Anthropic API error:', response.status, detail);
        return NextResponse.json(
          { error: `El asistente no respondio (HTTP ${response.status}).` },
          { status: 502 }
        );
      }

      const payload = await response.json();
      messages.push({ role: 'assistant', content: payload.content });

      const toolCalls = (payload.content ?? []).filter((block: any) => block.type === 'tool_use');

      if (toolCalls.length === 0) {
        answer = (payload.content ?? [])
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n')
          .trim();
        break;
      }

      const results = [];
      for (const call of toolCalls) {
        toolsUsed.push(call.name);
        try {
          const data = await runAssistantTool(supabase, ctx, call.name, call.input);
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify(data).slice(0, 60000),
          });
        } catch (error: any) {
          // El error va al modelo para que lo cuente, no se traga en silencio.
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: true,
            content: String(error.message ?? error),
          });
        }
      }

      messages.push({ role: 'user', content: results });
    }

    if (!answer) {
      answer =
        'Me quede sin pasos antes de poder responder. Prueba a preguntarlo de forma mas concreta, ' +
        'por ejemplo nombrando el periodo.';
    }

    // Rastro de quien pregunto que. No guarda la respuesta, solo la pregunta.
    const lastQuestion = [...messages].reverse().find(
      (message) => message.role === 'user' && typeof message.content === 'string'
    );

    supabase
      .from('audit_logs')
      .insert({
        entity_type: 'payroll_assistant',
        entity_id: auth.userId,
        action: 'ask',
        after_data: {
          question: String(lastQuestion?.content ?? '').slice(0, 500),
          tools: toolsUsed,
          model: MODEL,
          rol: owner ? 'owner' : ctx.areas.join('+'),
        },
        actor_id: auth.userId,
      })
      .then(() => {});

    return NextResponse.json({ answer, tools_used: toolsUsed });
  } catch (error: any) {
    console.error('POST /api/payroll/assistant error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
