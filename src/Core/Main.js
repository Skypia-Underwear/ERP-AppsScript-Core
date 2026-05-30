/**
 * Manejador de solicitudes GET (Para pruebas de alcance)
 * Redirecciona al Router Principal (Línea 838+)
 */
function doGet(e) {
  return doGet_MainRouter(e);
}

/**
 * Manejador de solicitudes POST (Telegram, AppSheet, etc.)
 */
function doPost(e) {
  // --- STANDALONE PWA BRIDGE (Módulo Aislado) ---
  // Solo intercepta peticiones externas de la PWA Standalone (V2).
  // Si no es una petición del bridge, devuelve null y continúa el flujo normal.
  var pwaResponse = StandaloneBridge.handle(e);
  if (pwaResponse) return pwaResponse;

  let logId = null;

  // --- PROTECCIÓN TEMPRANA CONTRA BUCLES DE TELEGRAM ---
  try {
    const rawData = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    if (rawData.includes('"update_id"')) {
      const tgUpdate = JSON.parse(rawData);
      if (tgUpdate.update_id) {
        const cache = CacheService.getScriptCache();
        const cacheKey = "msg_" + tgUpdate.update_id;
        if (cache.get(cacheKey)) {
          return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
        }
        cache.put(cacheKey, "true", 86400);

        if (tgUpdate.message && tgUpdate.message.pinned_message) {
          return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
        }
      }
    }
  } catch (err) { }

  try { logId = registrarRawWebhook(e); } catch (i) { }

  // --- RESPUESTA ULTRA-RÁPIDA PARA PINGS (Protocolo WooCommerce) ---
  // Se hace ANTES del log para garantizar que no haya timeouts
  try {
    const rawData = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    const isWcPing = rawData.indexOf("webhook_id=") !== -1 ||
      (e.parameter && (e.parameter.webhook_id || e.parameter.source === "woocommerce" && rawContents === ""));

    if (isWcPing) {
      if (logId) actualizarResultadoWebhook(logId, "PONG (WooCommerce Check)");
      return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
    }
  } catch (pingErr) {
    console.warn("Error en detección ultra-recortada de ping: " + pingErr.message);
  }

  // (Movido al inicio para mayor seguridad)

  const response = { success: true, message: "ok" };

  try {
    if (!e || !e.postData) {
      return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
    }

    const rawContents = e.postData.contents || "";
    const headers = e.headers || {};

    // --- DETECCIÓN DE WOOCOMMERCE ORDEN ---
    const topic = headers['X-Wc-Webhook-Topic'] || headers['x-wc-webhook-topic'] || "";
    const isWcOrder = topic.includes("order") ||
      (e.parameter && e.parameter.source === "woocommerce" && rawContents.includes('"id":') && rawContents.includes('"line_items":'));

    if (isWcOrder) {
      try {
        const orderData = JSON.parse(rawContents);
        const result = handleWooCommerceWebhook(orderData);
        if (logId) actualizarResultadoWebhook(logId, "WC_WEBHOOK: " + (result.success ? "OK" : "ERROR: " + result.message));
        return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
      } catch (ex) {
        console.error("❌ Error en handleWooCommerceWebhook: " + ex.message);
        if (logId) actualizarResultadoWebhook(logId, "WC_WEBHOOK_CRASH: " + ex.message);
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: ex.message })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // --- RUTA: TELEGRAM / APPSHEET / OTROS ---
    let contents = {};
    try {
      if (rawContents) {
        let rawStr = rawContents;
        if (rawStr.startsWith('%7B') || rawStr.startsWith('%7b')) {
          rawStr = decodeURIComponent(rawStr);
        }
        if (rawStr.endsWith('=')) {
          rawStr = rawStr.slice(0, -1);
        }
        contents = JSON.parse(rawStr);
      } else {
        contents = e.parameter || {};
      }
    } catch (f) {
      console.warn("⚠️ Error parseando JSON en doPost: " + f.message);
      const params = e.parameter;
      const accion = params.accion || e.parameter.accion || params.op || params.o || "";

      if (accion && accion !== "none") {
        debugLog(`🛠 [doPost] Acción: ${accion}`, true);
      }
      contents = e.parameter || {};
    }

    const accion = contents.accion || e.parameter.accion || contents.op || "";

    if (accion && accion !== "none") {
      debugLog(`🛠 [doPost] Acción: ${accion}`, true);
    }

    // --- BLOQUE BLOGGER BRIDGE (Ruteador Centralizado) - PRIORIDAD ALTA ---
    const bloggerOperations = ["p", "d", "e", "venta", "consultar_cliente", "cargar_venta", "pagar", "cancelar", "confirmar_pago_presencial", "pagar_con_comprobante", "configuracion"];
    if (bloggerOperations.indexOf(contents.op || "") !== -1 || bloggerOperations.indexOf(accion || "") !== -1) {
      const respuestaBlogger = blogger_router(contents);
      if (logId) actualizarResultadoWebhook(logId, "BLOGGER_OP: " + (contents.op || accion));
      return ContentService.createTextOutput(JSON.stringify(respuestaBlogger))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (accion === "generarDescripcionIA") {
      const resultado = gestionarAccionEnriquecimiento(contents.codigo);
      return ContentService.createTextOutput(JSON.stringify(resultado)).setMimeType(ContentService.MimeType.JSON);
    }

    if (accion === "actualizarEstadoWooCommerce") {
      const resultado = handleAppSheetStatusUpdate(contents);
      if (logId) {
        const logMsg = resultado.success ? "AS_SYNC: OK (" + resultado.stock + ")" : "AS_SYNC_ERROR: " + (resultado.error || "Desconocido");
        actualizarResultadoWebhook(logId, logMsg);
      }
      return ContentService.createTextOutput(JSON.stringify(resultado)).setMimeType(ContentService.MimeType.JSON);
    }

    // --- MANEJO DE TELEGRAM ---
    if (contents.message || contents.callback_query) {
      if (GLOBAL_CONFIG.TELEGRAM.MODE === "CLIENT") {
        return handleTelegramRequest(contents);
      } else {
        return ContentService.createTextOutput("ok");
      }
    }

    // --- BLOQUE RESELLER (V3.0) ---
    if (accion === "batch_sync_category") {
      const res = reseller_sendBatchByCategory(contents.categoria_id);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }

    if (accion === "importar_reseller") {
      const serverToken = GLOBAL_CONFIG.SCRIPT_CONFIG["RESELLER_SYNC_TOKEN"] || "RESELLER_SYNC_TOKEN_V1";
      if (contents.token !== serverToken) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Acceso denegado (Invalid Token)" })).setMimeType(ContentService.MimeType.JSON);
      }
      const res = reseller_handleImport(contents.data);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }


    const esAccionDeInventario = (accion || "").toLowerCase().includes("inventario") ||
      (accion || "").toLowerCase().includes("resetear") ||
      (accion || "").toLowerCase().includes("bartender");

    if (esAccionDeInventario) {
      return handleInventoryRequest(contents);
    } else if (accion === "enriquecer_imagen" || contents.codigo) {
      return handleImageRequest(contents);
    }

    // --- ACCIONES WOOCOMMERCE WEBHOOK (NUEVO) ---
    if (e.parameter.source === 'woocommerce') {
      const respuestaWC = handleWooCommerceWebhook(contents);
      return ContentService.createTextOutput(JSON.stringify(respuestaWC)).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACCIONES ERP / APPSHEET ---
    if (accion === "generarDescripcionIA") {
      const resultado = gestionarAccionEnriquecimiento(contents.codigo);
      return ContentService.createTextOutput(JSON.stringify(resultado)).setMimeType(ContentService.MimeType.JSON);
    }

    if (accion === "actualizarEstadoWooCommerce") {
      const resultado = handleAppSheetStatusUpdate(contents);
      if (logId) {
        const logMsg = resultado.success ? "AS_SYNC: OK (" + resultado.stock + ")" : "AS_SYNC_ERROR: " + (resultado.error || "Desconocido");
        actualizarResultadoWebhook(logId, logMsg);
      }
      return ContentService.createTextOutput(JSON.stringify(resultado)).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    console.error("❌ Error en doPost: " + error.message);
    return ContentService.createTextOutput(JSON.stringify({ status: "-1", message: "Error interno: " + error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "0", message: "Solicitud procesada (Fallback)" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// 2. Obtención diferida (lazy) de configuración
let _cacheSS = null;
let _cacheConfig = null;

// Hojas de Auditoría y Logs
const SHT_AUDIT_CLIENTE = "BD_FORMULARIO_CLIENTE";

/**
 * Función de reintento para operaciones críticas de Google Services.
 */
function executeWithRetry(fn, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return fn();
    } catch (e) {
      lastError = e;
      if (e.message.includes("Service Spreadsheets failed") || e.message.includes("Timed out") || e.message.includes("Drive")) {
        Utilities.sleep(Math.pow(2, i) * 1000); // Exponential backoff (1s, 2s, 4s)
        continue;
      }
      throw e; // Si no es un error de servicio, lanzamos
    }
  }
  throw lastError;
}

function getActiveSS() {
  if (!_cacheSS) {
    try {
      _cacheSS = executeWithRetry(() => SpreadsheetApp.getActiveSpreadsheet());
    } catch (e) {
      console.error("Error obteniendo SS: " + e.message);
    }
  }
  return _cacheSS;
}

function getAppScriptConfig() {
  // Solo devolvemos caché de memoria local si tiene datos (evita propagar fallos temporales)
  if (_cacheConfig && Object.keys(_cacheConfig).length > 0) return _cacheConfig;

  // Intentar leer de CacheService (Caché global de Google súper rápida)
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get("GLOBAL_SCRIPT_CONFIG");
  if (cachedData) {
    try {
      _cacheConfig = JSON.parse(cachedData);
      return _cacheConfig;
    } catch (e) {
      console.warn("Error parseando cache config: " + e.message);
    }
  }

  try {
    const config = executeWithRetry(() => {
      const sheetSS = getActiveSS();
      if (!sheetSS) return {};
      const sheet = sheetSS.getSheetByName("BD_APP_SCRIPT");
      if (!sheet) return {};
      
      const lastCol = sheet.getLastColumn();
      if (lastCol === 0) return {};
      
      // Leer cabeceras y encontrar los índices de CLAVE y VALOR de forma dinámica
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toUpperCase());
      let claveIdx = -1;
      let valorIdx = -1;
      
      for (let i = 0; i < headers.length; i++) {
        const headerFuzzy = headers[i].replace(/[\s_-]/g, "");
        if (headerFuzzy.includes("CLAVE") || headerFuzzy.includes("TIPOCLAVE")) {
          claveIdx = i;
        } else if (headerFuzzy.includes("VALOR")) {
          valorIdx = i;
        }
      }
      
      // Fallback a los índices históricos si no se detectan cabeceras
      if (claveIdx === -1) claveIdx = 1;
      if (valorIdx === -1) valorIdx = 2;
      
      const data = sheet.getDataRange().getValues();
      const cfg = {};
      for (let i = 1; i < data.length; i++) {
        const clave = String(data[i][claveIdx]).trim();
        const valor = String(data[i][valorIdx]).trim();
        if (clave) cfg[clave] = valor;
      }
      return cfg;
    });

    if (Object.keys(config).length > 0) {
      _cacheConfig = config;
      // Guardar en caché por 15 minutos (900 segundos)
      cache.put("GLOBAL_SCRIPT_CONFIG", JSON.stringify(config), 900);
    }
    return config;
  } catch (e) {
    console.error("Error cargando SCRIPT_CONFIG: " + e.message);
    return _cacheConfig || {}; // Devolver caché aunque sea vieja si falló el reintento
  }
}

/**
 * GLOBAL_CONFIG dinámico (V3.0)
 * Usa getters para asegurar que los valores se lean de SCRIPT_CONFIG en tiempo de ejecución.
 */
const GLOBAL_CONFIG = {
  get SCRIPT_CONFIG() { return getAppScriptConfig(); },
  get SPREADSHEET_ID() { return getActiveSS() ? getActiveSS().getId() : ""; },
  get SCRIPT_URL() { return ScriptApp.getService().getUrl(); },

  DRIVE: {
    get PARENT_FOLDER_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DRIVE_PARENT_FOLDER_ID"] || ""; },
    get TEMP_FOLDER_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DRIVE_TEMP_FOLDER_ID"] || ""; },
    get JSON_CONFIG_FOLDER_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DRIVE_JSON_CONFIG_FOLDER_ID"] || ""; },
    get JSON_CONFIG_FILE_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DRIVE_JSON_CONFIG_FILE_ID"] || ""; },
    get WOO_FOLDER_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DRIVE_WOO_FOLDER_ID"] || ""; },
    get BACKUP_FOLDER_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DRIVE_BACKUP_FOLDER_ID"] || "" }
  },

  APPSHEET: {
    get APP_NAME() { return GLOBAL_CONFIG.SCRIPT_CONFIG["APPSHEET_APP_NAME"] || "CASTFERSYSTEMV1-DEFAULT"; },
    get APP_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["APPSHEET_APP_ID"] || ""; },
    get ACCESS_KEY() { return GLOBAL_CONFIG.SCRIPT_CONFIG["APPSHEET_ACCESS_KEY"] || ""; },
    get COMPROBANTES_FOLDER_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["APPSHEET_CARPETA_COMPROBANTES_ID"] || ""; }
  },

  SCRIPTS: {
    get GLOBAL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GLOBAL_SCRIPT_ID"] || ""; },
    get BLOGGER() { return GLOBAL_CONFIG.SCRIPT_CONFIG["MACRO_BLOGGER_ID"] || ""; }
  },

  WORDPRESS: {
    get IMAGE_API_URL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["WP_IMAGE_API_URL"] || ""; },
    get IMAGE_API_KEY() { return GLOBAL_CONFIG.SCRIPT_CONFIG["WP_IMAGE_API_KEY"] || ""; },
    get PRODUCT_API_URL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["WP_PRODUCT_API_URL"] || ""; },
    get SITE_URL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["WP_SITE_URL"] || ""; },
    get CONSUMER_KEY() { return GLOBAL_CONFIG.SCRIPT_CONFIG["WP_CONSUMER_KEY"] || ""; },
    get CONSUMER_SECRET() { return GLOBAL_CONFIG.SCRIPT_CONFIG["WP_CONSUMER_SECRET"] || ""; }
  },

  GEMINI: {
    get API_KEY() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GM_IMAGE_API_KEY"] || ""; },
    get FREE_API_KEY() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GM_FREE_API_KEY"] || ""; },
    get PAID_PIN() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GM_PAID_PIN"] || "1234"; }
  },

  TELEGRAM: {
    get BOT_TOKEN() { return String(GLOBAL_CONFIG.SCRIPT_CONFIG["TELEGRAM_BOT_TOKEN"] || "").trim(); },
    get CHAT_ID() { return String(GLOBAL_CONFIG.SCRIPT_CONFIG["TELEGRAM_CHAT_ID"] || "").trim(); },
    get DEV_CHAT_ID() {
      const val = String(GLOBAL_CONFIG.SCRIPT_CONFIG["TELEGRAM_DEV_CHAT_ID"] || "").trim();
      return (val === "true" || val === "false") ? "" : val;
    },
    get MODE() { return (String(GLOBAL_CONFIG.SCRIPT_CONFIG["TELEGRAM_MODE"] || "DEV")).toUpperCase().trim(); }
  },

  NOTIFICACIONES: {
    get PROVIDER() { return GLOBAL_CONFIG.SCRIPT_CONFIG["NOTIFICATION_PROVIDER"] || "TELEGRAM"; },
    get EMAIL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["NOTIFICATION_EMAIL"] || ""; }
  },

  get PUBLICATION_TARGET() { return GLOBAL_CONFIG.SCRIPT_CONFIG["PUBLICATION_TARGET"] || "AMBOS"; },
  get BLOGGER_PUBLICATION_TARGET() { return GLOBAL_CONFIG.SCRIPT_CONFIG["BLOGGER_PUBLICATION_TARGET"] || "AMBOS"; },
  get TPV_PUBLICATION_TARGET() { return GLOBAL_CONFIG.SCRIPT_CONFIG["TPV_PUBLICATION_TARGET"] || "DRIVE"; },

  GITHUB: {
    get USER() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GITHUB_USER"] || ""; },
    get REPO() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GITHUB_REPO"] || ""; },
    get TOKEN() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GITHUB_TOKEN"] || ""; },
    get FILE_PATH() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GITHUB_FILE_PATH"] || "catalogo.json"; }
  },

  // --- REPOSITORIO CENTRALIZADO DE ACTIVOS (BlogShop Core - Hardcoded) ---
  ASSETS_GITHUB: {
    USER: "SystemBlogShop",
    REPO: "erp-shared-assets",
    get TOKEN() { return GLOBAL_CONFIG.SCRIPT_CONFIG["ASSETS_GITHUB_TOKEN"] || ""; },
    get BRANCH() { return GLOBAL_CONFIG.SCRIPT_CONFIG["ASSETS_GITHUB_BRANCH"] || "main"; },
    get ENABLE_SYNC() { return GLOBAL_CONFIG.SCRIPT_CONFIG["ASSETS_ENABLE_GITHUB_SYNC"] !== "FALSE"; }
  },

  BLOGGER: {
    get CACHE_FOLDER_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["BLOGGER_CACHE_FOLDER_ID"] || ""; },
    get GITHUB_FILE_PATH() { return GLOBAL_CONFIG.SCRIPT_CONFIG["BLOGGER_GITHUB_FILE_PATH"] || "blogger_config.json"; }
  },

  DONWEB: {
    get WRITE_URL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DONWEB_WRITE_URL"] || ""; },
    get READ_URL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DONWEB_READ_URL"] || ""; }
  },

  SYNC_WINDOW: {
    get START_HOUR() { return parseHourSetting(GLOBAL_CONFIG.SCRIPT_CONFIG["SYNC_START_HOUR"], 0); },
    get END_HOUR() { return parseHourSetting(GLOBAL_CONFIG.SCRIPT_CONFIG["SYNC_END_HOUR"], 23); }
  },

  BIGQUERY: {
    get ENABLE() { return String(GLOBAL_CONFIG.SCRIPT_CONFIG["BQ_ENABLE"] || "FALSE").toUpperCase() === "TRUE"; },
    get PROJECT_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["BQ_PROJECT_ID"] || ""; },
    get DATASET_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["BQ_DATASET_ID"] || ""; }
  }
};

