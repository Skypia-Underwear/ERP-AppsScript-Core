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
    if (!isSystemInWorkingHours()) {
        console.log("💤 [Modo Nocturno Blogger] Suspendido por horario.");
        return;
    }
    console.log("🔄 [Blogger Cache] Iniciando regeneración...");

    try {
        const jo = blogger_listar_configuracion_sinCache();
        const jsonFinal = JSON.stringify(jo);

        // --- PASO 1: Drive (primario, fuente de verdad local) ---
        // Leer ID de carpeta dinámicamente desde BD_APP_SCRIPT (clave: BLOGGER_CACHE_FOLDER_ID)
        // El valor es generado automáticamente por Installer.js > inicializarEntorno()
        const folderId = GLOBAL_CONFIG.BLOGGER.CACHE_FOLDER_ID;
        if (!folderId) throw new Error("Falta configurar BLOGGER_CACHE_FOLDER_ID en BD_APP_SCRIPT. Ejecutá el Instalador.");

        const fileName = GLOBAL_CONFIG.BLOGGER.GITHUB_FILE_PATH || "configuracion_sitio.json";
        const folder = DriveApp.getFolderById(folderId);
        let file;
        const files = folder.getFilesByName(fileName);

        if (files.hasNext()) {
            file = files.next();
            drive_updateFileContent(file.getId(), jsonFinal, "application/json");
            console.log("♻️ [Blogger Cache] Drive: JSON sobrescrito.");
        } else {
            file = folder.createFile(fileName, jsonFinal, "application/json");
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            console.log("✅ [Blogger Cache] Drive: JSON creado de cero.");
        }

        // --- NUEVO: FASE 2 DIFERIDA (Subir a Donweb y GitHub en nuevo contexto) ---
        blogger_programarSubidaRemota();

    } catch (e) {
        console.error("❌ [Blogger Cache] Error: " + e.message);
        notificarTelegramSalud("🚨 Error al regenerar caché de Blogger: " + e.message, "ERROR");
    }
}

/**
 * Programa la fase secundaria asincrónica para subir a redes (Donweb/GitHub).
 * Esto evita el límite de los 6 minutos de Google Apps Script.
 */
function blogger_programarSubidaRemota() {
    const handler = "blogger_procesarSubidasRemotas";
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(triggers[i]);
    }

    // Instanciar gatillo 1 minuto en el futuro
    ScriptApp.newTrigger(handler)
        .timeBased()
        .after(1 * 60 * 1000)
        .create();

    console.log("⏳ [Blogger Cache] Fase 2 (Subida Red) programada en 1 minuto.");
}

/**
 * Función secundaria asincrónica: Extrae el JSON local y lo publica.
 */
function blogger_procesarSubidasRemotas() {
    console.log("🚀 [Blogger Cache] Fase 2: Subida remota asincrónica...");

    // Auto-destruir este trigger
    const handler = "blogger_procesarSubidasRemotas";
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(triggers[i]);
    }

    try {
        const folderId = GLOBAL_CONFIG.BLOGGER.CACHE_FOLDER_ID;
        if (!folderId) throw new Error("Falta BLOGGER_CACHE_FOLDER_ID");

        const fileName = GLOBAL_CONFIG.BLOGGER.GITHUB_FILE_PATH || "configuracion_sitio.json";
        // Usamos executeWithRetry para evitar errores transitorios de "Error de Servicio: Drive"
        const jo = executeWithRetry(() => {
            const folder = DriveApp.getFolderById(folderId);
            const files = folder.getFilesByName(fileName);

            if (!files.hasNext()) throw new Error(`JSON local Blogger (${fileName}) no encontrado en Drive.`);

            const file = files.next();
            const contenidoStr = file.getBlob().getDataAsString();
            return JSON.parse(contenidoStr);
        }, 3);

        // --- PASO 2: Donweb ---
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
        console.error("❌ [Blogger Cache] Error subida remota: " + e.message);
        notificarTelegramSalud("🚨 Error interno en Subidor Remoto Blogger: " + e.message, "ERROR");
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
