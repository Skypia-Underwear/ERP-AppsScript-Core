/**
 * ARCHIVO: LocalSalesOptimizer.js
 * LÓGICA DE CONSOLIDACIÓN "BAKE & SERVE" PARA EL DASHBOARD
 */

/**
 * Consolida todas las ventas (Blogger + Local) en un único archivo JSON en Drive.
 * Esto permite que el Dashboard cargue instantáneamente.
 */
function tpv_consolidarVentasJson(precalculatedData = null) {
    try {
        debugLog("🍳 [Bake & Serve] Iniciando consolidación de ventas...");

        // 0. Protección contra Auth Deadlock (GCP Standard)
        if (typeof checkSystemPermissions === 'function') {
            if (!checkSystemPermissions()) {
                throw new Error("Autorización requerida. Se ha enviado una alerta a Telegram.");
            }
        }

        // 1. Obtener los datos consolidados. 
        const dashboardJsonStr = (typeof precalculatedData === 'string') ? precalculatedData : cargarDashboardVentas_HEAVY();
        const dataParsed = JSON.parse(dashboardJsonStr);

        if (!dataParsed.success) {
            throw new Error("Fallo al generar datos del dashboard: " + dataParsed.message);
        }

        // 2. Guardar en Drive (Usando Servicio Avanzado para evitar Auth Deadlock)
        const folderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;
        const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME || "erp";
        const appSlug = appName.toLowerCase().replace(/\s+/g, '-');
        const fileName = appSlug + "-ventas-dashboard.json";

        if (!folderId) throw new Error("ID de carpeta JSON (DRIVE_JSON_CONFIG_FOLDER_ID) no configurado en la BD.");

        // Búsqueda de archivo usando Drive API v3
        const query = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
        const files = Drive.Files.list({ q: query, fields: "files(id, name)" });

        let fileId;
        const blob = Utilities.newBlob(dashboardJsonStr, 'application/json', fileName);

        if (files.files && files.files.length > 0) {
            fileId = files.files[0].id;
            // Actualización industrial (Servicio Avanzado)
            Drive.Files.update({}, fileId, blob);
            debugLog(`✅ Archivo '${fileName}' actualizado en Drive (v3 Advanced).`);
        } else {
            // Creación industrial (Servicio Avanzado)
            const resource = {
                name: fileName,
                parents: [folderId],
                mimeType: 'application/json'
            };
            const newFile = Drive.Files.create(resource, blob);
            fileId = newFile.id;
            debugLog(`✅ Archivo '${fileName}' creado en Drive (v3 Advanced).`);
        }


        // 3. Invalidar Caché para que el dashboard tome lo nuevo (Turbo Mode)
        try {
            CacheService.getScriptCache().remove("DASHBOARD_VENTAS_JSON");
            debugLog("🧹 [Caché] El caché previo ha sido invalidado para refrescar el Dashboard.");
        } catch (errCache) { }

        // 4. Calcular conteo total desde la jerarquía para los logs
        let totalSales = 0;
        if (dataParsed.hierarchy) {
            Object.keys(dataParsed.hierarchy).forEach(ori => {
                Object.keys(dataParsed.hierarchy[ori]).forEach(boxId => {
                    totalSales += dataParsed.hierarchy[ori][boxId].length;
                });
            });
        }

        return {
            success: true,
            message: "Jerarquía de ventas consolidada con éxito.",
            fileId: fileId,
            count: totalSales
        };


    } catch (e) {
        const errorMsg = "❌ Error en tpv_consolidarVentasJson: " + e.message;
        debugLog(errorMsg);
        return { success: false, message: errorMsg };
    }
}

/**
 * Configura un disparador para consolidar el JSON del Dashboard cada hora.
 */
function tpv_setupDashboardConsolidatorTrigger() {
    const handler = "tpv_consolidarVentasJson";
    const triggers = ScriptApp.getProjectTriggers();

    triggers.forEach(t => {
        if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
    });

    ScriptApp.newTrigger(handler)
        .timeBased()
        .everyHours(1)
        .create();

    debugLog("⏰ Disparador de consolidación de Dashboard (1h) configurado.");
    return "Consolidación programada cada hora.";
}
