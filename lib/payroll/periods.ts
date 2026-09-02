// ---------------------------------------------------------------------------
// Elección del periodo por defecto.
//
// PROBLEMA QUE RESUELVE
// Las pantallas ordenan los periodos por pay_date descendente y luego cogían
// periods[0], que es el MÁS LEJANO EN EL FUTURO. El 1 de septiembre de 2026 la
// aplicación ofrecía por defecto el periodo del 12 al 25 de diciembre.
//
// No es solo confuso: capturar horas en el periodo equivocado es un error
// fácil de cometer y difícil de detectar, porque la pantalla se ve idéntica.
//
// La lógica correcta ya existía en el dashboard pero no la usaba nadie más.
// Aquí queda en un solo sitio para que todas las pantallas coincidan.
// ---------------------------------------------------------------------------

const FLORIDA_TZ = 'America/New_York';

/**
 * Fecha de hoy en Florida, en formato YYYY-MM-DD.
 *
 * Importa la zona horaria: el servidor corre en UTC, y entre las 20:00 y
 * medianoche de Florida el UTC ya está en el día siguiente. Sin esto, las
 * ventanas de captura se abren y se cierran con horas de desfase.
 */
export function getTodayNY(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FLORIDA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;

  return `${y}-${m}-${d}`;
}

export type PeriodLike = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  pay_date: string;
  capture_opens_at?: string | null;
};

/**
 * El periodo en el que se está trabajando ahora mismo.
 *
 * Criterio, en orden:
 *   1. El periodo ABIERTO: hoy cae entre su apertura de captura y su pay date.
 *      Es el que se está capturando.
 *   2. Si ninguno está abierto, el PRÓXIMO por pay date. Es el que toca.
 *   3. Si todos son pasados, el más reciente.
 *
 * El 1 de septiembre esto devuelve P-20260808 (trabajo del 8 al 21 de agosto,
 * pago el 4 de septiembre), que es el correcto, en vez del de diciembre.
 */
export function chooseCurrentPeriod<T extends PeriodLike>(
  periods: T[],
  today: string = getTodayNY()
): T | null {
  if (!periods || periods.length === 0) return null;

  // 1. Abierto ahora
  const active = periods.find((period) => {
    const opensAt = period.capture_opens_at || period.start_date;
    return Boolean(opensAt) && opensAt! <= today && today <= period.pay_date;
  });
  if (active) return active;

  // 2. El próximo que se paga
  const upcoming = [...periods]
    .filter((period) => period.pay_date >= today)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date))[0];
  if (upcoming) return upcoming;

  // 3. El último pasado
  return [...periods].sort((a, b) => b.pay_date.localeCompare(a.pay_date))[0] ?? null;
}

/** Atajo: el id, o null. */
export function chooseCurrentPeriodId<T extends PeriodLike>(
  periods: T[],
  today: string = getTodayNY()
): string | null {
  return chooseCurrentPeriod(periods, today)?.id ?? null;
}