/**
 * Las constantes SHEETS y SHEET_SCHEMA ahora se encuentran en src/Core/Constants.js
 */

/**
 * HeaderManager: Motor de escaneo dinámico de columnas.
 * Cachea los mapas de columnas por ejecución para optimizar performance.
 */
const HeaderManager = {
  _cache: {},

  /**
   * Obtiene un mapa de { NOMBRE_COLUMNA: INDICE_0 } para una hoja.
   * @param {string} sheetAlias El alias de la hoja en el objeto SHEETS.
   */
  getMapping(sheetAlias) {
    if (this._cache[sheetAlias]) return this._cache[sheetAlias];

    const sheetName = SHEETS[sheetAlias] || sheetAlias;
    const ss = getActiveSS();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      // debugLog(`❌ HeaderManager: Hoja '${sheetName}' no encontrada.`);
      return null;
    }

    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return {};

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const mapping = {};

    headers.forEach((header, index) => {
      if (header) {
        let rawH = String(header).trim().toUpperCase();
        let fuzzyH = rawH.replace(/[\s_-]/g, ""); // Normalización difusa

        mapping[rawH] = index;
        mapping[fuzzyH] = index;

        // Alias para compatibilidad global
        if (fuzzyH.includes("MACROID") || fuzzyH.includes("CATEGORIAID") || fuzzyH.includes("PRODID") || fuzzyH.includes("PRODUCTOID") || fuzzyH.includes("COLORID") || fuzzyH.includes("CLIENTEID") || fuzzyH.includes("VARIACIONID") || fuzzyH.includes("IDAGENCIA")) mapping["ID"] = index;
        if (fuzzyH.includes("CLAVE")) mapping["CLAVE"] = index;
        if (fuzzyH.includes("VALOR")) mapping["VALOR"] = index;
        if (fuzzyH.includes("CORREO") || fuzzyH.includes("MAIL") || fuzzyH.includes("CORREOELECTRONICO")) mapping["EMAIL"] = index;
        if (fuzzyH.includes("ROL") || fuzzyH.includes("ROLTIENDA")) mapping["ROL"] = index;
        if (fuzzyH.includes("TIENDAADMINISTRADA") || fuzzyH.includes("MANAGEDSTORE")) mapping["MANAGED_STORE"] = index;
        // Alias para Agencias (NUEVO)
        if (fuzzyH === "AGENCIAID" || fuzzyH === "IDAGENCIA") mapping["ID"] = index;
        if (fuzzyH.includes("COSTOENVIO") || fuzzyH === "COSTO") mapping["COSTO"] = index;
        if (fuzzyH.includes("HORAENTREGA") || fuzzyH === "HORA") mapping["HORA"] = index;
        // Alias para SVG
        if (fuzzyH.includes("SVGCODE") || fuzzyH.includes("CODIGOSVG") || fuzzyH === "CODE") mapping["CODE"] = index;
        if (fuzzyH.includes("SVGNOMBRE") || fuzzyH === "NOMBRE") mapping["NOMBRE"] = index;
        // Alias para Categorías
        if (fuzzyH.includes("CATEGORIAGENERAL") || fuzzyH.includes("CATEGORIAPADRE") || fuzzyH.includes("PADRE")) mapping["CATEGORIA_PADRE"] = index;
        if (fuzzyH.includes("CARPETA") || fuzzyH.includes("CARPETAID")) mapping["CARPETA_ID"] = index;
        if (fuzzyH.includes("TEMPORADA") || fuzzyH.includes("TEMPORAL")) mapping["TEMPORADA"] = index;
        // Alias para WooCommerce / Pedidos
        if (fuzzyH.includes("IDORDEN") || fuzzyH.includes("ORDERID") || fuzzyH.includes("NROORDEN")) mapping["ID_ORDEN"] = index;
        if (fuzzyH.includes("IDCLIENTE") || fuzzyH.includes("CUSTOMERID") || fuzzyH.includes("CLIENTE")) mapping["CLIENTE"] = index;
        if (fuzzyH.includes("TELÉFONO") || fuzzyH.includes("TELEFONO") || fuzzyH.includes("PHONE") || fuzzyH.includes("CELULAR")) mapping["TELEFONO"] = index;
        if (fuzzyH.includes("TOTALVENTA") || fuzzyH.includes("TOTAL")) mapping["TOTAL_VENTA"] = index;
        if (fuzzyH.includes("ULTIMAACTUALIZACION") || fuzzyH.includes("ULTACTUALIZACION")) mapping["ULTIMA_ACTUALIZACION"] = index;
      }
    });

    // Validación y Traducción contra el Esquema (Crucial para estabilidad)
    const required = SHEET_SCHEMA[sheetAlias];
    if (required) {
      required.forEach(col => {
        let exactCol = col.toUpperCase();
        let fuzzyCol = exactCol.replace(/[\s_-]/g, "");

        // Si la hoja tiene esta columna (ej: "DETALLE JSON" -> "DETALLEJSON")
        if (mapping[fuzzyCol] !== undefined) {
          // Aseguramos que la macro pueda llamarla con su nombre de esquema oficial (ej: mS.DETALLE_JSON)
          mapping[exactCol] = mapping[fuzzyCol];
        } else {
          // debugLog(`⚠️ Columna '${exactCol}' no detectada en '${sheetName}'.`);
        }
      });
    }

    this._cache[sheetAlias] = mapping;
    return mapping;
  },

  /**
   * Limpia el caché. Útil en procesos largos si se sospecha que las hojas cambiaron.
   */
  clearCache() {
    this._cache = {};
  }
};



