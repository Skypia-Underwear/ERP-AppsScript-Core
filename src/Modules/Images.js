// =================================================================
// ===      LÓGICA DE IMÁGENES (MASTER FINAL RESTAURADO)         ===
// =================================================================

function getImagesSpreadsheet() { return SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID); }
function getUiSafe() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }

// -----------------------------------------------------------------
// --- 1. API & HANDLERS
// -----------------------------------------------------------------

function handleImageRequest(params) {
  const resultado = ejecutarAccionDeImagen(params);
  return ContentService.createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

function procesarSincronizacion(codigo) {
  const logArray = [];
  try {
    if (!codigo) throw new Error("Código nulo");
    sincronizarImagenes(codigo, logArray);
    return { success: true, message: `✅ Sincronización de '${codigo}' correcta.`, logs: logArray };
  } catch (error) {
    logArray.push(`❌ ERROR: ${error.message}`);
    return { success: false, message: error.message, logs: logArray };
  }
}

function ejecutarSincronizacionGlobal() {
  const logArray = [];
  try {
    // Limpiar triggers residuales de ejecuciones previas
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'continuarSincronizacionGlobal') ScriptApp.deleteTrigger(t);
    });
    // Resetear indice de progreso
    PropertiesService.getScriptProperties().deleteProperty('SYNC_GLOBAL_INDEX');

    sincronizarImagenes(null, logArray);

    // Si completo todo sin pausar, notificar
    const pending = PropertiesService.getScriptProperties().getProperty('SYNC_GLOBAL_INDEX');
    if (!pending) {
      const ui = getUiSafe();
      if (ui) ui.alert('Sincronizacion global finalizada.\nRevisa los logs.');
    }
    return { success: true, message: pending ? "Batch parcial, continuara automaticamente..." : "Global Sync Completa", logs: logArray };
  } catch (e) {
    if (getUiSafe()) getUiSafe().alert('Error: ' + e.message);
    return { success: false, message: e.message, logs: logArray };
  }
}

function continuarSincronizacionGlobal() {
  // Auto-limpiar el trigger que nos invoco
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'continuarSincronizacionGlobal') ScriptApp.deleteTrigger(t);
  });

  const logArray = [];
  try {
    sincronizarImagenes(null, logArray);

    // Verificar si termino o necesita otro batch
    const pending = PropertiesService.getScriptProperties().getProperty('SYNC_GLOBAL_INDEX');
    if (!pending) {
      console.log('Sincronizacion global completada tras multiples batches.');
    } else {
      console.log('Batch parcial completado. Indice actual: ' + pending + '. Esperando siguiente trigger...');
    }
  } catch (e) {
    console.error('Error en continuarSincronizacionGlobal: ' + e.message);
  }
}

// -----------------------------------------------------------------
// --- 2. GESTIÓN DE SUBIDA (ANTI-DUPLICADOS)
// -----------------------------------------------------------------

function procesarSubidaDesdeDashboard(sku, fileData, fileName, mimeType, carpetaId, noSync = false, originalFileData = null) {
  try {
    if (!sku) throw new Error("Error crítico: No se recibió SKU.");

    // VALIDACIÓN DE TIPO DE ARCHIVO
    const allowedMimes = ['image/', 'video/'];
    if (!allowedMimes.some(t => mimeType.startsWith(t))) {
      throw new Error(`Tipo de archivo no permitido: ${mimeType}. Solo se permiten imágenes y videos.`);
    }

    let folder;

    // 1. Intentar usar ID directo
    if (carpetaId && carpetaId !== "undefined" && carpetaId !== "") {
      try { folder = DriveApp.getFolderById(carpetaId); } catch (e) { folder = null; }
    }

    // 2. Respaldo: Buscar en DB
    if (!folder) {
      folder = obtenerOCrearCarpetaProducto(sku);
    }

    // 3. Guardar Imagen
    let blob;
    try {
      const decoded = Utilities.base64Decode(fileData);
      blob = Utilities.newBlob(decoded, mimeType, fileName);
    } catch (blobErr) {
      throw new Error(`Error al procesar archivo (posiblemente corrupto o muy pesado): ${blobErr.message}`);
    }
    const file = folder.createFile(blob);

    // 4. GUARDAR ORIGINAL EN SUB-CARPETA JPG (Si aplica y se recibe)
    if (originalFileData && mimeType.startsWith('image/')) {
      try {
        const subFolder = obtenerOCrearSubcarpeta(folder, "JPG");
        const decodedOri = Utilities.base64Decode(originalFileData);
        const baseName = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
        const ext = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
        const oriFileName = `${sku}-${baseName}-ORI.${ext}`;

        // Evitar duplicar originales si ya existen (opcional)
        const oldOris = subFolder.getFilesByName(oriFileName);
        if (!oldOris.hasNext()) {
          subFolder.createFile(Utilities.newBlob(decodedOri, mimeType, oriFileName));
        }
      } catch (eOri) {
        console.warn("No se pudo guardar respaldo original: " + eOri.message);
      }
    }

    // Sincronizar (con pequeño delay para que Drive indexe)
    if (!noSync) {
      const waitTime = (mimeType && mimeType.includes('video')) ? 5000 : 2000;
      Utilities.sleep(waitTime);
      sincronizarImagenes(sku);
    }

    // NUEVO: Recuperar el IMAGEN_ID generado en el sync para devolverlo al dashboard
    let registeredId = null;
    try {
      if (!noSync) {
        const ss = getImagesSpreadsheet();
        const imgMap = HeaderManager.getMapping("PRODUCT_IMAGES");
        const sheet = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
        if (imgMap && sheet) {
          const fid = file.getId();
          const data = sheet.getDataRange().getValues();
          const row = data.find(r => String(r[imgMap["ARCHIVO_ID"]]) === fid);
          if (row) registeredId = row[imgMap["IMAGEN_ID"]];
        }
      }
    } catch (errSync) { console.warn("Error recuperando ID tras subida: " + errSync.message); }

    return {
      success: true,
      message: "Carga completada.",
      details: [
        `📂 Carpeta: ${folder.getName()}`,
        `📄 Archivo: ${fileName} (${(blob.getBytes().length / 1024).toFixed(1)} KB)`
      ],
      fileId: file.getId(),
      imagenId: registeredId // Este ID permite disparar el análisis forense inmediatamente
    };

  } catch (e) {
    return { success: false, message: "Error Backend: " + e.message };
  }
}

/**
 * Obtiene la metadata más reciente de un producto directamente desde la hoja de cálculo.
 * Útil para sincronizar el WOO_ID si este cambió en AppSheet pero el JSON local está obsoleto.
 * @param {string} sku - El código del producto a buscar.
 * @return {Object} - Objeto con woo_id, carpeta_id y nombre.
 */
