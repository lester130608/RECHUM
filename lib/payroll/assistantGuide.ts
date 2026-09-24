// lib/payroll/assistantGuide.ts
//
// Como se usa la aplicacion, en palabras. El asistente lo lee para poder
// explicarle a un supervisor donde esta cada cosa sin que tenga que
// escribirle al owner.
//
// Si una pantalla cambia de sitio, hay que actualizar este archivo: el
// modelo no navega la app, solo sabe lo que aqui se le cuente.

export const GUIA_SUPERVISOR = `
COMO SE USA LA APP (supervisor)

Menu lateral: Dashboard, Run payroll, Employees, History.

CAPTURAR HORAS
1. "Run payroll" abre directamente la captura del area que supervisas.
2. Arriba se elige el periodo. Solo aparecen los periodos abiertos: desde que
   abre la captura hasta tu fecha limite. Si no ves el periodo que buscas, es
   que todavia no ha abierto o que ya paso su fecha limite.
3. Se escriben las horas o unidades por persona. BA admite decimales (14.75).
   CMHC va en unidades enteras por servicio. TCM en horas, con su columna de
   semana extra cuando toca.
4. "Save draft" guarda sin enviar; puedes volver mas tarde.
5. "Submit" lo manda al owner. Enviar NO calcula dinero: el owner calcula y
   aprueba despues.

CORREGIR DESPUES DE ENVIAR
Mientras el owner no haya aprobado el area, se puede volver a entrar, cambiar
y reenviar. Si ya esta aprobada, la pantalla no deja tocarla: hay que pedirselo
al owner.

EMPLEADOS
"Employees" lista la gente de tu area. Puedes dar de alta, editar, pausar y
quitar (quitar desactiva, no borra el historial). Las tarifas no se ven ni se
editan: eso es del owner.

HISTORY
Los periodos de tu area, con personas y horas. Sin importes.

FECHAS
Cada periodo tiene una fecha en la que abre la captura y una fecha limite de
supervisor. Fuera de esa ventana la app no deja guardar, y devuelve "This
period is not open for capture".

LO QUE UN SUPERVISOR NO VE
Ningun importe, ninguna tarifa, y ninguna area que no sea la suya. No es un
fallo de la pantalla: es como esta disenado el sistema.
`;

export const GUIA_OWNER = `
COMO SE USA LA APP (owner)

Menu lateral: Dashboard, Run payroll, Employees, History, Settings.

EL CICLO DE UN PERIODO
1. Los supervisores capturan y envian su area (BA, CMHC, TCM).
2. EMP lo capturas tu en "Run payroll" -> Office capture.
3. Calculas cada area en su pantalla de calculo y guardas el resultado.
4. Apruebas cada area. Aprobar no calcula: si un area no tiene importes
   calculados, la app se niega a aprobarla.
5. Con las cuatro aprobadas, "Consolidate areas".
6. "Ver reporte por persona" da el total por empleado, que es lo que se teclea
   en ADP. El export automatico a ADP todavia no esta conectado.

ORDEN QUE IMPORTA
BA se calcula antes que EMP. El 1,5% de Edwina se saca del bruto de los RBT de
BA, asi que sin BA calculada ese importe no se puede sacar.

SI TE EQUIVOCAS AL APROBAR
Una vez aprobada, un area no se puede recalcular desde la interfaz. Hoy eso se
arregla con SQL en Supabase.

HISTORY
Todos los periodos con su total, el desglose por area y un enlace al reporte de
cada uno.

FICHA DEL EMPLEADO
En "Employees", el nombre de cada persona abre su ficha: areas, roles, tarifas,
acumulado del anio e historial de pagos periodo a periodo.
`;
