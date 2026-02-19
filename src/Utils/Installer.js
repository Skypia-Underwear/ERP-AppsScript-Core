// =================================================================
// ===      INSTALADOR DE ENTORNO (NOMENCLATURA MAYÚSCULA)       ===
// =================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ INSTALACIÓN')
    .addItem('🚀 Inicializar Sistema', 'inicializarEntorno')
    .addItem('🔍 Auditar Hojas y Columnas', 'auditarEntornoTablas')
    .addItem('🧹 Optimizar Espacio (Limpiar)', 'optimizarEspacioHojas')
    .addItem('⚡ Instalar Automatización (IA)', 'instalarTriggersIA')
    .addSeparator()
    .addItem('🤖 Configurar Webhook Telegram', 'instalarWebhookTelegram')
    .addItem('🔄 Resetear Webhook (Forzado)', 'resetearWebhookTelegramTotalmente')
    .addToUi();
}

/**
 * Busca subcarpeta o la crea
 */
function getOrCreateSubFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

/**
 * Asegura que exista la clave en la hoja.
 * Retorna: { fila, valorActual }
 */
function asegurarClave(sheet, clave, valorPorDefecto, descripcion) {
  const mapping = HeaderManager.getMapping("APP_SCRIPT_CONFIG");
  const data = sheet.getDataRange().getValues();

  const claveIdx = mapping ? mapping["CLAVE"] : 1;
  const valorIdx = mapping ? mapping["VALOR"] : 2;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][claveIdx]).trim() === clave) {
      return { fila: i + 1, valorActual: data[i][valorIdx] };
    }
  }
  // Si no existe, creamos la fila
  const nuevoId = Utilities.getUuid().slice(0, 8);
  sheet.appendRow([nuevoId, clave, valorPorDefecto, descripcion]);
  return { fila: sheet.getLastRow(), valorActual: valorPorDefecto };
}

/**
 * Helper para guardar Valor y Descripción
 */
function guardarDato(sheet, fila, valor, descripcion) {
  const mapping = HeaderManager.getMapping("APP_SCRIPT_CONFIG");
  const valorCol = mapping ? mapping["VALOR"] + 1 : 3;
  const descCol = mapping ? mapping["DESCRIPCION"] + 1 : 4;

  sheet.getRange(fila, valorCol).setValue(valor);
  sheet.getRange(fila, descCol).setValue(descripcion);
}