/**
 * Convierte un rango de datos a una lista de objetos.
 * Ahora usa HeaderManager para garantizar que las claves del objeto sean consistentes.
 */
function convertirRangoAObjetos(sheetOrName) {
  let sheet;
  let alias = null;

  if (typeof sheetOrName === 'string') {
    sheet = getActiveSS().getSheetByName(sheetOrName);
    // Intentar encontrar el alias
    for (const key in SHEETS) {
      if (SHEETS[key] === sheetOrName) {
        alias = key;
        break;
      }
    }
  } else {
    sheet = sheetOrName;
    if (sheet) {
      const name = sheet.getName();
      for (const key in SHEETS) {
        if (SHEETS[key] === name) {
          alias = key;
          break;
        }
      }
    }
  }

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data.shift().map(h => String(h).trim().toUpperCase());

  return data.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      if (header) obj[header] = row[i];
    });
    return obj;
  });
}

// --- VARIABLE GLOBAL PARA CACHEAR LA HOJA DE LOGS ---
let _cacheLogSheet = null;

/**
 * Función de logging persistente optimizada (V6.2)
 */
/**
 * Parsea de manera robusta un valor de hora desde la configuración.
 * Soporta números, strings con formato de hora ("HH:mm") y strings de fecha completos
 * que genera Google Sheets al leer celdas formateadas como Hora ("Sat Dec 30 1899 HH:mm:ss...").
 * @param {*} val El valor a parsear.
 * @param {number} defaultVal Valor por defecto si falla el parseo.
 * @returns {number} La hora parseada.
 */
