# Manual de Usuario — ADMIN
## RutaPay · Plataforma de Microcréditos de Ruta

---

## ¿Qué puede hacer el ADMIN?

El ADMIN gestiona operativamente su negocio. Puede crear y administrar rutas, encargados, clientes, préstamos, pagos y tesorería. Solo ve los datos de su propio negocio.

---

## 1. Inicio de Sesión

1. Abre la app en tu dispositivo o navegador.
2. Ingresa tu **correo electrónico** o **número de documento** y tu **contraseña**.
3. Haz clic en **Ingresar**.

> Si la licencia de tu negocio está próxima a vencer (menos de 30 días), verás una alerta al ingresar.
> Si la licencia venció, no podrás iniciar sesión hasta que el SUPER_ADMIN la renueve.

---

## 2. Panel Principal (Overview)

Al ingresar verás el resumen de tu negocio:
- Cartera activa total (suma de todos los préstamos activos)
- Pagos registrados hoy
- Cuotas en mora
- Balance disponible para prestar

---

## 3. Gestión de Rutas

Una **ruta** es un territorio de cobro asignado a un encargado con un capital específico para prestar.

### 3.1 Ver rutas
- Ve al menú **Rutas**.
- Verás todas las rutas de tu negocio con nombre, encargado, balance y estado.

### 3.2 Crear una ruta
1. Haz clic en **Nueva ruta**.
2. Ingresa el nombre de la ruta.
3. Selecciona el encargado (debe tener rol ROUTE_MANAGER).
4. Haz clic en **Crear**.

> El encargado debe estar registrado previamente con rol ROUTE_MANAGER en tu negocio.

### 3.3 Editar una ruta
1. Abre la ruta desde la lista.
2. Haz clic en **Editar**.
3. Puedes cambiar el nombre o reasignar el encargado.

### 3.4 Asignar capital a una ruta
El capital es el dinero que el encargado tendrá disponible para prestar en su ruta.

1. Abre la ruta.
2. Haz clic en **Agregar saldo**.
3. Ingresa el monto en pesos colombianos.
4. Opcionalmente agrega una referencia (ej: "Aporte semana 15 abril").
5. Haz clic en **Confirmar**.

> Este movimiento queda registrado en el historial de la ruta con fecha y responsable.

### 3.5 Ver resumen de una ruta
Al abrir una ruta verás:
- Clientes vinculados
- Préstamos activos
- Cartera total (capital + intereses pendientes)
- Capital disponible para prestar
- Cuotas en mora
- Últimos 100 pagos registrados

---

## 4. Gestión de Clientes

### 4.1 Ver clientes
- Ve al menú **Clientes**.
- Puedes buscar por nombre, número de documento o correo electrónico.

### 4.2 Crear un cliente
1. Haz clic en **Nuevo cliente**.
2. Completa los datos: nombre completo, número de documento, teléfono, dirección (opcional), descripción (opcional).
3. Haz clic en **Crear cliente**.

### 4.3 Ver ficha del cliente
Al abrir un cliente verás:
- Información personal
- Préstamos activos y su estado
- Historial de pagos

### 4.4 Compartir link de registro
Si prefieres que el cliente se registre solo:
1. Abre la ruta a la que pertenecerá.
2. Copia el **link de registro** (incluye el `?routeId=...`).
3. Envíaselo al cliente por WhatsApp o mensaje de texto.
4. El cliente llena el formulario y queda vinculado automáticamente a esa ruta.

---

## 5. Gestión de Préstamos

### 5.1 Ver préstamos
- Ve al menú **Préstamos**.
- Puedes buscar por nombre del cliente, documento o ID del préstamo.
- Filtra por estado: ACTIVO, COMPLETADO, EN MORA, REESTRUCTURADO.

### 5.2 Crear un préstamo
1. Ve a **Préstamos → Nuevo préstamo**.
2. Selecciona la ruta y el cliente.
3. Ingresa los parámetros:
   - **Capital prestado** (en pesos, ej: 500000)
   - **Tasa de interés** (% mensual, ej: 20 para 20%)
   - **Número de cuotas** (ej: 4)
   - **Frecuencia de pago**: Diaria, Semanal, Quincenal o Mensual
   - **Fecha de inicio** del plan de pagos
   - **Excluir fines de semana** (solo aplica para frecuencia diaria)
