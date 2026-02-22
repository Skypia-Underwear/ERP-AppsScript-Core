
/**
 * Manejador de solicitudes POST (Telegram, AppSheet, etc.)
 */
function doPost(e) {
  // LOG DE EMERGENCIA: Escribir directamente en la hoja si se detecta actividad
  /* try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BD_APP_SCRIPT").appendRow([new Date(), "POST_HIT", JSON.stringify(e)]);
  } catch (f) { } */

  try {
    if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("no data");
    const contents = JSON.parse(e.postData.contents);

    // --- MANEJO DE TELEGRAM ---
    if (contents.message || contents.callback_query) {
      if (GLOBAL_CONFIG.TELEGRAM.MODE === "CLIENT") {
        return handleTelegramRequest(contents);
      } else {
        return ContentService.createTextOutput("ok");
      }
    }

    // --- ACCIONES ERP ---
    const accion = contents.accion || "";
    if (accion === "generarDescripcionIA") {
      const resultado = gestionarAccionEnriquecimiento(contents.codigo);
      return ContentService.createTextOutput(JSON.stringify(resultado)).setMimeType(ContentService.MimeType.JSON);
    }

    const esAccionDeInventario = accion.toLowerCase().includes("inventario") ||
      accion.toLowerCase().includes("resetear") ||
      accion.toLowerCase().includes("bartender");

    if (esAccionDeInventario) {
      return handleInventoryRequest(contents);
    } else if (accion || contents.codigo) {
      return handleImageRequest(contents);
    }

    // --- ACCIONES BLOGGER (NUEVO) ---
    if (contents.op) {
      let respuestaBlogger = {};
      switch (contents.op) {
        case "configuracion":
          respuestaBlogger = blogger_listar_configuracion_sinCache();
          if (contents.id) {
            blogger_adjuntar_pedido_a_respuesta(respuestaBlogger, contents.id);
          }
          break;
        case "venta":
          respuestaBlogger = blogger_registrar_venta(e.postData.contents);
          break;
        case "cargar_venta":
          respuestaBlogger = blogger_cargar_venta(e.postData.contents);
          break;
        case "pagar":
          respuestaBlogger = blogger_pagar_venta(e.postData.contents);
          break;
        case "cancelar":
          respuestaBlogger = blogger_cancelar_venta(e.postData.contents);
          break;
        case "pagar_con_comprobante":
          respuestaBlogger = blogger_pagar_venta_con_comprobante(contents);
          break;
        case "confirmar_pago_presencial":
          respuestaBlogger = blogger_confirmar_pago_presencial(contents);
          break;
        default:
          respuestaBlogger = { status: "-1", message: "Operación Blogger no soportada" };
      }
      return ContentService.createTextOutput(JSON.stringify(respuestaBlogger)).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    console.error("❌ Error en doPost: " + error.message);
  }
  return ContentService.createTextOutput("ok");
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
      if (e.message.includes("Service Spreadsheets failed") || e.message.includes("Timed out")) {
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
  // Solo devolvemos caché si tiene datos (evita propagar fallos temporales)
  if (_cacheConfig && Object.keys(_cacheConfig).length > 0) return _cacheConfig;

  try {
    const config = executeWithRetry(() => {
      const sheetSS = getActiveSS();
      if (!sheetSS) return {};
      const sheet = sheetSS.getSheetByName("BD_APP_SCRIPT");
      if (!sheet) return {};
      const data = sheet.getDataRange().getValues();
      const cfg = {};
      for (let i = 1; i < data.length; i++) {
        const clave = String(data[i][1]).trim();
        const valor = String(data[i][2]).trim();
        if (clave) cfg[clave] = valor;
      }
      return cfg;
    });

    if (Object.keys(config).length > 0) _cacheConfig = config;
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
    get PAID_PIN() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GM_PAID_PIN"] || "1234"; }
  },

  TELEGRAM: {
    get BOT_TOKEN() { return GLOBAL_CONFIG.SCRIPT_CONFIG["TELEGRAM_BOT_TOKEN"] || ""; },
    get CHAT_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["TELEGRAM_CHAT_ID"] || ""; },
    get MODE() { return (GLOBAL_CONFIG.SCRIPT_CONFIG["TELEGRAM_MODE"] || "DEV").toUpperCase(); }
  },

  NOTIFICACIONES: {
    get PROVIDER() { return GLOBAL_CONFIG.SCRIPT_CONFIG["NOTIFICATION_PROVIDER"] || "TELEGRAM"; },
    get EMAIL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["NOTIFICATION_EMAIL"] || ""; }
  },

  get PUBLICATION_TARGET() { return GLOBAL_CONFIG.SCRIPT_CONFIG["PUBLICATION_TARGET"] || "AMBOS"; },

  GITHUB: {
    get USER() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GITHUB_USER"] || ""; },
    get REPO() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GITHUB_REPO"] || ""; },
    get TOKEN() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GITHUB_TOKEN"] || ""; },
    get FILE_PATH() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GITHUB_FILE_PATH"] || "catalogo.json"; }
  },

  BLOGGER: {
    get CACHE_FOLDER_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["BLOGGER_CACHE_FOLDER_ID"] || ""; },
    get GITHUB_FILE_PATH() { return GLOBAL_CONFIG.SCRIPT_CONFIG["BLOGGER_GITHUB_FILE_PATH"] || "blogger_config.json"; }
  },

  DONWEB: {
    get WRITE_URL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DONWEB_WRITE_URL"] || ""; },
    get READ_URL() { return GLOBAL_CONFIG.SCRIPT_CONFIG["DONWEB_READ_URL"] || ""; }
  },

  ENABLE_BIGQUERY: false
};