function obtenerMetadataProductoActualizada(sku) {
  try {
    const ss = getImagesSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.PRODUCTS);
    const mapping = HeaderManager.getMapping("PRODUCTS");

    if (!sheet || !mapping || !mapping["CODIGO_ID"]) {
      return { success: false, error: "Error de configuración de mapeo de productos." };
    }

    const data = sheet.getDataRange().getValues();
    const idxSku = mapping["CODIGO_ID"];
    const idxWoo = mapping["WOO_ID"];
    const idxFolder = mapping["CARPETA_ID"];
    const idxNombre = mapping["NOMBRE"];

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxSku]) === String(sku)) {
        return {
          success: true,
          sku: sku,
          woo_id: idxWoo !== undefined ? String(data[i][idxWoo]) : "",
          carpeta_id: idxFolder !== undefined ? String(data[i][idxFolder]) : "",
          nombre: idxNombre !== undefined ? String(data[i][idxNombre]) : ""
        };
      }
    }
    return { success: false, error: "Producto no encontrado en la base de datos." };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function obtenerOCrearCarpetaProducto(sku) {
  const ss = getImagesSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PRODUCTS);
  const mapping = HeaderManager.getMapping("PRODUCTS");

  if (!sheet || !mapping) throw new Error("Falta hoja de productos o mapeo.");

  const idxSku = mapping["CODIGO_ID"];
  const idxFolder = mapping["CARPETA_ID"];
  if (idxSku === undefined) throw new Error("Falta columna CODIGO_ID en Productos");

  // 1. Búsqueda Robusta con TextFinder (evita problemas si AppSheet movió filas)
  const finder = sheet.createTextFinder(String(sku).trim()).matchEntireCell(true).matchCase(false);
  const foundRange = finder.findNext();
  if (!foundRange) throw new Error(`Producto ${sku} no encontrado en la base de datos.`);

  const rowIdx = foundRange.getRow();

  // 2. Lectura rápida del ID actual
  let folderId = "";
  if (idxFolder !== undefined) {
    folderId = String(sheet.getRange(rowIdx, idxFolder + 1).getValue()).trim();
  }

  // Si ya tiene carpeta válida, retornarla
  if (folderId && folderId !== "" && folderId !== "undefined") {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      console.warn(`⚠️ ID de carpeta inválido en BD para ${sku}: ${folderId}. Se buscará/creará una nueva.`);
    }
  }

  // 3. Lock para procesos concurrentes
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // 20s de gracia

    // 4. Re-verificar tras el lock por si otro proceso lo creó justo ahora
    if (idxFolder !== undefined) {
      folderId = String(sheet.getRange(rowIdx, idxFolder + 1).getValue()).trim();
      if (folderId && folderId !== "" && folderId !== "undefined") {
        try { return DriveApp.getFolderById(folderId); } catch (e) { }
      }
    }

    // 5. Búsqueda en Drive por nombre (Evitar duplicados si el ID no se guardó)
    const parentId = GLOBAL_CONFIG.DRIVE.PARENT_FOLDER_ID;
    if (!parentId) throw new Error("ID de carpeta Padre no configurado.");
    const parent = DriveApp.getFolderById(parentId);

    const existingFolders = parent.getFoldersByName(String(sku).trim());
    let theFolder;

    if (existingFolders.hasNext()) {
      theFolder = existingFolders.next();
      console.log(`⏳ Carpeta rescatada desde Drive por nombre: ${sku}`);
    } else {
      theFolder = parent.createFolder(String(sku).trim());
      console.log(`📁 Nueva carpeta creada para: ${sku}`);
    }

    // 6. Guardado Persistente (Asegurando la fila correcta)
    if (idxFolder !== undefined) {
      sheet.getRange(rowIdx, idxFolder + 1).setValue(theFolder.getId());
      SpreadsheetApp.flush(); // Asegurar persistencia física
      console.log(`✅ CARPETA_ID guardado para ${sku} en fila ${rowIdx}`);
    }

    return theFolder;
  } catch (e) {
    throw new Error("Error en obtención/creación de carpeta: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Elimina la carpeta de imágenes de un producto en Drive cuando se borra desde AppSheet.
 * Como AppSheet borra la fila antes de enviar el webhook, buscamos la carpeta por su nombre (SKU)
 * dentro de la carpeta padre principal.
 * @param {string} sku - El código del producto.
 */
function eliminarCarpetaProducto(sku) {
  try {
    if (!sku) throw new Error("SKU no proporcionado");

    // El nombre de la carpeta es exactamente el SKU
    const folderName = String(sku).trim();

    const parentId = GLOBAL_CONFIG.DRIVE.PARENT_FOLDER_ID;
    if (!parentId) throw new Error("ID de carpeta Padre no configurado en GLOBAL_CONFIG.");

    const parentFolder = DriveApp.getFolderById(parentId);

    // Buscar la carpeta dentro de la matriz de imágenes
    const folders = parentFolder.getFoldersByName(folderName);

    let deletedCount = 0;
    while (folders.hasNext()) {
      const folder = folders.next();
      folder.setTrashed(true); // Envía a la papelera
      deletedCount++;
    }

    if (deletedCount > 0) {
      console.log(`🗑️ Se eliminaron ${deletedCount} carpeta(s) para el producto ${sku}`);
      return { success: true, message: `Carpeta(s) de ${sku} movida(s) a la papelera.` };
    } else {
      console.log(`ℹ️ No se encontró ninguna carpeta llamada ${sku} para eliminar.`);
      return { success: true, message: `No había carpeta para el producto ${sku}.` };
    }

  } catch (error) {
    console.error(`❌ Error al eliminar carpeta de ${sku}: ${error.message}`);
    return { success: false, message: `Error al eliminar carpeta: ${error.message}` };
  }
}

// -----------------------------------------------------------------
// --- 3. SINCRONIZACIÓN MAESTRA
// -----------------------------------------------------------------

function sincronizarImagenes(productoIdFiltro = null, logArray = null) {
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => console.log(msg);
  const startTime = Date.now();
  const timestamp = new Date(); // Definición global del timestamp para la sesión
  const MAX_EXECUTION_MS = 2 * 60 * 1000; // 2 minutos — margen de seguridad vs los 6 min de Apps Script
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { log('⚠️ Servidor ocupado.'); return; }

  try {
    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
    const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME;
    const sheetName = SHEETS.PRODUCT_IMAGES;
    const dataImg = sheetImg.getDataRange().getValues();
    const headersImg = dataImg[0];

    const col = HeaderManager.getMapping("PRODUCT_IMAGES");
    if (!col) throw new Error("Faltan columnas críticas en BD_PRODUCTO_IMAGENES");

    let productosAProcesar = [];
    const prodMapping = HeaderManager.getMapping("PRODUCTS");
    if (!prodMapping) throw new Error("No se pudo obtener el mapeo de productos.");

    const prodDataAll = sheetProd.getDataRange().getValues();
    const prodHeaders = prodDataAll[0].map(h => String(h).trim().toUpperCase());
    const prodData = prodDataAll.slice(1);

    const idxProdSku = prodMapping["CODIGO_ID"];
    const idxProdFolder = prodMapping["CARPETA_ID"];

    if (productoIdFiltro) {
      const row = prodData.find(r => String(r[idxProdSku]) === String(productoIdFiltro));
      if (row) {
        let folderId = idxProdFolder > -1 ? String(row[idxProdFolder]).trim() : "";
        let folder = null;
        try {
          if (folderId && folderId !== "undefined" && folderId !== "") {
            folder = DriveApp.getFolderById(folderId);
          }
        } catch (e) {
          log(`⚠️ Carpeta ID ${folderId} no existe o no es accesible para ${productoIdFiltro}. Buscando o creando.`);
          folder = null;
        }

        if (!folder) {
          try {
            log(`🔍 Carpeta faltante o inválida para SKU "${productoIdFiltro}". Intentando rescatar o crear en Drive...`);
            folder = obtenerOCrearCarpetaProducto(productoIdFiltro);
            folderId = folder.getId();
          } catch (errCreate) {
            log(`❌ Error crítico al rescatar o crear carpeta para ${productoIdFiltro}: ${errCreate.message}`);
          }
        }

        if (folder) {
          productosAProcesar.push({ sku: String(row[idxProdSku]), folderId: folderId });
        }
      }
    } else {
      productosAProcesar = prodData
        .filter(r => r[idxProdSku] && idxProdFolder > -1 && r[idxProdFolder])
        .map(r => ({ sku: String(r[idxProdSku]), folderId: r[idxProdFolder] }));
    }

    // BATCH PROCESSING: Recuperar índice de progreso en modo global
    let startIndex = 0;
    if (!productoIdFiltro) {
      const savedIndex = PropertiesService.getScriptProperties().getProperty('SYNC_GLOBAL_INDEX');
      if (savedIndex) {
        startIndex = parseInt(savedIndex) || 0;
        log(`🔄 Retomando sincronización desde índice ${startIndex}/${productosAProcesar.length}`);
      }
    }

    const nuevasFilas = [];
    const actualizaciones = []; // Array { rowIndex, rowData }
    const filasBorrar = [];
    const existingRoutesMap = new Set();
    const dbFilesMap = new Map();

    // --- NUEVO: Asegurar columnas de metadatos ---
    if (col['PESO_ARCHIVO'] === undefined || col['FORMATO_ARCHIVO'] === undefined) {
      log("🛠 Expandiendo base de datos con columnas de metadatos...");
      const lastC = sheetImg.getLastColumn();
      const headers = sheetImg.getRange(1, 1, 1, lastC).getValues()[0];
      const tipoIdx = headers.indexOf("TIPO_ARCHIVO");
      if (tipoIdx !== -1) {
        sheetImg.insertColumnsAfter(tipoIdx + 1, 2);
        sheetImg.getRange(1, tipoIdx + 2, 1, 2).setValues([["PESO_ARCHIVO", "FORMATO_ARCHIVO"]]);
        HeaderManager.clearCache(); // Regenerar mapeo
        return sincronizarImagenes(productoIdFiltro, logArray); // Reiniciar sync con nuevo mapeo
      }
    }

    for (let i = 1; i < dataImg.length; i++) {
      const fId = String(dataImg[i][col['ARCHIVO_ID']]);
      const pId = String(dataImg[i][col['PRODUCTO_ID']]).trim();
      const ruta = String(dataImg[i][col['IMAGEN_RUTA']]);

      if (productoIdFiltro && pId !== String(productoIdFiltro)) continue;

      if (fId) dbFilesMap.set(fId, i + 1);
      if (pId && ruta) existingRoutesMap.add(`${pId}|${ruta}`);
    }

    const archivosVistosEnDrive = new Set();

    for (let pIdx = startIndex; pIdx < productosAProcesar.length; pIdx++) {
      const prod = productosAProcesar[pIdx];

      // VERIFICAR TIMEOUT (solo en modo global)
      if (!productoIdFiltro && (Date.now() - startTime) > MAX_EXECUTION_MS) {
        log(`⏸️ Timeout preventivo. Procesados ${pIdx}/${productosAProcesar.length}. Guardando progreso...`);

        // Guardar cambios parciales - Inserciones
        if (nuevasFilas.length > 0) {
          sheetImg.getRange(sheetImg.getLastRow() + 1, 1, nuevasFilas.length, headersImg.length).setValues(nuevasFilas);
          log(`✅ +${nuevasFilas.length} nuevas guardadas en batch parcial.`);
        }
        // Guardar cambios parciales - Actualizaciones
        if (actualizaciones.length > 0) {
          actualizaciones.forEach(u => {
            const originalRowData = dataImg[u.rowIndex - 1];
            const setValU = (c, v) => { if (col[c] !== undefined) u.rowData[col[c]] = v; };
            setValU('IMAGEN_ID', originalRowData[col['IMAGEN_ID']]);
            setValU('ESTADO', originalRowData[col['ESTADO']]);
            const oldPrompt = originalRowData[col['PROMPT']];
            const oldCosto = originalRowData[col['COSTO']];
            const oldFuente = originalRowData[col['FUENTE']];
            if (oldPrompt && !u.rowData[col['PROMPT']]) setValU('PROMPT', oldPrompt);
            if (oldCosto && !u.rowData[col['COSTO']]) setValU('COSTO', oldCosto);
            if (oldFuente && (oldFuente.includes('AI') || oldFuente.includes('Gemini'))) setValU('FUENTE', oldFuente);
            sheetImg.getRange(u.rowIndex, 1, 1, headersImg.length).setValues([u.rowData]);
          });
          log(`🔄 ${actualizaciones.length} actualizadas en batch parcial.`);
        }
        SpreadsheetApp.flush();

        // Persistir índice y programar continuación
        PropertiesService.getScriptProperties().setProperty('SYNC_GLOBAL_INDEX', String(pIdx));
        ScriptApp.newTrigger('continuarSincronizacionGlobal')
          .timeBased().after(60 * 1000).create();
        log(`⏰ Trigger programado para continuar en 1 minuto desde índice ${pIdx}.`);
        return; // Salir limpiamente — el finally liberará el lock
      }

      try {
        const folder = DriveApp.getFolderById(prod.folderId);
        const files = folder.getFiles();
        log(`📂 Escaneando carpeta: ${prod.sku} (${folder.getName()})...`);
        let contadorImagenes = 1;
        // 1. OBTENER Y CLASIFICAR ARCHIVOS
        const archivosEnCarpeta = [];
        while (files.hasNext()) archivosEnCarpeta.push(files.next());
        log(`ℹ️ Encontrados ${archivosEnCarpeta.length} archivos en Drive.`);

        // Ordenar por: 1. ORDEN, 2. Si es Portada, 3. Fecha de creación
        archivosEnCarpeta.sort((a, b) => {
          const rowIdxA = dbFilesMap.get(a.getId());
          const rowIdxB = dbFilesMap.get(b.getId());

          const ordenA = rowIdxA ? (parseInt(dataImg[rowIdxA - 1][col['ORDEN']]) || 999) : 999;
          const ordenB = rowIdxB ? (parseInt(dataImg[rowIdxB - 1][col['ORDEN']]) || 999) : 999;

          if (ordenA !== ordenB) return ordenA - ordenB;

          const isPortadaA = rowIdxA ? !!dataImg[rowIdxA - 1][col['PORTADA']] : (a.getName().toLowerCase().includes('portada') || a.getName().includes('_01.'));
          const isPortadaB = rowIdxB ? !!dataImg[rowIdxB - 1][col['PORTADA']] : (b.getName().toLowerCase().includes('portada') || b.getName().includes('_01.'));

          if (isPortadaA && !isPortadaB) return -1;
          if (!isPortadaA && isPortadaB) return 1;

          return a.getDateCreated() - b.getDateCreated();
        });

        // 2. RENOMBRADO ESTABLE (Evita cambios al reordenar)
        // Fase A: Nombres temporales SOLO para archivos que necesitan renombrarse
        archivosEnCarpeta.forEach(file => {
          if (!file.getMimeType().includes('video') && !file.getName().toLowerCase().includes('_thumb.jpg')) {
            const currentName = file.getName();
            const shortId = file.getId().substring(0, 5);
            const expectedPrefix = `${prod.sku}-${shortId}`;
            // Solo renombrar a TMP si el nombre va a cambiar (no ya es estable)
            if (!currentName.startsWith(expectedPrefix)) {
              const currentExt = currentName.includes('.') ? '.' + currentName.split('.').pop() : '';
              try { file.setName("TMP_" + file.getId().substring(0, 8) + currentExt); } catch (e) { }
            }
          }
        });

        // Fase B: Nombres finales ESTABLES (SKU-ShortID)
        archivosEnCarpeta.forEach(file => {
          const fileId = file.getId();
          const mime = file.getMimeType();
          let fileName = file.getName();

          if (fileName.toLowerCase().includes('_thumb.jpg')) {
            archivosVistosEnDrive.add(fileId);
            return;
          }

          archivosVistosEnDrive.add(fileId);
          const extension = fileName.includes('.') ? fileName.split('.').pop() : (mime.includes('video') ? 'mp4' : 'jpg');
          if (!mime.includes('folder')) {
            // ESTRATEGIA ESTABLE: SKU + Hash del ID. El nombre NO cambia si cambia el orden en la galería.
            const shortId = fileId.substring(0, 5);
            const nuevoNombreBase = prod.sku + '-' + shortId + '.' + extension;

            try {
              if (mime.includes('video')) {
                const oldBase = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
                const newBase = nuevoNombreBase.substring(0, nuevoNombreBase.lastIndexOf('.'));
                const oldThumbName = oldBase + '_thumb.jpg';
                const newThumbName = newBase + '_thumb.jpg';
                const oldThumbs = folder.getFilesByName(oldThumbName);
                if (oldThumbs.hasNext()) try { oldThumbs.next().setName(newThumbName); } catch (e) { }
              }
              if (fileName !== nuevoNombreBase) {
                file.setName(nuevoNombreBase);
                log(`   📄 Archivo ${contadorImagenes}: ${nuevoNombreBase} (Estable)`);
              }
              fileName = nuevoNombreBase;
            } catch (e) { log(`   ⚠️ Error renombrando ${fileName}: ${e.message}`); }
            contadorImagenes++;
          }

          let publicUrl = `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(sheetName)}&fileName=${encodeURIComponent(`${SHEETS.PRODUCT_IMAGES}_Images/${prod.sku}/${fileName}`)}`;
          let thumbnailUrl = "";

          if (mime.includes('video')) {
            try {
              const baseName = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
              const thumbName = baseName + '_thumb.jpg';
              const thumbs = folder.getFilesByName(thumbName);
              if (thumbs.hasNext()) {
                const tf = thumbs.next();
                archivosVistosEnDrive.add(tf.getId());
                thumbnailUrl = `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(sheetName)}&fileName=${encodeURIComponent(`${SHEETS.PRODUCT_IMAGES}_Images/${prod.sku}/${thumbName}`)}&v=${tf.getId()}`;
              } else {
                let thumbBlob = null;
                for (let i = 0; i < 3; i++) {
                  try {
                    thumbBlob = file.getThumbnail();
                    if (thumbBlob) break;
                  } catch (e) { }
                  Utilities.sleep(2000);
                }
                if (thumbBlob) {
                  const newThumbFile = folder.createFile(thumbBlob).setName(thumbName);
                  archivosVistosEnDrive.add(newThumbFile.getId());
                  thumbnailUrl = `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(sheetName)}&fileName=${encodeURIComponent(`${SHEETS.PRODUCT_IMAGES}_Images/${prod.sku}/${thumbName}`)}&v=${newThumbFile.getId()}`;
                }
              }
            } catch (e) { }
          } else {
            thumbnailUrl = publicUrl;
          }

          const relativePath = `${SHEETS.PRODUCT_IMAGES}_Images/${prod.sku}/${fileName}`;
          const yaExistePorId = dbFilesMap.has(fileId);
          const rowIndex = yaExistePorId ? dbFilesMap.get(fileId) : null;

          // RECUPERAR ORDEN EXISTENTE O ASIGNAR UNO SECUENCIAL
          let ordenFinal = contadorImagenes;
          if (yaExistePorId && rowIndex) {
            const ordenDB = parseInt(dataImg[rowIndex - 1][col['ORDEN']]);
            if (!isNaN(ordenDB) && ordenDB !== 999 && ordenDB !== 0) {
              ordenFinal = ordenDB;
            }
          }

          const row = new Array(headersImg.length).fill("");
          const setVal = (c, v) => { if (col[c] !== undefined) row[col[c]] = v; };

          setVal('PRODUCTO_ID', prod.sku);
          setVal('CARPETA_ID', prod.folderId);
          setVal('IMAGEN_RUTA', relativePath);
          setVal('ARCHIVO_ID', fileId);
          setVal('URL', publicUrl);
          setVal('FECHA_CARGA', timestamp);
          setVal('FUENTE', 'Sistema Web');

          // REGLA: Conservar el estado de PORTADA preexistente, 
          // O marcar el primer archivo nuevo (contadorImagenes===1) como portada SOLO si no existía el registro.
          let esPortada = false;
          if (yaExistePorId && rowIndex) {
            esPortada = String(dataImg[rowIndex - 1][col['PORTADA']]).toUpperCase() === 'TRUE';
          } else if (ordenFinal === 1) {
            esPortada = true;
          }
          setVal('PORTADA', esPortada);

          setVal('ORDEN', ordenFinal);

          let tipoArchivo = 'otro';
          if (mime.includes('image')) tipoArchivo = 'imagen';
          else if (mime.includes('video')) tipoArchivo = 'video';
          setVal('TIPO_ARCHIVO', tipoArchivo);
          setVal('PESO_ARCHIVO', file.getSize());
          setVal('FORMATO_ARCHIVO', extension.toUpperCase());
          setVal('THUMBNAIL_URL', thumbnailUrl);

          if (yaExistePorId) {
            actualizaciones.push({ rowIndex: rowIndex, rowData: row });
          } else {
            setVal('IMAGEN_ID', `IMG-${Date.now()}-${contadorImagenes}-${Math.floor(Math.random() * 1000)}`);
            setVal('ESTADO', true);
            nuevasFilas.push(row);
          }
          contadorImagenes++;
        });
      } catch (err) { log(`⚠️ Error carpeta ${prod.sku}: ${err.message}`); }
    }

    // Si llegamos aquí en modo global, terminamos TODO — limpiar estado
    if (!productoIdFiltro) {
      PropertiesService.getScriptProperties().deleteProperty('SYNC_GLOBAL_INDEX');
    }

    // SEPARACIÓN DE CONCERNS: Solo auditar y borrar huérfanos en modo unitario (1 SKU)
    // En modo global, omitimos el borrado para maximizar velocidad con +7000 archivos (según diseño original)
    if (productoIdFiltro) {
      // En lugar de usar dbFilesMap (que solo tiene registros con ARCHIVO_ID), 
      // barremos dataImg para encontrar TODOS los registros que pertenecen a este SKU.
      for (let i = 1; i < dataImg.length; i++) {
        const pId = String(dataImg[i][col['PRODUCTO_ID']]).trim();
        if (pId === String(productoIdFiltro)) {
          const fId = String(dataImg[i][col['ARCHIVO_ID']]);
          const rowIndex = i + 1;
          // Si el ID de archivo no se vio en Drive (o si no tiene ID), es un huérfano
          if (!archivosVistosEnDrive.has(fId)) {
            filasBorrar.push(rowIndex);
          }
        }
      }
    }

    if (nuevasFilas.length > 0) {
      sheetImg.getRange(sheetImg.getLastRow() + 1, 1, nuevasFilas.length, headersImg.length).setValues(nuevasFilas);
      const videos = nuevasFilas.filter(r => r[col['TIPO_ARCHIVO']] === 'video').length;
      log(`✅ +${nuevasFilas.length} nuevas${videos > 0 ? ` (incluye ${videos} video)` : ""}.`);

      // ALERTA DE AUDITORÍA: Si es sincronización unitaria y hay nuevas, avisar
      if (productoIdFiltro) {
        try {
          img_marcarPendienteAuditoria(productoIdFiltro, nuevasFilas.length);
          log(`🔔 Notificación de auditoría enviada.`);
        } catch (eNotif) {
          log(`⚠️ No se pudo enviar notificación: ${eNotif.message}`);
        }
      }
    }

    // APLICAR ACTUALIZACIONES (Lote o Individual)
    if (actualizaciones.length > 0) {
      // Optimizacion: Escribir uno por uno es lento, pero seguro para mantener indices.
      // Dado que filasBorrar se hace al final, los indices son validos.
      actualizaciones.forEach(u => {
        // Solo actualizamos columnas criticas, preservando IMAGEN_ID (Col A / Index 0 generalmente)
        // Para simplificar: Sobreescribimos todo MENOS IMAGEN_ID y ESTADO si queremos preservar.
        // Pero nuestra 'row' tiene vacio en IMAGEN_ID.
        // Estrategia: Leer fila actual? Lento.
        // Estrategia Mejor: 'row' tiene todo calculado. Solo IMAGEN_ID falta.
        // No es vital actualizar IMAGEN_ID. Lo dejamos.
        // Mapeamos row a columnas reales.

        // Vamos a actualizar celdas especificas para ser eficientes? No, setValues es row-based.
        // Hack: Leer el IMAGEN_ID de la hoja es costoso en bucle.
        // Como 'dataImg' ya tiene los valores, podemos recuperar el IMAGEN_ID viejo de memoria!
        const originalRowData = dataImg[u.rowIndex - 1];
        const oldID = originalRowData[col['IMAGEN_ID']];
        const oldEstado = originalRowData[col['ESTADO']];
        const oldPrompt = originalRowData[col['PROMPT']];
        const oldCosto = originalRowData[col['COSTO']];
        const oldFuente = originalRowData[col['FUENTE']];
        const oldAnalisis = originalRowData[col['ANALISIS_FORENSE']];
        const oldSyncWc = originalRowData[col['SYNC_WC']];

        // Restaurar metadatos críticos de la IA y sincronización externa
        const setVal = (c, v) => { if (col[c] !== undefined && v !== undefined && v !== "") u.rowData[col[c]] = v; };

        setVal('IMAGEN_ID', oldID);
        setVal('ESTADO', oldEstado);
        setVal('ANALISIS_FORENSE', oldAnalisis);
        setVal('SYNC_WC', oldSyncWc);

        // Prevenir reseteo indiscriminado de Portada en el ciclo de DB Update
        const oldPortada = originalRowData[col['PORTADA']];
        if (oldPortada !== undefined && oldPortada !== "") {
          setVal('PORTADA', oldPortada);
        }

        // Solo restauramos Prompt y Costo si ya existían y la nueva fila viene vacía (que es siempre en el sync base)
        if (oldPrompt && !u.rowData[col['PROMPT']]) setVal('PROMPT', oldPrompt);
        if (oldCosto && !u.rowData[col['COSTO']]) setVal('COSTO', oldCosto);

        // Si la fuente era Gemini, la respetamos. Si era manual, el sync pone 'Sistema Web' por defecto pero podemos ser más listos
        if (oldFuente && (oldFuente.includes('AI') || oldFuente.includes('Gemini'))) setVal('FUENTE', oldFuente);

        sheetImg.getRange(u.rowIndex, 1, 1, headersImg.length).setValues([u.rowData]);
      });
      log(`🔄 ${actualizaciones.length} actualizadas.`);
    }
    // REGLA DE SEGURIDAD PARA ELIMINACIÓN:
    // 1. En modo individual (Filtro): Permitimos borrar todo si el usuario intencionalmente vació la carpeta.
    // 2. En modo global (Lote): Solo permitimos borrar si detectamos al menos un archivo válido en Drive (seguridad contra fallos de API).
    const esSeguroBorrar = productoIdFiltro ? (filasBorrar.length > 0) : (filasBorrar.length > 0 && archivosVistosEnDrive.size > 0);

    if (esSeguroBorrar) {
      filasBorrar.sort((a, b) => b - a);
      filasBorrar.forEach(r => sheetImg.deleteRow(r));
      log(`🗑️ -${filasBorrar.length} borradas.`);
    }

    // FORZAR ESCRITURA INMEDIATA EN LA HOJA DE CÁLCULO
    // Esto previene errores de "Imagen no encontrada" cuando se intenta generar IA inmediatamente después de sincronizar
    SpreadsheetApp.flush();

  } catch (e) { log(`❌ Error: ${e.message}`); }
  finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}

// -----------------------------------------------------------------
// --- 4. GESTIÓN DE CARPETAS
// -----------------------------------------------------------------

function procesarGeneracionCarpetas() {
  const logArray = [];
  const log = (msg) => logArray.push(msg);
  try {
    const ss = getImagesSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.PRODUCTS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim().toUpperCase());
    const idxSku = headers.indexOf("CODIGO_ID");
    const idxFolder = headers.indexOf("CARPETA_ID");
    if (idxSku === -1 || idxFolder === -1) throw new Error("Faltan columnas");

    const parent = DriveApp.getFolderById(GLOBAL_CONFIG.DRIVE.PARENT_FOLDER_ID);
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      const sku = String(data[i][idxSku]).trim();
      const fid = String(data[i][idxFolder]).trim();
      if (sku && !fid) {
        let f;
        const fs = parent.getFoldersByName(sku);
        if (fs.hasNext()) f = fs.next();
        else f = parent.createFolder(sku);
        sheet.getRange(i + 1, idxFolder + 1).setValue(f.getId());
        count++;
      }
    }
    return { success: true, message: `Carpetas: ${count}`, logs: logArray };
  } catch (e) { return { success: false, message: e.message }; }
}

