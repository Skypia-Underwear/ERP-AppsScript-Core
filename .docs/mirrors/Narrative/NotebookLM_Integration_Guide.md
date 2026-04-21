# Guía de Integración con NotebookLM

Esta guía está diseñada para que tú, o cualquier agente de IA, pueda cargar y entender este proyecto rápidamente en NotebookLM.

## Instrucciones de Carga Masiva
Para obtener una visión completa del sistema, se recomienda cargar los siguientes directorios/archivos:

1.  **Narrativa:** `.docs/mirrors/Narrative/*.md` (Para entender el negocio).
2.  **Estructura:** `README.md` y `Future_implementations/` (Para el contexto actual).
3.  **Código Core:** `src/Core/*.js` (Para la lógica de arranque).
4.  **Historial:** `.system/logs/deployments.txt` (Para el histórico de versiones).

> [!TIP]
> Si usas el navegador para cargar archivos, puedes buscar `*.md` en la carpeta raíz para seleccionar todos los documentos de conocimiento de una sola vez.

## Prompts Sugeridos para NotebookLM

### Para el "Audio Overview" (Podcast)
> "Genera un podcast entre dos expertos analizando la robustez de la arquitectura híbrida de HostingShop y cómo la auditoría forense protege los activos del negocio."

### Para Análisis Técnico
> "¿Cuáles son las próximas innovaciones planeadas según el roadmap y cómo afectan a la escalabilidad del sistema?"

## Mapa del Conocimiento
Actualmente, el conocimiento está estructurado en:
- `research/`: Pruebas de concepto y análisis históricos.
- `src/`: Lógica viva del ERP.
- `.docs/mirrors/`: Documentación espejo (1:1) optimizada para IA.
