# Espejo: Web/inventory_dashboard.html

## Objetivo
Visualizar el estado del inventario en tiempo real, permitiendo identificar rápidamente faltantes de stock y gestionar las existencias por tienda y variedad.

## Lógica de Negocio
Este dashboard transforma miles de celdas de datos en una interfaz intuitiva. Clasifica los productos por categoría y muestra indicadores visuales (colores de alerta) para productos con bajo stock. Es la herramienta principal para la toma de decisiones sobre compras y transferencias de mercadería.

## Interacciones
- **Datos**: Consume información procesada por `BotCache` y el motor de `Main.js`.
- **UI**: Utiliza Tailwind CSS para una visualización responsiva y moderna.

## Valor para el Usuario (Criterio Publicitario)
- **Control Total del Stock**: Olvídate de las hojas de cálculo aburridas; mira tu inventario con claridad visual absoluta.
- **Prevención de Quiebres**: El sistema te avisa proactivamente qué productos se están agotando para que nunca pierdas una venta.
- **Eficiencia Operativa**: Gestiona múltiples tiendas desde una sola pantalla, optimizando el tiempo de supervisión.
