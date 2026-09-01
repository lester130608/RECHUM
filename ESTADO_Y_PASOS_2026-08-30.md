# Payroll DTT — Estado y pasos pendientes

**Fecha:** 30 de agosto de 2026
**Sustituye a:** `ESTADO_REAL_VERIFICADO_2026-08-07.md`
**Contexto:** necesitas usar el payroll esta semana. Este documento está ordenado por eso.

---

## Respuesta corta: ¿puedes usarlo esta semana?

**Parcialmente.** La cadena de captura funciona de punta a punta para tres áreas. Lo que **no** tiene camino es sacar los datos hacia ADP.

| Paso del flujo | Estado |
|---|---|
| Captura BA / CMHC / TCM | Funciona |
| Cálculo por área | Funciona |
| Aprobación del owner | Funciona |
| Consolidación de áreas | Funciona, pero suma 3 de 4 |
| Captura EMP / oficina | Guarda, pero **no calcula** |
| **Export a ADP** | **Sin botón en ninguna pantalla** |
| **Lock** | **Sin botón en ninguna pantalla** |

Las rutas de export y lock están escritas (`app/api/payroll/owner/export`, `app/api/payroll/runs/[id]/export`, `.../lock`), pero **ninguna pantalla viva las llama**. El único botón de lock que existe está en `app/payroll/runs/[id]/page.tsx`, que es una página muerta que nadie enlaza.

**Traducción práctica:** esta semana puedes capturar y aprobar dentro del sistema, pero el traspaso a ADP habrá que hacerlo a mano, como hasta ahora.

---

## Lo que quedó cerrado hoy

### Base de datos
Migraciones **0009 a 0015 aplicadas y verificadas**.

- `0009`–`0013` — EMP como área de primera clase, CHECK de `status` con `draft`, `submitted_at` nullable, permisos de supervisor sobre `assignments`, `department='EMP'`.
- `0014` — `pay_role_configs` y `pay_role_rates` incorporadas al historial. Las tablas **ya existían** en la base pero no en las migraciones. Añade constraints, índice único, triggers y RLS.
- `0015` — restringe la lectura de tarifas a `owner, admin, hr`. La 0014 se las había abierto a supervisores por copiar el patrón de `pay_runs`.

### Código
- **Next 15:** las 6 rutas `runs/[id]/*` corregidas a la firma `params: Promise<...>` (10 firmas en total). Esto es lo que rompía el build.
- **Typecheck:** de 81 errores a 43. **Cero en el payroll vivo.** Los 43 restantes son legado HR y nextauth.
- `backup-nextauth` y los `_backup` excluidos del tsconfig. Añadido script `npm run typecheck`.
- `lucide-react` instalado (faltaba en `package.json`).
- `lib/supabase.ts` estaba enteramente comentado y 22 archivos lo importaban. Ahora es un re-export de `supabaseClient`.

### El cero silencioso de Edwina — arreglado en su raíz

`calculateOutreachAmount` leía de `payroll_ba_entries`, tabla que **no existe**. Todos sus caminos de error hacían `return 0`, así que su 1.5% salía en **$0.00 sin ningún aviso**.

Verificado contra la base: **sus datos siempre estuvieron bien** (`OUTREACH / W2 / activa`, `PERCENT = 1.5`, base `RBT_TOTAL`). El fallo era enteramente del código de lectura.

Ahora lee de `pay_run_items` + `assignments.role='RBT'` en departamento BA — la misma fuente que ven los supervisores al capturar. Efecto secundario deseable: **es reactivo por construcción**. Si se edita un RBT después de aprobar, el porcentaje se recalcula solo.

Además, `baSubmitted` leía `payroll_module_status` (0 filas, nadie la escribe), así que estaba clavado en `false` y bloqueaba el cálculo de forma permanente. Corregido.

**Se eliminó en toda la cadena el patrón "tabla no existe → devuelve 0".** Ahora lanza, y la pantalla EMP muestra "No calculado" con el motivo en lugar de `$0.00`.

### Confirmado que ya funcionaba
- **Semana extra de TCM:** ya era por fila (`extra_week_active` por empleado). El encargo que quedó sin enviar a Codex ya no hace falta.
- **`runs` vs `owner/period`:** no son flujos rivales, son dos capas. `runs/[id]/approve` y `runs/context` están vivas y las usan todas las pantallas del owner.

---

## Pasos pendientes, en orden

### 1. Correr el build — TÚ, 1 comando

```bash
cd ~/payroll-0304 && npm run build
```

Lleva sin verificarse desde el 20 de julio. Debería pasar ahora: lo que lo rompía era el validador de rutas de Next 15. Si falla, guarda la salida completa.

### 2. Rotar la `SUPABASE_SERVICE_ROLE_KEY` — TÚ