function inicializarEntorno() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    // 1. PREPARAR HOJA BD_APP_SCRIPT
    let sheet = ss.getSheetByName("BD_APP_SCRIPT");
    if (!sheet) {
      sheet = ss.insertSheet("BD_APP_SCRIPT");
      sheet.appendRow(["MACRO_ID", "CLAVE (NO TOCAR)", "VALOR (EDITABLE)", "DESCRIPCION"]);
      sheet.getRange("1:1").setFontWeight("bold").setBackground("#EFEFEF");
      sheet.setColumnWidth(2, 250); sheet.setColumnWidth(3, 350); sheet.setColumnWidth(4, 300);
    }

    // 2. VERIFICAR NOMBRE DE LA APP (MANUAL)
    let infoAppName = asegurarClave(sheet, "APPSHEET_APP_NAME", "", "Nombre de la App en AppSheet (Carpeta Raíz)");
    let appNameFinal = String(infoAppName.valorActual).trim();

    if (!appNameFinal || appNameFinal === "" || appNameFinal === "PENDIENTE") {
      ui.alert('⚠️ ATENCIÓN: FALTA NOMBRE DE APP\n\n' +
        '1. Ve a la hoja "BD_APP_SCRIPT".\n' +
        '2. En "APPSHEET_APP_NAME", escribe el nombre de tu App (Ej: HOSTINGSHOPBLOG).\n' +
        '3. Vuelve a ejecutar el instalador.');
      return;
    }

    ui.alert(`Configurando entorno para: "${appNameFinal}"...`);

    // 3. OBTENER O CREAR RAÍZ (Respetando el nombre manual de la App)
    let rootFolder;
    const folders = DriveApp.getFoldersByName(appNameFinal);
    if (folders.hasNext()) {
      rootFolder = folders.next();
    } else {
      rootFolder = DriveApp.createFolder(appNameFinal);
    }

    let infoRoot = asegurarClave(sheet, "SYS_ROOT_FOLDER_ID", "", "");
    guardarDato(sheet, infoRoot.fila, rootFolder.getId(), "ID Carpeta Raíz del Sistema (Contenedora)");


    // 4. CREAR SUB-CARPETAS (NOMENCLATURA MAYÚSCULA Y COMPLETA)

    // A. Imágenes (AppSheet) - Este nombre DEBE ser exacto al de AppSheet
    const imgFolder = getOrCreateSubFolder(rootFolder, "BD_PRODUCTO_IMAGENES_Images");
    let infoImg = asegurarClave(sheet, "DRIVE_PARENT_FOLDER_ID", "", "");
    guardarDato(sheet, infoImg.fila, imgFolder.getId(), "ID Carpeta Imágenes (Ruta base AppSheet)");

    // B. Temporal
    const tempFolder = getOrCreateSubFolder(rootFolder, "TEMP_UPLOADS");
    let infoTemp = asegurarClave(sheet, "DRIVE_TEMP_FOLDER_ID", "", "");
    guardarDato(sheet, infoTemp.fila, tempFolder.getId(), "ID Carpeta Temporal (Procesamiento)");

    // C. Configuración
    const configFolder = getOrCreateSubFolder(rootFolder, "CONFIG_DATA");
    let infoConfFolder = asegurarClave(sheet, "DRIVE_JSON_CONFIG_FOLDER_ID", "", "");
    guardarDato(sheet, infoConfFolder.fila, configFolder.getId(), "ID Carpeta de Archivos JSON");

    // Archivo JSON
    const jsonFiles = configFolder.getFilesByName("CONFIG.json");
    let jsonFileId;
    if (jsonFiles.hasNext()) {
      jsonFileId = jsonFiles.next().getId();
    } else {
      const newJson = configFolder.createFile("CONFIG.json", "{}", "application/json");
      jsonFileId = newJson.getId();
    }
    let infoJsonFile = asegurarClave(sheet, "DRIVE_JSON_CONFIG_FILE_ID", "", "");
    guardarDato(sheet, infoJsonFile.fila, jsonFileId, "ID Archivo CONFIG.json");

    // D. Woocommerce
    const wooFolder = getOrCreateSubFolder(rootFolder, "WOOCOMMERCE_FILES");
    let infoWoo = asegurarClave(sheet, "DRIVE_WOO_FOLDER_ID", "", "");
    guardarDato(sheet, infoWoo.fila, wooFolder.getId(), "ID Carpeta CSVs Woocommerce");

    // E. Backups
    const backupFolder = getOrCreateSubFolder(rootFolder, "BACKUPS");
    let infoBackup = asegurarClave(sheet, "DRIVE_BACKUP_FOLDER_ID", "", "");
    guardarDato(sheet, infoBackup.fila, backupFolder.getId(), "ID Carpeta Copias de Seguridad");

    // F. Comprobantes (Ventas ERP interno)
    const comprobantesFolder = getOrCreateSubFolder(rootFolder, "CARPETA_COMPROBANTES_ID");
    let infoComprobantes = asegurarClave(sheet, "APPSHEET_CARPETA_COMPROBANTES_ID", "", "");
    guardarDato(sheet, infoComprobantes.fila, comprobantesFolder.getId(), "ID Carpeta Comprobantes de Pago");

    // G. Blogger Cache (JSON público del sitio Blogger/Ecommerce)
    const bloggerCacheFolder = getOrCreateSubFolder(rootFolder, "BLOGGER_CACHE");
    let infoBloggerCache = asegurarClave(sheet, "BLOGGER_CACHE_FOLDER_ID", "", "");
    guardarDato(sheet, infoBloggerCache.fila, bloggerCacheFolder.getId(), "ID Carpeta JSON Cache del Sitio Blogger");

    // H. Blogger Comprobantes (Archivos de pago del flujo externo Blogger)
    const bloggerComprobantesFolder = getOrCreateSubFolder(rootFolder, "BLOGGER_COMPROBANTES");
    let infoBloggerComprobantes = asegurarClave(sheet, "BLOGGER_COMPROBANTES_FOLDER_ID", "", "");
    guardarDato(sheet, infoBloggerComprobantes.fila, bloggerComprobantesFolder.getId(), "ID Carpeta Comprobantes de Pago (Blogger/Ecommerce)");


    // 5. CONSTANTES RESTANTES
    // Slug del app: lowercase con guiones (ej: "SKYPIA UNDERWEAR" -> "skypia-underwear")
    const appSlug = appNameFinal.toLowerCase().replace(/\s+/g, '-');

    const otrasConstantes = [
      { clave: "GLOBAL_SCRIPT_ID", val: "", desc: "PEGA AQUÍ: ID WebApp (Este Script)" },
      { clave: "WP_SITE_URL", val: "https://tudominio.com/", desc: "URL Sitio Web" },
      { clave: "WP_IMAGE_API_URL", val: "https://tudominio.com/api-image-uploader.php", desc: "API Imágenes" },
      { clave: "WP_PRODUCT_API_URL", val: "https://tudominio.com/api-woocommerce-product.php", desc: "API Productos" },
      { clave: "WP_IMAGE_API_KEY", val: "CASTFER2025", desc: "API Key Imágenes" },
      { clave: "WP_CONSUMER_KEY", val: "", desc: "PEGA AQUÍ: WC Consumer Key" },
      { clave: "WP_CONSUMER_SECRET", val: "", desc: "PEGA AQUÍ: WC Consumer Secret" },
      { clave: "GM_IMAGE_API_KEY", val: "", desc: "PEGA AQUÍ: API Key de Google Gemini (IA)" },
      { clave: "APPSHEET_APP_ID", val: "", desc: "PEGA AQUÍ: ID de la App en AppSheet" },
      { clave: "APPSHEET_ACCESS_KEY", val: "", desc: "PEGA AQUÍ: Access Key de la App en AppSheet" },
      { clave: "TELEGRAM_BOT_TOKEN", val: "", desc: "Token del Bot de Telegram (@BotFather)" },
      { clave: "TELEGRAM_CHAT_ID", val: "", desc: "ID del Chat o Grupo de Telegram" },
      { clave: "TELEGRAM_MODE", val: "DEV", desc: "Modo: DEV (solo salud) o CLIENT (asistente)" },
      { clave: "NOTIFICATION_PROVIDER", val: "TELEGRAM", desc: "Canal: TELEGRAM, EMAIL o NONE" },
      { clave: "NOTIFICATION_EMAIL", val: "", desc: "Email para notificaciones (si aplica)" },
      // --- CONFIGURACIÓN DE PUBLICACIÓN ---
      { clave: "PUBLICATION_TARGET", val: "DONWEB", desc: "Destino: DONWEB o GITHUB" },
      { clave: "GITHUB_USER", val: "", desc: "Usuario GitHub" },
      { clave: "GITHUB_REPO", val: "api-tienda", desc: "Repositorio" },
      { clave: "GITHUB_TOKEN", val: "", desc: "Token (repo scope)" },
      { clave: "GITHUB_FILE_PATH", val: appSlug + "-catalog-tpv.json", desc: "Ruta JSON del TPV en GitHub" },
      { clave: "BLOGGER_GITHUB_FILE_PATH", val: appSlug + "-blogger-config.json", desc: "Ruta JSON de Blogger en GitHub" },
      { clave: "DONWEB_WRITE_URL", val: "https://tudominio.com/api_json_write.php", desc: "URL PHP de escritura JSON en Donweb" },
      { clave: "DONWEB_READ_URL", val: "https://tudominio.com/api_json_read.php", desc: "URL PHP de lectura JSON en Donweb" },
      { clave: "GM_PAID_PIN", val: "1234", desc: "PIN de seguridad para activar IA de pago (Nano Banana Pro)" }
    ];

    otrasConstantes.forEach(c => {
      asegurarClave(sheet, c.clave, c.val, c.desc);
    });

    // 6. SINCRONIZAR URLS DESDE BD_CONFIGURACION_GENERAL
    // Lee SITIO_WEB y propagó automáticamente todas las URLs derivadas.
    // Usa guardarDato() (sobreescribe) para mantenerse en sync si el dominio cambia.
    try {
      const sheetGeneral = ss.getSheetByName(SHEETS.GENERAL_CONFIG);
      if (sheetGeneral) {
        const mG = HeaderManager.getMapping("GENERAL_CONFIG");
        const configRow = sheetGeneral.getRange(2, 1, 1, sheetGeneral.getLastColumn()).getValues()[0];
        const siteUrl = String(configRow[mG.SITIO_WEB] || "").trim();

        if (siteUrl) {
          const cleanUrl = siteUrl.endsWith('/') ? siteUrl : siteUrl + '/';

          // Mapa: clave BD_APP_SCRIPT → valor derivado del dominio
          const urlKeys = [
            { clave: "WP_SITE_URL", val: cleanUrl, desc: "URL del Sitio Web" },
            { clave: "WP_IMAGE_API_URL", val: cleanUrl + "api-image-uploader.php", desc: "URL API Imágenes" },
            { clave: "WP_PRODUCT_API_URL", val: cleanUrl + "api-woocommerce-product.php", desc: "URL API Productos WC" },
            { clave: "DONWEB_WRITE_URL", val: cleanUrl + "api_json_write.php", desc: "URL PHP escritura JSON en Donweb" },
            { clave: "DONWEB_READ_URL", val: cleanUrl + "api_json_read.php", desc: "URL PHP lectura JSON en Donweb" }
          ];

          urlKeys.forEach(k => {
            const info = asegurarClave(sheet, k.clave, k.val, k.desc);
            guardarDato(sheet, info.fila, k.val, k.desc); // siempre sobreescribe
          });

          console.log("🌐 [Installer] URLs sincronizadas desde SITIO_WEB: " + cleanUrl);
        } else {
          console.warn("⚠️ [Installer] SITIO_WEB vacío en BD_CONFIGURACION_GENERAL. URLs no sincronizadas.");
        }
      }
    } catch (eUrl) {
      console.warn("⚠️ [Installer] No se pudo sincronizar SITIO_WEB: " + eUrl.message);
    }

    // 7. INSTALACIÓN DE TRIGGERS (con validaciones de dependencias mínimas)
    const triggerLog = [];

    // Helper: elimina triggers previos de una función y crea uno nuevo
    function reinstalarTrigger(handlerFn, minutosIntervalo) {
      ScriptApp.getProjectTriggers()
        .filter(t => t.getHandlerFunction() === handlerFn)
        .forEach(t => ScriptApp.deleteTrigger(t));
      ScriptApp.newTrigger(handlerFn).timeBased().everyMinutes(minutosIntervalo).create();
    }

    // -- TRIGGER TPV (publicarCatalogo, cada 5 min) --
    // Condiciones: al menos un destino externo configurado
    const cfg = GLOBAL_CONFIG.SCRIPT_CONFIG;
    const donwebOk = !!(cfg["DONWEB_WRITE_URL"] && !cfg["DONWEB_WRITE_URL"].includes("tudominio"));
    const githubOk = !!(cfg["GITHUB_USER"] && cfg["GITHUB_REPO"] && cfg["GITHUB_TOKEN"]);

    if (donwebOk || githubOk) {
      reinstalarTrigger("publicarCatalogo", 5);
      triggerLog.push("✅ TPV (cada 5 min): Donweb=" + (donwebOk ? "✅" : "⛔") + " GitHub=" + (githubOk ? "✅" : "⛔"));
    } else {
      triggerLog.push("⛔ TPV: Trigger NO instalado. Configurá DONWEB_WRITE_URL o GITHUB_USER/REPO/TOKEN.");
    }

    // -- TRIGGER BLOGGER (blogger_regenerarCacheConfiguracion, cada 10 min) --
    // Condiciones: CACHE_FOLDER_ID seteado (Drive disponible) + al menos un destino externo
    const bloggerCacheOk = !!(cfg["BLOGGER_CACHE_FOLDER_ID"]);
    const bloggerExtOk = donwebOk || githubOk; // reutiliza misma validación

    if (bloggerCacheOk && bloggerExtOk) {
      reinstalarTrigger("blogger_regenerarCacheConfiguracion", 10);
      triggerLog.push("✅ Blogger (cada 10 min): Drive=" + (bloggerCacheOk ? "✅" : "⛔") + " Externo=" + (bloggerExtOk ? "✅" : "⛔"));
    } else {
      const motivo = !bloggerCacheOk
        ? "Falta BLOGGER_CACHE_FOLDER_ID (ejecutá el Installer una vez para crearlo)."
        : "Falta al menos un destino externo (Donweb o GitHub).";
      triggerLog.push("⛔ Blogger: Trigger NO instalado. " + motivo);
    }

    console.log("[Installer] Triggers:\n" + triggerLog.join("\n"));

    // Resumen final visible para el usuario
    ui.alert(
      '✅ Instalación completada.\n\n' +
      '📁 Carpetas Drive:\n' +
      '- ' + appNameFinal + '\n' +
      '  |-- BD_PRODUCTO_IMAGENES_Images\n' +
      '  |-- TEMP_UPLOADS\n' +
      '  |-- CONFIG_DATA\n' +
      '  |-- WOOCOMMERCE_FILES\n' +
      '  |-- BACKUPS\n' +
      '  |-- CARPETA_COMPROBANTES_ID\n' +
      '  |-- BLOGGER_CACHE\n' +
      '  |-- BLOGGER_COMPROBANTES\n\n' +
      '⏱ Triggers automáticos:\n' +
      triggerLog.join('\n')
    );

  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

