/**
 * =================================================================
 * ===           MÓDULO DE SINCRONIZACIÓN RESELLER (V4.0)        ===
 * =================================================================
 * Sincronización y auditoría individual de reventa descentralizada.
 */

/**
 * [LADO PERSONAL / DESTINO]
 * Procesa la importación de un producto individual desde el Ecommerce de Blogger.
 * Registra el producto en la base de datos de AppSheet, copia las imágenes a la
 * carpeta del producto en Google Drive y ejecuta la sincronización de imágenes nativa.
 * 
 * @param {Object} payload - Objeto de solicitud recibido en doPost.
 * @return {Object} Resultado de la operación.
 */
function reseller_handleImport(payload) {
  if (!payload || !payload.producto) {
    return { success: false, message: "Payload inválido: Falta objeto 'producto'" };
  }

  const productData = payload.producto;
  const sku = String(productData.CODIGO_ID || "").trim().toUpperCase();
  if (!sku) {
    return { success: false, message: "Falta CODIGO_ID del producto" };
  }

  try {
    // 1. Registrar el producto en BD_PRODUCTOS a través de la API de AppSheet
    // Esto creará o actualizará el producto y gatillará los bots de AppSheet
    const apiResult = appsheet_crearProducto(productData);
    if (!apiResult || !apiResult.success) {
      throw new Error("Error en appsheet_crearProducto: " + (apiResult ? apiResult.error : "Respuesta vacía"));
    }

    // Asegurar persistencia de la creación en la hoja antes de buscar/crear carpeta e imágenes
    SpreadsheetApp.flush();

    // 2. Obtener o crear la carpeta del producto en Google Drive
    const folder = obtenerOCrearCarpetaProducto(sku);
    if (!folder) {
      throw new Error(`No se pudo obtener o crear la carpeta para el SKU ${sku}`);
    }

    // 3. Limpiar cualquier registro e imagen anterior de ese SKU en Google Drive y BD_PRODUCTO_IMAGENES
    // Limpieza de Drive:
    const files = folder.getFiles();
    while (files.hasNext()) {
      try {
        files.next().setTrashed(true);
      } catch (errTrash) {
        console.warn("Error enviando archivo a papelera: " + errTrash.message);
      }
    }

    // Limpieza de BD_PRODUCTO_IMAGENES:
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    const imgMapping = HeaderManager.getMapping("PRODUCT_IMAGES");
    
    if (sheetImg && imgMapping) {
      const colProdIdIdx = imgMapping["PRODUCTO_ID"];
      if (colProdIdIdx !== undefined) {
        const currentImgs = sheetImg.getDataRange().getValues();
        // Borrar filas de atrás hacia adelante para no alterar los índices
        for (let i = currentImgs.length - 1; i >= 1; i--) {
          if (String(currentImgs[i][colProdIdIdx]).trim().toUpperCase() === sku) {
            sheetImg.deleteRow(i + 1);
          }
        }
      }
    }

    // 4. Copia Inteligente de Imágenes desde Google Drive (usando el archivo_id original)
    const imagenes = payload.imagenes || [];
    let copiasExitosas = 0;
    
    imagenes.forEach(img => {
      const fileId = img.archivo_id;
      if (!fileId) {
        console.warn("Imagen sin archivo_id, se omite.");
        return;
      }
      try {
        const sourceFile = DriveApp.getFileById(fileId);
        const name = sourceFile.getName();
        sourceFile.makeCopy(name, folder);
        copiasExitosas++;
      } catch (e) {
        console.error(`Error al copiar archivo ID ${fileId}: ` + e.message);
      }
    });

    // 5. Sincronizar imágenes nativas en el ERP
    // Esto renombra los archivos en Drive a nombres estables y los registra en la hoja BD_PRODUCTO_IMAGENES
    sincronizarImagenes(sku);

    // 6. Actualizar la FUENTE a "RESELLER_SYNC" en BD_PRODUCTO_IMAGENES
    if (sheetImg && imgMapping) {
      const colProdIdIdx = imgMapping["PRODUCTO_ID"];
      const colFuenteIdx = imgMapping["FUENTE"];

      if (colProdIdIdx !== undefined && colFuenteIdx !== undefined) {
        SpreadsheetApp.flush(); // Guardar cambios de sincronizarImagenes
        const currentImgs = sheetImg.getDataRange().getValues();
        
        for (let i = 1; i < currentImgs.length; i++) {
          if (String(currentImgs[i][colProdIdIdx]).trim().toUpperCase() === sku) {
            sheetImg.getRange(i + 1, colFuenteIdx + 1).setValue("RESELLER_SYNC");
          }
        }
      }
    }

    // 7. Encolar job de inventarios en segundo plano
    reseller_scheduleInventoryJob([sku]);

    // 8. Forzar la reactivación del flag en la base de datos para notificar al dashboard del ERP
    const cache = CacheService.getScriptCache();
    cache.put("NEW_PRODUCTS_AVAILABLE", "true", 3600); // Guardar flag positivo en caché
    cache.remove("NO_NEW_PRODUCTS"); // Invalidar caché negativo

    return {
      success: true,
      message: `Producto ${sku} importado con éxito. Se copiaron ${copiasExitosas} imágenes y se inició la auditoría.`
    };

  } catch (e) {
    console.error("Error en reseller_handleImport: " + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Programa una tarea de fondo.
 */
function reseller_scheduleInventoryJob(pids) {
  const cache = CacheService.getScriptCache();
  cache.put("pending_reseller_pids", JSON.stringify(pids), 600);

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "reseller_backgroundInventoryJob")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("reseller_backgroundInventoryJob")
    .timeBased()
    .after(60000) 
    .create();
}

function reseller_backgroundInventoryJob() {
  const cache = CacheService.getScriptCache();
  const pidsRaw = cache.get("pending_reseller_pids");
  if (!pidsRaw) return;

  const pids = JSON.parse(pidsRaw);
  pids.forEach(pid => {
    try {
      if (typeof generarInventarioPorProducto === 'function') {
        generarInventarioPorProducto(pid);
        if (typeof recalcularStockDeProducto === 'function') recalcularStockDeProducto(pid);
      }
    } catch (e) {
      console.error(`Error en Job: ${e.message}`);
    }
  });

  cache.remove("pending_reseller_pids");
}


