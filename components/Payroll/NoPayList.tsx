'use client';

// components/Payroll/NoPayList.tsx
//
// Quien no cobra en el periodo no va en la tabla principal: con 50 personas
// en BA y la mitad de TCM a cero, las filas de $0.00 eran ruido al cuadrar
// contra ADP. Pero tampoco se pueden esconder del todo —un cero puede ser
// un olvido (P-20260905: faltó Mirian en TCM)— así que quedan aquí, en una
// lista plegable debajo, con el nombre y el motivo cuando se sabe.
// (Pedido por el owner el 2026-10-01.)

type NoPayEntry = {
  id: string;
  name: string;
  note?: string | null;
};

type Props = {
  entries: NoPayEntry[];
  /** Texto del encabezado; por defecto "No pay this period". */
  title?: string;
  /** Qué significa estar aquí, en una línea (ej. "0 hours captured"). */
  hint?: string;
};

export function NoPayList({ entries, title = 'No pay this period', hint }: Props) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <details
      className="section"
      style={{ padding: '10px 16px', marginTop: 12, background: '#f9fafb' }}
    >
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
        {title} ({entries.length})
        {hint && (
          <span style={{ marginLeft: 8, fontWeight: 400, color: '#6b7280' }}>{hint}</span>
        )}
      </summary>
      <ul
        style={{
          margin: '8px 0 0',
          padding: 0,
          listStyle: 'none',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '4px 16px',
          fontSize: 13,
          color: '#4b5563',
        }}
      >
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.name}
            {entry.note && <span style={{ color: '#9ca3af' }}> · {entry.note}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
