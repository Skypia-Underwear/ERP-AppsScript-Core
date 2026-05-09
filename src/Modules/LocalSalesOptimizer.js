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

        // 1. Obtener los datos consolidados. Si es un string, lo usamos. 
        // Si es un objeto (como el evento de un disparador), lo ignoramos y cargamos desde cero.
        const dashboardJsonStr = (typeof precalculatedData === 'string') ? precalculatedData : cargarDashboardVentas_HEAVY();
        const dataParsed = JSON.parse(dashboardJsonStr);

        if (!dataParsed.success) {
            throw new Error("Fallo al generar datos del dashboard: " + dataParsed.message);
        }

        // 2. Guardar en Drive
        const folderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;
        const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME || "erp";
        const appSlug = appName.toLowerCase().replace(/\s+/g, '-');
        const fileName = appSlug + "-ventas-dashboard.json";

        if (!folderId) throw new Error("ID de carpeta JSON (DRIVE_JSON_CONFIG_FOLDER_ID) no configurado en la BD.");

        const folder = DriveApp.getFolderById(folderId);
        const files = folder.getFilesByName(fileName);

        let file;
        if (files.hasNext()) {
            file = files.next();
            file.setContent(dashboardJsonStr);
            debugLog(`✅ Archivo '${fileName}' actualizado en Drive.`);
        } else {
            file = folder.createFile(fileName, dashboardJsonStr, MimeType.PLAIN_TEXT);
            debugLog(`✅ Archivo '${fileName}' creado en Drive.`);
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
            fileId: file.getId(),
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
