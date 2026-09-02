# Payroll DTT — Estado al cierre del 1 de septiembre

**Sustituye a:** `ESTADO_Y_PASOS_2026-08-30.md`
**Último commit:** `a6b9893`

---

## Lo primero mañana

**El cálculo de BA nunca se ha ejecutado y no sabemos por qué.** Todo lo demás depende de resolver eso.

Tres pasos, en orden:

1. **Correr `DESBLOQUEAR_CAPTURA_BA.sql`** en Supabase. Devuelve BA a borrador y corrige el rol de Aliska.
2. **Verificar que Vercel desplegó `a6b9893`** (el owner ya puede editar capturas enviadas).
3. **Volver a darle a Submit en BA.** Ahora la pantalla muestra el error real en vez de "Internal server error". **Ese mensaje es lo que hace falta para arreglarlo.**

---

## El fallo principal, explicado

La ruta de captura hace esto al enviar:

```
1. Guarda payroll_inputs con status = 'review_ready'   ✓ se escribe
2. Pone pay_runs en 'review_ready'                     ✓ se escribe
3. Llama a calculateAndSaveArea()                      ✗ revienta
4. catch → devuelve 500
```

**No hay transacción.** Los pasos 1 y 2 quedan escritos aunque el 3 falle, así que la base dice "enviada" cuando en realidad no se calculó nada. Al recargar, el banner dice "submitted" y parece que funcionó.

Confirmado con datos: los tres runs del periodo están en `review_ready` y los tres tienen **0 items calculados**.

Además del error concreto, **esto hay que arreglarlo de fondo**: o los tres pasos van en una transacción, o el estado no se escribe hasta que el cálculo termine bien. Un estado que miente sobre el dinero es peor que un error.

---

## Estado del periodo P-20260808

| Área | Run creado | Estado | Items | Realidad |
|---|---|---|---|---|
| BA | hoy 02:03 | review_ready | **0** | capturado hoy, sin calcular |
| CMHC | **27 ago** | review_ready | **0** | residuo de pruebas |
| EMP | **19 ago** | review_ready | **0** | residuo de pruebas |
| TCM | — | not started | — | sin empezar |

**CMHC y EMP son residuos de sesiones anteriores.** Hay que limpiarlos antes de consolidar: si se consolida con ellos dentro, el total sale mal y sin explicación aparente.

**Y hay más residuos en otros periodos.** En `P-20261212` (diciembre) EMP figura
como **`owner_approved`**. Ese es peor que los de agosto: el sistema bloquea el
recálculo de un área aprobada, así que si algún día se trabaja ese periodo habrá
que desaprobarlo primero. La limpieza tiene que barrer todos los periodos, no
solo el de agosto.

### Incoherencias de datos pendientes

- **Payload de BA: 36 personas. Plantilla activa: 38.** Dos sin entrada.
- **La pantalla del owner dice 52 trabajadores en BA.** Los activos son 38. Ese contador sale de otro sitio y está mal.
- **Dianeya Ramirez: 0 horas en la app, 60.00 en el Excel.** Se creó pero no se capturó.
- **Dennis Gonzalez y Kenia Vega** aparecen con 0 y no están en el Excel. Si ya no trabajan, desactivarlos.
- **Los 5 empleados nuevos no tienen tarifa.** Bloquearán el cálculo cuando llegue el momento: Adria, Aliska (BCBA), Dianeya, Sol Irvine-Cabrera, Ysmary.

---

## Lo que sí se cerró hoy

**Los dos bugs de julio, verificados con un supervisor real.**

- **Save Draft funciona.** La causa era el CHECK de `payroll_inputs.status`, que no aceptaba `'draft'`. Lo arregló la migración 0010.
- **Los supervisores pueden dar de alta empleados.** Eran dos fallos superpuestos: la ruta insertaba `adp_pay_mode: 'hourly'` en minúsculas contra un CHECK que exige `'HOURLY'` (fallaba para todos, incluido el owner), y a los supervisores les faltaba permiso sobre `employees`. La migración 0017 les da `create_payroll_employee`, deliberadamente **sin** `manage_employees`, que habría abierto la nómina consolidada.

**Otras correcciones desplegadas:**
- El owner puede corregir una captura ya enviada mientras el área no esté aprobada.
- Las capturas devuelven el error real en vez de un 500 genérico.
- Adria Vargas Gonzales tenía registro de empleada sin asignación. Arreglado.
- **El periodo por defecto es ahora el actual.** Las pantallas cogían `periods[0]`
  de una lista ordenada por `pay_date` descendente, o sea el más lejano en el
  futuro: el 1 de septiembre ofrecían el periodo del 12 al 25 de diciembre.
  Capturar en el periodo equivocado es fácil de hacer y difícil de ver. La
  lógica correcta ya existía en el dashboard; ahora está en
  `lib/payroll/periods.ts` y la usan las nueve pantallas.

**Verificado contra el Excel:** los importes de BA cuadran uno a uno, decimales incluidos (Lesvia 124.25, Cristina 16.25, Debora 24.75, Edwina 83.5).

---

## Lo que sigue sin comprobarse

**Ni un solo cálculo.** Las cinco áreas tienen motor y pantalla, pero **ninguna ha producido un importe todavía**. EMP en particular no se ha ejecutado nunca.

Sin eso no sabemos si Yeline sale con sus 1100, si los psiquiatras salen con su fijo, ni si Edwina sale con su 1,5% real.

---

## Pendientes de fondo

| | |
|---|---|
| **Rotar `SUPABASE_SERVICE_ROLE_KEY`** | Sigue en `.env.local`, que viajó en el ZIP. Salta todas las RLS. |
| Borrar el proyecto muerto de Vercel | Apunta a `payroll0304`, un esqueleto de abril de 2025. Manda correos de fallo y confunde los logs. |
| Limpiar filas de prueba `department='PSYQ'` | |
| Borrar el archivo `main` de la raíz | Basura, hace que git se queje de ambigüedad. |
| Migración de línea base | 40 tablas en la base, 11 en las migraciones. |
| El alta de empleados siempre crea W2 | No pregunta el tipo. Gabriela y Oscar son 1099. |

---

## Archivos de hoy

| Archivo | Para qué |
|---|---|
| `DESBLOQUEAR_CAPTURA_BA.sql` | **Correr primero mañana** |
| `DIAGNOSTICO_PERIODO_P20260808.sql` | Ver el estado real de un periodo |
| `DIAGNOSTICO_RLS_EMPLOYEES.sql` | Diagnóstico de permisos |
| `ARREGLAR_ADRIA_HUERFANA.sql` | Ya aplicado |
| `supabase/migrations/0017_*.sql` | Ya aplicada |

---

## Una nota sobre el método

Cuatro fallos reales encontrados hoy, y **ninguno era visible leyendo el código**: una letra minúscula contra un CHECK, un permiso que cubría una de las dos tablas que toca la operación, una pantalla sin marcha atrás, y dos errores de datos que solo salieron al cruzar con el Excel.

Los tres primeros llevaban meses ahí. Aparecieron en la primera sesión en que alguien se sentó a usarlo con una cuenta de supervisor real.

Merece la pena repetirlo mañana con cada área.
