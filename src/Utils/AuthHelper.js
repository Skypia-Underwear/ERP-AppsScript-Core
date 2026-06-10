/**
 * Helper para forzar el flujo de autorización de Google Apps Script.
 * Útil para resolver el "Auth Deadlock" cuando se usa un proyecto GCP estándar.
 * Ejecuta esta función desde el editor si recibes errores de permiso inexistentes.
 */
function forceAuthReset() {
  console.log("Iniciando forzado de autorización...");

  try {
    // Forzar Drive API (Built-in y Avanzado)
    const rootFolders = DriveApp.getRootFolder();
    console.log("DriveApp: OK (Root: " + rootFolders.getName() + ")");

    if (typeof Drive !== 'undefined') {
      Drive.About.get({ fields: "user" });
      console.log("Drive Advanced Service: OK");
    }

    // Forzar Spreadsheet API
    const activeSS = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSS) {
      console.log("SpreadsheetApp: OK (ID: " + activeSS.getId() + ")");
    }

    // Forzar BigQuery API (si está habilitado)
    if (typeof BigQuery !== 'undefined') {
      BigQuery.Projects.list();
      console.log("BigQuery API: OK");
    }

    // Forzar ScriptApp API (Triggers)
    const triggers = ScriptApp.getProjectTriggers();
    console.log("ScriptApp (Triggers): OK (Encontrados: " + triggers.length + ")");

    // Forzar UrlFetchApp (External Requests)
    UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
    console.log("UrlFetchApp: OK");

    console.log("✅ Autorización verificada exitosamente.");
    return { success: true, message: "Autorización verificada." };
  } catch (e) {
    console.error("❌ Error durante la autorización: " + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Resetea de forma 100% dinámica los Circuit Breakers activos y la caché de configuración.
 * Lee los nombres de archivo directamente de GLOBAL_CONFIG para evitar hardcoding en el código.
 */
function resetearCircuitBreakers() {
  console.log("Iniciando reseteo dinámico de Circuit Breakers...");
  const cache = CacheService.getScriptCache();
  
  try {
    // Obtener las rutas de archivos configuradas dinámicamente desde la BD
    const tpvFile = GLOBAL_CONFIG.GITHUB.FILE_PATH;
    const bloggerFile = GLOBAL_CONFIG.BLOGGER.GITHUB_FILE_PATH;
    
    const filesToClear = [];
    if (tpvFile) filesToClear.push(String(tpvFile).trim());
    if (bloggerFile) filesToClear.push(String(bloggerFile).trim());
    
    // Fallback de seguridad utilizando las constantes por defecto del núcleo
    if (filesToClear.length === 0) {
      filesToClear.push("catalogo.json");
      filesToClear.push("blogger_config.json");
    }
    
    filesToClear.forEach(file => {
      // 1. Limpiar bloqueo de GitHub
      const githubKey = "GITHUB_CIRCUIT_BREAKER_" + file.replace(/[^a-zA-Z0-9]/g, "_");
      cache.remove(githubKey);
      
      // 2. Limpiar bloqueo de Donweb
      const donwebKey = "DONWEB_CIRCUIT_BREAKER_" + file;
      cache.remove(donwebKey);
      
      console.log(`🧹 Circuit Breakers removidos para: ${file}`);
    });
    
    // 3. Limpiar caché general de configuración
    cache.remove("GLOBAL_SCRIPT_CONFIG");
    
    console.log("✅ Circuit Breakers y caché de configuración restablecidos con éxito.");
    return { success: true, message: "Circuit breakers restablecidos con éxito." };
  } catch (e) {
    console.error("❌ Error al resetear Circuit Breakers: " + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Verifica si el script tiene los permisos necesarios en tiempo de ejecución.
 * Si no los tiene, envía una alerta de Telegram.
 */
function checkSystemPermissions() {
  const authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  const status = authInfo.getAuthorizationStatus();

  if (status === ScriptApp.AuthorizationStatus.REQUIRED) {
    const authUrl = authInfo.getAuthorizationUrl();
    const msg = "🚨 <b>ALERTA DE SEGURIDAD (AUTH DEADLOCK)</b>\n" +
      "El ERP ha perdido permisos de Google Services.\n\n" +
      "<b>Acción Requerida:</b>\n" +
      "1. Abre el Editor de Apps Script.\n" +
      "2. Ejecuta manualmente la función <code>forceAuthReset</code>.\n" +
      "3. Acepta el nuevo cuadro de diálogo de permisos.\n\n" +
      "🔗 <a href=\"" + authUrl + "\">Enlace de Autorización</a>";

    if (typeof notificarTelegramSalud === 'function') {
      notificarTelegramSalud(msg, "ERROR");
    }
    return false;
  }
  return true;
}

/**
 * SCOPE ANCHORS (NO ELIMINAR)
 * Estas líneas forzan a Google Apps Script a detectar los scopes necesarios 
 * incluso si están en el manifiesto, evitando que el 'Auth Deadlock' sea silencioso.
 */
function _scopeAnchors() {
  DriveApp.getRootFolder();
  SpreadsheetApp.getActiveSpreadsheet();
  UrlFetchApp.fetch("");
  if (false) {
    BigQuery.Projects.list();
    Drive.Files.list();
  }
}

