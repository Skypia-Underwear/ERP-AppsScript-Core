// =================================================================================
// ARCHIVO: WoocommerceOrders.gs
// 1. IMPORTAR VENTAS (Relacional: Usa IDs de Cliente)
// 2. GESTIÓN DE IDENTIDAD (Mapeo automático Cliente <-> Venta)
// 3. DESCUENTO DE STOCK
// 4. ACTUALIZAR ESTADO
// =================================================================================

/**
 * PARTE 1: IMPORTACIÓN DE VENTAS (MASTER)
 */
function importarOrdenesDesdeWC() {
  const logArray = [];
  // Helper de log con hora
  const log = (msg) => {
    const time = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");
    logArray.push(`[${time}] ${msg}`);
  };

  log("🚀 INICIO: Conectando con WooCommerce...");

  try {
    // 1. Credenciales
    const key = GLOBAL_CONFIG.WORDPRESS.CONSUMER_KEY;
    const secret = GLOBAL_CONFIG.WORDPRESS.CONSUMER_SECRET;
    const siteUrl = GLOBAL_CONFIG.WORDPRESS.SITE_URL;

    if (!key || !secret || key.includes('XX')) throw new Error("Faltan credenciales en Main.gs");

    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);

    // -------------------------------------------------------
    // 2. Preparar Hojas y Cargar Clientes
    // -------------------------------------------------------
    const sheetOrders = prepararHojaVentas(ss, log);
    const sheetDetails = prepararHojaDetalles(ss, log);

    // CARGA INICIAL DE CLIENTES (Para no leer la hoja en cada iteración)
    log("📂 Cargando base de datos de clientes para mapeo de IDs...");
    const mapaClientes = cargarMapaClientes(ss); // Devuelve Map { email/tel -> ID }
    log(`   -> ${mapaClientes.size} clientes indexados en memoria.`);

    // 3. Llamada API
    const endpoint = `${siteUrl}wp-json/wc/v3/orders?per_page=20`;
    const authHeader = 'Basic ' + Utilities.base64Encode(`${key}:${secret}`);
    const options = { method: 'get', headers: { 'Authorization': authHeader }, muteHttpExceptions: true };

    log(`📡 Consultando API...`);
    const response = UrlFetchApp.fetch(endpoint, options);
    if (response.getResponseCode() !== 200) throw new Error(`Error API: ${response.getContentText()}`);

    const ordenes = JSON.parse(response.getContentText());
    if (ordenes.length === 0) return { success: true, message: "No hay órdenes nuevas.", logs: logArray };

    // 4. Procesamiento
    const dataSheet = sheetOrders.getDataRange().getValues();
    const idsExistentes = new Set();
    // Empezamos de 1 para saltar header
    for (let i = 1; i < dataSheet.length; i++) {
      if (dataSheet[i][0]) idsExistentes.add(String(dataSheet[i][0]));
    }

    let nuevas = 0, actualizadas = 0;
    const fechaSync = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

    // Procesar Órdenes
    for (const order of ordenes) {
      procesarUnaOrdenWC(order, ss, mapaClientes, log, sheetOrders, sheetDetails, idsExistentes, fechaSync);
    }

    const resumen = `🏁 Fin. Realizado procesamiento por lotes.`;
    log(resumen);
    notificarTelegramSalud(`✅ Importación finalizada: ${ordenes.length} órdenes procesadas.`, "EXITO");
    return { success: true, count: ordenes.length };
  } catch (e) {
    log(`❌ ERROR CRÍTICO: ${e.message}`);
    return { success: false, message: e.message, logs: logArray };
  }
}

/**
 * PARTE 1.5: PROCESADOR DE ORDEN INDIVIDUAL (Única fuente de verdad)
 * Esta función es usada tanto por el importador masivo como por el Webhook en tiempo real.
 */