function parseHourSetting(val, defaultVal) {
  if (val === undefined || val === null || val === "") return defaultVal;
  const str = String(val).trim();
  
  // Buscar un patrón del tipo "HH:mm" dentro del string
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Verifica si el sistema está en horario de trabajo para sincronización. (Modo Nocturno)
 */
function isSystemInWorkingHours() {
  const now = new Date();
  let timezone = "America/Argentina/Buenos_Aires";
  try {
    timezone = Session.getScriptTimeZone() || timezone;
  } catch (e) {
    console.warn("Error obteniendo ScriptTimeZone: " + e.message);
  }
  const hour = parseInt(Utilities.formatDate(now, timezone, "H"), 10);
  const start = GLOBAL_CONFIG.SYNC_WINDOW.START_HOUR;
  const end = GLOBAL_CONFIG.SYNC_WINDOW.END_HOUR;

  if (isNaN(start) || isNaN(end)) {
    console.warn(`⚠️ [WorkingHours] Error al obtener horas de la ventana: START_HOUR=${start}, END_HOUR=${end}. Omitiendo restricción.`);
    return true;
  }

  let isWorking = false;
  if (start <= end) {
    isWorking = hour >= start && hour <= end;
  } else {
    // Caso rango cruzado (ej: 22 a 05)
    isWorking = hour >= start || hour <= end;
  }

  if (!isWorking) {
    console.log(`💤 [WorkingHours] Suspendido: Hora actual=${hour}, Ventana=${start}:00 a ${end}:00`);
  }
  return isWorking;
}

/**
 * Función de registro unificada con marcas de tiempo.
 */
function debugLog(msg, forceSheet = false) {
  console.log(msg); // Siempre rápido en consola

  // Solo escribimos en la hoja si es un error o se fuerza (para evitar latencia en Webhooks)
  const esError = msg.includes("❌") || msg.includes("Error");

  if (esError) {
    notificarTelegramSalud(msg, "ERROR");
  }

  if (!esError && !forceSheet) return;

  try {
    if (!_cacheLogSheet) {
      const activeSs = SpreadsheetApp.getActiveSpreadsheet();
      if (activeSs) {
        _cacheLogSheet = activeSs.getSheetByName("DEBUG_LOGS") || activeSs.insertSheet("DEBUG_LOGS");
      }
    }
    if (_cacheLogSheet) {
      _cacheLogSheet.appendRow([new Date(), msg]);
    }
  } catch (e) {
    // Silencioso
  }
}

/**
 * Actualiza el contenido de un archivo en Google Drive sin cambiar su ID.
 * Requiere el Servicio Avanzado de Drive (v3).
 * @param {string} fileId El ID del archivo a actualizar.
 * @param {string} content El nuevo contenido del archivo.
 * @param {string} [mimeType] Opcional. El tipo MIME del archivo.
 */
function drive_updateFileContent(fileId, content, mimeType = "application/json") {
  try {
    const blob = Utilities.newBlob(content, mimeType);

    // Usando Servicio Avanzado v3: Drive.Files.update(resource, fileId, mediaData)
    // Nota: mediaData es el Blob.
    Drive.Files.update({}, fileId, blob);

    return { success: true };
  } catch (e) {
    console.error(`Error actualizando archivo ${fileId}: ${e.message}`);
    return { success: false, message: e.message };
  }
}


/**
 * Recibe y registra los errores emitidos por las plantillas HTML (window.onerror)
 * para evitar crashes frontend y dar seguimiento.
 */
function logErrorFromFrontend(msg, url, line, col, errorObj) {
  const detalle = `FRONTEND ERROR: ${msg} | URL: ${url} | L: ${line} | C: ${col}`;
  debugLog(detalle, true);
}

/**
 * Función auxiliar para enviar un mensaje simple de Telegram.
 */
function enviarTelegramRespuestaSimple(chatId, text) {
  const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
  if (!token) {
    debugLog("Error: TELEGRAM_BOT_TOKEN no configurado para enviar respuesta.");
    return;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    method: "post",
    payload: JSON.stringify({
      chat_id: chatId,
      text: text
    }),
    contentType: "application/json",
    muteHttpExceptions: true
  };
  try {
    UrlFetchApp.fetch(url, payload);
    debugLog(`✅ [Telegram] Respuesta simple enviada a ${chatId}: "${text}"`);
  } catch (e) {
    debugLog(`❌ [Telegram] Error al enviar respuesta simple a ${chatId}: ${e.message}`);
  }
}

/**
 * 🏥 SISTEMA DE REPORTES DE SALUD (GLOBAL)
 * Envía notificaciones al Bot de Telegram identificando el sistema de origen.
 * @param {string} mensaje El contenido del reporte.
 * @param {string} tipo El tipo de reporte: 'ERROR', 'EXITO', 'INFO', 'WARN'.
 */
function notificarTelegramSalud(mensaje, tipo = 'INFO') {
  const config = GLOBAL_CONFIG.TELEGRAM;
  const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME || "ERP_CORE";
  const mode = config.MODE || "PROD";

  // --- LÓGICA DE ENRUTAMIENTO INTELIGENTE (V7.0) ---
  // Errores y Salud -> Al Desarrollador (DEV_CHAT_ID)
  // Éxitos y Negocio -> Al Cliente (CHAT_ID)
  const isDevMsg = ['ERROR', 'WARN', 'HEALTH'].includes(tipo);
  const targetChatId = (isDevMsg && config.DEV_CHAT_ID) ? config.DEV_CHAT_ID : config.CHAT_ID;

  Logger.log(`📡 [Health] Iniciando reporte: ${tipo} | Destino: ${targetChatId} | Msg: ${mensaje.substring(0, 30)}...`);

  if (!config.BOT_TOKEN || config.BOT_TOKEN.trim() === "" || config.BOT_TOKEN.includes("AQUÍ") || config.BOT_TOKEN.includes("BOT_TOKEN") || !targetChatId || targetChatId.trim() === "") {
    Logger.log("⚠️ [Health] Telegram no está configurado (Token o ChatID vacíos o de plantilla). Reporte omitido silenciosamente.");
    return;
  }

  const iconos = {
    'ERROR': '🚨 [ERROR CRÍTICO]',
    'EXITO': '✅ [ÉXITO]',
    'INFO': 'ℹ️ [INFO]',
    'WARN': '⚠️ [ADVERTENCIA]',
    'HEALTH': '🩺 [SISTEMA OK]'
  };

  const icono = iconos[tipo] || iconos['INFO'];
  const fecha = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");

  const textoFinal = `${icono}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💻 <b>Sistema:</b> ${appName}\n` +
    `🌐 <b>Entorno:</b> ${mode}\n` +
    `📅 <b>Fecha:</b> ${fecha}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `📝 <b>Mensaje:</b>\n${mensaje}`;

  const props = PropertiesService.getScriptProperties();
  const lastSuccessId = props.getProperty("LAST_SUCCESS_MSG_ID");

  // Si es EXITO y tenemos un ID previo, intentamos editar
  if (tipo === 'EXITO' && lastSuccessId) {
    Logger.log(`🔄 [Health] Intentando editar mensaje pegajoso: ${lastSuccessId}`);
    const editUrl = `https://api.telegram.org/bot${config.BOT_TOKEN}/editMessageText`;
    const editOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: config.CHAT_ID,
        message_id: lastSuccessId,
        text: textoFinal,
        parse_mode: "HTML"
      }),
      muteHttpExceptions: true
    };

    try {
      const editRes = UrlFetchApp.fetch(editUrl, editOptions);
      const editData = JSON.parse(editRes.getContentText());
      if (editData.ok) {
        Logger.log("✅ [Health] Mensaje editado correctamente.");
        return;
      } else {
        Logger.log(`⚠️ [Health] No se pudo editar (${editData.description}). Enviando nuevo...`);
        props.deleteProperty("LAST_SUCCESS_MSG_ID");
      }
    } catch (e) {
      Logger.log(`❌ [Health] Error en edición: ${e.message}`);
      props.deleteProperty("LAST_SUCCESS_MSG_ID");
    }
  }

  // Enviar mensaje nuevo
  Logger.log(`📨 [Health] Enviando mensaje nuevo a ${targetChatId}...`);
  const url = `https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`;
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: targetChatId,
      text: textoFinal,
      parse_mode: "HTML"
    }),
    muteHttpExceptions: true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const resText = res.getContentText();
    const data = JSON.parse(resText);

    if (data.ok && data.result) {
      const newMsgId = data.result.message_id;
      Logger.log(`✅ [Health] Mensaje enviado OK. ID: ${newMsgId}`);

      if (tipo === 'EXITO') {
        props.setProperty("LAST_SUCCESS_MSG_ID", String(newMsgId));
        pinTelegramMessage(newMsgId);
      }
      if (tipo === 'ERROR') {
        pinTelegramMessage(newMsgId);
      }
    } else {
      Logger.log(`❌ [Health] Error de API Telegram: ${resText}`);
    }
  } catch (e) {
    Logger.log(`❌ [Health] Fallo crítico fetch: ${e.message}`);
  }
}

/**
 * Ancla un mensaje en el chat de Telegram.
 */
function pinTelegramMessage(messageId) {
  const config = GLOBAL_CONFIG.TELEGRAM;
  if (!config.BOT_TOKEN || !config.CHAT_ID) return;

  const url = `https://api.telegram.org/bot${config.BOT_TOKEN}/pinChatMessage`;
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: config.CHAT_ID,
      message_id: messageId,
      disable_notification: false
    }),
    muteHttpExceptions: true
  };

  try {
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    console.error("No se pudo anclar el mensaje: " + e.message);
  }
}

// Helpers locales para asegurar lectura si fallan las constantes globales
function GITHUB_GLOBAL_CONFIG_TELEGRAM_TOKEN() { return getAppScriptConfig()["TELEGRAM_BOT_TOKEN"]; }
function GITHUB_GLOBAL_CONFIG_GLOBAL_ID() { return getAppScriptConfig()["GLOBAL_SCRIPT_ID"]; }

/**
 * Función auxiliar para obtener el ID de la tienda principal
 * desde la hoja de configuración general.
 */
