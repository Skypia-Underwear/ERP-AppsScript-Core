# Plan de Implementaciones Futuras: Sincronización Extendida y Enriquecida

Este documento detalla las ideas y estrategias para potenciar la integración entre el ERP (Google Sheets) y la tienda WooCommerce, aprovechando la riqueza de metadatos disponibles en el entorno actual.

## 1. Sincronización Avanzada de Categorías (Master Class)

Actualmente, las categorías se crean solo por nombre. La base de datos `BD_CATEGORIAS` permite una integración mucho más profunda:

*   **Jerarquía Dinámica**: Automatizar la creación de la relación Padre (`CATEGORIA_GENERAL`) -> Hijo (`CATEGORIA_ID`) para una navegación web estructurada.
*   **Iconografía SVG**: 
    *   Extraer el código vectorial desde `BD_GALERIA_SVG` usando la columna `ICONO`.
    *   Sincronizar este código con plugins como *WP Menu Icons* o mediante campos personalizados (meta-data) para mostrar iconos premium en el menú y filtros de la web.
*   **Descripciones Enriquecidas (HTML)**: 
    *   Importar el contenido de la columna `HTML` (rutas de archivos) para llenar la descripción de la categoría en WooCommerce.
    *   Esto permite que la web tenga la misma estética y contenido informativo que el catálogo offline.
*   **Lógica de Negocio**: Sincronizar `PESO_PROMEDIO` para cálculos de envío automáticos y `RECARGO_MENOR` para reglas de precios dinámicas en la web.

## 2. Atributos con Swatches Visuales (Color & Talle)

Para mejorar la experiencia de usuario (UX) en la selección de variaciones:

*   **Mapeo de Colores HEX**: 
    *   Vincular la tabla `BD_COLORES` con los términos del atributo "Color" en WooCommerce.
    *   Asignar el valor `HEXADECIMAL` a los términos para que plugins de *Swatches* muestren el color real en lugar de un nombre de texto.
*   **Guías de Talles Dinámicas**: 
    *   Usar la columna `TABLA_TALLES` de `BD_PRODUCTOS` para inyectar automáticamente modales de "Guía de Talles" en la ficha del producto, diferenciados por categoría.

## 3. Optimización SEO y Etiquetado Automático

Aprovechar los campos técnicos para mejorar el posicionamiento:

*   **Tags por Atributos**: Generar etiquetas (Tags) de WooCommerce automáticamente combinando `MARCA`, `MATERIAL` y `ESTILO`.
*   **Meta-Datos SEO**:
    *   Construir Meta-Títulos automáticos: `[MODELO] [MARCA] - [CATEGORIA] de [GENERO]`.
    *   Usar la `TEMPORADA` para activar/desactivar el resaltado de productos "New Arrival" o "Hot Sale".

## 4. Gestión de Inventario Multi-Tienda

Si la web permite retiro en local o muestra disponibilidad por sucursal:

*   **Stock por TIENDA_ID**: Sincronizar el inventario de `BD_INVENTARIO` desglosado por tienda, permitiendo al cliente web ver en qué sucursal física está disponible el producto.

## 5. Automatización de Precios Seguros

*   **Markup por Categoría**: Implementar en el proxy PHP una lógica de "Precio de Venta Sugerido" que tome el `PRECIO_COSTO` del producto y aplique el `RECARGO_MENOR` de su categoría padre si el precio de venta en la web está vacío.

---
**Próximos Pasos**:
1. Definir el plugin de *Swatches* a utilizar en WordPress.
2. Preparar el proxy PHP para la acción `sync_metadata_global`.
3. Validar el acceso de Apps Script a los archivos HTML de descripción en la carpeta de DOCUMENTOS-PDF.
