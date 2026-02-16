---
description: Estándar de Arquitectura Dinámica y Organización de Código Fuente (src)
---

Este workflow define los principios de organización de archivos para mantener sistemas escalables, modulares y fáciles de documentar por IA.

### 1. El Directorio Raíz (`src/`)
La lógica del sistema debe estar centralizada en una carpeta `src/`. Esto facilita el "Mirroring" (documentación de espejo) y separa el código de la configuración de herramientas (como `.clasp.json`, `package.json`).

### 2. Capas de Responsabilidad (Estructura Sugerida)
La organización debe seguir una lógica de separación de preocupaciones, adaptándose dinámicamente al proyecto:

- **`Core/` (El Motor Central):** Contiene archivos de arranque, configuraciones globales, manejo de errores y orquestación principal. Es lo primero que debe leer un agente para entender el sistema.
- **`Modules/` (Lógica de Negocio):** Contiene los componentes funcionales independientes (ej. Inventario, Imágenes, Pagos). Cada módulo debe ser lo más autónomo posible.
- **`Services/` (Integraciones):** Capa dedicada a la comunicación con APIs externas (Telegram, WordPress, Google Drive, CRM).
- **`Web/` (Interfaces e Interacción):** Archivos HTML, CSS y JS de frontend. Separa la vista de la lógica de servidor.
- **`Utils/` (Herramientas de Apoyo):** Instaladores, scripts de migración, formateadores de datos y utilidades genéricas.

### 3. Principio de Adaptabilidad Dinámica
**CRÍTICO:** Esta estructura no es rígida. El agente debe evaluar el proyecto:
- **Proyectos Pequeños:** Pueden omitir `Services/` o fusionar `Modules/` en archivos únicos.
- **Proyectos de Datos:** Deben priorizar una carpeta `Schema/` o `Database/`.
- **Proyectos Web:** Deben priorizar la organización de `Web/` en subcarpetas de componentes.

### 4. Nomenclatura Estándar
- Usa nombres descriptivos en **PascalCase** para clases y **camelCase** o **Snake_Case** (según el entorno) para archivos de funciones.
- Asegura que el nombre del archivo refleje su pilar en el "Mirror Doc" (ej. `Main.js` -> `Main.md`).

### 5. Guía para Futuros Agentes
Al iniciar un nuevo proyecto, el agente debe:
1. Analizar el objetivo del sistema.
2. Definir los pilares arquitectónicos (Core, Mod, etc.).
3. Crear la estructura en `src/` antes de escribir lógica compleja.
4. Mantener la consistencia: Si un archivo crece mucho, debe ser refactorizado en un nuevo Módulo o Servicio.