function procesarUnaOrdenWC(order, ss, mapaClientes, log, sheetOrders, sheetDetails, idsExistentes, fechaSync) {
  const orderId = String(order.id);
  const billing = order.billing || {};
  const fullName = (billing.first_name + ' ' + billing.last_name).trim();

  // --- GESTIÓN DE IDENTIDAD DEL CLIENTE ---
  let clienteRef = fullName; 

  // 1. Extraer DNI/CUIT de los metadatos de la orden
  let dniWc = "";
  if (order.meta_data && Array.isArray(order.meta_data)) {
    const metaDni = order.meta_data.find(m => m.key === "_billing_dni" || m.key === "billing_dni" || m.key === "dni" || m.key === "cuit" || m.key === "_billing_cuit");
    if (metaDni) dniWc = String(metaDni.value).trim();
  }

  const datosContacto = {
    email: billing.email ? billing.email.trim().toLowerCase() : '',
    phone: billing.phone ? normalizarCelular(billing.phone) : '',
    dni: dniWc
  };

  let clienteIdEncontrado = null;
  // Búsqueda en Cascada: DNI > Email > Teléfono
  if (datosContacto.dni && mapaClientes.has(datosContacto.dni)) {
    clienteIdEncontrado = mapaClientes.get(datosContacto.dni);
  } else if (datosContacto.email && mapaClientes.has(datosContacto.email)) {
    clienteIdEncontrado = mapaClientes.get(datosContacto.email);
  } else if (datosContacto.phone && mapaClientes.has(datosContacto.phone)) {
    clienteIdEncontrado = mapaClientes.get(datosContacto.phone);
  }

  if (clienteIdEncontrado) {
    clienteRef = clienteIdEncontrado;
  } else {
    // Solo si la orden está confirmada/procesando para no llenar la BD de basura
    if (order.status === 'processing' || order.status === 'completed') {
      log(`   👤 Nuevo Cliente detectado: ${fullName} (DNI: ${dniWc || 'No provisto'})`);
      const nuevoCliente = registrarClienteNuevo(ss, order, log, dniWc);
      if (nuevoCliente.id) {
        clienteRef = nuevoCliente.id;
        // Indexar en el mapa actual para el resto del lote
        if (dniWc) mapaClientes.set(dniWc, clienteRef);
        if (datosContacto.email) mapaClientes.set(datosContacto.email, clienteRef);
        if (datosContacto.phone) mapaClientes.set(datosContacto.phone, clienteRef);
      }
    }
  }

  // Construcción de otros datos
  const provNombre = obtenerNombreProvincia(billing.state);
  const address = [billing.address_1, billing.city, provNombre].filter(Boolean).join(', ');
  
  // Tienda por defecto para WooCommerce (Primera en BD_TIENDAS)
  const tiendaIdWeb = obtenerTiendaPrincipal(ss);

  const productsStrForStock = order.line_items.map(item => {
    let skuFull = item.sku || ("ID-" + item.product_id);
    let skuBase = skuFull;
    if (skuFull.includes('-') && !skuFull.startsWith('ID-')) {
      const parts = skuFull.split('-');
      if (parts.length > 1) skuBase = parts.slice(0, -1).join('-');
    }
    return `[${skuBase}] ${item.name} (x${item.quantity})`;
  }).join(' | ');

  let dateStr = order.date_created ? order.date_created.replace('T', ' ').split('.')[0] : '';
  const rowData = [orderId, order.status, clienteRef, billing.phone, dniWc, address, productsStrForStock, order.total, dateStr, fechaSync];

  if (idsExistentes.has(orderId)) {
    // --- ACTUALIZAR ---
    const dataSheet = sheetOrders.getDataRange().getValues();
    for (let i = 1; i < dataSheet.length; i++) {
      if (String(dataSheet[i][0]) === orderId) {
        if (dataSheet[i][1] !== order.status) log(`🔄 Orden ${orderId}: Estado actualizado ${dataSheet[i][1]} -> ${order.status}`);
        sheetOrders.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return { status: "updated", id: orderId };
      }
    }
  } else {
    // --- INSERTAR ---
    sheetOrders.appendRow(rowData);
    idsExistentes.add(orderId); // Para evitar duplicados en el mismo lote

    let msgCliente = clienteIdEncontrado ? `(Cliente ID: ${clienteRef})` : `(Cliente: ${clienteRef})`;
    log(`✨ Nueva orden: ${orderId} ${msgCliente}`);

    const detallesNuevos = [];
    order.line_items.forEach((item, index) => {
      let skuFull = item.sku || ("ID-" + item.product_id);
      
      // Extraer atributos (Color, Talle, Precio)
      let precioTipo = "";
      
      // Intentar extraer Precio del SKU si tiene formato SKU-Tipo (ej: BERM1416-Menor)
      if (skuFull.includes('-') && !skuFull.startsWith('ID-')) {
        const parts = skuFull.split('-');
        precioTipo = parts[parts.length - 1]; // Tomar la última parte como tipo
      }

      let color = "";
      let talle = "";
      
      if (item.meta_data && Array.isArray(item.meta_data)) {
        item.meta_data.forEach(m => {
          const key = String(m.key).toLowerCase();
          const val = String(m.value);
          // Si el meta-data trae el precio, sobreescribimos lo del SKU
          if (key === "precio" || key === "tipo-de-precio" || key === "tipo_precio") precioTipo = val;
          if (key === "color" || key.includes("pa_color")) color = val;
          if (key === "talle" || key === "talla" || key.includes("pa_talle") || key.includes("pa_talla") || key === "size") talle = val;
        });
      }

      // Para el ID de Inventario, usamos el SKU base (sin el -Menor) + Variaciones
      let skuBase = skuFull;
      if (skuFull.includes('-') && !skuFull.startsWith('ID-')) {
        const parts = skuFull.split('-');
        if (parts.length > 1) {
          skuBase = parts.slice(0, -1).join('-');
        }
      }

      const idDetalle = `${orderId}-${index + 1}`;
      
      // Mapeo de Inventario (Fase 5)
      // Patrón: SKU-COLOR-TALLE-TIENDA
      const colorLimpio = color || "Surtido";
      const talleLimpio = talle || "Surtido";
      const inventarioId = `${skuBase}-${colorLimpio}-${talleLimpio}-${tiendaIdWeb}`;

      detallesNuevos.push([
        idDetalle, 
        orderId, 
        skuBase, // SKU base (CODIGO_ID)
        item.name, 
        item.quantity, 
        item.price, 
        item.total,
        skuFull, // TIPO_PRECIO ahora usa el SKU completo (Variedad ID) para referencia
        colorLimpio,
        talleLimpio,
        inventarioId
      ]);
    });
    if (detallesNuevos.length > 0) sheetDetails.getRange(sheetDetails.getLastRow() + 1, 1, detallesNuevos.length, detallesNuevos[0].length).setValues(detallesNuevos);

    // --- STOCK (Fase 5: Descuento preciso) ---
    if (order.status === 'processing' || order.status === 'completed') {
      const resultadoStock = procesarDescuentoDeStockPreciso(detallesNuevos, ss);
      if (resultadoStock.procesados > 0) log(`      📦 Stock: ${resultadoStock.detalles.join(', ')}`);
      if (resultadoStock.errores.length > 0) log(`      ⚠️ Alerta Stock: ${resultadoStock.errores.join(', ')}`);
    }
    return { status: "inserted", id: orderId };
  }
}