/**
 * 🔍 AUDITORÍA DINÁMICA DE TABLAS
 * Valida la existencia de hojas y columnas críticas basadas en Main.js -> SHEET_SCHEMA
 */
function auditarEntornoTablas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const logs = ["🔍 Iniciando auditoría HostingShop Ready..."];
  let hayErrores = false;
  let hayAdvertencias = false;

  // Usamos SHEETS y SHEET_SCHEMA definidos globalmente en Main.js
  for (const alias in SHEETS) {
    const nombreHoja = SHEETS[alias];
    const hoja = ss.getSheetByName(nombreHoja);

    if (!hoja) {
      logs.push(`❌ ERROR: No se encuentra la hoja '${nombreHoja}' (Alias: ${alias}).`);
      hayErrores = true;
      continue;
    }

    const columnasRequeridas = SHEET_SCHEMA[alias];
    if (columnasRequeridas && columnasRequeridas.length > 0) {
      // Usamos el HeaderManager para validar alias y columnas críticas
      const mapping = HeaderManager.getMapping(alias);

      if (!mapping) {
        logs.push(`⚠️ ALERTA: No se pudo generar mapeo para '${nombreHoja}'.`);
        hayAdvertencias = true;
        continue;
      }

      const faltantes = columnasRequeridas.filter(col => mapping[col.toUpperCase()] === undefined);

      if (faltantes.length > 0) {
        logs.push(`⚠️ ADVERTENCIA: En '${nombreHoja}' faltan columnas críticas: ${faltantes.join(", ")}`);
        hayAdvertencias = true;
      } else {
        logs.push(`✅ Hoja '${nombreHoja}' validada.`);
      }
    } else {
      logs.push(`ℹ️ Hoja '${nombreHoja}' (Sin esquema definido).`);
    }
  }

  // Título dinámico
  let titulo = "✅ Entorno Operativo";
  if (hayErrores) titulo = "❌ Entorno con Errores Críticos";
  else if (hayAdvertencias) titulo = "⚠️ Entorno con Advertencias";

  ui.alert(titulo, logs.join("\n"), ui.ButtonSet.OK);
}

