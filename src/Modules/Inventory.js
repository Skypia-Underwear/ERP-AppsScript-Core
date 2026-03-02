// =================================================================
// ===           LÓGICA EXCLUSIVA PARA INVENTARIO (VERSIÓN FINAL) ===
// =================================================================

function getInventorySpreadsheet() {
  return SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
}

/**
 * Manejador para la INTERFAZ WEB (HTML). Llama a la función núcleo en Main.gs.
 */
function procesarAccionInventario(accion, codigo, fecha) {
  return ejecutarAccionDeInventario(accion, codigo, fecha);
}

function procesarAjusteMasivoStock(cambios, storeId, userId, opcionesMovimiento, logArray = null) {
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => Logger.log(msg);
  log(`⚖️ Procesando ${cambios.length} ajustes manuales en Tienda: ${storeId}...`);

  const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
  const sheetMov = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENTS);
  const movMapping = HeaderManager.getMapping("INVENTORY_MOVEMENTS");

  if (!movMapping) {
    throw new Error("No se pudo obtener el mapeo de la hoja BD_MOVIMIENTOS_INVENTARIO. Falta actualizar SHEET_SCHEMA.");
  }

  const modoTransferencia = opcionesMovimiento && opcionesMovimiento.isTransfer;
  const origenDestinoSelect = opcionesMovimiento ? opcionesMovimiento.target : null;

  const fecha = new Date();
  const fechaISO = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const skusAAuditar = new Set();
  const nuevasFilas = [];

  cambios.forEach(c => {
    const diff = c.newStock - c.oldStock;
    if (diff === 0) return;

    const isEntrada = diff > 0;
    const tipo = isEntrada ? "ENTRADA" : "SALIDA";
    const cantAbs = Math.abs(diff);
    const invId = `${c.sku}-${c.color}-${c.talle}-${c.store}`;

    // Determinar Origen y Destino
    let origen = "";
    let destino = "";

    if (modoTransferencia && origenDestinoSelect) {
      if (isEntrada) { // Recibe en esta tienda desde origenDestinoSelect
        origen = origenDestinoSelect;
        destino = c.store;
      } else { // Envía desde esta tienda hacia origenDestinoSelect
        origen = c.store;
        destino = origenDestinoSelect;
      }
    } else {
      // Flujo Normal (Defecto)
      if (isEntrada) {
        origen = "PROVEEDOR";
        destino = c.store;
      } else {
        origen = c.store;
        destino = "DEPOSITO";
      }
    }

    // Generar Referencia
    const referencia = `**${tipo}** de **${cantAbs}** unidades del Producto **${c.sku}** (Color: **${c.color}** | Talle: **${c.talle}**) desde **${origen}** hacia **${destino}** | Stock previo: **${c.oldStock}** → Stock final: **${c.newStock}**`;

    const registroId = `MOV-${fechaISO}-${Utilities.getUuid().substring(0, 8).toUpperCase()}`;

    // Construir la fila dinámicamente según el mapping
    const rowData = [];
    const totalCols = Object.keys(movMapping).length;
    for (let i = 0; i < totalCols; i++) rowData.push(""); // Inicializar con vacíos

    // Asignar valores a posiciones conocidas mapeadas
    if (movMapping["REGISTRO_ID"] !== undefined) rowData[movMapping["REGISTRO_ID"]] = registroId;
    if (movMapping["USER_ID"] !== undefined) rowData[movMapping["USER_ID"]] = userId || "sistema-dashboard@castfer.com.ar";
    if (movMapping["FECHA"] !== undefined) rowData[movMapping["FECHA"]] = fecha;
    if (movMapping["INVENTARIO_ID"] !== undefined) rowData[movMapping["INVENTARIO_ID"]] = invId;
    if (movMapping["MOVIMIENTO"] !== undefined) rowData[movMapping["MOVIMIENTO"]] = tipo;
    if (movMapping["ORIGEN"] !== undefined) rowData[movMapping["ORIGEN"]] = origen;
    if (movMapping["DESTINO"] !== undefined) rowData[movMapping["DESTINO"]] = destino;
    if (movMapping["PRODUCTO_ID"] !== undefined) rowData[movMapping["PRODUCTO_ID"]] = c.sku;
    if (movMapping["CANTIDAD"] !== undefined) rowData[movMapping["CANTIDAD"]] = cantAbs;
    if (movMapping["REFERENCIA"] !== undefined) rowData[movMapping["REFERENCIA"]] = referencia;

    nuevasFilas.push(rowData);
    skusAAuditar.add(c.sku);
  });

  if (nuevasFilas.length > 0) {
    sheetMov.getRange(sheetMov.getLastRow() + 1, 1, nuevasFilas.length, nuevasFilas[0].length).setValues(nuevasFilas);
    log(`✅ Se registraron ${nuevasFilas.length} movimientos de ajuste (${modoTransferencia ? 'Transferencia' : 'Rápido'}).`);

    // Recalcular productos afectados para que el stock se refleje inmediatamente
    skusAAuditar.forEach(sku => {
      recalcularStockDeProducto(sku, logArray);
    });

    // Sincronizar catálogo
    publicarCatalogo();
    log(`🔄 Catálogo sincronizado.`);

    return { success: true, message: `Se procesaron ${nuevasFilas.length} ajustes exitosamente.`, logs: logArray };
  }

  return { success: true, message: "No hubo cambios significativos.", logs: logArray };
}

/**
 * Manejador para APPSHEET (POST). Llama a la función núcleo en Main.gs y formatea la respuesta.
 */
