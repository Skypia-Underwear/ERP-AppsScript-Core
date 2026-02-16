# Mirror Doc: Woocommerce Service Suite (Services)

## 🎯 Objetivo
Sincronización bidireccional con el ecosistema WordPress. Une la flexibilidad de Google Sheets con la potencia de ventas de WooCommerce, automatizando la gestión de órdenes y la publicación de catálogos.

## 🧠 Lógica de Negocio
- **Importador de Órdenes Inteligente:** Descarga ventas de WooCommerce, registra nuevos clientes automáticamente en la base de datos local y descuenta stock en tiempo real.
- **Publicador Automatizado:** Convierte productos de la planilla en catálogos CSV compatibles con WooCommerce, permitiendo actualizaciones masivas de precios y stock en segundos.
- **Sincronización Atómica:** Actualiza estados de órdenes (de "Procesando" a "Completado") directamente desde la planilla de Google, sin necesidad de entrar al administrador de WordPress.
- **Integración de Identidad:** Mapea correos y teléfonos de compradores externos con la base de clientes del ERP para mantener un historial unificado.

## 🔄 Interacciones
- **API Externa:** Conexión con WordPress REST API vía `UrlFetchApp`.
- **Estructura:** Divide responsabilidades entre `WoocommerceOrders.js` (Ventas) y `WoocommerceProduct.js` (Catálogo).
- **Notificaciones:** Reporta el éxito o fracaso de cada sincronización vía Telegram.

## 💰 Valor de Usuario (Publicidad)
**"Vende en la Web, Gestiona en tu Planilla":** Conecta tu tienda WordPress al ERP más sencillo del mercado. Deja que los pedidos se anoten solos y que el stock se descuente sin errores humanos. Es el puente perfecto entre el e-commerce profesional y la simplicidad administrativa.
