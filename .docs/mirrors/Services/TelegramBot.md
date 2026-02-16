# Mirror Doc: TelegramBot.js (Services)

## 🎯 Objetivo
El centro de mando móvil. Permite al dueño de negocio interactuar con el ERP directamente desde Telegram, recibiendo reportes críticos y diagnósticos de salud sin abrir ninguna aplicación adicional.

## 🧠 Lógica de Negocio
- **Interactividad Determinística:** Router de comandos (`/ventas`, `/inventario`, `/salud`) que responde en milisegundos con datos frescos.
- **Auditoría Móvil:** Genera resúmenes diarios de ventas con desglose por método de pago de forma visual y compacta.
- **Diagnóstico Total:** Sistema de alerta proactivo que informa sobre errores en los scripts o fallos de conexión de IA de forma inmediata (Push Notifications).
- **Mini-App Integrada:** Capacidad de abrir el Dashboard completo del ERP directamente dentro de una "Mini App" de Telegram para una experiencia 100% móvil.

## 🔄 Interacciones
- **API Externa:** Conexión bidireccional con los servidores de Telegram.
- **Servicios Internos:** Consume datos de `BotCache.js` para velocidad extrema.
- **Seguridad:** Filtra accesos por Chat ID para garantizar que solo el dueño vea la información financiera.

## 💰 Valor de Usuario (Publicidad)
**"Tu Negocio en tu Bolsillo":** ¿Cómo va la caja hoy? Pregúntale a tu bot. Recibe alertas si algo falla y exporta reportes de stock mientras viajas. Es como tener un gerente de operaciones informándote las 24 horas vía chat.
