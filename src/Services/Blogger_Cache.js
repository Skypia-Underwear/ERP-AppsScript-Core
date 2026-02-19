/**
 * =====================================================================================
 * ARCHIVO: Blogger_Cache.js
 * RESPONSABILIDAD: Gestionar la generación y persistencia del JSON para Blogger.
 * Destinos: Drive (primario) → Donweb (respaldo 1) → GitHub (respaldo 2)
 * =====================================================================================
 */

/**
 * Genera el JSON y lo guarda en Google Drive.
 * También lo publica en Donweb y GitHub como respaldos externos.
 * Se puede llamar manualmente o mediante un trigger (cada 10 min).
 */
function blogger_regenerarCacheConfiguracion() {
    console.log("🔄 [Blogger Cache] Iniciando regeneración...");

    try {
        const jo = blogger_listar_configuracion_sinCache();
        const jsonFinal = JSON.stringify(jo);

        // --- PASO 1: Drive (primario, fuente de verdad local) ---
        // Leer ID de carpeta dinámicamente desde BD_APP_SCRIPT (clave: BLOGGER_CACHE_FOLDER_ID)
        // El valor es generado automáticamente por Installer.js > inicializarEntorno()
        const folderId = GLOBAL_CONFIG.BLOGGER.CACHE_FOLDER_ID;
        if (!folderId) throw new Error("Falta configurar BLOGGER_CACHE_FOLDER_ID en BD_APP_SCRIPT. Ejecutá el Instalador.");

        const fileName = "configuracion_sitio.json";
        const folder = DriveApp.getFolderById(folderId);
        let file;
        const files = folder.getFilesByName(fileName);

        if (files.hasNext()) {
            file = files.next();
            file.setContent(jsonFinal);
            console.log("♻️ [Blogger Cache] Drive: JSON sobrescrito.");
        } else {
            file = folder.createFile(fileName, jsonFinal, "application/json");
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            console.log("✅ [Blogger Cache] Drive: JSON creado de cero.");
        }

        // --- PASO 2: Donweb (respaldo 1, mismo hosting que el frontend) ---
        const resDonweb = blogger_subirCacheADonweb(jo);
        if (resDonweb.success) {
            console.log("✅ [Blogger Cache] Donweb: JSON publicado.");
        } else {
            console.warn("⚠️ [Blogger Cache] Donweb falló (no crítico): " + resDonweb.message);
            notificarTelegramSalud("⚠️ Blogger Donweb falló: " + resDonweb.message, "ERROR");
        }

        // --- PASO 3: GitHub (respaldo 2, externo) ---
        const resGitHub = blogger_subirCacheAGitHub(jo);
        if (resGitHub.success) {
            console.log("✅ [Blogger Cache] GitHub: JSON publicado como respaldo.");
        } else {
            console.warn("⚠️ [Blogger Cache] GitHub falló (no crítico): " + resGitHub.message);
            notificarTelegramSalud("⚠️ Blogger GitHub falló: " + resGitHub.message, "ERROR");
        }

    } catch (e) {
        console.error("❌ [Blogger Cache] Error: " + e.message);
        notificarTelegramSalud("🚨 Error al regenerar caché de Blogger: " + e.message, "ERROR");
    }
}

/**
 * Publica el JSON de Blogger en Donweb (respaldo 1).
 * Reutiliza subirArchivoADonweb() definido en PosManager.js.
 * @param {Object} jsonData
 * @returns {{ success: boolean, message: string }}
 */
function blogger_subirCacheADonweb(jsonData) {
    try {
        const fileName = GLOBAL_CONFIG.BLOGGER.GITHUB_FILE_PATH; // misma conv. de nombres para ambos destinos
        if (!fileName) return { success: false, message: "Falta BLOGGER_GITHUB_FILE_PATH en BD_APP_SCRIPT." };
        return subirArchivoADonweb(jsonData, fileName);
    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * Publica el JSON de Blogger en GitHub (respaldo 2).
 * Reutiliza subirArchivoAGitHub() definido en PosManager.js.
 * @param {Object} jsonData
 * @returns {{ success: boolean, message: string }}
 */
function blogger_subirCacheAGitHub(jsonData) {
    try {
        const path = GLOBAL_CONFIG.BLOGGER.GITHUB_FILE_PATH;
        if (!path) return { success: false, message: "Falta BLOGGER_GITHUB_FILE_PATH en BD_APP_SCRIPT." };
        return subirArchivoAGitHub(jsonData, path);
    } catch (e) {
        return { success: false, message: e.message };
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
