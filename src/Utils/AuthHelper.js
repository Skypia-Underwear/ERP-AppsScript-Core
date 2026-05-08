/**
 * helper para forzar el flujo de autorización de Google Apps Script.
 * Útil para resolver el "Auth Deadlock" cuando se usa un proyecto GCP estándar.
 * Ejecuta esta función desde el editor si recibes errores de permiso inexistentes.
 */
function forceAuthReset() {
  console.log("Iniciando forzado de autorización...");
  
  try {
    // Forzar Drive API
    const rootFolders = DriveApp.getRootFolder();
    console.log("DriveApp: OK (Root: " + rootFolders.getName() + ")");
    
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
    
    console.log("✅ Autorización verificada exitosamente.");
  } catch (e) {
    console.error("❌ Error durante la autorización: " + e.message);
    throw e;
  }
}
