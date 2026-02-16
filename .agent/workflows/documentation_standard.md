---
description: Estándar de Documentación de Espejo (1:1) y Capas Narrativas para IA (NotebookLM)
---

Este workflow define los pasos para estructurar la documentación de cualquier proyecto de forma que sea 100% legible y "vendible" para agentes de IA como NotebookLM.

### 1. Estructura de Carpetas (Mirroring)
Toda documentación debe residir en `.docs/mirrors/` y replicar exactamente la estructura del código fuente (src).
- `.docs/mirrors/Core/`: Lógica de arranque y configuración.
- `.docs/mirrors/Modules/`: Lógica de negocio y motores principales.
- `.docs/mirrors/Services/`: Integraciones con APIs externas.
- `.docs/mirrors/Web/`: Interfaces de usuario e interacciones frontend.
- `.docs/mirrors/Narrative/`: Historia de marca, visión y flujos creativos.

### 2. Estándar de Contenido por Archivo (.md)
Cada archivo de documentación debe seguir estos 4 pilares:
1. **Objetivo:** Qué problema específico resuelve este componente.
2. **Lógica de Negocio:** Explicación conceptual de lo que sucede "bajo el capó" (evitar tecnicismos puros).
3. **Interacciones:** Con qué otros archivos o servicios se comunica.
4. **Valor de Usuario (Publicidad):** Cómo vender esta funcionalidad. Qué beneficio real aporta al dueño del negocio.

### 3. Capa Narrativa (NotebookLM Plus)
Para potenciar la generación de Podcasts y Videos, se deben crear siempre 3 documentos narrativos:
- `Brand_Story_and_Vision.md`: El "alma" del proyecto y el tono de voz.
- `Creative_Workflow_Guide.md`: El viaje del usuario/producto a través del sistema.
- `Future_Innovations_Roadmap.md`: Hacia dónde evoluciona el proyecto.

### 4. Guía de Integración
Siempre incluir un archivo `NotebookLM_Integration_Guide.md` con:
- Instrucciones de carga masiva (truco del buscador `*.md`).
- El "Mapa del Sistema" (esquema mermaid) para que la IA entienda la jerarquía.
- Prompts recomendados para generar el Audio Overview.

### 5. Mantenimiento
- Cada nueva funcionalidad o archivo de código requiere la creación inmediata de su "Espejo" documental.
- La documentación debe revisarse con un enfoque "Premium", asegurando que la IA siempre perciba el software como una solución de alto rendimiento.