Está en `.env.local`, que viajó dentro del ZIP que revisó el asesor externo. Esa clave **salta todas las RLS**, incluida la 0015 que acabamos de aplicar. Panel de Supabase → Settings → API → rotar.

### 3. Motor de cálculo de EMP — YO

No existe `emp-calculation`. Las otras cuatro áreas tienen la suya y todas escriben `pay_run_items`; `office-capture` solo guarda la captura cruda en `payroll_inputs`.

Consecuencia: **EMP aporta $0.00 al consolidado.** La consolidación de cuatro áreas suma tres y un cero.

Es lo único que falta para que las cuatro áreas produzcan números.

### 4. Cablear Export y Lock — YO

Las rutas existen; falta el disparador en `owner/period`. Sin esto no hay salida hacia ADP dentro del sistema.

**Orden importante:** el lock hace muy caro descubrir un error tarde. Va **después** de la validación numérica, nunca antes.

### 5. Validación numérica área por área — TÚ Y YO

Cuadrar BA, CMHC, TCM y EMP **por separado** contra tus cálculos manuales, antes del E2E completo. Incluye el 1.5% de Edwina y la semana extra de TCM.

Regla que fijaste y que conviene respetar aquí:

> Terminado = código presente **+** cuadrado contra cálculo manual **+** probado en DB real **bajo el rol que lo va a usar**.

Lo último importa: el patrón de fallos de julio fue que el owner guardaba y el supervisor no. Validar con tu cuenta de owner no ejercita las RLS.

### 6. E2E completo

Employee → Payroll Run → Inputs → Calculate → Approve → Consolidate → Export → Lock.

### 7. Limpiar datos de prueba

Quedan filas de `payroll_inputs` con `department='PSYQ'` de pruebas anteriores. Contaminan la consolidación. Nunca llegamos a comprobarlo.

### 8. Migración de línea base — deuda de fondo

**Tu base tiene 40 tablas. Las migraciones describen 11.** Veintinueve viven fuera del historial.

Eso ya nos hizo fallar dos veces hoy: di por inexistentes `pay_role_configs` y `payroll_module_status`, y ambas existían. Mientras siga así, cualquier análisis hecho leyendo solo el repositorio va a fallar igual.

Propuesta: generar una migración de línea base que capture el esquema real tal como está hoy. No cambia nada; solo hace que repo y base cuenten la misma historia.

Huérfanas detectadas, sin una sola referencia en el código:

| Tabla | Filas | Qué hacer |
|---|---|---|
| `payroll_runs` (plural) | 0 | Borrable |
| `payroll_weeks` | 20 | Revisar antes de tocar |
| `timesheet_entries` | 9 | Revisar antes de tocar |
| `payroll_audit_log` | 109 | **Conservar** — hay historia |
| `payroll_module_status` | 0 | Borrable |

---

## Dos cosas que salieron de los datos y afectan al export

**Solo 7 empleados tienen `pay_role_config`, y hay 11 runs de área.** Quien no la tenga aparece en la consolidada con el rol por defecto de su área y `tax_type = 'W2'`. Para ADP eso importa: **un 1099 sin config se trataría como W2.** Hay dos configs 1099 activas (BCBA y TCM), así que el caso es real. Se dan de alta desde `/admin/pay-configuration/[employee_id]`, que empieza a funcionar con la 0014.

**Hay una sola config activa con rol RBT.** El cálculo del 1.5% lee los RBT de `assignments`, que es de donde leen las pantallas de captura, así que funciona. Pero si `assignments` tiene varios RBT y `pay_role_configs` solo uno, son dos fuentes que ya discrepan. Merece una mirada antes de cuadrar el número contra tu cálculo manual.

---

## Archivos de apoyo generados hoy

| Archivo | Para qué |
|---|---|
| `supabase/migrations/0014_pay_role_configs.sql` | Aplicada |
| `supabase/migrations/0015_restrict_pay_rate_visibility.sql` | Aplicada |
| `VERIFICAR_ESTADO_DB_2026-08-30.sql` | Reverificar el estado de la base cuando haga falta |
| `DIAGNOSTICO_TABLAS_HUERFANAS_2026-08-30.sql` | Diagnóstico de tablas fuera del historial |
| `CONFIRMAR_0014.sql` | Comprobación de políticas RLS |

**Nota sobre el editor SQL de Supabase:** solo devuelve el resultado del **último** `SELECT` cuando se corren varios. Los scripts de diagnóstico están escritos como una sola consulta con `UNION ALL` por eso.

---

## Mañana, en una línea

Corre el build y mándame la salida. Si pasa, ataco el motor de EMP y el cableado del export, que es lo que te falta para cerrar un ciclo completo dentro del sistema.