/**
 * 🧹 OPTIMIZACIÓN DE ESPACIO
 * Elimina las filas vacías al final de todas las hojas para mejorar rendimiento.
 */
function optimizarEspacioHojas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var ui = SpreadsheetApp.getUi();
  var logs = ["🧹 Resumen de Optimización:"];
  var totalEliminadas = 0;

  sheets.forEach(function (sheet) {
    var nombre = sheet.getName();
    var maxRows = sheet.getMaxRows();
    var lastRow = sheet.getLastRow();

    // Dejamos al menos 2 filas de margen por cortesía
    var filasAEliminar = maxRows - lastRow - 2;

    if (filasAEliminar > 0 && lastRow > 0) {
      sheet.deleteRows(lastRow + 2, filasAEliminar);
      logs.push("✅ '" + nombre + "': " + filasAEliminar + " filas eliminadas.");
      totalEliminadas += filasAEliminar;
    } else {
      logs.push("ℹ️ '" + nombre + "': Ya optimizada.");
    }
  });

  notificarTelegramSalud("🧹 Limpieza completada: " + totalEliminadas + " filas liberadas across " + sheets.length + " hojas.", "EXITO");
  ui.alert("🚀 Limpieza Completada", logs.join("\n") + "\n\nTotal: " + totalEliminadas + " filas liberadas.", ui.ButtonSet.OK);
}

