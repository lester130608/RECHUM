# Plan de prueba del flujo de payroll — 2026-08-07

## Resumen: sí puedes probar, pero NO un payroll completo todavía

Se puede probar el ciclo **por área** (captura → cálculo → aprobación) en BA, CMHC y TCM.
NO se puede cerrar un payroll completo porque **la consolidación de las 4 áreas no está construida**
en el flujo activo.

---

## Qué está construido y es probable hoy

| Paso | Ruta | Estado |
|---|---|---|
| Crear/ver período | `app/payroll/owner/period` | Construido |
| Gestión de empleados | `app/payroll/employees` | Construido (arreglado 07-20) |
| Captura BA | `app/payroll/capture/ba` | Construido + fracciones arregladas |
| Captura CMHC | `app/payroll/capture/cmhc` | Construido (unidades enteras, intencional) |
| Captura TCM | `app/payroll/capture/tcm` | Construido, **sin** semana extra por fila |
| Captura EMP (oficina) | `app/payroll/owner/office-capture` | Pantalla construida |
| Cálculo por área | `lib/payroll/areaCalculationRunner.ts` | Solo **BA, CMHC, TCM** |
| Revisión del owner | `app/payroll/owner/review/[pay_period_id]` | Construido |

## Qué NO existe todavía (no lo busques, no falla: no está)

- **Consolidación de las 4 áreas** en el flujo activo. La ruta
  `app/api/payroll/owner/consolidated/[pay_period_id]` es de la **generación anterior**:
  lee `payroll_ba_entries` y `pay_role_configs`, no el flujo `pay_runs`/`payroll_inputs` actual.
- **Cálculo de EMP** dentro de `areaCalculationRunner` (el tipo `CalculableArea` es
  `'BA' | 'CMHC' | 'TCM'`). Es decir: **el 1.5% de Edwina tampoco está implementado.**
- **Semana extra por fila individual** en TCM (el encargo sigue sin enviarse a Codex).
- **Export ADP + lock** en el flujo activo. Lo que hay (`api/payroll/runs/[id]/export`,
  `/lock`) pertenece a la generación "runs".
- La aprobación legacy `api/payroll/owner/approve` devuelve **405 a propósito**.

---

## BLOQUEO: hay que aplicar migraciones antes de probar

Las migraciones **0009, 0010, 0011 y 0012** están escritas en el repo pero
(según el estado del proyecto) **no aplicadas en Supabase live**.

Consecuencia directa: **la prueba se cae en el primer paso.**

| Migración | Si NO está aplicada... |
|---|---|
| `0010` | El CHECK de `payroll_inputs.status` rechaza `'draft'` y `'review_ready'` → **Save Draft falla** |
| `0011` | `submitted_at` es NOT NULL y un borrador lo deja NULL → **"Failed to save input"** |
| `0012` | Solo `owner` tiene `manage_assignments` → **supervisor no puede editar/pausar/quitar empleados** |
| `0009` | El CHECK de `pay_runs.area` no acepta `'EMP'` → **no se puede crear el run de EMP** |

**Orden correcto: diagnosticar → aplicar → probar.**
Probar antes solo re-descubre bugs que ya conocemos y ensucia la base con datos a medias.

---

## Secuencia recomendada

### Paso 1 — Diagnóstico (solo lectura, ~10 segundos)
Correr `DIAGNOSTICO_ESTADO_DB_2026-08-07.sql` en Supabase → SQL Editor.
Mandarme los 6 resultados. Con eso sabemos exactamente qué falta.

### Paso 2 — Aplicar solo lo que falte
Según el diagnóstico, se aplican en orden `0009 → 0010 → 0011 → 0012`.
Las cuatro son aditivas y seguras (no borran datos), pero conviene aplicar
solo las que el diagnóstico marque como FALTA.

### Paso 3 — Limpiar datos de prueba
Si el chequeo 5 devuelve filas con `department = 'PSYQ'`, borrarlas antes del E2E.

### Paso 4 — `npm run build`
No consta que se haya corrido después del commit `db429e8` del 20 de julio.
Conviene confirmar que compila antes de probar en el navegador.

### Paso 5 — Recién ahí, la prueba

Usar **un período dedicado de prueba**, no un período real. La base es la live.

**Como supervisor (el caso que estaba roto):**
1. Empleados: crear uno, editarlo, pausarlo, reactivarlo, quitarlo (soft delete)
2. Captura BA: meter **14.75 h** — verificar que acepta el decimal y que se ve al teclear "14."
3. **Save Draft** — este es EL test que valida 0010 + 0011
4. Salir, volver a entrar: el borrador debe estar ahí
5. Submit → el estado pasa a `review_ready`

**Como owner:**
6. Revisar el área, comparar el cálculo contra tus números manuales
7. Aprobar el área
8. Repetir 2-7 para CMHC y TCM

**Qué anotar mientras pruebas:** en qué pantalla, qué hiciste, qué esperabas y qué pasó.
Con eso armo los encargos para Codex.

---

## Validación de cálculos

Antes de construir la consolidación conviene validar cada motor de área
(BA, CMHC, TCM) contra tus cálculos manuales de un período real que ya conozcas.
Si los motores están bien, la consolidación es suma; si están mal, la consolidación
propaga el error y cuesta mucho más encontrarlo — sobre todo después del lock de ADP.
