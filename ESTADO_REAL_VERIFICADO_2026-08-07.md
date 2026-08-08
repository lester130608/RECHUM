# Estado real del payroll — verificado contra el código, 2026-08-07

Este documento **reemplaza** lo que dice `memory.md` del proyecto, que está anclada al
commit `5db1b31` (3 de julio) y quedó desactualizada por dos commits.

Último commit real: `db429e8` (20 de julio). Working tree limpio.
Todo lo de abajo está verificado leyendo el código, no reportes.

---

## Ya está hecho (la memoria decía que faltaba)

| Ítem | Realidad | Dónde |
|---|---|---|
| **EMP / captura de oficina** | Ruta completa y paralela. Crea `pay_runs` con `area='EMP'`, guarda `payroll_inputs` con `department='EMP'`, maneja draft/submit, bloquea si el run ya está aprobado. No usa `areaCalculationRunner`. | `app/api/payroll/owner/office-capture/route.ts` |
| **1.5% de Edwina** | Implementado y **genérico**: rol `OUTREACH`, `base_reference='RBT_TOTAL'`, `percent` configurable. No hardcodeado. | `lib/owner-view.ts` → `calculateOutreachAmount` |
| **Semana extra por fila (cálculo)** | El modelo de datos ya es por empleado (`extra_week_active`, `extra_hours`) y el cálculo solo paga filas con horas > 0. | `app/api/payroll/tcm-calculation/route.ts:270` |
| **PSYQ desde el flujo del owner** | Pantalla del owner que dispara GET y POST del cálculo. | `app/payroll/owner/psyq-calculation/page.tsx` |
| **Export ADP** | Construido (`buildADPExport`, lee `pay_run_items`, exige `owner_approved`). *Pero ver bug crítico abajo.* | `app/api/payroll/runs/[id]/export/route.ts` |
| **Lock** | Construido (exige status `exported` + `exported_at`). *Pero ver bug crítico abajo.* | `app/api/payroll/runs/[id]/lock/route.ts` |

---

## BUG CRÍTICO no detectado antes: `params` síncrono en Next 15

El proyecto corre **Next 15.5.18**, donde `params` en un route handler es una **Promise**.

Seis rutas usan la firma vieja de Next 14 y leen `params.id` de forma síncrona:

```
app/api/payroll/runs/[id]/route.ts
app/api/payroll/runs/[id]/approve/route.ts
app/api/payroll/runs/[id]/calculate/route.ts
app/api/payroll/runs/[id]/export/route.ts
app/api/payroll/runs/[id]/lock/route.ts
app/api/payroll/runs/[id]/inputs/route.ts
```

Todas con:
```ts
{ params }: { params: { id: string } }   // ← firma Next 14
const payRunId = params.id;              // ← lectura síncrona de una Promise
```

Las rutas más nuevas sí lo hacen bien:
```ts
context: { params: Promise<{ pay_period_id: string }> }
const { pay_period_id } = await context.params;   // ← correcto
```
(`owner/consolidated`, `emp/[pay_period_id]`, `pay-config/*`)

**Impacto probable:** Next genera un validador de tipos de los route handlers
(`.next/types/validator.ts`), así que esto muy probablemente **rompe `npm run build`**.
En runtime, `params.id` sobre una Promise da `undefined`.

**Consecuencia práctica:** export y lock están escritos pero seguramente no funcionan.
Toda la familia `runs/[id]/*` está en duda — incluido `approve`.

**Confirmar con `npm run build`** antes de asumir nada. Es la verificación pendiente
desde el 20 de julio que nunca se corrió.

---

## Sigue faltando de verdad

### 1. Consolidación de las 4 áreas — NO EXISTE
`consolidated_run_areas` no aparece en **ningún** archivo `.ts` ni `.tsx`.
La tabla existe y la migración `0009` le puso políticas RLS.
`app/api/payroll/owner/period/route.ts:50` solo **lee** si hay un run consolidado.
**Nada lo escribe.** No hay ruta que tome las cuatro áreas en `owner_approved`
y arme el run `GENERAL` / `run_level='consolidated'`.

### 2. Ventana de períodos para supervisores
Fórmula en los tres routes de captura (`ba`, `cmhc`, `tcm`):
```js
supervisor ve el período  <=>  capture_opens_at <= HOY(NY) <= sup_deadline
owner ve TODOS (se salta el filtro)
```
Segundo portón en el POST: fuera de ventana → `403 "This period is not open for capture"`.

Dos problemas asociados:
- **`dateToDayNum` no protege contra null.** Si `sup_deadline` viene NULL,
  ejecuta `null.split('-')` → TypeError → **500**, no "sin períodos".
- **El dashboard usa otra regla, más ancha:** `(capture_opens_at || start_date) <= HOY <= pay_date`,
  con fallback al próximo período. Por eso el dashboard muestra un período
  y la pantalla de captura muestra cero. Hay que unificar.

Pendiente de datos: correr `DIAGNOSTICO_VENTANA_PERIODOS_2026-08-07.sql`.

### 3. Columna Role en TCM
BA tiene `<th>Role</th>` (`capture/ba/page.tsx:442`); TCM no.
Además la API de TCM ni siquiera trae el rol:
```js
// tcm/route.ts:86
.select('employee_id, employees(id, first_name, last_name)')   // falta 'role'
// ba/route.ts sí lo trae
```
Requiere cambio en **API + UI**, no solo UI.

### 4. Totales del dashboard son placeholder
`app/api/payroll/dashboard/route.ts` devuelve `total_placeholder: 'Pending'` hardcodeado.
Se renderiza en `dashboard/page.tsx:298` y `:339`. El dashboard nunca muestra totales reales.

### 5. Semana extra: el botón sigue siendo global
El cálculo ya es por fila, pero `showExtraWeek()` y `removeExtraWeek()`
(`capture/tcm/page.tsx:279-320`) recorren **todos** los empleados para mostrar/ocultar
la columna. Es cosmético, no afecta lo que se paga. Prioridad baja.

### 6. Migraciones sin aplicar en Supabase live
`0009`, `0010`, `0011`, `0012` — escritas en el repo, sin confirmar en la base.
Ver `DIAGNOSTICO_ESTADO_DB_2026-08-07.sql`.

### 7. Decisión pendiente de arquitectura
Siguen conviviendo dos generaciones: el flujo `runs/` y el flujo `owner/capture/period`.
`owner/approve` y `owner/export` devuelven **405 a propósito** (legacy read-only),
pero `runs/[id]/*` sigue activo y es donde viven export y lock.
Hay que decidir cuál es el oficial antes de construir la consolidación encima.

---

## Orden sugerido

1. **`npm run build`** — confirma o descarta el bug de `params`. Es lo más barato y lo que más cambia el plan.
2. **Diagnóstico SQL de la ventana** — desbloquea que los supervisores puedan probar.
3. **Diagnóstico SQL de migraciones** — desbloquea Save Draft.
4. Arreglar `params` en las 6 rutas si el build lo confirma.
5. Decidir flujo oficial (runs vs owner/period).
6. Construir la consolidación.
7. Validar cálculos por área contra tus números manuales.
8. Recién entonces: export + lock.
