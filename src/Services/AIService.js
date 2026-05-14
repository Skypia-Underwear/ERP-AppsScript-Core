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
    "gemini-2.5-flash",    // 🚀 AGILIDAD: Análisis multimodal rápido (5-10s)
    "gemma-4-26b-a4b-it"   // 🐢 PRECISIÓN: Peritaje forense profundo (110s)
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
          
          if (rawText) {
            // Pasamos los headers autorizados para filtrar el monólogo de Gemma
            return this.extraerContenido(rawText, configOverride.whitelistHeaders);
          }
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
   * UTILIDAD: Extracción robusta y Saneamiento de Datos (Whitelist)
   * Elimina monólogos, repeticiones y markdown de Gemma 4.
   */
  extraerContenido: function(texto, whitelistHeaders = null) {
    if (!texto) return "";
    let lineas = texto.split('\n');
    let contenidoLimpio = [];
    let vistos = new Map(); // Para prevenir duplicados y aplicar "Last Value Wins"
    
    for (let linea of lineas) {
      let l = linea.trim();
      if (!l) continue;
      
      // 🛡️ FILTRO 1: Whitelist Estricta (Si se define)
      if (whitelistHeaders && whitelistHeaders.length > 0) {
        let esValida = whitelistHeaders.some(header => {
          // Soporta "Header:", "- Header:", "* Header:"
          const regex = new RegExp(`^[-*\\s]*(${header}):`, 'i');
          return regex.test(l);
        });
        if (!esValida) continue;
      }

      // 🛡️ FILTRO 2: Protección Anti-Instrucción y Monólogos
      // Ignorar si tiene placeholders ej: [Type], [Brand], [Yes/No]
      if (/\[[\w\s\/\-_]+\]/i.test(l)) continue;
      
      // Ignorar líneas de "pensamiento" o corrección (Chatter)
      const chatterKeywords = ["wait,", "i will", "let's", "final check", "self-correction", "i should", "prompt says", "refining schema", "final polish", "one more check", "double check"];
      if (chatterKeywords.some(word => l.toLowerCase().includes(word))) continue;

      // 🛡️ FILTRO 3: Limpieza de Markdown (Preservando Guiones Bajos Técnicos)
      let cleanLine = l.replace(/[*#`]/g, '').trim();

      // 🛡️ FILTRO 4: Limpieza de Comentarios Parentéticos (ej: "(visible on waistband).")
      cleanLine = cleanLine.replace(/\s*\([^)]+\)[.\s]*$/, "").trim();

      // 🛡️ FILTRO 5: Limpieza de Puntuación Final (ej: "Underwear.")
      cleanLine = cleanLine.replace(/[.;,]+$/, "").trim();

      if (cleanLine) {
        // Estrategia: Solo quedarnos con la ÚLTIMA versión de cada Header
        // (Gemma suele auto-corregirse al final)
        const parts = cleanLine.split(':');
        if (parts.length >= 2) {
          // Normalización Industrial de Headers (Elimina viñetas y espacios para evitar duplicados en anidados)
          const headerKey = parts[0].replace(/^[-*\s]+/, '').trim().toUpperCase();
          vistos.set(headerKey, cleanLine); // El mapa sobrescribe con el último valor (Last Value Wins)
        } else {
          // Si no tiene header pero pasó los filtros, lo guardamos por contenido
          vistos.set('RAW_' + cleanLine.toLowerCase(), cleanLine);
        }
      }
    }
    
    // Devolvemos los valores únicos (Last Value Wins)
    return Array.from(vistos.values()).join('\n');
  },

  /**
   * 🔬 LABORATORIO DE IA: Auditoría Transparente (Modo Escuela)
   * Realiza un análisis forense completo pero sin guardar resultados.
   */
  ejecutarPruebaLaboratorio: function(imagenId, metadata) {
    try {
      console.log(`🔬 [Lab-IA] Iniciando diagnóstico para imagen: ${imagenId}`);
      
      const ss = getActiveSS();
      const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
      const imgRow = this.buscarFilaPorValor(sheetImg, "PRODUCT_IMAGES", "IMAGEN_ID", imagenId);
        
      if (!imgRow) throw new Error("Imagen no encontrada en BD_PRODUCTO_IMAGENES.");

      const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
      const prodRow = this.buscarFilaPorValor(sheetProd, "PRODUCTS", "CODIGO_ID", imgRow.PRODUCTO_ID);
      
      const apiKey = GLOBAL_CONFIG.GEMINI.FREE_API_KEY || GLOBAL_CONFIG.GEMINI.API_KEY;
      
      // Construir Prompt Forense (Fase Industrial: Ignora metadata, reporta lo que ve)
      const contextoProducto = prodRow ? `PRODUCT: ${prodRow.MODELO || prodRow.NOMBRE_PRODUCTO} | BRAND: ${prodRow.MARCA}` : "";
      const promptForense = `Forensic Clothing Analyst for a high-precision ERP.
CRITICAL: PIXEL SOVEREIGNTY MANDATE. You must ignore metadata if it contradicts reality.
EXHAUSTIVE ANALYSIS REQUIRED. DO NOT BE BRIEF. BE TECHNICAL.

INSTRUCTION: Perform a multi-pass technical scan of the image and report EVERY detail using the following STRICT SCHEMA in SPANISH.

* SCHEMA:
- TIPO_PRENDA: Precise technical identification (e.g., Bermuda, Chupín, Remera).
- POSICIÓN_DETECTADA: [FRENTE / ESPALDA / LATERAL / PLANO / GHOST_MANNEQUIN / PILA_O_DOBLADO / INDETERMINADO]
- SOPORTE_O_CONTEXTO: [FOTO_ESTUDIO / COLGADA_EN_PERCHA / DOBLADA_EN_SUPERFICIE / SOBRE_MANIQUÍ / EN_PERCHERO_MULTIPLE]
- COLOR_PRINCIPAL: Technical color name, HEX and pattern (solid, printed, etc).
- MATERIAL_VISUAL: Describe the texture, weave, and weight of the fabric as seen.
- LOGO_O_MARCA: Describe location, size, and application technique (print/embroidery).
- DETALLES_CONSTRUCTIVOS: Exhaustive list of stitching type, zippers, buttons, elastics, and pockets.
- DETALLES_VISUALES: High-density descriptive paragraph for AI image generation (lighting, framing, state).
- ESTADO_VISUAL: [LIMPIO / Con etiquetas / Con maniquí visible]

* ERP CONTEXT (For reference only): ${metadata ? JSON.stringify(metadata) : contextoProducto}

IMPORTANT: Avoid conversational filler. Focus 100% on forensic evidence. Report one field per line.`;

      // PREPARAR BLOB (Optimizado para Gemma 4)
      const fileDataRef = prepararBlobOptimizado(imgRow.ARCHIVO_ID, `lab_${imagenId}`, 'alta', apiKey, true);

      // EJECUCIÓN RAW CON FALLBACK DINÁMICO (SOT: consultarGemma)
      let rawResponse = "";
      let modeloUsado = "";
      let ultimoError = "";

      for (const modelo of this.MODELS_FREE) {
        try {
          console.log(`🔬 [Lab-IA] Intentando con modelo: ${modelo}`);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
          
          const response = UrlFetchApp.fetch(url, {
            method: "post", contentType: "application/json",
            payload: JSON.stringify({
              contents: [{ parts: [{ text: promptForense }, fileDataRef] }],
              generationConfig: { 
                temperature: 0.1,
                maxOutputTokens: 1024
              }
            }),
            muteHttpExceptions: true
          });

          if (response.getResponseCode() === 200) {
            const resBody = JSON.parse(response.getContentText());
            if (resBody.candidates && resBody.candidates[0] && resBody.candidates[0].content) {
              rawResponse = resBody.candidates[0].content.parts[0].text;
              modeloUsado = modelo;
              console.log(`✅ [Lab-IA] Éxito con ${modelo}`);
              break;
            }
          }
          ultimoError = `Mod ${modelo} -> HTTP ${response.getResponseCode()}: ${response.getContentText()}`;
          console.warn(`⚠️ [Lab-IA] Fallo en ${modelo}: ${ultimoError}`);
        } catch (e) {
          ultimoError = `Mod ${modelo} -> ${e.message}`;
          console.warn(`❌ [Lab-IA] Excepción en ${modelo}: ${e.message}`);
        }
      }

      if (!rawResponse) throw new Error(`API Error ${ultimoError}`);
      
      const rawResponseText = rawResponse;

      // EJECUCIÓN CLEAN (Saneamiento Industrial)
      const forensicWhitelist = [
        "Brand", "Model", "Category", "Material", "Gender",
        "TIPO_PRENDA", "POSICIÓN_DETECTADA", "SOPORTE_O_CONTEXTO", 
        "COLOR_PRINCIPAL", "Nombre técnico", "Código HEX", "Tipo", "Patrón",
        "MATERIAL_ESTIMADO", "LOGO_O_MARCA", "Visible", "Detalle",
        "DETALLES_CONSTRUCTIVOS", "Costuras", "Cierres", "Bolsillos", "Elásticos",
        "AVISOS_DE_LIMPIEZA_VISIBLES", "ESTADO_VISUAL", "DETALLES_VISUALES"
      ];
      const cleanResponse = this.extraerContenido(rawResponse, forensicWhitelist);

      return {
        success: true,
        imagenId: imagenId,
        imageUrl: imgRow.URL || imgRow.THUMBNAIL_URL,
        modelo: modeloUsado,
        raw: rawResponseText,
        clean: cleanResponse,
        debug: this.generarLogDiferencial(rawResponseText, cleanResponse)
      };

    } catch (e) {
      console.error(`❌ [Lab-IA] Error fatal: ${e.message}`);
      return { success: false, error: e.message };
    }
  },

  /**
   * Helper para buscar una fila por valor en una hoja mapeada.
   */
  buscarFilaPorValor: function(sheet, sheetAlias, headerName, valor) {
    if (!sheet) return null;
    const map = HeaderManager.getMapping(sheetAlias);
    if (!map || map[headerName] === undefined) return null;
    
    const data = sheet.getDataRange().getValues();
    const colIdx = map[headerName];
    const target = String(valor).trim().toLowerCase();
    
    const row = data.find(r => String(r[colIdx]).trim().toLowerCase() === target);
    if (!row) return null;
    
    // Convertir fila a objeto usando el mapa
    const obj = {};
    Object.keys(map).forEach(key => {
      obj[key] = row[map[key]];
    });
    return obj;
  },

  generarLogDiferencial: function(raw, clean) {
    const rawLines = raw.split('\n');
    const cleanLines = clean.split('\n').map(l => l.trim().toLowerCase());
    return rawLines.map(line => {
      const l = line.trim();
      if (!l) return null;
      const isKept = cleanLines.some(c => l.toLowerCase().includes(c));
      return { text: l, status: isKept ? 'KEPT' : 'DISCARDED' };
    }).filter(Boolean);
  }
};

/**
 * WRAPPERS GLOBALES (Exposición para google.script.run)
 */
function ejecutarPruebaLaboratorio(imagenId, metadata) {
  return AIService.ejecutarPruebaLaboratorio(imagenId, metadata);
}
