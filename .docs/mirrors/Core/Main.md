# Mirror Doc: Main.js (Core)

## 🎯 Objetivo
El "Sistema Nervioso Central" del ERP. Su función es orquestar todas las solicitudes entrantes (Webhooks, peticiones UI), gestionar la configuración global y asegurar la persistencia de datos en Google Sheets de forma segura y eficiente.

## 🧠 Lógica de Negocio
- **Orquestador doPost:** Punto de entrada único para Telegram, AppSheet y el sitio web. Decodifica la intención del usuario y la rutea al módulo correspondiente (Inventario, Imágenes, Ventas).
- **Inyector de Configuración Dinámica:** Lee las hojas `BD_APP_SCRIPT` y `BD_CONFIGURACION_GENERAL` en tiempo real, permitiendo cambiar el comportamiento del sistema (como el saldo de IA o tokens de Telegram) sin tocar una sola línea de código.
- **Resiliencia de Conexión:** Implementa un motor de reintentos (`executeWithRetry`) para manejar fallos temporales de Google Services, garantizando que el negocio nunca se detenga por un error de red.
- **Logging de Salud:** Sistema de diagnóstico avanzado que reporta errores críticos directamente al dueño vía Telegram.

## 🔄 Interacciones
- **Dependencia:** Es el archivo raíz. Todos los demás módulos dependen de sus constantes globales y funciones de acceso a datos.
- **Frontend:** Provee las funciones que el usuario llama desde la interfaz (Login, carga de datos).

## 💰 Valor de Usuario (Publicidad)
**"El Motor que Nunca se Detiene":** Main.js es la garantía de que tu negocio está en buenas manos. Es el encargado de que cada venta se anote, cada foto se guarde y cada notificación llegue a tiempo. Es la inteligencia invisible que hace que todo "simplemente funcione".
