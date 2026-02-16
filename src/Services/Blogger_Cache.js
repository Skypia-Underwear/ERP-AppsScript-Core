/**
 * =====================================================================================
 * ARCHIVO: Blogger_Cache.js
 * RESPONSABILIDAD: Gestionar la generación y persistencia del JSON para Blogger.
 * =====================================================================================
 */

/**
 * Genera el JSON y lo guarda en Google Drive.
 * Se puede llamar manualmente o mediante un trigger.
 */
function blogger_regenerarCacheConfiguracion() {
    console.log("🔄 [Blogger Cache] Iniciando regeneración...");

    try {
        const jo = blogger_listar_configuracion_sinCache();
        const jsonFinal = JSON.stringify(jo);

        // IDs extraídos de External_Analysis/Constants.js (Independientes del ERP)
        const folderId = "1gM0BNaVa-LfTp80u7JQ177LnhmafqaNf";
        const fileName = "configuracion_sitio.json";

        const folder = DriveApp.getFolderById(folderId);
        let file;
        const files = folder.getFilesByName(fileName);

        if (files.hasNext()) {
            file = files.next();
            file.setContent(jsonFinal);
            console.log("♻️ [Blogger Cache] Archivo JSON sobrescrito correctamente.");
        } else {
            file = folder.createFile(fileName, jsonFinal, "application/json");
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            console.log("✅ [Blogger Cache] Archivo JSON creado de cero.");
        }

        // Opcional: Notificar éxito por Telegram solo si es necesario
        // notificarTelegramSalud("🔄 Caché de Blogger regenerado correctamente.", "INFO");

    } catch (e) {
        console.error("❌ [Blogger Cache] Error: " + e.message);
        notificarTelegramSalud("🚨 Error al regenerar caché de Blogger: " + e.message, "ERROR");
    }
}

/**
 * Mantenimiento: Crea el trigger de 10 minutos si no existe.
 */
function blogger_instalarTriggerCache() {
    const handler = "blogger_regenerarCacheConfiguracion";

    // Limpiar previos
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => {
        if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
    });

    // Crear nuevo
    ScriptApp.newTrigger(handler)
        .timeBased()
        .everyMinutes(10)
        .create();

    console.log("✅ [Blogger Cache] Trigger de 10 minutos instalado.");
}
