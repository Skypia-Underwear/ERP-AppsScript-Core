// Versión: 10.0.1 (Limpieza Estructural Completada)
// =================================================================
// ===      INSTALADOR DE ENTORNO (NOMENCLATURA MAYÚSCULA)       ===
// =================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ INSTALACIÓN')
    .addItem('🚀 Inicializar Sistema', 'inicializarEntorno')
    .addItem('🔍 Auditar Hojas y Columnas', 'auditarEntornoTablas')
    .addItem('🛠️ Migración Auditoría IA (BD_LABORATORIO_IA)', 'ejecutarMigracionAuditoriaIA')
    .addItem('🧹 Optimizar Espacio (Limpiar)', 'optimizarEspacioHojas')
    .addItem('⚡ Instalar Automatización (IA)', 'instalarTriggersIA')
    .addSeparator()
    .addItem('🤖 Configurar Webhook Telegram', 'instalarWebhookTelegram')
    .addItem('🔄 Resetear Webhook (Forzado)', 'resetearWebhookTelegramTotalmente')
    .addSeparator()
    .addItem('📊 Preparar BigQuery (Dataset/Tabla)', 'setupBigQueryStructure')
    .addSeparator()
    .addItem('🔑 Reparar Autorización (Auth Reset)', 'forceAuthReset')
    .addItem('🔓 Limpiar Bloqueo GitHub (Reset Circuit Breakers)', 'resetearCircuitBreakers')
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
function asegurarClave(sheet, clave, valorPorDefecto, descripcion, grupo = "⚙️ CONFIGURACIÓN GENERAL") {
  const mapping = HeaderManager.getMapping("APP_SCRIPT_CONFIG");
  const data = sheet.getDataRange().getValues();

  const claveIdx = mapping ? mapping["CLAVE"] : 1;
  const valorIdx = mapping ? mapping["VALOR"] : 2;
  const grupoIdx = mapping ? mapping["GRUPO"] : 4;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][claveIdx]).trim() === clave) {
      if (grupoIdx !== undefined && (!data[i][grupoIdx] || String(data[i][grupoIdx]).trim() === "")) {
        sheet.getRange(i + 1, grupoIdx + 1).setValue(grupo);
      }
      return { fila: i + 1, valorActual: data[i][valorIdx] };
    }
  }
  // Si no existe, creamos la fila
  const nuevoId = Utilities.getUuid().slice(0, 8);
  const nextRow = sheet.getLastRow() + 1;
  const isDefaultOrder = !mapping || mapping["GRUPO"] === 4;
  if (isDefaultOrder) {
    sheet.appendRow([nuevoId, clave, valorPorDefecto, descripcion, grupo]);
  } else {
    sheet.getRange(nextRow, (mapping["MACRO_ID"] !== undefined ? mapping["MACRO_ID"] : 0) + 1).setValue(nuevoId);
    sheet.getRange(nextRow, (mapping["GRUPO"] !== undefined ? mapping["GRUPO"] : 1) + 1).setValue(grupo);
    sheet.getRange(nextRow, (mapping["CLAVE"] !== undefined ? mapping["CLAVE"] : 2) + 1).setValue(clave);
    sheet.getRange(nextRow, (mapping["VALOR"] !== undefined ? mapping["VALOR"] : 3) + 1).setValue(valorPorDefecto);
    sheet.getRange(nextRow, (mapping["DESCRIPCION"] !== undefined ? mapping["DESCRIPCION"] : 4) + 1).setValue(descripcion);
  }
  return { fila: nextRow, valorActual: valorPorDefecto };
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
      sheet.appendRow(["MACRO_ID", "GRUPO", "CLAVE", "VALOR", "DESCRIPCION"]);
    } else {
      // Si la hoja ya existe, validar y limpiar cabeceras de CLAVE y VALOR para evitar romper fórmulas de AppSheet
      const lastCol = sheet.getLastColumn();
      const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

      for (let c = 0; c < headers.length; c++) {
        let hName = String(headers[c]).trim();
        if (hName.toUpperCase().includes("TIPO_CLAVE (NO TOCAR)")) {
          sheet.getRange(1, c + 1).setValue("TIPO_CLAVE");
        } else if (hName.toUpperCase().includes("CLAVE (NO TOCAR)")) {
          sheet.getRange(1, c + 1).setValue("CLAVE");
        } else if (hName.toUpperCase().includes("VALOR (EDITABLE)")) {
          sheet.getRange(1, c + 1).setValue("VALOR");
        }
      }

      const updatedHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      const hasGrupo = updatedHeaders.some(h => String(h).toUpperCase().includes("GRUPO"));
      if (!hasGrupo) {
        sheet.getRange(1, updatedHeaders.length + 1).setValue("GRUPO");
      }
    }

    // 2. VERIFICAR NOMBRE DE LA APP (MANUAL)
    let infoAppName = asegurarClave(sheet, "APPSHEET_APP_NAME", "", "Nombre de la App en AppSheet (Carpeta Raíz)", "🤖 INTEGRACIÓN APPSHEET");
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

    let infoRoot = asegurarClave(sheet, "SYS_ROOT_FOLDER_ID", "", "ID Carpeta Raíz del Sistema (Contenedora)", "📁 GOOGLE DRIVE CORE");
    guardarDato(sheet, infoRoot.fila, rootFolder.getId(), "ID Carpeta Raíz del Sistema (Contenedora)");

    // slug para nomenclatura dinámica
    const appSlug = appNameFinal.toLowerCase().replace(/\s+/g, '-');
    const catalogFileName = appSlug + "-catalog-tpv.json";


    // 4. CREAR SUB-CARPETAS (NOMENCLATURA MAYÚSCULA Y COMPLETA)

    // A. Imágenes (AppSheet) - Este nombre DEBE ser exacto al de AppSheet
    const imgFolder = getOrCreateSubFolder(rootFolder, "BD_PRODUCTO_IMAGENES_Images");
    let infoImg = asegurarClave(sheet, "DRIVE_PARENT_FOLDER_ID", "", "ID Carpeta Imágenes (Ruta base AppSheet)", "📁 GOOGLE DRIVE CORE");
    guardarDato(sheet, infoImg.fila, imgFolder.getId(), "ID Carpeta Imágenes (Ruta base AppSheet)");

    // B. Temporal
    const tempFolder = getOrCreateSubFolder(rootFolder, "TEMP_UPLOADS");
    let infoTemp = asegurarClave(sheet, "DRIVE_TEMP_FOLDER_ID", "", "ID Carpeta Temporal (Procesamiento)", "📁 GOOGLE DRIVE CORE");
    guardarDato(sheet, infoTemp.fila, tempFolder.getId(), "ID Carpeta Temporal (Procesamiento)");

    // C. Configuración
    const configFolder = getOrCreateSubFolder(rootFolder, "CONFIG_DATA");
    let infoConfFolder = asegurarClave(sheet, "DRIVE_JSON_CONFIG_FOLDER_ID", "", "ID Carpeta de Archivos JSON", "📁 GOOGLE DRIVE CORE");
    guardarDato(sheet, infoConfFolder.fila, configFolder.getId(), "ID Carpeta de Archivos JSON");

    // Archivo JSON dinámico
    const jsonFiles = configFolder.getFilesByName(catalogFileName);
    let jsonFileId;
    if (jsonFiles.hasNext()) {
      jsonFileId = jsonFiles.next().getId();
    } else {
      const newJson = configFolder.createFile(catalogFileName, "{}", "application/json");
      jsonFileId = newJson.getId();
    }
    let infoJsonFile = asegurarClave(sheet, "DRIVE_JSON_CONFIG_FILE_ID", "", `ID Archivo ${catalogFileName}`, "📁 GOOGLE DRIVE CORE");
    guardarDato(sheet, infoJsonFile.fila, jsonFileId, `ID Archivo ${catalogFileName}`);

    // D. Woocommerce
    const wooFolder = getOrCreateSubFolder(rootFolder, "WOOCOMMERCE_FILES");
    let infoWoo = asegurarClave(sheet, "DRIVE_WOO_FOLDER_ID", "", "ID Carpeta CSVs Woocommerce", "📁 GOOGLE DRIVE CORE");
    guardarDato(sheet, infoWoo.fila, wooFolder.getId(), "ID Carpeta CSVs Woocommerce");

    // E. Backups
    const backupFolder = getOrCreateSubFolder(rootFolder, "BACKUPS");
    let infoBackup = asegurarClave(sheet, "DRIVE_BACKUP_FOLDER_ID", "", "ID Carpeta Copias de Seguridad", "📁 GOOGLE DRIVE CORE");
    guardarDato(sheet, infoBackup.fila, backupFolder.getId(), "ID Carpeta Copias de Seguridad");

    // F. Comprobantes (Ventas ERP interno)
    const comprobantesFolder = getOrCreateSubFolder(rootFolder, "CARPETA_COMPROBANTES_ID");
    let infoComprobantes = asegurarClave(sheet, "APPSHEET_CARPETA_COMPROBANTES_ID", "", "ID Carpeta Comprobantes de Pago", "🤖 INTEGRACIÓN APPSHEET");
    guardarDato(sheet, infoComprobantes.fila, comprobantesFolder.getId(), "ID Carpeta Comprobantes de Pago");

    // G. Blogger Cache (JSON público del sitio Blogger/Ecommerce)
    const bloggerCacheFolder = getOrCreateSubFolder(rootFolder, "BLOGGER_CACHE");
    let infoBloggerCache = asegurarClave(sheet, "BLOGGER_CACHE_FOLDER_ID", "", "ID Carpeta JSON Cache del Sitio Blogger", "📡 ECOSISTEMA BLOGGER");
    guardarDato(sheet, infoBloggerCache.fila, bloggerCacheFolder.getId(), "ID Carpeta JSON Cache del Sitio Blogger");

    // H. Blogger Comprobantes (Archivos de pago del flujo externo Blogger)
    const bloggerComprobantesFolder = getOrCreateSubFolder(rootFolder, "BLOGGER_COMPROBANTES");
    let infoBloggerComprobantes = asegurarClave(sheet, "BLOGGER_COMPROBANTES_FOLDER_ID", "", "ID Carpeta Comprobantes de Pago (Blogger/Ecommerce)", "📡 ECOSISTEMA BLOGGER");
    guardarDato(sheet, infoBloggerComprobantes.fila, bloggerComprobantesFolder.getId(), "ID Carpeta Comprobantes de Pago (Blogger/Ecommerce)");


    // 5. CONSTANTES RESTANTES

    const otrasConstantes = [
      { clave: "GLOBAL_SCRIPT_ID", val: "", desc: "PEGA AQUÍ: ID WebApp (Este Script)", grupo: "⚙️ CONFIGURACIÓN GENERAL" },
      { clave: "WP_SITE_URL", val: "https://tudominio.com/", desc: "URL Sitio Web", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
      { clave: "WP_IMAGE_API_URL", val: "https://tudominio.com/api-image-uploader.php", desc: "URL API Imágenes", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
      { clave: "WP_PRODUCT_API_URL", val: "https://tudominio.com/api-woocommerce-product.php", desc: "URL API Productos WC", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
      { clave: "WP_IMAGE_API_KEY", val: "CASTFER2025", desc: "API Key Imágenes", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
      { clave: "WP_CONSUMER_KEY", val: "", desc: "PEGA AQUÍ: WC Consumer Key", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
      { clave: "WP_CONSUMER_SECRET", val: "", desc: "PEGA AQUÍ: WC Consumer Secret", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
      { clave: "GM_IMAGE_API_KEY", val: "", desc: "PEGA AQUÍ: API Key de Google Gemini (PRO/PAID) para Imagen 3", grupo: "🤖 GOOGLE GEMINI IA" },
      { clave: "GM_FREE_API_KEY", val: "", desc: "PEGA AQUÍ: API Key de Google Gemini (FREE) para Laboratorio y Análisis", grupo: "🤖 GOOGLE GEMINI IA" },
      { clave: "GM_PAID_PIN", val: "1234", desc: "PIN de seguridad para activar IA de pago (Nano Banana Pro)", grupo: "🤖 GOOGLE GEMINI IA" },
      { clave: "APPSHEET_APP_ID", val: "", desc: "PEGA AQUÍ: ID de la App en AppSheet", grupo: "🤖 INTEGRACIÓN APPSHEET" },
      { clave: "APPSHEET_ACCESS_KEY", val: "", desc: "PEGA AQUÍ: Access Key de la App en AppSheet", grupo: "🤖 INTEGRACIÓN APPSHEET" },
      { clave: "TELEGRAM_BOT_TOKEN", val: "8268672991:AAH2aKxeJvhT4kBdJaUghNmvtJrPT8bTLyQ", desc: "Token del Bot de Telegram (@BotFather)", grupo: "💬 TELEGRAM NOTIFICATION" },
      { clave: "TELEGRAM_CHAT_ID", val: "7778458279", desc: "ID del Chat o Grupo de Telegram (CLIENTE)", grupo: "💬 TELEGRAM NOTIFICATION" },
      { clave: "TELEGRAM_DEV_CHAT_ID", val: "7778458279", desc: "ID del Chat del Desarrollador (ERRORES)", grupo: "💬 TELEGRAM NOTIFICATION" },
      { clave: "TELEGRAM_MODE", val: "DEV", desc: "Modo: DEV (solo salud) o CLIENT (asistente)", grupo: "💬 TELEGRAM NOTIFICATION" },
      { clave: "NOTIFICATION_PROVIDER", val: "TELEGRAM", desc: "Canal: TELEGRAM, EMAIL o NONE", grupo: "💬 TELEGRAM NOTIFICATION" },
      { clave: "NOTIFICATION_EMAIL", val: "", desc: "Email para notificaciones (si aplica)", grupo: "💬 TELEGRAM NOTIFICATION" },
      { clave: "BQ_ENABLE", val: "TRUE", desc: "Activa el archivado industrial en BigQuery", grupo: "📊 INDUSTRIALES (BIGQUERY)" },
      { clave: "BQ_PROJECT_ID", val: "SkypiaUnderwearApi", desc: "ID Proyecto Google Cloud (GCP)", grupo: "📊 INDUSTRIALES (BIGQUERY)" },
      { clave: "BQ_DATASET_ID", val: "", desc: "ID Dataset BQ (Vacio = APP_NAME_MASTER)", grupo: "📊 INDUSTRIALES (BIGQUERY)" },
      { clave: "PUBLICATION_TARGET", val: "DONWEB", desc: "Respaldo Global: DONWEB o GITHUB", grupo: "⚙️ CONFIGURACIÓN GENERAL" },
      { clave: "BLOGGER_PUBLICATION_TARGET", val: "AMBOS", desc: "Blogger Sync: DONWEB, GITHUB, AMBOS o NONE", grupo: "📡 ECOSISTEMA BLOGGER" },
      { clave: "TPV_PUBLICATION_TARGET", val: "DRIVE", desc: "TPV Sync: DRIVE, DONWEB, GITHUB o AMBOS", grupo: "⚙️ CONFIGURACIÓN GENERAL" },
      { clave: "GITHUB_USER", val: "", desc: "Usuario GitHub", grupo: "🌐 GITHUB SYNC" },
      { clave: "GITHUB_REPO", val: "api-tienda", desc: "Repositorio", grupo: "🌐 GITHUB SYNC" },
      { clave: "GITHUB_TOKEN", val: "", desc: "Token (repo scope)", grupo: "🌐 GITHUB SYNC" },
      { clave: "GITHUB_FILE_PATH", val: catalogFileName, desc: "Ruta JSON del TPV en GitHub", grupo: "🌐 GITHUB SYNC" },
      { clave: "ASSETS_GITHUB_TOKEN", val: "", desc: "Token del Repositorio Central de Activos (BlogShop Core)", grupo: "🌐 GITHUB SYNC" },
      { clave: "ASSETS_GITHUB_BRANCH", val: "main", desc: "Rama del Repositorio de Activos", grupo: "🌐 GITHUB SYNC" },
      { clave: "ASSETS_ENABLE_GITHUB_SYNC", val: "TRUE", desc: "Activa la sincronización de iconos SVG a GitHub (TRUE/FALSE)", grupo: "🌐 GITHUB SYNC" },
      { clave: "BLOGGER_GITHUB_FILE_PATH", val: appSlug + "-blogger-config.json", desc: "Ruta JSON de Blogger en GitHub", grupo: "📡 ECOSISTEMA BLOGGER" },
      { clave: "DONWEB_WRITE_URL", val: "https://tudominio.com/api_json_write.php", desc: "URL PHP de escritura JSON en Donweb", grupo: "📡 DONWEB HOSTING" },
      { clave: "DONWEB_READ_URL", val: "https://tudominio.com/api_json_read.php", desc: "URL PHP de lectura JSON en Donweb", grupo: "📡 DONWEB HOSTING" },
      { clave: "SYNC_START_HOUR", val: "6", desc: "Hora de inicio de sincronización (0-23)", grupo: "⚙️ CONFIGURACIÓN GENERAL" },
      { clave: "SYNC_END_HOUR", val: "23", desc: "Hora de fin de sincronización (0-23)", grupo: "⚙️ CONFIGURACIÓN GENERAL" },
      { clave: "RESELLER_SYNC_TOKEN", val: "RESELLER_SYNC_TOKEN_V1", desc: "Token secreto para validar la sincronización (Debe ser igual en ambos ERP)", grupo: "🔌 INTEGRACIÓN RESELLER" }
    ];

    otrasConstantes.forEach(c => {
      asegurarClave(sheet, c.clave, c.val, c.desc, c.grupo);
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

        if (siteUrl && siteUrl !== "" && !siteUrl.includes("tudominio.com")) {
          const cleanUrl = siteUrl.endsWith('/') ? siteUrl : siteUrl + '/';

          // Mapa: clave BD_APP_SCRIPT → valor derivado del dominio
          const urlKeys = [
            { clave: "WP_SITE_URL", val: cleanUrl, desc: "URL del Sitio Web", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
            { clave: "WP_IMAGE_API_URL", val: cleanUrl + "api-image-uploader.php", desc: "URL API Imágenes", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
            { clave: "WP_PRODUCT_API_URL", val: cleanUrl + "api-woocommerce-product.php", desc: "URL API Productos WC", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
            { clave: "DONWEB_WRITE_URL", val: cleanUrl + "api_json_write.php", desc: "URL PHP escritura JSON en Donweb", grupo: "📡 DONWEB HOSTING" },
            { clave: "DONWEB_READ_URL", val: cleanUrl + "api_json_read.php", desc: "URL PHP lectura JSON en Donweb", grupo: "📡 DONWEB HOSTING" }
          ];

          urlKeys.forEach(k => {
            const info = asegurarClave(sheet, k.clave, k.val, k.desc, k.grupo);
            guardarDato(sheet, info.fila, k.val, k.desc); // siempre sobreescribe
          });

          console.log("🌐 [Installer] URLs sincronizadas desde SITIO_WEB: " + cleanUrl);
        } else {
          console.warn("⚠️ [Installer] SITIO_WEB vacío o por defecto. Reseteando URLs en BD_APP_SCRIPT para evitar DNS errors.");
          const urlKeysToClean = [
            { clave: "WP_SITE_URL", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
            { clave: "WP_IMAGE_API_URL", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
            { clave: "WP_PRODUCT_API_URL", grupo: "🌐 INTEGRACIÓN WORDPRESS" },
            { clave: "DONWEB_WRITE_URL", grupo: "📡 DONWEB HOSTING" },
            { clave: "DONWEB_READ_URL", grupo: "📡 DONWEB HOSTING" }
          ];
          urlKeysToClean.forEach(k => {
            const info = asegurarClave(sheet, k.clave, "", "", k.grupo);
            guardarDato(sheet, info.fila, "", "Omitido por falta de SITIO_WEB activo");
          });
        }
      }
    } catch (eUrl) {
      console.warn("⚠️ [Installer] No se pudo sincronizar SITIO_WEB: " + eUrl.message);
    }

    // 6.5 LIMPIEZA INTERACTIVA DE CATÁLOGOS PERSONALES (NUEVO CLIENTE)
    limpiarDatosPersonalesNuevoCliente(ss);

    // 7. INSTALACIÓN DE TRIGGERS (con validaciones de dependencias mínimas y datos)
    const triggerLog = [];

    const sheetProductos = ss.getSheetByName(SHEETS.PRODUCTS || "BD_PRODUCTOS");
    const tieneProductos = sheetProductos && sheetProductos.getLastRow() > 1;

    if (!tieneProductos) {
      // Eliminar triggers existentes del proyecto para evitar ejecuciones fallidas
      const triggersToClean = ["publicarCatalogo", "tpv_limpiarFilasVaciasEstructural", "tpv_consolidarVentasJson"];
      ScriptApp.getProjectTriggers()
        .filter(t => triggersToClean.includes(t.getHandlerFunction()))
        .forEach(t => ScriptApp.deleteTrigger(t));

      triggerLog.push("⛔ AUTOMATIZACIÓN DESACTIVADA: Base de datos limpia o sin productos.");
      triggerLog.push("   (Los triggers no se crearán hasta que cargues productos para evitar errores).");
    } else {
      // Helper: elimina triggers previos de una función y crea uno nuevo
      function reinstalarTrigger(handlerFn, minutosIntervalo) {
        ScriptApp.getProjectTriggers()
          .filter(t => t.getHandlerFunction() === handlerFn)
          .forEach(t => ScriptApp.deleteTrigger(t));
        ScriptApp.newTrigger(handlerFn).timeBased().everyMinutes(minutosIntervalo).create();
      }

      function reinstalarTriggerDiario(handlerFn, hora) {
        ScriptApp.getProjectTriggers()
          .filter(t => t.getHandlerFunction() === handlerFn)
          .forEach(t => ScriptApp.deleteTrigger(t));
        ScriptApp.newTrigger(handlerFn).timeBased().atHour(hora).everyDays(1).create();
      }

      // -- TRIGGER TPV (publicarCatalogo, cada 15 min) --
      // Condiciones: al menos un destino externo configurado
      const cfg = GLOBAL_CONFIG.SCRIPT_CONFIG;
      const donwebOk = !!(cfg["DONWEB_WRITE_URL"] && !cfg["DONWEB_WRITE_URL"].includes("tudominio"));
      const githubOk = !!(cfg["GITHUB_USER"] && cfg["GITHUB_REPO"] && cfg["GITHUB_TOKEN"]);

      if (donwebOk || githubOk) {
        reinstalarTrigger("publicarCatalogo", 15);
        reinstalarTriggerDiario("tpv_limpiarFilasVaciasEstructural", 3); // A las 3 AM
        triggerLog.push("✅ TPV (cada 15 min): Donweb=" + (donwebOk ? "✅" : "⛔") + " GitHub=" + (githubOk ? "✅" : "⛔"));
      } else {
        triggerLog.push("⛔ TPV: Trigger NO instalado. Configurá DONWEB_WRITE_URL o GITHUB_USER/REPO/TOKEN.");
      }

      // -- TRIGGER DASHBOARD VENTAS --
      tpv_setupDashboardConsolidatorTrigger();
      triggerLog.push("✅ DASHBOARD: Consolidación Bake & Serve (cada 1 hora)");
    }

    // -- TRIGGER BLOGGER -- 
    // NOTA: Se ha desactivado el trigger recurrente. Blogger se actualiza en cadena desde publicarCatalogo.
    triggerLog.push("ℹ️ Blogger: Trigger automático desactivado (actualización en cadena activada).");

    // 6.7 Formatear y ordenar la hoja BD_APP_SCRIPT (Premium Styling)
    try {
      const mapping = HeaderManager.getMapping("APP_SCRIPT_CONFIG");
      const lastRow = sheet.getLastRow();
      if (lastRow > 1 && mapping) {
        const grupoCol = (mapping["GRUPO"] !== undefined ? mapping["GRUPO"] : 1) + 1;
        const claveCol = (mapping["CLAVE"] !== undefined ? mapping["CLAVE"] : 2) + 1;
        sheet.getRange(2, 1, lastRow - 1, 5).sort([
          { column: grupoCol, ascending: true },
          { column: claveCol, ascending: true }
        ]);
      }
      formatBDAppScriptSheet(sheet);

      // Limpiar caché de configuración global para asegurar la recarga inmediata de los nuevos valores
      try {
        _cacheConfig = null;
        CacheService.getScriptCache().remove("GLOBAL_SCRIPT_CONFIG");
        console.log("🧹 [Installer] Caché de configuración global vaciado con éxito.");
      } catch (eCache) {
        console.warn("⚠️ [Installer] No se pudo limpiar cache config: " + eCache.message);
      }

      console.log("💎 [Installer] Hoja BD_APP_SCRIPT ordenada y formateada profesionalmente.");
    } catch (eFormat) {
      console.warn("⚠️ [Installer] No se pudo formatear la hoja BD_APP_SCRIPT: " + eFormat.message);
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

/**
 * Prepara la estructura inicial en BigQuery (Dataset y Tabla).
 */
function setupBigQueryStructure() {
  const ui = SpreadsheetApp.getUi();
  const projectId = GLOBAL_CONFIG.SCRIPT_CONFIG["GCP_PROJECT_ID"];
  const datasetId = "ERP_MASTER";
  const tableId = "HISTORIAL_VENTAS";

  if (!projectId || projectId.includes("Skypia")) {
    ui.alert("❌ Error: Primero configura el 'GCP_PROJECT_ID' en la hoja BD_APP_SCRIPT.");
    return;
  }

  try {
    // 1. Crear Dataset si no existe
    try {
      BigQuery.Datasets.get(projectId, datasetId);
      console.log(`✅ Dataset ${datasetId} ya existe.`);
    } catch (e) {
      const newDataset = {
        datasetReference: { datasetId: datasetId },
        location: "US"
      };
      BigQuery.Datasets.insert(newDataset, projectId);
      console.log(`✅ Dataset ${datasetId} creado.`);
    }

    // 2. Crear Tabla si no existe
    try {
      BigQuery.Tables.get(projectId, datasetId, tableId);
      console.log(`✅ Tabla ${tableId} ya existe.`);
    } catch (e) {
      const newTable = {
        tableReference: { projectId: projectId, datasetId: datasetId, tableId: tableId },
        schema: {
          fields: [
            { name: "VENTA_ID", type: "STRING" },
            { name: "FECHA", type: "STRING" },
            { name: "ORIGEN", type: "STRING" },
            { name: "ESTADO", type: "STRING" },
            { name: "TOTAL", type: "FLOAT" },
            { name: "CLIENTE_ID", type: "STRING" },
            { name: "TIENDA_ID", type: "STRING" },
            { name: "METODO_PAGO", type: "STRING" },
            { name: "CAJA_ID", type: "STRING" },
            { name: "ASESOR", type: "STRING" },
            { name: "FECHA_CAJA", type: "STRING" },
            { name: "COSTO_ENVIO", type: "FLOAT" },
            { name: "RECARGO_TRANSFERENCIA", type: "FLOAT" },
            { name: "RECARGO_MENOR", type: "FLOAT" },
            { name: "PAGO_EFECTIVO", type: "FLOAT" },
            { name: "MONTO_TOTAL_PRODUCTOS", type: "FLOAT" },
            { name: "SUBTOTAL", type: "FLOAT" },
            { name: "TIPO_VENTA", type: "STRING" },
            { name: "PAGO_MIXTO", type: "STRING" }
          ]
        }
      };
      BigQuery.Tables.insert(newTable, projectId, datasetId);
      console.log(`✅ Tabla ${tableId} creada.`);
    }

    ui.alert(`🚀 Estructura de BigQuery lista!\n\nProyecto: ${projectId}\nDataset: ${datasetId}\nTabla: ${tableId}`);

  } catch (error) {
    ui.alert(`❌ Error al preparar BigQuery: ${error.message}`);
  }
}

/**
 * 🧹 LIMPIEZA INTERACTIVA DE CATÁLOGOS PERSONALES (NUEVO CLIENTE)
 * Elimina de forma 100% protegida los registros de 19 hojas del ERP para iniciar un cliente limpio.
 * Requiere confirmación de consentimiento y el ingreso de un PIN/Frase secreta de confirmación.
 */
function limpiarDatosPersonalesNuevoCliente(ss) {
  let ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    console.warn("⚠️ No se puede cargar la interfaz de usuario en este contexto. Omitiendo limpieza.");
    return;
  }

  // 1. Preguntar confirmación inicial (YES/NO)
  const confirm = ui.alert(
    "🧹 INSTALACIÓN LIMPIA (NUEVO CLIENTE)",
    "¿Deseas realizar una limpieza de los catálogos e inventario personales para inicializar este ERP como una copia limpia de cliente?\n\n" +
    "Esta operación es irreversible y borrará todos los productos, ventas, clientes e inventarios actuales.\n\n" +
    "Si estás actualizando un ERP existente o en producción, selecciona 'NO' para conservar todos tus datos intactos.",
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    ui.alert("ℹ️ Limpieza Omitida", "Los datos existentes se han conservado intactos de forma segura.", ui.ButtonSet.OK);
    return;
  }

  // 2. Pedir frase secreta (PIN) para confirmación de seguridad
  const prompt = ui.prompt(
    "⚠️ SEGURIDAD CRÍTICA (MECANISMO ANTIBORRADO) ⚠️",
    "Estás a punto de borrar por completo los datos transaccionales y de productos de esta hoja.\n\n" +
    "Para proceder de forma consciente, escribe exactamente la frase de confirmación en mayúsculas:\n\n" +
    "LIMPIAR_CATALOGOS_NUEVO_CLIENTE",
    ui.ButtonSet.OK_CANCEL
  );

  const textEntered = prompt.getResponseText().trim();
  if (prompt.getSelectedButton() !== ui.Button.OK || textEntered !== "LIMPIAR_CATALOGOS_NUEVO_CLIENTE") {
    ui.alert("❌ Borrado Cancelado", "Frase de confirmación incorrecta o acción cancelada. No se ha modificado ningún dato.", ui.ButtonSet.OK);
    return;
  }

  // 3. Ejecutar limpieza de las 19 hojas
  const logs = ["🧹 Iniciando limpieza protegida de base de datos..."];
  let totalHojasLimpias = 0;

  const hojasALimpiar = [
    "BD_PRODUCTOS", "BD_VARIEDAD_PRODUCTOS", "BD_PRODUCTO_IMAGENES",
    "BD_CATEGORIAS", "BD_INVENTARIO", "BD_MOVIMIENTOS_INVENTARIO",
    "BD_DEPOSITO", "BD_CLIENTES", "BD_VENTAS_PEDIDOS", "BD_DETALLE_VENTAS",
    "BLOGGER_VENTAS", "BLOGGER_DETALLE_VENTAS", "BD_GESTION_CAJA",
    "BD_VENTAS_WOOCOMMERCE", "BD_DETALLE_VENTAS_WOOCOMMERCE", "BD_COLA_BATCH",
    "BD_LABORATORIO_IA", "BD_BARTENDER_HISTORY", "BD_CLIENT_FORM_LOG"
  ];

  hojasALimpiar.forEach(nombreAlias => {
    // Obtener el nombre físico real a través del mapeo SHEETS
    const nombreHoja = (typeof SHEETS !== 'undefined' && SHEETS[nombreAlias]) ? SHEETS[nombreAlias] : nombreAlias;
    const sheet = ss.getSheetByName(nombreHoja);

    if (sheet) {
      const maxRows = sheet.getMaxRows();
      if (maxRows > 1) {
        const lastCol = sheet.getLastColumn();
        if (lastCol > 0) {
          // Limpiar celdas desde la fila 2 en adelante
          sheet.getRange(2, 1, maxRows - 1, lastCol).clearContent();
        }

        // Eliminar filas adicionales vacías para optimizar rendimiento
        if (maxRows > 2) {
          sheet.deleteRows(2, maxRows - 2);
        }
        logs.push(`✅ Hoja '${nombreHoja}' vaciada y optimizada.`);
        totalHojasLimpias++;
      } else {
        logs.push(`ℹ️ Hoja '${nombreHoja}' ya estaba vacía.`);
      }
    } else {
      logs.push(`⚠️ Hoja '${nombreHoja}' no existe en este ERP.`);
    }
  });

  ui.alert("🚀 Limpieza Completada", `Se han limpiado y optimizado con éxito ${totalHojasLimpias} hojas de datos transaccionales y catálogos.\n\n` + logs.join("\n"), ui.ButtonSet.OK);
}

/**
 * Aplica estilos premium (colores HSL pastel, cabeceras azul marino, monospace y áreas editables)
 * a la hoja de configuración de BD_APP_SCRIPT de forma dinámica basándose en su mapeo de columnas.
 */
function formatBDAppScriptSheet(sheet) {
  if (!sheet) return;

  // 1. Obtener mapeo de columnas dinámico
  const mapping = HeaderManager.getMapping("APP_SCRIPT_CONFIG");
  if (!mapping) return;

  const macroIdIdx = mapping["MACRO_ID"] !== undefined ? mapping["MACRO_ID"] : 0;
  const grupoIdx = mapping["GRUPO"] !== undefined ? mapping["GRUPO"] : 1;
  const claveIdx = mapping["CLAVE"] !== undefined ? mapping["CLAVE"] : 2;
  const valorIdx = mapping["VALOR"] !== undefined ? mapping["VALOR"] : 3;
  const descIdx = mapping["DESCRIPCION"] !== undefined ? mapping["DESCRIPCION"] : 4;

  // 3. Estilos de cabecera (Azul Ejecutivo Oscuro)
  sheet.getRange("1:1")
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#1B365D")
    .setFontFamily("Inter")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.setColumnWidth(macroIdIdx + 1, 100);  // MACRO_ID
  sheet.setColumnWidth(grupoIdx + 1, 220);    // GRUPO
  sheet.setColumnWidth(claveIdx + 1, 260);    // CLAVE (NO TOCAR)
  sheet.setColumnWidth(valorIdx + 1, 380);    // VALOR (EDITABLE)
  sheet.setColumnWidth(descIdx + 1, 340);     // DESCRIPCION

  sheet.setFrozenRows(1);

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  // 4. Rango de Datos
  const dataRange = sheet.getRange(2, 1, lastRow - 1, 5);
  dataRange.clearFormat();

  // Paleta de colores pastel HSL en hex
  const groupColors = {
    "📁 GOOGLE DRIVE CORE": "#F0F4F8",      // Soft Slate Grey
    "🤖 INTEGRACIÓN APPSHEET": "#E6FFFA",   // Soft Teal
    "💬 TELEGRAM NOTIFICATION": "#FAF5FF",  // Soft Violet
    "🌐 GITHUB SYNC": "#EBF4FF",            // Soft Indigo
    "📡 ECOSISTEMA BLOGGER": "#FEFCBF",     // Soft Yellow
    "📡 DONWEB HOSTING": "#FFF5F5",         // Soft Warm Orange
    "🤖 GOOGLE GEMINI IA": "#E8F0FE",       // Soft Blue
    "⚙️ CONFIGURACIÓN GENERAL": "#FFFFFF",  // White
    "🔌 INTEGRACIÓN RESELLER": "#F7FAFC",   // Neutral Grey
    "📊 INDUSTRIALES (BIGQUERY)": "#EDF2F7" // Industrial Blue-Grey
  };

  const values = dataRange.getValues();

  for (let i = 0; i < values.length; i++) {
    const rowNum = i + 2;
    const clave = String(values[i][claveIdx]).trim();
    const grupo = String(values[i][grupoIdx]).trim() || "⚙️ CONFIGURACIÓN GENERAL";
    const bgColor = groupColors[grupo] || "#FFFFFF";

    // Fila completa
    const rowRange = sheet.getRange(rowNum, 1, 1, 5);
    rowRange.setBackground(bgColor)
      .setFontFamily("Inter")
      .setFontSize(10)
      .setVerticalAlignment("middle");

    // MACRO_ID y CLAVE (Estilo Monospace protegido)
    sheet.getRange(rowNum, macroIdIdx + 1).setFontFamily("Courier New").setFontColor("#94A3B8").setHorizontalAlignment("center");
    sheet.getRange(rowNum, claveIdx + 1).setFontFamily("Courier New").setFontWeight("bold").setFontColor("#475569");

    // Campo editable VALOR (Enmarcado suave verde menta)
    const valorCell = sheet.getRange(rowNum, valorIdx + 1);
    valorCell.setBackground("#ECFDF5")
      .setBorder(true, true, true, true, false, false, "#A7F3D0", SpreadsheetApp.BorderStyle.SOLID);

    // Inyectar menús desplegables de opciones válidas para evitar mistypes
    applyDataValidation(clave, valorCell);
  }
}

/**
 * Inyecta reglas de validación de Google Sheets en la celda de valor para claves críticas.
 */
function applyDataValidation(clave, range) {
  let rule = null;

  const options = {
    "TPV_PUBLICATION_TARGET": ["DRIVE", "DONWEB", "GITHUB", "AMBOS"],
    "BLOGGER_PUBLICATION_TARGET": ["DONWEB", "GITHUB", "AMBOS", "NONE", "DRIVE"],
    "PUBLICATION_TARGET": ["DONWEB", "GITHUB", "AMBOS"],
    "ASSETS_ENABLE_GITHUB_SYNC": ["TRUE", "FALSE"],
    "BQ_ENABLE": ["TRUE", "FALSE"],
    "TELEGRAM_MODE": ["DEV", "CLIENT"],
    "NOTIFICATION_PROVIDER": ["TELEGRAM", "EMAIL", "NONE"]
  };

  if (options[clave]) {
    rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(options[clave], true)
      .setAllowInvalid(false)
      .setHelpText("Elige una opción válida: " + options[clave].join(", "))
      .build();
  }

  if (rule) {
    range.setDataValidation(rule);
  } else {
    range.clearDataValidations();
  }
}

/**
 * 🛠️ MIGRACIÓN DE AUDITORÍA IA
 * Quita físicamente las columnas PROMPT y COSTO de la hoja BD_PRODUCTO_IMAGENES
 * y asegura que BD_LABORATORIO_IA tenga las columnas CONFIG_PARAMS y COSTO.
 */
function ejecutarMigracionAuditoriaIA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const logs = ["🛠️ Iniciando migración de auditoría IA..."];
  
  try {
    // 1. Asegurar columnas en BD_LABORATORIO_IA
    logs.push("1. Validando estructura de BD_LABORATORIO_IA...");
    const sheetLab = AIService._obtenerHojaLab();
    if (sheetLab) {
      logs.push("✅ BD_LABORATORIO_IA validada/actualizada con éxito.");
    } else {
      throw new Error("No se pudo obtener ni crear BD_LABORATORIO_IA.");
    }

    // 2. Buscar y remover columnas en BD_PRODUCTO_IMAGENES
    logs.push("2. Buscando columnas obsoletas en BD_PRODUCTO_IMAGENES...");
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    if (!sheetImg) {
      throw new Error(`No se encontró la hoja '${SHEETS.PRODUCT_IMAGES}'.`);
    }

    const lastCol = sheetImg.getLastColumn();
    if (lastCol > 0) {
      const headers = sheetImg.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toUpperCase());
      
      // Encontrar índices de PROMPT y COSTO (1-indexed para borrar columnas)
      // Nota: Borramos primero la que tenga mayor índice para no alterar los índices de las anteriores
      const indicesABorrar = [];
      const promptIdx = headers.indexOf("PROMPT");
      const costoIdx = headers.indexOf("COSTO");
      
      if (promptIdx !== -1) indicesABorrar.push({ name: "PROMPT", colNum: promptIdx + 1 });
      if (costoIdx !== -1) indicesABorrar.push({ name: "COSTO", colNum: costoIdx + 1 });
      
      // Ordenar de mayor a menor columna para borrar sin desfasar índices
      indicesABorrar.sort((a, b) => b.colNum - a.colNum);
      
      indicesABorrar.forEach(item => {
        sheetImg.deleteColumn(item.colNum);
        logs.push(`🗑️ Columna '${item.name}' eliminada correctamente de BD_PRODUCTO_IMAGENES (Columna física #${item.colNum}).`);
      });

      if (indicesABorrar.length === 0) {
        logs.push("ℹ️ Las columnas 'PROMPT' y 'COSTO' ya no existen en BD_PRODUCTO_IMAGENES.");
      }
    }

    // Limpiar caché de HeaderManager
    HeaderManager.clearCache();
    logs.push("✅ Caché de cabeceras reseteada.");
    logs.push("🎉 Migración de auditoría IA completada con éxito!");
    
    ui.alert("Migración Exitosa", logs.join("\n"), ui.ButtonSet.OK);
  } catch (e) {
    logs.push(`❌ ERROR: ${e.message}`);
    ui.alert("Fallo en Migración", logs.join("\n"), ui.ButtonSet.OK);
  }
}