/**
 * HANDLER: RECIBIR WEBHOOK DE WOOCOMMERCE
 */
function handleWooCommerceWebhook(order) {
  const logArray = [];
  const log = (msg) => {
    const time = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");
    logArray.push(`[WEBHOOK] [${time}] ${msg}`);
  };

  if (!order || !order.id) return { success: false, message: "Datos de orden no válidos" };

  log(`🚀 Webhook Recibido: Orden #${order.id}`);

  try {
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
    const sheetOrders = prepararHojaVentas(ss, log);
    const sheetDetails = prepararHojaDetalles(ss, log);
    const mapaClientes = cargarMapaClientes(ss);
    
    // Obtener IDs existentes para saber si es update
    const dataSheet = sheetOrders.getDataRange().getValues();
    const idsExistentes = new Set();
    for (let i = 1; i < dataSheet.length; i++) {
      if (dataSheet[i][0]) idsExistentes.add(String(dataSheet[i][0]));
    }

    const fechaSync = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    
    const result = procesarUnaOrdenWC(order, ss, mapaClientes, log, sheetOrders, sheetDetails, idsExistentes, fechaSync);
    
    log(`✅ Proceso finalizado: ${result.status} ${result.id}`);
    
    // Notificar salud si es inserción (Venta Nueva)
    if (result.status === "inserted") {
      notificarTelegramSalud(`🛒 <b>Nueva Venta WooCommerce</b>\nOrden: #${order.id}\nTotal: ${order.total} ${order.currency}\nCliente: ${order.billing.first_name} ${order.billing.last_name}`, "EXITO");
    }

    return { success: true, result: result, logs: logArray };
  } catch (e) {
    log(`❌ Error Webhook: ${e.message}`);
    debugLog(`❌ Error Webhook WooCommerce: ${e.message}`, true);
    return { success: false, message: e.message, logs: logArray };
  }
}

