/**
 * =================================================================
 * ===           MÓDULO DE SINCRONIZACIÓN RESELLER (V3.4)        ===
 * =================================================================
 * Robustez extrema: Detección inteligente de precios y mapeo flexible.
 */

/**
 * [LADO CLIENTE / ORIGEN]
 * Obtiene el precio mínimo de las variedades de un producto.
 */
function reseller_getMinPriceForProduct(productId) {
  const mapping = HeaderManager.getMapping("PRODUCT_VARIETIES");
  if (!mapping) return null;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PRODUCT_VARIETIES);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();

  const colProdId = mapping["PRODUCTO_ID"];
  
  // Prioridad absoluta a PRECIO_UNITARIO según pedido del usuario
  let colPrecio = undefined;
  const posiblesNombresPrecio = ["PRECIO_UNITARIO", "PRECIOUNITARIO", "PRECIO"];
  
  for (let nombre of posiblesNombresPrecio) {
    if (mapping[nombre] !== undefined) {
      colPrecio = mapping[nombre];
      break;
    }
  }

  const colEstado = mapping["ESTADO"];

  if (colPrecio === undefined) {
    console.warn(`[RESELLER] No se encontró ninguna columna de precio en '${SHEETS.PRODUCT_VARIETIES}'. Revisar encabezados.`);
    return null;
  }

  let minPrice = Infinity;
  let found = false;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[colProdId]) === String(productId)) {
      // Ignorar variaciones inactivas si existe la columna estado
      if (colEstado !== undefined) {
        const est = String(row[colEstado]).toUpperCase();
        if (est === "INACTIVO" || est === "FALSE") continue;
      }

      const precio = parseFloat(row[colPrecio]);
      if (!isNaN(precio) && precio > 0) {
        if (precio < minPrice) minPrice = precio;
        found = true;
      }
    }
  }

  return found ? minPrice : null;
}

/**
 * [LADO CLIENTE / ORIGEN]
 * Recopila productos y los envía al revendedor.
 */
function reseller_sendBatchByCategory(categoryId) {
  const log = [];
  log.push(`📦 Iniciando exportación v3.4 para categoría: ${categoryId}`);

  const destinationUrl = GLOBAL_CONFIG.SCRIPT_CONFIG["RESELLER_DESTINATION_URL"];
  if (!destinationUrl) throw new Error("Falta RESELLER_DESTINATION_URL");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Productos
  const sheetProds = ss.getSheetByName(SHEETS.PRODUCTS);
  const prodMapping = HeaderManager.getMapping("PRODUCTS");
  const prodsData = sheetProds.getDataRange().getValues();

  // 2. Stock (Filtro > 10)
  const invMapping = HeaderManager.getMapping("INVENTORY");
  const invData = ss.getSheetByName(SHEETS.INVENTORY).getDataRange().getValues();
  const stockMap = {};
  for (let i = 1; i < invData.length; i++) {
    const pid = invData[i][invMapping["PRODUCTO_ID"]];
    const stock = parseFloat(invData[i][invMapping["STOCK_ACTUAL"]]) || 0;
    stockMap[pid] = (stockMap[pid] || 0) + stock;
  }

  // 3. Imágenes
  const imgMapping = HeaderManager.getMapping("PRODUCT_IMAGES");
  const imgData = ss.getSheetByName(SHEETS.PRODUCT_IMAGES).getDataRange().getValues();
  const imagesMap = {};
  const headersFaltantesImg = [];

  for (let i = 1; i < imgData.length; i++) {
    const row = imgData[i];
    const pid = row[imgMapping["PRODUCTO_ID"]];
    const estado = row[imgMapping["ESTADO"]] !== undefined ? String(row[imgMapping["ESTADO"]]).toUpperCase() : "";
    
    if (estado !== "TRUE") continue;
    if (!imagesMap[pid]) imagesMap[pid] = [];
    
    if (imagesMap[pid].length < 10) {
        const imgObj = {};
        SHEET_SCHEMA.PRODUCT_IMAGES.forEach(col => {
            const fuzzyCol = col.replace(/[\s_-]/g, "");
            const idx = imgMapping[col] !== undefined ? imgMapping[col] : imgMapping[fuzzyCol];
            if (idx !== undefined) {
                imgObj[col] = row[idx];
            } else {
                if (!headersFaltantesImg.includes(col)) headersFaltantesImg.push(col);
            }
        });
        imagesMap[pid].push(imgObj);
    }
  }

  // 4. Payload
  const payload = [];
  const prodColumns = SHEET_SCHEMA.PRODUCTS;
  const headersFaltantesProd = [];

  for (let i = 1; i < prodsData.length; i++) {
    const row = prodsData[i];
    if (row[prodMapping["CATEGORIA"]] === categoryId) {
      const pid = row[prodMapping["CODIGO_ID"]];
      if ((stockMap[pid] || 0) > 10) {
        const minPrice = reseller_getMinPriceForProduct(pid);
        
        const productObj = {};
        prodColumns.forEach(col => {
          if (col === "PRECIO_COSTO") {
            productObj[col] = minPrice;
          } else if (col !== "WOO_ID") {
            const fuzzyCol = col.replace(/[\s_-]/g, "");
            const idx = prodMapping[col] !== undefined ? prodMapping[col] : prodMapping[fuzzyCol];
            if (idx !== undefined) {
                productObj[col] = row[idx];
            } else {
                if (!headersFaltantesProd.includes(col)) headersFaltantesProd.push(col);
            }
          }
        });

        payload.push({
          product: productObj,
          images: imagesMap[pid] || []
        });
      }
    }
  }

  if (headersFaltantesProd.length > 0) log.push(`⚠️ Headers Productos Faltantes: ${headersFaltantesProd.join(", ")}`);
  if (headersFaltantesImg.length > 0) log.push(`⚠️ Headers Imágenes Faltantes: ${headersFaltantesImg.join(", ")}`);

  if (payload.length === 0) return { success: false, message: "Sin productos elegibles (>10 stock)", logs: log };

  // 5. Envío
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      accion: "importar_reseller",
      data: payload,
      token: GLOBAL_CONFIG.SCRIPT_CONFIG["RESELLER_SYNC_TOKEN"] || "RESELLER_SYNC_TOKEN_V1"
    })
  };

  try {
    const response = UrlFetchApp.fetch(destinationUrl, options);
    const result = JSON.parse(response.getContentText());
    if (typeof debugLog === 'function') debugLog(`[RESELLER] Sincronización exitosa v3.4`);
    return { success: true, message: result.message, logs: log };
  } catch (e) {
    if (typeof debugLog === 'function') debugLog(`[RESELLER] Error crítico envío: ${e.message}`);
    return { success: false, message: e.message, logs: log };
  }
}

