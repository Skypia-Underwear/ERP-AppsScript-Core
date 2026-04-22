# Modularización de Cache JSON (Bake & Serve)

## Contexto
Actualmente, el sistema consolida datos de tiendas, categorías, productos, variaciones e imágenes en un único archivo JSON. A medida que el catálogo crece, este archivo puede exceder los límites de tamaño de Google Drive o causar lentitud en la carga y procesamiento por parte del TPV.

## Propuesta
Dividir el JSON único en módulos independientes para optimizar el consumo de memoria y la velocidad de transferencia:

1.  **Módulo de Estructura**: Categorías, marcas y configuraciones generales (estático).
2.  **Módulo de Catálogo**: Información base de productos e imágenes (actualización menos frecuente).
3.  **Módulo de Stock por Tienda**: Solo `INVENTARIO_ID` y `STOCK_ACTUAL` por cada sucursal (actualización frecuente).
4.  **Módulo de Precios**: Listas de precios según el perfil del cliente/tienda.

## Beneficios
- **Performance**: Carga inicial del TPV más rápida al descargar solo lo necesario.
- **Escalabilidad**: Evita el límite de 50MB por archivo de Drive y desbordamientos de memoria en dispositivos móviles.
- **Eficiencia**: Permite actualizar solo el "Módulo de Stock" sin regenerar todo el catálogo de imágenes.