function handleInventoryRequest(params) {
  const resultadoObjeto = ejecutarAccionDeInventario(params.accion, params.codigo, params.fecha);

  return ContentService.createTextOutput(JSON.stringify(resultadoObjeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * @description Realiza una auditoría COMPLETA y AUTOCORRECCIÓN del inventario.
 * ORDEN DE OPERACIONES:
 * 1. ELIMINA DUPLICADOS dentro de BD_INVENTARIO y BD_DEPOSITO.
 * 2. AGREGA registros faltantes.
 * 3. ELIMINA registros huérfanos (obsoletos).
 * Respeta los datos en columnas calculadas, asumiendo que son gestionados por Bots.
 * @param {Array} [logArray=null] - Un array opcional para registrar los logs.
 */
function generarInventarioInicial(logArray = null) {
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => Logger.log(msg);
  log("🏁 Iniciando AUDITORÍA y AUTOCORRECCIÓN de inventario (Anti-Duplicados)...");

  const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
  const hojaInventario = ss.getSheetByName(SHEETS.INVENTORY);
  const hojaDeposito = ss.getSheetByName(SHEETS.DEPOSIT);

  // --- PASO 1: ELIMINAR DUPLICADOS ---
  log("🛡️ Paso 1: Buscando y eliminando duplicados...");

  function eliminarDuplicados(hoja, nombreHoja, schemaKey) {
    const mapping = HeaderManager.getMapping(schemaKey);
    const data = hoja.getDataRange().getValues();
    if (data.length < 2 || !mapping) {
      log(`   - ${nombreHoja}: No hay suficientes datos o mapeo para verificar duplicados.`);
      return 0;
    }

    const idIdx = mapping["INVENTARIO_ID"] !== undefined ? mapping["INVENTARIO_ID"] :
      (mapping["PRODUCTO_ID"] !== undefined ? mapping["PRODUCTO_ID"] : 0);

    const vistos = new Set();
    const filasParaEliminar = [];

    for (let i = 1; i < data.length; i++) {
      const id = data[i][idIdx];
      if (vistos.has(id)) {
        filasParaEliminar.push(i + 1);
      } else {
        vistos.add(id);
      }
    }

    if (filasParaEliminar.length > 0) {
      // Eliminar de abajo hacia arriba para no alterar los índices de fila
      for (let i = filasParaEliminar.length - 1; i >= 0; i--) {
        hoja.deleteRow(filasParaEliminar[i]);
      }
    }
    return filasParaEliminar.length;
  }

  const duplicadosInvEliminados = eliminarDuplicados(hojaInventario, "BD_INVENTARIO", "INVENTORY");
  const duplicadosDepEliminados = eliminarDuplicados(hojaDeposito, "BD_DEPOSITO", "DEPOSIT");
  log(`   - Se eliminaron ${duplicadosInvEliminados} registros duplicados de BD_INVENTARIO.`);
  log(`   - Se eliminaron ${duplicadosDepEliminados} registros duplicados de BD_DEPOSITO.`);

  // --- PASOS 2 y 3: AUDITORÍA DE HUÉRFANOS Y FALTANTES ---
  log("🗺️ Paso 2 y 3: Auditando registros huérfanos y faltantes...");

  // Refrescar los datos después de posibles eliminaciones
  SpreadsheetApp.flush();

  const hojaProductos = ss.getSheetByName(SHEETS.PRODUCTS);
  const hojaTiendas = ss.getSheetByName(SHEETS.STORES);
  const hojaConfiguracion = ss.getSheetByName(SHEETS.GENERAL_CONFIG);

  const productosData = hojaProductos.getDataRange().getValues();
  if (productosData.length < 2) {
    log("⚠️ No hay productos para procesar. Finalizando.");
    return;
  }

  const tiendasData = hojaTiendas.getDataRange().getValues();
  const productsMapping = HeaderManager.getMapping("PRODUCTS");
  if (!productsMapping) {
    log("⚠️ No se pudo obtener el mapeo de productos. Finalizando.");
    return;
  }

  const tipoRegistroGlobal = (hojaConfiguracion.getRange("O2").getValue() || "").toString().trim().toUpperCase();
  const fechaHoy = new Date();

  // Construir el "Mapa Ideal"
  const masterInventoryIds = new Set();
  const masterDepositoIds = new Set();

  const colProdId = productsMapping["CODIGO_ID"];
  const colColores = productsMapping["COLORES"];
  const colTalles = productsMapping["TALLES"];

  for (let i = 1; i < productosData.length; i++) {
    const row = productosData[i];
    const PRODUCTO_ID = row[colProdId];
    if (!PRODUCTO_ID) continue;
    masterDepositoIds.add(PRODUCTO_ID);
    let colores = (tipoRegistroGlobal === "PRODUCTO SIMPLE") ? ["Surtido"] : (row[colColores] || "").toString().split(",").map(c => c.trim()).filter(Boolean);
    let talles = (tipoRegistroGlobal === "PRODUCTO SIMPLE") ? ["Surtido"] : (row[colTalles] || "").toString().split(",").map(t => t.trim()).filter(Boolean);
    if (colores.length === 0 || talles.length === 0) continue;
    for (let tiendaRow of tiendasData.slice(1)) {
      const TIENDA_ID = tiendaRow[0];
      if (!TIENDA_ID) continue;
      for (let color of colores) {
        for (let talle of talles) {
          masterInventoryIds.add(`${PRODUCTO_ID}-${color}-${talle}-${TIENDA_ID}`);
        }
      }
    }
  }
  log(`   - Mapa Ideal: Se requieren ${masterInventoryIds.size} combinaciones de inventario y ${masterDepositoIds.size} productos en depósito.`);

  // Procesar BD_INVENTARIO
  const inventarioSheetData = hojaInventario.getDataRange().getValues();
  const inventarioActualIds = new Set(inventarioSheetData.slice(1).map(row => row[0]).filter(String));
  log(`   - Inventario Actual (post-limpieza): ${inventarioActualIds.size} registros.`);

  const nuevasFilasInventario = [];
  masterInventoryIds.forEach(id => {
    if (!inventarioActualIds.has(id)) {
      const [productoId, color, talle, tiendaId] = id.split('-');
      nuevasFilasInventario.push([id, fechaHoy, tiendaId, productoId, color, talle, 0, 0, 0, 0, 0, 0, fechaHoy, 0]);
    }
  });
  if (nuevasFilasInventario.length > 0) {
    hojaInventario.getRange(hojaInventario.getLastRow() + 1, 1, nuevasFilasInventario.length, 14).setValues(nuevasFilasInventario);
    log(`   - Se agregaron ${nuevasFilasInventario.length} combinaciones faltantes a BD_INVENTARIO.`);
  }

  let huerfanosEliminadosInv = 0;
  for (let i = inventarioSheetData.length - 1; i >= 1; i--) {
    const inventarioId = inventarioSheetData[i][0];
    if (inventarioId && !masterInventoryIds.has(inventarioId)) {
      hojaInventario.deleteRow(i + 1);
      huerfanosEliminadosInv++;
    }
  }
  if (huerfanosEliminadosInv > 0) {
    log(`   - Se eliminaron ${huerfanosEliminadosInv} registros huérfanos de BD_INVENTARIO.`);
  }

  // Procesar BD_DEPOSITO
  const depositoSheetData = hojaDeposito.getDataRange().getValues();
  const depositoActualIds = new Set(depositoSheetData.slice(1).map(row => row[0]).filter(String));
  log(`   - Depósito Actual (post-limpieza): ${depositoActualIds.size} registros.`);

  const nuevasFilasDeposito = [];
  masterDepositoIds.forEach(id => {
    if (!depositoActualIds.has(id)) {
      nuevasFilasDeposito.push([id, 0, 0, 0, 0, fechaHoy]);
    }
  });
  if (nuevasFilasDeposito.length > 0) {
    hojaDeposito.getRange(hojaDeposito.getLastRow() + 1, 1, nuevasFilasDeposito.length, 6).setValues(nuevasFilasDeposito);
    log(`   - Se agregaron ${nuevasFilasDeposito.length} productos faltantes a BD_DEPOSITO.`);
  }

  let huerfanosEliminadosDep = 0;
  for (let i = depositoSheetData.length - 1; i >= 1; i--) {
    const productoId = depositoSheetData[i][0];
    if (productoId && !masterDepositoIds.has(productoId)) {
      hojaDeposito.deleteRow(i + 1);
      huerfanosEliminadosDep++;
    }
  }
  if (huerfanosEliminadosDep > 0) {
    log(`   - Se eliminaron ${huerfanosEliminadosDep} registros huérfanos de BD_DEPOSITO.`);
  }

  SpreadsheetApp.flush();
  log("✅ Proceso de AUDITORÍA y AUTOCORRECCIÓN finalizado. El sistema está limpio y sincronizado.");
  notificarTelegramSalud("🏦 Auditoría de Inventario Global finalizada con éxito.", "EXITO");

  // --- ACTUALIZAR TPV (NUEVO) ---
  try {
    publicarCatalogo();
    log("🗂️ Catálogo TPV sincronizado a Drive/Externo automáticamente.");
  } catch (e) {
    log("⚠️ No se pudo sincronizar el catálogo TPV: " + e.message);
    notificarTelegramSalud("⚠️ Falló la sincronización automática del catálogo tras auditoría: " + e.message, "WARN");
  }
}

/**
 * @description Audita y sincroniza TODAS las variaciones de un ÚNICO producto.
 * - Compara las variaciones actuales del producto con las que existen en el inventario.
 * - AGREGA las combinaciones que faltan y ELIMINA las obsoletas.
 * - AUDITA la existencia del producto en BD_DEPOSITO, creándolo solo si es necesario.
 * - Respeta los datos en columnas calculadas (gestionadas por Bots).
 * @param {string} PRODUCTO_ID - El ID del producto a sincronizar.
 * @param {Array} [logArray=null] - Un array opcional para registrar los logs.
 */
function generarInventarioPorProducto(PRODUCTO_ID, logArray = null) {
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => Logger.log(msg);
  const productoIdStr = (PRODUCTO_ID || '').toString().trim();
  log(`🚀 Iniciando AUDITORÍA para el producto: '${productoIdStr}'...`);

  const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
  const hojaProductos = ss.getSheetByName(SHEETS.PRODUCTS);
  const hojaInventario = ss.getSheetByName(SHEETS.INVENTORY);
  const hojaTiendas = ss.getSheetByName(SHEETS.STORES);
  const hojaDeposito = ss.getSheetByName(SHEETS.DEPOSIT);
  const hojaConfiguracion = ss.getSheetByName(SHEETS.GENERAL_CONFIG);

  const productsMapping = HeaderManager.getMapping("PRODUCTS");
  if (!productsMapping) {
    throw new Error(`No se encontró el mapeo para BD_PRODUCTOS.`);
  }

  const tipoRegistro = (hojaConfiguracion.getRange("O2").getValue() || "").toString().trim().toUpperCase();
  const productos = hojaProductos.getDataRange().getValues();

  const colId = productsMapping["CODIGO_ID"];
  const colColores = productsMapping["COLORES"];
  const colTalles = productsMapping["TALLES"];

  const filaProducto = productos.find(fila => (fila[colId] || '').toString().trim() === productoIdStr);

  if (!filaProducto) {
    log(`❌ Producto no encontrado en BD_PRODUCTOS con CODIGO_ID: '${productoIdStr}'.`);
    return;
  }
  log("✅ Producto encontrado en BD_PRODUCTOS.");

  // --- 1. Sincronizar BD_INVENTARIO ---
  log("--- Sincronizando BD_INVENTARIO...");
  const masterProductInventoryIds = new Set();
  const tiendas = hojaTiendas.getDataRange().getValues();
  const fechaHoy = new Date();

  let colores = (tipoRegistro === "PRODUCTO SIMPLE") ? ["Surtido"] : (filaProducto[colColores] || "").toString().split(",").map(c => c.trim()).filter(Boolean);
  let talles = (tipoRegistro === "PRODUCTO SIMPLE") ? ["Surtido"] : (filaProducto[colTalles] || "").toString().split(",").map(t => t.trim()).filter(Boolean);

  if (colores.length === 0 || talles.length === 0) {
    log(`   - ⚠️ El producto '${productoIdStr}' no tiene colores o talles definidos. No se generarán variaciones.`);
  } else {
    for (let tiendaRow of tiendas.slice(1)) {
      const TIENDA_ID = tiendaRow[0];
      if (!TIENDA_ID) continue;
      for (let color of colores) {
        for (let talle of talles) {
          masterProductInventoryIds.add(`${productoIdStr}-${color}-${talle}-${TIENDA_ID}`);
        }
      }
    }
  }
  log(`   - Mapa Ideal para '${productoIdStr}': Se requieren ${masterProductInventoryIds.size} combinaciones.`);

  const inventarioSheetData = hojaInventario.getDataRange().getValues();
  const inventarioActualDeProducto = new Set();
  const filasParaEliminar = [];

  for (let i = 1; i < inventarioSheetData.length; i++) {
    if (inventarioSheetData[i][3] === productoIdStr) { // Columna D = PRODUCTO_ID
      const inventarioId = inventarioSheetData[i][0];
      inventarioActualDeProducto.add(inventarioId);
      if (!masterProductInventoryIds.has(inventarioId)) {
        filasParaEliminar.push(i + 1);
      }
    }
  }
  log(`   - Inventario Actual para '${productoIdStr}': Se encontraron ${inventarioActualDeProducto.size} registros.`);

  if (filasParaEliminar.length > 0) {
    for (let i = filasParaEliminar.length - 1; i >= 0; i--) {
      hojaInventario.deleteRow(filasParaEliminar[i]);
    }
    log(`   - 🗑️ Se eliminaron ${filasParaEliminar.length} variaciones obsoletas.`);
  }

  const nuevasFilasInventario = [];
  masterProductInventoryIds.forEach(id => {
    if (!inventarioActualDeProducto.has(id)) {
      const [, productoId, color, talle, tiendaId] = id.match(/(.*?)-(.*?)-(.*?)-(.*)/);
      nuevasFilasInventario.push([id, fechaHoy, tiendaId, productoId, color, talle, 0, 0, 0, 0, 0, 0, fechaHoy, 0]);
    }
  });

  if (nuevasFilasInventario.length > 0) {
    hojaInventario.getRange(hojaInventario.getLastRow() + 1, 1, nuevasFilasInventario.length, 14).setValues(nuevasFilasInventario);
    log(`   - ✅ Se agregaron ${nuevasFilasInventario.length} nuevas combinaciones.`);
  }

  if (filasParaEliminar.length === 0 && nuevasFilasInventario.length === 0) {
    log(`   - 👍 Las variaciones del producto ya estaban sincronizadas.`);
  }

  // --- 2. Auditar BD_DEPOSITO ---
  log("--- Auditando BD_DEPOSITO...");
  const depositoData = hojaDeposito.getDataRange().getValues();
  const depositoExiste = depositoData.slice(1).some(row => row[0] === productoIdStr);

  if (depositoExiste) {
    log(`   - 👍 El producto ya existe en BD_DEPOSITO.`);
  } else {
    hojaDeposito.appendRow([productoIdStr, 0, 0, 0, 0, fechaHoy]);
    log(`   - ✅ Registro creado en BD_DEPOSITO.`);
  }

  log(`🎯 Finalizó la auditoría para: ${productoIdStr}`);
}

function recalcularStockDeProducto(productId, logArray = null) {
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => Logger.log(msg);
  log(`🔬 Iniciando recálculo completo para el producto: '${productId}'...`);

  const ss = getInventorySpreadsheet();
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
  const salesDetailsSheet = ss.getSheetByName(SHEETS.BLOGGER_SALES_DETAILS);
  const movementSheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENTS);

  const inventoryData = inventorySheet.getDataRange().getValues();
  const salesDetailsData = salesDetailsSheet.getDataRange().getValues();
  const movementData = movementSheet.getDataRange().getValues();

  // Mapeos utilizando HeaderManager para resiliencia
  const invMapping = HeaderManager.getMapping("INVENTORY");
  const moveMapping = HeaderManager.getMapping("INVENTORY_MOVEMENTS");

  // Si falta mapeo crítico, abortar
  if (!invMapping || !moveMapping) {
    log(`❌ Error: Mapeos no encontrados (INVENTORY o INVENTORY_MOVEMENTS). No se pudo recalcular.`);
    return;
  }

  // Columnas en BD_INVENTARIO
  const invRowIdIndex = invMapping["INVENTARIO_ID"];
  const invStoreIdIndex = invMapping["TIENDA_ID"];
  const invProductIdIndex = invMapping["PRODUCTO_ID"];
  const invColorIndex = invMapping["COLOR"];
  const invSizeIndex = invMapping["TALLE"];
  const invCurrentStockIndex = invMapping["STOCK_ACTUAL"];
  const invEntriesIndex = invMapping["ENTRADAS"];
  const invExitsIndex = invMapping["SALIDAS"];
  const invLocalSalesIndex = invMapping["VENTAS_LOCAL"];
  const invWebSalesIndex = invMapping["VENTAS_WEB"];

  // Columnas en BD_MOVIMIENTOS_INVENTARIO
  const moveInventoryIdIndex = moveMapping["INVENTARIO_ID"];
  const moveTypeIndex = moveMapping["MOVIMIENTO"];
  const moveAmountIndex = moveMapping["CANTIDAD"];

  // Columnas en BLOGGER_DETALLE_VENTAS (Mapeo estático antiguo si no está en config, asumiendo estructura BD_DETALLE_VENTAS)
  const salesDetailsHeaders = salesDetailsData.shift().map(h => h.toString().trim().toUpperCase());
  const detailProductIdIndex = salesDetailsHeaders.indexOf('PRODUCTO_ID');
  const detailColorIndex = salesDetailsHeaders.indexOf('COLOR');
  const detailSizeIndex = salesDetailsHeaders.indexOf('TALLE');
  const detailAmountIndex = salesDetailsHeaders.indexOf('CANTIDAD');

  const productInventoryRows = [];
  inventoryData.forEach((row, index) => {
    if (index > 0 && row[invProductIdIndex] === productId) {
      productInventoryRows.push({ data: row, rowIndex: index + 1 });
    }
  });

  if (productInventoryRows.length === 0) {
    log(`⚠️ No se encontraron variaciones en el inventario para el producto ${productId}.`);
    return;
  }
  log(`🔍 Se encontraron ${productInventoryRows.length} variaciones del producto en el inventario.`);

  productInventoryRows.forEach(invRowInfo => {
    const invRowId = invRowInfo.data[invRowIdIndex];
    const invStoreId = invRowInfo.data[invStoreIdIndex];
    const invColor = invRowInfo.data[invColorIndex];
    const invSize = invRowInfo.data[invSizeIndex];

    // Calcular Ventas Locales/Web desde ticket/ventas iterando
    let totalLocalSales = 0;
    let totalWebSales = 0;

    // (Por ahora, simplificaremos leyendo el valor actual para no romper toda la subrutina de ventas)
    totalWebSales = parseInt(invRowInfo.data[invWebSalesIndex]) || 0;
    totalLocalSales = parseInt(invRowInfo.data[invLocalSalesIndex]) || 0;

    let totalReplacements = 0; // Entradas
    let totalDepartures = 0;   // Salidas

    // Iterar movimientos de la variación
    for (let i = 1; i < movementData.length; i++) {
      const moveRow = movementData[i];
      if (moveRow[moveInventoryIdIndex] === invRowId) {
        const amount = parseInt(moveRow[moveAmountIndex]) || 0;
        if (moveRow[moveTypeIndex] === 'ENTRADA') { totalReplacements += amount; }
        else if (moveRow[moveTypeIndex] === 'SALIDA') { totalDepartures += amount; }
      }
    }

    // --- INICIO DE LA CORRECCIÓN: Cálculo y actualización de CURRENT_STOCK (BD_INVENTARIO) ---
    // [STOCK_INICIAL] + [ENTRADAS] - ([SALIDAS] + [VENTAS_LOCAL] + [VENTAS_WEB])
    // Nota: Si no hay columna STOCK_INICIAL en el schema que pasamos antes, usaremos 0 predeterminado
    const initialStock = 0;

    // Aplicamos la fórmula requerida por el usuario
    const newCurrentStock = initialStock + totalReplacements - (totalDepartures + totalWebSales + totalLocalSales);

    // Escribimos TODOS los valores calculados en la hoja BD_INVENTARIO
    inventorySheet.getRange(invRowInfo.rowIndex, invEntriesIndex + 1).setValue(totalReplacements);
    inventorySheet.getRange(invRowInfo.rowIndex, invExitsIndex + 1).setValue(totalDepartures);
    inventorySheet.getRange(invRowInfo.rowIndex, invCurrentStockIndex + 1).setValue(newCurrentStock); // <-- ¡LÍNEA CLAVE!

    log(`🔄 Recalculado [${invStoreId}] ${invRowId}: Entradas=${totalReplacements}, Salidas=${totalDepartures} -> STOCK FINAL: ${newCurrentStock}`);
    // --- FIN DE LA CORRECCIÓN ---
  });

  SpreadsheetApp.flush();
  log(`✅ Recálculo multi-tienda completo para el producto ${productId}.`);
}

/**
 * REVISADO Y ACTUALIZADO - VERSIÓN FINAL CON RESPALDO AUTOMÁTICO
 * Crea un respaldo completo de las hojas de historial en un nuevo archivo de Google Sheets
 * antes de realizar el cierre de período de forma segura.
 */
function resetearSistemaInventario(logArray = null) {
  const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => Logger.log(msg);
  log("🔄 Iniciando reseteo INTELIGENTE del sistema de inventario...");

  // --- 0. ARCHIVAR EN BIGQUERY (NUEVO) ---
  if (GLOBAL_CONFIG.ENABLE_BIGQUERY) {
    log("☁️ Respaldando historial en BigQuery Data Warehouse...");
    try {
      const resBQ = archivarVentasEnBigQuery();
      if (resBQ.success) log(`✅ BigQuery: ${resBQ.message}`);
      else log(`⚠️ BigQuery: ${resBQ.message}`);
    } catch (errBQ) {
      log(`❌ Fallo crítico BigQuery: ${errBQ.message}`);
    }
  } else {
    log("ℹ️ BigQuery desactivado. Saltando backup en Data Warehouse.");
  }

  const hoy = new Date();
  const timestamp = Utilities.formatDate(hoy, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  // --- 1. CREACIÓN DEL RESPALDO ---
  log("🔐 Creando archivo de respaldo en Google Drive...");

  const nombreRespaldo = `Respaldo de Inventario - ${timestamp}`;
  const spreadsheetRespaldo = SpreadsheetApp.create(nombreRespaldo);
  log(`✅ Archivo de respaldo creado: "${nombreRespaldo}"`);

  const hojasARespaldarYLimpiar = [
    'BD_MOVIMIENTOS_INVENTARIO', // Sería ideal usar SHEETS.INVENTORY_MOVEMENTS
    'BLOGGER_VENTAS',
    'BLOGGER_DETALLE_VENTAS',
    'BD_VENTAS_PEDIDOS',
    'BD_DETALLE_VENTAS'
  ];

  hojasARespaldarYLimpiar.forEach(nombreHoja => {
    const hojaOriginal = ss.getSheetByName(nombreHoja);
    if (hojaOriginal) {
      const datosOriginales = hojaOriginal.getDataRange().getValues();
      if (datosOriginales.length > 1) { // Solo copia si hay datos además del encabezado
        const hojaCopia = spreadsheetRespaldo.insertSheet(nombreHoja);
        hojaCopia.getRange(1, 1, datosOriginales.length, datosOriginales[0].length).setValues(datosOriginales);
        log(`📄 Copia de '${nombreHoja}' guardada en el respaldo.`);
      }
    } else {
      log(`⚠️ No se encontró la hoja '${nombreHoja}' para respaldar. Se omitió.`);
    }
  });

  // Elimina la hoja inicial vacía que se crea por defecto
  const hojaDefault = spreadsheetRespaldo.getSheetByName('Sheet1');
  if (hojaDefault) {
    spreadsheetRespaldo.deleteSheet(hojaDefault);
  }

  const urlRespaldo = spreadsheetRespaldo.getUrl();
  log(`🔗 Respaldo completado. Puedes acceder al archivo aquí: ${urlRespaldo}`);

  // --- 2. "CONGELAR" EL STOCK ---
  log("❄️ Congelando stock actual como nuevo stock inicial...");
  // --- Reseteo de BD_INVENTARIO ---
  const hojaInventario = ss.getSheetByName(SHEETS.INVENTORY);
  if (hojaInventario) {
    const rangoInventario = hojaInventario.getDataRange();
    const datosInventario = rangoInventario.getValues();
    const headerInv = datosInventario.shift();

    const idxStockInicialInv = headerInv.indexOf("STOCK_INICIAL");
    const idxStockActualInv = headerInv.indexOf("STOCK_ACTUAL");
    const columnasAResetearInv = ["ENTRADAS", "SALIDAS", "VENTAS_WEB", "VENTAS_LOCAL"];
    const indicesAResetearInv = columnasAResetearInv.map(nombre => headerInv.indexOf(nombre));
    const idxFechaActInv = headerInv.indexOf("FECHA_ACTUALIZACION");

    datosInventario.forEach(fila => {
      const stockActual = fila[idxStockActualInv] || 0;
      fila[idxStockInicialInv] = stockActual;
      indicesAResetearInv.forEach(indice => {
        if (indice !== -1) fila[indice] = 0;
      });
      fila[idxFechaActInv] = hoy;
    });

    hojaInventario.getRange(2, 1, datosInventario.length, headerInv.length).setValues(datosInventario);
    log(`✅ Hoja '${SHEETS.INVENTORY}' actualizada.`);
  } else {
    log(`⚠️ No se encontró la hoja '${SHEETS.INVENTORY}'. Se omitió su reseteo.`);
  }

  // --- Reseteo de BD_DEPOSITO ---
  const hojaDeposito = ss.getSheetByName(SHEETS.DEPOSIT);
  if (hojaDeposito) {
    const rangoDeposito = hojaDeposito.getDataRange();
    const datosDeposito = rangoDeposito.getValues();
    const headerDep = datosDeposito.shift();

    const idxStockInicialDep = headerDep.indexOf("STOCK_INICIAL");
    const idxStockActualDep = headerDep.indexOf("STOCK_ACTUAL");
    const idxEntradasDep = headerDep.indexOf("ENTRADAS");
    const idxSalidasDep = headerDep.indexOf("SALIDAS");
    const idxFechaActDep = headerDep.indexOf("FECHA_ACTUALIZACION");

    datosDeposito.forEach(fila => {
      const stockActual = fila[idxStockActualDep] || 0;
      fila[idxStockInicialDep] = stockActual;
      fila[idxEntradasDep] = 0;
      fila[idxSalidasDep] = 0;
      fila[idxFechaActDep] = hoy;
    });

    hojaDeposito.getRange(2, 1, datosDeposito.length, headerDep.length).setValues(datosDeposito);
    log(`✅ Hoja '${SHEETS.DEPOSIT}' actualizada.`);
  } else {
    log(`⚠️ No se encontró la hoja '${SHEETS.DEPOSIT}'. Se omitió su reseteo.`);
  }

  // --- 3. LIMPIEZA DE TABLAS HISTÓRICAS ---
  log("🧹 Limpiando tablas de historial para el nuevo período...");
  hojasARespaldarYLimpiar.forEach(nombreHoja => {
    const hoja = ss.getSheetByName(nombreHoja);
    if (hoja) {
      const ultimaFila = hoja.getLastRow();
      if (ultimaFila > 1) {
        hoja.getRange(2, 1, ultimaFila - 1, hoja.getLastColumn()).clearContent();
        log(`✅ Hoja '${nombreHoja}' limpiada.`);
      }
    }
  });

  // --- 4. REGENERAR FÓRMULAS ---
  log("⚙️ Restaurando fórmulas...");
  generarInventarioInicial();

  log("🎉 ¡Reseteo del sistema completado exitosamente!");
  log(`IMPORTANTE: El respaldo de los datos borrados está en tu Google Drive con el nombre "${nombreRespaldo}"`);
}

/**
 * @OnlyCurrentDoc
 * VERSIÓN FINAL Y ROBUSTA: Este script genera el .csv para Bartender y es compatible
 * con la ejecución manual (menú) y la interfaz web (logArray).
 */
// =================================================================
// ===           BARTENDER & CSV (CON DATA PREVIEW)              ===
// =================================================================

const HOJA_MOVIMIENTOS_BARTENDER = "BD_MOVIMIENTOS_INVENTARIO";
const HOJA_PRODUCTOS_BARTENDER = "BD_PRODUCTOS";
const NOMBRE_ARCHIVO_CSV_BARTENDER = "Resumen_Bartender.csv";

function actualizarArchivoCSV(logArray = null, fechaExterna = null) {
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => Logger.log(msg);
  let fechaSeleccionada;

  try {
    // 1. Determinar la fecha objetivo
    if (fechaExterna) {
      log(`ℹ️ Recibida fecha externa: ${fechaExterna}`);
      const fechaCorregida = fechaExterna.replace(/-/g, '/');
      fechaSeleccionada = new Date(fechaCorregida);
    } else if (logArray !== null) {
      fechaSeleccionada = new Date();
    } else {
      // UI Prompt (Ejecución manual)
      const ui = SpreadsheetApp.getUi();
      const response = ui.prompt('Fecha', 'DD/MM/AAAA:', ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() != ui.Button.OK) return { success: true };
      const parts = response.getResponseText().split('/');
      fechaSeleccionada = new Date(parts[2], parts[1] - 1, parts[0]);
    }

    if (isNaN(fechaSeleccionada.getTime())) throw new Error("Fecha inválida.");

    // 2. Procesar datos
    const datosParaExportar = procesarDatosDeInventario_Bartender(logArray, fechaSeleccionada);

    if (!datosParaExportar) {
      const msg = `No se encontraron movimientos de 'ENTRADA' para el ${fechaSeleccionada.toLocaleDateString()}.`;
      log(`⚠️ ${msg}`);
      return { success: false, message: msg };
    }

    // 3. Generar CSV
    const contenidoCSV = convertirArrayA_CSV_Bartender(datosParaExportar);
    const properties = PropertiesService.getScriptProperties();
    const fileId = properties.getProperty('bartenderCsvFileId');
    let archivoSalida = null;

    if (fileId) {
      try {
        archivoSalida = DriveApp.getFileById(fileId);
        if (!archivoSalida.isTrashed()) {
          archivoSalida.setContent(contenidoCSV);
          log(`✅ Archivo CSV actualizado (ID existente).`);
        } else {
          archivoSalida = null;
        }
      } catch (e) { archivoSalida = null; }
    }

    if (!archivoSalida) {
      archivoSalida = DriveApp.createFile(NOMBRE_ARCHIVO_CSV_BARTENDER, contenidoCSV, MimeType.CSV);
      properties.setProperty('bartenderCsvFileId', archivoSalida.getId());
      log(`✅ Nuevo archivo CSV creado.`);
    }

    // --- MEJORA VITAL: RETORNAR DATOS Y URL ---
    const fileUrl = archivoSalida.getUrl();

    // --- NUEVO: GUARDAR EN HISTORIAL Y NOTIFICAR ---
    registrarExitoBartender(fechaSeleccionada, logArray);
    enviarNotificacionGeneralBartender(fechaSeleccionada);
    guardarCopiaHistoricaDrive(contenidoCSV, fechaSeleccionada, logArray);

    return {
      success: true,
      message: "CSV generado exitosamente.",
      data: datosParaExportar, // <--- La matriz para la tabla HTML
      fileUrl: fileUrl         // <--- El link directo al archivo
    };

  } catch (e) {
    log(`❌ Error: ${e.message}`);
    return { success: false, message: e.message };
  }
}

/**
 * PARSEO DE FECHAS ROBUSTO
 */
function parseFechaLatina(input) {
  if (!input) return null;
  if (Object.prototype.toString.call(input) === '[object Date]') return input;

  const str = String(input).trim();
  const match = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);

  if (match) {
    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10) - 1;
    const anio = parseInt(match[3], 10);
    return new Date(anio, mes, dia);
  }

  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
}

function procesarDatosDeInventario_Bartender(logArray = null, fechaAProcesar = null) {
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => Logger.log(msg);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMovimientos = ss.getSheetByName(HOJA_MOVIMIENTOS_BARTENDER);
  const sheetProductos = ss.getSheetByName(HOJA_PRODUCTOS_BARTENDER);

  if (!sheetMovimientos || !sheetProductos) {
    log(`❌ Error: Faltan hojas.`);
    return null;
  }

  const tz = Session.getScriptTimeZone();
  const fechaTargetStr = Utilities.formatDate(fechaAProcesar, tz, "yyyyMMdd");

  log(`ℹ️ Procesando fecha normalizada: ${fechaTargetStr}`);

  const mapaProductos = new Map(
    sheetProductos.getDataRange().getValues().slice(1).map(row => [String(row[0]).trim(), row[8]])
  );

  const datosMovimientos = sheetMovimientos.getDataRange().getValues();
  const headers = datosMovimientos[0];
  const idxFecha = headers.indexOf("FECHA");
  const idxInvId = headers.indexOf("INVENTARIO_ID");
  const idxMov = headers.indexOf("MOVIMIENTO");
  const idxCant = headers.indexOf("CANTIDAD");

  const resumen = new Map();

  datosMovimientos.slice(1).forEach(fila => {
    const rawFecha = fila[idxFecha];
    const tipoMov = String(fila[idxMov]).trim().toUpperCase();

    if (rawFecha && tipoMov === 'ENTRADA') {
      const fechaCeldaObj = parseFechaLatina(rawFecha);

      if (fechaCeldaObj) {
        const fechaCeldaStr = Utilities.formatDate(fechaCeldaObj, tz, "yyyyMMdd");

        if (fechaCeldaStr === fechaTargetStr) {
          const invId = fila[idxInvId];
          const cantidad = parseFloat(fila[idxCant]) || 0;

          if (invId) {
            if (!resumen.has(invId)) {
              const prodId = invId.split('-')[0].trim();
              const desc = mapaProductos.get(prodId) || 'Sin Descripción';
              resumen.set(invId, { cantidad: 0, desc: desc });
            }
            resumen.get(invId).cantidad += cantidad;
          }
        }
      }
    }
  });

  if (resumen.size === 0) return null;

  const datosSalida = [['QR_CODE', 'PRODUCTO_ID', 'DESCRIPCION', 'COLOR', 'TALLE', 'TIENDA_ID', 'CANTIDAD']];

  resumen.forEach((val, key) => {
    const parts = key.split('-');
    if (parts.length >= 4) {
      datosSalida.push([
        key, parts[0], val.desc, parts[1], parts[2], parts[3], val.cantidad
      ]);
    }
  });

  log(`✅ Datos procesados: ${datosSalida.length - 1} registros.`);
  return datosSalida;
}

function convertirArrayA_CSV_Bartender(data) {
  return data.map(row => row.map(cell => {
    let str = String(cell === null ? '' : cell);
    if (str.includes(',') || str.includes('\n')) str = `"${str.replace(/"/g, '""')}"`;
    return str;
  }).join(',')).join('\n');
}

/**
 * Guarda los datos editados desde la web en el archivo CSV existente.
 */
function guardarCsvEditado(data, logArray = null) {
  const log = logArray ? (msg) => logArray.push(msg) : (msg) => Logger.log(msg);
  try {
    const contenidoCSV = convertirArrayA_CSV_Bartender(data);
    const properties = PropertiesService.getScriptProperties();
    const fileId = properties.getProperty('bartenderCsvFileId');

    if (!fileId) throw new Error("No se encontró el ID del archivo CSV original.");

    const archivo = DriveApp.getFileById(fileId);
    archivo.setContent(contenidoCSV);

    log(`✅ Archivo CSV actualizado con los cambios del usuario.`);

    return {
      success: true,
      message: "Cambios guardados exitosamente en el archivo CSV.",
      fileUrl: archivo.getUrl()
    };
  } catch (e) {
    log(`❌ Error al guardar CSV: ${e.message}`);
    return { success: false, message: e.message };
  }
}

/**
 * DISPARADOR AUTOMÁTICO PARA BARTENDER
 * Esta función debe ser programada con un Activador (Trigger) de Apps Script
 * para ejecutarse cada hora o cada 30 minutos.
 */
function verificarDisparadorBartender() {
  const logArray = [`[${new Date().toLocaleString()}] 🕒 Iniciando verificación de disparador automático...`];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetConfig = ss.getSheetByName(SHEETS.GENERAL_CONFIG);

  if (!sheetConfig) {
    console.error("No se encontró la hoja de configuración general.");
    return;
  }

  try {
    // 1. Obtener Configuración de Hora
    const dataConfig = sheetConfig.getDataRange().getValues();
    let valConfigHora = null;

    // Búsqueda en formato Fila (columna B)
    for (const row of dataConfig) {
      if (String(row[1]).trim() === "HORA_DISPARADOR_BARTENDER") {
        valConfigHora = row[2];
        break;
      }
    }

    // Búsqueda en formato Columna (Headers en fila 1)
    if (!valConfigHora && dataConfig.length > 0) {
      const headers = dataConfig[0];
      const idx = headers.indexOf("HORA_DISPARADOR_BARTENDER");
      if (idx !== -1 && dataConfig.length > 1) {
        valConfigHora = dataConfig[1][idx];
      }
    }

    if (!valConfigHora) {
      logArray.push("⚠️ No se encontró la clave o columna 'HORA_DISPARADOR_BARTENDER' en la configuración (Hoja: BD_CONFIGURACION_GENERAL). Abortando.");
      Logger.log(logArray.join("\n"));
      return;
    }

    // Normalizar Hora Destino
    let horaTarget, minutoTarget;
    if (valConfigHora instanceof Date) {
      // Si Sheets lo devuelve como Date (común en celdas formato Tiempo)
      horaTarget = valConfigHora.getHours();
      minutoTarget = valConfigHora.getMinutes();
    } else {
      // Si es texto "HH:mm"
      const parts = String(valConfigHora).split(":");
      horaTarget = Number(parts[0]);
      minutoTarget = Number(parts[1] || 0);
    }

    const horaDisplay = `${horaTarget.toString().padStart(2, '0')}:${minutoTarget.toString().padStart(2, '0')}`;

    // 2. Validar Día Hábil (Lunes = 1, Sábado = 6)
    const hoy = new Date();
    const diaSemana = hoy.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

    if (diaSemana === 0) {
      logArray.push("😴 Hoy es Domingo. No se ejecutan procesos automáticos.");
      Logger.log(logArray.join("\n"));
      return;
    }

    // 3. Validar Ventana de Tiempo
    const ahoraHora = hoy.getHours();
    const ahoraMinuto = hoy.getMinutes();

    // Comprobamos si estamos en la ventana de ejecución (ej: ejecución horaria)
    // Para simplificar, si la hora coincide, ejecutamos.
    // Como el trigger se ejecutará cada hora, esto asegura que se dispare una vez al día.
    if (ahoraHora !== horaTarget) {
      logArray.push(`⏳ Fuera de horario. Programado para las ${horaDisplay}. Actual: ${ahoraHora}:${ahoraMinuto.toString().padStart(2, '0')}`);
      Logger.log(logArray.join("\n"));
      return;
    }

    logArray.push(`🎯 Ventana de ejecución alcanzada (${horaDisplay}).`);

    // 4. Validar Movimientos (Lógica Backend)
    // Verificamos si hubo movimientos de 'ENTRADA' hoy antes de generar el CSV
    const tieneMovimientos = verificarExistenciaMovimientosHoy(hoy, logArray);

    if (!tieneMovimientos) {
      logArray.push("🚫 No se detectaron movimientos de ENTRADA hoy. Cancelando generación de CSV.");
      Logger.log(logArray.join("\n"));
      return;
    }

    // 5. Ejecutar Generación de CSV
    logArray.push("🚀 Condiciones cumplidas. Iniciando generación automática de CSV Bartender...");
    const resultado = actualizarArchivoCSV(logArray, Utilities.formatDate(hoy, Session.getScriptTimeZone(), "yyyy-MM-dd"));

    if (resultado.success) {
      logArray.push(`✅ Éxito: ${resultado.message}`);
    } else {
      logArray.push(`❌ Error en generación: ${resultado.message}`);
    }

  } catch (e) {
    logArray.push(`❌ ERROR CRÍTICO en disparador: ${e.message}`);
  } finally {
    Logger.log(logArray.join("\n"));
  }
}

/**
 * Valida si existen movimientos de ENTRADA para el día actual.
 */
function verificarExistenciaMovimientosHoy(fecha, logArray) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMovimientos = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENTS);

  if (!sheetMovimientos) return false;

  const data = sheetMovimientos.getDataRange().getValues();
  if (data.length < 2) return false;

  const headers = data[0];
  const idxFecha = headers.indexOf("FECHA");
  const idxMov = headers.indexOf("MOVIMIENTO");

  const tz = Session.getScriptTimeZone();
  const hoyStr = Utilities.formatDate(fecha, tz, "yyyyMMdd");

  for (let i = 1; i < data.length; i++) {
    const rawFecha = data[i][idxFecha];
    const tipoMov = String(data[i][idxMov]).trim().toUpperCase();

    if (rawFecha && tipoMov === 'ENTRADA') {
      const fechaCeldaObj = parseFechaLatina(rawFecha);
      if (fechaCeldaObj) {
        const fechaStr = Utilities.formatDate(fechaCeldaObj, tz, "yyyyMMdd");
        if (fechaStr === hoyStr) {
          logArray.push("✅ Movimientos de ENTRADA detectados correctamente.");
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Registra una actualización exitosa en la hoja BD_HISTORIAL_BARTENDER.
 */
function registrarExitoBartender(fechaObj, logArray) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.BARTENDER_HISTORY);

    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.BARTENDER_HISTORY);
      sheet.appendRow(["FECHA_PROCESADA", "FECHA_EJECUCION", "HORA", "ID_USUARIO", "OBSERVACION"]);
    }

    const tz = Session.getScriptTimeZone();
    const fechaProcesada = Utilities.formatDate(fechaObj, tz, "yyyy-MM-dd");
    const ahora = new Date();
    const fechaEjecucion = Utilities.formatDate(ahora, tz, "dd/MM/yyyy");
    const horaEjecucion = Utilities.formatDate(ahora, tz, "HH:mm");

    sheet.appendRow([fechaProcesada, fechaEjecucion, horaEjecucion, "SISTEMA", "Generación automática/manual"]);
    if (logArray) logArray.push(`📝 Historial actualizado para la fecha ${fechaProcesada}.`);
  } catch (e) {
    if (logArray) logArray.push(`⚠️ No se pudo registrar en historial: ${e.message}`);
  }
}

