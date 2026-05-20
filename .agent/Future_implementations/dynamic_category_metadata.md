# Plan de Industrialización: Inyección Dinámica de Metadatos por Categoría

## 1. Objetivo Arquitectónico
Eliminar las reglas de arte (Art Direction Rules) *hardcodeadas* en el código de Apps Script (`Images.js` / `AIService.js`). El objetivo es conectar la tabla `BD_CATEGORIAS` (administrada desde AppSheet o el ERP) directamente con el motor de IA. Esto permitirá inyectar directrices de arte dinámicas, específicas para cada categoría de producto, logrando que la IA trate de forma distinta la generación de imágenes de un termo, ropa interior, calzado o joyería, basándose en la configuración de la base de datos y no en el código.

## 2. Modificación de BD_CATEGORIAS (AppSheet/Google Sheets)
Para que la base de datos sea la *Fuente de Verdad* (Source of Truth), se sugiere agregar nuevas columnas a la hoja `BD_CATEGORIAS` (y a la app en AppSheet):

*   **`DIRECTRIZ_ARTE_IA`** (Texto largo): Instrucciones específicas para la categoría. Ej: *"Es un objeto rígido, no lo vistas sobre un maniquí. Mantén proporciones reales."*
*   **`ESTILOS_PERMITIDOS`** (EnumList): Estilos válidos para la categoría (ej: `Ghost Mannequin, Lifestyle, Flat Lay`). Evita que un usuario pida un "Ghost Mannequin" para una taza.
*   **`RESTRICCIONES_VISUALES`** (Texto): Filtros negativos específicos (ej: *"Sin sombras humanas, sin fondos recargados, mantener en superficie plana"*).

## 3. Flujo de Datos (Data Flow)
1.  **Fase de Interfaz (ERP):** Cuando el usuario selecciona un producto en el dashboard, se identifica su `CATEGORIA` y `CATEGORIA_PADRE`.
2.  **Extracción de Metadata:** La función que recupera los datos del producto buscará en caché el registro correspondiente en `BD_CATEGORIAS`.
3.  **Inyección en la API:** Durante la Fase 1 (Análisis Forense) y Fase 2 (Prompt Maestro), se adjuntarán las reglas de `DIRECTRIZ_ARTE_IA` como mandatos supremos para el comportamiento del LLM.

## 4. Impacto en AIService.js
Se debe refactorizar la función actual `_getAiArtDirectionRules`. 
*   **Antes (Actual):** Un bloque `switch` con condiciones estáticas (Ghost, Lifestyle, etc.).
*   **Futuro:** La función recibirá un objeto `categoryRules` proveniente de la base de datos. Combinará el estilo solicitado con la directriz específica de la categoría, generando un bloque de texto que se envía a Gemma 4.

## 5. Ejemplos de Casos de Uso (Data en BD)
| CATEGORIA_GENERAL | DIRECTRIZ_ARTE_IA | ESTILOS_PERMITIDOS |
| :--- | :--- | :--- |
| **Termos y Mates** | Objeto cilíndrico rígido. Ubicar siempre sobre una superficie plana (mesa, encimera). Reflejar iluminación en superficies metálicas. | Lifestyle, Flat Lay |
| **Ropa Interior** | Prenda de tela elástica. Enfocar en la banda elástica de la cintura. No exagerar la longitud de las piernas. | Ghost Mannequin, Percha |
| **Calzado** | Objeto estructurado. Mostrar siempre ambos zapatos apoyados en el suelo o superficie. Respetar la altura de la suela y la forma de la lengüeta. | Lifestyle, Collage |

---
*Nota: Este documento sirve como mapa de ruta para una futura actualización. No implementar hasta que la estabilización central de `AIService.js` y el Laboratorio IA estén completados.*
