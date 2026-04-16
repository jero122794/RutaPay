# Manual de Usuario — ROUTE_MANAGER (Encargado de Ruta)
## RutaPay · Plataforma de Microcréditos de Ruta

---

## ¿Qué puede hacer el Encargado de Ruta?

El encargado es el responsable directo del cobro en calle. Desde RutaPay puede registrar clientes, crear préstamos, cobrar cuotas y rendir cuentas diariamente al administrador mediante la liquidación.

Solo tiene acceso a los datos de **sus propias rutas**.

---

## 1. Inicio de Sesión

1. Abre la app en tu celular o desde el navegador.
2. Ingresa tu **correo electrónico** o **número de documento** y tu **contraseña**.
3. Haz clic en **Ingresar**.

> La app funciona como una aplicación instalada en tu celular (sin necesidad de ir a la tienda de apps). Si es la primera vez, tu navegador te ofrecerá "Instalar en pantalla de inicio".

---

## 2. Panel Principal (Overview)

Al ingresar verás el resumen de tu ruta:
- Cuotas pendientes para hoy
- Pagos cobrados hoy
- Cuotas en mora
- Balance disponible para prestar

---

## 3. Mis Rutas

### 3.1 Ver mis rutas
- Ve al menú **Rutas**.
- Verás solo las rutas que te están asignadas.

### 3.2 Ver resumen de una ruta
Al abrir una ruta verás:
- Número de clientes
- Préstamos activos
- Capital disponible para prestar
- Cartera total (lo que te deben en total)
- Cuotas vencidas sin pagar
- Últimos pagos registrados

---

## 4. Gestión de Clientes

### 4.1 Ver clientes
- Ve al menú **Clientes**.
- Solo verás los clientes vinculados a tus rutas.
- Puedes buscar por nombre, documento o correo.

### 4.2 Registrar un cliente nuevo

**Opción A — Registrarlo tú directamente:**
1. Ve a **Clientes → Nuevo cliente**.
2. Ingresa los datos: nombre, documento, teléfono, dirección.
3. Selecciona la ruta a la que pertenece.
4. Haz clic en **Crear cliente**.

**Opción B — El cliente se registra solo (enlace de registro):**
1. Abre la ruta correspondiente.
2. Copia el **link de registro** que aparece en la parte superior.
3. Envíaselo al cliente por WhatsApp o mensaje de texto.
4. El cliente llena el formulario y queda vinculado a tu ruta automáticamente.

### 4.3 Ver ficha del cliente
Al abrir un cliente verás:
- Sus datos personales
- Sus préstamos activos con estado y próxima cuota
- Historial de pagos

---

## 5. Préstamos

### 5.1 Ver préstamos
- Ve al menú **Préstamos**.
- Solo verás los préstamos de tus clientes en tus rutas.

### 5.2 Crear un préstamo nuevo
1. Ve a **Préstamos → Nuevo préstamo**.
2. Selecciona la ruta y el cliente.
3. Configura el préstamo:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| Capital | Dinero que le prestas | $500.000 |
| Tasa de interés | % mensual | 20 (= 20% mensual) |
| Número de cuotas | Cuántos pagos hará | 4 |
| Frecuencia | Cada cuánto paga | Semanal |
| Fecha de inicio | Cuándo empieza a pagar | 17/04/2026 |

4. La pantalla te mostrará automáticamente:
   - Cuánto paga en cada cuota
   - Total de intereses que pagarás
   - Total a devolver
   - Fecha del último pago
5. Haz clic en **Crear préstamo**.

> Antes de crear, verifica que tu ruta tenga saldo suficiente para cubrir el capital prestado.

### 5.3 Ver plan de cuotas de un préstamo
1. Abre el préstamo.
2. En la sección **Plan de pagos** verás la tabla de cuotas:
   - Número de cuota
   - Fecha límite de pago
   - Monto a cobrar
   - Mora si aplica (calculada al día de hoy)
   - Total a cobrar esa cuota
   - Estado: PENDIENTE / PAGADA / EN MORA / PARCIAL