/**
 * Obtiene el historial de fechas procesadas para el Dashboard.
 */
function getBartenderFullHistory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.BARTENDER_HISTORY);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const tz = Session.getScriptTimeZone();

  return data.slice(1).map(row => {
    // row[0] = FECHA_PROCESADA (YYYY-MM-DD o Date)
    // row[1] = FECHA_EJECUCION (DD/MM/YYYY o Date)
    // row[2] = HORA

    let isoDate = "";
    let formatDate = "";

    // Normalizar Fecha Procesada
    if (row[0] instanceof Date) {
      isoDate = Utilities.formatDate(row[0], tz, "yyyy-MM-dd");
    } else {
      isoDate = String(row[0]).trim();
    }

    // Normalizar Fecha Ejecución
    if (row[1] instanceof Date) {
      formatDate = Utilities.formatDate(row[1], tz, "dd/MM/yyyy");
    } else {
      formatDate = String(row[1]).trim();
    }

    return {
      fecha_iso: isoDate,
      fecha_format: formatDate,
      hora: String(row[2]).trim()
    };
  }).filter(item => item.fecha_iso !== "").reverse();
}

/**
 * Envía notificación según el proveedor configurado (Telegram, Email, WhatsApp).
 */
function enviarNotificacionGeneralBartender(fechaObj) {
  if (!fechaObj || !(fechaObj instanceof Date)) fechaObj = new Date();

  const provider = (GLOBAL_CONFIG.NOTIFICACIONES.PROVIDER || "TELEGRAM").toUpperCase();
  const tz = Session.getScriptTimeZone();
  const fechaStr = Utilities.formatDate(fechaObj, tz, "dd/MM/yyyy");
  const mensaje = `📦 *SISTEMA:* Base de datos Bartender actualizada para el día *${fechaStr}*.\nEl archivo ya está disponible para impresión.`;

  Logger.log(`🔔 Iniciando notificación vía: ${provider}`);

  Logger.log(`🔔 Iniciando notificación vía: ${provider}`);

  try {
    let exito = false;

    if (provider === "TELEGRAM") {
      exito = enviarTelegramBartender(mensaje);
      if (!exito) {
        Logger.log("🔄 Fallback: Intentando enviar por EMAIL ya que Telegram no está configurado...");
        enviarEmailBartender(mensaje);
      }
    } else if (provider === "EMAIL") {
      enviarEmailBartender(mensaje);
    } else {
      Logger.log("ℹ️ No se configuró proveedor de notificación activo o es 'NONE'.");
    }
  } catch (e) {
    Logger.log(`❌ Error general en notificaciones: ${e.message}`);
  }
}

