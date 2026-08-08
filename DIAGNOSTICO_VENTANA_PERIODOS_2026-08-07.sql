-- ============================================================
-- DIAGNÓSTICO: ¿por qué ningún supervisor ve período disponible?
-- Fecha: 2026-08-07
-- ============================================================
-- 100% SOLO LECTURA.
--
-- LA FÓRMULA que aplica el código (app/api/payroll/capture/{ba,cmhc,tcm}/route.ts):
--   supervisor ve el período  <=>  capture_opens_at <= HOY <= sup_deadline
--   owner ve TODOS los períodos (se salta el filtro)
--   "HOY" se calcula en zona horaria America/New_York
--
-- Estas consultas dicen cuál de las 3 causas es.
-- ============================================================


-- ------------------------------------------------------------
-- 1) LA PREGUNTA DIRECTA: ¿qué vería un supervisor hoy?
-- ------------------------------------------------------------
-- Si devuelve 0 filas, ningún supervisor ve nada. Confirmado el síntoma.
SELECT
  week_code,
  capture_opens_at,
  sup_deadline,
  pay_date,
  status
FROM pay_periods
WHERE capture_opens_at <= (now() AT TIME ZONE 'America/New_York')::date
  AND sup_deadline     >= (now() AT TIME ZONE 'America/New_York')::date
ORDER BY pay_date;


-- ------------------------------------------------------------
-- 2) CAUSA A: ¿hay períodos cargados alrededor de hoy?
-- ------------------------------------------------------------
-- Muestra los 10 períodos más cercanos a la fecha actual.
-- Si no hay ninguno de agosto 2026, el calendario no está sembrado.
SELECT
  week_code,
  start_date,
  end_date,
  capture_opens_at,
  sup_deadline,
  owner_deadline,
  pay_date,
  status,
  (now() AT TIME ZONE 'America/New_York')::date AS hoy_ny,
  CASE
    WHEN capture_opens_at IS NULL THEN 'capture_opens_at NULL'
    WHEN sup_deadline     IS NULL THEN 'sup_deadline NULL -> ROMPE EL ENDPOINT (500)'
    WHEN (now() AT TIME ZONE 'America/New_York')::date < capture_opens_at THEN 'aun no abre'
    WHEN (now() AT TIME ZONE 'America/New_York')::date > sup_deadline     THEN 'ventana cerrada'
    ELSE 'ABIERTO para supervisor'
  END AS veredicto
FROM pay_periods
ORDER BY abs(pay_date - (now() AT TIME ZONE 'America/New_York')::date)
LIMIT 10;


-- ------------------------------------------------------------
-- 3) CAUSA B: ¿hay sup_deadline en NULL?
-- ------------------------------------------------------------
-- IMPORTANTE: si esto devuelve filas > 0, el código CRASHEA.
-- dateToDayNum(null) ejecuta null.split('-') -> TypeError -> 500.
-- No es que "no haya períodos": es que el endpoint revienta.
SELECT
  COUNT(*)                                        AS total_periodos,
  COUNT(*) FILTER (WHERE sup_deadline     IS NULL) AS sin_sup_deadline,
  COUNT(*) FILTER (WHERE capture_opens_at IS NULL) AS sin_capture_opens_at,
  COUNT(*) FILTER (WHERE owner_deadline   IS NULL) AS sin_owner_deadline
FROM pay_periods;


-- ------------------------------------------------------------
-- 4) CAUSA C: rango total del calendario cargado
-- ------------------------------------------------------------
-- ¿Hasta dónde llega el calendario? ¿Cubre agosto 2026?
SELECT
  COUNT(*)              AS periodos_totales,
  MIN(pay_date)         AS primer_pay_date,
  MAX(pay_date)         AS ultimo_pay_date,
  MIN(capture_opens_at) AS primera_apertura,
  MAX(sup_deadline)     AS ultimo_deadline_supervisor
FROM pay_periods;


-- ------------------------------------------------------------
-- 5) CONTRASTE: qué período elige el DASHBOARD (regla distinta)
-- ------------------------------------------------------------
-- El dashboard usa: (capture_opens_at || start_date) <= HOY <= pay_date
-- Ventana MÁS ANCHA que la de captura. Por eso el dashboard puede
-- mostrar un período mientras la pantalla de captura muestra cero.
SELECT
  week_code,
  COALESCE(capture_opens_at, start_date) AS abre_dashboard,
  pay_date                               AS cierra_dashboard,
  sup_deadline                           AS cierra_captura,
  'visible en dashboard' AS nota
FROM pay_periods
WHERE COALESCE(capture_opens_at, start_date) <= (now() AT TIME ZONE 'America/New_York')::date
  AND pay_date                              >= (now() AT TIME ZONE 'America/New_York')::date
ORDER BY pay_date;


-- ------------------------------------------------------------
-- 6) ¿Los supervisores tienen empleados activos asignados?
-- ------------------------------------------------------------
-- Aunque se arregle la ventana, sin assignments activos la pantalla
-- de captura sale vacía igual.
SELECT
  department,
  COUNT(*) FILTER (WHERE active)     AS activos,
  COUNT(*) FILTER (WHERE NOT active) AS inactivos
FROM assignments
WHERE department IN ('BA', 'CMHC', 'TCM', 'EMP')
GROUP BY department
ORDER BY department;
