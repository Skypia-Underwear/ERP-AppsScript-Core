/**
 * FUNCIÓN PARA FORZAR LA VENTANA DE PERMISOS
 * Ejecuta esto desde el editor si recibes errores de "No cuentas con el permiso".
 */
function forzarPermisosGCP() {
  console.log("Iniciando validación de permisos...");
  
  try {
    // Intento de llamada a Drive
    const folders = DriveApp.getFoldersByName("PRUEBA_PERMISOS");
    console.log("Drive: OK");

    // Intento de llamada a BigQuery
    if (typeof BigQuery !== 'undefined') {
       const projectId = GLOBAL_CONFIG.SCRIPT_CONFIG["GCP_PROJECT_ID"] || "gen-lang-client-0394478220";
       BigQuery.Datasets.list(projectId);
       console.log("BigQuery: OK");
    }
    
    console.log("✅ Permisos validados correctamente.");
  } catch (e) {
    console.error("⚠️ Error de permisos: " + e.message);
  }
}