// -----------------------------------------------------------------
// --- 5. HELPERS Y ACCIONES (CON CORRECCIÓN CRÍTICA DE NOMBRE)
// -----------------------------------------------------------------

// 🔍¥ AQUÍ SE APLICA EL CAMBIO QUE SOLICITASTE Y SE ACTUALIZAN LAS LLAMADAS

function buscarProductosParaSidebar(busqueda) {
  const ss = getImagesSpreadsheet();
  const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
  const data = convertirRangoAObjetos_IMAGENES(sheetProd);
  const query = busqueda ? String(busqueda).toLowerCase() : "";

  // 1. Filtrar Productos (Optimizado)
  const hits = data.filter(p => {
    if (!p.CODIGO_ID) return false;
    if (!query) return true;
    const txt = (
      String(p.CODIGO_ID) + " " +
      String(p.NOMBRE_PRODUCTO || p.NOMBRE || "") + " " +
      String(p.MODELO || "")
    ).toLowerCase();
    return txt.includes(query);
  }).slice(0, 50);

  if (hits.length === 0) return [];

  // 2. Obtener Miniaturas (Solo para los encontrados)
  const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
  // Leemos todo BD_IMAGENES (es rápido si <10k filas) para mapear
  const dataImg = convertirRangoAObjetos_IMAGENES(sheetImg);
  const thumbMap = new Map();

  // Prioridad: PORTADA=TRUE, luego la primera que encuentre
  // Recorremos dataImg para llenar el mapa
  dataImg.forEach(img => {
    const sku = String(img.PRODUCTO_ID);
    const isPortada = String(img.PORTADA).toUpperCase() === 'TRUE';
    const url = img.THUMBNAIL_URL || img.URL;

    if (!url) return;

    // Si no existe, guardar. Si existe y la actual es PORTADA, sobrescribir.
    if (!thumbMap.has(sku) || isPortada) {
      thumbMap.set(sku, url);
    }
  });

  return hits.map(p => ({
    sku: p.CODIGO_ID,
    nombre: p.NOMBRE_PRODUCTO || p.MODELO || "Sin Nombre",
    carpeta_id: p.CARPETA_ID || "",
    thumbnail: thumbMap.get(String(p.CODIGO_ID)) || "",
    woo_id: p.WOO_ID || ""
  }));
}

function obtenerImagenesDeProducto(sku, carpetaId) {
  const logPrefix = `🔍  [obtenerImagenesDeProducto]`;
  console.log(`${logPrefix} Buscando imágenes. SKU: "${sku}", CarpetaID: "${carpetaId}"`);

  if (!sku && !carpetaId) {
    console.warn(`${logPrefix} ⚠️ Ni SKU ni CarpetaID proporcionados. Retornando vacío.`);
    return [];
  }

  const ss = getImagesSpreadsheet();

  // Verificación y corrección automática de hoja
  let sheet = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
  if (!sheet) {
    const fallbackName = "BD_PRODUCTOS_IMAGENES"; // Nombre plural alternativo
    console.warn(`${logPrefix} 🔄 Hoja '${SHEETS.PRODUCT_IMAGES}' no hallada. Probando '${fallbackName}'...`);
    sheet = ss.getSheetByName(fallbackName);
    if (!sheet) {
      console.error(`${logPrefix} ❌ Error Crítico: No se encontró la hoja de imágenes.`);
      throw new Error(`Hoja de imágenes no encontrada (Probado: ${SHEETS.PRODUCT_IMAGES}, ${fallbackName})`);
    } else {
      console.log(`${logPrefix} ✅ Usando hoja alternativa: '${fallbackName}'`);
    }
  }

  // Usamos el helper local corregido
  const data = convertirRangoAObjetos_IMAGENES(sheet);
  console.log(`${logPrefix} 📊 Total filas en BD: ${data.length}`);

  let imagenes = data.filter(row => {
    // Lógica Dual: Coincidencia por SKU O por Carpeta ID
    const rowSku = String(row.PRODUCTO_ID || "").trim();
    const rowCarpeta = String(row.CARPETA_ID || "").trim();

    const targetSku = String(sku || "").trim();
    const targetCarpeta = String(carpetaId || "").trim();

    const matchSku = targetSku && rowSku === targetSku;
    const matchCarpeta = targetCarpeta && rowCarpeta === targetCarpeta;

    return matchSku || matchCarpeta;
  });

  // BLINDAJE EXTRA: Si no se encuentran imágenes registradas en la BD y se cuenta con un SKU,
  // procedemos a realizar una sincronización en vivo bajo demanda para rescatar/crear la carpeta
  // e indexar de inmediato cualquier imagen preexistente.
  if (imagenes.length === 0 && sku) {
    console.log(`${logPrefix} ⚠️ No se hallaron imágenes en BD para SKU "${sku}". Iniciando auto-sincronización y rescate...`);
    try {
      sincronizarImagenes(sku);
      // Volvemos a leer los datos recién sincronizados en la BD de imágenes
      const freshData = convertirRangoAObjetos_IMAGENES(sheet);
      imagenes = freshData.filter(row => {
        const rowSku = String(row.PRODUCTO_ID || "").trim();
        const targetSku = String(sku || "").trim();
        return targetSku && rowSku === targetSku;
      });
      console.log(`${logPrefix} 🔄 Auto-sincronización completada. Nuevas imágenes encontradas: ${imagenes.length}`);
    } catch (syncErr) {
      console.error(`${logPrefix} ❌ Error en auto-sincronización bajo demanda para SKU "${sku}": ${syncErr.message}`);
    }
  }

  console.log(`${logPrefix} ✅ Result: ${imagenes.length} imágenes encontradas.`);

  // Retorno formateado y mapeado
  const result = imagenes.map(img => ({
    ...img,
    // Aseguramos conversión a booleano real para el frontend
    ESTADO: String(img.ESTADO).toUpperCase() === 'TRUE',
    PORTADA: String(img.PORTADA).toUpperCase() === 'TRUE',
    // Garage de seguridad para URL
    THUMBNAIL_URL: img.THUMBNAIL_URL || img.URL || "",
    ORDEN: parseInt(img.ORDEN) || 999
  }));

  // ORDENAR RESULTADO FINAL POR ORDEN (Ascendente)
  result.sort((a, b) => a.ORDEN - b.ORDEN);

  if (result.length > 0) {
    console.log(`${logPrefix} 📦 Muestra Item 0:`, JSON.stringify(result[0]));
  }

  // SERIALIZACIÓN MANUAL: Para evitar problemas con Date objects en Apps Script que causan NULL
  return JSON.stringify(result);
}

// 🔍¥ FUNCIÓN RENOMBRADA Y AISLADA: Solo para Images.js
// Esto asegura que usemos las claves en MAYÚSCULAS (ej: CARPETA_ID)
function convertirRangoAObjetos_IMAGENES(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim().toUpperCase()); // FORZAR MAYÚSCULAS

  // Debug de headers para verificar si CARPETA_ID existe
  // console.log(`📦 [convertirRangoAObjetos_IMAGENES] Headers detectados: ${headers.join(", ")}`);

  return data.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function cambiarEstadoImagen(imgId, nuevoEstado) { return actualizarCeldaPorHeader(imgId, 'ESTADO', nuevoEstado); }

function establecerPortada(imgId, sku) {
  const sheet = getImagesSpreadsheet().getSheetByName(SHEETS.PRODUCT_IMAGES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toUpperCase());
  const idxProd = headers.indexOf('PRODUCTO_ID');
  const idxPortada = headers.indexOf('PORTADA');
  const idxId = headers.indexOf('IMAGEN_ID');

  if (idxProd === -1 || idxPortada === -1) return { success: false };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxProd]) === String(sku)) {
      if (String(data[i][idxPortada]).toUpperCase() === 'TRUE') sheet.getRange(i + 1, idxPortada + 1).setValue(false);
    }
  }
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId]) === String(imgId)) {
      sheet.getRange(i + 1, idxPortada + 1).setValue(true);
      return { success: true };
    }
  }
}

/**
 * Guarda el nuevo orden de las imágenes de un producto.
 * @param {string} sku El SKU del producto.
 * @param {string[]} idsOrdenados Array de IMAGEN_ID en el orden deseado.
 */
function guardarNuevoOrdenImagenes(sku, idsOrdenados) {
  const logPrefix = `📑 [guardarNuevoOrdenImagenes]`;
  console.log(`${logPrefix} Guardando orden para ${sku}: ${idsOrdenados.length} IDs.`);

  const sheet = getImagesSpreadsheet().getSheetByName(SHEETS.PRODUCT_IMAGES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toUpperCase());

  const colId = headers.indexOf('IMAGEN_ID');
  const colOrden = headers.indexOf('ORDEN');
  const colPortada = headers.indexOf('PORTADA');
  const colSku = headers.indexOf('PRODUCTO_ID');

  if (colId === -1 || colOrden === -1) {
    console.error(`${logPrefix} Columnas críticas no encontradas.`);
    return { success: false, message: "No se encontró la columna ORDEN en la base de datos." };
  }

  // Mapeo rápido de fila por ID
  const mapIds = {};
  const skuRows = [];
  for (let i = 1; i < data.length; i++) {
    const rowId = String(data[i][colId]);
    const rowSku = String(data[i][colSku]);
    mapIds[rowId] = i + 1;
    if (rowSku === String(sku)) {
      skuRows.push(i + 1);
    }
  }

  try {
    // Aplicar nuevo ORDEN. NO tocamos la columna PORTADA. El usuario la selecciona aparte.
    idsOrdenados.forEach((id, index) => {
      const rowNum = mapIds[String(id)];
      if (rowNum) {
        sheet.getRange(rowNum, colOrden + 1).setValue(index + 1);
      }
    });

    return { success: true, message: "Orden actualizado correctamente. Portada preservada." };
  } catch (e) {
    console.error(`${logPrefix} Error: ${e.message}`);
    return { success: false, message: e.message };
  }
}

function eliminarImagenesDefinitivo(idsEliminar) {
  const sheet = getImagesSpreadsheet().getSheetByName(SHEETS.PRODUCT_IMAGES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toUpperCase());
  const idxId = headers.indexOf('IMAGEN_ID');
  const idxArchivo = headers.indexOf('ARCHIVO_ID');

  if (idxId === -1) return { success: false };
  const filas = []; const archivos = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const id = String(data[i][idxId]);
    if (idsEliminar.includes(id)) {
      filas.push(i + 1);
      if (idxArchivo !== -1) archivos.push(data[i][idxArchivo]);
    }
  }
  filas.forEach(r => sheet.deleteRow(r));
  archivos.forEach(fid => { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) { } });
  return { success: true, message: `🗑️ ${filas.length} eliminados.` };
}

function cambiarEstadoMasivo(ids, nuevoEstado) {
  const sheet = getImagesSpreadsheet().getSheetByName(SHEETS.PRODUCT_IMAGES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toUpperCase());
  const idxId = headers.indexOf('IMAGEN_ID');
  const idxEstado = headers.indexOf('ESTADO');

  if (idxId === -1) return { success: false };
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (ids.includes(String(data[i][idxId]))) {
      sheet.getRange(i + 1, idxEstado + 1).setValue(nuevoEstado);
      count++;
    }
  }
  return { success: true, message: `${count} actualizados.` };
}

function actualizarCeldaPorHeader(id, headerName, valor) {
  const sheet = getImagesSpreadsheet().getSheetByName(SHEETS.PRODUCT_IMAGES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toUpperCase());
  const idxId = headers.indexOf('IMAGEN_ID');
  const idxTarget = headers.indexOf(headerName);

  if (idxId === -1 || idxTarget === -1) return { success: false };
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId]) === String(id)) {
      sheet.getRange(i + 1, idxTarget + 1).setValue(valor);
      return { success: true };
    }
  }
  return { success: false };
}

// --- DIAGNÓSTICO IA RESTAURADO ---
function DIAGNOSTICO_IA() {
  const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  console.log("🔍  Probando llave...");

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());

    if (json.error) {
      console.log("❌ ERROR DE CUENTA: " + json.error.message);
    } else if (json.models) {
      console.log("✅ CONEXIÓN EXITOSA. Modelos disponibles:");
      json.models.forEach(m => {
        if (m.supportedGenerationMethods.includes("generateContent")) {
          console.log("👉 " + m.name.replace("models/", ""));
        }
      });
    } else {
      console.log("Error: " + response.getContentText());
    }
  } catch (e) {
    console.log("Error de conexión: " + e.message);
  }
}

// -----------------------------------------------------------------
// --- FILE API DE GEMINI + CONSTANTES DE OPTIMIZACIÓN (V1.0)
// -----------------------------------------------------------------

/**
 * Configuración de seguridad para catálogo de indumentaria.
 * BLOCK_ONLY_HIGH: Permite prendas ajustadas (boxer, vedetinas) sin bloqueo.
 */