/**
 * HELPERS: PREPARACIÓN DE HOJAS
 */
function prepararHojaVentas(ss, log) {
  const sheetName = SHEETS.WC_ORDERS || "BD_VENTAS_WOOCOMMERCE";
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    // Encabezados estandarizados HostingShop
    const headers = ["ID_ORDEN", "ESTADO", "CLIENTE", "TELEFONO", "DNI_CUIT", "DIRECCION_FACTURACION", "RESUMEN_PRODUCTOS", "TOTAL_VENTA", "FECHA", "ULTIMA_ACTUALIZACION"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#673ab7').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 7, 1000).setNumberFormat('$ #,##0.00'); // TOTAL_VENTA
    sheet.getRange(2, 4, 1000).setNumberFormat('@'); // TELEFONO texto
    log(`✅ Hoja '${sheetName}' inicializada.`);
  }
  return sheet;
}

function prepararHojaDetalles(ss, log) {
  const sheetName = "BD_DETALLE_VENTAS_WOOCOMMERCE";
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    const headers = ['ID_DETALLE', 'ID_ORDEN', 'SKU', 'PRODUCTO', 'CANTIDAD', 'PRECIO_UNIT', 'TOTAL_LINEA', 'PRECIO_TIPO', 'COLOR', 'TALLE', 'INVENTARIO_ID'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4caf50').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    log(`✅ Hoja '${sheetName}' inicializada.`);
  }
  return sheet;
}

/**
 * HELPERS: GESTIÓN DE CLIENTES
 */
function cargarMapaClientes(ss) {
  const mapa = new Map();
  const sheet = ss.getSheetByName(SHEETS.CLIENTS || "BD_CLIENTES");
  if (!sheet) return mapa;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Índices dinámicos
  const idxId = 0; // CLIENTE_ID (Columna A)
  const idxCel = headers.indexOf("CELULAR") > -1 ? headers.indexOf("CELULAR") : 3;
  const idxEmail = headers.indexOf("CORREO_ELECTRONICO") > -1 ? headers.indexOf("CORREO_ELECTRONICO") : 4;
  const idxDni = headers.indexOf("CUIT_DNI") > -1 ? headers.indexOf("CUIT_DNI") : 5;

  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idxId]).trim();
    const cel = normalizarCelular(data[i][idxCel]);
    const email = String(data[i][idxEmail]).trim().toLowerCase();
    const dni = String(data[i][idxDni]).trim();

    if (id) {
      if (dni) mapa.set(dni, id);
      if (email) mapa.set(email, id);
      if (cel) mapa.set(cel, id);
    }
  }
  return mapa;
}