/**
 * [LADO PERSONAL / DESTINO]
 */
function reseller_handleImport(payload) {
  if (!payload || !Array.isArray(payload)) return { success: false, message: "Payload inválido" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetProds = ss.getSheetByName(SHEETS.PRODUCTS);
  const prodMapping = HeaderManager.getMapping("PRODUCTS");
  const prodsData = sheetProds.getDataRange().getValues();
  const prodColumns = SHEET_SCHEMA.PRODUCTS;

  const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
  const imgMapping = HeaderManager.getMapping("PRODUCT_IMAGES");
  const imgColumns = SHEET_SCHEMA.PRODUCT_IMAGES;

  const imagesToInsert = [];
  const pidsToSync = [];

  const lastColProd = sheetProds.getLastColumn();
  const lastColImg = sheetImg.getLastColumn();

  payload.forEach(item => {
    const p = item.product;
    const images = item.images;
    pidsToSync.push(p.CODIGO_ID);

    // 1. LOCALIZAR O PREPARAR FILA DE PRODUCTO
    let prodRowIndex = -1;
    let currentRowData = [];

    for (let i = 1; i < prodsData.length; i++) {
        if (String(prodsData[i][prodMapping["CODIGO_ID"]]) === String(p.CODIGO_ID)) {
            prodRowIndex = i + 1;
            currentRowData = prodsData[i];
            break;
        }
    }

    // Si no existe, creamos una fila vacía con el ancho real de TU hoja
    if (prodRowIndex === -1) {
        currentRowData = new Array(lastColProd).fill("");
    }

    // 2. ACTUALIZAR SOLO LAS COLUMNAS QUE EXISTEN EN EL ENVÍO
    // Iteramos sobre las columnas que TU tienes en tu hoja
    for (const colName in prodMapping) {
        const colIdx = prodMapping[colName];
        if (colIdx === undefined || colIdx >= lastColProd) continue;

        // Si el cliente envió este dato, lo actualizamos
        if (p[colName] !== undefined && p[colName] !== null) {
            currentRowData[colIdx] = p[colName];
        }

        // Lógica especial para fechas
        if (colName === "ULTIMA_ACTUALIZACION") {
          currentRowData[colIdx] = new Date();
        }
    }

    // 3. GUARDAR CAMBIOS
    if (prodRowIndex !== -1) {
        sheetProds.getRange(prodRowIndex, 1, 1, lastColProd).setValues([currentRowData.slice(0, lastColProd)]);
    } else {
        sheetProds.appendRow(currentRowData.slice(0, lastColProd));
    }

    // 4. PROCESAR IMÁGENES (Misma lógica de protección)
    images.forEach(img => {
      const imgRow = new Array(lastColImg).fill("");
      for (const colName in imgMapping) {
          const colIdx = imgMapping[colName];
          if (colIdx === undefined || colIdx >= lastColImg) continue;

          let val = img[colName];
          if (val !== undefined && val !== null) imgRow[colIdx] = val;

          // Forzado de IDs y Fuente
          if (colName === "PRODUCTO_ID") imgRow[colIdx] = p.CODIGO_ID;
          if (colName === "FUENTE") imgRow[colIdx] = "RESELLER_SYNC";
      }
      imagesToInsert.push(imgRow);
    });
  });

  const currentImgs = sheetImg.getDataRange().getValues();
  for (let i = currentImgs.length - 1; i >= 1; i--) {
    if (pidsToSync.includes(String(currentImgs[i][imgMapping["PRODUCTO_ID"]]))) {
      sheetImg.deleteRow(i + 1);
    }
  }

  if (imagesToInsert.length > 0) {
    sheetImg.getRange(sheetImg.getLastRow() + 1, 1, imagesToInsert.length, imgColumns.length).setValues(imagesToInsert);
  }

  reseller_scheduleInventoryJob(pidsToSync);

  return { success: true, message: `Sincronización v3.4 terminada con éxito. Auditoría en progreso.` };
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

