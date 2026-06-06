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
    "gemma-4-26b-a4b-it",  // 🐢 PRECISIÓN: Peritaje forense profundo (110s)
    "gemini-2.5-flash"     // 🚀 AGILIDAD: Análisis multimodal rápido (5-10s)
  ],

  // Capa de Pago / Generación de Imagen (ai_model_standard.md - Capa 3)
  MODELS_PAID: [
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
    "imagen-4.0-generate-001",
    "imagen-3.0-generate-001"
  ],

  /**
   * CONSULTA GENERAL (FREE TIER)
   * Ideal para descripciones, análisis forense y auditoría.
   */
  consultarGemma(prompt, fileDataRef = null, configOverride = {}) {
    const apiKeysToTry = [];
    if (GLOBAL_CONFIG.GEMINI.FREE_API_KEY) apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.FREE_API_KEY, label: "Gratuita" });
    if (GLOBAL_CONFIG.GEMINI.API_KEY && (!GLOBAL_CONFIG.GEMINI.FREE_API_KEY || GLOBAL_CONFIG.GEMINI.API_KEY !== GLOBAL_CONFIG.GEMINI.FREE_API_KEY)) {
      apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.API_KEY, label: "Pago (Respaldo)" });
    }
    if (apiKeysToTry.length === 0) throw new Error("Falta API Key para IA.");

    let ultimoError = "";
    for (const modelo of this.MODELS_FREE) {
      for (const keyObj of apiKeysToTry) {
        const apiKey = keyObj.key;
        console.log("🧠 [AIService] Consultando con modelo " + modelo + " usando API Key: " + keyObj.label);

        let timeoutInSeconds = 60;
        if (modelo === "gemma-4-26b-a4b-it") {
          timeoutInSeconds = (keyObj.label === "Gratuita") ? 120 : 60;
        } else if (modelo === "gemini-2.5-flash") {
          timeoutInSeconds = 30;
        }

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
            muteHttpExceptions: true,
            timeoutInSeconds: timeoutInSeconds
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
          ultimoError = `Mod ${modelo} (${keyObj.label}) -> HTTP ${response.getResponseCode()}: ${response.getContentText()}`;
          console.warn(`⚠️ [AIService] ${ultimoError}`);
        } catch (e) {
          ultimoError = `Mod ${modelo} (${keyObj.label}) -> ${e.message}`;
          console.warn("❌ [AIService] Excepción: " + ultimoError);
        }
      }
    }
    throw new Error(`[AIService] Fallaron todos los modelos con las llaves disponibles: ${ultimoError}`);
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
          muteHttpExceptions: true,
          timeoutInSeconds: 120
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
  /**
   * 🛠️ EXTRACTOR TÉCNICO (Fase 1): Estrategia "Last Value Wins"
   * Ideal para esquemas tipo ERP donde solo importa el valor final de cada campo.
   */
  extraerContenido: function (texto, whitelistHeaders = null) {
    if (!texto) return "";
    let lineas = texto.split('\n');
    let vistos = new Map();

    const chatterKeywords = [
      "wait,", "i will", "let's", "final check", "self-correction", "i should",
      "prompt says", "refining schema", "final polish", "one more check",
      "double check", "self-correct", "during drafting", "polish:", "check:",
      "refining", "assignment_turned_in", "psychology", "mente raw", "output final",
      "mente de la ia", "ficha técnica", "schema check", "final check of the image",
      "refined output", "sandbox", "drafting", "let's go"
    ];

    for (let linea of lineas) {
      let l = linea.trim();
      if (!l) continue;

      // Filtrado agresivo de ruido
      if (chatterKeywords.some(word => l.toLowerCase().includes(word))) continue;
      if (/^[*#\s-]*$/.test(l)) continue; // Ignorar líneas solo con símbolos
      if (/^[*#\s-]*[a-z\s]+[?][\s]*(yes|no)/i.test(l)) continue;

      // Limpieza de Markdown
      let cleanLine = l.replace(/^#+\s+/, '').replace(/[*`]/g, '').trim();
      const parts = cleanLine.split(':');

      if (parts.length >= 2) {
        // Detectar si es sub-campo (empieza con guión)
        const isSubField = cleanLine.startsWith('-');
        const rawHeader = parts[0].replace(/^[-*\s]+/, '').trim();
        const headerKey = rawHeader.toUpperCase();

        // Si hay whitelist, validar
        if (whitelistHeaders && whitelistHeaders.length > 0) {
          if (!whitelistHeaders.map(h => h.toUpperCase()).includes(headerKey)) continue;
        }

        // Guardamos la línea limpia. Si es sub-campo, preservamos un indentado leve para estética
        const finalLine = isSubField ? `- ${rawHeader}: ${parts.slice(1).join(':').trim()}` : `${rawHeader}: ${parts.slice(1).join(':').trim()}`;
        vistos.set(headerKey, finalLine);
      }
    }

    // RECONSTRUCCIÓN POR ORDEN DE WHITELIST (Garantiza profesionalismo)
    let resultado = [];
    if (whitelistHeaders) {
      whitelistHeaders.forEach(h => {
        const key = h.toUpperCase();
        if (vistos.has(key)) {
          resultado.push(vistos.get(key));
        }
      });
    } else {
      resultado = Array.from(vistos.values());
    }

    return resultado.join('\n');
  },

  /**
   * 🧠 GENERADOR DE MENTE RAW CON MARCAS
   * Procesa la respuesta original de Gemma 4 línea por línea y marca con "* "
   * aquellas líneas que fueron descartadas o filtradas por el limpiador industrial.
   */
  generarMenteRawConMarcas: function (texto, whitelistHeaders, isNarrativo) {
    if (!texto) return "";
    const lineasOriginales = texto.split('\n');

    if (!isNarrativo) {
      // MODO FORENSE: Simular la extracción de vistos para identificar cuál fue la ganadora de cada header
      const ganadorIndice = new Map();
      const whitelistUpper = whitelistHeaders ? whitelistHeaders.map(h => h.toUpperCase()) : null;

      const chatterKeywords = [
        "wait,", "i will", "let's", "final check", "self-correction", "i should",
        "prompt says", "refining schema", "final polish", "one more check",
        "double check", "self-correct", "during drafting", "polish:", "check:",
        "refining", "assignment_turned_in", "psychology", "mente raw", "output final",
        "mente de la ia", "ficha técnica", "schema check", "final check of the image",
        "refined output", "sandbox", "drafting", "let's go"
      ];

      for (let idx = 0; idx < lineasOriginales.length; idx++) {
        let linea = lineasOriginales[idx];
        let l = linea.trim();
        if (!l) continue;

        if (chatterKeywords.some(word => l.toLowerCase().includes(word))) continue;
        if (/^[*#\s-]*$/.test(l)) continue;
        if (/^[*#\s-]*[a-z\s]+[?][\s]*(yes|no)/i.test(l)) continue;

        let cleanLine = l.replace(/^#+\s+/, '').replace(/[*`]/g, '').trim();
        const parts = cleanLine.split(':');

        if (parts.length >= 2) {
          const rawHeader = parts[0].replace(/^[-*\s]+/, '').trim();
          const headerKey = rawHeader.toUpperCase();

          if (whitelistUpper) {
            if (!whitelistUpper.includes(headerKey)) continue;
          }
          // Esta línea es candidata y potencialmente la ganadora
          ganadorIndice.set(headerKey, idx);
        }
      }

      const ganadorSet = new Set(ganadorIndice.values());
      const resultado = [];

      for (let idx = 0; idx < lineasOriginales.length; idx++) {
        const linea = lineasOriginales[idx];
        const trimmed = linea.trim();
        if (!trimmed) {
          resultado.push(linea);
          continue;
        }

        if (ganadorSet.has(idx)) {
          resultado.push(linea);
        } else {
          // Si ya empieza con '*' o similar, le añadimos el '* '
          if (linea.startsWith('* ')) {
            resultado.push(linea);
          } else {
            resultado.push(`* ${linea}`);
          }
        }
      }
      return resultado.join('\n');

    } else {
      // MODO NARRATIVO (Prompt Maestro)
      const chatterKeywords = [
        "convert a forensic", "wait,", "i will",
        "self-correction", "sandbox", "refining", "revised prompt", "correction:",
        "drafting", "polish:", "final check", "assignment_turned_in",
        "step 1", "step 2", "step 3", "thinking", "debate"
      ];
      const whitelistUpper = whitelistHeaders ? whitelistHeaders.map(h => h.toUpperCase()) : null;

      const conservadosIndices = new Set();
      let currentHeader = null;
      const indicesPorHeader = new Map();

      for (let idx = 0; idx < lineasOriginales.length; idx++) {
        let linea = lineasOriginales[idx];
        let l = linea.trim();
        if (!l) continue;

        if (chatterKeywords.some(word => l.toLowerCase().includes(word))) continue;

        let foundHeader = null;
        if (whitelistHeaders) {
          foundHeader = whitelistHeaders.find(h => {
            const regex = new RegExp(`(${h})[^a-z0-9]*:`, 'i');
            return regex.test(l);
          });
        }

        if (foundHeader) {
          currentHeader = foundHeader.toUpperCase();

          if (indicesPorHeader.has(currentHeader)) {
            const antiguosIndices = indicesPorHeader.get(currentHeader);
            antiguosIndices.forEach(i => conservadosIndices.delete(i));
          }
          indicesPorHeader.set(currentHeader, [idx]);
          conservadosIndices.add(idx);

          let parts = l.split(':');
          let val = parts.slice(-1)[0].replace(/^#+\s+/, '').replace(/[*`]/g, '').trim();
          // La línea del header se considera conservada
        } else if (currentHeader) {
          let cleanVal = l.replace(/^#+\s+/, '').replace(/[*`]/g, '').trim();
          if (cleanVal) {
            conservadosIndices.add(idx);
            indicesPorHeader.get(currentHeader).push(idx);
          }
        }
      }

      const resultado = [];
      for (let idx = 0; idx < lineasOriginales.length; idx++) {
        const linea = lineasOriginales[idx];
        const trimmed = linea.trim();
        if (!trimmed) {
          resultado.push(linea);
          continue;
        }

        if (conservadosIndices.has(idx)) {
          resultado.push(linea);
        } else {
          if (linea.startsWith('* ')) {
            resultado.push(linea);
          } else {
            resultado.push(`* ${linea}`);
          }
        }
      }
      return resultado.join('\n');
    }
  },

  /**
   * 💾 PERSISTENCIA DE LABORATORIO (BD_LABORATORIO_IA)
   * Gestiona el guardado y recuperación de pruebas para ahorrar tokens.
   */
  _obtenerHojaLab: function () {
    const ss = getActiveSS();
    let sheet = ss.getSheetByName(SHEETS.LAB_IA);
    const expectedHeaders = [
      "TIMESTAMP", "IMAGEN_ID", "SKU", "CATEGORIA", "ESTILO",
      "ANALISIS_FORENSE", "FORENSE_RAW", "PROMPT_MAESTRO", "PROMPT_RAW",
      "MODELO", "VERSION_REGLAS", "CONFIG_PARAMS"
    ];

    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.LAB_IA);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders])
        .setBackground("#4B0082").setFontColor("white").setFontWeight("bold");
      sheet.setFrozenRows(1);
    } else {
      // Validar si la hoja ya existe y si faltan columnas de forma segura
      const currentHeaders = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
      const missingHeaders = expectedHeaders.filter(h => !currentHeaders.includes(h));

      if (missingHeaders.length > 0) {
        console.log("🔧 [Lab-IA] Columnas faltantes detectadas en " + SHEETS.LAB_IA + ": " + missingHeaders.join(', ') + ". Actualizando...");
        let updatedHeaders = [...currentHeaders];
        missingHeaders.forEach(h => {
          updatedHeaders.push(h);
        });

        // Escribir los nuevos encabezados
        sheet.getRange(1, 1, 1, updatedHeaders.length).setValues([updatedHeaders]);

        // Aplicar el estilo al encabezado completo
        sheet.getRange(1, 1, 1, updatedHeaders.length)
          .setBackground("#4B0082").setFontColor("white").setFontWeight("bold");
      }
    }
    return sheet;
  },

  guardarResultadoLab: function (data) {
    try {
      const sheet = this._obtenerHojaLab();
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const colMap = {};
      headers.forEach((h, i) => colMap[h] = i);

      // Buscar si ya existe una entrada para esta Imagen (Consolidación por ID)
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][colMap.IMAGEN_ID] === data.imagenId) {
          rowIndex = i + 1;
          break;
        }
      }

      const newRow = rowIndex > 0 ? [...rows[rowIndex - 1]] : new Array(headers.length).fill("");

      newRow[colMap.TIMESTAMP] = new Date();
      newRow[colMap.IMAGEN_ID] = data.imagenId;
      if (data.sku) newRow[colMap.SKU] = data.sku;
      if (data.categoria) newRow[colMap.CATEGORIA] = data.categoria;
      if (data.estilo && data.estilo !== "FORENSIC_ONLY") newRow[colMap.ESTILO] = data.estilo;
      if (data.analisisForense) newRow[colMap.ANALISIS_FORENSE] = data.analisisForense;
      if (data.analisisForenseRaw !== undefined && colMap.FORENSE_RAW !== undefined) newRow[colMap.FORENSE_RAW] = data.analisisForenseRaw;
      if (data.promptMaestro) newRow[colMap.PROMPT_MAESTRO] = data.promptMaestro;
      if (data.promptMaestroRaw !== undefined && colMap.PROMPT_RAW !== undefined) newRow[colMap.PROMPT_RAW] = data.promptMaestroRaw;
      if (data.modelo) newRow[colMap.MODELO] = data.modelo;
      newRow[colMap.VERSION_REGLAS] = "v4.2 (Consolidado)";
      if (data.configParams !== undefined && colMap.CONFIG_PARAMS !== undefined) {
        newRow[colMap.CONFIG_PARAMS] = typeof data.configParams === 'string' ? data.configParams : JSON.stringify(data.configParams);
      }

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
      } else {
        sheet.appendRow(newRow);
      }
      return true;
    } catch (e) {
      console.error(`Error guardando en ${SHEETS.LAB_IA}:`, e.message);
      return false;
    }
  },

  obtenerCacheLab: function (imagenId) {
    try {
      const sheet = this._obtenerHojaLab();
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const colMap = {};
      headers.forEach((h, i) => colMap[h] = i);

      const match = data.find(r => r[colMap.IMAGEN_ID] === imagenId);
      if (match) {
        let configParamsObj = {};
        if (colMap.CONFIG_PARAMS !== undefined && match[colMap.CONFIG_PARAMS]) {
          try {
            configParamsObj = JSON.parse(match[colMap.CONFIG_PARAMS]);
          } catch (e) {
            console.warn("[Lab-IA] Error parseando CONFIG_PARAMS:", e.message);
          }
        }
        return {
          sku: match[colMap.SKU],
          categoria: match[colMap.CATEGORIA],
          estilo: match[colMap.ESTILO],
          analisisForense: match[colMap.ANALISIS_FORENSE],
          promptMaestro: match[colMap.PROMPT_MAESTRO],
          modelo: match[colMap.MODELO],
          configParams: configParamsObj
        };
      }
      return null;
    } catch (e) { return null; }
  },

  /**
   * 🧪 PROCESADOR DE LABORATORIO (Fase 1: Análisis Forense)
   * 🎨 EXTRACTOR NARRATIVO (Fase 2): Estrategia de Bloques Multilínea
   * Diseñado para el Prompt Maestro y razonamientos creativos extensos.
   */
  extraerContenidoNarrativo: function (texto, whitelistHeaders = null) {
    if (!texto) return "";
    let lineas = texto.split('\n');
    let bloques = new Map();
    let currentHeader = null;

    const chatterKeywords = [
      "convert a forensic", "wait,", "i will",
      "self-correction", "sandbox", "refining", "revised prompt", "correction:",
      "drafting", "polish:", "final check", "assignment_turned_in",
      "step 1", "step 2", "step 3", "thinking", "debate"
    ];

    for (let linea of lineas) {
      let l = linea.trim();
      if (!l) continue;

      // Filtrado de chatter antes de procesar
      if (chatterKeywords.some(word => l.toLowerCase().includes(word))) {
        // Si detectamos chatter de auto-corrección, podemos resetear el bloque actual si no es final
        continue;
      }

      // Identificar Nuevo Header (Compatible con Markdown y Prefijos tipo "Step 1: ")
      let foundHeader = null;
      if (whitelistHeaders) {
        foundHeader = whitelistHeaders.find(h => {
          // Busca la palabra clave precedida de cualquier cosa que no sea otra palabra clave
          // y seguida de un colon (:), ignorando si hay asteriscos o números antes.
          const regex = new RegExp(`(${h})[^a-z0-9]*:`, 'i');
          return regex.test(l);
        });
      }

      if (foundHeader) {
        currentHeader = foundHeader.toUpperCase();
        // IMPORTANTE: Si el header ya existe, lo reseteamos (Last Value Wins)
        bloques.set(currentHeader, []);

        let parts = l.split(':');
        // El valor es todo lo que viene después del ÚLTIMO colon del header
        let val = parts.slice(-1)[0].replace(/^#+\s+/, '').replace(/[*`]/g, '').trim();
        // Si el valor es igual al nombre del header, no lo agregamos como contenido
        if (val && val.toUpperCase() !== currentHeader) bloques.get(currentHeader).push(val);
      } else if (/^[#*\s]*([a-zA-Z_]{3,})[^a-z0-9]*:/i.test(l)) {
        // Es un encabezado genérico pero no está en la whitelist (detenemos acumulación en el bloque anterior)
        currentHeader = null;
      } else if (currentHeader) {
        let cleanVal = l.replace(/^#+\s+/, '').replace(/[*`]/g, '').trim();
        if (cleanVal) bloques.get(currentHeader).push(cleanVal);
      }
    }

    let resultado = [];
    bloques.forEach((contenido, header) => {
      // Solo devolvemos bloques que tengan contenido real
      if (contenido.length > 0) {
        resultado.push(`${header}:\n${contenido.join('\n')}`);
      }
    });
    return resultado.join('\n\n');
  },

  /**
   * 🔬 LABORATORIO DE IA: Auditoría Transparente (Modo Escuela)
   * Realiza un análisis forense completo pero sin guardar resultados.
   */
  ejecutarPruebaLaboratorio: function (imagenId, metadata, forzar = false, modeloForzado = null) {
    try {
      console.log(`🧪 [Lab-IA] Iniciando Fase 1 para imagen: ${imagenId}`);

      // 1. INTENTAR CARGAR DESDE CACHÉ (Ahorro de Tokens)
      if (!forzar) {
        const cache = this.obtenerCacheLab(imagenId);
        if (cache && cache.analisisForense) {
          console.log(`💾 [Lab-IA] Resultado recuperado de ${SHEETS.LAB_IA}`);
          return {
            success: true,
            modelo: cache.modelo + " (Cache)",
            clean: cache.analisisForense
          };
        }
      }

      const ss = getActiveSS();
      const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
      const imgRow = this.buscarFilaPorValor(sheetImg, "PRODUCT_IMAGES", "IMAGEN_ID", imagenId);

      if (!imgRow) throw new Error("Imagen no encontrada en BD_PRODUCTO_IMAGENES.");

      const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
      const prodRow = this.buscarFilaPorValor(sheetProd, "PRODUCTS", "CODIGO_ID", imgRow.PRODUCTO_ID);

      // Construir Prompt Forense (Fase Industrial: Ignora metadata, reporta lo que veo)
      const contextoProducto = prodRow ? "PRODUCT: " + (prodRow.MODELO || prodRow.NOMBRE_PRODUCTO) + " | BRAND: " + prodRow.MARCA + " | PARENT_CATEGORY: " + (prodRow.PARENT_CATEGORY || prodRow.CATEGORIA_PADRE) : "";
      const promptForense = `Forensic Clothing Analyst for a high-precision ERP.
Visual Pixel Sovereignty (report strictly what is seen for colors, patterns, and physical traits).
Metadata Inheritance (MANDATORY: Inherit MARCA, MODELO, CATEGORÍA, and GÉNERO exactly from the Context Reference, even if not visually identifiable in the image).
Plain text, one line per field, no bold, no markdown, no introductions.

* Context Reference (ERP): ${metadata ? JSON.stringify(metadata) : contextoProducto}
* Analysis Request: Technical forensic breakdown in SPANISH.
* Schema: 
MARCA: [Heredar de Context Reference. Exclusivo para indexación ERP]
MODELO: [Heredar de Context Reference. Exclusivo para indexación ERP]
CATEGORÍA: [Heredar de Context Reference]
MATERIAL: [Heredar de Context Reference, confirmando con textura visual]
GÉNERO: [Heredar de Context Reference]
CLASIFICACION_ESTRUCTURAL: [Analiza la prenda a partir de la imagen y los metadatos de referencia. Clasifícala estrictamente en una de las dos clasificaciones anatómicas: PRENDA_SUPERIOR (si se viste en la parte superior del cuerpo, ej. cubriendo cuello, hombros, torso, pecho o brazos) o PRENDA_INFERIOR (si se viste en la parte inferior del cuerpo, ej. cubriendo cintura, cadera, pelvis o piernas). Escribe estrictamente PRENDA_SUPERIOR o PRENDA_INFERIOR en mayúsculas sin más texto]
TIPO_PRENDA: [Categoría de mayor jerarquía / Familia, ej: ROPA INTERIOR]
POSICIÓN_DETECTADA: [FRENTE / ESPALDA / LATERAL / PLANO / GHOST_MANNEQUIN / PILA_O_DOBLADO / INDETERMINADO]
SOPORTE_O_CONTEXTO: [FOTO_ESTUDIO / COLGADA_EN_PERCHA / DOBLADA_EN_SUPERFICIE / SOBRE_MANIQUÍ / EN_PERCHERO_MULTIPLE]
COLOR_PRINCIPAL:
  - NOMBRE TÉCNICO: [e.g., Azul Marino]
  - CÓDIGO HEX: [e.g., #1A2B5C]
  - TIPO: [LISO / ESTAMPADO / SUBLIMADO / RAYADO / JASPEADO]
  - PATRÓN: [Descripción breve del estampado si existe]
MATERIAL_ESTIMADO: [Análisis visual contrastado con metadata]
LOGO_O_MARCA:
  - VISIBLE: [SÍ / NO. Rigurosamente visual en la tela. IMPORTANTE: Las etiquetas de cartón colgantes (hangtags) o perchas NO cuentan como logo visible en la prenda. Si solo hay una etiqueta de cartón colgante, escribe NO]
  - DETALLE: [Descripción, posición y tamaño en la tela del producto. Excluir rigurosamente las etiquetas de cartón colgantes y adjuntos de tienda]
DETALLES_CONSTRUCTIVOS:
  - COSTURAS: [Análisis de costuras, e.g., Flatlock, Overlock, Doble aguja. Si no es nítido o no se distingue, escribe estrictamente "Sin detalles visibles". NUNCA devuelvas corchetes vacíos, puntos suspensivos o marcadores vacíos]
  - CIERRES: [Análisis de cierres, e.g., Cierre frontal, botones, sin cierre. Si no es nítido o no se distingue, escribe estrictamente "Sin detalles visibles". NUNCA devuelvas corchetes vacíos, puntos suspensivos o marcadores vacíos]
  - BOLSILLOS: [Análisis de bolsillos, e.g., 2 bolsillos laterales, sin bolsillos. Si no es nítido o no se distingue, escribe estrictamente "Sin detalles visibles". NUNCA devuelvas corchetes vacíos, puntos suspensivos o marcadores vacíos]
  - ELÁSTICOS: [Análisis de elásticos, e.g., Cintura elástica, con cordón. Si no es nítido o no se distingue, escribe estrictamente "Sin detalles visibles". NUNCA devuelvas corchetes vacíos, puntos suspensivos o marcadores vacíos]
AVISOS_DE_LIMPIEZA_VISIBLES: [SÍ / NO]
ESTADO_VISUAL: [LIMPIO / Con etiquetas / Con maniquí visible]
DETALLES_VISUALES: [Descripción detallada para prompt de generación de imagen]

IMPORTANT: NO CONVERSATIONAL FILLER. NO SELF-CORRECTION LOGS. NO BOLD. NO INTRODUCTIONS.
Output ONLY the requested fields immediately using the exact UPPERCASE headers above.

[EJEMPLO DE SALIDA ESPERADA]:
MARCA: UOMO
MODELO: Dragónball
CATEGORÍA: Bóxer
MATERIAL: Algodón y poliéster
GÉNERO: Hombre
TIPO_PRENDA: ROPA INTERIOR
... (resto de campos) ...`;

      // Definir juego de API Keys para fallback
      const apiKeysToTry = [];
      if (GLOBAL_CONFIG.GEMINI.FREE_API_KEY) apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.FREE_API_KEY, label: "Gratuita" });
      if (GLOBAL_CONFIG.GEMINI.API_KEY && (!GLOBAL_CONFIG.GEMINI.FREE_API_KEY || GLOBAL_CONFIG.GEMINI.API_KEY !== GLOBAL_CONFIG.GEMINI.FREE_API_KEY)) {
        apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.API_KEY, label: "Pago (Respaldo)" });
      }
      if (apiKeysToTry.length === 0) throw new Error("No hay API Keys configuradas.");

      // Priorizar modelo forzado si existe
      let modelosATratar = [...this.MODELS_FREE];
      if (modeloForzado) {
        modelosATratar = [modeloForzado, ...modelosATratar.filter(m => m !== modeloForzado)];
      }

      // EJECUCIÓN CON FALLBACK DINÁMICO (SOT: consultarGemma)
      let rawResponse = "";
      let modeloUsado = "";
      let ultimoError = "";

      for (const modelo of modelosATratar) {
        for (const keyObj of apiKeysToTry) {
          const apiKey = keyObj.key;
          console.log(`🔬 [Lab-IA] Intentando Auditoría Forense con modelo ${modelo} y API Key ${keyObj.label}`);

          let timeoutInSeconds = 60;
          if (modelo === "gemma-4-26b-a4b-it") {
            timeoutInSeconds = (keyObj.label === "Gratuita") ? 120 : 60;
          } else if (modelo.includes("flash")) {
            timeoutInSeconds = 30;
          }

          try {
            // PREPARAR BLOB (Optimizado para Gemma/Gemini - Usando File API para mayor velocidad)
            // Se genera dentro del bucle de la llave para asociarse correctamente a la API Key activa.
            const fileDataRef = prepararBlobOptimizado(imgRow.ARCHIVO_ID, `lab_${imagenId}`, 'alta', apiKey, false);

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

            const payload = {
              contents: [{ parts: [{ text: promptForense }, fileDataRef] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048
              },
              safetySettings: typeof GEMINI_SAFETY_SETTINGS !== 'undefined' ? GEMINI_SAFETY_SETTINGS : [
                { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
                { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
                { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
                { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
              ]
            };

            // Inyectar JSON Schema si es modelo Gemini
            if (modelo.startsWith("gemini-")) {
              payload.generationConfig.responseMimeType = "application/json";
              payload.generationConfig.responseSchema = {
                type: "OBJECT",
                properties: {
                  MARCA: { type: "STRING" },
                  MODELO: { type: "STRING" },
                  CATEGORIA: { type: "STRING" },
                  MATERIAL: { type: "STRING" },
                  GENERO: { type: "STRING" },
                  CLASIFICACION_ESTRUCTURAL: {
                    type: "STRING",
                    enum: ["PRENDA_SUPERIOR", "PRENDA_INFERIOR"]
                  },
                  TIPO_PRENDA: { type: "STRING" },
                  POSICION_DETECTADA: {
                    type: "STRING",
                    enum: ["FRENTE", "ESPALDA", "LATERAL", "PLANO", "GHOST_MANNEQUIN", "PILA_O_DOBLADO", "INDETERMINADO"]
                  },
                  SOPORTE_O_CONTEXTO: {
                    type: "STRING",
                    enum: ["FOTO_ESTUDIO", "COLGADA_EN_PERCHA", "DOBLADA_EN_SUPERFICIE", "SOBRE_MANIQUÍ", "EN_PERCHERO_MULTIPLE"]
                  },
                  COLOR_PRINCIPAL: {
                    type: "OBJECT",
                    properties: {
                      NOMBRE_TECNICO: { type: "STRING" },
                      CODIGO_HEX: { type: "STRING" },
                      TIPO: {
                        type: "STRING",
                        enum: ["LISO", "ESTAMPADO", "SUBLIMADO", "RAYADO", "JASPEADO"]
                      },
                      PATRON: { type: "STRING" }
                    },
                    required: ["NOMBRE_TECNICO", "CODIGO_HEX", "TIPO", "PATRON"]
                  },
                  MATERIAL_ESTIMADO: { type: "STRING" },
                  LOGO_O_MARCA: {
                    type: "OBJECT",
                    properties: {
                      VISIBLE: { type: "STRING", enum: ["SÍ", "NO"] },
                      DETALLE: { type: "STRING" }
                    },
                    required: ["VISIBLE", "DETALLE"]
                  },
                  DETALLES_CONSTRUCTIVOS: {
                    type: "OBJECT",
                    properties: {
                      COSTURAS: { type: "STRING" },
                      CIERRES: { type: "STRING" },
                      BOLSILLOS: { type: "STRING" },
                      ELASTICOS: { type: "STRING" }
                    },
                    required: ["COSTURAS", "CIERRES", "BOLSILLOS", "ELASTICOS"]
                  },
                  AVISOS_DE_LIMPIEZA_VISIBLES: { type: "STRING", enum: ["SÍ", "NO"] },
                  ESTADO_VISUAL: { type: "STRING" },
                  DETALLES_VISUALES: { type: "STRING" }
                },
                required: [
                  "MARCA", "MODELO", "CATEGORIA", "MATERIAL", "GENERO",
                  "CLASIFICACION_ESTRUCTURAL", "TIPO_PRENDA", "POSICION_DETECTADA",
                  "SOPORTE_O_CONTEXTO", "COLOR_PRINCIPAL", "MATERIAL_ESTIMADO",
                  "LOGO_O_MARCA", "DETALLES_CONSTRUCTIVOS", "AVISOS_DE_LIMPIEZA_VISIBLES",
                  "ESTADO_VISUAL", "DETALLES_VISUALES"
                ]
              };
            }

            const response = UrlFetchApp.fetch(url, {
              method: "post", contentType: "application/json",
              payload: JSON.stringify(payload),
              muteHttpExceptions: true,
              timeoutInSeconds: timeoutInSeconds
            });

            if (response.getResponseCode() === 200) {
              const resBody = JSON.parse(response.getContentText());
              if (resBody.candidates && resBody.candidates[0] && resBody.candidates[0].content) {
                const candidate = resBody.candidates[0];
                const finishReason = candidate.finishReason || "STOP";
                const text = candidate.content.parts[0].text;

                if (finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
                  throw new Error(`Generación interrumpida por el servidor (finishReason: ${finishReason})`);
                }

                if (modelo.startsWith("gemini-")) {
                  // Esto validará que el JSON esté bien formado y lanzará un error si está corrupto,
                  // forzando el fallback automático a la llave de pago en lugar de fallar silenciosamente.
                  const parsedJson = JSON.parse(text);
                  const colorPrincipal = parsedJson.COLOR_PRINCIPAL || {};
                  const logoOMarca = parsedJson.LOGO_O_MARCA || {};
                  const detallesConstructivos = parsedJson.DETALLES_CONSTRUCTIVOS || {};

                  rawResponse = [
                    `MARCA: ${parsedJson.MARCA || ""}`,
                    `MODELO: ${parsedJson.MODELO || ""}`,
                    `CATEGORÍA: ${parsedJson.CATEGORIA || parsedJson.CATEGORÍA || ""}`,
                    `MATERIAL: ${parsedJson.MATERIAL || ""}`,
                    `GÉNERO: ${parsedJson.GENERO || parsedJson.GÉNERO || ""}`,
                    `CLASIFICACION_ESTRUCTURAL: ${parsedJson.CLASIFICACION_ESTRUCTURAL || ""}`,
                    `TIPO_PRENDA: ${parsedJson.TIPO_PRENDA || ""}`,
                    `POSICIÓN_DETECTADA: ${parsedJson.POSICION_DETECTADA || parsedJson.POSICIÓN_DETECTADA || ""}`,
                    `SOPORTE_O_CONTEXTO: ${parsedJson.SOPORTE_O_CONTEXTO || ""}`,
                    `COLOR_PRINCIPAL:`,
                    `  - NOMBRE TÉCNICO: ${colorPrincipal.NOMBRE_TECNICO || colorPrincipal.NOMBRE_TÉCNICO || ""}`,
                    `  - CÓDIGO HEX: ${colorPrincipal.CODIGO_HEX || colorPrincipal.CÓDIGO_HEX || ""}`,
                    `  - TIPO: ${colorPrincipal.TIPO || ""}`,
                    `  - PATRÓN: ${colorPrincipal.PATRON || colorPrincipal.PATRÓN || ""}`,
                    `MATERIAL_ESTIMADO: ${parsedJson.MATERIAL_ESTIMADO || ""}`,
                    `LOGO_O_MARCA:`,
                    `  - VISIBLE: ${logoOMarca.VISIBLE || ""}`,
                    `  - DETALLE: ${logoOMarca.DETALLE || ""}`,
                    `DETALLES_CONSTRUCTIVOS:`,
                    `  - COSTURAS: ${detallesConstructivos.COSTURAS || ""}`,
                    `  - CIERRES: ${detallesConstructivos.CIERRES || ""}`,
                    `  - BOLSILLOS: ${detallesConstructivos.BOLSILLOS || ""}`,
                    `  - ELÁSTICOS: ${detallesConstructivos.ELASTICOS || detallesConstructivos.ELÁSTICOS || ""}`,
                    `AVISOS_DE_LIMPIEZA_VISIBLES: ${parsedJson.AVISOS_DE_LIMPIEZA_VISIBLES || ""}`,
                    `ESTADO_VISUAL: ${parsedJson.ESTADO_VISUAL || ""}`,
                    `DETALLES_VISUALES: ${parsedJson.DETALLES_VISUALES || ""}`
                  ].join('\n');
                } else {
                  rawResponse = text;
                }
                modeloUsado = modelo;
                console.log(`✅ [Lab-IA] Éxito con ${modelo} usando API Key ${keyObj.label}`);
                break;
              }
            }
            ultimoError = `Mod ${modelo} (${keyObj.label}) -> HTTP ${response.getResponseCode()}: ${response.getContentText()}`;
            console.warn("⚠️ [Lab-IA] Fallo en " + modelo + ": " + ultimoError);
          } catch (e) {
            ultimoError = `Mod ${modelo} (${keyObj.label}) -> ${e.message}`;
            console.warn("❌ [Lab-IA] Excepción en " + modelo + ": " + e.message);
          }
        }
        if (rawResponse) break; // Si tuvimos éxito, salimos del bucle de modelos
      }

      if (!rawResponse) throw new Error("La IA no devolvió un análisis válido.");

      // 4. Limpieza Industrial
      const forensicWhitelist = [
        "MARCA", "MODELO", "CATEGORÍA", "MATERIAL", "GÉNERO", "CLASIFICACION_ESTRUCTURAL", "TIPO_PRENDA",
        "POSICIÓN_DETECTADA", "SOPORTE_O_CONTEXTO",
        "COLOR_PRINCIPAL", "NOMBRE TÉCNICO", "CÓDIGO HEX", "TIPO", "PATRÓN",
        "MATERIAL_ESTIMADO",
        "LOGO_O_MARCA", "VISIBLE", "DETALLE",
        "DETALLES_CONSTRUCTIVOS", "COSTURAS", "CIERRES", "BOLSILLOS", "ELÁSTICOS",
        "AVISOS_DE_LIMPIEZA_VISIBLES", "ESTADO_VISUAL", "DETALLES_VISUALES"
      ];
      const cleanResponse = this.extraerContenido(rawResponse, forensicWhitelist);

      // 5. GUARDAR EN CACHÉ
      const rawConMarcas = this.generarMenteRawConMarcas(rawResponse, forensicWhitelist, false);
      if (!metadata || !metadata.skipLabLog) {
        this.guardarResultadoLab({
          imagenId: imagenId,
          estilo: "FORENSIC_ONLY",
          sku: metadata.sku,
          categoria: metadata.categoria,
          analisisForense: cleanResponse,
          analisisForenseRaw: rawConMarcas,
          modelo: modeloUsado
        });
      }

      return {
        success: true,
        imagenId: imagenId,
        imageUrl: imgRow.URL || imgRow.THUMBNAIL_URL,
        modelo: modeloUsado,
        raw: rawConMarcas,
        clean: cleanResponse,
        debug: this.generarLogDiferencial(rawResponse, cleanResponse)
      };

    } catch (e) {
      console.error("❌ [Lab-IA] Error fatal: " + e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * FASE 2: PROMPT MAESTRO (Directiva de Arte)
   * Transforma el análisis forense en un prompt de alta fidelidad.
   */
  ejecutarGeneracionPromptMaestro: function (imagenIds, estilo, extraSpecs = {}, forzar = false) {
    try {
      if (!Array.isArray(imagenIds)) imagenIds = [imagenIds];
      const masterId = imagenIds[0];

      console.log("🧠 [Lab-IA] Generando Prompt Maestro para imágenes: " + imagenIds.join(', ') + " (Estilo: " + estilo + ")");
      if (extraSpecs.refinementInstruction) {
        console.log("🧠 [Lab-IA] Con Instrucción de Refinamiento: \"" + extraSpecs.refinementInstruction + "\"");
      }

      // 1. INTENTAR CARGAR DESDE CACHÉ (Solo si es 1 imagen)
      if (imagenIds.length === 1 && !forzar) {
        const cache = this.obtenerCacheLab(masterId);
        if (cache && cache.promptMaestro) {
          console.log(`💾 [Lab-IA] Prompt Maestro recuperado de ${SHEETS.LAB_IA}`);
          return {
            success: true,
            modelo: cache.modelo + " (Cache)",
            clean: cache.promptMaestro
          };
        }
      }

      const ss = getActiveSS();
      const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);

      const selectedRows = [];
      for (const id of imagenIds) {
        const row = this.buscarFilaPorValor(sheetImg, "PRODUCT_IMAGES", "IMAGEN_ID", id);
        if (row) selectedRows.push(row);
      }

      if (selectedRows.length === 0) throw new Error("Imágenes no encontradas.");
      const masterRow = selectedRows[0];

      const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
      const prodRow = this.buscarFilaPorValor(sheetProd, "PRODUCTS", "CODIGO_ID", masterRow.PRODUCTO_ID);

      // 3. Obtener Directivas de Arte según estilo
      let clasificacion = "";
      if (masterRow && masterRow.ANALISIS_FORENSE) {
        const forensic = String(masterRow.ANALISIS_FORENSE).toUpperCase();
        if (forensic.includes("CLASIFICACION_ESTRUCTURAL: PRENDA_SUPERIOR") || forensic.includes("PRENDA_SUPERIOR")) {
          clasificacion = "PRENDA_SUPERIOR";
        } else if (forensic.includes("CLASIFICACION_ESTRUCTURAL: PRENDA_INFERIOR") || forensic.includes("PRENDA_INFERIOR")) {
          clasificacion = "PRENDA_INFERIOR";
        }
      }
      if (!clasificacion && prodRow) {
        const cat = String(prodRow.CATEGORIA || prodRow.CATEGORIA_PADRE || "").toLowerCase();
        const upperKeywords = ['remera', 'buzo', 'camisa', 'campera', 'chaleco', 'chomba', 'musculosa', 'parka', 'sueter', 'tapado', 'blazer', 'saco', 'corpiño', 'top', 'brasier', 'camiseta', 'upper', 'superior', 'top'];
        if (upperKeywords.some(kw => cat.includes(kw))) {
          clasificacion = "PRENDA_SUPERIOR";
        } else {
          clasificacion = "PRENDA_INFERIOR";
        }
      }
      extraSpecs.clasificacionEstructural = clasificacion || "PRENDA_INFERIOR";
      extraSpecs.referenceCount = selectedRows.length;

      const directiva = this._getAiArtDirectionRules(estilo, extraSpecs, extraSpecs.environment, prodRow);

      let forensicSOT = extraSpecs.fichaForense;
      if (!forensicSOT) {
        forensicSOT = selectedRows.map((r, i) => {
          const typeLabel = i === 0 ? "MASTER" : `REFERENCE ${i}`;
          return `[FORENSIC AUDIT FOR IMAGE ${r.IMAGEN_ID} (${typeLabel})]:\n${r.ANALISIS_FORENSE || "N/A"}`;
        }).join('\n\n');
      }

      // Detectar si es Conjunto para ajustar el System Prompt
      const category = String(prodRow ? prodRow.CATEGORIA || prodRow.CATEGORIA_PADRE || '' : '').toLowerCase();
      const modelName = String(prodRow ? prodRow.MODELO || '' : '').toLowerCase();
      const styleName = String(prodRow ? prodRow.ESTILO || '' : '').toLowerCase();
      const skuCode = String(prodRow ? prodRow.SKU || prodRow.CODIGO_ID || '' : '').toLowerCase();
      const specsCategory = String(extraSpecs.categoria || '').toLowerCase();
      const specsSku = String(extraSpecs.sku || '').toLowerCase();

      let hasForensicConjunto = false;
      selectedRows.forEach(r => {
        if (r.ANALISIS_FORENSE && (
          String(r.ANALISIS_FORENSE).toLowerCase().includes("conjunto") ||
          String(r.ANALISIS_FORENSE).toLowerCase().includes("2 piezas") ||
          String(r.ANALISIS_FORENSE).toLowerCase().includes("dos piezas") ||
          String(r.ANALISIS_FORENSE).toLowerCase().includes("piezas")
        )) {
          hasForensicConjunto = true;
        }
      });
      if (extraSpecs.fichaForense && (
        String(extraSpecs.fichaForense).toLowerCase().includes("conjunto") ||
        String(extraSpecs.fichaForense).toLowerCase().includes("2 piezas") ||
        String(extraSpecs.fichaForense).toLowerCase().includes("dos piezas") ||
        String(extraSpecs.fichaForense).toLowerCase().includes("piezas")
      )) {
        hasForensicConjunto = true;
      }

      let isConjunto = category.includes("conjunto") ||
        modelName.includes("conjunto") ||
        styleName.includes("conjunto") ||
        skuCode.includes("conj") ||
        specsCategory.includes("conjunto") ||
        specsSku.includes("conj") ||
        hasForensicConjunto;

      // Salvaguarda técnica para lote de 1 referencia (evitar alucinaciones de conjunto si solo se muestra 1 prenda)
      if (isConjunto && selectedRows.length === 1) {
        const masterForensic = selectedRows[0].ANALISIS_FORENSE || extraSpecs.fichaForense || "";
        const forensicUpper = String(masterForensic).toUpperCase();
        const hasUpper = forensicUpper.includes("PRENDA_SUPERIOR");
        const hasLower = forensicUpper.includes("PRENDA_INFERIOR");
        const hasConjuntoText = forensicUpper.includes("CONJUNTO") ||
          forensicUpper.includes("2 PIEZAS") ||
          forensicUpper.includes("DOS PIEZAS") ||
          forensicUpper.includes("PIEZAS");

        if ((hasUpper && !hasLower && !hasConjuntoText) || (hasLower && !hasUpper && !hasConjuntoText)) {
          isConjunto = false;
        }
      }

      // 4. Build System Prompt (100% English except Spanish summary)
      const refinementSection = extraSpecs.refinementInstruction ? `
        [CRITICAL USER REFINEMENT DIRECTIVE]:
        The user has requested the following specific modification:
        "${extraSpecs.refinementInstruction}"
        You MUST apply this modification to the final scene description. Update the REASONING, VISUAL AUDIT, RESUMEN_ESPAÑOL, and MASTER PROMPT fields to reflect this change. Ensure all other details of the clothing item and its core structure from the forensic audit remain intact unless they directly conflict with this change.
      ` : "";

      const promptSistema = `
        [SYSTEM]: You are an Art Director for High-End Fashion Photography.
        [MISSION]: Convert forensic clothing audits AND visual references into a technical narrative description for an image generation engine (Stage 3).
  
        ${refinementSection}

        [GOLDEN RULES]:
        1. ABSOLUTE FIDELITY: Do not invent details that are not present in the forensic analysis.
        2. CINEMATIC LANGUAGE: Use precise lighting, composition, and material terminology.
        3. ORIENTATION PROTOCOL: Ensure the garment strictly maintains the detected orientation.
        4. NOISE REMOVAL: Clean up hangers, tags, or mannequins if the selected style requires it.
        ${isConjunto ? `5. TWO-PIECE SET MULTI-REFERENCE MANDATE: Since this is a TWO-PIECE SET (Conjunto), all provided images represent components of the same set. You MUST combine the forensic audits and visual references of ALL provided images. Ensure BOTH the upper garment (e.g. jacket/hoodie/t-shirt) and the lower garment (e.g. pants/joggers/shorts) are richly and fully described in terms of colors, materials, zippers, hoods, waistbands, and design features in the final MASTER PROMPT. Do NOT omit or simplify either garment.` : `5. MULTI-REFERENCE HANDLING: The FIRST image is the MASTER (Hero). Use it for shape, fit, and primary identity. The other images are REFERENCES for texture, logos, and hidden details.`}
        6. BRAND HALLUCINATION PREVENTION & HANGTAG CLEANUP: 
           - Cardboard hangtags, price tags, and plastic retail attachments visible in the references MUST be completely ignored and NEVER described as logos, prints, or text on the fabric.
           - If the Forensic Audit states LOGO_O_MARCA is "NO" or "No visible", or if the logo is only present on a temporary cardboard hangtag, you MUST NOT include the brand name, model name, or any text in the final narrative description. Describe only the garment's pure visual geometry, construction, and solid colors to prevent the image generator from hallucinating text on the fabric.
  
        ${isConjunto ? `
        [TWO-PIECE SET CRITICAL DIRECTIVE]:
        * Since this is a two-piece set, your generated MASTER PROMPT must describe BOTH garments together as a single outfit, specifying the full color and style of each item (e.g. 'dusty pink hooded jacket paired with dark gray neoprene pants'). You must never describe only one garment.` : ""}

        ${directiva.prefix}
        ${directiva.promptRules}
        ${directiva.modelAdaptation}
  
        [SOT - SOURCE OF TRUTH (FORENSIC AUDITS)]:
        ${forensicSOT}
  
        [OUTPUT STRUCTURE MANDATE]:
        You MUST structure your response with these exact headers:
        REASONING: [Your reasoning in English]
        VISUAL AUDIT: [Your audit in English]
        RESUMEN_ESPAÑOL: [A detailed, complete description of the scene in SPANISH for the cataloger, translating all key details of the garment, colors, patterns, model features, pose, clothing styling, background, and lighting, without sentence limits, so the cataloger can audit the entire prompt details in Spanish.]
        MASTER PROMPT: [The final technical prompt in English]

        [MANDATORY OUTPUT FORMAT - FOLLOW THIS EXACT EXAMPLE]:
${directiva.exampleBlock}
  
        CRITICAL: 
        - ALL output MUST be in ENGLISH (Reasoning, Audit, and Master Prompt), EXCEPT for the RESUMEN_ESPAÑOL block which MUST be in SPANISH.
        - NO internal chatter, NO "Step 1", NO "Checklist" at the end.
      `;

      // Definir juego de API Keys para fallback
      const apiKeysToTry = [];
      if (GLOBAL_CONFIG.GEMINI.FREE_API_KEY) apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.FREE_API_KEY, label: "Gratuita" });
      if (GLOBAL_CONFIG.GEMINI.API_KEY && (!GLOBAL_CONFIG.GEMINI.FREE_API_KEY || GLOBAL_CONFIG.GEMINI.API_KEY !== GLOBAL_CONFIG.GEMINI.FREE_API_KEY)) {
        apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.API_KEY, label: "Pago (Respaldo)" });
      }
      if (apiKeysToTry.length === 0) throw new Error("No hay API Keys configuradas.");

      // 5. Ejecución RAW Multimodal
      let rawResponse = "";
      let modeloUsado = "";

      // Construir lista dinámica de modelos priorizando el seleccionado por el usuario
      const modelosATratar = [];
      if (extraSpecs.analysisModel) {
        modelosATratar.push(extraSpecs.analysisModel);
      }
      const fallbacks = ["gemma-4-26b-a4b-it"];
      for (const fb of fallbacks) {
        if (!modelosATratar.includes(fb)) {
          modelosATratar.push(fb);
        }
      }

      for (const modelo of modelosATratar) {
        for (const keyObj of apiKeysToTry) {
          const apiKey = keyObj.key;
          console.log(`🧠 [Lab-IA] Intentando Prompt Maestro con modelo ${modelo} y API Key ${keyObj.label}`);

          let timeoutInSeconds = 60;
          if (modelo === "gemma-4-26b-a4b-it") {
            timeoutInSeconds = (keyObj.label === "Gratuita") ? 120 : 60;
          } else if (modelo.includes("flash")) {
            timeoutInSeconds = 30;
          }

          try {
            // 2. Preparar Blobs Multimodales (File API) para esta llave activa
            const imagePartsArray = [];
            for (const row of selectedRows) {
              if (!row.ARCHIVO_ID) continue;
              const fileDataPart = prepararBlobOptimizado(row.ARCHIVO_ID, `maestro_${row.IMAGEN_ID}`, 'alta', apiKey);
              if (fileDataPart) imagePartsArray.push(fileDataPart);
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

            let partsData = [{ text: promptSistema }];
            if (imagePartsArray.length > 0) {
              partsData = partsData.concat(imagePartsArray);
            }

            const payload = {
              contents: [{ parts: partsData }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
            };

            const response = UrlFetchApp.fetch(url, {
              method: "post", contentType: "application/json",
              payload: JSON.stringify(payload),
              muteHttpExceptions: true,
              timeoutInSeconds: timeoutInSeconds
            });

            if (response.getResponseCode() === 200) {
              const resJson = JSON.parse(response.getContentText());
              if (resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content) {
                rawResponse = resJson.candidates[0].content.parts[0].text;
                modeloUsado = modelo;
                console.log(`✅ [Lab-IA] Éxito con ${modelo} usando API Key ${keyObj.label}`);
                break;
              }
            } else {
              console.warn("⚠️ [Lab-IA] Falló " + modelo + " (" + keyObj.label + ") -> HTTP " + response.getResponseCode() + ": " + response.getContentText());
            }
          } catch (e) {
            console.warn("Fallo en " + modelo + " (" + keyObj.label + "): " + e.message);
          }
        }
        if (rawResponse) break;
      }

      if (!rawResponse) throw new Error("No se pudo generar el prompt maestro multireferencia.");

      // 6. Industrial Cleanup (Pure English)
      const whitelist = [
        "REASONING", "VISUAL AUDIT", "AUDIT", "MASTER PROMPT", "PROMPT"
      ];
      let cleanResponse = this.extraerContenidoNarrativo(rawResponse, whitelist);

      // 6.5. Traducción automática programática de MASTER PROMPT / PROMPT a Español
      let masterPromptText = "";
      const masterMatch = cleanResponse.match(/(?:MASTER )?PROMPT\s*:\s*([\s\S]+)/i);
      if (masterMatch) {
        masterPromptText = masterMatch[1].trim();
      }

      let resumenEspanolText = "";
      if (masterPromptText) {
        try {
          resumenEspanolText = LanguageApp.translate(masterPromptText, "en", "es");
          console.log("🌐 [LanguageApp] Traducido Master Prompt a Español con éxito.");
        } catch (e) {
          console.warn("⚠️ [LanguageApp] Falló traducción: " + e.message);
          resumenEspanolText = "Error al traducir el prompt al español.";
        }
      }
      // Limpiar cualquier etiqueta RESUMEN_ESPAÑOL preexistente generada espontáneamente por el LLM en cleanResponse
      cleanResponse = cleanResponse.replace(/RESUMEN_ESPAÑOL\s*:[\s\S]*?(?=(?:[A-Z_]+:|$))/i, "").trim();

      // Re-insertar RESUMEN_ESPAÑOL traducido antes del MASTER PROMPT o PROMPT en cleanResponse para compatibilidad
      if (resumenEspanolText) {
        cleanResponse = cleanResponse.replace(
          /((?:MASTER )?PROMPT\s*:)/i,
          "RESUMEN_ESPAÑOL:\n" + resumenEspanolText + "\n\n$1"
        );
      }

      // 7. GUARDAR EN CACHÉ (Solo guardamos con el ID del Master para consolidación)
      const rawConMarcas = this.generarMenteRawConMarcas(rawResponse, whitelist, true);
      if (!extraSpecs || !extraSpecs.skipLabLog) {
        this.guardarResultadoLab({
          imagenId: masterId,
          estilo: estilo,
          promptMaestro: cleanResponse,
          promptMaestroRaw: rawConMarcas,
          modelo: modeloUsado,
          configParams: extraSpecs
        });
      }

      return {
        success: true,
        modelo: modeloUsado,
        raw: rawConMarcas,
        clean: cleanResponse,
        debug: this.generarLogDiferencial(rawResponse, cleanResponse)
      };

    } catch (e) {
      console.error("❌ [Lab-IA] Error fatal: " + e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * FASE 2.5: REFINAMIENTO DE PROMPT POR VOZ (Multimodal)
   * Escucha el audio dictado por el usuario y refina semánticamente el Prompt Maestro.
   */
  ejecutarRefinamientoPromptPorVoz: function (imagenId, currentPrompt, base64Audio, mimeType, isAudio = true, estilo = null, extraSpecs = {}) {
    try {
      console.log(`🧠 [Lab-IA] Refinando Prompt Maestro por ${isAudio ? 'voz' : 'texto'} para imagen: ${imagenId}`);
      if (!base64Audio) throw new Error(isAudio ? "Falta el audio en Base64." : "Falta la instrucción de texto.");

      // Definir juego de API Keys para fallback
      const apiKeysToTry = [];
      if (GLOBAL_CONFIG.GEMINI.FREE_API_KEY) apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.FREE_API_KEY, label: "Gratuita" });
      if (GLOBAL_CONFIG.GEMINI.API_KEY && (!GLOBAL_CONFIG.GEMINI.FREE_API_KEY || GLOBAL_CONFIG.GEMINI.API_KEY !== GLOBAL_CONFIG.GEMINI.FREE_API_KEY)) {
        apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.API_KEY, label: "Pago (Respaldo)" });
      }
      if (apiKeysToTry.length === 0) throw new Error("No hay API Keys configuradas.");

      let cleanedInstruction = "";

      // 1. FASE DE TRADUCCIÓN / LIMPIEZA CON GEMINI 2.5 FLASH
      console.log(`🧠 [Lab-IA] Fase 2.5: Traducción y limpieza de instrucción con gemini-2.5-flash`);

      const systemPromptTraductor = `
        [SYSTEM]: You are a translation and transcription assistant for a fashion design system.
        [MISSION]: Analyze the designer's instructions (which may be a spoken audio file in Spanish or a typed text in Spanish/English, potentially with pronunciation errors, typos, or slang).
        Your job is to translate and clean this instruction into a clear, concise design update instruction in English.
        
        [RULES]:
        - Do NOT include any conversational filler, introductory remarks, or explanations.
        - Output ONLY the clean, translated instruction in English (e.g. "Add a wide, baggy style to the cargo bermuda shorts" or "Change background to warm sand beach").
        - Keep it extremely concise and direct.
      `;

      let rawTransResp = "";
      const modelosATratar = ["gemini-2.5-flash"];

      for (const modelo of modelosATratar) {
        for (const keyObj of apiKeysToTry) {
          const apiKey = keyObj.key;
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

            let inputPart;
            if (isAudio) {
              inputPart = {
                inlineData: {
                  mimeType: mimeType || "audio/webm",
                  data: base64Audio
                }
              };
            } else {
              inputPart = { text: `INSTRUCCIÓN EN ESPAÑOL DEL USUARIO: "${base64Audio}"` };
            }

            const payload = {
              systemInstruction: { parts: [{ text: systemPromptTraductor }] },
              contents: [{ parts: [inputPart] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 256
              }
            };

            const response = UrlFetchApp.fetch(url, {
              method: "post",
              contentType: "application/json",
              payload: JSON.stringify(payload),
              muteHttpExceptions: true,
              timeoutInSeconds: 45
            });

            if (response.getResponseCode() === 200) {
              const resJson = JSON.parse(response.getContentText());
              if (resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content) {
                rawTransResp = resJson.candidates[0].content.parts[0].text;
                console.log("✅ [Lab-IA] Instrucción limpia obtenida con " + modelo + ": \"" + rawTransResp.trim() + "\"");
                break;
              }
            }
            console.warn("⚠️ [Lab-IA] Fallo traduciendo con " + modelo + ": " + response.getResponseCode());
          } catch (e) {
            console.warn("❌ [Lab-IA] Excepción traduciendo con " + modelo + ": " + e.message);
          }
        }
        if (rawTransResp) break;
      }

      if (rawTransResp) {
        cleanedInstruction = rawTransResp.trim();
      } else {
        if (!isAudio) {
          cleanedInstruction = base64Audio;
        } else {
          throw new Error("No se pudo transcribir o traducir la instrucción de voz.");
        }
      }

      // 2. FASE DE RE-GENERACIÓN CON EL MODELO DE ALTA POTENCIA
      console.log("🧠 [Lab-IA] Ejecutando regeneración de prompt con la instrucción limpia: \"" + cleanedInstruction + "\"");

      const cache = this.obtenerCacheLab(imagenId);
      let estiloFinal = estilo;
      let specsFinal = { ...extraSpecs };

      if (cache) {
        if (!estiloFinal && cache.estilo && cache.estilo !== "FORENSIC_ONLY") {
          estiloFinal = cache.estilo;
        }
        if (cache.configParams && Object.keys(cache.configParams).length > 0) {
          // Fusionar las especificaciones guardadas en caché con las nuevas
          specsFinal = { ...cache.configParams, ...specsFinal };
        }
      }
      if (!estiloFinal) estiloFinal = "ecommerce";

      const resultMaestro = this.ejecutarGeneracionPromptMaestro(
        [imagenId],
        estiloFinal,
        {
          ...specsFinal,
          refinementInstruction: cleanedInstruction,
          originalPrompt: currentPrompt
        },
        true // Forzar regeneración
      );

      if (resultMaestro.success && resultMaestro.clean) {
        // Persistir en la columna de la hoja comercial BD_PRODUCTO_IMAGENES
        actualizarCeldaPorHeader(imagenId, 'PROMPT', resultMaestro.clean);
      }

      return resultMaestro;

    } catch (e) {
      console.error("❌ [Lab-IA] Error en refinamiento de prompt: " + e.message);
      return { success: false, error: e.message };
    }
  },

  transcribirAudio: function (base64Audio, mimeType) {
    try {
      console.log(`🧠 [Lab-IA] Transcribiendo audio para refinamiento pago.`);
      if (!base64Audio) throw new Error("Falta el audio en Base64.");

      // Definir juego de API Keys para fallback
      const apiKeysToTry = [];
      if (GLOBAL_CONFIG.GEMINI.FREE_API_KEY) apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.FREE_API_KEY, label: "Gratuita" });
      if (GLOBAL_CONFIG.GEMINI.API_KEY && (!GLOBAL_CONFIG.GEMINI.FREE_API_KEY || GLOBAL_CONFIG.GEMINI.API_KEY !== GLOBAL_CONFIG.GEMINI.FREE_API_KEY)) {
        apiKeysToTry.push({ key: GLOBAL_CONFIG.GEMINI.API_KEY, label: "Pago (Respaldo)" });
      }
      if (apiKeysToTry.length === 0) throw new Error("No hay API Keys configuradas.");

      const promptSistema = "Transcribe el siguiente audio exactamente a texto en español. Devuelve únicamente la transcripción limpia, sin comentarios, sin introducciones y sin formateos extras.";

      let rawResponse = "";
      for (const keyObj of apiKeysToTry) {
        for (const modelo of ["gemini-2.5-flash"]) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${keyObj.key}`;
            const payload = {
              contents: [{
                parts: [
                  { text: promptSistema },
                  {
                    inlineData: {
                      mimeType: mimeType || "audio/webm",
                      data: base64Audio
                    }
                  }
                ]
              }]
            };

            const response = UrlFetchApp.fetch(url, {
              method: "post",
              contentType: "application/json",
              payload: JSON.stringify(payload),
              muteHttpExceptions: true
            });

            if (response.getResponseCode() === 200) {
              const resJson = JSON.parse(response.getContentText());
              if (resJson.candidates && resJson.candidates[0].content.parts[0].text) {
                rawResponse = resJson.candidates[0].content.parts[0].text.trim();
                break;
              }
            }
          } catch (e) {
            console.warn(`Error en transcripción con ${modelo}: ${e.message}`);
          }
        }
        if (rawResponse) break;
      }

      if (!rawResponse) throw new Error("No se pudo transcribir el audio.");
      return { success: true, text: rawResponse };

    } catch (e) {
      console.error("❌ [Lab-IA] Error transcribiendo audio: " + e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 🏭 FÁBRICA DE DIRECCIÓN DE ARTE (Industrializada con Referencia SOT)
   * Integra meses de desarrollo de Images.js con la flexibilidad del Laboratorio.
   */
  _getAiArtDirectionRules: function (estiloSolicitado, extraSpecs = {}, environment = 'Studio', prodRow = null) {
    const estilo = String(estiloSolicitado || 'ecommerce').toLowerCase();
    const genero = String(prodRow ? prodRow.GENERO || prodRow.GENDER || 'UNISEX' : 'UNISEX').toUpperCase();

    // Detección Inteligente de "Conjunto" (Prendas de dos o más piezas)
    const category = String(prodRow ? prodRow.CATEGORIA || prodRow.CATEGORIA_PADRE || '' : '').toLowerCase();
    const modelName = String(prodRow ? prodRow.MODELO || '' : '').toLowerCase();
    const styleName = String(prodRow ? prodRow.ESTILO || '' : '').toLowerCase();
    const skuCode = String(prodRow ? prodRow.SKU || prodRow.CODIGO_ID || '' : '').toLowerCase();
    const specsCategory = String(extraSpecs.categoria || '').toLowerCase();
    const specsSku = String(extraSpecs.sku || '').toLowerCase();

    let hasForensicConjunto = false;
    if (extraSpecs.fichaForense && (
      String(extraSpecs.fichaForense).toLowerCase().includes("conjunto") ||
      String(extraSpecs.fichaForense).toLowerCase().includes("2 piezas") ||
      String(extraSpecs.fichaForense).toLowerCase().includes("dos piezas") ||
      String(extraSpecs.fichaForense).toLowerCase().includes("piezas")
    )) {
      hasForensicConjunto = true;
    }

    let isConjunto = category.includes("conjunto") ||
      modelName.includes("conjunto") ||
      styleName.includes("conjunto") ||
      skuCode.includes("conj") ||
      specsCategory.includes("conjunto") ||
      specsSku.includes("conj") ||
      hasForensicConjunto;

    // Salvaguarda técnica para lote de 1 referencia (evitar alucinaciones de conjunto si solo se muestra 1 prenda)
    if (isConjunto && (extraSpecs.referenceCount === 1 || !extraSpecs.referenceCount)) {
      const masterForensic = extraSpecs.fichaForense || "";
      const forensicUpper = String(masterForensic).toUpperCase();
      const hasUpper = forensicUpper.includes("PRENDA_SUPERIOR");
      const hasLower = forensicUpper.includes("PRENDA_INFERIOR");
      const hasConjuntoText = forensicUpper.includes("CONJUNTO") ||
        forensicUpper.includes("2 PIEZAS") ||
        forensicUpper.includes("DOS PIEZAS") ||
        forensicUpper.includes("PIEZAS");

      if ((hasUpper && !hasLower && !hasConjuntoText) || (hasLower && !hasUpper && !hasConjuntoText)) {
        isConjunto = false;
      }
    }

    // 1. LÓGICA DE SUPERFICIES Y PROPS (De Images.js)
    const surfaces = {
      'studio_minimalist': "a high-end photography studio surface (Neutral Soft Gray or Professional Off-White)",
      'luxury_marble': "a polished luxury white marble surface with soft, realistic reflections",
      'dark_oak': "a textured natural dark oak wood surface with a warm boutique feel",
      'industrial_concrete': "a matte industrial concrete surface for a modern, high-contrast look",
      'soft_linen': "a soft, organic linen fabric background with natural folds"
    };
    const surfaceInstruction = surfaces[environment] || "a professional studio surface";

    let genderProps = "";
    if (genero === 'FEMENINO' || genero === 'MUJER') {
      genderProps = "- GENDER CONTEXT: Subtly signal a feminine target audience with soft-focus props in the distance, like a minimalist vase or a high-end fashion Lookbook.";
    } else if (genero === 'MASCULINO' || genero === 'HOMBRE') {
      genderProps = "- GENDER CONTEXT: Subtly signal a masculine target audience using sober industrial surfaces or minimalist dark accents in the distance.";
    }

    // 2. CONFIGURACIÓN MAESTRA DE ESTILOS (Integración SOT con Legado de Images.js)
    const STYLE_CONFIG = {
      'ghost': {
        base: isConjunto
          ? "GHOST MANNEQUIN EFFECT: Professional 3D volumetric reconstruction of a two-piece set (invisible body effect)."
          : "GHOST MANNEQUIN EFFECT: Professional 3D volumetric reconstruction. Invisible body effect.",
        rules: isConjunto
          ? `
          - NOISE REMOVAL MANDATE: ABSOLUTELY NO HANGERS, NO RETAIL TAGS, NO PLASTIC HOOKS. The garments must be completely clean of any retail attachments.
          - TWO-PIECE VOLUME COMPOSITION: Both the upper garment and lower garment must be arranged together in a natural, cohesive, floating 3D set showing full volume.
          - CENTRALIZATION: The entire two-piece set MUST be PERFECTLY CENTERED on the canvas.
          - SYMMETRY MANDATE: Ensure both leg openings, sleeves, and overall set shape are geometrically symmetrical and balanced.
          - SHADOW REMOVAL: Erase any trace of mannequin shadows. 
          - CONTACT SHADOW: Add a extremely subtle, realistic contact shadow on the ground.
          - OPENINGS: Show hollow openings with visible inner fabric at the neck, sleeves, waistband, and leg cuffs.
          - INNER CUT MANDATE: The inner fabric cuts must follow clean geometric perspective, AVOIDING distorted rear fabric.
          - TEXTURE FIDELITY: Maintain all technical fabric details (mesh, stitching, prints) for both garments.
          - Background: Pure solid white #FFFFFF. 
          - ABSOLUTELY NO MODELS, HUMAN BODIES, OR VISIBLE MANNEQUINS.`
          : `
          - NOISE REMOVAL MANDATE: ABSOLUTELY NO HANGERS, NO RETAIL TAGS, NO PLASTIC HOOKS. The garment must be completely clean of any retail attachments.
          - LIGHTING: High-end multi-point studio setup to define shape and volume. Uniform Softbox lighting.
          - CENTRALIZATION: The garment MUST be PERFECTLY CENTERED on the canvas.
          - SYMMETRY MANDATE: Ensure both leg openings and overall shape are geometrically symmetrical and balanced.
          - SHADOW REMOVAL: Erase any trace of mannequin shadows. 
          - CONTACT SHADOW: Add a extremely subtle, realistic contact shadow on the ground.
          - OPENINGS: Show hollow openings with visible inner fabric.
          - INNER CUT MANDATE: The inner fabric cut must follow clean geometric perspective, AVOIDING distorted rear fabric.
          - TEXTURE FIDELITY: Maintain all technical fabric details (mesh, stitching, prints).
          - Background: Pure solid white #FFFFFF. 
          - ABSOLUTELY NO MODELS, HUMAN BODIES, OR VISIBLE MANNEQUINS.`,
        focus: (() => {
          if (isConjunto) {
            return "- TWO-PIECE SET OPENINGS: Show subtle, natural, and shallow 3D hollow depth at all openings (neck, sleeves, waistband, and leg openings) naturally, keeping them elegant, symmetrical, and realistic.";
          }
          const clasif = extraSpecs.clasificacionEstructural || "PRENDA_INFERIOR";
          const focus = extraSpecs.focus || "";
          if (clasif === "PRENDA_SUPERIOR") {
            if (focus === "waist") {
              return "- USER FOCUS REQUEST: Upper Neck/Collar opening.\n- EXCLUSIVITY MANDATE: Show a subtle, elegant, shallow 3D hollow volume showing realistic depth strictly at the top collar/neck opening. Keep it shallow and clean. The bottom hem and sleeve openings MUST be strictly flat, closed, solid, and sealed (no hollow opening or internal fabric showing).";
            } else if (focus === "legs") {
              return "- USER FOCUS REQUEST: Bottom Hem/Sleeve openings.\n- EXCLUSIVITY MANDATE: Show subtle, clean, shallow 3D hollow volumes strictly at the sleeve openings and the bottom hem. The upper collar/neck opening MUST be strictly flat, closed, solid, and sealed (no hollow opening or internal fabric showing).";
            } else {
              return "- USER FOCUS REQUEST: Balanced/General.\n- MANDATE: Show subtle, natural, and shallow 3D hollow depth at all openings naturally (neck, sleeves, and bottom hem), keeping them elegant and realistic.";
            }
          } else { // PRENDA_INFERIOR
            if (focus === "waist") {
              return "- USER FOCUS REQUEST: Waistband opening.\n- EXCLUSIVITY MANDATE: Show a subtle, elegant, shallow 3D hollow volume showing realistic depth strictly at the waistband. The leg openings/bottom cuffs MUST be strictly flat, closed, solid, and sealed (no hollow opening or internal fabric showing).";
            } else if (focus === "legs") {
              return "- USER FOCUS REQUEST: Leg openings.\n- EXCLUSIVITY MANDATE: Show subtle, clean, shallow 3D hollow volumes strictly at the leg openings showing realistic depth. The waistband/top opening MUST be strictly flat, closed, solid, and sealed (no hollow opening or internal fabric showing).";
            } else {
              return "- USER FOCUS REQUEST: Balanced/General.\n- MANDATE: Show subtle, natural, and shallow 3D hollow depth at both openings (waistband and leg openings) naturally, keeping them elegant and realistic.";
            }
          }
        })(),
        example: isConjunto
          ? `        **REASONING:** Ghost Mannequin style is applied to the two-piece set by removing the physical support and visible mannequin. Volumetric 3D shape and symmetry of both the upper and lower garments are highlighted.
        **VISUAL AUDIT:** [X] Brand, [X] Color, [X] No Humans, [X] White Background.
        **MASTER PROMPT:** High-end studio photography, ghost mannequin effect, 3D volumetric shape of a two-piece set in [COLOR], perfectly centered, symmetrical, pure white background #FFFFFF, 8k.`
          : `        **REASONING:** Ghost Mannequin style is applied by removing the physical support and visible mannequin. 3D volume and symmetry are highlighted.
        **VISUAL AUDIT:** [X] Brand, [X] Color, [X] No Humans, [X] White Background.
        **MASTER PROMPT:** High-end studio photography, ghost mannequin effect, 3D volumetric shape of [GARMENT] in [COLOR], centered, symmetrical, pure white background #FFFFFF, 8k.`
      },
      'lifestyle': {
        base: isConjunto
          ? "HIGH-END LIFESTYLE EDITORIAL: High-quality fashion model wearing the full two-piece set in a natural environment."
          : "HIGH-END LIFESTYLE EDITORIAL: High-quality fashion model wearing the garment in a natural environment.",
        rules: isConjunto
          ? "\n          - ENVIRONMENT/CONTEXT: " + environment + ".\n          - Lighting: Cinematic natural light with professional highlights.\n          - Composition: Strict full-body portrait shot from head to toe, showing the model's entire silhouette and the full length of both garments down to the ankles."
          : "\n          - ENVIRONMENT/CONTEXT: " + environment + ".\n          - Lighting: Cinematic natural light with professional highlights.\n          - Composition: Medium or full-body shot with soft bokeh depth of field.",
        model: "- GENDER MANDATE: Use a " + genero + " model. Skin tone: " + (extraSpecs.skinTone || 'Natural') + ".",
        example: isConjunto
          ? "        **REASONING:** The two-piece set is adapted to a natural lifestyle environment with a model, aiming for a cinematic full-body framing showing both garments naturally, with natural draping.\n        **VISUAL AUDIT:** [X] Brand, [X] Human Model, [X] Environment, [X] Lighting.\n        **MASTER PROMPT:** High-end lifestyle fashion photography, full-body portrait shot of a [GENDER] model wearing a two-piece set, [ENVIRONMENT/CONTEXT], cinematic natural lighting, 8k, editorial style."
          : "        **REASONING:** The garment is adapted to a natural lifestyle environment with a model, aiming for a cinematic framing and natural lighting.\n        **VISUAL AUDIT:** [X] Brand, [X] Human Model, [X] Environment, [X] Lighting.\n        **MASTER PROMPT:** High-end lifestyle fashion photography, [GENDER] model wearing [GARMENT], [ENVIRONMENT/CONTEXT], cinematic natural lighting, soft bokeh depth of field, 8k, editorial style."
      },
      'ecommerce': {
        base: isConjunto
          ? "PREMIUM E-COMMERCE CATALOG: Commercial catalog photography of a full two-piece set."
          : "PREMIUM E-COMMERCE CATALOG: Commercial catalog photography.",
        rules: isConjunto
          ? "\n          - Background: Neutral professional studio (Light Gray #F2F2F2).\n          - Lighting: Uniform high-key studio softbox lighting.\n          - Style: Professional full-body portrait shot showing the model from head to toe. NO \"flat lay\" or \"flat surface\" mentions allowed."
          : "\n          - Background: Neutral professional studio (Light Gray #F2F2F2).\n          - Lighting: Uniform high-key studio softbox lighting.\n          - Style: Professional on-body shot. NO \"flat lay\" or \"flat surface\" mentions allowed.",
        model: "- GENDER MANDATE: Use a " + genero + " model. Skin tone: " + (extraSpecs.skinTone || 'Natural') + ".",
        example: isConjunto
          ? "        **REASONING:** Transitioning from flat-laid garments to a professional full-body catalog shot with a female model. The garments are styled with natural layering where the hoodie draping overlaps the pants.\n        **VISUAL AUDIT:** [X] Brand, [X] Human Model, [X] High-Key Lighting, [X] Light Gray Background.\n        **MASTER PROMPT:** High-end e-commerce fashion photography, professional full-body portrait shot of a model wearing a two-piece set, showing the full length of the garments from head to toe, frontal view, uniform high-key studio softbox lighting, neutral light gray background #F2F2F2, 8k, commercial catalog style."
          : "        **REASONING:** Transitioning from physical support to a human model (on-body shot) following the gender mandate. Tags are removed and catalog lighting is applied.\n        **VISUAL AUDIT:** [X] Brand, [X] Human Model, [X] High-Key Lighting, [X] Light Gray Background.\n        **MASTER PROMPT:** High-end e-commerce fashion photography, professional on-body shot of a model wearing [GARMENT], [TEXTURE/COLOR DETAILS], frontal view, uniform high-key studio softbox lighting, neutral light gray background #F2F2F2, 8k, commercial catalog style."
      },
      'hanger': {
        base: "STILL LIFE - PROFESSIONAL HANGER: Garment professionally hanging on a luxury minimalist hanger.",
        rules: "\n          - Surface/Background: " + surfaceInstruction + ".\n          - Lighting: Softbox multi-point lighting. Highlight technical fabric details.\n          - REALISM MANDATE: Maintain realistic garment characteristics like seams and natural drape.\n          - ABSOLUTELY NO MODELS OR HUMAN BODIES.",
        example: "        **REASONING:** The garment is adapted to a Still Life style hanging from a professional hanger, removing humans and distracting elements.\n        **VISUAL AUDIT:** [X] Brand, [X] Hanger Style, [X] No Humans, [X] Surface.\n        **MASTER PROMPT:** High-end Still Life commercial product photography, garment professionally hanging on a luxury hanger, [GARMENT/DETAILS], softbox lighting, [SURFACE], 8k."
      },
      'folded': {
        base: "STILL LIFE - STACKED/FOLDED: Garment professionally folded on a surface, focusing entirely on texture.",
        rules: "\n          - Surface: " + surfaceInstruction + ".\n          " + genderProps + "\n          - BOUTIQUE QUALITY: The garment MUST appear professionally steamed and neatly arranged.\n          - ABSOLUTELY NO MODELS OR HUMAN BODIES.",
        example: "        **REASONING:** The garment is presented in a Still Life style, professionally folded on a surface, highlighting texture and removing humans.\n        **VISUAL AUDIT:** [X] Brand, [X] Folded Style, [X] Texture, [X] No Humans.\n        **MASTER PROMPT:** High-end Still Life commercial product photography, garment perfectly folded on a professional surface, [GARMENT/TEXTURES], softbox lighting, [SURFACE], 8k."
      },
      'collage': {
        base: "COLLAGE CATALOG MANDATE: Professional multi-image grid (2x2 or 1+2).",
        rules: "\n          - Layout: Harmonious assembly of all provided reference views.\n          - Aesthetic: Consistent lighting and color grading across all grid elements.\n          - Background: " + surfaceInstruction + ".",
        example: "        **REASONING:** A professional multi-image collage is generated, ensuring consistent lighting and colors across all views.\n        **VISUAL AUDIT:** [X] Multiple Views, [X] Consistency, [X] Surface.\n        **MASTER PROMPT:** High-end commercial collage photography, multi-image grid showing [GARMENT], consistent lighting, [SURFACE], 8k."
      },
      'hero': {
        base: "HERO COMPOSITION MANDATE: Commercial split-view or offset arrangement.",
        rules: "\n          - Primary Focus: One large, clear representation of the garment (The Hero).\n          - Secondary Focus: Neatly arranged color variants or detail swatches.\n          - Balance: Use clean negative space between the Hero and variants.\n          - Surface: " + surfaceInstruction + ".",
        example: "        **REASONING:** A Hero composition is generated with a prominent main view and secondary details, ensuring a balance of negative space.\n        **VISUAL AUDIT:** [X] Hero Focus, [X] Variants, [X] Balance, [X] Surface.\n        **MASTER PROMPT:** High-end commercial split-view photography, main hero shot of [GARMENT] with secondary detail swatches, clean negative space, [SURFACE], 8k."
      }
    };

    const config = STYLE_CONFIG[estilo] || STYLE_CONFIG['ecommerce'];

    // 3. PARÁMETROS TRANSVERSALES DEL LABORATORIO
    let extraDirectives = [];

    // --- NUEVO: Directivas Estacionales y Encuadre Trimodal Generalizado ---
    if ((estilo === 'ecommerce' || estilo === 'lifestyle') && !isConjunto) {
      const clasif = String(extraSpecs.clasificacionEstructural || "").toUpperCase();
      const temporada = prodRow ? (prodRow.TEMPORADA || "") : (extraSpecs.temporada || "");
      const tempLower = String(temporada).toLowerCase();
      const esFrio = tempLower.includes("invierno") || tempLower.includes("otoño") || tempLower.includes("winter") || tempLower.includes("autumn") || tempLower.includes("frio") || tempLower.includes("frío");
      const esFemenino = (genero === 'FEMENINO' || genero === 'MUJER');
      const tempDesc = temporada ? "season: " + temporada : "season: auto-detect based on context";

      let complementoTexto = "";
      if (clasif === "PRENDA_INFERIOR") {
        const topType = esFrio
          ? (esFemenino ? "a long-sleeve neutral knit sweater or long-sleeve cotton shirt" : "a plain long-sleeve crewneck shirt or simple solid hoodie")
          : (esFemenino ? "a basic short-sleeve solid cotton t-shirt or crop top" : "a plain neutral short-sleeve cotton t-shirt");
        complementoTexto = "UPPER BODY COMPLEMENT MANDATE: The model MUST wear " + topType + " to ensure the torso is fully covered and realistic, preventing safety filters from rendering a plastic mannequin. The upper garment must be in a solid neutral color (e.g., plain white, gray, or black) and serve strictly as a subtle background complement. The focus of the shot must remain 100% on the main product (the lower garment).";
      } else if (clasif === "PRENDA_SUPERIOR") {
        const bottomType = esFrio
          ? "classic long dark denim jeans or solid heavy-cotton trousers"
          : (esFemenino ? "classic simple denim shorts or light cotton trousers" : "classic neutral chino shorts or light trousers");
        complementoTexto = "LOWER BODY COMPLEMENT MANDATE: The model MUST wear " + bottomType + " to ensure the outfit is complete and realistic. The lower garment must be in a simple, solid neutral color and serve strictly as a subtle background complement. The focus of the shot must remain 100% on the main product (the upper garment).";
      }

      if (complementoTexto) {
        extraDirectives.push(complementoTexto);
      }

      // Control de encuadre trimodal (Cuerpo Completo vs Enfoque de Prenda vs Auto)
      const cuerpoCompletoVal = extraSpecs.cuerpoCompleto !== undefined ? String(extraSpecs.cuerpoCompleto).toLowerCase() : "";
      const isFull = cuerpoCompletoVal === "true" || cuerpoCompletoVal === "cuerpo_completo" || cuerpoCompletoVal === "full_body" || extraSpecs.framing === "full_body";
      const isProductFocus = cuerpoCompletoVal === "false" || cuerpoCompletoVal === "enfoque_prenda" || extraSpecs.framing === "enfoque_prenda";

      if (isFull) {
        extraDirectives.push("FRAMING MANDATE: Professional full-body fashion shot showing the model from head to toe. Ensure the entire silhouette and both garments (main product and complement) are fully visible in the frame, including footwear.");
      } else if (isProductFocus) {
        if (clasif === "PRENDA_INFERIOR") {
          extraDirectives.push("FRAMING MANDATE: Professional mid-shot focused strictly on the lower body from the waist down. The shot must frame the main lower garment prominently. The upper body garment serves only as a secondary neutral background complement and may be partially cropped.");
        } else {
          extraDirectives.push("FRAMING MANDATE: Professional upper-body portrait shot focused strictly on the upper body, framing the main upper garment prominently from chest/head down to the waist. The lower body garment serves only as a secondary neutral background complement and may be partially cropped.");
        }
      } else {
        // Modo Auto: IA decide según el estilo
        if (estilo === 'lifestyle') {
          extraDirectives.push("FRAMING MANDATE: Professional and balanced fashion composition. You have the sovereignty to choose the optimal framing (full-body or medium shot) that best complements the environment while keeping the main product (" + clasif + ") as the core visual anchor.");
        } else {
          // En ecommerce el foco es el producto por defecto
          if (clasif === "PRENDA_INFERIOR") {
            extraDirectives.push("FRAMING MANDATE: Focus the camera primarily on the main product (" + clasif + ") from the waist down, using the upper body complement strictly as a secondary neutral background element.");
          } else {
            extraDirectives.push("FRAMING MANDATE: Focus the camera primarily on the main product (" + clasif + ") from chest/head down to the waist, using the lower body complement strictly as a secondary neutral background element.");
          }
        }
      }

      // Mandato de realismo humano explícito
      extraDirectives.push("REAL HUMAN MODEL MANDATE: The model must be a real, natural human model with highly realistic facial features, head, and hair (e.g., 'highly realistic human model with natural skin texture, showing face and head clearly'). Absolutely forbid any plastic mannequin structures, hollow mannequin necks, cropped headless bodies, or faceless plastic textures.");
    }

    if (extraSpecs.angle) {
      extraDirectives.push("CAMERA ANGLE: " + extraSpecs.angle + ". Perfect alignment.");
      const angleStr = String(extraSpecs.angle).toLowerCase();
      if (angleStr.includes("split") || angleStr.includes("front and back")) {
        extraDirectives.push("COMPOSITION MANDATE: Create a clean split-view layout (diptych). On one side, show the frontal view of the model wearing the garment. On the other side, show the back view of the model wearing the garment. Both sides must feature the identical model, clothing fit, background, and lighting for absolute visual continuity. There must be no visible black line or seam separating the panels, keeping a clean, continuous neutral background.");
      }
    }
    if (extraSpecs.accessories && extraSpecs.accessories !== "Ninguno") extraDirectives.push("STYLING: Add " + extraSpecs.accessories + " to complement.");
    if (extraSpecs.footwear?.type) extraDirectives.push("FOOTWEAR: Pair with " + extraSpecs.footwear.type + " (" + (extraSpecs.footwear.color || 'neutral') + ").");

    if (isConjunto) {
      extraDirectives.push("TWO-PIECE SET LAYERING: The upper garment (hoodie/jacket/t-shirt) must be worn loose, natural, and draped over the lower garment (pants/joggers/shorts). The bottom hem of the upper garment sits on top of and naturally covers the waistband of the lower garment. The upper garment must NOT be tucked into the pants, and the waistband of the pants must NOT be visible or superimposed over the upper garment.");
      extraDirectives.push("FULL-BODY PORTRAIT COMPOSITION: The shot must be a professional full-body portrait showing the model from head to toe, ensuring the full length of the pants is fully visible down to the ankles with absolutely no cropping of the legs.");
    }

    if (extraSpecs.formato === 'video') {
      const vStruct = extraSpecs.videoOptions?.structure || 'single_shot';
      const structs = {
        'single_shot': "VIDEO: 8-second slow-motion cinematic pan.",
        'multi_shot': "VIDEO: 30-second multi-scene sequence with editorial cuts.",
        'living_garment': "VIDEO: 3D Living Garment effect with subtle fabric movement."
      };
      extraDirectives.push(structs[vStruct]);
    }

    // 4. ENSAMBLAJE FINAL (Preservando Prefijos Mandatorios de Images.js)
    let promptRules = 
      "\n      [TECHNICAL DIRECTIVES]:\n" +
      "      * STYLE BASE: " + config.base + "\n" +
      "      * COMPOSITION: " + config.rules + "\n" +
      (config.focus ? "      * FOCUS: " + config.focus + "\n" : "") +
      extraDirectives.map(d => "      * " + d).join('\n      ') + "\n    ";

    let modelAdaptation = config.model ? config.model : "- GENDER MANDATE: NO HUMANS, MODELS, OR VISIBLE MANNEQUINS.";

    // SOT Prefixes (Anchoring the AI's intent in English)
    let prefix = '[Definitive photographic narrative description, focused purely on visuals].';
    if (estilo === 'folded') prefix = 'You MUST start your response with the phrase: "High-end Still Life commercial product photography, showcasing the garment perfectly folded on a professional surface, focusing entirely on texture and material, with NO human presence."';
    else if (estilo === 'hanger') prefix = 'You MUST start your response with the phrase: "High-end Still Life commercial product photography, showcasing the garment professionally hanging on a luxury hanger, with NO human presence."';

    if (extraSpecs.formato === 'video') prefix = `[Narrative Video Script]. ${prefix}`;

    let exampleBlock = config.example || 
        "        **REASONING:** [Explanation of directive adaptation].\n" +
        "        **VISUAL AUDIT:** [X] Validations.\n" +
        "        **MASTER PROMPT:** [Final prompt in English].";

    return { promptRules, modelAdaptation, prefix, exampleBlock };
  },

  /**
   * Helper para buscar una fila por valor en una hoja mapeada.
   */
  buscarFilaPorValor: function (sheet, sheetAlias, headerName, valor) {
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

  generarLogDiferencial: function (raw, clean) {
    const rawLines = raw.split('\n');
    const cleanLines = clean.split('\n').map(l => l.trim().toLowerCase());
    return rawLines.map(line => {
      const l = line.trim();
      if (!l) return null;
      const isKept = cleanLines.some(c => l.toLowerCase().includes(c));
      return { text: l, status: isKept ? 'KEPT' : 'DISCARDED' };
    }).filter(Boolean);
  },

  /**
   * Diagnóstico autónomo e inteligente de fallos de generación o bloqueos de políticas.
   * Utiliza Gemini 2.5 Flash de forma rápida y concisa.
   */
  generarExplicacionBloqueoIA: function (promptTexto, detallesErrores) {
    try {
      console.log("🧠 [Lab-IA] Generando explicación inteligente de bloqueo con IA...");
      const promptDiagnostico = 
        "\nEres Antigravity, un perito experto en inteligencia artificial y políticas de generación de imágenes de Google Vertex AI (Imagen 3, Imagen 4, Gemini 3.1/3-Pro).\n" +
        "El sistema de generación de imágenes publicitarias ha fallado o ha sido bloqueado al intentar renderizar un producto.\n\n" +
        "Necesitamos un diagnóstico técnico explicativo, extremadamente claro, directo y en español, que ayude al usuario (diseñador/operador de ERP) a entender exactamente por qué falló la generación y qué acciones puede tomar para evitarlo.\n\n" +
        "[INFORMACIÓN DEL RENDERIZADO]\n" +
        "- Prompt Maestro Enviado:\n" +
        "\"" + promptTexto + "\"\n\n" +
        "- Mensaje/Detalle del Error Capturado:\n" +
        "\"" + detallesErrores + "\"\n\n" +
        "[REGLAS DE RESPUESTA]\n" +
        "1. Explica la causa probable del error en español de manera profesional y amable (sin jerga excesivamente técnica pero con precisión).\n" +
        "2. Si el error menciona \"SAFETY\", \"NO_IMAGE\", \"400\" o bloqueos similares, analiza si se debe a:\n" +
        "   - Presencia de marcas comerciales o personajes protegidos por derechos de autor (ej. Dragon Ball, Goku, Marvel, etc.).\n" +
        "   - Clasificación sensible de la prenda (ropa interior, bóxers) que pueda ser interpretada por los filtros de seguridad/desnudez de Google como contenido no permitido.\n" +
        "   - Restricciones multimodales por las referencias de entrada.\n" +
        "3. Da 2 o 3 recomendaciones accionables y concisas para corregir el problema en el prompt o en las configuraciones (ej: \"Evitar mencionar nombres específicos de franquicias protegidas\", \"Reemplazar estampados con patrones genéricos de color\", \"Ajustar el encuadre a estilo Ghost\").\n" +
        "4. Mantén la respuesta breve (máximo 3-4 párrafos bien estructurados), sin rodeos, sin monólogos ni introducciones robóticas.\n";

      const apiKey = GLOBAL_CONFIG.GEMINI.FREE_API_KEY || GLOBAL_CONFIG.GEMINI.API_KEY;
      if (!apiKey) return "Error: No se pudo iniciar el análisis de diagnóstico porque no hay una API Key configurada.";

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          contents: [{ parts: [{ text: promptDiagnostico }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024
          }
        }),
        muteHttpExceptions: true,
        timeoutInSeconds: 20
      });

      if (response.getResponseCode() === 200) {
        const json = JSON.parse(response.getContentText());
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) return rawText.trim();
      }
      return `No se pudo obtener el diagnóstico del servidor de IA (HTTP ${response.getResponseCode()}).`;
    } catch (e) {
      return "Excepción durante el diagnóstico autónomo: " + e.message;
    }
  },

  /**
   * FASE 3: RENDERIZADO VISUAL DESDE LABORATORIO
   * Hace de puente con el motor de pago en Images.js, manteniendo separadas las responsabilidades de la UI.
   */
  ejecutarRenderizadoDesdeLaboratorio: function (imagenIds, promptTexto, pin, extraSpecs = {}) {
    try {
      console.log("🎨 [Lab-IA] Iniciando Fase 3 (Renderizado) para: " + imagenIds.join(', '));

      // Llamada directa a la pasarela Core en Images.js
      // Esto reutiliza todo el sistema de Fallbacks, Upload a Drive y Registro de Costos.
      const resultado = generarImagenDesdePrompt(imagenIds, promptTexto, pin, null, null, extraSpecs);

      if (resultado && !resultado.success) {
        console.warn(`⚠️ [Lab-IA] El renderizado reportó fallo. Ejecutando diagnóstico inteligente...`);
        const explicacion = this.generarExplicacionBloqueoIA(promptTexto, resultado.error || "Fallo de renderizado general");
        resultado.explicacionBloqueo = explicacion;
      }

      return resultado;
    } catch (e) {
      console.error("❌ [Lab-IA] Error Fase 3 Render: " + e.message);
      const explicacion = this.generarExplicacionBloqueoIA(promptTexto, e.message);
      return { success: false, error: e.message, explicacionBloqueo: explicacion };
    }
  },

  /**
   * 💾 COLA BATCH: Obtiene la hoja BD_COLA_BATCH, creándola si no existe.
   */
  _obtenerHojaColaBatch: function () {
    const ss = getActiveSS();
    let sheet = ss.getSheetByName(SHEETS.LAB_BATCH_QUEUE || "BD_COLA_BATCH");
    const expectedHeaders = SHEET_SCHEMA.LAB_BATCH_QUEUE || ["TIMESTAMP", "BATCH_ID", "MODELO", "IMAGEN_IDS", "ESTADO", "ERROR_DETALLE"];

    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.LAB_BATCH_QUEUE || "BD_COLA_BATCH");
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders])
        .setBackground("#4B0082").setFontColor("white").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    return sheet;
  },

  /**
   * 📦 BATCH API: Encola un lote asíncrono en los servidores de Google Gemini.
   * Utiliza el método Inline para lotes de hasta 50 imágenes (<20MB totales).
   */
  ejecutarCreacionBatchLote: function (imagenIds, modeloForzado = 'gemini-3.1-pro-preview') {
    try {
      console.log(`📦 [Batch-IA] Iniciando encolamiento asíncrono para ${imagenIds.length} imágenes...`);
      if (!imagenIds || !imagenIds.length) throw new Error("Lista de imágenes vacía.");

      // Forzar un modelo Gemini si por error se envía Gemma (Batch API requiere Gemini en v1beta)
      const modelo = modeloForzado.startsWith("gemini-") ? modeloForzado : "gemini-3.1-pro-preview";

      const ss = getActiveSS();
      const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
      const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);

      // Usar llave principal (Pago) o Free para el lote asíncrono
      const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY || GLOBAL_CONFIG.GEMINI.FREE_API_KEY;
      if (!apiKey) throw new Error("Falta API Key para IA.");

      // 1. Preparar las directivas y el esquema comunes
      const forensicWhitelist = [
        "MARCA", "MODELO", "CATEGORÍA", "MATERIAL", "GÉNERO", "CLASIFICACION_ESTRUCTURAL", "TIPO_PRENDA",
        "POSICIÓN_DETECTADA", "SOPORTE_O_CONTEXTO",
        "COLOR_PRINCIPAL", "NOMBRE TÉCNICO", "CÓDIGO HEX", "TIPO", "PATRÓN",
        "MATERIAL_ESTIMADO",
        "LOGO_O_MARCA", "VISIBLE", "DETALLE",
        "DETALLES_CONSTRUCTIVOS", "COSTURAS", "CIERRES", "BOLSILLOS", "ELÁSTICOS",
        "AVISOS_DE_LIMPIEZA_VISIBLES", "ESTADO_VISUAL", "DETALLES_VISUALES"
      ];

      const schema = {
        type: "OBJECT",
        properties: {
          MARCA: { type: "STRING" },
          MODELO: { type: "STRING" },
          CATEGORIA: { type: "STRING" },
          MATERIAL: { type: "STRING" },
          GENERO: { type: "STRING" },
          CLASIFICACION_ESTRUCTURAL: { type: "STRING", enum: ["PRENDA_SUPERIOR", "PRENDA_INFERIOR"] },
          TIPO_PRENDA: { type: "STRING" },
          POSICION_DETECTADA: { type: "STRING", enum: ["FRENTE", "ESPALDA", "LATERAL", "PLANO", "GHOST_MANNEQUIN", "PILA_O_DOBLADO", "INDETERMINADO"] },
          SOPORTE_O_CONTEXTO: { type: "STRING", enum: ["FOTO_ESTUDIO", "COLGADA_EN_PERCHA", "DOBLADA_EN_SUPERFICIE", "SOBRE_MANIQUÍ", "EN_PERCHERO_MULTIPLE"] },
          COLOR_PRINCIPAL: {
            type: "OBJECT",
            properties: {
              NOMBRE_TECNICO: { type: "STRING" },
              CODIGO_HEX: { type: "STRING" },
              TIPO: { type: "STRING", enum: ["LISO", "ESTAMPADO", "SUBLIMADO", "RAYADO", "JASPEADO"] },
              PATRON: { type: "STRING" }
            },
            required: ["NOMBRE_TECNICO", "CODIGO_HEX", "TIPO", "PATRON"]
          },
          MATERIAL_ESTIMADO: { type: "STRING" },
          LOGO_O_MARCA: {
            type: "OBJECT",
            properties: {
              VISIBLE: { type: "STRING", enum: ["SÍ", "NO"] },
              DETALLE: { type: "STRING" }
            },
            required: ["VISIBLE", "DETALLE"]
          },
          DETALLES_CONSTRUCTIVOS: {
            type: "OBJECT",
            properties: {
              COSTURAS: { type: "STRING" },
              CIERRES: { type: "STRING" },
              BOLSILLOS: { type: "STRING" },
              ELASTICOS: { type: "STRING" }
            },
            required: ["COSTURAS", "CIERRES", "BOLSILLOS", "ELASTICOS"]
          },
          AVISOS_DE_LIMPIEZA_VISIBLES: { type: "STRING", enum: ["SÍ", "NO"] },
          ESTADO_VISUAL: { type: "STRING" },
          DETALLES_VISUALES: { type: "STRING" }
        },
        required: [
          "MARCA", "MODELO", "CATEGORIA", "MATERIAL", "GENERO",
          "CLASIFICACION_ESTRUCTURAL", "TIPO_PRENDA", "POSICION_DETECTADA",
          "SOPORTE_O_CONTEXTO", "COLOR_PRINCIPAL", "MATERIAL_ESTIMADO",
          "LOGO_O_MARCA", "DETALLES_CONSTRUCTIVOS", "AVISOS_DE_LIMPIEZA_VISIBLES",
          "ESTADO_VISUAL", "DETALLES_VISUALES"
        ]
      };

      const safetySettings = typeof GEMINI_SAFETY_SETTINGS !== 'undefined' ? GEMINI_SAFETY_SETTINGS : [
        { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
        { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
        { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
        { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
      ];

      // 2. Construir lista de peticiones (requests) individuales inlined
      const requests = [];
      const imageIdsExitosos = [];

      for (const id of imagenIds) {
        try {
          const imgRow = this.buscarFilaPorValor(sheetImg, "PRODUCT_IMAGES", "IMAGEN_ID", id);
          if (!imgRow || !imgRow.ARCHIVO_ID) {
            console.warn("⚠️ [Batch-IA] Imagen " + id + " omitida: Faltan datos o ARCHIVO_ID.");
            continue;
          }

          const prodRow = this.buscarFilaPorValor(sheetProd, "PRODUCTS", "CODIGO_ID", imgRow.PRODUCTO_ID);
          const contextoProducto = prodRow ? "PRODUCT: " + (prodRow.MODELO || prodRow.NOMBRE_PRODUCTO) + " | BRAND: " + prodRow.MARCA + " | PARENT_CATEGORY: " + (prodRow.PARENT_CATEGORY || prodRow.CATEGORIA_PADRE) : "";

          const promptForense = "Forensic Clothing Analyst for a high-precision ERP.\n" +
            "Visual Pixel Sovereignty (report strictly what is seen for colors, patterns, and physical traits).\n" +
            "Metadata Inheritance (MANDATORY: Inherit MARCA, MODELO, CATEGORÍA, and GÉNERO exactly from the Context Reference, even if not visually identifiable in the image).\n" +
            "Plain text, one line per field, no bold, no markdown, no introductions.\n\n" +
            "* Context Reference (ERP): " + contextoProducto + "\n" +
            "* Analysis Request: Technical forensic breakdown in SPANISH.\n" +
            "* Schema: \n" +
            "MARCA: [Heredar de Context Reference]\n" +
            "MODELO: [Heredar de Context Reference]\n" +
            "CATEGORÍA: [Heredar de Context Reference]\n" +
            "... (resto de campos) ...";

          // Subir a la File API para asociarlo temporalmente a la API Key
          const fileDataRef = prepararBlobOptimizado(imgRow.ARCHIVO_ID, `batch_${id}`, 'alta', apiKey, false);

          requests.push({
            model: `models/${modelo}`,
            contents: [{
              parts: [
                { text: promptForense },
                fileDataRef
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
              responseSchema: schema
            },
            safetySettings: safetySettings
          });

          imageIdsExitosos.push(id);
        } catch (errImg) {
          console.error("❌ [Batch-IA] Error preparando imagen " + id + " para el lote: " + errImg.message);
        }
      }

      if (requests.length === 0) throw new Error("No se pudo preparar ninguna imagen para el lote.");

      // 3. Crear el Lote Asíncrono llamando a Google AI Studio
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:batchGenerateContent?key=${apiKey}`;
      const payload = {
        model: `models/${modelo}`,
        displayName: `Lote_Forense_${new Date().getTime()}`,
        inputConfig: {
          inlinedRequests: {
            requests: requests
          }
        }
      };

      const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        timeoutInSeconds: 60
      });

      if (response.getResponseCode() !== 200) {
        throw new Error(`Google API HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
      }

      const resBody = JSON.parse(response.getContentText());
      const batchId = resBody.name; // Ej. "batches/12345xyz"
      if (!batchId) throw new Error("Google no devolvió un ID de Lote válido.");

      // 4. Registrar en la Cola de Sheets
      const sheetCola = this._obtenerHojaColaBatch();
      sheetCola.appendRow([
        new Date(),
        batchId,
        modelo,
        imageIdsExitosos.join(','),
        "PENDIENTE",
        ""
      ]);

      console.log("✅ [Batch-IA] Lote encolado correctamente. ID de Lote: " + batchId);
      return { success: true, batchId: batchId };

    } catch (e) {
      console.error("❌ [Batch-IA] Error encolando lote: " + e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 🔎 BATCH API: Consulta el estado de un lote asíncrono.
   */
  obtenerEstadoBatch: function (batchId) {
    try {
      const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY || GLOBAL_CONFIG.GEMINI.FREE_API_KEY;
      if (!apiKey) throw new Error("Falta API Key configurada.");

      const url = `https://generativelanguage.googleapis.com/v1beta/${batchId}?key=${apiKey}`;
      const response = UrlFetchApp.fetch(url, {
        method: "get",
        muteHttpExceptions: true,
        timeoutInSeconds: 15
      });

      if (response.getResponseCode() === 200) {
        const json = JSON.parse(response.getContentText());
        return {
          success: true,
          state: json.state || "JOB_STATE_PENDING", // JOB_STATE_SUCCEEDED, JOB_STATE_FAILED, etc.
          raw: json
        };
      }
      return { success: false, error: "HTTP " + response.getResponseCode() + ": " + response.getContentText() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * 📥 BATCH API: Descarga e ingiere las respuestas de un lote completado con éxito.
   */
  descargarResultadosBatch: function (batchId, imagenIdsString) {
    try {
      console.log("📥 [Batch-IA] Procesando resultados del lote finalizado: " + batchId);
      const estadoObj = this.obtenerEstadoBatch(batchId);
      if (!estadoObj.success || estadoObj.state !== "JOB_STATE_SUCCEEDED") {
        throw new Error("El lote no está listo o falló. Estado: " + estadoObj.state);
      }

      const results = estadoObj.raw.response?.results;
      if (!results || !results.length) throw new Error("El lote completado no contiene resultados.");

      const imagenIds = String(imagenIdsString).split(',');
      if (results.length !== imagenIds.length) {
        console.warn("⚠️ [Batch-IA] Desajuste de conteo: Resultados=" + results.length + ", Imágenes=" + imagenIds.length + ". Intentando mapeo secuencial.");
      }

      const ss = getActiveSS();
      const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);

      let correctos = 0;
      let fallados = 0;

      for (let idx = 0; idx < results.length; idx++) {
        const imgId = imagenIds[idx];
        if (!imgId) continue;

        try {
          const resultNode = results[idx];
          const candidate = resultNode.response?.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;

          if (!text) {
            console.warn("⚠️ [Batch-IA] Sin respuesta para imagen " + imgId + " en índice " + idx);
            fallados++;
            continue;
          }

          // Parsear JSON e interpolar al formato plano compatible
          const parsedJson = JSON.parse(text);
          const colorPrincipal = parsedJson.COLOR_PRINCIPAL || {};
          const logoOMarca = parsedJson.LOGO_O_MARCA || {};
          const detallesConstructivos = parsedJson.DETALLES_CONSTRUCTIVOS || {};

          const rawResponse = [
            "MARCA: " + (parsedJson.MARCA || ""),
            "MODELO: " + (parsedJson.MODELO || ""),
            "CATEGORÍA: " + (parsedJson.CATEGORIA || parsedJson.CATEGORÍA || ""),
            "MATERIAL: " + (parsedJson.MATERIAL || ""),
            "GÉNERO: " + (parsedJson.GENERO || parsedJson.GÉNERO || ""),
            "CLASIFICACION_ESTRUCTURAL: " + (parsedJson.CLASIFICACION_ESTRUCTURAL || ""),
            "TIPO_PRENDA: " + (parsedJson.TIPO_PRENDA || ""),
            "POSICIÓN_DETECTADA: " + (parsedJson.POSICION_DETECTADA || parsedJson.POSICIÓN_DETECTADA || ""),
            "SOPORTE_O_CONTEXTO: " + (parsedJson.SOPORTE_O_CONTEXTO || ""),
            "COLOR_PRINCIPAL:",
            "  - NOMBRE TÉCNICO: " + (colorPrincipal.NOMBRE_TECNICO || colorPrincipal.NOMBRE_TÉCNICO || ""),
            "  - CÓDIGO HEX: " + (colorPrincipal.CODIGO_HEX || colorPrincipal.CÓDIGO_HEX || ""),
            "  - TIPO: " + (colorPrincipal.TIPO || ""),
            "  - PATRÓN: " + (colorPrincipal.PATRON || colorPrincipal.PATRÓN || ""),
            "MATERIAL_ESTIMADO: " + (parsedJson.MATERIAL_ESTIMADO || ""),
            "LOGO_O_MARCA:",
            "  - VISIBLE: " + (logoOMarca.VISIBLE || ""),
            "  - DETALLE: " + (logoOMarca.DETALLE || ""),
            "DETALLES_CONSTRUCTIVOS:",
            "  - COSTURAS: " + (detallesConstructivos.COSTURAS || ""),
            "  - CIERRES: " + (detallesConstructivos.CIERRES || ""),
            "  - BOLSILLOS: " + (detallesConstructivos.BOLSILLOS || ""),
            "  - ELÁSTICOS: " + (detallesConstructivos.ELASTICOS || detallesConstructivos.ELÁSTICOS || ""),
            "AVISOS_DE_LIMPIEZA_VISIBLES: " + (parsedJson.AVISOS_DE_LIMPIEZA_VISIBLES || ""),
            "ESTADO_VISUAL: " + (parsedJson.ESTADO_VISUAL || ""),
            "DETALLES_VISUALES: " + (parsedJson.DETALLES_VISUALES || "")
          ].join('\n');

          const forensicWhitelist = [
            "MARCA", "MODELO", "CATEGORÍA", "MATERIAL", "GÉNERO", "CLASIFICACION_ESTRUCTURAL", "TIPO_PRENDA",
            "POSICIÓN_DETECTADA", "SOPORTE_O_CONTEXTO",
            "COLOR_PRINCIPAL", "NOMBRE TÉCNICO", "CÓDIGO HEX", "TIPO", "PATRÓN",
            "MATERIAL_ESTIMADO",
            "LOGO_O_MARCA", "VISIBLE", "DETALLE",
            "DETALLES_CONSTRUCTIVOS", "COSTURAS", "CIERRES", "BOLSILLOS", "ELÁSTICOS",
            "AVISOS_DE_LIMPIEZA_VISIBLES", "ESTADO_VISUAL", "DETALLES_VISUALES"
          ];
          const cleanResponse = this.extraerContenido(rawResponse, forensicWhitelist);
          const rawConMarcas = this.generarMenteRawConMarcas(rawResponse, forensicWhitelist, false);

          // 1. Guardar en BD_PRODUCTO_IMAGENES (Sincronización en Caliente)
          const imgRow = this.buscarFilaPorValor(sheetImg, "PRODUCT_IMAGES", "IMAGEN_ID", imgId);
          if (imgRow) {
            const map = HeaderManager.getMapping("PRODUCT_IMAGES");
            const rIdx = this.buscarFilaIndicePorValor(sheetImg, "PRODUCT_IMAGES", "IMAGEN_ID", imgId);
            if (rIdx > 0 && map.ANALISIS_FORENSE !== undefined) {
              sheetImg.getRange(rIdx, map.ANALISIS_FORENSE + 1).setValue(cleanResponse);
            }
          }

          // 2. Guardar en BD_LABORATORIO_IA (Cache persistente)
          this.guardarResultadoLab({
            imagenId: imgId,
            estilo: "FORENSIC_ONLY",
            sku: imgRow ? imgRow.PRODUCTO_ID : "",
            analisisForense: cleanResponse,
            analisisForenseRaw: rawConMarcas,
            modelo: estadoObj.raw.model ? estadoObj.raw.model.replace("models/", "") : "gemini-3.1-pro-preview"
          });

          correctos++;
        } catch (errItem) {
          console.error("❌ [Batch-IA] Error ingiriendo resultados de imagen " + imgId + ": " + errItem.message);
          fallados++;
        }
      }

      console.log("✅ [Batch-IA] Ingesta de Lote " + batchId + " finalizada. Éxito: " + correctos + ", Fallados: " + fallados);

      // Intentar alertar por Telegram si el puente de notificaciones está disponible
      try {
        if (typeof TelegramService !== 'undefined' && TelegramService.enviarMensajeAI) {
          TelegramService.enviarMensajeAI("📦 *Lote Forense Finalizado*\n\n*Lote ID:* `" + batchId + "`\n*Total:* " + imagenIds.length + "\n*Procesadas:* " + correctos + " OK / " + fallados + " ERR");
        }
      } catch (eTelegram) {
        console.warn("⚠️ No se pudo enviar alerta de Telegram.");
      }

      return { success: true, correctos: correctos, fallados: fallados };
    } catch (e) {
      console.error("❌ [Batch-IA] Error en ingesta de lote: " + e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * Helper para buscar el índice de fila física por valor.
   */
  buscarFilaIndicePorValor: function (sheet, sheetAlias, headerName, valor) {
    if (!sheet) return -1;
    const map = HeaderManager.getMapping(sheetAlias);
    if (!map || map[headerName] === undefined) return -1;

    const data = sheet.getDataRange().getValues();
    const colIdx = map[headerName];
    const target = String(valor).trim().toLowerCase();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colIdx]).trim().toLowerCase() === target) {
        return i + 1; // 1-indexed y saltando encabezado
      }
    }
    return -1;
  }
};

/**
 * WRAPPERS GLOBALES (Exposición para google.script.run)
 */
function ejecutarCreacionBatchLote(imagenIds, modeloForzado) {
  return AIService.ejecutarCreacionBatchLote(imagenIds, modeloForzado);
}
function ejecutarPruebaLaboratorio(imagenId, metadata, forzar = false, modeloForzado = null) {
  return AIService.ejecutarPruebaLaboratorio(imagenId, metadata, forzar, modeloForzado);
}

function ejecutarGeneracionPromptMaestro(imagenId, estilo, extraSpecs, forzar = false) {
  return AIService.ejecutarGeneracionPromptMaestro(imagenId, estilo, extraSpecs, forzar);
}

function ejecutarRenderizadoDesdeLaboratorio(imagenIds, promptTexto, pin, extraSpecs) {
  return AIService.ejecutarRenderizadoDesdeLaboratorio(imagenIds, promptTexto, pin, extraSpecs);
}

function ejecutarRefinamientoPromptPorVoz(imagenId, currentPrompt, base64Audio, mimeType, isAudio = true, estilo = null, extraSpecs = {}) {
  return AIService.ejecutarRefinamientoPromptPorVoz(imagenId, currentPrompt, base64Audio, mimeType, isAudio, estilo, extraSpecs);
}

function transcribirAudio(base64Audio, mimeType) {
  return AIService.transcribirAudio(base64Audio, mimeType);
}
