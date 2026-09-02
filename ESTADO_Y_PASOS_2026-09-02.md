# Payroll DTT — Estado al 2 de septiembre

**Sustituye a:** `ESTADO_Y_PASOS_2026-09-01.md`

---

## El sistema completó su primer ciclo entero

**P-20260808 consolidado. Gran total $80.205,98 en las cuatro áreas.**

Capturar → calcular → aprobar → consolidar, con las cuatro áreas y con
supervisores reales. Eso no había ocurrido nunca.

BA calculó **$63.625,50** sobre 1.805,25 horas, sin errores, y los importes
cuadran con el Excel: Adria 88 h × 30, Aliska 26 h × 76 como BCBA, Cristina
16.25 h × 60. Los decimales entran bien y la corrección del rol de Aliska
se aplicó.

---

## Antes de dar el periodo por bueno

Falta la comprobación final, en `Owner → Review del periodo`:

1. **Cuadrar los $80.205,98 contra el Excel.**
2. **Edwina debe aparecer dos veces en el detalle** — sus horas de BA como
   BCBA y su 1,5% de outreach — **y sumada una sola vez** en el total por
   persona. Si sale una sola vez, falta algo.
3. **Su 1,5% ya no debe ser cero**, porque BA está calculado.

---

## La causa raíz que se encontró hoy

El `Failed to save pay item` que arrastrábamos desde ayer:

```sql
CREATE POLICY "Owner admin can manage pay run items" ON pay_run_items
FOR ALL USING (current_user_has_any_role(ARRAY['owner', 'admin']))
```

**Solo owner y admin pueden escribir importes.** El submit del supervisor
disparaba el cálculo, que intentaba guardar en `pay_run_items`, y la base lo
rechazaba. Como el estado se escribía *antes* de esa llamada, el área quedaba
marcada como enviada con cero importes detrás.

Eso explica toda la cadena: el 500 genérico, que BA quedara sin items tras el
submit de Eileen, y que sí tuviera 38 al calcularlo el owner.

**Arreglo:** el submit ya no calcula. El supervisor entrega horas, el owner
calcula y aprueba. Además de cerrar el fallo es mejor reparto: nadie escribe
dinero sin que el owner lo haya revisado.

---

## Todo lo que se cerró hoy

| | |
|---|---|
| Submit del supervisor | Ya no dispara el cálculo. Causa raíz resuelta |
| Alta de empleados | Fallaba por `'hourly'` en minúsculas contra un CHECK que exige `'HOURLY'` |
| Permiso de supervisores | Migración 0017: `create_payroll_employee`, sin abrir la nómina consolidada |
| Captura de EMP | Era inalcanzable tras un envío. Ahora solo bloquea si está aprobada |
| Fijos de EMP | El número capturado multiplica: Yeline 2 × 550, Ripoll 2 × 1000, Oscar 1 × 850, Gayol 1 × 1500 |
| Cero silencioso de Edwina | Una base de 0 ahora es error, no importe válido |
| Periodo por defecto | Era el más lejano en el futuro. Ahora el actual, con desempate por fecha de pago |
| Corrección tras envío | El owner puede editar y reenviar mientras el área no esté aprobada |
| Mensajes de error | Las capturas devuelven el error real, no un 500 genérico |
| Enlace al reporte | Añadido en `owner/period`, que es donde se acaba tras consolidar |
| Residuos de pruebas | Limpiados los de agosto. P-20260725 intacto |

---

## Pendientes

### De interfaz, anotados hoy

- **La pantalla de CMHC va cargada de números.** Ocho servicios × dos líneas
  por persona, casi todos cero. Propuesta: ocultar las columnas que estén a
  cero en todas las filas, y una sola línea por celda (`3 × 45,00 = 135,00`).
- **Aprobar un área sin importes calculados debería ser imposible.** Hoy se
  puede, y deja al owner atrapado: una vez aprobada, no se puede recalcular.
- El alta de empleados **siempre crea W2**, no pregunta el tipo.

### De fondo

| | |
|---|---|
| **Rotar `SUPABASE_SERVICE_ROLE_KEY`** | Sigue pendiente. Salta todas las RLS |
| Borrar el proyecto muerto de Vercel | Apunta a `payroll0304`, un esqueleto de abril de 2025 |
| Borrar el archivo `main` de la raíz | Basura, `git rm main` |
| Migración de línea base | 40 tablas en la base, 11 en las migraciones |
| Export a ADP | Sin cablear. El reporte por persona lo suple para rellenar a mano |

---

## Lo que se aprendió

Cinco fallos reales en dos sesiones, y **ninguno era visible leyendo el
código**: un permiso de base de datos, una letra minúscula contra un CHECK,
una pantalla sin marcha atrás, un selector que abría en el periodo equivocado,
y dos errores de datos que solo salieron al cruzar con el Excel.

Los tres primeros llevaban meses ahí. Aparecieron en cuanto alguien se sentó a
usar el sistema con una cuenta de supervisor real y una hoja de cálculo al lado.

La regla que lo hizo posible sigue valiendo para el próximo periodo:
**código presente + cuadrado contra cálculo manual + probado bajo el rol que
lo va a usar.**
