# Mirror Doc: Blogger_Bridge.js (Services)

## 🎯 Objetivo
El "motor de publicación" más potente del sistema. Transforma una compleja base de datos relacional en una estructura JSON ultra-optimizada que alimenta el sitio web de ventas en Blogger y aplicaciones móviles.

## 🧠 Lógica de Negocio
- **Árbol de Categoría Dinámico:** Organiza productos en niveles (Padre/Hijo) con iconos SVG inyectados automáticamente para una navegación visual intuitiva.
- **Motor de Descripción IA:** Consolida atributos técnicos (material, temporada, talles) y metadatos de IA para generar fichas de producto profesionales en tiempo real.
- **Inteligencia de Stock:** Calcula la disponibilidad por Tienda/Color/Talle en el aire, asegurando que solo se ofrezca lo que realmente se puede entregar.
- **Integración Social:** Genera links de WhatsApp personzalizados que incluyen el detalle exacto del producto para cerrar ventas más rápido.

## 🔄 Interacciones
- **Fuentes:** Mapea más de 8 hojas de cálculo (Productos, Inventario, Imágenes, Colores, etc.).
- **Salida:** Datos para `doGet` que consume el frontend web.
- **Feedback:** Notifica eventos de venta vía Telegram a través de `registrar_venta`.

## 💰 Valor de Usuario (Publicidad)
**"Tu Catálogo Inteligente en un Clic":** Actualiza tu stock en la planilla y mira cómo cambia en tu web al instante. Sin panel de control complicado, sin bases de datos pesadas. Es la forma más rápida del mundo de tener una tienda online profesional y sincronizada.