function getGeneralId(ss) {
  const mapping = HeaderManager.getMapping("GENERAL_CONFIG");
  const sheet = ss.getSheetByName(SHEETS.GENERAL_CONFIG);
  if (!sheet || !mapping) return "TIENDA_PRINCIPAL";

  const data = sheet.getDataRange().getValues();
  const idxClave = mapping["CLAVE"];
  const idxValor = mapping["VALOR"];

  // CASO 1: Formato KV (Buscamos fila por fila)
  if (idxClave !== undefined && idxValor !== undefined) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxClave]).trim() === "TIENDA_ID") {
        return data[i][idxValor];
      }
    }
  }

  // CASO 2: Formato Wide (Buscamos columna específica)
  const colTienda = mapping["TIENDA_BLOGGER"] || mapping["GENERAL_ID"];
  if (colTienda !== undefined && data.length > 1) {
    return String(data[1][colTienda]).trim() || "TIENDA_PRINCIPAL";
  }

  return "TIENDA_PRINCIPAL";
}

// =================================================================
// ===           ROUTER PRINCIPAL (doGet V5.2)                   ===
// =================================================================

/**
 * Determina la URL del catálogo JSON basado en el target de publicación.
 */
function getCatalogJsonUrl() {
  const readUrl = GLOBAL_CONFIG.DONWEB.READ_URL;
  const fileName = GLOBAL_CONFIG.GITHUB.FILE_PATH || "catalogo.json";

  if (readUrl && !readUrl.includes("drive.google.com")) {
    return `${readUrl}?file=${fileName}`;
  }

  // Si no hay Donweb configurado, o se quiere usar Drive, devolver URL de GAS
  // El frontend podrá llamar a esta URL con ?op=configuracion para obtener la data desde Drive
  return `${GLOBAL_CONFIG.SCRIPT_URL}?op=configuracion`;
}

/**
 * Retorna la URL de respaldo (GitHub Raw) para el catálogo.
 */
function getCatalogFallbackUrl() {
  const user = GLOBAL_CONFIG.GITHUB.USER;
  const repo = GLOBAL_CONFIG.GITHUB.REPO;
  const path = GLOBAL_CONFIG.GITHUB.FILE_PATH || "catalogo.json";

  if (user && repo) {
    return `https://raw.githubusercontent.com/${user}/${repo}/refs/heads/main/${path}`;
  }
  return "";
}

