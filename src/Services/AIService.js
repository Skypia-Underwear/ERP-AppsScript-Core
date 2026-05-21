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
        console.log(`🧠 [AIService] Consultando con modelo ${modelo} usando API Key: ${keyObj.label}`);

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
          console.warn(`❌ [AIService] Excepción: ${ultimoError}`);
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
      let cleanLine = l.replace(/[*#`]/g, '').trim();
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
   * 💾 PERSISTENCIA DE LABORATORIO (BD_LABORATORIO_IA)
   * Gestiona el guardado y recuperación de pruebas para ahorrar tokens.
   */
  _obtenerHojaLab: function () {
    const ss = getActiveSS();
    let sheet = ss.getSheetByName(SHEETS.LAB_IA);
    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.LAB_IA);
      const headers = ["TIMESTAMP", "IMAGEN_ID", "SKU", "CATEGORIA", "ESTILO", "ANALISIS_FORENSE", "PROMPT_MAESTRO", "MODELO", "VERSION_REGLAS"];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setBackground("#4B0082").setFontColor("white").setFontWeight("bold");
      sheet.setFrozenRows(1);
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
      if (data.promptMaestro) newRow[colMap.PROMPT_MAESTRO] = data.promptMaestro;
      if (data.modelo) newRow[colMap.MODELO] = data.modelo;
      newRow[colMap.VERSION_REGLAS] = "v4.2 (Consolidado)";

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
        return {
          sku: match[colMap.SKU],
          categoria: match[colMap.CATEGORIA],
          estilo: match[colMap.ESTILO],
          analisisForense: match[colMap.ANALISIS_FORENSE],
          promptMaestro: match[colMap.PROMPT_MAESTRO],
          modelo: match[colMap.MODELO]
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
      "art director", "high-end", "convert a forensic", "wait,", "i will",
      "self-correction", "sandbox", "refining", "revised prompt", "correction:",
      "drafting", "polish:", "final check", "assignment_turned_in",
      "concept:", "subject:", "step 1", "step 2", "step 3", "sandbox", "thinking",
      "revised prompt", "correction:", "debate"
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
        let val = parts.slice(-1)[0].replace(/[*#`]/g, '').trim();
        // Si el valor es igual al nombre del header, no lo agregamos como contenido
        if (val && val.toUpperCase() !== currentHeader) bloques.get(currentHeader).push(val);
      } else if (currentHeader) {
        let cleanVal = l.replace(/[*#`]/g, '').trim();
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
  ejecutarPruebaLaboratorio: function (imagenId, metadata, forzar = false) {
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
      const contextoProducto = prodRow ? `PRODUCT: ${prodRow.MODELO || prodRow.NOMBRE_PRODUCTO} | BRAND: ${prodRow.MARCA} | PARENT_CATEGORY: ${prodRow.PARENT_CATEGORY || prodRow.CATEGORIA_PADRE}` : "";
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
  - VISIBLE: [SÍ / NO. Rigurosamente visual]
  - DETALLE: [Descripción, position y tamaño]
DETALLES_CONSTRUCTIVOS:
  - COSTURAS: [e.g., Flatlock, Overlock, Doble aguja]
  - CIERRES: [e.g., Cierre frontal, sin cierre, botones]
  - BOLSILLOS: [e.g., 2 laterales, sin bolsillos]
  - ELÁSTICOS: [e.g., Cintura elástica, con cordón]
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

      // EJECUCIÓN RAW CON FALLBACK DINÁMICO (SOT: consultarGemma)
      let rawResponse = "";
      let modeloUsado = "";
      let ultimoError = "";

      for (const modelo of this.MODELS_FREE) {
        for (const keyObj of apiKeysToTry) {
          const apiKey = keyObj.key;
          console.log(`🔬 [Lab-IA] Intentando Auditoría Forense con modelo ${modelo} y API Key ${keyObj.label}`);

          let timeoutInSeconds = 60;
          if (modelo === "gemma-4-26b-a4b-it") {
            timeoutInSeconds = (keyObj.label === "Gratuita") ? 120 : 60;
          } else if (modelo === "gemini-2.5-flash") {
            timeoutInSeconds = 30;
          }

          try {
            // PREPARAR BLOB (Optimizado para Gemma 4 - Usando File API para mayor velocidad)
            // Se genera dentro del bucle de la llave para asociarse correctamente a la API Key activa.
            const fileDataRef = prepararBlobOptimizado(imgRow.ARCHIVO_ID, `lab_${imagenId}`, 'alta', apiKey, false);

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
              muteHttpExceptions: true,
              timeoutInSeconds: timeoutInSeconds
            });

            if (response.getResponseCode() === 200) {
              const resBody = JSON.parse(response.getContentText());
              if (resBody.candidates && resBody.candidates[0] && resBody.candidates[0].content) {
                rawResponse = resBody.candidates[0].content.parts[0].text;
                modeloUsado = modelo;
                console.log(`✅ [Lab-IA] Éxito con ${modelo} usando API Key ${keyObj.label}`);
                break;
              }
            }
            ultimoError = `Mod ${modelo} (${keyObj.label}) -> HTTP ${response.getResponseCode()}: ${response.getContentText()}`;
            console.warn(`⚠️ [Lab-IA] Fallo en ${modelo}: ${ultimoError}`);
          } catch (e) {
            ultimoError = `Mod ${modelo} (${keyObj.label}) -> ${e.message}`;
            console.warn(`❌ [Lab-IA] Excepción en ${modelo}: ${e.message}`);
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
      this.guardarResultadoLab({
        imagenId: imagenId,
        estilo: "FORENSIC_ONLY",
        sku: metadata.sku,
        categoria: metadata.categoria,
        analisisForense: cleanResponse,
        modelo: modeloUsado
      });

      return {
        success: true,
        imagenId: imagenId,
        imageUrl: imgRow.URL || imgRow.THUMBNAIL_URL,
        modelo: modeloUsado,
        raw: rawResponse,
        clean: cleanResponse,
        debug: this.generarLogDiferencial(rawResponse, cleanResponse)
      };

    } catch (e) {
      console.error(`❌ [Lab-IA] Error fatal: ${e.message}`);
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

      console.log(`🧠 [Lab-IA] Generando Prompt Maestro para imágenes: ${imagenIds.join(', ')} (Estilo: ${estilo})`);

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
        const forensic = masterRow.ANALISIS_FORENSE.toUpperCase();
        if (forensic.includes("CLASIFICACION_ESTRUCTURAL: PRENDA_SUPERIOR") || forensic.includes("PRENDA_SUPERIOR")) {
          clasificacion = "PRENDA_SUPERIOR";
        } else if (forensic.includes("CLASIFICACION_ESTRUCTURAL: PRENDA_INFERIOR") || forensic.includes("PRENDA_INFERIOR")) {
          clasificacion = "PRENDA_INFERIOR";
        }
      }
      if (!clasificacion && prodRow) {
        const cat = (prodRow.CATEGORIA || prodRow.CATEGORIA_PADRE || "").toLowerCase();
        const upperKeywords = ['remera', 'buzo', 'camisa', 'campera', 'chaleco', 'chomba', 'musculosa', 'parka', 'sueter', 'tapado', 'blazer', 'saco', 'corpiño', 'top', 'brasier', 'camiseta', 'upper', 'superior', 'top'];
        if (upperKeywords.some(kw => cat.includes(kw))) {
          clasificacion = "PRENDA_SUPERIOR";
        } else {
          clasificacion = "PRENDA_INFERIOR";
        }
      }
      extraSpecs.clasificacionEstructural = clasificacion || "PRENDA_INFERIOR";

      const directiva = this._getAiArtDirectionRules(estilo, extraSpecs, extraSpecs.environment, prodRow);

      let forensicSOT = extraSpecs.fichaForense;
      if (!forensicSOT) {
        forensicSOT = selectedRows.map((r, i) => {
          const typeLabel = i === 0 ? "MASTER" : `REFERENCE ${i}`;
          return `[FORENSIC AUDIT FOR IMAGE ${r.IMAGEN_ID} (${typeLabel})]:\n${r.ANALISIS_FORENSE || "N/A"}`;
        }).join('\n\n');
      }

      // 4. Build System Prompt (100% English)
      const promptSistema = `
        [SYSTEM]: You are an Art Director for High-End Fashion Photography.
        [MISSION]: Convert forensic clothing audits AND visual references into a technical narrative description for an image generation engine (Stage 3).

        [GOLDEN RULES]:
        1. ABSOLUTE FIDELITY: Do not invent details that are not present in the forensic analysis.
        2. CINEMATIC LANGUAGE: Use precise lighting, composition, and material terminology.
        3. ORIENTATION PROTOCOL: Ensure the garment strictly maintains the detected orientation.
        4. NOISE REMOVAL: Clean up hangers, tags, or mannequins if the selected style requires it.
        5. MULTI-REFERENCE HANDLING: The FIRST image is the MASTER (Hero). Use it for shape, fit, and primary identity. The other images are REFERENCES for texture, logos, and hidden details.
        6. BRAND HALLUCINATION PREVENTION: If the Forensic Audit states LOGO_O_MARCA is "NO" or "No visible", you MUST NOT include the brand name or model name in the final narrative description. Describe only the garment's pure visual geometry and colors to prevent the image engine from generating text.

        ${directiva.prefix}
        ${directiva.promptRules}
        ${directiva.modelAdaptation}

        [SOT - SOURCE OF TRUTH (FORENSIC AUDITS)]:
        ${forensicSOT}

        [MANDATORY OUTPUT FORMAT - FOLLOW THIS EXACT EXAMPLE]:
${directiva.exampleBlock}

        CRITICAL: 
        - ALL output MUST be in ENGLISH (Reasoning, Audit, and Master Prompt).
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

      for (const modelo of this.MODELS_FREE) {
        for (const keyObj of apiKeysToTry) {
          const apiKey = keyObj.key;
          console.log(`🧠 [Lab-IA] Intentando Prompt Maestro con modelo ${modelo} y API Key ${keyObj.label}`);

          let timeoutInSeconds = 60;
          if (modelo === "gemma-4-26b-a4b-it") {
            timeoutInSeconds = (keyObj.label === "Gratuita") ? 120 : 60;
          } else if (modelo === "gemini-2.5-flash") {
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
              generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
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
            }
          } catch (e) {
            console.warn(`Fallo en ${modelo} (${keyObj.label}): ${e.message}`);
          }
        }
        if (rawResponse) break;
      }

      if (!rawResponse) throw new Error("No se pudo generar el prompt maestro multireferencia.");

      // 6. Industrial Cleanup (Pure English)
      const whitelist = [
        "REASONING", "VISUAL AUDIT", "AUDIT", "MASTER PROMPT"
      ];
      const cleanResponse = this.extraerContenidoNarrativo(rawResponse, whitelist);

      // 7. GUARDAR EN CACHÉ (Solo guardamos con el ID del Master para consolidación)
      this.guardarResultadoLab({
        imagenId: masterId,
        estilo: estilo,
        promptMaestro: cleanResponse,
        modelo: modeloUsado
      });

      return {
        success: true,
        modelo: modeloUsado,
        raw: rawResponse,
        clean: cleanResponse,
        debug: this.generarLogDiferencial(rawResponse, cleanResponse)
      };

    } catch (e) {
      console.error(`❌ [Lab-IA] Error Maestro: ${e.message}`);
      return { success: false, error: e.message };
    }
  },

  /**
   * 🏭 FÁBRICA DE DIRECCIÓN DE ARTE (Industrializada con Referencia SOT)
   * Integra meses de desarrollo de Images.js con la flexibilidad del Laboratorio.
   */
  _getAiArtDirectionRules: function (estiloSolicitado, extraSpecs = {}, environment = 'Studio', prodRow = null) {
    const estilo = (estiloSolicitado || 'ecommerce').toLowerCase();
    const genero = (prodRow ? prodRow.GENERO || prodRow.GENDER || 'UNISEX' : 'UNISEX').toUpperCase();

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
        base: "GHOST MANNEQUIN EFFECT: Professional 3D volumetric reconstruction. Invisible body effect.",
        rules: `
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
        example: `        **REASONING:** Ghost Mannequin style is applied by removing the physical support and visible mannequin. 3D volume and symmetry are highlighted.
        **VISUAL AUDIT:** [X] Brand, [X] Color, [X] No Humans, [X] White Background.
        **MASTER PROMPT:** High-end studio photography, ghost mannequin effect, 3D volumetric shape of [GARMENT] in [COLOR], centered, symmetrical, pure white background #FFFFFF, 8k.`
      },
      'lifestyle': {
        base: "HIGH-END LIFESTYLE EDITORIAL: High-quality fashion model wearing the garment in a natural environment.",
        rules: `
          - ENVIRONMENT/CONTEXT: ${environment}.
          - Lighting: Cinematic natural light with professional highlights.
          - Composition: Medium or full-body shot with soft bokeh depth of field.`,
        model: `- GENDER MANDATE: Use a ${genero} model. Skin tone: ${extraSpecs.skinTone || 'Natural'}.`,
        example: `        **REASONING:** The garment is adapted to a natural lifestyle environment with a model, aiming for a cinematic framing and natural lighting.
        **VISUAL AUDIT:** [X] Brand, [X] Human Model, [X] Environment, [X] Lighting.
        **MASTER PROMPT:** High-end lifestyle fashion photography, [GENDER] model wearing [GARMENT], [ENVIRONMENT/CONTEXT], cinematic natural lighting, soft bokeh depth of field, 8k, editorial style.`
      },
      'ecommerce': {
        base: "PREMIUM E-COMMERCE CATALOG: Commercial catalog photography.",
        rules: `
          - Background: Neutral professional studio (Light Gray #F2F2F2).
          - Lighting: Uniform high-key studio softbox lighting.
          - Style: Professional on-body shot. NO "flat lay" or "flat surface" mentions allowed.`,
        model: `- GENDER MANDATE: Use a ${genero} model. Skin tone: ${extraSpecs.skinTone || 'Natural'}.`,
        example: `        **REASONING:** Transitioning from physical support to a human model (on-body shot) following the gender mandate. Tags are removed and catalog lighting is applied.
        **VISUAL AUDIT:** [X] Brand, [X] Human Model, [X] High-Key Lighting, [X] Light Gray Background.
        **MASTER PROMPT:** High-end e-commerce fashion photography, professional on-body shot of a model wearing [GARMENT], [TEXTURE/COLOR DETAILS], frontal view, uniform high-key studio softbox lighting, neutral light gray background #F2F2F2, 8k, commercial catalog style.`
      },
      'hanger': {
        base: "STILL LIFE - PROFESSIONAL HANGER: Garment professionally hanging on a luxury minimalist hanger.",
        rules: `
          - Surface/Background: ${surfaceInstruction}.
          - Lighting: Softbox multi-point lighting. Highlight technical fabric details.
          - REALISM MANDATE: Maintain realistic garment characteristics like seams and natural drape.
          - ABSOLUTELY NO MODELS OR HUMAN BODIES.`,
        example: `        **REASONING:** The garment is adapted to a Still Life style hanging from a professional hanger, removing humans and distracting elements.
        **VISUAL AUDIT:** [X] Brand, [X] Hanger Style, [X] No Humans, [X] Surface.
        **MASTER PROMPT:** High-end Still Life commercial product photography, garment professionally hanging on a luxury hanger, [GARMENT/DETAILS], softbox lighting, [SURFACE], 8k.`
      },
      'folded': {
        base: "STILL LIFE - STACKED/FOLDED: Garment professionally folded on a surface, focusing entirely on texture.",
        rules: `
          - Surface: ${surfaceInstruction}.
          ${genderProps}
          - BOUTIQUE QUALITY: The garment MUST appear professionally steamed and neatly arranged.
          - ABSOLUTELY NO MODELS OR HUMAN BODIES.`,
        example: `        **REASONING:** The garment is presented in a Still Life style, professionally folded on a surface, highlighting texture and removing humans.
        **VISUAL AUDIT:** [X] Brand, [X] Folded Style, [X] Texture, [X] No Humans.
        **MASTER PROMPT:** High-end Still Life commercial product photography, garment perfectly folded on a professional surface, [GARMENT/TEXTURES], softbox lighting, [SURFACE], 8k.`
      },
      'collage': {
        base: "COLLAGE CATALOG MANDATE: Professional multi-image grid (2x2 or 1+2).",
        rules: `
          - Layout: Harmonious assembly of all provided reference views.
          - Aesthetic: Consistent lighting and color grading across all grid elements.
          - Background: ${surfaceInstruction}.`,
        example: `        **REASONING:** A professional multi-image collage is generated, ensuring consistent lighting and colors across all views.
        **VISUAL AUDIT:** [X] Multiple Views, [X] Consistency, [X] Surface.
        **MASTER PROMPT:** High-end commercial collage photography, multi-image grid showing [GARMENT], consistent lighting, [SURFACE], 8k.`
      },
      'hero': {
        base: "HERO COMPOSITION MANDATE: Commercial split-view or offset arrangement.",
        rules: `
          - Primary Focus: One large, clear representation of the garment (The Hero).
          - Secondary Focus: Neatly arranged color variants or detail swatches.
          - Balance: Use clean negative space between the Hero and variants.
          - Surface: ${surfaceInstruction}.`,
        example: `        **REASONING:** A Hero composition is generated with a prominent main view and secondary details, ensuring a balance of negative space.
        **VISUAL AUDIT:** [X] Hero Focus, [X] Variants, [X] Balance, [X] Surface.
        **MASTER PROMPT:** High-end commercial split-view photography, main hero shot of [GARMENT] with secondary detail swatches, clean negative space, [SURFACE], 8k.`
      }
    };

    const config = STYLE_CONFIG[estilo] || STYLE_CONFIG['ecommerce'];

    // 3. PARÁMETROS TRANSVERSALES DEL LABORATORIO
    let extraDirectives = [];
    if (extraSpecs.angle) extraDirectives.push(`CAMERA ANGLE: ${extraSpecs.angle}. Perfect alignment.`);
    if (extraSpecs.accessories && extraSpecs.accessories !== "Ninguno") extraDirectives.push(`STYLING: Add ${extraSpecs.accessories} to complement.`);
    if (extraSpecs.footwear?.type) extraDirectives.push(`FOOTWEAR: Pair with ${extraSpecs.footwear.type} (${extraSpecs.footwear.color || 'neutral'}).`);

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
    let promptRules = `
      [TECHNICAL DIRECTIVES]:
      * STYLE BASE: ${config.base}
      * COMPOSITION: ${config.rules}
      ${config.focus ? `* FOCUS: ${config.focus}` : ""}
      ${extraDirectives.map(d => `* ${d}`).join('\n      ')}
    `;

    let modelAdaptation = config.model ? config.model : "- GENDER MANDATE: NO HUMANS, MODELS, OR VISIBLE MANNEQUINS.";

    // SOT Prefixes (Anchoring the AI's intent in English)
    let prefix = '[Definitive photographic narrative description, focused purely on visuals].';
    if (estilo === 'folded') prefix = 'You MUST start your response with the phrase: "High-end Still Life commercial product photography, showcasing the garment perfectly folded on a professional surface, focusing entirely on texture and material, with NO human presence."';
    else if (estilo === 'hanger') prefix = 'You MUST start your response with the phrase: "High-end Still Life commercial product photography, showcasing the garment professionally hanging on a luxury hanger, with NO human presence."';

    if (extraSpecs.formato === 'video') prefix = `[Narrative Video Script]. ${prefix}`;

    let exampleBlock = config.example || `        **REASONING:** [Explanation of directive adaptation].
        **VISUAL AUDIT:** [X] Validations.
        **MASTER PROMPT:** [Final prompt in English].`;

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
      const promptDiagnostico = `
Eres Antigravity, un perito experto en inteligencia artificial y políticas de generación de imágenes de Google Vertex AI (Imagen 3, Imagen 4, Gemini 3.1/3-Pro).
El sistema de generación de imágenes publicitarias ha fallado o ha sido bloqueado al intentar renderizar un producto.

Necesitamos un diagnóstico técnico explicativo, extremadamente claro, directo y en español, que ayude al usuario (diseñador/operador de ERP) a entender exactamente por qué falló la generación y qué acciones puede tomar para evitarlo.

[INFORMACIÓN DEL RENDERIZADO]
- Prompt Maestro Enviado:
"${promptTexto}"

- Mensaje/Detalle del Error Capturado:
"${detallesErrores}"

[REGLAS DE RESPUESTA]
1. Explica la causa probable del error en español de manera profesional y amable (sin jerga excesivamente técnica pero con precisión).
2. Si el error menciona "SAFETY", "NO_IMAGE", "400" o bloqueos similares, analiza si se debe a:
   - Presencia de marcas comerciales o personajes protegidos por derechos de autor (ej. Dragon Ball, Goku, Marvel, etc.).
   - Clasificación sensible de la prenda (ropa interior, bóxers) que pueda ser interpretada por los filtros de seguridad/desnudez de Google como contenido no permitido.
   - Restricciones multimodales por las referencias de entrada.
3. Da 2 o 3 recomendaciones accionables y concisas para corregir el problema en el prompt o en las configuraciones (ej: "Evitar mencionar nombres específicos de franquicias protegidas", "Reemplazar estampados con patrones genéricos de color", "Ajustar el encuadre a estilo Ghost").
4. Mantén la respuesta breve (máximo 3-4 párrafos bien estructurados), sin rodeos, sin monólogos ni introducciones robóticas.
`;

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
      return `Excepción durante el diagnóstico autónomo: ${e.message}`;
    }
  },

  /**
   * FASE 3: RENDERIZADO VISUAL DESDE LABORATORIO
   * Hace de puente con el motor de pago en Images.js, manteniendo separadas las responsabilidades de la UI.
   */
  ejecutarRenderizadoDesdeLaboratorio: function (imagenIds, promptTexto, pin, extraSpecs = {}) {
    try {
      console.log(`🎨 [Lab-IA] Iniciando Fase 3 (Renderizado) para: ${imagenIds.join(', ')}`);
      
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
      console.error(`❌ [Lab-IA] Error Fase 3 Render: ${e.message}`);
      const explicacion = this.generarExplicacionBloqueoIA(promptTexto, e.message);
      return { success: false, error: e.message, explicacionBloqueo: explicacion };
    }
  }
};

/**
 * WRAPPERS GLOBALES (Exposición para google.script.run)
 */
function ejecutarPruebaLaboratorio(imagenId, metadata, forzar = false) {
  return AIService.ejecutarPruebaLaboratorio(imagenId, metadata, forzar);
}

function ejecutarGeneracionPromptMaestro(imagenId, estilo, extraSpecs, forzar = false) {
  return AIService.ejecutarGeneracionPromptMaestro(imagenId, estilo, extraSpecs, forzar);
}

function ejecutarRenderizadoDesdeLaboratorio(imagenIds, promptTexto, pin, extraSpecs) {
  return AIService.ejecutarRenderizadoDesdeLaboratorio(imagenIds, promptTexto, pin, extraSpecs);
}