/**
 * Registra el Webhook en los servidores de Telegram.
 */
function instalarWebhookTelegram() {
  const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN || GITHUB_GLOBAL_CONFIG_TELEGRAM_TOKEN();

  // Usar el ID de la Macros que el usuario tiene en su hoja (prioridad) o el actual
  const scriptId = GLOBAL_CONFIG.SCRIPTS.GLOBAL;
  let webAppUrl = scriptId ? `https://script.google.com/macros/s/${scriptId}/exec` : ScriptApp.getService().getUrl();

  if (!token || !webAppUrl) {
    const errorMsg = "❌ Error: Verifique TOKEN de Bot y que la WebApp esté publicada.";
    Logger.log(errorMsg);
    try { SpreadsheetApp.getUi().alert(errorMsg); } catch (e) { }
    return;
  }

  const url = `https://api.telegram.org/bot${token}/setWebhook?url=${webAppUrl}`;
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const resObj = JSON.parse(response.getContentText());

    if (resObj.ok) {
      const msg = "✅ Webhook registrado con éxito!\nEl Bot ahora responderá comandos interactivos.";
      Logger.log(msg);
      try { SpreadsheetApp.getUi().alert(msg); } catch (e) { }
    } else {
      const msg = "❌ Error de Telegram:\n" + resObj.description;
      Logger.log(msg);
      try { SpreadsheetApp.getUi().alert(msg); } catch (e) { }
    }
  } catch (e) {
    Logger.log("❌ Error crítico: " + e.message);
  }
}

