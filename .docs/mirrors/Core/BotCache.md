# Mirror Doc: BotCache.js (Core)

## 🎯 Objetivo
El "Turbo" del Bot de Telegram. Su función es precargar y persistir la información crítica del negocio (catálogos, IDs de tiendas, scripts) para que el Bot responda al instante, eliminando los retrasos de búsqueda en las hojas de cálculo.

## 🧠 Lógica de Negocio
- **Caché de Larga Duración:** Utiliza `PropertiesService` para guardar datos entre ejecuciones, haciendo que el Bot se sienta como una aplicación nativa instalada en el servidor.
- **Optimización de Memoria:** Gestiona fragmentos de configuración pesados, asegurando que solo se recargue la información necesaria cuando hay cambios reales en las hojas.
- **Seguridad de Acceso:** Resguarda las rutas y IDs de scripts que el Bot utiliza para ejecutar comandos, actuando como un puente seguro entre el chat y el código.

## 🔄 Interacciones
- **TelegramBot.js:** Es su principal consumidor. El Bot consulta al Cache antes de ir a las hojas de Google Sheets.
- **Installer.js:** El instalador prepara el Cache inicial para asegurar que el sistema nazca optimizado.

## 💰 Valor de Usuario (Publicidad)
**"Respuestas a la Velocidad del Pensamiento":** Nadie quiere esperar a que un Bot cargue. BotCache asegura que cuando le pidas un reporte a tu ERP por Telegram, la respuesta sea inmediata. Es la diferencia entre una herramienta lenta y una herramienta de alto rendimiento que te acompaña en el día a día.
