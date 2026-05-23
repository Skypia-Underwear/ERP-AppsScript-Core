# Implementación de Alta Resolución (2K/4K) y Presets de Calidad en Renderizado de IA

Este documento detalla la propuesta técnica y especificación para incorporar opciones de ultra-definición (2K, 4K) y formatos sin pérdida (PNG) en el motor publicitario de generación de imágenes.

---

## 1. Contexto de la API (Google GenAI / Vertex AI)

El modelo de generación de imágenes `imagen-3.0-generate-001` (y variantes de `gemini-3`) soporta parámetros avanzados de configuración visual en su payload que actualmente se mantienen en valores estándar para optimizar la velocidad. 

Para habilitar la generación y el escalado de nivel profesional directamente desde el ERP, podemos parametrizar y expandir el objeto `imageConfig` y usar endpoints de súper-resolución (Upscaling).

---

## 2. Parámetros Técnicos de Configuración

En el archivo `src/Services/AIService.js` (Fase 3: `ejecutarRenderizadoImagen`), se modificará el payload enviado al servicio de Google para soportar las siguientes opciones dinámicas provenientes de `extraSpecs`:

### A. Calidad de Procesamiento (`quality`)
* **Parámetro:** `quality: "hd"` o `"high"`
* **Efecto:** Fuerza al motor de difusión latente a realizar más pasos de muestreo y eliminación de ruido por píxel. Genera texturas textiles, pliegues y sombras con un realismo y nitidez superiores, reduciendo artefactos extraños en la imagen.

### B. Formato de Salida Sin Pérdida (`outputMimeType`)
* **Parámetro:** `outputMimeType: "image/png"`
* **Efecto:** Por defecto, Google devuelve las imágenes en formato comprimido `image/jpeg`. Solicitar `image/png` elimina toda pérdida por compresión en el transporte, manteniendo los bordes del producto y la tipografía de los cierres (como `"SPORTOUTDOOR"`) con la nitidez y el contraste del píxel original.

### C. Súper-Resolución y Escalado (Upscaling API)
* **Efecto:** Para evitar latencias extremas durante la generación primaria, el flujo óptimo consiste en:
  1. Generar la imagen publicitaria en resolución base (`1024px`).
  2. Aplicar un segundo paso llamando al endpoint de **Upscaling de Vertex AI** (`imageGenerationModel.upscale`).
  3. Re-escalar inteligentemente la imagen a **2K (2048x2730)** o **4K (4096x5460)** manteniendo la relación de aspecto `3:4` y suavizando bordes mediante IA.

---

## 3. Propuesta de Modificación en la UI (`images_dashboard.html`)

Se agregará un nuevo selector dentro del modal de SweetAlert2 (`generarPromptModal`) para que el diseñador comercial elija el formato de salida deseado:

```html
<!-- Selector de Calidad y Resolución en Swal.fire -->
<div>
    <label class="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1">
        <span class="material-icons text-[12px]">hd</span> Calidad y Resolución
    </label>
    <select id="swal-input-quality-preset" class="w-full text-xs bg-slate-800 text-white border-slate-600 rounded p-1.5 mt-1 shadow-inner">
        <option value="standard" selected>Estándar (1K - Rápido)</option>
        <option value="hd_png">HD Comercial (1K + PNG Sin Pérdida)</option>
        <option value="2k_upscale">Ultra HD 2K (2048px - Catálogos)</option>
        <option value="4k_upscale">Ultra HD 4K (4096px - Gigantografías)</option>
    </select>
</div>
```

---

## 4. Mapeo de Flujo de Datos

1. **Dashboard (`images_dashboard.html`):** Captura el valor del selector `swal-input-quality-preset` y lo inyecta en `extraSpecs.qualityPreset`.
2. **Operador Core (`Images.js`):** Pasa `extraSpecs` intacto al motor del servidor.
3. **Servicio IA (`AIService.js`):**
   * Si `extraSpecs.qualityPreset === "hd_png"`, añade `outputMimeType: "image/png"` y `quality: "hd"` al payload de generación.
   * Si es `"2k_upscale"` o `"4k_upscale"`, realiza la llamada primaria, obtiene el Blob y ejecuta la llamada de escalado secundaria (`upscale`) antes de devolver la imagen final en Base64 a `Images.js` para su almacenamiento definitivo en Drive.
