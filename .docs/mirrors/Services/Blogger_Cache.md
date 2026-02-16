# Mirror Doc: Blogger_Cache.js (Services)

## 🎯 Objetivo
El guardián del rendimiento. Su función es pre-procesar el catálogo completo de productos y guardarlo como un archivo estático en Google Drive, eliminando las esperas de carga para los clientes finales y optimizando el consumo de cuotas de Apps Script.

## 🧠 Lógica de Negocio
- **Snapshot Tecnológico:** Toma una "foto" de todo el inventario, imágenes y precios procesados por `Blogger_Bridge.js` y la congela en un JSON optimizado.
- **Persistencia en Drive:** Gestiona la creación y sobrescritura del archivo `configuracion_sitio.json`, asegurando que siempre esté disponible públicamente para el sitio web.
- **Automatización de Refresco:** Incluye un instalador de triggers que actualiza esta caché cada 10 minutos, garantizando que los cambios de stock en las planillas se reflejen en la web casi en tiempo real.

## 🔄 Interacciones
- **Dependencia:** Llama a `blogger_listar_configuracion_sinCache()` de `Blogger_Bridge.js`.
- **Salida:** Archivo JSON en la carpeta de activos globales de Google Drive.
- **Triggers:** Gestiona sus propios intervalos de tiempo de forma autónoma.

## 💰 Valor de Usuario (Publicidad)
**"Tu Web a Velocidad de Rayo":** No hagas esperar a tus clientes. La caché inteligente prepara todo tu catálogo de antemano para que la tienda cargue instantáneamente. Es como tener un vendedor que ya tiene todos los precios en la cabeza antes de que entre el cliente.
