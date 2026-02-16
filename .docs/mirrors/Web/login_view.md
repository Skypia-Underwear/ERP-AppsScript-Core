# Mirror Doc: login_view.html (Web)

## 🎯 Objetivo
La puerta de entrada segura. Proporciona una interfaz elegante para que los empleados y administradores se identifiquen, garantizando que los datos sensibles del negocio solo sean accesibles por personal autorizado.

## 🧠 Lógica de Negocio
- **Autenticación en Dos Pasos (Simulada):** Requiere correo electrónico y contraseña (ID del empleado).
- **Persistencia de Sesión:** Utiliza `sessionStorage` para mantener al usuario conectado durante la jornada laboral sin pedir credenciales en cada clic.
- **Validación de Perfil:** Se comunica con el servidor para verificar roles y permisos antes de permitir la entrada al Dashboard.

## 🔄 Interacciones
- **Backend:** Llama a `userLogin()` en `Main.js`.
- **Frontend:** Redirige al `systemContainer.html` tras una autenticación exitosa.

## 💰 Valor de Usuario (Publicidad)
**"Privacidad Total para tu Negocio":** Duerme tranquilo sabiendo que tus datos de ventas y clientes están protegidos. Solo tú y tu equipo pueden entrar, con una interfaz profesional que da confianza desde el primer segundo.