function registrarClienteNuevo(ss, order, log, dniWc) {
  const sheet = ss.getSheetByName(SHEETS.CLIENTS || "BD_CLIENTES");
  if (!sheet) { log("❌ Error: No existe BD_CLIENTES"); return { id: null }; }

  const billing = order.billing || {};
  const nombre = (billing.first_name + ' ' + billing.last_name).trim() || "Cliente WC";
  const email = billing.email ? billing.email.trim().toLowerCase() : "";
  const phone = billing.phone ? billing.phone.trim() : "";

  // ID Único
  const newId = "WC-" + Utilities.getUuid().slice(0, 8).toUpperCase();

  // Mapeo Provincias
  let provNombre = obtenerNombreProvincia(billing.state || "");

  // Dirección Consolidada
  let direccion = billing.address_1 || "";
  if (billing.address_2) direccion += ", " + billing.address_2;
  if (billing.city) direccion += ", " + billing.city;

  // Estructura Fila BD_CLIENTES
  // 0:ID, 1:CLAS, 2:NOM, 3:CEL, 4:EMAIL, 5:CUIT, 6:COND, 7:TIPO, 8:AGENCIA, 9:CP, 10:PROV, 11:MUN, 12:LOC, 13:CALLE...
  const nuevaFila = [
    newId, "WOOCOMMERCE", nombre, phone, email, dniWc || "", "Consumidor Final", "DOMICILIO", "",
    billing.postcode || "", provNombre, "", "", direccion, "", "", "",
    "Registrado automáticamente por Script"
  ];

  // Rellenar hasta completar columnas de la hoja
  const numCols = sheet.getLastColumn();
  while (nuevaFila.length < numCols) nuevaFila.push("");

  sheet.appendRow(nuevaFila);
  log(`      ✅ Registrado con ID: ${newId}`);
  return { id: newId };
}

/**
 * PARTE 2: LÓGICA DE DESCUENTO DE STOCK (PRECISO V2)
 */
function procesarDescuentoDeStockPreciso(detalles, ss) {
  if (!ss) ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
  const hojaInventario = ss.getSheetByName(SHEETS.INVENTORY);
  if (!hojaInventario) return { procesados: 0, detalles: [], errores: ["Falta hoja inventario"] };

  const datosInv = hojaInventario.getDataRange().getValues();
  const headers = datosInv[0];

  const colInvId = headers.indexOf("INVENTARIO_ID");
  const colVentasWeb = headers.indexOf("VENTAS_WEB");
  const colStock = headers.indexOf("STOCK_ACTUAL");

  if (colInvId === -1 || colVentasWeb === -1 || colStock === -1) return { procesados: 0, detalles: [], errores: ["Columnas críticas no encontradas en Inventario"] };

  // Crear mapa de llave INVENTARIO_ID -> Fila
  const mapaInv = new Map();
  for (let i = 1; i < datosInv.length; i++) {
    const id = String(datosInv[i][colInvId]).trim();
    if (id) mapaInv.set(id, i + 1);
  }

  let procesados = 0;
  let detallesLogs = [];
  let errores = [];

  detalles.forEach(d => {
    // d = [idDetalle, orderId, sku, name, qty, price, total, precioTipo, color, talle, inventarioId]
    const qty = parseInt(d[4]);
    const invId = d[10];

    if (mapaInv.has(invId)) {
      const fila = mapaInv.get(invId);
      const cellVentas = hojaInventario.getRange(fila, colVentasWeb + 1);
      const currentVentas = parseInt(cellVentas.getValue()) || 0;
      cellVentas.setValue(currentVentas + qty);

      const cellStock = hojaInventario.getRange(fila, colStock + 1);
      const currentStock = parseInt(cellStock.getValue()) || 0;
      cellStock.setValue(currentStock - qty);

      procesados++;
      detallesLogs.push(`${invId} (-${qty})`);
    } else {
      errores.push(`ID no hallado: ${invId}`);
    }
  });

  return { procesados, detalles: detallesLogs, errores };
}