4. La calculadora mostrará en tiempo real:
   - Valor de cada cuota
   - Total de intereses
   - Total a pagar
   - Fecha de último pago
5. Haz clic en **Crear préstamo**.

> El plan de pagos (cronograma de cuotas) se genera automáticamente.

### 5.3 Ver plan de pagos
1. Abre el préstamo.
2. En la sección **Plan de pagos** verás cada cuota con:
   - Número de cuota
   - Fecha de vencimiento
   - Monto base
   - Mora calculada al día de hoy (si aplica)
   - Total a cobrar
   - Estado (PENDIENTE / PAGADA / EN MORA / PARCIAL)

### 5.4 Editar términos de un préstamo
Solo es posible **antes de que se registre algún pago**.

1. Abre el préstamo.
2. Haz clic en **Editar términos**.
3. Ajusta tasa, número de cuotas o frecuencia.
4. Haz clic en **Guardar**.

> El plan de pagos se regenera completamente con los nuevos parámetros.

### 5.5 Cambiar estado de un préstamo
1. Abre el préstamo.
2. Haz clic en **Cambiar estado**.
3. Selecciona el nuevo estado: ACTIVO, COMPLETADO, EN MORA o REESTRUCTURADO.

### 5.6 Eliminar un préstamo
Solo es posible si el préstamo **no tiene pagos registrados**.
1. Abre el préstamo.
2. Haz clic en **Eliminar**.
3. Confirma la acción en el modal de confirmación.

---

## 6. Gestión de Pagos

### 6.1 Ver pagos
- Ve al menú **Pagos** para ver todos los pagos del negocio ordenados por fecha.

### 6.2 Revertir un pago
Si se registró un pago por error:
1. Busca el pago en la lista.
2. Haz clic en **Revertir**.
3. Ingresa el motivo de la reversión.
4. Confirma la acción.

> La reversión descuenta el pago del cronograma y devuelve la cuota a su estado anterior.
> Solo se pueden revertir pagos vinculados a una cuota del plan de pagos.

---

## 7. Tesorería y Liquidaciones

### 7.1 Ver liquidaciones del día
1. Ve al menú **Tesorería**.
2. Verás la tabla de todos los encargados de ruta con su liquidación del día actual.
3. Puedes cambiar la fecha para ver días anteriores.

Cada fila muestra:
- Nombre del encargado
- Capital cobrado en el día
- Capital prestado en el día
- Flujo neto del día (cobrado − prestado)
- Efectivo actual en ruta
- Disponible para prestar
- Estado de la liquidación: NO ENVIADA / ENVIADA / APROBADA / RECHAZADA

### 7.2 Aprobar una liquidación
1. Haz clic en el encargado cuya liquidación quieres revisar.
2. Revisa los números del detalle.
3. Haz clic en **Aprobar**.
4. Opcionalmente agrega una nota.
5. Confirma.

### 7.3 Rechazar una liquidación
1. Abre la liquidación del encargado.
2. Haz clic en **Rechazar**.
3. **Obligatorio:** ingresa el motivo del rechazo.
4. Confirma.

> El encargado verá el rechazo con tu nota y podrá corregir y reenviar.

---

## 8. Gestión de Usuarios

1. Ve al menú **Usuarios**.
2. Desde aquí puedes:
   - Ver todos los usuarios de tu negocio
   - Crear nuevos usuarios (ADMIN, ROUTE_MANAGER)
   - Activar o desactivar cuentas

---

## 9. Cierre de Sesión

- Haz clic en tu nombre (menú lateral o superior).
- Selecciona **Cerrar sesión**.

---

## Reglas de Mora para Informar a Clientes

| Días de retraso | Recargo |
|----------------|---------|
| 0 a 3 días | Sin recargo (período de gracia) |
| 4 a 15 días | 50% del interés de esa cuota |
| Más de 15 días | 100% del interés de esa cuota |

**Regla de gracia especial:** si el cliente paga una cuota vencida el mismo día o antes de que venza la siguiente cuota, se condona el recargo por mora.