/**
 * RESET TOTAL: Elimina el webhook actual y lo vuelve a instalar con el ID forzado.
 */
function resetearWebhookTelegramTotalmente() {
  const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN || GITHUB_GLOBAL_CONFIG_TELEGRAM_TOKEN();
  const scriptId = GLOBAL_CONFIG.SCRIPTS.GLOBAL;
  const webAppUrl = scriptId ? `https://script.google.com/macros/s/${scriptId}/exec` : ScriptApp.getService().getUrl();

  if (!token) {
    const msg = "❌ Error: Sin Token de Telegram.";
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
    return;
  }

  try {
    // 1. ELIMINAR WEBHOOK
    const deleteUrl = `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`;
    const resDelete = UrlFetchApp.fetch(deleteUrl, { muteHttpExceptions: true });
    Logger.log("🧹 Resultado Delete: " + resDelete.getContentText());

    // 2. INSTALAR NUEVO WEBHOOK
    const setUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${webAppUrl}`;
    const resSet = UrlFetchApp.fetch(setUrl, { muteHttpExceptions: true });
    const resObj = JSON.parse(resSet.getContentText());

    if (resObj.ok) {
      const successMsg = "✅ Webhook RESETEADO con éxito!\n\nNueva URL registrada:\n" + webAppUrl;
      try { SpreadsheetApp.getUi().alert(successMsg); } catch (e) { Logger.log(successMsg); }
    } else {
      const failMsg = "❌ Error al re-instalar:\n" + resObj.description;
      try { SpreadsheetApp.getUi().alert(failMsg); } catch (e) { Logger.log(failMsg); }
    }
  } catch (e) {
    Logger.log("❌ Error en Reset: " + e.message);
  }
}

/**
 * Consulta el estado actual del Webhook en los servidores de Telegram.
 */
function verificarEstadoWebhookTelegram() {
  const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN || GITHUB_GLOBAL_CONFIG_TELEGRAM_TOKEN();
  const scriptId = GLOBAL_CONFIG.SCRIPTS.GLOBAL;
  const expectedUrl = scriptId ? `https://script.google.com/macros/s/${scriptId}/exec` : "Auto-detect";

  if (!token) {
    Logger.log("❌ Error: Sin Token de Telegram.");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/getWebhookInfo`;
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const resObj = JSON.parse(response.getContentText());

    if (!resObj.ok) {
      Logger.log("❌ Error consultando a Telegram: " + resObj.description);
      return;
    }

    const res = resObj.result;
    const info = [
      "--- DIAGNÓSTICO TELEGRAM ---",
      "ID Configurado (Hoja): " + scriptId,
      "URL que DEBERÍA estar: " + expectedUrl,
      "URL que Telegram TIENE: " + (res.url || "NINGUNA"),
      "Mensajes Pendientes: " + res.pending_update_count,
      "Último Error: " + (res.last_error_message || "NINGUNO"),
      "Fecha Error: " + (res.last_error_date ? new Date(res.last_error_date * 1000).toLocaleString() : "N/A"),
      "---------------------------"
    ].join("\n");

    Logger.log(info);
    try { SpreadsheetApp.getUi().alert(info); } catch (e) { }
  } catch (err) {
    Logger.log("❌ Error de red: " + err.message);
  }
}