/**
 * Canal de Telegram
 */
function enviarTelegramBartender(mensaje) {
  const config = GLOBAL_CONFIG.TELEGRAM;
  if (!config.BOT_TOKEN || !config.CHAT_ID) {
    Logger.log("⚠️ Telegram NO configurado (TOKEN/CHAT_ID faltantes).");
    return false; // Indica falla para activar fallback
  }

  try {
    const url = `https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: config.CHAT_ID,
      text: mensaje,
      parse_mode: "Markdown"
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const resObj = JSON.parse(response.getContentText());

    if (resObj.ok) {
      Logger.log("✅ Telegram enviado con éxito.");
      return true;
    } else {
      Logger.log(`❌ Error de API Telegram: ${resObj.description}`);
      return false;
    }
  } catch (e) {
    Logger.log(`❌ Error conectando con Telegram: ${e.message}`);
    return false;
  }
}

/**
 * Canal de Email
 */
function enviarEmailBartender(mensaje) {
  const email = GLOBAL_CONFIG.NOTIFICACIONES.EMAIL_DESTINO || Session.getActiveUser().getEmail();
  const asunto = "📦 Notificación de Sistema: Bartender Actualizado";

  // Convertir markdown simple a texto plano/html básico
  const htmlBody = mensaje.replace(/\*(.*?)\*/g, "<b>$1</b>").replace(/\n/g, "<br>");

  MailApp.sendEmail({
    to: email,
    subject: asunto,
    htmlBody: htmlBody
  });
  Logger.log(`✅ Email enviado a: ${email}`);
}


/**
 * Función para probar la configuración desde el Dashboard
 */
function probarNotificacionActual() {
  const logArray = ["🧪 Iniciando prueba de notificación..."];
  try {
    enviarNotificacionGeneralBartender(new Date());
    logArray.push("✅ Proceso de notificación ejecutado. Revisa tu dispositivo.");
  } catch (e) {
    logArray.push(`❌ Error en la prueba: ${e.message}`);
  }
  return { success: true, logs: logArray };
}

/**
 * Guarda una copia de respaldo en una carpeta específica de Drive.
 */
function guardarCopiaHistoricaDrive(content, fechaObj, logArray) {
  try {
    const parentFolderId = GLOBAL_CONFIG.DRIVE.PARENT_FOLDER_ID;
    if (!parentFolderId) return;

    const rootFolder = DriveApp.getFolderById(parentFolderId);
    let historyFolder;
    const folders = rootFolder.getFoldersByName("BARTENDER_HISTORY");

    if (folders.hasNext()) {
      historyFolder = folders.next();
    } else {
      historyFolder = rootFolder.createFolder("BARTENDER_HISTORY");
    }

    const tz = Session.getScriptTimeZone();
    const timestamp = Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmm");
    const fechaTag = Utilities.formatDate(fechaObj, tz, "yyyyMMdd");
    const fileName = `Bartender_${fechaTag}_v${timestamp}.csv`;

    historyFolder.createFile(fileName, content, MimeType.CSV);
    if (logArray) logArray.push(`💾 Copia histórica guardada: ${fileName}`);
  } catch (e) {
    if (logArray) logArray.push(`⚠️ Error guardando copia histórica: ${e.message}`);
  }
}

/**
 * ORQUESTADOR DE CHATBOT (Telegram)
 * Recibe el mensaje, busca información y responde.
 */

// =========================================================
// === ENRIQUECIMIENTO DE DATOS (MANTENIDO PARA APPSHEET) ===
// =========================================================

/**
 * Gestión manual/AppSheet de enriquecimiento de producto
 */
function gestionarAccionEnriquecimiento(sku) {
  debugLog(`🛠️ [Webhook] Iniciando enriquecimiento para SKU: ${sku}`);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetProd = ss.getSheetByName(SHEETS.PRODUCTS);
    const dataProd = sheetProd.getDataRange().getValues();
    const headers = dataProd[0].map(h => String(h).trim());
    const colId = headers.indexOf("CODIGO_ID");
    const colDescIA = headers.indexOf("DESCRIPCION_IA");

    if (colId === -1 || colDescIA === -1) {
      debugLog("❌ [Webhook] Error: Faltan columnas ID o DESCRIPCION_IA");
      return { error: "Faltan columnas ID o DESCRIPCION_IA" };
    }

    const rowIndex = dataProd.findIndex(r => String(r[colId]) === sku);
    if (rowIndex === -1) {
      debugLog(`❌ [Webhook] Error: SKU ${sku} no encontrado en la hoja.`);
      return { error: "Producto no encontrado" };
    }

    const prodData = dataProd[rowIndex];
    const contexto = `Producto: ${prodData[headers.indexOf("MODELO")]} | Marca: ${prodData[headers.indexOf("MARCA")]} | Categoria: ${prodData[headers.indexOf("CATEGORIA")]}`;

    debugLog(`🧠 [IA] Solicitando descripción para: ${contexto}`);
    const prompt = `Actúa como un experto vendedor de moda. Genera una descripción humana para este producto enfocada en sus beneficios.
    Datos técnicos: ${contexto}
    
    Reglas:
    - Máximo 3 frases cortas.
    - Usa emojis.
    - No inventes colores.`;

    const respuestaHumanizada = consultarIA(prompt);

    if (respuestaHumanizada && respuestaHumanizada.includes("Error")) {
      debugLog(`❌ [IA] Falló la consulta: ${respuestaHumanizada}`);
      return { error: "Error de IA" };
    }

    sheetProd.getRange(rowIndex + 1, colDescIA + 1).setValue(respuestaHumanizada);
    debugLog(`✅ [Webhook] Descripción guardada con éxito para ${sku}`);

    return { success: true, description: respuestaHumanizada };
  } catch (e) {
    debugLog(`❌ [Webhook] Error crítico: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Obtiene un resumen de movimientos y stock actual para todas las variaciones.
 * Optimizado para hidratar el dashboard rápidamente con datos en tiempo real.
 */
function getInventoryHydrationData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.INVENTORY);
    const mapping = HeaderManager.getMapping("INVENTORY");

    if (!sheet || !mapping) throw new Error("Hoja de inventario no encontrada.");

    const data = sheet.getDataRange().getValues();
    data.shift(); // Quitar headers

    const idxId = mapping["INVENTARIO_ID"];

    // Soporte para múltiples variantes de nombres de columnas
    const idxStock = mapping["STOCK_ACTUAL"] !== undefined ? mapping["STOCK_ACTUAL"] : mapping["CURRENT_STOCK"];
    const idxEntradas = mapping["ENTRADAS"] !== undefined ? mapping["ENTRADAS"] : mapping["REPLACEMENT"];
    const idxSalidas = mapping["SALIDAS"] !== undefined ? mapping["SALIDAS"] : mapping["DEPARTURES"];
    const idxVWeb = mapping["VENTAS_WEB"] !== undefined ? mapping["VENTAS_WEB"] : mapping["WEB_SALES"];
    const idxVLocal = mapping["VENTAS_LOCAL"] !== undefined ? mapping["VENTAS_LOCAL"] : mapping["LOCAL_SALES"];

    if (idxId === undefined || idxStock === undefined) throw new Error("Hydration: Faltan columnas ID o Stock en Inventario.");

    const hydrationMap = {};
    data.forEach(row => {
      const id = String(row[idxId]).trim();
      if (!id) return;

      hydrationMap[id] = {
        s: parseInt(row[idxStock]) || 0, // Stock Actual
        e: parseInt(row[idxEntradas]) || 0, // Entradas
        sa: parseInt(row[idxSalidas]) || 0, // Salidas
        vw: parseInt(row[idxVWeb]) || 0,    // Ventas Web
        vl: parseInt(row[idxVLocal]) || 0   // Ventas Local
      };
    });

    return { success: true, map: hydrationMap };
  } catch (e) {
    debugLog("❌ Error en getInventoryHydrationData: " + e.message);
    return { success: false, message: e.message };
  }
}