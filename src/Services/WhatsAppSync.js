/**
 * =====================================================================================
 * ARCHIVO: WhatsAppSync.js
 * RESPONSABILIDAD: Importación de Catálogo de WhatsApp Business desde Archivo CSV
 * OPCCIÓN A: Cero APIs complejas de Meta, 100% estable y libre de mantenimiento.
 * Procesa un archivo CSV subido a la carpeta TEMP_UPLOADS de tu Google Drive.
 * =====================================================================================
 */

/**
 * Función principal para importar el catálogo de WhatsApp desde un archivo CSV.
 * Busca cualquier archivo CSV en la carpeta TEMP_UPLOADS del cliente y lo procesa.
 */
function importarWhatsAppCatalogDesdeCSV() {
  const logArray = [];
  const log = (msg) => {
    const time = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT-3", "HH:mm:ss");
    logArray.push(`[WA-CSV-IMPORT] [${time}] ${msg}`);
    console.log(`[WA-CSV-IMPORT] ${msg}`);
  };

  log("🚀 Iniciando importación de Catálogo WhatsApp desde Drive (Opción A)...");

  try {
    const ss = getActiveSS();
    if (!ss) throw new Error("No se pudo obtener la hoja de cálculo activa.");

    // 1. Obtener carpetas de Drive configuradas
    const tempFolderId = GLOBAL_CONFIG.DRIVE.TEMP_FOLDER_ID; // Carpeta TEMP_UPLOADS
    const imagesFolderId = GLOBAL_CONFIG.DRIVE.PARENT_FOLDER_ID; // Carpeta base de imágenes (Images)

    if (!tempFolderId || !imagesFolderId) {
      throw new Error("Falta configurar DRIVE_TEMP_FOLDER_ID o DRIVE_PARENT_FOLDER_ID en la base de datos.");
    }

    // 2. Buscar archivo CSV de catálogo de WhatsApp en la carpeta TEMP_UPLOADS
    const tempFolder = DriveApp.getFolderById(tempFolderId);
    const files = tempFolder.getFiles();
    let csvFile = null;

    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName().toLowerCase();
      // Buscar archivos con extensión .csv o nombres que contengan "catalogo_whatsapp"
      if (name.endsWith(".csv") || file.getMimeType() === "text/csv") {
        csvFile = file;
        break; // Procesar el primero que encontremos
      }
    }

    if (!csvFile) {
      const noFileMsg = "⚠️ No se encontró ningún archivo CSV en tu carpeta 'TEMP_UPLOADS'.\n\n" +
        "1. Ejecuta el Extractor de Consola en WhatsApp Web para descargar tu CSV.\n" +
        "2. Sube el archivo CSV a la carpeta 'TEMP_UPLOADS' de tu Google Drive.\n" +
        "3. Vuelve a ejecutar este proceso.";
      log(noFileMsg);
      
      try {
        SpreadsheetApp.getUi().alert("📁 Archivo CSV No Encontrado", noFileMsg, SpreadsheetApp.getUi().ButtonSet.OK);
      } catch (uiErr) {}
      
      return { success: false, message: "Archivo CSV no encontrado en TEMP_UPLOADS." };
    }

    log(`📂 Archivo CSV detectado: "${csvFile.getName()}" (Tamaño: ${(csvFile.getSize() / 1024).toFixed(2)} KB)`);

    // 3. Leer y parsear el archivo CSV
    const csvContentStr = csvFile.getBlob().getDataAsString("UTF-8");
    let csvData;
    try {
      csvData = Utilities.parseCsv(csvContentStr);
    } catch (parseErr) {
      // Reintentar con codificación ISO-8859-1 si UTF-8 falla por acentos
      const fallbackContent = csvFile.getBlob().getDataAsString("ISO-8859-1");
      csvData = Utilities.parseCsv(fallbackContent);
    }

    if (csvData.length <= 1) {
      throw new Error("El archivo CSV está vacío o solo contiene encabezados.");
    }

    // 4. Mapeo flexible de encabezados difusos (Inglés y Español compatible)
    const rawHeaders = csvData[0];
    const headers = rawHeaders.map(h => String(h).trim().toUpperCase().replace(/[\s_-]/g, ""));
    
    // Mapear columnas críticas
    const colMap = {
      sku: headers.indexOf("RETAILERID") > -1 ? headers.indexOf("RETAILERID") : (headers.indexOf("SKU") > -1 ? headers.indexOf("SKU") : headers.indexOf("ID")),
      title: headers.indexOf("TITLE") > -1 ? headers.indexOf("TITLE") : (headers.indexOf("NAME") > -1 ? headers.indexOf("NAME") : headers.indexOf("TITULO")),
      description: headers.indexOf("DESCRIPTION") > -1 ? headers.indexOf("DESCRIPTION") : headers.indexOf("DESCRIPCION"),
      image_link: headers.indexOf("IMAGELINK") > -1 ? headers.indexOf("IMAGELINK") : (headers.indexOf("IMAGEURL") > -1 ? headers.indexOf("IMAGEURL") : headers.indexOf("ENLACEIMAGEN")),
      price: headers.indexOf("PRICE") > -1 ? headers.indexOf("PRICE") : headers.indexOf("PRECIO"),
      brand: headers.indexOf("BRAND") > -1 ? headers.indexOf("BRAND") : headers.indexOf("MARCA")
    };

    if (colMap.sku === -1 || colMap.title === -1) {
      throw new Error("Estructura CSV no compatible. No se encontró la columna de código (ID/SKU/RetailerID) o de Nombre (Title/Name).");
    }

    log(`✅ Mapeo de columnas CSV completado con éxito (SKU col: ${colMap.sku}, Nombre col: ${colMap.title})`);

    // 5. Cargar base de datos local del ERP a memoria para Upsert masivo
    const sheetProducts = ss.getSheetByName(SHEETS.PRODUCTS);
    const sheetVarieties = ss.getSheetByName(SHEETS.PRODUCT_VARIETIES);
    const sheetInventory = ss.getSheetByName(SHEETS.INVENTORY);

    if (!sheetProducts || !sheetVarieties || !sheetInventory) {
      throw new Error("No se encontraron las hojas del ERP necesarias (BD_PRODUCTOS, BD_VARIEDAD_PRODUCTOS o BD_INVENTARIO).");
    }

    const mappingProd = HeaderManager.getMapping("PRODUCTS");
    const mappingVar = HeaderManager.getMapping("PRODUCT_VARIETIES");
    const mappingInv = HeaderManager.getMapping("INVENTORY");

    const dataProducts = sheetProducts.getDataRange().getValues();
    const dataVarieties = sheetVarieties.getDataRange().getValues();
    const dataInventory = sheetInventory.getDataRange().getValues();

    // Indexar productos locales en memoria por CODIGO_ID
    const mapaProductos = new Map();
    for (let i = 1; i < dataProducts.length; i++) {
      const sku = String(dataProducts[i][mappingProd.CODIGO_ID]).trim().toUpperCase();
      if (sku) mapaProductos.set(sku, { fila: i + 1, datos: dataProducts[i] });
    }

    // Indexar variedades por VARIEDAD_ID
    const mapaVariedades = new Map();
    for (let i = 1; i < dataVarieties.length; i++) {
      const varId = String(dataVarieties[i][mappingVar.VARIEDAD_ID]).trim().toUpperCase();
      if (varId) mapaVariedades.set(varId, { fila: i + 1, datos: dataVarieties[i] });
    }

    // Indexar inventario por INVENTARIO_ID
    const mapaInventario = new Map();
    for (let i = 1; i < dataInventory.length; i++) {
      const invId = String(dataInventory[i][mappingInv.INVENTARIO_ID]).trim().toUpperCase();
      if (invId) mapaInventario.set(invId, { fila: i + 1, datos: dataInventory[i] });
    }

    const tiendaId = obtenerTiendaPrincipal(ss) || "TIENDA_PRINCIPAL";
    const fechaSync = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT-3", "yyyy-MM-dd HH:mm:ss");

    let totalNuevos = 0;
    let totalActualizados = 0;

    // 6. Recorrer y procesar fila por fila el CSV (omitimos fila 0 de encabezados)
    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i];
      if (!row || row.length <= 1) continue;

      const skuRaw = String(row[colMap.sku]).trim();
      if (!skuRaw) continue; // Omitir filas sin ID de producto
      
      const sku = skuRaw.toUpperCase();
      const nombre = String(row[colMap.title] || "Importado sin nombre").trim();
      const desc = colMap.description !== -1 ? String(row[colMap.description] || "").trim() : "";
      const marca = colMap.brand !== -1 ? String(row[colMap.brand] || "").trim() : "";
      
      // Parsear precio de forma robusta ante signos de moneda y textos
      const priceRaw = colMap.price !== -1 ? String(row[colMap.price] || "0") : "0";
      const priceClean = priceRaw.replace(/[^0-9.]/g, "");
      let precioFloat = parseFloat(priceClean) || 0;

      // --- AJUSTE DE ESCALA DE PRECIO ---
      // Si el precio viene de la extracción de WhatsApp en formato unitario (ej: 27 en vez de 27000)
      // lo escalamos por 1000 para que refleje el valor real en pesos argentinos.
      if (precioFloat > 0 && precioFloat < 1000) {
        precioFloat = precioFloat * 1000;
      }

      // --- A. GESTIÓN Y DESCARGA DE IMAGEN (Formato compatible de AppSheet) ---
      let rutaImagenAppSheet = "";
      const imageUrl = colMap.image_link !== -1 ? String(row[colMap.image_link] || "").trim() : "";
      if (imageUrl && imageUrl.startsWith("http")) {
        try {
          rutaImagenAppSheet = downloadWhatsAppImage(imageUrl, sku, imagesFolderId, log);
        } catch (imgErr) {
          log(`⚠️ Alerta: No se pudo descargar la imagen para ${sku}: ${imgErr.message}`);
        }
      }

      // --- B. UPSERT EN BD_PRODUCTOS ---
      if (mapaProductos.has(sku)) {
        // ACTUALIZAR PRODUCTO EXISTENTE
        const cacheProd = mapaProductos.get(sku);
        const fila = cacheProd.fila;
        
        const oldNombre = String(cacheProd.datos[mappingProd.MODELO]).trim();
        const oldDesc = String(cacheProd.datos[mappingProd.DESCRIPCION_IA || mappingProd.DESCRIPCION || 14]).trim();

        if (oldNombre !== nombre || oldDesc !== desc || rutaImagenAppSheet !== "") {
          sheetProducts.getRange(fila, mappingProd.MODELO + 1).setValue(nombre);
          
          if (mappingProd.DESCRIPCION_IA !== undefined) {
            sheetProducts.getRange(fila, mappingProd.DESCRIPCION_IA + 1).setValue(desc);
          } else if (mappingProd.DESCRIPCION !== undefined) {
            sheetProducts.getRange(fila, mappingProd.DESCRIPCION + 1).setValue(desc);
          }
          
          if (marca && mappingProd.MARCA !== undefined) {
            sheetProducts.getRange(fila, mappingProd.MARCA + 1).setValue(marca);
          }

          if (rutaImagenAppSheet !== "") {
            const colImagen = mappingProd.IMAGEN_PRINCIPAL || mappingProd.CARPETA_ID;
            if (colImagen !== undefined) {
              sheetProducts.getRange(fila, colImagen + 1).setValue(rutaImagenAppSheet);
            }
          }
          
          sheetProducts.getRange(fila, mappingProd.ULTIMA_ACTUALIZACION + 1).setValue(fechaSync);
          totalActualizados++;
        }
      } else {
        // INSERTAR NUEVO PRODUCTO
        const rowData = new Array(Math.max(...Object.values(mappingProd)) + 1).fill("");
        
        rowData[mappingProd.CODIGO_ID] = sku;
        rowData[mappingProd.SKU] = sku;
        rowData[mappingProd.MODELO] = nombre;
        
        if (mappingProd.DESCRIPCION_IA !== undefined) {
          rowData[mappingProd.DESCRIPCION_IA] = desc;
        } else if (mappingProd.DESCRIPCION !== undefined) {
          rowData[mappingProd.DESCRIPCION] = desc;
        }
        
        if (mappingProd.MARCA !== undefined) {
          rowData[mappingProd.MARCA] = marca;
        }

        const colImagen = mappingProd.IMAGEN_PRINCIPAL || mappingProd.CARPETA_ID;
        if (colImagen !== undefined && rutaImagenAppSheet !== "") {
          rowData[colImagen] = rutaImagenAppSheet;
        }
        
        rowData[mappingProd.CATEGORIA_PADRE] = "WHATSAPP";
        rowData[mappingProd.CATEGORIA] = "Importado";
        rowData[mappingProd.ESTADO_SINCRONIZACION] = "PENDIENTE";
        rowData[mappingProd.ULTIMA_ACTUALIZACION] = fechaSync;
        
        sheetProducts.appendRow(rowData);
        totalNuevos++;
      }

      // --- C. UPSERT EN BD_VARIEDAD_PRODUCTOS (Precios minoristas) ---
      const varId = `${sku}-MENOR`.toUpperCase();
      if (mapaVariedades.has(varId)) {
        const cacheVar = mapaVariedades.get(varId);
        const oldPrecio = parseFloat(cacheVar.datos[mappingVar.PRECIO_UNITARIO]) || 0;
        if (oldPrecio !== precioFloat) {
          sheetVarieties.getRange(cacheVar.fila, mappingVar.PRECIO_UNITARIO + 1).setValue(precioFloat);
          sheetVarieties.getRange(cacheVar.fila, mappingVar.ULTIMA_ACTUALIZACION + 1).setValue(fechaSync);
        }
      } else {
        const rowVar = new Array(Math.max(...Object.values(mappingVar)) + 1).fill("");
        rowVar[mappingVar.VARIEDAD_ID] = varId;
        rowVar[mappingVar.CATEGORIA] = "Importado";
        rowVar[mappingVar.PRODUCTO_ID] = sku;
        rowVar[mappingVar.VARIEDAD] = "Menor";
        rowVar[mappingVar.PRECIO_UNITARIO] = precioFloat;
        rowVar[mappingVar.CANTIDAD_MINIMA] = 1;
        rowVar[mappingVar.VISIBILIDAD_TIENDA] = "VISIBLE";
        rowVar[mappingVar.ULTIMA_ACTUALIZACION] = fechaSync;
        sheetVarieties.appendRow(rowVar);
      }

      // --- D. UPSERT EN BD_INVENTARIO (Stock base) ---
      const invId = `${sku}-Surtido-Surtido-${tiendaId}`.toUpperCase();
      if (!mapaInventario.has(invId)) {
        const rowInv = new Array(Math.max(...Object.values(mappingInv)) + 1).fill("");
        rowInv[mappingInv.INVENTARIO_ID] = invId;
        rowInv[mappingInv.FECHA_CREACION] = fechaSync;
        rowInv[mappingInv.TIENDA_ID] = tiendaId;
        rowInv[mappingInv.PRODUCTO_ID] = sku;
        rowInv[mappingInv.COLOR] = "Surtido";
        rowInv[mappingInv.TALLE] = "Surtido";
        rowInv[mappingInv.STOCK_INICIAL] = 0;
        rowInv[mappingInv.ENTRADAS] = 0;
        rowInv[mappingInv.SALIDAS] = 0;
        rowInv[mappingInv.VENTAS_WEB] = 0;
        rowInv[mappingInv.VENTAS_LOCAL] = 0;
        rowInv[mappingInv.STOCK_ACTUAL] = 0;
        rowInv[mappingInv.FECHA_ACTUALIZACION] = fechaSync;
        sheetInventory.appendRow(rowInv);
      }
    }

    // 7. Limpieza o movimiento del archivo CSV procesado en Drive para evitar re-procesamientos
    csvFile.setTrashed(true);
    log("🗑️ Archivo CSV original enviado a la papelera en TEMP_UPLOADS para evitar re-procesamientos.");

    const finalSuccessMsg = `🚀 Importación WhatsApp Completada!\n\n` +
      `📁 Archivo procesado: ${csvFile.getName()}\n` +
      `✨ Productos Nuevos: ${totalNuevos}\n` +
      `🔄 Productos Actualizados: ${totalActualizados}\n` +
      `📦 Las fotos se descargaron nativamente en tu Drive.`;
    
    log(finalSuccessMsg);
    notificarTelegramSalud(`✅ Catálogo CSV WhatsApp Importado: ${finalSuccessMsg}`, "EXITO");
    
    try {
      SpreadsheetApp.getUi().alert("🚀 Importación Completada", finalSuccessMsg, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch(uiErr) {}

    return { success: true, nuevos: totalNuevos, actualizados: totalActualizados, logs: logArray };

  } catch (error) {
    const errorMsg = "❌ Error crítico importación WhatsApp CSV: " + error.message;
    log(errorMsg);
    notificarTelegramSalud(errorMsg, "ERROR");
    
    try {
      SpreadsheetApp.getUi().alert("❌ Fallo en la Importación", errorMsg, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch(uiErr) {}
    
    return { success: false, error: error.message, logs: logArray };
  }
}

/**
 * Descarga una imagen desde Meta CDN a la carpeta oficial de Drive del ERP.
 * Comprueba existencia para no consumir cuotas duplicadas de Google Drive.
 */
function downloadWhatsAppImage(imageUrl, sku, parentFolderId, logFunc) {
  const log = logFunc || console.log;
  const fileName = `${sku}.jpg`;
  const folder = DriveApp.getFolderById(parentFolderId);

  // 1. Validar existencia física del archivo
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    log(`   ⏭️ Imagen de ${sku} ya existe en Drive. Omitiendo descarga.`);
    return `BD_PRODUCTO_IMAGENES_Images/${fileName}`;
  }

  // 2. Descargar de la URL
  const response = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error(`Fallo HTTP ${response.getResponseCode()} al descargar imagen.`);
  }

  // 3. Guardar en Drive
  const blob = response.getBlob().setName(fileName);
  folder.createFile(blob);
  log(`   📥 Imagen de ${sku} descargada y guardada en Drive.`);

  return `BD_PRODUCTO_IMAGENES_Images/${fileName}`;
}
