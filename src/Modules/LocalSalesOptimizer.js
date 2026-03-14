/**
 * ARCHIVO: LocalSalesOptimizer.js
 * LÓGICA DE CONSOLIDACIÓN "BAKE & SERVE" PARA EL DASHBOARD
 */

/**
 * Consolida todas las ventas (Blogger + Local) en un único archivo JSON en Drive.
 * Esto permite que el Dashboard cargue instantáneamente.
 */
function tpv_consolidarVentasJson() {
    try {
        debugLog("🍳 [Bake & Serve] Iniciando consolidación de ventas...");

        // 1. Obtener los datos consolidados usando la lógica existente de Dashboard.js
        // Forzamos HEAVY para que no lea el JSON viejo que el mismo genera
        const dashboardJsonStr = cargarDashboardVentas_HEAVY();
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

        // 3. Notificar éxito
        return {
            success: true,
            message: "Ventas consolidadas con éxito.",
            fileId: file.getId(),
            count: dataParsed.data ? dataParsed.data.length : 0
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
