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

    const lock = LockService.getScriptLock();
    try {
        // 1. Intentar adquirir el bloqueo por hasta 30 segundos para evitar colisiones
        lock.waitLock(30000);
        console.log("🔄 [Blogger Cache] Iniciando regeneración con exclusión mutua...");

        // 2. Saneamiento proactivo de triggers huérfanos/residuales recurrentes cada 10 min
        try {
            const handler = "blogger_regenerarCacheConfiguracion";
            const triggers = ScriptApp.getProjectTriggers();
            triggers.forEach(t => {
                if (t.getHandlerFunction() === handler && t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
                    ScriptApp.deleteTrigger(t);
                    console.log("🧹 [Blogger Cache] Trigger recurrente huérfano eliminado.");
                }
            });
        } catch (errTrig) {
            console.warn("⚠️ No se pudo sanear triggers: " + errTrig.message);
        }

        const props = PropertiesService.getScriptProperties();
        const lastSyncStr = props.getProperty("LAST_BLOGGER_API_SYNC");
        const now = Date.now();
        const doceHorasMs = 12 * 60 * 60 * 1000; // 12 horas

        let forceLocal = true;
        let razon = "Trigger habitual (Lectura Local 0 API)";

        if (!lastSyncStr || (now - parseInt(lastSyncStr)) >= doceHorasMs) {
            forceLocal = false;
            razon = "Sincronización programada semestral/diaria vía API de AppSheet (Smart API)";
        }

        console.log(`📡 [Blogger Cache] Modo seleccionado: ${forceLocal ? "LOCAL" : "API (GLOBAL)"} - Razón: ${razon}`);

        const jo = blogger_listar_configuracion_sinCache(forceLocal);
        // Inyectamos timestamp_ms para que el archivo en Drive tenga referencia de frescura.
        // Nota: La subida a Donweb/GitHub ignorará este campo al comparar el contenido real.
        jo.timestamp_ms = now;
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

        // Si se realizó con éxito la sincronización API, guardamos el timestamp
        if (!forceLocal) {
            props.setProperty("LAST_BLOGGER_API_SYNC", String(now));
            console.log("💾 [Blogger Cache] Marca de tiempo de sincronización API actualizada con éxito.");
        }

        // --- NUEVO: FASE 2 DIFERIDA (Subir a Donweb y GitHub en nuevo contexto) ---
        blogger_programarSubidaRemota();

    } catch (e) {
        console.error("❌ [Blogger Cache] Error: " + e.message);
        notificarTelegramSalud("🚨 Error al regenerar caché de Blogger: " + e.message, "ERROR");
    } finally {
        // 3. Garantizar la liberación del bloqueo en cualquier circunstancia
        if (lock.hasLock()) {
            lock.releaseLock();
            console.log("🔓 [Blogger Cache] Bloqueo liberado con éxito.");
        }
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

        const target = (GLOBAL_CONFIG.BLOGGER_PUBLICATION_TARGET || "AMBOS").toUpperCase();

        // Evaluar si las herramientas están realmente configuradas de forma válida
        const donwebUrl = GLOBAL_CONFIG.DONWEB.WRITE_URL;
        const gitHubUser = GLOBAL_CONFIG.GITHUB.USER;
        const gitHubToken = GLOBAL_CONFIG.GITHUB.TOKEN;
        const gitHubRepo = GLOBAL_CONFIG.GITHUB.REPO;

        const donwebConfigurado = donwebUrl && donwebUrl.trim() !== "" && !donwebUrl.includes("tudominio.com");
        const gitHubConfigurado = gitHubUser && gitHubUser.trim() !== "" && gitHubToken && gitHubToken.trim() !== "" && gitHubRepo && gitHubRepo.trim() !== "";

        const useDonweb = (target === "DONWEB" || target === "AMBOS") && target !== "DRIVE" && donwebConfigurado;
        const useGitHub = (target === "GITHUB" || target === "AMBOS") && target !== "DRIVE" && gitHubConfigurado;

        let donwebSuccess = !useDonweb; // Si se omite, se considera neutral
        let donwebMsg = "Omitido por config";
        if (useDonweb) {
            const resDonweb = blogger_subirCacheADonweb(jo);
            donwebSuccess = resDonweb.success;
            donwebMsg = resDonweb.message;
            if (donwebSuccess) {
                console.log("✅ [Blogger Cache] Donweb: JSON publicado.");
            } else {
                console.warn("⚠️ [Blogger Cache] Donweb falló (no crítico): " + donwebMsg);
                notificarTelegramSalud("⚠️ Blogger Donweb falló: " + donwebMsg, "ERROR");
            }
        }

        // --- PASO 3: GitHub (respaldo 2, externo) ---
        let githubSuccess = !useGitHub; 
        let githubMsg = "Omitido por config";
        if (useGitHub) {
            const resGitHub = blogger_subirCacheAGitHub(jo);
            githubSuccess = resGitHub.success;
            githubMsg = resGitHub.message;
            if (githubSuccess) {
                console.log("✅ [Blogger Cache] GitHub: JSON publicado como respaldo.");
            } else {
                console.warn("⚠️ [Blogger Cache] GitHub falló (no crítico): " + githubMsg);
                notificarTelegramSalud("⚠️ Blogger GitHub falló: " + githubMsg, "ERROR");
            }
        }

        // --- PASO 4: Registro Persistente de Salud ---
        const health = {
            donweb: { ok: donwebSuccess, msg: donwebMsg, time: Date.now() },
            github: { ok: githubSuccess, msg: githubMsg, time: Date.now() }
        };
        PropertiesService.getScriptProperties().setProperty('BLOGGER_HEALTH_STATUS', JSON.stringify(health));

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
        if (!jsonData) {
            console.log("ℹ️ [Blogger Cache] blogger_subirCacheADonweb ejecutado sin argumentos. Intentando cargar desde Drive...");
            const cachedData = blogger_obtenerConfiguracionDesdeDrive();
            if (cachedData) {
                jsonData = JSON.parse(cachedData);
            } else {
                return { success: false, message: "No hay datos para subir (jsonData es nulo y no se encontró caché en Drive)." };
            }
        }
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
        if (!jsonData) {
            console.log("ℹ️ [Blogger Cache] blogger_subirCacheAGitHub ejecutado sin argumentos. Intentando cargar desde Drive...");
            const cachedData = blogger_obtenerConfiguracionDesdeDrive();
            if (cachedData && cachedData !== "null") {
                try {
                    jsonData = JSON.parse(cachedData);
                    if (!jsonData) throw new Error("JSON.parse retornó un objeto nulo.");
                } catch(e) {
                    return { success: false, message: "Error al parsear el caché de Drive: " + e.message };
                }
            } else {
                return { success: false, message: "No hay datos para subir (jsonData es nulo y no se encontró caché válida en Drive)." };
            }
        }
        const path = GLOBAL_CONFIG.BLOGGER.GITHUB_FILE_PATH;
        if (!path) return { success: false, message: "Falta BLOGGER_GITHUB_FILE_PATH en BD_APP_SCRIPT." };
        return subirArchivoAGitHub(jsonData, path);
    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * Obtiene la configuración (catálogo + config) directamente desde la caché en Drive.
 * @returns {Object|null} El objeto de configuración o null si no se pudo leer.
 */
function blogger_obtenerConfiguracionDesdeDrive() {
    try {
        const folderId = GLOBAL_CONFIG.BLOGGER.CACHE_FOLDER_ID;
        const fileName = GLOBAL_CONFIG.BLOGGER.GITHUB_FILE_PATH || "configuracion_sitio.json";
        if (!folderId) return null;

        const folder = DriveApp.getFolderById(folderId);
        const files = folder.getFilesByName(fileName);
        if (files.hasNext()) {
            return files.next().getBlob().getDataAsString();
        }
    } catch (e) {
        console.warn("⚠️ [Blogger Cache] No se pudo leer caché de Drive: " + e.message);
    }
    return null;
}

/**
 * Retorna el estado actual de salud de los repositorios externos.
 * @returns {Object} { donweb: {ok, msg, time}, github: {ok, msg, time} }
 */
function blogger_obtenerResumenSalud() {
    try {
        const raw = PropertiesService.getScriptProperties().getProperty('BLOGGER_HEALTH_STATUS');
        return raw ? JSON.parse(raw) : { donweb: { ok: true }, github: { ok: true } };
    } catch (e) {
        return { error: e.message };
    }
}


