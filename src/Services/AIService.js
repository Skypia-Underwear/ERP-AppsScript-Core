/**
 * 🧠 AIService - Motor Maestro de IA (V2.0)
 * Centraliza toda la ejecución de IA (Gratis y Pago) siguiendo el ai_model_standard.md.
 * 
 * PROHIBIDO: Gemini 1.5 Flash (Vetado por inestabilidad).
 * AUTORIZADO: Familia Gemma (Gratis), Gemini 2.5/3.1 (Alta potencia/Pago).
 */
const AIService = {

  // Capa Gratuita / Infraestructura (ai_model_standard.md - Capa 1)
  MODELS_FREE: [
    "gemma-4-26b-a4b-it",  // Principal
    "gemini-2.5-flash"     // Fallback autorizado (NO usar 1.5)
  ],

  // Capa de Pago / Generación de Imagen (ai_model_standard.md - Capa 3)
  MODELS_PAID: [
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "imagen-4.0-generate-001",
    "imagen-3.0-generate-001"
  ],

  /**
   * CONSULTA GENERAL (FREE TIER)
   * Ideal para descripciones, análisis forense y auditoría.
   */
  consultarGemma(prompt, fileDataRef = null, configOverride = {}) {
    const apiKey = GLOBAL_CONFIG.GEMINI.FREE_API_KEY || GLOBAL_CONFIG.GEMINI.API_KEY;
    if (!apiKey) throw new Error("Falta API Key para IA Gratuita.");

    let ultimoError = "";
    for (const modelo of this.MODELS_FREE) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        const parts = [{ text: prompt }];
        if (fileDataRef) parts.push(fileDataRef);

        const response = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify({
            contents: [{ parts: parts }],
            generationConfig: {
              temperature: configOverride.temperature || 0.1,
              maxOutputTokens: configOverride.maxOutputTokens || 2048
            }
          }),
          muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {
          const resText = response.getContentText();
          const json = JSON.parse(resText);
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) return this.extraerContenido(rawText);
        }
        ultimoError = `Mod ${modelo} -> HTTP ${response.getResponseCode()}`;
      } catch (e) {
        ultimoError = `Mod ${modelo} -> ${e.message}`;
      }
    }
    throw new Error(`[AIService] Fallaron todos los modelos gratuitos: ${ultimoError}`);
  },

  /**
   * GENERACIÓN DE IMAGEN (PAID TIER)
   * Lógica de renderizado publicitario de alta gama.
   */
  ejecutarRenderizadoImagen(prompt, partsReferencia, extraSpecs = {}) {
    const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY; // Usar llave principal para pago
    if (!apiKey) throw new Error("Falta API Key para IA de Pago.");

    let variantes = [...this.MODELS_PAID];

    // Priorización dinámica si se solicita
    if (extraSpecs.model && variantes.includes(extraSpecs.model)) {
      variantes = [extraSpecs.model, ...variantes.filter(m => m !== extraSpecs.model)];
    }

    let errores = [];
    for (const modelo of variantes) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        const payload = {
          contents: [{ parts: [{ text: prompt }, ...partsReferencia] }],
          generationConfig: {
            response_modalities: ["IMAGE"],
            imageConfig: { aspectRatio: extraSpecs.aspectRatio || "3:4" }
          },
          safetySettings: typeof GEMINI_SAFETY_SETTINGS !== 'undefined' ? GEMINI_SAFETY_SETTINGS : []
        };

        const response = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {
          const json = JSON.parse(response.getContentText());
          const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
          if (part?.inlineData?.data) {
            return {
              success: true,
              base64: part.inlineData.data,
              model: modelo,
              usage: json.usageMetadata
            };
          }
        }
        errores.push(`${modelo}: ${response.getResponseCode()}`);
      } catch (e) {
        errores.push(`${modelo} EX: ${e.message}`);
      }
    }
    throw new Error(`Incapaz de generar imagen. Detalles: ${errores.join(" | ")}`);
  },

  /**
   * UTILIDAD: Extracción robusta de JSON y limpieza de Markdown
   */
  extraerContenido(text) {
    if (!text) return "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
    return text.replace(/```json/g, "").replace(/```/g, "").trim();
  }
};
