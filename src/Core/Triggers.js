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
    const ss = getActiveSS();
    const sheetProductos = ss.getSheetByName(SHEETS.PRODUCTS || "BD_PRODUCTOS");
    const tieneProductos = sheetProductos && sheetProductos.getLastRow() > 1;

    if (!tieneProductos) {
        // Eliminar triggers de IA previos si existen para no dejar colgada la automatización
        const triggers = ScriptApp.getProjectTriggers();
        triggers.forEach(t => {
            const fn = t.getHandlerFunction();
            if (fn === 'onEditTrigger' || fn === 'procesarTriggerColaBatch') {
                ScriptApp.deleteTrigger(t);
            }
        });
        console.warn("⚠️ Triggers de IA omitidos: Base de datos limpia o sin productos.");
        return "Omitido: Base de datos vacía.";
    }

    // 1. Asegurar persistencia del Laboratorio y la Cola Batch
    if (typeof AIService !== 'undefined') {
        if (AIService._obtenerHojaLab) AIService._obtenerHojaLab();
        if (AIService._obtenerHojaColaBatch) AIService._obtenerHojaColaBatch();
    }

    // 2. Limpiar previos para evitar ejecuciones duplicadas de la automatización de IA
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => {
        const fn = t.getHandlerFunction();
        if (fn === 'onEditTrigger' || fn === 'procesarTriggerColaBatch') {
            ScriptApp.deleteTrigger(t);
        }
    });

    // Crear Trigger por Edición (AppSheet/Spreadsheet)
    ScriptApp.newTrigger('onEditTrigger')
        .forSpreadsheet(ss)
        .onEdit()
        .create();

    // Crear Trigger por Tiempo cada 10 minutos para procesar lotes asíncronos
    ScriptApp.newTrigger('procesarTriggerColaBatch')
        .timeBased()
        .everyMinutes(10)
        .create();

    console.log("✅ Triggers de IA instalados y listos.");
}

/**
 * ⚡ TRIGGER PROGRAMADO: Consulta y procesa los lotes asíncronos de la Batch API.
 * Se ejecuta en segundo plano cada 10 minutos de forma inmune a timeouts.
 */
function procesarTriggerColaBatch() {
  try {
    if (typeof AIService === 'undefined') {
      console.warn("⚠️ AIService no cargado, cancelando trigger de cola batch.");
      return;
    }

    console.log("⏰ [Batch-Trigger] Iniciando verificación periódica de lotes pendientes...");
    const sheet = AIService._obtenerHojaColaBatch();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      console.log("⏰ [Batch-Trigger] Cola de lotes vacía.");
      return;
    }

    const headers = data[0];
    const colMap = {};
    headers.forEach((h, i) => colMap[h] = i);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const estado = row[colMap.ESTADO];
      
      if (estado === "PENDIENTE" || estado === "PROCESANDO") {
        const batchId = row[colMap.BATCH_ID];
        const imagenIdsString = row[colMap.IMAGEN_IDS];
        console.log(`🔎 [Batch-Trigger] Consultando estado para lote ${batchId}...`);

        const resObj = AIService.obtenerEstadoBatch(batchId);
        
        if (!resObj.success) {
          console.error(`❌ [Batch-Trigger] Error al consultar lote ${batchId}: ${resObj.error}`);
          continue;
        }

        const state = resObj.state;
        console.log(`🔎 [Batch-Trigger] Lote ${batchId} se encuentra en estado: ${state}`);

        if (state === "JOB_STATE_SUCCEEDED") {
          // El lote finalizó con éxito, descargar e ingestar resultados!
          sheet.getRange(i + 1, colMap.ESTADO + 1).setValue("PROCESANDO");
          SpreadsheetApp.flush(); // Guardar estado temporal

          const ingestRes = AIService.descargarResultadosBatch(batchId, imagenIdsString);
          if (ingestRes.success) {
            sheet.getRange(i + 1, colMap.ESTADO + 1).setValue("SUCCEEDED");
          } else {
            sheet.getRange(i + 1, colMap.ESTADO + 1).setValue("FAILED");
            sheet.getRange(i + 1, colMap.ERROR_DETALLE + 1).setValue(ingestRes.error);
          }
        } else if (state === "JOB_STATE_FAILED") {
          // El lote falló en los servidores de Google
          sheet.getRange(i + 1, colMap.ESTADO + 1).setValue("FAILED");
          const errorMsg = resObj.raw?.error?.message || "Fallo en los servidores de Google Gemini.";
          sheet.getRange(i + 1, colMap.ERROR_DETALLE + 1).setValue(errorMsg);
          console.error(`❌ [Batch-Trigger] Lote ${batchId} reportó fallo: ${errorMsg}`);
        } else if (state === "JOB_STATE_CANCELLED") {
          sheet.getRange(i + 1, colMap.ESTADO + 1).setValue("CANCELLED");
        } else {
          // Sigue en curso (JOB_STATE_PENDING o JOB_STATE_RUNNING)
          if (estado !== "PROCESANDO" && state === "JOB_STATE_RUNNING") {
            sheet.getRange(i + 1, colMap.ESTADO + 1).setValue("PROCESANDO");
          }
        }
      }
    }
    console.log("⏰ [Batch-Trigger] Verificación de lotes finalizada.");
  } catch (e) {
    console.error(`❌ [Batch-Trigger] Error fatal en disparador: ${e.message}`);
  }
}