---

## 6. Registro de Pagos

### 6.1 Registrar un pago desde el préstamo
1. Abre el préstamo del cliente.
2. En la sección **Plan de pagos**, selecciona la cuota que va a pagar.
3. Haz clic en **Registrar pago**.
4. Ingresa el monto que el cliente te entrega.
5. Selecciona el método: **Efectivo** o **Transferencia**.
6. Opcionalmente agrega una nota.
7. Haz clic en **Confirmar pago**.

> **Importante:** si el cliente debe cuotas anteriores vencidas, el sistema aplicará el pago primero a las más antiguas (FIFO). Así se garantiza que no queden deudas acumuladas sin cubrir.

### 6.2 ¿Cuánto cobrar si hay mora?

El sistema calcula automáticamente la mora cuando abres el plan de pagos. Usa estos rangos:

| Días de retraso desde el vencimiento | Recargo |
|--------------------------------------|---------|
| 0 a 3 días | Sin recargo — período de gracia |
| 4 a 15 días | +50% del interés de esa cuota |
| Más de 15 días | +100% del interés de esa cuota |

**Ejemplo:**
- Cuota de $150.000 (interés = $50.000, capital = $100.000)
- 8 días de retraso → mora = 50% de $50.000 = $25.000
- Total a cobrar: **$175.000**

**Regla de gracia:** si el cliente trae cuotas vencidas pero las paga antes o el mismo día que vence la siguiente cuota, el sistema **condona la mora**. Esto refleja el acuerdo habitual de ruta.

### 6.3 Ver historial de pagos
- Ve al menú **Pagos** para ver todos los pagos que has registrado.

---

## 7. Liquidación Diaria (Tesorería)

La liquidación es el cierre del día que envías al administrador para que verifique tu gestión.

### 7.1 Ver mi liquidación del día
1. Ve al menú **Tesorería**.
2. Verás el resumen de hoy:
   - Capital que te asignaron desde el inicio
   - Efectivo que tienes actualmente
   - Lo que cobraste hoy
   - Lo que prestaste hoy
   - Cuotas en mora sin pagar
   - Disponible para seguir prestando

### 7.2 Enviar la liquidación al administrador
1. En la pantalla de Tesorería, haz clic en **Enviar liquidación**.
2. Puedes agregar una nota (ej: "Cliente García pagó la cuota vencida").
3. Haz clic en **Confirmar envío**.

> La liquidación queda en estado **ENVIADA**. El administrador la revisará y la aprobará o rechazará.

### 7.3 Si el administrador rechaza la liquidación
1. Verás una notificación con el motivo del rechazo.
2. Revisa la nota del administrador.
3. Corrige lo necesario y vuelve a enviar la liquidación.

---

## 8. Notificaciones

La app te enviará alertas sobre:
- Cuotas que vencen hoy o mañana
- Cuotas que cayeron en mora
- Respuesta del administrador a tu liquidación

> Para recibir notificaciones en tu celular aunque la app esté cerrada, acepta el permiso de notificaciones cuando el navegador lo solicite.

---

## 9. Usar la App sin Internet (Modo Offline)

RutaPay funciona sin conexión para consultar información ya cargada. Cuando recuperes la señal, los datos se sincronizan automáticamente.

> Para registrar pagos nuevos sí necesitas conexión a internet.

---

## 10. Cierre de Sesión

- Toca tu nombre en el menú.
- Selecciona **Cerrar sesión**.

---

## Resumen de Tareas Diarias del Encargado

| Momento | Tarea |
|---------|-------|
| Inicio del día | Revisar cuotas pendientes del día en Overview |
| Durante el cobro | Registrar cada pago desde el préstamo del cliente |
| Al otorgar un préstamo | Crear el préstamo con los parámetros acordados |
| Al final del día | Enviar la liquidación desde Tesorería |
| Ante un rechazo | Revisar nota del admin y reenviar la liquidación |
