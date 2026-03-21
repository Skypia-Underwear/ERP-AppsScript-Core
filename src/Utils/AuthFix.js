/**
 * FUNCION DE EMERGENCIA PARA FORZAR LA AUTORIZACION DE GOOGLE.
 * Ejecuta esta función manualmente en el editor de Apps Script (Seleccionándola en la lista de arriba y dando al botón ▶️ Ejecutar).
 * Esto debería disparar la ventana azul de permisos.
 */
function FORZAR_AUTORIZACION_SISTEMA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const drive = DriveApp.getRootFolder();
  const fetch = UrlFetchApp.fetch("https://www.google.com");
  
  console.log("✅ Si ves este mensaje en la consola de abajo, significa que ya estás autorizado.");
  console.log("Database ID: " + ss.getId());
  console.log("Drive Root Folder: " + drive.getName());
}
