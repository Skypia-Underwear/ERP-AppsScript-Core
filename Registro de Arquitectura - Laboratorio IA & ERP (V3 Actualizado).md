# **Registro de Mejoras y Arquitectura \- Laboratorio IA & ERP (V3)**

Documento de seguimiento para las implementaciones, refactorizaciones y optimizaciones del entorno de desarrollo para el proyecto de ERP, utilizando los modelos de Google (Gemma / Gemini).

## **1\. Aciertos Arquitectónicos Actuales**

* **Aislamiento de Fases:** Separación estricta entre la Fase 1 (Forense/Gratuita) y la Fase 3 (Render/Pago).  
* **Sanitización de LLM:** Filtrado eficiente de "chatter" y monólogos de la IA mediante extraerContenido y extraerContenidoNarrativo.  
* **Manejo de Caché (BD\_LABORATORIO\_IA):** Lectura y escritura en caché para reducir latencia en el frontend.  
* **Resiliencia Multimodal:** Integración robusta de la File API para archivos pesados y fallback a Base64 para operaciones menores.

## **2\. Refactorización Inmediata (Consolidación)**

| Módulo | Acción Requerida | Estado |
| :---- | :---- | :---- |
| Images.js | Eliminar la función duplicada \_getAiArtDirectionRules. | Pendiente |
| Images.js | Modificar generarSuperPrompt para que consuma AIService.\_getAiArtDirectionRules. | Pendiente |
| AIService.js | Verificar endpoint del modelo gratuito para evitar fallos silenciosos y latencia de fallback. | Pendiente |

## **3\. Optimizaciones Futuras (Fase de Industrialización)**

* **Pipeline de Generación Anclada (Context Caching Condicional):** En la Fase 3, tras lograr una imagen "Ghost" exitosa, empaquetar dicha imagen junto con la Ficha Forense y el Prompt Maestro en el Caché de Contexto de Gemini. Las posteriores iteraciones ("Refinamientos") apuntarán a este caché. Esto congela la atención geométrica del modelo (Embeddings), reduciendo drásticamente el costo de los tokens de entrada y garantizando la coherencia estructural de la prenda (evita que la IA cambie postura o modelo).  
* **Gestión del Ciclo de Vida (Garbage Collection):** Borrado explícito de URIs en la File API de Gemini (Cola de Limpieza Nocturna asíncrona mediante UrlFetchApp.fetchAll).  
* **Salidas Estructuradas (JSON Mode):** Migrar la extracción de datos a esquemas JSON estrictos (Structured Outputs) nativos de la API.  
* **Procesamiento por Lotes (Batch API):** Arquitectura para usar la Batch API en tareas de sincronización masiva de catálogos.

## **4\. Fase de Expansión Multimodal (Audio y Video)**

* **Refinamiento Asistido por Voz (Audio-to-Prompt):** Implementar grabación de micrófono en el Frontend (Dashboard/Lab). El audio en Base64 se enviará a gemini-flash en la Fase 1 (Gratuita) para transcribir y formalizar técnicamente las correcciones visuales dictadas por el usuario, antes de enviarlas al modelo de renderizado (Fase 3).  
* **Integración Cero-Coste de YouTube:** Reemplazar descargas de archivos MP4 por URIs directas de YouTube (file\_uri) para la extracción de directrices de arte (Art Direction) de videos de referencia de la competencia.