const GEMINI_SAFETY_SETTINGS = [
  { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
  { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
  { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
  { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
];

/**
 * Sube un archivo a la File API de Gemini y retorna la URI.
 * Los archivos duran 48hs y no tienen costo de almacenamiento.
 * Reduce el payload JSON de megabytes a kilobytes.
 * @param {Blob} blob El blob del archivo.
 * @param {string} displayName Nombre para identificación.
 * @returns {{uri: string, mimeType: string}} URI del archivo en Gemini.
 */
/**
 * Sube un archivo a la File API de Gemini y retorna la URI.
 * @param {Blob} blob El blob del archivo.
 * @param {string} displayName Nombre para identificación.
 * @param {string} [apiKeyOverride] Llave opcional (para dual-key).
 * @returns {{uri: string, mimeType: string}} URI del archivo en Gemini.
 */
function subirArchivoGeminiFileAPI(blob, displayName, apiKeyOverride = null) {
  const apiKey = apiKeyOverride || GLOBAL_CONFIG.GEMINI.API_KEY;
  const keyMask = apiKey ? `...${apiKey.slice(-4)}` : "NOT_FOUND";
  console.log(`📁 [File API|Upload] Iniciando para ${displayName} con llave ${keyMask}`);
  const mimeType = blob.getContentType();
  const blobBytes = blob.getBytes();
  const numBytes = blobBytes.length;

  // Paso 1: Iniciar upload resumable
  const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
  const initResp = UrlFetchApp.fetch(initUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(numBytes),
      'X-Goog-Upload-Header-Content-Type': mimeType,
    },
    payload: JSON.stringify({
      file: { displayName: displayName }
    }),
    muteHttpExceptions: true
  });

  // La URL de upload viene en los headers (case-insensitive)
  const respHeaders = initResp.getAllHeaders();
  let uploadUrl = null;
  for (const key in respHeaders) {
    if (key.toLowerCase() === 'x-goog-upload-url') {
      uploadUrl = respHeaders[key];
      break;
    }
  }
  if (!uploadUrl) {
    console.error('File API Init Response: ' + initResp.getContentText());
    throw new Error('File API: No se obtuvo URL de upload.');
  }

  // Paso 2: Subir bytes (Content-Length es auto-calculado por UrlFetchApp)
  const uploadResp = UrlFetchApp.fetch(uploadUrl, {
    method: 'put',
    contentType: mimeType,
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    payload: blobBytes,
    muteHttpExceptions: true
  });

  const uploadResult = JSON.parse(uploadResp.getContentText());
  const fileInfo = uploadResult.file;
  if (!fileInfo || !fileInfo.uri) {
    console.error('File API Upload Response: ' + uploadResp.getContentText());
    throw new Error('File API: Upload falló - sin URI.');
  }

  // Paso 3: Verificar estado — muchos archivos ya están ACTIVE tras el upload
  if (fileInfo.state === 'ACTIVE') {
    console.log(`📁 [File API] ${displayName} → ACTIVE inmediato (${(numBytes / 1024).toFixed(0)}KB)`);
    return { uri: fileInfo.uri, mimeType: mimeType };
  }

  // Si no está ACTIVE aún (archivos grandes), polling rápido (máx ~8s)
  const fileName = fileInfo.name;
  const checkUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;
  for (let i = 0; i < 3; i++) {
    Utilities.sleep(i === 0 ? 2000 : 3000); // Primera espera más corta
    try {
      const checkResp = UrlFetchApp.fetch(checkUrl, { muteHttpExceptions: true });
      const status = JSON.parse(checkResp.getContentText());
      if (status.file && status.file.state === 'ACTIVE') {
        console.log(`📁 [File API] ${displayName} → ACTIVE tras ${i === 0 ? '2' : (2 + i * 3)}s (${(numBytes / 1024).toFixed(0)}KB)`);
        return { uri: status.file.uri, mimeType: mimeType };
      }
    } catch (pollErr) {
      console.warn(`📁 [File API] Error en polling: ${pollErr.message}`);
    }
  }

  // Si no se activa tras polling, usar la URI igualmente (funciona en la mayoría de casos)
  console.warn(`📁 [File API] ${displayName} → Usando URI sin confirmar ACTIVE (${(numBytes / 1024).toFixed(0)}KB)`);
  return { uri: fileInfo.uri, mimeType: mimeType };
}

/**
 * Optimiza un blob de Drive para subida a Gemini File API.
 * @param {string} archivoId   ID del archivo en Drive.
 * @param {string} displayName Nombre descriptivo para logs.
 * @param {string} [prioridad='alta']
 *   - 'alta'  → Análisis Forense (cuenta gratuita): siempre thumbnail a 2560px para máximo detalle.
 *   - 'media' → Renderizado (cuenta pago): thumbnail a 1024px solo si el archivo supera 2MB,
 *               para reducir tokens sin sacrificar la referencia visual mínima necesaria.
 * @param {string} [apiKeyOverride=null] Llave opcional para asociar la subida al dueño correcto.
 * @param {boolean} [usarBase64=false] Si true, retorna inlineData (Base64) en lugar de fileData (File API).
 * @returns {{ fileData: Object } | { inlineData: Object }}
 */
function prepararBlobOptimizado(archivoId, displayName, prioridad = 'alta', apiKeyOverride = null, usarBase64 = false) {
  const file = DriveApp.getFileById(archivoId);
  let blob = file.getBlob();
  const originalSize = blob.getBytes().length;

  // --- Resolución Dinámica según prioridad ---
  const esPrioridadAlta = (prioridad === 'alta');
  const sz = esPrioridadAlta ? '2560' : '1024';
  const umbralBytes = esPrioridadAlta
    ? (0)                   // 'alta': SIEMPRE usar thumbnail para máxima fidelidad de análisis
    : (2 * 1024 * 1024);    // 'media': solo si el archivo pesa más de 2MB

  if (originalSize > umbralBytes) {
    try {
      const thumbUrl = `https://drive.google.com/thumbnail?id=${archivoId}&sz=w${sz}`;
      const thumbResp = UrlFetchApp.fetch(thumbUrl, {
        headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (thumbResp.getResponseCode() === 200) {
        blob = thumbResp.getBlob();
        console.log(`⚡ [Optimize|${prioridad}] ${displayName}: ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(blob.getBytes().length / 1024).toFixed(0)}KB (sz=w${sz})`);
      }
    } catch (e) {
      console.warn(`⚡ [Optimize] Thumb fallback falló para ${displayName}: ${e.message}`);
    }
  }

  // --- OPCIÓN A: BYPASS BASE64 (Ideal para thumbnails / llaves con 403) ---
  if (usarBase64) {
    const base64 = Utilities.base64Encode(blob.getBytes());
    console.log(`⚡ [Bypass|Base64] ${displayName} embebido directamente (${(base64.length / 1024).toFixed(0)}KB)`);
    return {
      "inlineData": {
        "mimeType": blob.getContentType(),
        "data": base64
      }
    };
  }

  // --- OPCIÓN B: FILE API (Ideal para múltiples imágenes / alta resolución) ---
  const gemFile = subirArchivoGeminiFileAPI(blob, displayName, apiKeyOverride);
  return {
    "fileData": {
      "mimeType": gemFile.mimeType,
      "fileUri": gemFile.uri
    }
  };
}

// [REMOCIÓN SEGURA] _getAiArtDirectionRules, generarSuperPrompt_LEGACY y generarSuperPromptMasivo_LEGACY 
// han sido removidas de forma segura. Toda la lógica de directivas y prompts masivos está ahora centralizada 
// y consolidada en el servicio unificado AIService.js para evitar duplicidad de código.

// =================================================================
// ===  CAPA 1 — ANÁLISIS FORENSE (Gratis, por imagen)           ===
// =================================================================
/**
 * Inspecciona UNA foto con la cuenta gratuita y guarda sus atributos físicos
 * en la columna ANALISIS_FORENSE de BD_IMAGENES delegando al AIService.
 */
function escanearPrenda(imagenId, forzar = false, modeloForzado = null) {
  try {
    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    const dataImg = convertirRangoAObjetos_IMAGENES(sheetImg);
    const imgRow = dataImg.find(r => String(r.IMAGEN_ID).trim() === String(imagenId).trim());

    if (!imgRow) throw new Error(`Imagen no encontrada: ${imagenId}`);

    // Si ya tiene análisis forense en BD_PRODUCTO_IMAGENES y no se fuerza, retornar el existente
    if (imgRow.ANALISIS_FORENSE && !forzar) {
      return JSON.stringify({ success: true, text: imgRow.ANALISIS_FORENSE, model: "cached", skipped: true });
    }

    // --- NUEVO: Inyectar Metadata de BD_PRODUCTOS ---
    const sku = imgRow.PRODUCTO_ID;
    const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
    const dataProd = convertirRangoAObjetos_IMAGENES(sheetProd);
    const prodRow = dataProd.find(p => String(p.CODIGO_ID || p.SKU).trim() === String(sku).trim());

    const metadata = {
      sku: prodRow ? (prodRow.CODIGO_ID || prodRow.SKU) : sku,
      categoria: prodRow ? prodRow.CATEGORIA : "Clothing",
      marca: prodRow ? prodRow.MARCA : "Unknown",
      modelo: prodRow ? (prodRow.MODELO || prodRow.PRODUCTO) : "Unknown",
      material: prodRow ? prodRow.MATERIAL : "Textile",
      genero: prodRow ? prodRow.GENERO : "Unisex"
    };

    // Ejecución centralizada vía AIService (Motor de persistencia y fallback dual-key)
    const resLab = AIService.ejecutarPruebaLaboratorio(imagenId, metadata, forzar, modeloForzado);

    if (resLab && resLab.success) {
      garantizarColumnaANALISIS(sheetImg);
      actualizarCeldaPorHeader(imagenId, 'ANALISIS_FORENSE', resLab.clean);
      console.log(`✅ [Forense|OK-Lab] ${imagenId} procesada con el motor del Laboratorio.`);
      return JSON.stringify({ success: true, text: resLab.clean, model: resLab.modelo });
    } else {
      throw new Error(resLab ? resLab.error : "Error en ejecución de laboratorio.");
    }

  } catch (e) {
    console.error(`[escanearPrenda] ${e.message}`);
    return JSON.stringify({ success: false, error: e.message });
  }
}

/**
 * Asegura que la columna ANALISIS_FORENSE exista en la hoja de imágenes.
 */
function garantizarColumnaANALISIS(sheet) {
  const headers = sheet.getDataRange().getValues()[0];
  if (headers.map(h => String(h).trim().toUpperCase()).indexOf("ANALISIS_FORENSE") === -1) {
    sheet.getRange(1, headers.length + 1).setValue("ANALISIS_FORENSE");
    SpreadsheetApp.flush();
    console.log("🆕 Columna ANALISIS_FORENSE creada.");
  }
}

function generarSuperPrompt(imagenId, estiloSolicitado, modo = 'image', extraSpecs = {}, pin = null) {
  // --- PUENTE HACIA VIDEO ---
  if (modo === 'video') {
    return generarVideoPrompt([imagenId], estiloSolicitado, { extraSpecs: extraSpecs });
  }

  try {
    console.log(`🧠 [Core-Flow] Delegando generación de Prompt Maestro a AIService para imagen: ${imagenId}`);
    // Invocamos el servicio maestro de AIService
    // Forzamos la regeneración (true) al ser solicitado desde el dashboard y omitimos log de laboratorio
    const result = AIService.ejecutarGeneracionPromptMaestro([imagenId], estiloSolicitado, { ...extraSpecs, skipLabLog: true }, true);

    if (!result.success) throw new Error(result.error || "Error indeterminado de IA.");

    const promptGenerado = result.clean;

    // Persistimos en la columna de la hoja comercial BD_PRODUCTO_IMAGENES
    actualizarCeldaPorHeader(imagenId, 'PROMPT', promptGenerado);

    let resObj = {
      success: true,
      text: promptGenerado,
      raw: result.raw,
      modelUsed: result.modelo
    };

    // INTEGRACIÓN CORE: Renderizamos usando la imagen actual como referencia
    if (modo === 'image' && pin) {
      try {
        console.log(`🎨 [Core-Flow] Renderizando imagen para ${imagenId}...`);
        const resImg = generarImagenDesdePrompt([imagenId], promptGenerado, pin, null, null, extraSpecs);

        if (resImg.success) {
          resObj.imageSuccess = true;
          resObj.imageFileId = resImg.fileId;
          resObj.imagenId = resImg.imagenId;
          resObj.renderModel = resImg.modelUsed;
          resObj.text += `\n\n✅ IMAGEN GENERADA EXITOSAMENTE CON ${resImg.modelUsed}.`;
        } else {
          throw new Error(resImg.message || resImg.error);
        }
      } catch (e) {
        resObj.imageSuccess = false;
        resObj.text += `\n\n❌ ERROR EN RENDERIZADO: ${e.message}`;
      }
    }

    return JSON.stringify(resObj);

  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

// 🔍¥ NUEVA FUNCIÓN: GENERACIÓN MULTIMODAL (VARIAS IMÁGENES)
function generarSuperPromptMasivo(imageIds, estiloSolicitado, modo = 'image', extraSpecs = {}, pin = null) {
  // --- PUENTE HACIA VIDEO ---
  if (modo === 'video') {
    return generarVideoPrompt(imageIds, estiloSolicitado, { extraSpecs: extraSpecs });
  }

  try {
    console.log(`🧠 [Core-Flow] Delegando generación de Prompt Maestro Masivo a AIService para: ${imageIds.join(', ')}`);
    // Invocamos el servicio maestro de AIService
    // Forzamos la regeneración (true) al ser solicitado desde el dashboard y omitimos log de laboratorio
    const result = AIService.ejecutarGeneracionPromptMaestro(imageIds, estiloSolicitado, { ...extraSpecs, skipLabLog: true }, true);

    if (!result.success) throw new Error(result.error || "Error indeterminado de IA.");

    const promptGenerado = result.clean;
    const masterId = imageIds[0];

    // Persistimos en la columna de la hoja comercial BD_PRODUCTO_IMAGENES (sobre la imagen Master)
    actualizarCeldaPorHeader(masterId, 'PROMPT', promptGenerado);

    let resObj = {
      success: true,
      text: promptGenerado,
      raw: result.raw,
      modelUsed: result.modelo
    };

    // INTEGRACIÓN CORE: Renderizamos usando el grupo de imágenes de referencia
    if (modo === 'image' && pin) {
      try {
        console.log(`🎨 [Core-Flow] Renderizando imagen masiva para ${masterId}...`);
        const resImg = generarImagenDesdePrompt(imageIds, promptGenerado, pin, null, null, extraSpecs);

        if (resImg.success) {
          resObj.imageSuccess = true;
          resObj.imageFileId = resImg.fileId;
          resObj.imagenId = resImg.imagenId;
          resObj.renderModel = resImg.modelUsed;
          resObj.text += `\n\n✅ IMAGEN GENERADA EXITOSAMENTE CON ${resImg.modelUsed}.`;
        } else {
          throw new Error(resImg.message || resImg.error);
        }
      } catch (e) {
        resObj.imageSuccess = false;
        resObj.text += `\n\n❌ ERROR EN RENDERIZADO: ${e.message}`;
      }
    }

    return JSON.stringify(resObj);

  } catch (e) {
    console.error(`❌ [Core-Flow] Error en generarSuperPromptMasivo: ${e.message}`);
    return JSON.stringify({ success: false, error: e.message });
  }
}



function listarModelosDisponibles() {
  const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY;

  // Endpoint oficial para listar modelos
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());

    if (json.models) {
      Logger.log("=== MODELOS DISPONIBLES PARA TU API KEY ===");
      json.models.forEach(model => {
        // Filtramos solo los que sirven para generar contenido (texto/imágenes)
        if (model.supportedGenerationMethods.includes("generateContent")) {
          Logger.log(`Nombre: ${model.name} | Versión: ${model.version}`);
        }
      });
      Logger.log("===========================================");
    } else {
      Logger.log("Error: " + response.getContentText());
    }
  } catch (e) {
    Logger.log("Error de conexión: " + e.message);
  }
}
// 🔍¥ NUEVA FUNCIÓN: GENERACIÓN DE GUION DE VIDEO (REELS/TIKTOK/VEO)
function generarVideoPrompt(imageIds, estiloSolicitado, opciones = {}) {
  const logPrefix = `🎬 [generarVideoPrompt]`;
  const estructura = opciones.structure || 'multi_shot'; // 'single_shot' o 'multi_shot'
  const conAudio = opciones.audio === true;
  const conVoz = opciones.vo === true;

  console.log(`${logPrefix} ${imageIds.length} imgs. Estilo: ${estiloSolicitado}. Estructura: ${estructura}`);

  try {
    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    const dataImg = convertirRangoAObjetos_IMAGENES(sheetImg);

    // 1. OBTENER IMÁGENES Y VALIDAR
    const selectedRows = dataImg.filter(r => imageIds.includes(String(r.IMAGEN_ID)));

    if (selectedRows.length === 0) throw new Error("No se encontraron registros de las imágenes seleccionadas.");

    const refRow = selectedRows[0];
    const sku = refRow.PRODUCTO_ID;

    // Validación de seguridad: Â¿Son todos del mismo SKU?
    const distintosSkus = [...new Set(selectedRows.map(r => r.PRODUCTO_ID))];
    if (distintosSkus.length > 1) {
      console.warn(`${logPrefix} ⚠️ Advertencia: Se seleccionaron imágenes de distintos SKUs: ${distintosSkus.join(", ")}. Usando contexto de: ${sku}`);
    }

    // 2. DATOS DE PRODUCTO (Contexto Técnico)
    const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
    const dataProd = convertirRangoAObjetos_IMAGENES(sheetProd);
    const prodRow = dataProd.find(p => String(p.CODIGO_ID).trim() === String(sku).trim());

    let contextoTecnico = "Product: Retail item.";

    if (prodRow) {
      let coloresDb = prodRow.COLORES || "";
      if (coloresDb.toLowerCase().includes("surtido")) coloresDb = "Various (Focus ONLY on the visible color)";

      contextoTecnico = `
        DATA SPECS:
        - Brand: ${prodRow.MARCA || "Generic"}
        - Parent Category: ${prodRow.CATEGORIA_PADRE || "General"}
        - Specific Category: ${prodRow.CATEGORIA || "General"}
        - Name: ${prodRow.MODELO || prodRow.PRODUCTO || "Product"}
        - Material: ${prodRow.MATERIAL || "Standard"}
        - Colors from DB: ${coloresDb}
        - Description: ${prodRow.DESCRIPCION || "Modern style"}
        `;
    }

    // 3. PREPARAR IMÁGENES (Multimodal) Y DETECTAR MASTER PIVOTE
    const contentsParts = [];

    // Identificamos si entre las seleccionadas hay una "Master" (Generada por IA y aprobada)
    const masterImgs = selectedRows.filter(r => r.FUENTE === 'IA_Gemini' || (r.PROMPT && r.FUENTE === 'Sistema Web'));
    const nonMasterImgs = selectedRows.filter(r => !masterImgs.includes(r));

    // Ordenamos para que las Master vayan al PRINCIPIO (como anclas visuales) o al FINAL según el prompt
    // Pero para VEO y Scripts, la última imagen suele tener más peso semántico en algunos modelos.
    // Decidimos poner las Originales primero y las Master DESPUÉS para "corregir" la visión de la IA.
    const orderedRows = [...nonMasterImgs, ...masterImgs].slice(0, 5);

    // Si hay una Master, extraemos su prompt para consistencia
    const masterPromptRef = masterImgs.length > 0 ? masterImgs[0].PROMPT : "";

    // 3. PREPARAR SYSTEM PROMPT DINÁMICO
    let systemPrompt = "";

    // Reglas de Estilo (Visuales)
    let visualStyle = "";
    const extraSpecs = opciones.extraSpecs || {};

    switch ((estiloSolicitado || '').toLowerCase()) {
      case 'ghost':
        let focusMandateVideo = "";
        const focusVal = extraSpecs.focus || "";
        const angleVal = String(extraSpecs.angle || "").toLowerCase();
        const isBack = angleVal.includes("back") || angleVal.includes("trasera") || angleVal.includes("espalda");

        if (focusVal !== "none" && !isBack) {
          if (extraSpecs.focus === 'waist') focusMandateVideo = " Priority Focus: Waist interior with a gentle, realistic angle.";
          else if (extraSpecs.focus === 'legs') focusMandateVideo = " Priority Focus: Natural leg interior openings.";
          else focusMandateVideo = " Priority Focus: Balanced, natural 3D volume.";
        }
        visualStyle = `Style: Ghost Mannequin / Invisible 3D. Clean, white background, hollow garment.${focusMandateVideo} (MANDATE: PERFECTLY CENTERED. REMOVE ALL mannequins, residual shadows, tags, and hangers. Ensure internal fabric at openings like sleeves and legs shows a clean perspective-correct cut, avoiding elongated back effects and gaping hollow voids).`;
        break;
      case 'lifestyle': visualStyle = `Style: High-End Lifestyle. Dynamic ${prodRow ? prodRow.GENERO || 'UNISEX' : 'UNISEX'} fit model, cinematic lighting, urban context. (MANDATE: REMOVE ALL retail tags/hangers).`; break;
      default: visualStyle = `Style: Professional E-commerce Studio. Vertical format, clean grey background, ${prodRow ? prodRow.GENERO || 'UNISEX' : 'UNISEX'} model. (MANDATE: REMOVE ALL retail tags/hangers).`; break;
    }

    if (extraSpecs.skinTone) visualStyle += ` Model Skin Tone: ${extraSpecs.skinTone}.`;
    if (extraSpecs.footwear) visualStyle += ` Footwear: ${extraSpecs.footwear.type} in ${extraSpecs.footwear.color} color.`;

    if (estructura === 'living_garment') {
      visualStyle = "Style: 3D Living Garment Animation. The garment is worn by an invisible body but it is MOVING naturally, walking or posing as if a human was wearing it. Fluid fabric simulation, dynamic wrinkles, and realistic 3D volume.";
    }

    const pivotInstructions = masterImgs.length > 0
      ? `PIVOT REFERENCE: The LAST image(s) provided are 'MASTER' references (already approved by user). Use them as your ABSOLUTE anchor for model appearance, environment, and garment fit. The other images are for secondary texture details only. DO NOT BLEND them into a hybrid product. Follow the MASTER style perfectly.`
      : `GENERAL REFERENCE: Maintain visual consistency across all provided reference images. Identify the core product DNA.`;

    if (estructura === 'single_shot' || estructura === 'living_garment') {
      // --- MODO 8 SEGUNDOS (VEO 3.1) ---
      const voMandate = conVoz ? "MANDATORY: You MUST provide a Spanish Slogan/Script in the 'VOICEOVER' field." : "VOICEOVER: Leave empty or very brief.";
      const audioMandate = conAudio ? "MANDATORY: Suggest a specific musical genre or sound effect in 'MUSICA_RECOMENDADA'." : "";

      systemPrompt = `
      ROLE: Expert AI Video Prompt Engineer (1:1 Pixel Fidelity).
      INPUT: Product Context (${contextoTecnico}) + Reference Image Pixels.
      ${pivotInstructions}
      
      CRITICAL FIDELITY RULES:
      1. **SEMANTIC VS VISUAL**: Use pixels as the ONLY VISUAL AUTHORITY.
      2. **CAMERA MOVEMENT**: 
         - If style is 'Lifestyle' or 'Ecommerce': Use a dynamic cinematic tracking shot or crane shot. Stable, high-end movement.
         - Otherwise (e.g., 'Ghost'): Perform a smooth, continuous 360-degree orbital rotation to reveal technical volume.
      3. **PHYSICS & SAFETY**: Focus strictly on cloth tension, fabric drape, and silhouette. Use clinical, non-anatomical terms.
      4. **NO HYBRIDS**: If the reference is a Split-View, pick only the most prominent side as the pivot.
      5. **TAG/HANGER REMOVAL**: Strictly command the absolute removal of all retail attachments.
      6. **VO/AUDIO**: ${voMandate} ${audioMandate}

      CONSTRAINT: **NO CUTS. NO SCENE NUMBERS. NO TEXT OVERLAY. NO HUMAN SKIN FOCUS.**
      
      INSTRUCTIONS:
      1. **DNA LOCK**: Describe a single continuous shot.
      2. **LANGUAGE** (OUTPUT JSON): 
         - **VOICEOVER**: MUST BE IN SPANISH (Short, catchy).
         - **MUSICA_RECOMENDADA**: MUST BE IN SPANISH.
         - **PROMPT_FOR_VIDEO_AI**: TECHNICAL ENGLISH.
      
      OUTPUT FORMAT (JSON):
      {
        "TEMA_DETECTADO": "...",
        "MUSICA_RECOMENDADA": "...",
        "PERFIL_DE_VOZ": "...",
        "PROMPT_FOR_VIDEO_AI": "A technical description for VEO. Start with the camera movement [Orbital or Cinematic Tracking]. Focus on technical drape and lighting. [Clinical terms only, no anatomy].",
        "VOICEOVER": "...",
        "EXPLANATION": "..."
      }
      `;
    } else {
      // --- MODO GUION COMPLETO (MULTI-SCENE) ---
      systemPrompt = `
      ROLE: Expert Social Media Content Director.
      GOAL: Create a short Video Script (Reels/TikTok) ensuring 100% visual consistency.
      ${pivotInstructions}
      SELECTED STYLE: ${visualStyle}
      
      INSTRUCTIONS:
      1. **SCENE STRUCTURE**: Create 3-5 distinct scenes (TOMAS).
      2. **NO HYBRIDS**: Ensure the garment looks identical in every scene.
      3. **TAG/HANGER REMOVAL**: Mandate removal of all retail attachments.
      4. **LANGUAGE**: EVERY field (HOOK, SCENES, VOICEOVER, EXPLANATION, MUSIC, THEME) MUST be in **SPANISH**. Only "visual_prompt" remains in English.

      OUTPUT FORMAT (JSON):
      {
        "TEMA_DETECTADO": "...",
        "MUSICA_RECOMENDADA": "...",
        "PERFIL_DE_VOZ": "...",
        "HOOK": "...",
        "TOMAS": [
          { 
            "id_toma": 1, 
            "duracion": "0-3s", 
            "descripcion_español": "...",
            "visual_prompt": "DEEP TECHNICAL PROMPT IN ENGLISH based on Master pivot..." 
          }
        ],
        "VOICEOVER": "...",
        "EXPLANATION": "..."
      }
      `;
    }

    // Separamos system prompt de las partes de imagen
    const imageVideoParts = [];

    // Añadir las imágenes seleccionadas en el orden de PIVOTE
    orderedRows.forEach(row => {
      try {
        const fileDataPart = prepararBlobOptimizado(row.ARCHIVO_ID, `video_${row.IMAGEN_ID}`);
        imageVideoParts.push(fileDataPart);
      } catch (err) {
        console.warn(`Error subiendo imagen ID ${row.IMAGEN_ID}: ${err.message}`);
      }
    });

    if (imageVideoParts.length === 0) throw new Error("No se pudieron cargar las imágenes del Drive.");

    const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY;

    // 4. LISTA DE MODELOS (Respetando orden usuario y excluyendo 1.5-flash)
    const modelos = [
      "gemma-3-27b-it",    // PRIORIDAD 1: Visión potente + 14k cupo
      "gemma-3-12b-it",    // PRIORIDAD 2: Rápido
      "gemini-2.5-flash"   // PRIORIDAD 3: Emergencia
    ];

    let erroresAcumulados = [];

    // 5. BUCLE DE INTENTOS
    for (let i = 0; i < modelos.length; i++) {
      const modelo = modelos[i];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

      // Payload condicional: Gemini soporta systemInstruction, Gemma no
      let payload;
      if (modelo.startsWith('gemini')) {
        payload = {
          "systemInstruction": { "parts": [{ "text": systemPrompt }] },
          "contents": [{ "parts": [{ "text": contextoTecnico }, ...imageVideoParts] }],
          "safetySettings": GEMINI_SAFETY_SETTINGS
        };
      } else {
        payload = {
          "contents": [{ "parts": [{ "text": systemPrompt }, ...imageVideoParts] }],
          "safetySettings": GEMINI_SAFETY_SETTINGS
        };
      }

      const options = {
        "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true
      };

      try {
        const response = UrlFetchApp.fetch(url, options);
        const code = response.getResponseCode();
        const text = response.getContentText();

        if (code === 200) {
          const json = JSON.parse(text);
          if (json.candidates && json.candidates.length > 0) {
            const promptGenerado = json.candidates[0].content.parts[0].text;

            // GUARDAR EN BASE DE DATOS (Para que aparezca el icono de IA en la galería)
            imageIds.forEach(id => {
              try { actualizarCeldaPorHeader(id, 'PROMPT', promptGenerado); } catch (e) { }
            });

            return JSON.stringify({
              success: true,
              text: promptGenerado,
              model: modelo,
              imageIds: imageIds // Pasamos los IDs de vuelta para preservar el contexto
            });
          }
        } else {
          let errDetail = text;
          try { errDetail = JSON.parse(text).error.message; } catch (e) { }
          Logger.log(`⚠️ Falló Video Gen ${modelo}: ${errDetail}`);
          erroresAcumulados.push(`${modelo}: ${errDetail}`);
          if (String(errDetail).includes("Quota exceeded") || code === 429) {
            Utilities.sleep((i + 1) * 4000);
          }
        }
      } catch (err) {
        erroresAcumulados.push(`${modelo} Error: ${err.message}`);
        if (String(err.message).includes("429")) Utilities.sleep(5000);
      }
    }
    throw new Error(`Error Total IA (Video): ${erroresAcumulados.join(" | ")}`);

  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}




// =================================================================
// ===           UTILIDAD LEGACY RESTAURADA                    ===
// =================================================================

function generarDatosDeTipoYThumbnail(file, appName, sheetName, rutaCompletaDelArchivo, log = Logger.log) {
  const mimeType = file.getMimeType();
  const nombreLower = file.getName().toLowerCase();

  // Detección robusta de video (MIME o Extensión)
  const esVideo = mimeType.startsWith("video/") ||
    nombreLower.endsWith(".mp4") ||
    nombreLower.endsWith(".mov") ||
    nombreLower.endsWith(".avi") ||
    nombreLower.endsWith(".mkv") ||
    nombreLower.endsWith(".webm");

  const tipoArchivo = esVideo ? "video" : "imagen";
  let thumbnailUrl = "";

  if (esVideo) {
    try {
      const ultimoSlash = rutaCompletaDelArchivo.lastIndexOf("/");
      const rutaBase = rutaCompletaDelArchivo.substring(0, ultimoSlash);
      const nombreVideo = rutaCompletaDelArchivo.substring(ultimoSlash + 1);
      const extension = nombreVideo.substring(nombreVideo.lastIndexOf("."));
      const thumbnailName = nombreVideo.replace(extension, "_thumb.jpg");

      const parents = file.getParents();
      const folder = parents.hasNext() ? parents.next() : null;

      if (folder) {
        // 1. Verificar si YA existe miniatura
        const existingThumbs = folder.getFilesByName(thumbnailName);
        let thumbnailFile = existingThumbs.hasNext() ? existingThumbs.next() : null;

        // 2. Si no existe, intentar generar (Retry Loop mejorado)
        if (!thumbnailFile) {
          let thumbnailBlob = null;
          // Aumentamos a 5 intentos de 2 segundos (10s total) para dar tiempo a Drive
          for (let i = 0; i < 5; i++) {
            try {
              thumbnailBlob = file.getThumbnail();
              if (thumbnailBlob) break;
            } catch (e) { }
            Utilities.sleep(2000);
          }

          if (thumbnailBlob) {
            thumbnailFile = folder.createFile(thumbnailBlob).setName(thumbnailName);
            log("  📸 Thumb generado (Legacy): " + thumbnailName);
          }
        }

        // 3. Construir URL
        if (thumbnailFile) {
          const thumbnailRuta = rutaBase + "/" + thumbnailFile.getName();
          thumbnailUrl = "https://www.appsheet.com/template/gettablefileurl?appName=" + encodeURIComponent(appName) + "&tableName=" + encodeURIComponent(sheetName) + "&fileName=" + encodeURIComponent(thumbnailRuta);
        } else {
          // Mensaje informativo, pero no bloqueo
          const shortName = nombreVideo.length > 20 ? nombreVideo.substring(0, 20) + "..." : nombreVideo;
          log(`⏳ Drive aún procesando: ${shortName}. (Reintenta Sync en unos minutos)`);
        }
      }

    } catch (e) {
      log("🚫 Error thumbnailing: " + e.message);
    }
  }

  return { tipoArchivo: tipoArchivo, thumbnailUrl: thumbnailUrl };
}

/**
 * UTILIDAD GENÉRICA PARA CONSULTAR A GEMINI IA (V0.8.4 - PRIORIDAD MULTI-MODELO)
 * Intenta usar gemini-2.5-flash y cae a alternativas si falla.
 */
function consultarIA(promptPersonalizado) {
  // 1. Obtener API Key
  const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY || (SCRIPT_CONFIG ? SCRIPT_CONFIG["GM_IMAGE_API_KEY"] : "");
  if (!apiKey) {
    console.error("❌ [IA] Falta API KEY.");
    return "Error de configuración de IA.";
  }

  // 2. LISTA DE MODELOS OPTIMIZADA (Priorizando Velocidad para Chatbot)
  const modelos = [
    "gemma-3-27b-it",    // PRIORIDAD 1: Visión potente
    "gemma-3-12b-it",    // PRIORIDAD 2: Rápido
    "gemini-2.5-flash"   // PRIORIDAD 3: Emergencia
  ];

  let ultimoError = "";

  // 3. Bucle de intentos
  for (const modelo of modelos) {
    try {
      // debugLog(`🧠 [IA] Probando modelo: ${modelo}...`); // Descomentar si usas debugLog

      // La URL v1beta es compatible con Gemma y Gemini
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

      const payload = {
        "contents": [{ "parts": [{ "text": promptPersonalizado }] }],
        "generationConfig": {
          "temperature": 0.7, // Gemma trabaja mejor con un poco más de temperatura
          "maxOutputTokens": 800
        }
      };

      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(url, options);
      const respCode = response.getResponseCode();

      if (respCode === 200) {
        const json = JSON.parse(response.getContentText());
        if (json.candidates && json.candidates.length > 0) {
          // debugLog(`✅ [IA] Éxito con: ${modelo}`); // Descomentar si usas debugLog
          return json.candidates[0].content.parts[0].text;
        }
      } else {
        const respText = response.getContentText();
        ultimoError = `Mod ${modelo} -> HTTP ${respCode}: ${respText.substring(0, 100)}`;
        console.warn(`⚠️ ${ultimoError}`);
      }
    } catch (e) {
      ultimoError = `Mod ${modelo} -> EXC: ${e.message}`;
      console.warn(`⚠️ ${ultimoError}`);
    }
  }

  // 4. Si llegamos aquí, fallaron TODOS
  console.error(`❌ [IA] Todos los modelos fallaron. Último: ${ultimoError}`);

  // Mensaje final corto para cortar el bucle de Telegram
  return "⚠️ Sistema IA saturado. Por favor busca usando solo el código del producto (ej: SHOR2420).";
}

/**
 * 🛠️ PASARELA DE EJECUCIÓN: IMAGEN 3 (Oficial)
 * Recibe el prompt ya cocinado y lanza el renderizado.
 */
function generarImagenDesdePrompt(referenciaIds, promptTexto, pin, refineData = null, cachedDataImg = null, extraSpecs = {}) {
  const logPrefix = `🎨 [Render-Gateway]`;
  const execStartTime = Date.now();
  const MAX_EXEC_MS = 300000; // 5 min (1 min de margen para Apps Script)

  // 1. VALIDACIÓN DE SEGURIDAD (PIN)
  if (!pin || String(pin) !== String(GLOBAL_CONFIG.GEMINI.PAID_PIN)) {
    console.warn(`${logPrefix} 🔐 Intento de generación pagada sin PIN válido.`);
    throw new Error("PIN de seguridad incorrecto o ausente. No se activó la generación de pago.");
  }

  const ids = Array.isArray(referenciaIds) ? referenciaIds : [referenciaIds];
  console.log(`${logPrefix} Iniciando renderizado multimodal para: ${ids.join(", ")}`);
  if (!promptTexto) throw new Error("No se proporcionó un prompt para renderizar.");

  // Extraer únicamente la sección del Prompt Maestro para el renderizador
  let cleanPromptText = promptTexto;
  let isJsonParsed = false;
  
  if (typeof promptTexto === 'string' && promptTexto.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(promptTexto);
      if (parsed.master_prompt_en) {
        cleanPromptText = parsed.master_prompt_en;
        isJsonParsed = true;
        console.log(`${logPrefix} Extraído master_prompt_en desde JSON estructurado.`);
      } else if (parsed.prompt) {
        cleanPromptText = parsed.prompt;
        isJsonParsed = true;
      }
    } catch (e) {
      console.warn(`${logPrefix} ⚠️ No se pudo parsear el prompt JSON:`, e.message);
    }
  }

  if (!isJsonParsed) {
    const masterPromptMarker = /MASTER PROMPT\s*:\s*([\s\S]+)/i;
    const legacyMarker = /PROMPT MAESTRO\s*\(PARA IMAGEN 4 ULTRA\)\s*:\s*([\s\S]+)/i;
    const directPromptMarker = /(?:^|\n)PROMPT\s*:\s*([\s\S]+)/i;
    
    let promptMatch = promptTexto.match(masterPromptMarker) || promptTexto.match(legacyMarker) || promptTexto.match(directPromptMarker);
    if (promptMatch) {
      cleanPromptText = promptMatch[1].trim();
    } else {
      // Fallback: Limpieza básica si no se encuentran las cabeceras estructuradas
      cleanPromptText = promptTexto.replace(/\[DEBUG v\d+.*?\]/gi, "")
        .replace(/```json|```|PROMPT MAESTRO \(PARA IMAGEN 4 ULTRA\):/gi, "")
        .trim();
    }
  }

  try {
    const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY;
    if (!apiKey) throw new Error("API Key de Gemini no configurada.");

    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    // Cambio 5: Reutilizar datos ya cargados si están disponibles
    const dataImg = cachedDataImg || convertirRangoAObjetos(SHEETS.PRODUCT_IMAGES);
    const colMapping = HeaderManager.getMapping("PRODUCT_IMAGES");

    let partsReferencia = [];

    // 1. CARGAR REFERENCIAS ORIGINALES (File API - desacople de carga)
    ids.forEach(id => {
      const row = dataImg.find(r => String(r.IMAGEN_ID).trim() === String(id).trim());
      if (row && row.ARCHIVO_ID) {
        try {
          // Renderizado Pago: resolución 'media' (1024px) para ahorrar tokens de entrada
          // sin perder la referencia visual mínima necesaria para no alucinar.
          const fileDataPart = prepararBlobOptimizado(row.ARCHIVO_ID, `render_ref_${id}`, 'media', apiKey);
          partsReferencia.push(fileDataPart);
        } catch (e) { console.warn(`Error ref ${id}: ${e.message}`); }
      }
    });

    // 2. LÓGICA DE REFINAMIENTO (Si aplica)
    if (refineData && refineData.prevFileId) {
      console.log(`${logPrefix} Refinando con feedback: ${refineData.feedback}`);
      try {
        const refineDataPart = prepararBlobOptimizado(refineData.prevFileId, `refine_prev`);
        partsReferencia.push(refineDataPart);

        // Inyectar instrucción de corrección al prompt
        cleanPromptText = `INSTRUCCIÓN DE CORRECCIÓN: El usuario no está conforme con la imagen generada anteriormente (la última imagen adjunta). 
        FEEDBACK DEL USUARIO: "${refineData.feedback}". 
        Por favor, genera una NUEVA imagen basada en las referencias originales pero aplicando las correcciones solicitadas. 
        Manten la consistencia con las primeras imágenes del set.
        PROMPT ORIGINAL: ${cleanPromptText}`;
      } catch (e) { console.warn(`Error cargando imagen previa para refinar: ${e.message}`); }
    }

    const firstRefRow = dataImg.find(ri => ids.includes(ri.IMAGEN_ID));
    const skuDestino = firstRefRow ? firstRefRow.PRODUCTO_ID : null;
    const targetRow = dataImg.find(r => rowMatchesSku_IMAGENES(r, skuDestino) || ids.includes(r.IMAGEN_ID));
    if (!targetRow) throw new Error("No se pudo determinar el producto destino.");

    // gemini-3.1-flash-image primero (más efectivo según el feedback al capturar detalles y formas como 'baggy' o femenino).
    // Con max 3 refs + time guard, debería completar dentro del límite.
    let variantes = [
      "gemini-3.1-flash-image",
      "gemini-3-pro-image",
      "gemini-2.5-flash-image",
      "imagen-4.0-generate-001",
      "imagen-3.0-generate-001"
    ];

    // Override de modelo si el usuario lo solicita explícitamente vía UI
    if (extraSpecs && extraSpecs.model) {
      if (extraSpecs.model === "gemini-3.1-flash-image" || extraSpecs.model === "gemini-3.1-flash-image-preview") {
        variantes = ["gemini-3.1-flash-image", "gemini-3-pro-image", "gemini-2.5-flash-image"];
        console.log(`${logPrefix} Override de modelo aplicado: Prioridad a ${variantes[0]}`);
      } else if (extraSpecs.model === "gemini-3-pro-image" || extraSpecs.model === "gemini-3-pro-image-preview") {
        variantes = ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-2.5-flash-image"];
        console.log(`${logPrefix} Override de modelo aplicado: Prioridad a ${variantes[0]}`);
      }
    }

    let detallesErrores = [];

    for (const modelo of variantes) {
      // Cambio 4: Time guard — abortar si queda < 1 min
      const elapsed = Date.now() - execStartTime;
      if (elapsed > MAX_EXEC_MS) {
        console.warn(`${logPrefix} ⏱️ Tiempo agotado (${(elapsed / 1000).toFixed(0)}s). Abortando modelos restantes.`);
        break;
      }
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        console.log(`${logPrefix} Probando ${modelo} con ${partsReferencia.length} refs...`);

        // Extraer aspectRatio si viene de frontend
        let ratioToUse = "3:4"; // Default
        if (extraSpecs && extraSpecs.aspectRatio) {
          ratioToUse = extraSpecs.aspectRatio;
          console.log(`${logPrefix} Injectando Relación de Aspecto en config: ${ratioToUse}`);
        }

        const payload = {
          "contents": [{
            "parts": [
              { "text": cleanPromptText },
              ...partsReferencia
            ]
          }],
          "generationConfig": {
            "response_modalities": ["IMAGE"],
            "imageConfig": {
              "aspectRatio": ratioToUse
            }
          },
          "safetySettings": GEMINI_SAFETY_SETTINGS
        };

        const response = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const respCode = response.getResponseCode();
        const resText = response.getContentText();
        let resJson;
        try { resJson = JSON.parse(resText); } catch (e) { resJson = {}; }

        if (respCode === 200) {
          if (resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content && resJson.candidates[0].content.parts) {
            const part = resJson.candidates[0].content.parts.find(p => p.inlineData);
            if (part && part.inlineData && part.inlineData.data) {
              console.log(`✅ ÉXITO con ${modelo}.`);

              let costoEstimado = 0;
              if (resJson.usageMetadata) {
                const promptTokens = resJson.usageMetadata.promptTokenCount || 0;
                const candidatesTokens = resJson.usageMetadata.candidatesTokenCount || 0;

                // --- NUEVO: Tarifario Dinámico ---
                const skuMap = {
                  'gemini-3.1-flash-image': { in: 'A44E-F89C-67C0', out: '1BD4-2AB9-AEFB' },
                  'gemini-3-pro-image': { in: '621F-B428-5221', out: '096D-0370-0236' },
                  'gemini-2.5-flash-image': { in: '74A0-9E74-BEDC', out: '2A8D-CD62-0E04' }
                };

                const pricing = skuMap[modelo] || { in: '621F-B428-5221', out: '096D-0370-0236' }; // Default Pro
                const pIn = getPrecioGCP(pricing.in) || (modelo.includes('flash') ? 0.50 : 2.00);
                const pOut = getPrecioGCP(pricing.out) || (modelo.includes('flash') ? 60.00 : 120.0);

                costoEstimado = (promptTokens * pIn / 1000000) + (candidatesTokens * pOut / 1000000);
              }

              const fileName = `IM3_MASTER_${targetRow.PRODUCTO_ID}_${Date.now()}.png`;
              const uploadRes = procesarSubidaDesdeDashboard(
                targetRow.PRODUCTO_ID,
                part.inlineData.data,
                fileName,
                "image/png",
                targetRow.CARPETA_ID,
                false
              );

              if (uploadRes.success) {
                Utilities.sleep(1000);
                const freshSheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
                const freshDataAll = freshSheetImg.getDataRange().getValues();
                const archIdIdx = colMapping["ARCHIVO_ID"];
                const imgIdIdx = colMapping["IMAGEN_ID"];
                const costoIdx = colMapping["COSTO"];

                let generatedId = null;
                let targetRowIdx = -1;

                for (let r = freshDataAll.length - 1; r >= 1; r--) {
                  if (String(freshDataAll[r][archIdIdx]) === String(uploadRes.fileId)) {
                    generatedId = freshDataAll[r][imgIdIdx];
                    targetRowIdx = r + 1;
                    break;
                  }
                }

                if (targetRowIdx !== -1) {
                  if (costoIdx !== undefined) freshSheetImg.getRange(targetRowIdx, costoIdx + 1).setValue(costoEstimado);
                  const promptIdx = colMapping["PROMPT"];
                  if (promptIdx !== undefined) freshSheetImg.getRange(targetRowIdx, promptIdx + 1).setValue(cleanPromptText);
                  const estadoIdx = colMapping["ESTADO"];
                  if (estadoIdx !== undefined) freshSheetImg.getRange(targetRowIdx, estadoIdx + 1).setValue(true);
                  const fuenteIdx = colMapping["FUENTE"];
                  if (fuenteIdx !== undefined) freshSheetImg.getRange(targetRowIdx, fuenteIdx + 1).setValue('IA_Gemini');
                  const tipoIdx = colMapping["TIPO_ARCHIVO"];
                  if (tipoIdx !== undefined) freshSheetImg.getRange(targetRowIdx, tipoIdx + 1).setValue('image');
                }

                return {
                  success: true,
                  message: "Imagen generada, guardada y registrada con éxito.",
                  cost: costoEstimado,
                  modelUsed: modelo,
                  fileId: uploadRes.fileId,
                  imagenId: generatedId,
                  imageIds: ids // Retornamos los IDs originales
                };
              } else {
                throw new Error("Error al registrar la imagen: " + uploadRes.message);
              }
            }
          }

          let failReason = "Sin imagen en respuesta";
          if (resJson.candidates && resJson.candidates[0] && resJson.candidates[0].finishReason) {
            failReason = `Bloqueado: ${resJson.candidates[0].finishReason}`;
          }

          console.warn(`${logPrefix} ${modelo} retornó 200 pero falló. Razón: ${failReason}. JSON: ${resText.substring(0, 300)}...`);
          detallesErrores.push(`${modelo}: ${failReason}`);
        } else {
          const errMsg = resJson.error ? resJson.error.message : resText;
          console.warn(`${logPrefix} ${modelo} Error HTTP ${respCode}: ${errMsg}`);
          detallesErrores.push(`${modelo} (${respCode}): ${errMsg.substring(0, 100)}`);
        }
      } catch (innerE) {
        detallesErrores.push(`${modelo} EX: ${innerE.message}`);
      }
    }
    throw new Error(`Incapaz de generar imagen. Detalles: ${detallesErrores.join(" | ")}`);
  } catch (e) {
    console.error(`${logPrefix} ERROR FINAL: ${e.message}`);
    throw e;
  }
}

/**
 * ⚡ WRAPPERS PARA EL ROUTER (Main.js)
 */
function generarPromptIA(sku) {
  const ss = getImagesSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
  const data = convertirRangoAObjetos_IMAGENES(sheet);
  const portada = data.find(r => rowMatchesSku_IMAGENES(r, sku) && (String(r.PORTADA).toUpperCase() === 'TRUE'));
  const targetId = portada ? portada.IMAGEN_ID : (data.find(r => rowMatchesSku_IMAGENES(r, sku))?.IMAGEN_ID);

  // Ahora generarSuperPrompt ya incluye la generación de la imagen física si modo es 'image' (default)
  return generarSuperPrompt(targetId, 'ecommerce');
}

/**
 * 🎨 REFINAR UNA IMAGEN EXISTENTE
 */
function ejecutarRefinamientoDesdeDashboard(imagenIdPrev, feedback, pin) {
  try {
    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    const dataImg = convertirRangoAObjetos_IMAGENES(sheetImg);

    // 1. Obtener la imagen que queremos corregir
    const prevRow = dataImg.find(r => String(r.IMAGEN_ID).trim() === String(imagenIdPrev).trim());
    if (!prevRow) throw new Error("No se encontró la imagen previa.");

    const sku = prevRow.PRODUCTO_ID;
    const promptOriginal = prevRow.PROMPT || "Imagen de catálogo ecommerce";

    // 2. Obtener las referencias originales (max 3, priorizando PORTADA)
    const refsRaw = dataImg
      .filter(r => r.PRODUCTO_ID === sku && r.FUENTE !== 'Sistema Web' && r.ARCHIVO_ID);
    // Priorizar: Portada primero, luego por orden original
    refsRaw.sort((a, b) => {
      const aPort = String(a.PORTADA).toUpperCase() === 'TRUE' ? 1 : 0;
      const bPort = String(b.PORTADA).toUpperCase() === 'TRUE' ? 1 : 0;
      return bPort - aPort;
    });
    const refsIds = refsRaw.slice(0, 3).map(r => r.IMAGEN_ID);

    if (refsIds.length === 0) refsIds.push(imagenIdPrev); // Fallback si no hay otras

    const refineData = {
      feedback: feedback,
      prevFileId: prevRow.ARCHIVO_ID
    };

    return JSON.stringify(generarImagenDesdePrompt(refsIds, promptOriginal, pin, refineData, dataImg));

  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

/**
 * 🎨 GENERAR UNA VARIANTE DE ÁNGULO (FASE 5)
 * Usa una imagen "Master" como pivote para mantener consistencia.
 */
function generarVarianteAnguloDesdeDashboard(imagenIdMaster, anguloSolicitado, pin) {
  try {
    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    const dataImg = convertirRangoAObjetos_IMAGENES(sheetImg);

    // 1. Obtener la imagen que usamos como PIVOTE (La que ya salió perfecta)
    const masterRow = dataImg.find(r => String(r.IMAGEN_ID).trim() === String(imagenIdMaster).trim());
    if (!masterRow) throw new Error("No se encontró la imagen maestra.");

    const sku = masterRow.PRODUCTO_ID;
    const promptMaster = masterRow.PROMPT || "Imagen de catálogo ecommerce";

    // 2. Obtener las referencias originales para la textura
    const refsIds = dataImg
      .filter(r => r.PRODUCTO_ID === sku && r.FUENTE !== 'Sistema Web' && r.FUENTE !== 'IA_Gemini' && r.ARCHIVO_ID)
      .slice(0, 5) // Max 5 originales
    // Añadir la MASTER al final como la referencia visual de estilo más importante
    refsIds.push(imagenIdMaster);

    const isGhostMaster = promptMaster.toLowerCase().includes("ghost") || promptMaster.toLowerCase().includes("invisible mannequin") || promptMaster.toLowerCase().includes("hollow");

    // 3. Normalizar el ángulo solicitado para unificar el idioma a inglés (óptimo para la IA de imagen)
    let angleEnglish = String(anguloSolicitado);
    const angleLower = angleEnglish.toLowerCase();
    if (angleLower.includes("3/4") || angleLower.includes("tres cuartos") || angleLower.includes("semi-frontal") || angleLower.includes("semi frontal")) {
      angleEnglish = "a 3/4 side-frontal view";
    } else if (angleLower.includes("espalda") || angleLower.includes("trasera") || angleLower.includes("back")) {
      angleEnglish = "a back view";
    } else if (angleLower.includes("frente") || angleLower.includes("frontal") || angleLower.includes("front")) {
      angleEnglish = "a front view";
    } else if (angleLower.includes("lateral") || angleLower.includes("perfil") || angleLower.includes("side")) {
      angleEnglish = "a side profile view";
    }

    // Inyectamos una instrucción de "Pivoteo"
    const promptAngulo = `
      ANGLE DERIVATION PROTOCOL (PHASE 5):
      - GOAL: Generate ${angleEnglish}.
      - MASTER REFERENCE: The LAST attached image is your absolute style and consistency reference.
      - STRICT RULES:
        ${isGhostMaster ? `
        1. GHOST MANDATE: ABSOLUTELY NO HUMAN MODELS. Maintain the Invisible Mannequin effect.
        2. KEEP exactly the same 3D rendering style and garment volume.
        ` : `
        1. KEEP the same human model (physical traits, skin tone, hair style).
        2. KEEP exactly the same background and environment (same studio/gym/street/room).
        `}
        3. KEEP the same lighting, color grading, and post-processing style.
        4. CHANGE the position/pose of the garment to showcase it from the angle: ${angleEnglish}.
      - CONTEXT LIMITATION: If the original images do not show specific details of this angle (e.g., back view), infer the continuity of the fabric texture in a clean and highly professional manner.
      - MASTER STYLE PROMPT: ${promptMaster.substring(0, 1000)}
    `;

    console.log(`🎨 [Phase-5] Generando ${anguloSolicitado} para SKU ${sku} usando Master ${imagenIdMaster}`);

    return JSON.stringify(generarImagenDesdePrompt(refsIds, promptAngulo, pin));

  } catch (e) {
    console.error(`Error en Phase 5: ${e.message}`);
    return JSON.stringify({ success: false, error: e.message });
  }
}

function rowMatchesSku_IMAGENES(row, sku) {
  return String(row.PRODUCTO_ID || "").trim() === String(sku || "").trim();
}

/**
 * 🎬 EJECUTAR RENDERIZADO DE VIDEO VEO (FASE 6)
 * Llama a la API de VEO 3.1 para generar un video MP4.
 */
function ejecutarRenderizadoVideoVEO(idOrIds, promptVideo, pin) {
  const logPrefix = `🎬 [VEO RENDER]`;
  try {
    if (String(pin) !== String(GLOBAL_CONFIG.GEMINI.PAID_PIN)) {
      throw new Error("PIN de seguridad incorrecto.");
    }

    const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${apiKey}`;

    // 1. Obtener imágenes de referencia (Multimodal Pivot)
    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    const dataImg = convertirRangoAObjetos_IMAGENES(sheetImg);

    const idsToSearch = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const cleanIds = idsToSearch.map(id => String(id).trim());

    // Filtrar candidatos y ordenarlos por "Peso de Referencia"
    // Prioridad: 1. IA + Lifestyle, 2. IA, 3. Portada, 4. Otras
    let candidates = dataImg.filter(r => cleanIds.includes(String(r.IMAGEN_ID).trim()));

    candidates.sort((a, b) => {
      const getScore = (r) => {
        let sc = 0;
        if (r.FUENTE === 'IA_Gemini') sc += 10;
        if (r.PROMPT && r.PROMPT.toLowerCase().includes('lifestyle')) sc += 5;
        if (String(r.PORTADA) === 'TRUE') sc += 3;
        return sc;
      };
      return getScore(b) - getScore(a);
    });

    if (candidates.length === 0) throw new Error(`No se encontraros imágenes de referencia.`);

    // Tomar hasta 3 imágenes (VEO 3.1 Preview limit)
    const topCandidates = candidates.slice(0, 3);
    const row = topCandidates[0]; // Lead reference
    console.log(`${logPrefix} Usando ${topCandidates.length} referencias: ${topCandidates.map(c => c.IMAGEN_ID).join(", ")}`);

    const imageParts = topCandidates.map(row => {
      const file = DriveApp.getFileById(row.ARCHIVO_ID);
      const blob = file.getBlob();
      return {
        "bytesBase64Encoded": Utilities.base64Encode(blob.getBytes()),
        "mimeType": blob.getContentType()
      };
    });

    // 2. Construir Payload Multimodal (Standard VEO 3.1 Preview)
    const payload = {
      "instances": [
        {
          "prompt": promptVideo,
          "image": imageParts[0]
        }
      ],
      "parameters": {}
    };

    console.log(`${logPrefix} Iniciando renderizado para Ref: ${row.IMAGEN_ID}...`);

    const response = UrlFetchApp.fetch(url, {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    });

    const resCode = response.getResponseCode();
    const resText = response.getContentText() || "";
    console.log(`${logPrefix} Response [${resCode}]: ${resText.substring(0, 500)}`);

    if (!resText) {
      throw new Error(`La API respondió con código ${resCode} pero cuerpo vacío.`);
    }

    let resJson;
    try {
      resJson = JSON.parse(resText);
    } catch (e) {
      throw new Error(`Error al parsear respuesta JSON de la API VEO: ${resText.substring(0, 100)}...`);
    }

    if (resCode !== 200) {
      throw new Error(`Error API VEO (${resCode}): ${resJson.error ? resJson.error.message : resText}`);
    }

    // La API de VEO suele devolver una "Operation" (LRO)
    if (resJson.name) {
      console.log(`${logPrefix} Operación iniciada: ${resJson.name}`);
      return JSON.stringify({
        success: true,
        operationId: resJson.name,
        sku: row.PRODUCTO_ID, // Usar PRODUCTO_ID como SKU
        carpetaId: row.CARPETA_ID,
        message: "El renderizado ha comenzado. Esto puede tardar unos minutos."
      });
    }

    throw new Error("La API no devolvió un ID de operación válido (no se encontró 'name' en la respuesta).");

  } catch (e) {
    console.error(`${logPrefix} Error Crítico: ${e.message}`);
    return JSON.stringify({ success: false, error: e.message });
  }
}

/**
 * 📡 VERIFICAR ESTADO DE VIDEO VEO
 */
function verificarEstadoVideoVEO(operationId, sku, carpetaId) {
  const logPrefix = `📡 [VEO STATUS]`;
  try {
    const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/${operationId}?key=${apiKey}`;

    const response = UrlFetchApp.fetch(url, { "muteHttpExceptions": true });
    const resJson = JSON.parse(response.getContentText());

    if (resJson.error) throw new Error(resJson.error.message);

    // Si terminó (done: true)
    if (resJson.done) {
      console.log(`${logPrefix} Full Done Response: ${JSON.stringify(resJson)}`);

      let videoUri = null;
      // Intento 1: Estándar videos[]
      if (resJson.response && resJson.response.videos && resJson.response.videos.length > 0) {
        videoUri = resJson.response.videos[0].uri;
      }
      // Intento 2: Estándar generateVideoResponse (VEO 3.1 Preview)
      else if (resJson.response && resJson.response.generateVideoResponse && resJson.response.generateVideoResponse.generatedSamples) {
        const samples = resJson.response.generateVideoResponse.generatedSamples;
        if (samples.length > 0 && samples[0].video) {
          videoUri = samples[0].video.uri;
        }
      }

      if (videoUri) {
        console.log(`${logPrefix} Video LISTO en URI: ${videoUri}`);

        // PERSISTENCIA EN DRIVE
        let fileId = null;
        let driveUrl = null;
        try {
          if (videoUri.startsWith("http")) {
            // Asegurar que la descarga tenga la API Key
            const downloadUrl = (videoUri.includes("generativelanguage") && !videoUri.includes("key="))
              ? `${videoUri}${videoUri.includes("?") ? "&" : "?"}key=${apiKey}`
              : videoUri;

            console.log(`${logPrefix} Intentando persistencia en Drive desde: ${downloadUrl}`);
            const videoFetch = UrlFetchApp.fetch(downloadUrl, { muteHttpExceptions: true });

            if (videoFetch.getResponseCode() === 200) {
              const videoBlob = videoFetch.getBlob();
              const fileName = `VEO_${sku || "PROD"}_${Date.now()}.mp4`;
              const base64Video = Utilities.base64Encode(videoBlob.getBytes());

              const uploadRes = procesarSubidaDesdeDashboard(sku, base64Video, fileName, "video/mp4", carpetaId);
              if (uploadRes.success) {
                fileId = uploadRes.fileId;
                driveUrl = `https://drive.google.com/file/d/${fileId}/view`;
                console.log(`${logPrefix} ✅ Video guardado en Drive: ${fileId}`);

                // REGISTRO DE COSTO VEO ($0.25 USD Estándar por generación)
                try {
                  const ss = getImagesSpreadsheet();
                  const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
                  const dataImg = convertirRangoAObjetos_IMAGENES(sheetImg);
                  const colMapping = HeaderManager.getMapping("PRODUCT_IMAGES");
                  const costoIdx = colMapping["COSTO"];

                  // Buscar la fila por ARCHIVO_ID del video recién subido
                  const freshData = sheetImg.getDataRange().getValues();
                  const archIdIdx = colMapping["ARCHIVO_ID"];
                  for (let r = freshData.length - 1; r >= 1; r--) {
                    if (String(freshData[r][archIdIdx]) === String(fileId)) {
                      if (costoIdx !== undefined) {
                        sheetImg.getRange(r + 1, costoIdx + 1).setValue(0.25); // Costo VEO
                      }
                      break;
                    }
                  }
                } catch (eCosto) { console.error(`${logPrefix} Error registrando costo VEO: ${eCosto.message}`); }
              } else {
                console.error(`${logPrefix} ❌ Error en subida a Drive: ${uploadRes.message}`);
              }
            } else {
              console.error(`${logPrefix} ❌ Error de descarga API [${videoFetch.getResponseCode()}]: ${videoFetch.getContentText()}`);
            }
          }
        } catch (e) {
          console.error(`${logPrefix} ❌ Exception en persistencia: ${e.message}`);
        }

        return JSON.stringify({
          success: true,
          done: true,
          videoUri: videoUri, // Mantener original por si acaso
          fileId: fileId,
          driveUrl: driveUrl,
          message: fileId ? "Video generado y guardado en Drive con éxito." : "Video generado pero falló el guardado automático."
        });
      }
      throw new Error("La operación terminó pero no se encontró la ruta del video en la respuesta.");
    }

    return JSON.stringify({ success: true, done: false, message: "Aún procesando..." });

  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}


/**
 * 📊 OBTENER RESUMEN DE GASTOS IA
 * Suma los valores de la columna COSTO agrupados por tipo para el modal de auditoría.
 */
function obtenerResumenGastosIA() {
  const logPrefix = `📊 [COST AUDIT]`;
  try {
    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    if (!sheetImg) return { success: false, error: "Hoja de imágenes no encontrada." };

    const data = convertirRangoAObjetos_IMAGENES(sheetImg);
    let totalImagen = 0;
    let totalVideo = 0;

    data.forEach(row => {
      // Intentar obtener el costo de varias formas para mayor robustez heredada
      let costoRaw = row.COSTO || row.COSTO_IA || "0";
      const costo = parseFloat(String(costoRaw).replace(",", ".")) || 0;

      const tipo = String(row.TIPO_ARCHIVO || "").toLowerCase();
      const esVideo = tipo.includes('video') || tipo.includes('veo');

      if (esVideo) {
        totalVideo += costo;
      } else if (costo > 0) {
        totalImagen += costo;
      }
    });

    const totalGlobal = totalImagen + totalVideo;

    return {
      success: true,
      data: {
        imagen: totalImagen.toFixed(3),
        video: totalVideo.toFixed(3),
        total: totalGlobal.toFixed(3),
        moneda: "USD",
        count: data.length
      }
    };
  } catch (e) {
    console.error(`${logPrefix} Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * 🚀 SUBIDA DE IMÁGENES A WORDPRESS (RESTAURADA)
 * Filtra imágenes activas de un SKU y las envía al proxy PHP.
 */
function subirImagenesProductoWP(sku) {
  const logArray = [];
  const subidas = [];
  const omitidas = [];
  const errores = [];
  try {
    const ss = getImagesSpreadsheet();
    const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
    const dataRows = sheetImg.getDataRange().getValues();
    const headers = dataRows[0].map(h => String(h).trim().toUpperCase());
    const colId = headers.indexOf('IMAGEN_ID');
    const colSync = headers.indexOf('SYNC_WC');
    const colEstado = headers.indexOf('ESTADO');
    const colSku = headers.indexOf('PRODUCTO_ID');

    // Convertir a objetos para facilitar filtrado
    const data = convertirRangoAObjetos_IMAGENES(sheetImg);
    const imagenes = data.filter(r => String(r.PRODUCTO_ID) === String(sku) && (String(r.ESTADO).toUpperCase() === 'TRUE'));

    if (imagenes.length === 0) throw new Error("No hay imágenes activas para este SKU.");

    logArray.push(`🚀 Iniciando subida de ${imagenes.length} imágenes para SKU: ${sku}`);

    imagenes.forEach(img => {
      try {
        const file = DriveApp.getFileById(img.ARCHIVO_ID);
        const base64 = Utilities.base64Encode(file.getBlob().getBytes());

        const payload = {
          apiKey: GLOBAL_CONFIG.WORDPRESS.IMAGE_API_KEY,
          sku: sku,
          fileName: file.getName(),
          imageData: base64,
          is_cover: String(img.PORTADA).toUpperCase() === 'TRUE',
          orden: img.ORDEN || 999
        };

        const options = {
          method: 'post',
          payload: payload,
          muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(GLOBAL_CONFIG.WORDPRESS.IMAGE_API_URL, options);
        const resText = response.getContentText();
        let resJson;
        try { resJson = JSON.parse(resText); } catch (e) { resJson = { status: 'error', message: resText }; }

        // Mapeo de fila en la hoja real para actualización
        let rowIndex = -1;
        for (let i = 1; i < dataRows.length; i++) {
          if (String(dataRows[i][colId]) === String(img.IMAGEN_ID)) {
            rowIndex = i + 1;
            break;
          }
        }

        if (resJson.status === 'success') {
          subidas.push(file.getName());
          logArray.push(`✅ ${file.getName()}: ${resJson.message}`);
          if (rowIndex !== -1 && colSync !== -1) sheetImg.getRange(rowIndex, colSync + 1).setValue(true);
        } else if (resJson.status === 'skip' || (resJson.message && resJson.message.toLowerCase().includes('existe'))) {
          omitidas.push(file.getName());
          logArray.push(`ℹ️ ${file.getName()}: Ya existe en servidor.`);
          if (rowIndex !== -1 && colSync !== -1) sheetImg.getRange(rowIndex, colSync + 1).setValue(true);
        } else {
          errores.push(file.getName());
          logArray.push(`❌ ${file.getName()}: ${resJson.message}`);
        }
      } catch (e) {
        logArray.push(`❌ Error en archivo ${img.ARCHIVO_ID}: ${e.message}`);
      }
    });

    // Lógica de Sincronización Automática (Ahora 100% fondo)
    if (subidas.length > 0 || omitidas.length > 0 || imagenes.length > 0) {
      logArray.push(`🔄 Ejecutando sincronización final en segundo plano...`);
      _ejecutarSincronizacionAuto(sku, logArray);
    }

    const msg = subidas.length > 0 ? `Subida exitosa de ${subidas.length} archivos nuevos.` : (omitidas.length > 0 ? "Galería sincronizada (sin cambios)." : "No se procesaron archivos.");
    return { success: true, message: msg, logs: logArray };
  } catch (e) {
    return { success: false, message: e.message, logs: logArray };
  }
}

/**
 * 🔄 EJECUTAR SINCRONIZACIÓN AUTOMÁTICA EN WORDPRESS
 * Llama al endpoint PHP de sincronización que escanea la carpeta SKU.
 */
function _ejecutarSincronizacionAuto(sku, logArray) {
  try {
    const baseUrl = GLOBAL_CONFIG.WORDPRESS.SITE_URL;
    const apiKey = GLOBAL_CONFIG.WORDPRESS.IMAGE_API_KEY;
    const url = `${baseUrl}?sincronizar_imagenes_castfer=1&apiKey=${apiKey}&sku=${sku}`;

    logArray.push(`🔄 Llamando a sincronización automática para SKU ${sku}...`);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    logArray.push(`📄 Respuesta Server: ${response.getContentText().substring(0, 5000)}`);
  } catch (e) {
    logArray.push(`❌ Error en _ejecutarSincronizacionAuto: ${e.message}`);
  }
}

/**
 * FASE 5: Verifica si hay productos nuevos en la caché y retorna el delta
 * @param {string[]} skusExistentes Arreglo de SKUs que el frontend ya tiene cargados
 * @returns { success: boolean, hasNew: boolean, products: [] }
 */
function checkNewProductsFlag(skusExistentes) {
  try {
    const cache = CacheService.getScriptCache();
    const hasNewFlag = cache.get("NEW_PRODUCTS_AVAILABLE");
    const noNewFlag = cache.get("NO_NEW_PRODUCTS");

    // Si explícitamente no hay nuevos productos (caché negativa activa), y no se ha forzado el flag de nuevos,
    // retornamos una salida rápida (10ms) sin leer la hoja.
    if (!hasNewFlag && noNewFlag === "true") {
      return { success: true, hasNew: false };
    }

    // Leemos la hoja de productos
    const ss = getImagesSpreadsheet();
    const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
    const mapping = HeaderManager.getMapping("PRODUCTS");

    if (!sheetProd || !mapping) throw new Error("Falta hoja o mapeo de productos");

    const data = sheetProd.getDataRange().getValues();
    const idxSku = mapping["CODIGO_ID"];
    const idxNombre = mapping["MODELO"];
    const idxCarpeta = mapping["CARPETA_ID"];
    const idxCategoria = mapping["CATEGORIA"];

    // Soporte para ambos nombres de columna (Alias)
    const idxCatPadre = (mapping["CATEGORIA_PADRE"] !== undefined) ? mapping["CATEGORIA_PADRE"] : mapping["CATEGORIA_GENERAL"];
    const idxWoo = mapping["WOO_ID"];

    const nuevosProductos = [];
    const setExistentes = new Set((skusExistentes || []).map(String));

    for (let i = 1; i < data.length; i++) {
      try {
        const row = data[i];
        if (idxSku === undefined) break; // Error crítico de mapeo

        const sku = String(row[idxSku]).trim();
        if (sku && sku !== "" && !setExistentes.has(sku)) {
          // Extracción segura (si el índice no existe, devuelve cadena vacía en lugar de romper el script)
          const getVal = (idx) => (idx !== undefined && row[idx] !== undefined) ? String(row[idx]).trim() : "";

          nuevosProductos.push({
            sku: sku,
            nombre: getVal(idxNombre) || "Sin Nombre",
            carpeta_id: getVal(idxCarpeta),
            category: getVal(idxCategoria),
            parentCategory: getVal(idxCatPadre),
            woo_id: getVal(idxWoo),
            thumbnail: ""
          });
        }
      } catch (eRow) {
        console.error(`Error procesando fila ${i} en checkNewProductsFlag: ${eRow.message}`);
      }
    }

    // Si encontramos y enviamos los nuevos
    if (nuevosProductos.length > 0) {
      // Configuramos el flag de nuevos (para otros clientes que no los hayan cargado)
      cache.put("NEW_PRODUCTS_AVAILABLE", "true", 90);
      cache.remove("NO_NEW_PRODUCTS");
      return { success: true, hasNew: true, products: nuevosProductos };
    } else {
      // Si no hay nuevos, configuramos la caché negativa por 30 segundos para no saturar lecturas
      cache.put("NO_NEW_PRODUCTS", "true", 30);
      return { success: true, hasNew: false };
    }

  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Función Auxiliar: Asigna una portada aleatoria (PORTADA=TRUE) 
 * a todos los productos (SKU) que tengan imágenes en su galería 
 * pero que actualmente no tengan ninguna designada como portada.
 */
function asignarPortadasAleatorias() {
  const ss = getImagesSpreadsheet();
  const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
  const data = sheetImg.getDataRange().getValues();

  if (data.length <= 1) return { success: false, message: "No hay imágenes en la BD." };

  const headers = data[0].map(h => String(h).trim().toUpperCase());
  const colSku = headers.indexOf('PRODUCTO_ID');
  const colPortada = headers.indexOf('PORTADA');

  if (colSku === -1 || colPortada === -1) {
    return { success: false, message: "Faltan columnas (PRODUCTO_ID o PORTADA)." };
  }

  // Agrupar filas por producto
  const groupedProducts = {};
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][colSku]).trim();
    const isPortada = String(data[i][colPortada]).toUpperCase() === 'TRUE';

    if (sku) {
      if (!groupedProducts[sku]) {
        groupedProducts[sku] = {
          hasPortada: false,
          rows: []
        };
      }
      groupedProducts[sku].rows.push(i + 1); // 1-indexed for the sheet row
      if (isPortada) {
        groupedProducts[sku].hasPortada = true;
      }
    }
  }

  let countModificados = 0;

  // Analizar y asignar una portada aleatoria si es necesario
  for (const sku in groupedProducts) {
    const productData = groupedProducts[sku];

    if (!productData.hasPortada && productData.rows.length > 0) {
      // Seleccionar una fila al azar de la galería
      const randomIndex = Math.floor(Math.random() * productData.rows.length);
      const targetRow = productData.rows[randomIndex];

      // Asignar el valor TRUE a esa nueva fila
      sheetImg.getRange(targetRow, colPortada + 1).setValue(true);
      countModificados++;
    }
  }

  const resultMsg = countModificados > 0
    ? `✅ Se asignaron portadas aleatorias a ${countModificados} productos que estaban sin portada.`
    : `ℹ️ Todos los productos ya tienen asignada una portada preexistente.`;

  console.log(resultMsg);
  return { success: true, message: resultMsg, count: countModificados };
}

/**
 * Busca la imagen de "Portada" con prompt ya generado para un SKU.
 */
function obtenerReferenciaMaestra(sku) {
  const ss = getImagesSpreadsheet();
  const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
  const data = convertirRangoAObjetos_IMAGENES(sheetImg);

  const SKU_NORM = String(sku).trim().toUpperCase();

  // Buscar imagen que sea PORTADA y tenga PROMPT
  return data.find(r =>
    String(r.PRODUCTO_ID).trim().toUpperCase() === SKU_NORM &&
    (String(r.PORTADA).toUpperCase() === 'TRUE' || r.PORTADA === true) &&
    (r.PROMPT && String(r.PROMPT).trim() !== "")
  );
}

/**
 * Prepara el prompt multimodal (combinando datos y visual) para la IA.
 */
function prepararPromptDescripcionIA(referencia, prodObj) {
  const visualContext = referencia.PROMPT || "Sin descripción visual detallada.";

  const prompt = `
    ESTRES DE ROL: Eres un experto en Copywriting para E-commerce de moda y calzado.
    TU OBJETIVO: Crear una descripción de producto irresistible y una guía de talles técnica basada en datos y contexto visual.

    DATOS DEL PRODUCTO:
    - Modelo: ${prodObj.MODELO || 'N/A'}
    - Marca: ${prodObj.MARCA || 'HostingShop'}
    - Categoría: ${prodObj.CATEGORIA || 'N/A'}
    - Material: ${prodObj.MATERIAL || 'N/A'}
    - Temporada: ${prodObj.TEMPORADA || 'N/A'}
    - Atributos visuales detectados previamente: ${visualContext}

    REQUISITOS DE RESPUESTA (JSON ÚNICAMENTE):
    Retorna un objeto JSON con esta estructura exacta:
    {
      "corta": "Frase de máximo 15 palabras con alto impacto y emojis.",
      "fichatecnica": "Contenido HTML usando <p>, <ul>, <li>. No uses estilos en línea. Enfócate en beneficios y calidad.",
      "tabla_talles": "Estructura HTML <table> con filas <tr> y celdas <td> representando una guía de talles lógica para este tipo de producto (ej: S, M, L, XL o Talles 36-45)."
    }

    NOTAS IMPORTANTES:
    - No inventes datos que contradigan los proporcionados.
    - La tabla de talles debe ser estándar para su categoría si no se especifica.
    - El tono debe ser profesional pero cercano.
  `;

  return prompt;
}
/**
 * Importa el tarifario de Google Cloud desde un CSV
 * @param {string} csvData Contenido del CSV
 */
function importarTarifarioGCP(csvData) {
  const logPrefix = `📊 [Tarifario-GCP]`;
  try {
    if (!csvData) throw new Error("No se recibieron datos.");
    const ss = getImagesSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.TARIFARIO_GCP);
    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.TARIFARIO_GCP);
      sheet.appendRow(["SKU_ID", "SKU_DESC", "UNIDAD", "CANTIDAD_BASE", "PRECIO_LISTA", "ULTIMA_ACTUALIZACION"]);
      sheet.setFrozenRows(1);
    }

    const rows = Utilities.parseCsv(csvData);
    if (rows.length < 2) throw new Error("CSV inválido.");
    const headers = rows[0];
    const idxSkuId = headers.findIndex(h => h.includes("ID de SKU") || h.includes("SKU_ID"));
    const idxDesc = headers.findIndex(h => h.includes("Descripción del SKU") || h.includes("SKU_DESC"));
    const idxUnidad = headers.findIndex(h => h.includes("Descripción de la unidad") || h === "UNIDAD");
    const idxPrecio = headers.findIndex(h => h.includes("Precio de lista") || h === "PRECIO_LISTA");

    const finalRows = [];
    const fecha = new Date();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[idxSkuId]) continue;
      const p = parseFloat(String(r[idxPrecio]).replace(/[$,]/g, '')) || 0;
      finalRows.push([r[idxSkuId], r[idxDesc], r[idxUnidad], 1000000, p, fecha]);
    }

    if (finalRows.length > 0) {
      if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).clearContent();
      sheet.getRange(2, 1, finalRows.length, 6).setValues(finalRows);
      return { success: true, message: `Importadas ${finalRows.length} tarifas de Google Cloud.` };
    }
    return { success: false, error: "No se encontraron filas válidas." };
  } catch (e) { return { success: false, error: e.message }; }
}

/**
 * Obtiene el precio de lista para un SKU específico desde la DB local
 * @param {string} skuId El ID del SKU de Google Cloud
 * @returns {number|null} El precio por 1.000.000 unidades
 */
function getPrecioGCP(skuId) {
  try {
    const ss = getImagesSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.TARIFARIO_GCP);
    if (!sheet) return null;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(skuId).trim()) return parseFloat(data[i][4]);
    }
  } catch (e) { }
}

/**
 * Descarga masiva de imágenes empacadas en un ZIP (.zip)
 */
function descargarImagenesBatch(sku, ids) {
  try {
    const blobs = [];
    for (const id of ids) {
      try {
        const f = DriveApp.getFileById(id);
        const b = f.getBlob();
        b.setName(sku + '/' + f.getName());
        blobs.push(b);
      } catch (e) { }
    }
    if (!blobs.length) return { success: false, message: 'No se hallaron los archivos en Drive para armar el ZIP.' };

    const zipBlob = Utilities.zip(blobs, sku + '_export.zip');
    return {
      success: true,
      base64: Utilities.base64Encode(zipBlob.getBytes()),
      filename: sku + '_export.zip'
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Descarga de una sola imagen cruda
 */
function descargarImagenUnica(sku, id) {
  try {
    const f = DriveApp.getFileById(id);
    return {
      success: true,
      base64: Utilities.base64Encode(f.getBlob().getBytes()),
      filename: f.getName(),
      mimeType: f.getMimeType()
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Marca un producto como 'PENDIENTE_AUDITORIA' y notifica por Telegram.
 */
function img_marcarPendienteAuditoria(sku, cantidadNuevas) {
  try {
    // 1. Actualizar estado en BD_PRODUCTOS
    actualizarMetadatoProducto(sku, "ESTADO_SINCRONIZACION", "PENDIENTE_AUDITORIA");

    // 2. Notificar por Telegram
    const config = GLOBAL_CONFIG.TELEGRAM;
    if (config.BOT_TOKEN && config.CHAT_ID) {
      const msg = `📸 <b>NUEVAS IMÁGENES DETECTADAS</b>\n\n` +
        `• <b>Producto:</b> <code>${sku}</code>\n` +
        `• <b>Cantidad:</b> ${cantidadNuevas} archivos\n` +
        `• <b>Acción:</b> Sincronización AppSheet\n\n` +
        `🚀 El producto ha sido marcado como <b>PENDIENTE DE AUDITORÍA</b>. Revisa el Dashboard de Imágenes para generar contenido IA.`;

      const keyboard = {
        inline_keyboard: [
          [{ text: "🖼️ Ver en Dashboard", url: ScriptApp.getService().getUrl() + "?view=imagenes_manager" }]
        ]
      };

      enviarMensajeTelegramCompleto(config.CHAT_ID, msg, keyboard);
    }
    return true;
  } catch (e) {
    console.error(`Error en img_marcarPendienteAuditoria: ${e.message}`);
    return false;
  }
}

/**
 * Helper para obtener o crear una subcarpeta(evita duplicados)
 */
function obtenerOCrearSubcarpeta(parentFolder, subFolderName) {
  const folders = parentFolder.getFoldersByName(subFolderName);
  if (folders.hasNext()) return folders.next();
  return parentFolder.createFolder(subFolderName);
}