/**
 * Obtiene el ID de la primera tienda disponible en BD_TIENDAS.
 */
function obtenerTiendaPrincipal(ss) {
  const sheet = ss.getSheetByName(SHEETS.STORES || "BD_TIENDAS");
  if (!sheet) return "PRINCIPAL";
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) {
    return String(data[1][0]).trim(); // Columna A: TIENDA_ID
  }
  return "PRINCIPAL";
}

/**
 * PARTE 4: ACTUALIZAR ESTADO EN WC (Manual)
 */
function actualizarEstadoEnWCDesdeSheet(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = SHEETS.WC_ORDERS || "BD_VENTAS_WOOCOMMERCE";

  if (sheet.getName() !== sheetName || e.range.getColumn() !== 2 || e.range.getRow() <= 1) return;

  const nuevoEstado = e.range.getValue();
  const fila = e.range.getRow();
  const orderId = sheet.getRange(fila, 1).getValue();

  if (!orderId || !nuevoEstado) return;

  Logger.log(`📝 WC Update: ${orderId} -> ${nuevoEstado}`);
  e.range.setBackground('#fff3cd');

  try {
    const key = GLOBAL_CONFIG.WORDPRESS.CONSUMER_KEY;
    const secret = GLOBAL_CONFIG.WORDPRESS.CONSUMER_SECRET;
    const siteUrl = GLOBAL_CONFIG.WORDPRESS.SITE_URL;
    const url = `${siteUrl}wp-json/wc/v3/orders/${orderId}`;
    const authHeader = 'Basic ' + Utilities.base64Encode(`${key}:${secret}`);
    const payload = { 'status': nuevoEstado };
    const options = { 'method': 'put', 'muteHttpExceptions': true, 'headers': { 'Authorization': authHeader, 'Content-Type': 'application/json' }, 'payload': JSON.stringify(payload) };

    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      e.range.setBackground('#d4edda');
      SpreadsheetApp.getActiveSpreadsheet().toast(`Orden ${orderId} actualizada`, "WooCommerce", 3);
    } else {
      e.range.setBackground('#f8d7da');
    }
  } catch (err) {
    e.range.setBackground('#f8d7da');
  }
}

/**
 * Normaliza un número de celular para comparaciones fiables.
 * Quita espacios, guiones, paréntesis y signos de más que no sean el inicial.
 */
function normalizarCelular(tel) {
  if (!tel) return "";
  let limpio = String(tel).trim()
    .replace(/[^+0-9]/g, ""); // Solo números y signo +
  
  // Si tiene el + al inicio, lo respetamos pero limpiamos el resto
  return limpio;
}

/**
 * Mapea códigos de provincia de AR a nombres completos.
 */
function obtenerNombreProvincia(code) {
  if (!code) return "";
  const mapProvincias = {
    'A': 'Salta', 'B': 'Buenos Aires', 'C': 'Ciudad Autónoma de Buenos Aires',
    'D': 'San Luis', 'E': 'Entre Ríos', 'F': 'La Rioja', 'G': 'Santiago del Estero',
    'H': 'Chaco', 'J': 'San Juan', 'K': 'Catamarca', 'L': 'La Pampa',
    'M': 'Mendoza', 'N': 'Misiones', 'P': 'Formosa', 'Q': 'Neuquén',
    'R': 'Río Negro', 'S': 'Santa Fe', 'T': 'Tucumán', 'U': 'Chubut',
    'V': 'Tierra del Fuego', 'W': 'Corrientes', 'X': 'Córdoba', 'Y': 'Jujuy', 'Z': 'Santa Cruz'
  };
  const c = String(code).toUpperCase().trim();
  return (c.length <= 2 && mapProvincias[c]) ? mapProvincias[c] : code;
}