function doGet_MainRouter(e) {
  const params = e.parameter;
  const isEmbedded = params.embedded === 'true';
  const view = params.view || '';
  let accion = params.accion || params.op || params.o || '';

  // BLINDAJE EXTREMO: Si el Frontend omitió enviar la operación principal, la extraemos del payload anidado.
  if (!accion && params.venta_data) {
    try {
      const vData = JSON.parse(params.venta_data);
      accion = vData.o || vData.op || vData.accion || '';
    } catch (e) { }
  }

  const mode = params.mode || '';

  // --- APOYO BLOGGER: RUTEADOR CENTRALIZADO (Prioridad Máxima - JSONP Support) ---
  const bloggerActions = ["p", "d", "e", "venta", "consultar_cliente", "cargar_venta", "pagar", "cancelar", "confirmar_pago_presencial", "pagar_con_comprobante", "configuracion"];
  if (bloggerActions.indexOf(accion) !== -1 || bloggerActions.indexOf(params.op) !== -1) {
    let respuestaObjeto;
    try {
      respuestaObjeto = blogger_router(params);
    } catch (criticalErr) {
      console.error("❌ Error Crítico en blogger_router: " + criticalErr.message);
      respuestaObjeto = { status: "-1", message: "ERROR INTERNO ERP: " + criticalErr.message };
    }

    // Sanitización del nombre del callback
    let callback = params.callback || params.prefix || params._ || "callback";
    callback = callback.replace(/[^a-zA-Z0-9$_.]/g, "");

    let payloadStr = "";
    try {
      const rawJson = (typeof respuestaObjeto === "string") ? respuestaObjeto : JSON.stringify(respuestaObjeto);
      payloadStr = rawJson.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    } catch (e) {
      payloadStr = JSON.stringify({ status: "-1", message: "Error serializando respuesta: " + e.message });
    }

    const jsonpResponse = `${callback}(${payloadStr})`;
    return ContentService.createTextOutput(jsonpResponse).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // --- MODO: GENERAR RÓTULO DE ENVÍO (Centralizado) ---
  if (mode === "print_label") {
    try {
      const htmltemplate = HtmlService.createTemplateFromFile('Web/print_label');

      // Definir valores por defecto para evitar ReferenceErrors en la plantilla
      const camposBase = [
        "logo", "telefono_tienda", "direccion_tienda", "remitente", "codigo_pedido", "fecha_hora",
        "transporte", "destinatario", "direccion_envio", "localidad",
        "provincia", "codigo_postal", "tipo_envio", "celular", "cuit", "email",
        "zona_sucursal", "observaciones"
      ];
      camposBase.forEach(c => { htmltemplate[c] = ""; });

      // Mapear los parámetros reales de la URL
      Object.keys(params).forEach(key => { htmltemplate[key] = params[key] || ""; });

      if (params.logo && params.logo.indexOf("{") !== -1) {
        try { htmltemplate.logo = JSON.parse(params.logo).Url; } catch (i) { htmltemplate.logo = params.logo; }
      }

      return htmltemplate.evaluate()
        .setTitle("Rótulo de Envío - " + (params.codigo_pedido || "HostingShop"))
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      return ContentService.createTextOutput("❌ Error en Rótulo: " + err.message);
    }
  }

  debugLog("📡 [doGet] Accion: " + accion + " | Params: " + JSON.stringify(params));



  // --- Acción: Actualizar IP Local (Desde Python TPV) ---
  if (accion === "actualizar_ip_local") {
    const tiendaId = e.parameter.tienda_id;
    const nuevaIp = e.parameter.nueva_ip;

    if (!tiendaId || !nuevaIp) {
      return ContentService.createTextOutput("Faltan datos").setMimeType(ContentService.MimeType.TEXT);
    }

    // Usamos el nombre de hoja desde la constante global si existe, o directo
    const ss = getActiveSS();
    const mapping = HeaderManager.getMapping("STORES");
    const sheetName = SHEETS.STORES || "BD_TIENDAS";
    const sheetTiendas = ss.getSheetByName(sheetName);

    if (!sheetTiendas || !mapping) {
      debugLog("❌ Error: Hoja de tiendas o mapeo no hallado para actualizar IP.", true);
      return ContentService.createTextOutput("Error: Hoja de tiendas no encontrada").setMimeType(ContentService.MimeType.TEXT);
    }

    const data = sheetTiendas.getDataRange().getValues();
    const tiendaIdIndex = mapping["TIENDA_ID"];
    const ipColIndex = mapping["IP_IMPRESORA_LOCAL"];

    if (tiendaIdIndex === undefined || ipColIndex === undefined) {
      return ContentService.createTextOutput("Error: Columnas TIENDA_ID o IP_IMPRESORA_LOCAL no encontradas").setMimeType(ContentService.MimeType.TEXT);
    }

    // Buscar la tienda y actualizar
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][tiendaIdIndex]).trim() === String(tiendaId).trim()) {
        sheetTiendas.getRange(i + 1, ipColIndex + 1).setValue(nuevaIp);
        debugLog("📡 [IP Sync] Tienda: " + tiendaId + " | Nueva IP: " + nuevaIp, true);
        return ContentService.createTextOutput("IP Actualizada OK").setMimeType(ContentService.MimeType.TEXT);
      }
    }
    return ContentService.createTextOutput("Tienda no encontrada").setMimeType(ContentService.MimeType.TEXT);
  }


  if (view === 'imagenes_manager') {
    const template = HtmlService.createTemplateFromFile('Web/images_dashboard');
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    template.isWooConfigured = !!(GLOBAL_CONFIG.WORDPRESS.SITE_URL && GLOBAL_CONFIG.WORDPRESS.CONSUMER_KEY && GLOBAL_CONFIG.WORDPRESS.CONSUMER_SECRET);
    template.wooSiteUrl = String(GLOBAL_CONFIG.WORDPRESS.SITE_URL || "").trim();
    const paidKey = GLOBAL_CONFIG.GEMINI.API_KEY || "";
    template.hasGeminiPaidKey = !!(paidKey && paidKey.trim() !== "" && !paidKey.includes("AQUÍ") && !paidKey.includes("GEMINI_API_KEY"));
    return template.evaluate()
      .setTitle('Gestor de Imágenes')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // --- Vista Pública Cliente (NEW) ---
  if (view === 'customer_order') {
    const oid = e.parameter.oid;
    return renderCustomerSaleView(oid);
  }

  // --- Vista Registro Cliente (NEW) ---
  if (view === 'client_form') {
    return HtmlService.createTemplateFromFile('Web/client_form_view')
      .evaluate()
      .setTitle('Registro de Cliente')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // --- Vista AI Laboratory (Modo Escuela) ---
  if (view === 'ai_lab') {
    const template = HtmlService.createTemplateFromFile('Web/ai_lab');
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    return template.evaluate()
      .setTitle('AI Laboratory - Forensic School')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // --- CASO 1: SOLICITUD DIRECTA / APPSHEET (LEGACY) ---
  // Si la URL tiene una acción O pide la vista 'inventario' explícitamente
  // Y NO es una llamada interna del SPA (embedded)...
  // ENTONCES: Servimos el template antiguo directamente (sin menú lateral).
  if (!isEmbedded && (accion !== '' || view === 'inventario')) {
    const template = configurarTemplateRunner(accion, params.codigo, params.fecha);
    return template.evaluate()
      .setTitle('Ejecución de Proceso')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // --- CASO 2: SOLICITUD SPA (SYSTEM CONTAINER) ---
  // Si no es una acción directa, cargamos el Contenedor Principal.
  const template = HtmlService.createTemplateFromFile('Web/systemContainer');
  template.scriptUrl = ScriptApp.getService().getUrl();

  // Lógica para ocultar menú de WooCommerce si no hay credenciales
  const isWooConfigured = (GLOBAL_CONFIG.WORDPRESS.SITE_URL && GLOBAL_CONFIG.WORDPRESS.CONSUMER_KEY) ? true : false;
  template.isWooConfigured = isWooConfigured;

  // Pasamos parámetros limpios para evitar bucles en el frontend
  template.initialParams = JSON.stringify({ view: 'welcome' });
  template.CATALOG_URL = getCatalogJsonUrl();
  template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();

  return template.evaluate()
    .setTitle('Sistema de Gestión ERP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * API INTERNA SPA: Devuelve el HTML de las sub-vistas como texto.
 */
function getPageContent(view, accion, codigo, fecha, isEmbedded = false) {
  // Normalización
  if (view === 'inventario' || view === 'legacy_action') view = 'runner';

  if (view === 'inventory_dashboard') {
    const template = HtmlService.createTemplateFromFile('Web/inventory_dashboard');
    template.isEmbedded = isEmbedded;
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    return template.evaluate().getContent();
  }

  if (view === 'auditoria') {
    const template = HtmlService.createTemplateFromFile('Web/sale_dashboard');
    template.isEmbedded = isEmbedded;
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    return template.evaluate().getContent();
  }

  // --- NUEVO: Gestor de Imágenes ---
  if (view === 'imagenes_manager') {
    const template = HtmlService.createTemplateFromFile('Web/images_dashboard');
    template.isEmbedded = isEmbedded;
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    template.isWooConfigured = !!(GLOBAL_CONFIG.WORDPRESS.SITE_URL && GLOBAL_CONFIG.WORDPRESS.CONSUMER_KEY && GLOBAL_CONFIG.WORDPRESS.CONSUMER_SECRET);
    template.wooSiteUrl = String(GLOBAL_CONFIG.WORDPRESS.SITE_URL || "").trim();
    const paidKey = GLOBAL_CONFIG.GEMINI.API_KEY || "";
    template.hasGeminiPaidKey = !!(paidKey && paidKey.trim() !== "" && !paidKey.includes("AQUÍ") && !paidKey.includes("GEMINI_API_KEY"));
    return template.evaluate().getContent();
  }

  // --- NUEVO: AI Laboratory ---
  if (view === 'ai_lab') {
    const template = HtmlService.createTemplateFromFile('Web/ai_lab');
    template.isEmbedded = isEmbedded;
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    return template.evaluate().getContent();
  }

  if (view === 'pos_manager') {
    const template = HtmlService.createTemplateFromFile('Web/pos_view');
    template.isEmbedded = isEmbedded;
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    return template.evaluate().getContent();
  }

  // --- NUEVA: Vista de Importación Inteligente de WhatsApp ---
  if (view === 'whatsapp_import') {
    const template = HtmlService.createTemplateFromFile('Web/whatsapp_import');
    template.isEmbedded = isEmbedded;
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    return template.evaluate().getContent();
  }

  // --- NUEVA: Vista de Registro de Cliente ---
  if (view === 'client_form') {
    const template = HtmlService.createTemplateFromFile('Web/client_form_view')
    template.isEmbedded = isEmbedded;
    return template.evaluate().getContent();
  }

  // --- NUEVA: Vista de Login ---
  if (view === 'login') {
    const template = HtmlService.createTemplateFromFile('Web/login_view');

    // Obtener Logo de la Tienda Principal (BD_TIENDAS, Fila 2)
    let logoUrl = "";
    try {
      const ss = getActiveSS();
      const sheetTiendas = ss.getSheetByName(SHEETS.STORES || "BD_TIENDAS");
      const mapping = HeaderManager.getMapping("STORES");
      const colLogo = mapping ? mapping["LOGOTIPO"] : -1;

      if (sheetTiendas && colLogo !== -1) {
        const logoPath = sheetTiendas.getRange(2, colLogo + 1).getValue();
        if (logoPath) {
          const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME;
          logoUrl = `https://www.appsheet.com/template/gettablefileurl?appName=${appName}&tableName=BD_TIENDAS&fileName=${encodeURIComponent(logoPath)}`;
        }
      }
    } catch (e) {
      console.error("Error al cargar logo para login: " + e.message);
    }

    template.STORE_LOGO = logoUrl;
    template.isEmbedded = isEmbedded;
    return template.evaluate().getContent();
  }

  if (view === 'runner') {
    const template = configurarTemplateRunner(accion, codigo, fecha, isEmbedded);
    return template.evaluate().getContent();
  }

  // 4. Bienvenida (Nuevo Panel de Control)
  if (view === 'welcome') {
    const template = HtmlService.createTemplateFromFile('Web/home_dashboard');
    template.isEmbedded = isEmbedded;
    return template.evaluate().getContent();
  }

  return `
    <div style="font-family: sans-serif; text-align: center; padding: 50px; color: #64748b;">
      <h1>👋 Sistema de Gestión</h1>
      <p>Vista no encontrada: ${view}</p>
    </div>
  `;
}

// --- HELPER CENTRALIZADO: Configura page_template ---
// Evita duplicar el switch gigante
function configurarTemplateRunner(accion, codigo, fecha, isEmbedded = false) {
  // Limpieza agresiva de duplicación de SKU (ej: "SKU SKU" o "SKUSKU")
  if (codigo) {
    codigo = String(codigo).trim();
    const half = Math.floor(codigo.length / 2);
    if (codigo.length > 4 && codigo.substring(0, half) === codigo.substring(half)) {
      codigo = codigo.substring(0, half);
    } else if (codigo.includes(' ')) {
      const parts = codigo.split(/\s+/);
      if (parts[0] === parts[1]) codigo = parts[0];
    }
  }

  const template = HtmlService.createTemplateFromFile('Web/page_template');
  template.codigo = codigo || '';
  template.fechaInicial = fecha || new Date().toISOString().split('T')[0];
  template.mostrarBotonPrompt = false;
  template.mostrarDatePicker = false;
  template.isEmbedded = isEmbedded;

  switch (accion) {
    case "recibir_orden_wc":
      template.titulo = 'Importador WooCommerce';
      template.descripcion = 'Procesando órdenes...';
      template.funcionParaLlamar = 'importarOrdenesDesdeWC';
      template.parametros = JSON.stringify([]);
      break;
    case "generarInventarioInicial":
      template.titulo = 'Generación de Inventario';
      template.descripcion = 'Auditando sistema...';
      template.funcionParaLlamar = 'procesarAccionInventario';
      template.parametros = JSON.stringify([accion, codigo, template.fechaInicial]);
      break;
    case "resetearSistemaInventario":
      template.titulo = 'Reseteo de Sistema';
      template.descripcion = 'Reiniciando período...';
      template.funcionParaLlamar = 'procesarAccionInventario';
      template.parametros = JSON.stringify([accion, codigo, template.fechaInicial]);
      break;
    case "generarInventarioProducto":
      template.titulo = 'Inventario por Producto';
      template.descripcion = 'Auditando:';
      template.funcionParaLlamar = 'procesarAccionInventario';
      template.parametros = JSON.stringify([accion, codigo, template.fechaInicial]);
      break;
    case "generarCsvBartender":
      template.titulo = 'Exportar a Bartender';
      template.descripcion = 'Generando etiquetas...';
      template.funcionParaLlamar = 'wrapperBartender';
      template.parametros = JSON.stringify([accion, codigo, template.fechaInicial]);
      template.mostrarDatePicker = true;
      break;
    case "sincronizar":
      template.titulo = 'Sincronización de Imágenes';
      template.descripcion = 'Sincronizando archivos para:';
      template.funcionParaLlamar = 'procesarSincronizacion';
      template.parametros = JSON.stringify([codigo]);
      break;
    case "sincronizarGlobal":
      template.titulo = 'Sincronización Global';
      template.descripcion = 'Escaneando Drive...';
      template.funcionParaLlamar = 'wrapperImagenGlobal';
      template.parametros = JSON.stringify([]);
      break;
    case "generarPromptIA":
      template.titulo = 'Generador Prompt IA';
      template.descripcion = 'Producto:';
      template.funcionParaLlamar = 'generarPromptIA';
      template.parametros = JSON.stringify([codigo]);
      template.mostrarBotonPrompt = true;
      break;
    case "generarDescripcionIA":
      template.titulo = 'Enriquecimiento de Producto (IA)';
      template.descripcion = 'Generando descripciones para:';
      template.funcionParaLlamar = 'gestionarAccionEnriquecimiento';
      template.parametros = JSON.stringify([codigo]);
      break;
    case "subir_imagenes_wp":
      template.titulo = 'Subir a WordPress';
      template.descripcion = 'Enviando SKU:';
      template.funcionParaLlamar = 'subirImagenesProductoWP';
      template.parametros = JSON.stringify([codigo]);
      break;
    case "enviarProductoWP":
      template.titulo = 'WooCommerce Sync';
      template.descripcion = 'Datos SKU:';
      template.funcionParaLlamar = 'enviarProductoWP';
      template.parametros = JSON.stringify([codigo]);
      break;
    default:
      template.titulo = 'Gestión de Sistema';
      template.descripcion = `Ejecutando: ${accion}`;
      template.funcionParaLlamar = 'procesarAccionInventario';
      template.parametros = JSON.stringify([accion, codigo, template.fechaInicial]);
  }
  return template;
}

// =================================================================
// ===           WRAPPERS Y HELPERS                              ===
// =================================================================

function wrapperBartender(accion, codigo, fechaDefault, fechaManual) {
  const fechaFinal = fechaManual || fechaDefault;
  return ejecutarAccionDeInventario(accion, codigo, fechaFinal);
}

function wrapperImagenGlobal() {
  try {
    ejecutarSincronizacionGlobal();
    return { success: true, message: "Sincronización global completada.", logs: ["✅ Proceso finalizado."] };
  } catch (e) {
    return { success: false, message: "Error: " + e.message, logs: ["❌ " + e.message] };
  }
}

// La función doPost ha sido movida al inicio para evitar duplicados y centralizar el flujo.
// No duplicar esta función aquí.

function ejecutarAccionDeInventario(accion, codigo, fecha) {
  const logArray = [];
  try {
    switch (accion) {
      case "generarInventarioInicial":
        generarInventarioInicial(logArray);
        return { success: true, message: `✅ Inventario inicial global generado.`, logs: logArray };
      case "resetearSistemaInventario":
        resetearSistemaInventario(logArray);
        return { success: true, message: `✅ Sistema de inventario reseteado.`, logs: logArray };
      case "generarInventarioProducto":
        if (!codigo) throw new Error("Se requiere un código de producto.");
        generarInventarioPorProducto(codigo, logArray);
        return { success: true, message: `✅ Inventario generado para '${codigo}'.`, logs: logArray };
      case "generarCsvBartender":
        const resultado = actualizarArchivoCSV(logArray, fecha);
        return { ...resultado, logs: logArray };
      case "guardarCsvBartender":
        if (!codigo) throw new Error("No se recibieron datos para guardar.");
        const dataEditada = JSON.parse(codigo);
        return guardarCsvEditado(dataEditada, logArray);
      case "probarNotificaciones":
        return probarNotificacionActual();
      case "guardarMatrizStock":
        if (!codigo) throw new Error("No se recibieron datos de la matriz.");
        const payloadObj = JSON.parse(codigo);
        if (Array.isArray(payloadObj)) {
          // Fallback legacy (si por casualidad se envía el array directo)
          return procesarAjusteMasivoStock(payloadObj, fecha, null, null, logArray);
        } else {
          return procesarAjusteMasivoStock(payloadObj.cambios, payloadObj.storeId, payloadObj.userId, payloadObj.opcionesMovimiento, logArray);
        }
      case "getHydration":
        return getInventoryHydrationData();
      default:
        throw new Error(`Acción desconocida: ${accion}`);
    }
  } catch (error) {
    logArray.push(`❌ ERROR FATAL: ${error.message}`);
    return { success: false, message: `❌ Error durante la ejecución.`, logs: logArray };
  }
}

function ejecutarAccionDeImagen(params) {
  try {
    const codigo = params.codigo;
    if (params.eliminar === true) {
      if (!codigo) throw new Error("Se requiere código de producto para eliminar.");

      // INTEGRACIÓN WOOCOMMERCE: Eliminar en la tienda virtual (vía WOO_ID o fallback por CODIGO_ID)
      try {
        const resDelete = eliminarProductoWP(params.woo_id, codigo);
        console.log("Resultado Woo Eliminar:", resDelete);
      } catch (e) {
        console.error("Fallo silencioso al eliminar en WooCommerce:", e.message);
      }

      // Continuar con la eliminación habitual de la carpeta de Drive
      return eliminarCarpetaProducto(codigo);
    }
    if (params.accion) {
      const accion = params.accion;
      switch (accion) {
        case "subir_imagenes_wp": return subirImagenesProductoWP(codigo);
        case "generarPromptIA":
          if (!codigo) throw new Error("Se requiere un código de producto.");
          return generarPromptIA(codigo);
        case "sincronizar":
          if (!codigo) throw new Error("Se requiere código para 'sincronizar'.");
          return procesarSincronizacion(codigo);
        case "sincronizar_woo":
          if (!codigo) throw new Error("Se requiere código de producto.");
          return enviarProductoWP(codigo);
        case "generarCarpetasGlobal": return procesarGeneracionCarpetas();
        case "sincronizarGlobal":
          ejecutarSincronizacionGlobal();
          return { success: true, message: "✅ Sincronización global ejecutada." };
        case "organizarOptimizados":
          organizarArchivosOptimizados();
          return { success: true, message: "✅ Organización de archivos optimizados ejecutada." };
        case "rellenarMiniaturas":
          rellenarMiniaturasFaltantes();
          return { success: true, message: "✅ Relleno de miniaturas faltantes ejecutado." };
        case "generarCarpetaYVariaciones":
          if (!codigo) throw new Error("Se requiere código de producto.");

          // BUCLE ANTI-CARRERA (Esperar a la latencia de AppSheet / Google Sheets)
          let intentos = 0;
          let productoEncontrado = false;
          while (intentos < 5 && !productoEncontrado) {
            SpreadsheetApp.flush();
            const sheetProd = getActiveSS().getSheetByName(SHEETS.PRODUCTS);
            const mapProd = HeaderManager.getMapping("PRODUCTS");
            if (!sheetProd || !mapProd) break; // Fallo de esquema, abortar bucle y tirar a la suerte

            const colProdId = mapProd["CODIGO_ID"];
            const dataProdFlags = sheetProd.getDataRange().getValues();

            if (dataProdFlags.some(row => String(row[colProdId]).trim() === String(codigo))) {
              productoEncontrado = true;
            } else {
              console.log(`⏳ [generarCarpetaYVariaciones] Producto ${codigo} no detectado. Esperando sync de AppSheet (Intento ${intentos + 1}/5)`);
              Utilities.sleep(2000); // 2 segundos
              intentos++;
              HeaderManager.clearCache(); // Refrescar el caché
            }
          }

          if (!productoEncontrado) {
            throw new Error(`🛑 Producto ${codigo} no apareció en BD_PRODUCTOS tras 10 segundos de espera (lag extemo o mala configuración del Bot).`);
          }

          // Asegurar que la hoja esté sincronizada antes de crear la carpeta
          SpreadsheetApp.flush();

          obtenerOCrearCarpetaProducto(codigo);
          generarInventarioPorProducto(codigo);

          // INTEGRACIÓN WOOCOMMERCE: Sincronizar automáticamente tras creación
          let msgWoo = "";
          try {
            const resWoo = enviarProductoWP(codigo);
            if (resWoo.success) {
              msgWoo = " | 📦 Sincronizado con WooCommerce ✅";
            } else {
              msgWoo = " | ⚠️ WooCommerce: " + resWoo.message;
            }
          } catch (eWoo) {
            msgWoo = " | ❌ Error WooCommerce: " + eWoo.message;
          }

          // FASE 5: Avisar al frontend que hay nuevos productos (Mantenemos vivo 90s para todos los clientes)
          CacheService.getScriptCache().put("NEW_PRODUCTS_AVAILABLE", "true", 90);

          // Forzar escritura final
          SpreadsheetApp.flush();

          return { success: true, message: `✅ Carpeta y variaciones generadas para '${codigo}'${msgWoo}.` };
        default:
          throw new Error(`Acción desconocida: '${accion}'`);
      }
    }
    if (!codigo) throw new Error("Se requiere código de producto para crear la carpeta.");
    return obtenerOCrearCarpetaProducto(codigo);
  } catch (error) {
    return { success: false, message: `❌ Error en Lógica de Imagen: ${error.message}` };
  }
}

/**
 * Valida las credenciales del usuario en el ERP.
 * Busca en BD_USUARIOS_SISTEMAS.
 */
function userLogin(credentials) {
  try {
    const emailInput = credentials.email.toLowerCase().trim();
    const passwordInput = credentials.password.trim();

    const ss = getActiveSS();
    const mapping = HeaderManager.getMapping("USUARIOS_SISTEMAS");
    const userSheet = ss.getSheetByName(SHEETS.USUARIOS_SISTEMAS);

    if (!userSheet || !mapping) {
      return { success: false, message: 'Error: No se encuentra la hoja de usuarios o el mapeo.' };
    }

    const data = userSheet.getDataRange().getValues();

    // Buscar índices con fallback
    const emailIdx = mapping["EMAIL"] !== undefined ? mapping["EMAIL"] : mapping["CORREO_ELECTRONICO"];
    const passIdx = mapping["USER_ID"];
    const nameIdx = mapping["NOMBRE"];
    const storeIdx = mapping["MANAGED_STORE"] !== undefined ? mapping["MANAGED_STORE"] : (mapping["TIENDA_ID"] !== undefined ? mapping["TIENDA_ID"] : undefined);
    const roleIdx = mapping["ROL"];

    if (emailIdx === undefined || passIdx === undefined) {
      return { success: false, message: 'Faltan columnas críticas (Email o USER_ID) en la base de datos.' };
    }

    // Saltar header (i=1)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const dbEmail = String(row[emailIdx] || "").toLowerCase().trim();
      const dbPass = String(row[passIdx] || "").trim();

      if (dbEmail === emailInput && dbPass === passwordInput) {
        return {
          success: true,
          user: {
            name: nameIdx !== undefined ? row[nameIdx] : 'Usuario',
            email: dbEmail,
            managedStore: storeIdx !== undefined ? row[storeIdx] : '',
            role: roleIdx !== undefined ? row[roleIdx] : 'USER'
          }
        };
      }
    }

    return { success: false, message: 'Credenciales inválidas.' };

  } catch (error) {
    debugLog("Error en userLogin: " + error.message, true);
    return { success: false, message: error.message };
  }
}

/**
 * Valida el PIN para funciones de pago
 */
function validarPinPaid(pin) {
  try {
    const validPin = GLOBAL_CONFIG.GEMINI.PAID_PIN;
    if (String(pin).trim() === String(validPin).trim()) {
      return { success: true };
    }
    return { success: false, message: "PIN incorrecto" };
  } catch (e) {
    return { success: false, message: e.message };
  }
}



/**
 * TEST: Verifica que todas las hojas tengan las columnas requeridas por el esquema.
 * Se puede ejecutar manualmente para diagnosticar problemas de estructura.
 */
function testAllSchemas() {
  debugLog("🧪 Iniciando Prueba de Esquemas (Diagnóstico)...", true);
  const results = [];

  for (const alias in SHEET_SCHEMA) {
    const mapping = HeaderManager.getMapping(alias);
    const required = SHEET_SCHEMA[alias];
    const sheetName = SHEETS[alias] || alias;

    if (!mapping) {
      results.push(`❌ ${sheetName}: Hoja no encontrada.`);
      continue;
    }

    const missing = required.filter(col => mapping[col.toUpperCase()] === undefined);
    if (missing.length === 0) {
      results.push(`✅ ${sheetName}: OK`);
    } else {
      results.push(`⚠️ ${sheetName}: Faltan [${missing.join(", ")}]`);
    }
  }

  const finalSummary = results.join("\n");
  debugLog(finalSummary, true);
  return finalSummary;
}

/**
 * Función puente para guardar la descripción auditada.
 */
function guardarDescripcionEditadaIA(sku, data) {
  return procesarGuardadoDescripcionIA(sku, data);
}

/**
 * Función de prueba para verificar notificaciones de éxito.
 */
function testSuccessNotification() {
  notificarTelegramSalud("🧪 Prueba de notificación de ÉXITO (Sticky). Si ves esto, la configuración es correcta.", "EXITO");
}

/**
 * 🔍 DIAGNÓSTICO: Registra el contenido crudo de cualquier solicitud entrante.
 * Retorna el número de fila para permitir actualizaciones posteriores.
 */
function registrarRawWebhook(e) {
  if (!e) return null;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("RAW_WEBHOOK_LOGS");

    if (!sheet) {
      sheet = ss.insertSheet("RAW_WEBHOOK_LOGS");
      const headersRow = ["FECHA", "SOURCE_PARAM", "TOPIC_HEADER", "ALL_HEADERS", "URL_PARAMS", "RAW_CONTENTS", "CONTENT_TYPE", "STATUS_PROCESO"];
      sheet.appendRow(headersRow);
      sheet.getRange(1, 1, 1, headersRow.length).setFontWeight("bold").setBackground("#673ab7").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }

    const fecha = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");
    const source = (e.parameter && e.parameter.source) || "n/a";
    const headObj = e.headers || {};
    const topic = headObj['X-Wc-Webhook-Topic'] || headObj['x-wc-webhook-topic'] || "n/a";
    const allHeaders = JSON.stringify(headObj);
    const params = JSON.stringify(e.parameter || {});
    const contents = e.postData ? e.postData.contents : "EMPTY_POST_DATA";
    const postType = e.postData ? e.postData.type : "N/A";

    // Insertar al inicio
    sheet.insertRowAfter(1);
    const logRange = sheet.getRange(2, 1, 1, 8);
    logRange.setValues([[fecha, source, topic, allHeaders, params, contents, postType, "RECIBIDO"]]);

    if (sheet.getLastRow() > 505) {
      sheet.deleteRows(502, sheet.getLastRow() - 501);
    }
    return 2; // Siempre es la fila 2 porque insertamos arriba
  } catch (err) {
    console.error("Fallo crítico en registrarRawWebhook: " + err.message);
  }
}

/**
 * Actualiza el estado de un registro en RAW_WEBHOOK_LOGS.
 * @param {number} row Fila a actualizar.
 * @param {string} status Nuevo estado o mensaje de resultado.
 */
function actualizarResultadoWebhook(row, status) {
  if (!row) return;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("RAW_WEBHOOK_LOGS");
    if (sheet) {
      sheet.getRange(row, 8).setValue(status);
    }
  } catch (err) {
    console.error("Error en actualizarResultadoWebhook: " + err.message);
  }
}

/**
 * Retorna las categorías disponibles y los CODIGO_ID ya registrados en el sistema.
 * Sirve para el selector dinámico de categorías y para validar códigos únicos.
 */
function whatsapp_obtenerCategoriasYCodigos() {
  try {
    const ss = getActiveSS();
    if (!ss) throw new Error("No se pudo obtener la hoja de cálculo activa.");

    // 1. Obtener Categorías
    const sheetCats = ss.getSheetByName(SHEETS.CATEGORIES || "BD_CATEGORIAS");
    const categories = [];
    if (sheetCats) {
      const dataCats = sheetCats.getDataRange().getValues();
      const mapping = HeaderManager.getMapping("CATEGORIES") || { CATEGORIA_GENERAL: 0, CATEGORIA_ID: 1, RECARGO_MENOR: 5 };
      const colG = mapping.CATEGORIA_GENERAL !== undefined ? mapping.CATEGORIA_GENERAL : 0;
      const colID = mapping.CATEGORIA_ID !== undefined ? mapping.CATEGORIA_ID : 1;
      const colRecargo = mapping.RECARGO_MENOR !== undefined ? mapping.RECARGO_MENOR : 5;

      for (let i = 1; i < dataCats.length; i++) {
        const catGeneral = String(dataCats[i][colG] || "").trim();
        const catId = String(dataCats[i][colID] || "").trim();
        const recargo = parseFloat(dataCats[i][colRecargo]) || 0;
        if (catId) {
          categories.push({
            categoriaGeneral: catGeneral,
            categoriaId: catId,
            recargoMenor: recargo
          });
        }
      }
    }

    // 2. Obtener Códigos y Productos Existentes por SKU
    const sheetProds = ss.getSheetByName(SHEETS.PRODUCTS || "BD_PRODUCTOS");
    const existingCodes = [];
    const existingProducts = [];
    if (sheetProds) {
      const dataProds = sheetProds.getDataRange().getValues();
      const mapping = HeaderManager.getMapping("PRODUCTS") || { CODIGO_ID: 0, SKU: 3, CATEGORIA: 2, MODELO: 9 };
      const colCode = mapping.CODIGO_ID !== undefined ? mapping.CODIGO_ID : 0;
      const colSku = mapping.SKU !== undefined ? mapping.SKU : 3;
      const colCat = mapping.CATEGORIA !== undefined ? mapping.CATEGORIA : 2;
      const colModelo = mapping.MODELO !== undefined ? mapping.MODELO : 9;
      
      for (let i = 1; i < dataProds.length; i++) {
        const code = String(dataProds[i][colCode] || "").trim().toUpperCase();
        let skuVal = String(dataProds[i][colSku] || "").trim();
        const catVal = String(dataProds[i][colCat] || "").trim();
        const modeloVal = String(dataProds[i][colModelo] || "").trim();
        
        // Limpieza de comilla simple inicial en el SKU si estuviera presente
        if (skuVal.startsWith("'")) {
          skuVal = skuVal.substring(1);
        }
        
        if (code) {
          existingCodes.push(code);
          existingProducts.push({
            codigoId: code,
            sku: skuVal,
            categoriaId: catVal,
            modelo: modeloVal
          });
        }
      }
    }

    return {
      success: true,
      categories: categories,
      existingCodes: existingCodes,
      existingProducts: existingProducts
    };
  } catch (e) {
    console.error("Error en whatsapp_obtenerCategoriasYCodigos: " + e.message);
    return { success: false, error: e.message };
  }
}