# Sesión de Desarrollo: Importador de WhatsApp Inteligente (API REST, Sincronización Síncrona y Parche de Duplicidad de Imágenes)
**Fecha:** 25 de Mayo de 2026
**Chat ID:** a1ca7e22-6ce1-485d-ba45-2612a9285e80

## 🎯 Objetivo Principal
Implementar y depurar de manera integral el panel de importación controlada progresiva para catálogos interceptados de WhatsApp, garantizando que el campo `DESCRIPCION_IA` se persista instantáneamente en `BD_PRODUCTOS` sin depender de retrasos de sincronización física de hojas, y solucionar un bug crítico que provocaba la duplicación física y lógica de imágenes en Drive y `BD_PRODUCTO_IMAGENES` al volver a procesar o actualizar productos preexistentes.

## ✅ Hitos Alcanzados en esta Sesión

1. **Parche Síncrono para `DESCRIPCION_IA`:**
   - **Causa Raíz anterior:** Se escribía la descripción mediante `setValue()` en Sheets tras la llamada de API REST, pero el engine de Apps Script lee en real-time la caché de hojas la cual sufría de demoras de replicación (replication lag), resultando en registros vacíos para productos nuevos.
   - **Solución:** Aprovechando que el usuario quitó las restricciones y habilitó la edición del campo `DESCRIPCION_IA` en el editor de AppSheet, agregamos la propiedad `"DESCRIPCION_IA"` de forma nativa directamente en el payload REST de la petición `Add`.
   - **Fallback Físico Seguro:** Las escrituras físicas en Sheets se limitaron estrictamente a productos ya registrados (`existingRowIdx !== -1`), logrando persistencia total en un solo paso síncrono.

2. **Resolución del Error Crítico de Duplicidad de Imágenes:**
   - **El Diagnóstico de Falla:** Al importar por primera vez, las fotos se descargan como `CODIGO_01.jpg` y de inmediato la sincronización maestra de `Images.js` las renombra a un formato estático estable basado en hashes (`CODIGO-xxxxx.jpg`). Al actualizar o importar nuevamente, la comprobación local buscaba el nombre original temporal `CODIGO_01.jpg`. Como este ya no existía en la carpeta bajo ese nombre, se interpretaba erróneamente como un producto "sin fotos", descargando nuevamente del CDN de WhatsApp y registrando un nuevo hash que duplicaba las filas en `BD_PRODUCTO_IMAGENES`.
   - **Solución implementada:** Se modificó la validación en [AppSheetApi.js](file:///c:/Users/USER/OneDrive/Documents/Proyecto_Web/Macros%20HostingShop/src/Services/AppSheetApi.js) (líneas 480-502). Ahora realiza un chequeo físico del estado de la carpeta en Drive mediante `folder.getFiles().hasNext()`. Si la carpeta contiene cualquier recurso (independientemente del nombre estable que tenga), se omite la descarga e inserción redundante.

3. **Despliegues Oficiales y Controlados en MINOM JEANS:**
   - Se realizaron dos compilaciones y despliegues exitosos por clasp a la WebApp de MINOM (`AKfycbzYhSY4sTRnUvPH6EcWNG89LjurVUbeWGAiUZMSdAsaHFpl7S0mjtWeQkfEnknG80A7`):
     - **Versión 31:** Despliegue del parche del campo de descripción síncrono vía API.
     - **Versión 33:** Despliegue de la corrección del validador de duplicidad de imágenes.
   - Se restauró adecuadamente la configuración local del `.clasp.json` para apuntar a la Macro Principal de desarrollo.

4. **Creación del Manual de Scraping de WhatsApp Web:**
   - Se escribió y guardó un manual de desarrollador estructurado en [.docs/manual_whatsapp_web_scraping.md](file:///c:/Users/USER/OneDrive/Documents/Proyecto_Web/Macros%20HostingShop/.docs/manual_whatsapp_web_scraping.md) que contiene el script JS de consola listo para extraer catálogos comerciales y convertirlos al CSV esperado por nuestro importador ERP.

## 🏆 Lección Aprendida
El renombrado de archivos a formatos estables en galerías físicas y sincronizaciones en Sheets siempre altera el DOM original de almacenamiento. Al evaluar si un recurso ya existe, es preferible utilizar propiedades estables de metadatos o consultar el estado de vaciado del contenedor (carpeta) antes de re-descargar recursos pesados de CDNs externos que volverán a generar hashes diferentes.

## 🚀 Próximos Pasos (Para la Siguiente Sesión)
1. **Validación del Importador:**
   - Solicitar al usuario realizar una nueva prueba de importación del catálogo con productos ya cargados para corroborar que:
     - No se suba ni registre ninguna imagen duplicada adicional.
     - Se guarde e integre correctamente la descripción en `DESCRIPCION_IA`.
2. **Evaluación de Filtros Frecuentes:**
   - Monitorear el comportamiento de los filtros de estado de la grilla (`Solo Listos`, `Solo Registrados`, `Solo Omitidos`) en lotes extensos de datos.

---
*Nota para la IA: Lee este documento al iniciar la sesión con el Chat ID a1ca7e22-6ce1-485d-ba45-2612a9285e80 para retomar el desarrollo del importador y catalogador inteligente.*