/**
 * Esquema central del sistema. Define las columnas críticas para cada hoja.
 * Se puede expandir según sea necesario.
 */
const SHEET_SCHEMA = {
  STORES: ["TIENDA_ID", "MODO_VENTA", "RECARGO_MENOR", "IP_IMPRESORA_LOCAL"],
  PRODUCTS: ["CODIGO_ID", "MODELO", "PRECIO_COSTO", "RECARGO_MENOR", "CATEGORIA", "COLORES", "TALLES", "WOO_ID"],
  INVENTORY: ["INVENTARIO_ID", "TIENDA_ID", "PRODUCTO_ID", "COLOR", "TALLE", "STOCK_ACTUAL", "VENTAS_LOCAL", "VENTAS_WEB", "WOO_ID"],
  CATEGORIES: ["CATEGORIA_ID", "CATEGORIA_GENERAL", "HTML", "ICONO"], // ICONO suele ser el ID del SVG
  SVG_GALLERY: ["NOMBRE", "CODE"],
  COLORS: ["COLOR_ID", "HEXADECIMAL", "TEXTO"],
  PRODUCT_IMAGES: ["IMAGEN_ID", "PRODUCTO_ID", "IMAGEN_RUTA", "ARCHIVO_ID", "ESTADO", "PORTADA", "URL", "THUMBNAIL_URL", "COSTO", "ORDEN", "SYNC_WC"],
  CLIENTS: ["CLIENTE_ID", "NOMBRE_COMPLETO", "CELULAR", "CORREO_ELECTRONICO", "CUIT_DNI", "AGENCIA_ENVIO", "TIPO_ENVIO", "CALLE", "NUMERO", "PISO", "DEPARTAMENTO", "CODIGO_POSTAL", "LOCALIDAD", "PROVINCIA", "OBSERVACION"],
  BLOGGER_SALES: ["CODIGO", "FECHA", "HORA", "CAJA_ID", "METODO_PAGO", "DATOS_TRANSFERENCIA", "CLIENTE_ID", "DOCUMENTO", "CELULAR", "CORREO_ELECTRONICO", "DIRECCION", "AGENCIA", "TIEMPO_ENTREGA_AGENCIA", "MONEDA", "COSTO_ENVIO", "RECARGO_TRANSFERENCIA", "TOTAL_VENTA", "DETALLE_JSON", "ESTADO", "JSON_BACKUP", "URL_COMPROBANTE"],
  BLOGGER_SALES_DETAILS: ["VENTA_ID", "PRODUCTO_VARIACION", "DETALLE_JSON", "CANTIDAD", "PRECIO", "SUBTOTAL", "PRODUCTO_ID", "COLOR", "TALLE", "VARIEDAD_ID"],
  VENTAS_PEDIDOS: ["VENTA_ID", "TIENDA_ID", "ASESOR_ID", "FECHA", "HORA", "CLIENTE_ID", "TOTAL_VENTA", "ESTADO"],
  DETALLE_VENTAS: ["VENTA_ID", "VARIACION_ID", "PRODUCTO_ID", "CATEGORIA", "PRECIO", "CANTIDAD", "MONTO"],
  GESTION_CAJA: ["CAJA_ID", "TIENDA_ID", "ASESOR_ID", "FECHA", "ESTADO"],
  METODOS_PAGO: ["MOVIMIENTO_ID", "PORCENTAJE"],
  DATOS_TRANSFERENCIA: ["CUENTA_ID", "ALIAS", "NOMBRE_CUENTA"],
  USUARIOS_SISTEMAS: ["USER_ID", "NOMBRE"],
  WC_ORDERS: ["ID_ORDEN", "ESTADO", "CLIENTE", "TELEFONO", "DIRECCION_FACTURACION", "RESUMEN_PRODUCTOS", "TOTAL_VENTA", "FECHA", "ULTIMA_ACTUALIZACION"],
  APP_SCRIPT_CONFIG: ["TIPO_CLAVE", "VALOR"], // Especificamente para BD_APP_SCRIPT (KV)
  GENERAL_CONFIG: ["GENERAL_ID", "RESPONSABLE"] // Para BD_CONFIGURACION_GENERAL (Wide)
};

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
      debugLog(`❌ HeaderManager: Hoja '${sheetName}' no encontrada.`);
      return null;
    }

    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return {};

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const mapping = {};

    headers.forEach((header, index) => {
      if (header) {
        const h = String(header).trim().toUpperCase();
        mapping[h] = index;
        // Alias para compatibilidad global
        if (h.includes("MACRO_ID") || h.includes("CATEGORIA_ID") || h.includes("PROD_ID") || h.includes("PRODUCTO_ID")) mapping["ID"] = index;
        if (h.includes("CLAVE")) mapping["CLAVE"] = index;
        if (h.includes("VALOR")) mapping["VALOR"] = index;
        if (h.includes("CORREO") || h.includes("MAIL") || h.includes("CORREO_ELECTRONICO")) mapping["EMAIL"] = index;
        if (h.includes("ROL") || h.includes("ROL_TIENDA")) mapping["ROL"] = index;
        if (h.includes("TIENDA_ADMINISTRADA") || h.includes("MANAGED_STORE")) mapping["MANAGED_STORE"] = index;
        // Alias para SVG
        if (h.includes("SVG_CODE") || h.includes("CODIGO_SVG") || h === "CODE") mapping["CODE"] = index;
        if (h.includes("SVG_NOMBRE") || h === "NOMBRE") mapping["NOMBRE"] = index;
        // Alias para Categorías
        if (h.includes("CATEGORIA_GENERAL") || h.includes("CATEGORIA_PADRE") || h.includes("PADRE")) mapping["PADRE"] = index;
        // Alias para WooCommerce / Pedidos
        if (h.includes("ID ORDEN") || h.includes("ORDER_ID") || h.includes("NRO ORDEN") || h.includes("ID_ORDEN")) mapping["ID_ORDEN"] = index;
        if (h.includes("ID CLIENTE") || h.includes("CUSTOMER_ID") || h.includes("CLIENTE")) mapping["CLIENTE"] = index;
        if (h.includes("TELÉFONO") || h.includes("TELEFONO") || h.includes("PHONE") || h.includes("CELULAR")) mapping["TELEFONO"] = index;
        if (h.includes("TOTAL_VENTA") || h.includes("TOTAL")) mapping["TOTAL_VENTA"] = index;
        if (h.includes("ULTIMA_ACTUALIZACION") || h.includes("ULT. ACTUALIZACION")) mapping["ULTIMA_ACTUALIZACION"] = index;
      }
    });

    // Validación contra el esquema
    const required = SHEET_SCHEMA[sheetAlias];
    if (required) {
      required.forEach(col => {
        if (mapping[col.toUpperCase()] === undefined) {
          debugLog(`⚠️ Columna crítica '${col}' no encontrada en la hoja '${sheetName}'.`, true);
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

const SHEETS = {
  PRODUCT_IMAGES: "BD_PRODUCTO_IMAGENES",
  PRODUCTS: "BD_PRODUCTOS",
  CATEGORIES: "BD_CATEGORIAS",
  STORES: "BD_TIENDAS",
  INVENTORY: "BD_INVENTARIO",
  INVENTORY_MOVEMENTS: "BD_MOVIMIENTOS_INVENTARIO",
  DEPOSIT: "BD_DEPOSITO",
  COLORS: "BD_COLORES",
  GENERAL_CONFIG: "BD_CONFIGURACION_GENERAL",
  SHIPPING_AGENCIES: "BD_AGENCIAS_ENVIO",
  PRODUCT_VARIETIES: "BD_VARIEDAD_PRODUCTOS",
  SVG_GALLERY: "BD_GALERIA_SVG",
  BLOGGER_SALES: "BLOGGER_VENTAS",
  BLOGGER_SALES_DETAILS: "BLOGGER_DETALLE_VENTAS",
  BLOGGER_CONFIG: "BLOGGER_CONFIGURACION",
  CLIENTS: "BD_CLIENTES",
  VENTAS_PEDIDOS: "BD_VENTAS_PEDIDOS",
  DETALLE_VENTAS: "BD_DETALLE_VENTAS",
  GESTION_CAJA: "BD_GESTION_CAJA",
  METODOS_PAGO: "BD_METODOS_PAGO",
  DATOS_TRANSFERENCIA: "BD_DATOS_TRANSFERENCIA",
  USUARIOS_SISTEMAS: "BD_USUARIOS_SISTEMAS",
  APP_SCRIPT_CONFIG: "BD_APP_SCRIPT", // Mapeo crítico corregido
  WC_ORDERS: "BD_VENTAS_WOOCOMMERCE",
  BARTENDER_HISTORY: "BD_HISTORIAL_BARTENDER",
  CLIENT_FORM_LOG: "BD_FORMULARIO_CLIENTE"
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

  Logger.log(`📡 [Health] Iniciando reporte: ${tipo} | Msg: ${mensaje.substring(0, 30)}...`);

  if (!config.BOT_TOKEN || !config.CHAT_ID) {
    Logger.log("❌ [Health] Faltan BOT_TOKEN o CHAT_ID en GLOBAL_CONFIG.");
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
  Logger.log(`📨 [Health] Enviando mensaje nuevo a ${config.CHAT_ID}...`);
  const url = `https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`;
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: config.CHAT_ID,
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

  if (readUrl) {
    // Si hay URL de lectura específica, la usamos con el parámetro de archivo
    return `${readUrl}?file=${fileName}`;
  }

  // Fallback hardcodeado si no hay configuración (Legacy)
  return "https://castfer.com.ar/leer_json_hostingshop.php";
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

function doGet(e) {
  const params = e.parameter;
  const isEmbedded = params.embedded === 'true';
  const view = params.view || '';
  const accion = params.accion || '';

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

  // --- APOYO BLOGGER: CATÁLOGO (NUEVO) ---
  if (params.op === "configuracion") {
    // 1. Obtener configuración (usa el Bridge)
    const respuestaObjeto = blogger_listar_configuracion_sinCache();

    // 2. Adjuntar pedido si existe ID
    if (params.id) {
      blogger_adjuntar_pedido_a_respuesta(respuestaObjeto, params.id);
    }

    const respuestaJSON_string = JSON.stringify(respuestaObjeto);

    // 3. Soporte JSONP para Blogger
    const callback = params.callback || "callback";
    const jsonpResponse = `${callback}(${respuestaJSON_string})`;

    return ContentService.createTextOutput(jsonpResponse)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  if (view === 'imagenes_manager') {
    const template = HtmlService.createTemplateFromFile('Web/images_dashboard');
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
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

  return template.evaluate()
    .setTitle('Sistema de Gestión ERP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * API INTERNA SPA: Devuelve el HTML de las sub-vistas como texto.
 */
function getPageContent(view, accion, codigo, fecha) {
  // Normalización
  if (view === 'inventario' || view === 'legacy_action') view = 'runner';

  // 1. Dashboard Inventario
  if (view === 'inventory_dashboard') {
    return HtmlService.createTemplateFromFile('Web/inventory_dashboard')
      .evaluate().getContent();
  }

  // 2. Auditoría
  if (view === 'auditoria') {
    return HtmlService.createTemplateFromFile('Web/sale_dashboard')
      .evaluate().getContent();
  }

  // --- NUEVO: Gestor de Imágenes ---
  if (view === 'imagenes_manager') {
    const template = HtmlService.createTemplateFromFile('Web/images_dashboard');
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    return template.evaluate().getContent();
  }

  // --- NUEVO: Punto de Venta (TPV) ---
  if (view === 'pos_manager') {
    const template = HtmlService.createTemplateFromFile('Web/pos_view');
    template.CATALOG_URL = getCatalogJsonUrl();
    template.CATALOG_URL_FALLBACK = getCatalogFallbackUrl();
    return template.evaluate().getContent();
  }

  // --- NUEVA: Vista de Registro de Cliente ---
  if (view === 'client_form') {
    return HtmlService.createTemplateFromFile('Web/client_form_view')
      .evaluate().getContent();
  }

  // --- NUEVA: Vista de Login ---
  if (view === 'login') {
    return HtmlService.createTemplateFromFile('Web/login_view')
      .evaluate().getContent();
  }

  // 3. Runner (Reutilizamos la lógica centralizada)
  if (view === 'runner') {
    const template = configurarTemplateRunner(accion, codigo, fecha);
    return template.evaluate().getContent();
  }

  // 4. Bienvenida (Nuevo Panel de Control)
  if (view === 'welcome') {
    return HtmlService.createTemplateFromFile('Web/home_dashboard')
      .evaluate().getContent();
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
function configurarTemplateRunner(accion, codigo, fecha) {
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
          obtenerOCrearCarpetaProducto(codigo);
          generarInventarioPorProducto(codigo);
          return { success: true, message: `✅ Carpeta y variaciones generadas para '${codigo}'.` };
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

function FORZAR_PERMISOS() {
  console.log("Probando conexión...");
  // Esta línea no hace nada real, pero obliga a Google a pedir permiso de internet
  UrlFetchApp.fetch("https://www.google.com");
  console.log("Permisos OK");
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
 * Función de utilidad para exportar la estructura actual de todas las hojas.
 * Ayuda al Agente a entender los encabezados reales del usuario.
 */
function exportSheetStructure() {
  const ss = getActiveSS();
  const structure = {};

  for (const alias in SHEETS) {
    const sheet = ss.getSheetByName(SHEETS[alias]);
    if (sheet) {
      const lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        structure[alias] = {
          sheetName: SHEETS[alias],
          headers: sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim())
        };
      } else {
        structure[alias] = { sheetName: SHEETS[alias], headers: [], status: "EMPTY" };
      }
    } else {
      structure[alias] = { sheetName: SHEETS[alias], status: "NOT_FOUND" };
    }
  }

  const json = JSON.stringify(structure, null, 2);
  debugLog("📊 Estructura de Hojas Exportada:\n" + json, true);
  return json;
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
 * Función de prueba para verificar notificaciones de éxito.
 */
function testSuccessNotification() {
  notificarTelegramSalud("🧪 Prueba de notificación de ÉXITO (Sticky). Si ves esto, la configuración es correcta.", "EXITO");
}