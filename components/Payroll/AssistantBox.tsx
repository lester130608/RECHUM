"use client";

// components/Payroll/AssistantBox.tsx
// Recuadro de preguntas del Dashboard. Solo owner.
//
// El render de markdown es minimo y a proposito: tablas, listas, negrita y
// parrafos. Es lo que devuelve el asistente y no hace falta una libreria
// entera para eso.

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Turn = { role: "user" | "assistant"; content: string };

const EJEMPLOS_OWNER = [
  "Como va el periodo actual y que falta",
  "Cuanto se pago en P-20260822 por area",
  "Horas e importe de Edwina en los ultimos 6 periodos",
  "Compara los dos ultimos periodos por area",
];

const EJEMPLOS_SUPERVISOR = [
  "Como corrijo lo que ya envie",
  "Que falta por capturar en mi area",
  "Hasta cuando puedo enviar este periodo",
  "Cuantas horas reporte de esta persona el periodo pasado",
];

/** Negrita y codigo dentro de una linea. */
function inline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} style={{ background: "#f1f5f4", padding: "1px 4px", borderRadius: 4 }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Markdown suficiente: tablas, listas, titulos y parrafos. */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Tabla
    if (line.trim().startsWith("|") && lines[i + 1]?.includes("---")) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div className="table-wrapper" key={`t-${i}`} style={{ margin: "10px 0" }}>
          <table>
            <thead>
              <tr>
                {head.map((cell, index) => (
                  <th key={index} style={{ textAlign: index === 0 ? "left" : "right" }}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={{ textAlign: cellIndex === 0 ? "left" : "right" }}>
                      {inline(cell, `c-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Lista
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={`l-${i}`} style={{ margin: "8px 0 8px 18px" }}>
          {items.map((item, index) => (
            <li key={index}>{inline(item, `li-${i}-${index}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^#{1,4}\s+/.test(line)) {
      blocks.push(
        <div key={`h-${i}`} className="heading" style={{ marginTop: 12 }}>
          {line.replace(/^#{1,4}\s+/, "")}
        </div>
      );
      i += 1;
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} style={{ margin: "6px 0" }}>
        {inline(line, `p-${i}`)}
      </p>
    );
    i += 1;
  }

  return <>{blocks}</>;
}

export function AssistantBox({ isOwner = false }: { isOwner?: boolean }) {
  const EJEMPLOS = isOwner ? EJEMPLOS_OWNER : EJEMPLOS_SUPERVISOR;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;

    const history: Turn[] = [...turns, { role: "user", content: clean }];
    setTurns(history);
    setQuestion("");
    setError(null);
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/payroll/assistant", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

      setTurns([...history, { role: "assistant", content: payload.answer }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <div className="heading" style={{ marginBottom: 4 }}>
        Preguntar a la nomina
      </div>
      <p className="subtitle" style={{ marginTop: 0 }}>
        {isOwner
          ? "Consulta los datos en palabras. Solo lee: no aprueba ni modifica nada."
          : "Pregunta por tu area o por como se hace algo en la app. Solo lee: no envia ni modifica nada."}
      </p>

      {turns.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
          {EJEMPLOS.map((ejemplo) => (
            <button key={ejemplo} type="button" className="btn" onClick={() => ask(ejemplo)}>
              {ejemplo}
            </button>
          ))}
        </div>
      )}

      {turns.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            margin: "12px 0",
            maxHeight: 460,
            overflowY: "auto",
          }}
        >
          {turns.map((turn, index) =>
            turn.role === "user" ? (
              <div
                key={index}
                style={{
                  alignSelf: "flex-end",
                  background: "#e6f7f3",
                  border: "1px solid #b7eadf",
                  borderRadius: 10,
                  padding: "8px 12px",
                  maxWidth: "80%",
                }}
              >
                {turn.content}
              </div>
            ) : (
              <div key={index} style={{ fontSize: 14 }}>
                <Markdown text={turn.content} />
              </div>
            )
          )}
          {loading && <div className="text-sm text-tertiary">Consultando...</div>}
        </div>
      )}

      {error && (
        <div className="error" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ej: cuanto se pago en TCM el mes pasado"
          style={{ flex: 1 }}
          disabled={loading}
        />
        <button type="submit" className="dtt-primary" disabled={loading || !question.trim()}>
          {loading ? "..." : "Preguntar"}
        </button>
        {turns.length > 0 && (
          <button type="button" className="btn" onClick={() => setTurns([])} disabled={loading}>
            Limpiar
          </button>
        )}
      </form>
    </section>
  );
}
