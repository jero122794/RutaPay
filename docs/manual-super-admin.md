# Manual de Usuario — SUPER_ADMIN
## RutaPay · Plataforma de Microcréditos de Ruta

---

## ¿Qué puede hacer el SUPER_ADMIN?

El SUPER_ADMIN es el administrador global de la plataforma. Tiene acceso total a todos los negocios, usuarios y configuraciones del sistema. Es el único rol que puede crear negocios nuevos y gestionar licencias.

---

## 1. Inicio de Sesión

1. Abre la app en tu dispositivo o navegador.
2. Ingresa tu **correo electrónico** o **número de documento** y tu **contraseña**.
3. Haz clic en **Ingresar**.

> Si ingresas la contraseña incorrecta varias veces, la cuenta se bloqueará temporalmente por seguridad.

---

## 2. Panel Principal (Overview)

Al ingresar verás un resumen global con:
- Total de negocios registrados en la plataforma
- Cartera activa agregada
- Usuarios activos

---

## 3. Gestión de Negocios

### 3.1 Ver todos los negocios
- Ve al menú **Negocios**.
- Verás la lista de todos los negocios registrados con nombre, estado de licencia y fecha de vencimiento.

### 3.2 Crear un negocio nuevo
1. Haz clic en **Nuevo negocio**.
2. Ingresa el nombre del negocio.
3. Haz clic en **Crear**.

> El negocio se crea sin licencia activa. Debes asignarle una licencia para que sus usuarios puedan operar.

### 3.3 Asignar licencia a un negocio
1. Abre el negocio desde la lista.
2. Haz clic en **Gestionar licencia**.
3. Selecciona la duración: en **meses** o en **años**.
4. Haz clic en **Activar / Extender licencia**.

> Si el negocio ya tiene una licencia vigente, la extensión se suma desde la fecha actual de vencimiento (no se pierde tiempo).
> Si la licencia vence, los usuarios ADMIN, ROUTE_MANAGER y CLIENT de ese negocio no podrán iniciar sesión hasta que la renueves.

### 3.4 Crear el primer administrador de un negocio
1. Abre el negocio.
2. Haz clic en **Crear administrador**.
3. Ingresa nombre, correo y contraseña del nuevo ADMIN.
4. Haz clic en **Crear**.

> Cada negocio solo puede tener un administrador principal creado por esta vía. El ADMIN luego puede crear más usuarios desde su panel.

### 3.5 Asignar miembros a un negocio
1. Abre el negocio.
2. Haz clic en **Asignar miembro**.
3. Busca el usuario por nombre o correo.
4. Selecciona el rol que tendrá dentro del negocio (ADMIN, ROUTE_MANAGER o CLIENT).
5. Haz clic en **Asignar**.

> Al asignar un usuario a un negocio, se invalida su sesión actual por seguridad y debe volver a iniciar sesión.

### 3.6 Reconciliar datos de un negocio
Si detectas inconsistencias en la asignación de rutas o clientes a un negocio:
1. Abre el negocio.
2. Haz clic en **Reconciliar alcance**.
3. El sistema corregirá automáticamente las rutas y clientes que deberían pertenecer al negocio.

---

## 4. Gestión de Usuarios (Global)

- Ve al menú **Usuarios** para ver todos los usuarios de la plataforma.
- Puedes activar o desactivar cualquier cuenta.
- Puedes ver a qué negocio pertenece cada usuario y qué roles tiene.

---

## 5. Módulos por Rol

Desde **Ajustes → Módulos por Rol** puedes controlar qué secciones del dashboard puede ver cada rol en todos los negocios:

1. Selecciona el rol (ADMIN, ROUTE_MANAGER, CLIENT).
2. Activa o desactiva los módulos disponibles.
3. Los cambios aplican de inmediato.

> El SUPER_ADMIN siempre tiene acceso a todo, independientemente de esta configuración.

---

## 6. Rutas, Clientes, Préstamos y Pagos

El SUPER_ADMIN tiene acceso de lectura y escritura a todos los datos de todos los negocios. Los flujos de operación son los mismos que para el ADMIN (ver manual de ADMIN), pero sin restricción de negocio.

---

## 7. Cierre de Sesión

- Haz clic en tu nombre de usuario (esquina superior o menú lateral).
- Selecciona **Cerrar sesión**.
- Tu sesión se invalida de forma segura en el servidor.

---

## Contacto y Soporte

Para soporte técnico de la plataforma, contacta al equipo de desarrollo.
