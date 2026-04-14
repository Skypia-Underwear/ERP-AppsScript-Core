/**
 * ⚡ TRIGGER DE AUTOMATIZACIÓN (MODO MANOS LIBRES)
 * Orquestación: Subida -> Generar Prompt -> Renderizar con Imagen 3
 */

function onEditTrigger(e) {
    const sheet = e.source.getActiveSheet();
    if (sheet.getName() !== SHEETS.PRODUCT_IMAGES) return;

    const range = e.range;
    const mapping = HeaderManager.getMapping("PRODUCT_IMAGES");
    const colArchivo = mapping["ARCHIVO_ID"] + 1;

    // Detectamos inserción de nueva imagen (AppSheet escribe el ID del archivo)
    if (range.getColumn() === colArchivo && e.value) {
        const row = range.getRow();
        const imagenId = sheet.getRange(row, mapping["IMAGEN_ID"] + 1).getValue();

        try {
            console.log(`🚀 Iniciando flujo automático para ${imagenId}...`);
            // generarSuperPrompt ahora dispara automáticamente Imagen 3 si tiene éxito
            const resPromptStr = generarSuperPrompt(imagenId, 'ecommerce');
            const resPrompt = JSON.parse(resPromptStr);

            if (resPrompt.success) {
                console.log(`✅ Automatización core completada para: ${imagenId}`);
            } else {
                throw new Error(resPrompt.error || "Fallo en la automatización core.");
            }
        } catch (err) {
            // REGISTRO EXPLÍCITO DEL ERROR (Grito de Error)
            console.error(`❌ FALLO EN AUTOMATIZACIÓN (ID: ${imagenId}): ${err.message}`);
        }
    }
}

/**
 * Instalador de los disparadores del proyecto.
 */
function instalarTriggersIA() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Limpiar previos para evitar ejecuciones duplicadas
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => ScriptApp.deleteTrigger(t));

    // Crear Trigger por Edición (AppSheet/Spreadsheet)
    ScriptApp.newTrigger('onEditTrigger')
        .forSpreadsheet(ss)
        .onEdit()
        .create();

    console.log("✅ Triggers de IA instalados y listos.");
}
