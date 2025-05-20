#!/bin/bash

# Asegura que la carpeta destino existe
mkdir -p components/Payroll

# Mover los archivos si existen
mv -v components/PayrollForm.tsx components/Payroll/ 2>/dev/null
mv -v components/PayrollFormBAse.tsx components/Payroll/ 2>/dev/null
mv -v components/TCMPayrollForm.tsx components/Payroll/ 2>/dev/null
mv -v components/PayrollTable.tsx components/Payroll/ 2>/dev/null

echo "✅ Componentes movidos a components/Payroll/"
