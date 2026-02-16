# Mirror Doc: home_dashboard.html (Web)

## 🎯 Objetivo
El "Cerebro" del ERP. Es la primera pantalla que ve el administrador, diseñada para ofrecer una vista de pájaro inmediata sobre la salud financiera, el stock y la conectividad del sistema.

## 🧠 Lógica de Negocio
- **Telemetría en Tiempo Real:** Visualización dinámica de KPIs (Key Performance Indicators) como ventas del día, cantidad de operaciones y alertas de stock crítico.
- **Centro de Navegación:** Orquesta el acceso rápido a los módulos de TPV, Inventario, Imágenes y Auditoría mediante una interfaz táctil y moderna.
- **Gestión de Sesión:** Saludo personalizado basado en el perfil de usuario logueado, extrayendo datos de `sessionStorage`.
- **Acciones Sugeridas:** Pantalla inteligente que analiza el estado del inventario y recomienda tareas (como "Revisar stock bajo") de forma proactiva.

## 🔄 Interacciones
- **Assets:** Importa `_shared_assets.html` para el diseño core.
- **Backend:** Consume `getHomeDashboardData()` para poblar los indicadores.
- **Navegación:** Interactúa con el router de `Main.js` para cambiar de vista.

## 💰 Valor de Usuario (Publicidad)
**"Todo tu Negocio, De un Vistazo":** Deja de buscar en pestañas interminables. El Dashboard de Inicio te dice exactamente cuánto ganaste hoy y qué productos necesitan reposición antes de que te des cuenta. Es el copiloto perfecto para el dueño de negocio que no tiene tiempo que perder.
