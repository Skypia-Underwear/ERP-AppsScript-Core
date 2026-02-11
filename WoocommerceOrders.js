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
        if(dataSheet[i][0]) idsExistentes.add(String(dataSheet[i][0]));
    }

    let nuevas = 0, actualizadas = 0;
    const fechaSync = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

    // Procesar Órdenes
    for (const order of ordenes) {
      const orderId = String(order.id);
      const billing = order.billing || {};
      const fullName = (billing.first_name + ' ' + billing.last_name).trim();
      
      // --- GESTIÓN DE IDENTIDAD DEL CLIENTE ---
      // Aquí determinamos qué poner en la columna "Cliente" (ID o Nombre)
      let clienteRef = fullName; // Fallback por defecto
      
      // Buscamos si ya existe
      const datosContacto = {
          email: billing.email ? billing.email.trim().toLowerCase() : '',
          phone: billing.phone ? billing.phone.trim() : ''
      };
      
      let clienteIdEncontrado = null;
      if (datosContacto.email && mapaClientes.has(datosContacto.email)) clienteIdEncontrado = mapaClientes.get(datosContacto.email);
      else if (datosContacto.phone && mapaClientes.has(datosContacto.phone)) clienteIdEncontrado = mapaClientes.get(datosContacto.phone);

      if (clienteIdEncontrado) {
          // CASO 1: Cliente YA existe -> Usamos su ID
          clienteRef = clienteIdEncontrado;
      } else {
          // CASO 2: Cliente NO existe -> ¿Registramos?
          // Solo si la orden está confirmada/procesando para no llenar la BD de basura
          if (order.status === 'processing' || order.status === 'completed') {
              log(`   👤 Nuevo Cliente detectado: ${fullName}`);
              const nuevoCliente = registrarClienteNuevo(ss, order, log);
              if (nuevoCliente.id) {
                  clienteRef = nuevoCliente.id; // Usamos el NUEVO ID
                  // Actualizamos el mapa en memoria por si hay otra orden del mismo cliente en este lote
                  if (datosContacto.email) mapaClientes.set(datosContacto.email, clienteRef);
                  if (datosContacto.phone) mapaClientes.set(datosContacto.phone, clienteRef);
              }
          } else {
              // CASO 3: Orden cancelada/fallida de cliente desconocido -> Dejamos el Nombre (Texto)
              // Esto romperá la "Ref" en AppSheet visualmente (triángulo amarillo), pero es correcto no registrarlo.
              // Si prefieres registrar TODOS, quita el 'if' de arriba.
          }
      }

      // Construcción de otros datos
      const address = [billing.address_1, billing.city, billing.state].filter(Boolean).join(', ');
      const productsStrForStock = order.line_items.map(item => {
         let c = item.sku || ("ID-" + item.product_id);
         return `[${c}] ${item.name} (x${item.quantity})`;
      }).join(' | ');

      let dateStr = order.date_created ? order.date_created.replace('T', ' ').split('.')[0] : '';

      // ARRAY FINAL DE FILA (Nótese que clienteRef ahora es el ID)
      const rowData = [orderId, order.status, clienteRef, billing.phone, address, productsStrForStock, order.total, dateStr, fechaSync];

      if (idsExistentes.has(orderId)) {
        // --- ACTUALIZAR ---
        for (let i = 1; i < dataSheet.length; i++) {
          if (String(dataSheet[i][0]) === orderId) {
            if (dataSheet[i][1] !== order.status) log(`🔄 Orden ${orderId}: Estado actualizado ${dataSheet[i][1]} -> ${order.status}`);
            // Opcional: Si antes tenía nombre y ahora ya tenemos ID (se registró), actualizamos la celda de cliente también
            sheetOrders.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
            actualizadas++;
            break;
          }
        }
      } else {
        // --- INSERTAR ---
        sheetOrders.appendRow(rowData);
        nuevas++;
        
        let msgCliente = clienteIdEncontrado ? `(Cliente ID: ${clienteRef})` : `(Cliente: ${clienteRef})`;
        log(`✨ Nueva orden: ${orderId} ${msgCliente}`);
        
        // Insertar Detalles
        const detallesNuevos = [];
        order.line_items.forEach((item, index) => {
            let skuLimpio = item.sku || ("ID-" + item.product_id);
            if (skuLimpio.includes('-') && !skuLimpio.startsWith('ID-')) skuLimpio = skuLimpio.split('-')[0]; 
            const idDetalle = `${orderId}-${index + 1}`;
            detallesNuevos.push([idDetalle, orderId, skuLimpio, item.name, item.quantity, item.price, item.total]);
        });
        if (detallesNuevos.length > 0) sheetDetails.getRange(sheetDetails.getLastRow() + 1, 1, detallesNuevos.length, detallesNuevos[0].length).setValues(detallesNuevos);

        // --- STOCK ---
        if (order.status === 'processing' || order.status === 'completed') {
            const resultadoStock = procesarDescuentoDeStock(productsStrForStock, ss);
            if (resultadoStock.procesados > 0) log(`      📦 Stock: ${resultadoStock.detalles.join(', ')}`);
            if (resultadoStock.errores.length > 0) log(`      ⚠️ Alerta Stock: ${resultadoStock.errores.join(', ')}`);
        }
      }
    }

    const resumen = `🏁 Fin. Nuevas: ${nuevas}, Act: ${actualizadas}.`;
    log(resumen);
    return { success: true, message: resumen, logs: logArray };

  } catch (e) {
    log(`❌ ERROR CRÍTICO: ${e.message}`);
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
        // Encabezados ajustados: Columna C es "ID Cliente"
        const headers = ['ID Orden', 'Estado', 'ID Cliente', 'Teléfono', 'Dirección', 'Productos', 'Total', 'Fecha', 'Ult. Actualización'];
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#673ab7').setFontColor('#FFFFFF');
        sheet.setFrozenRows(1);
        sheet.getRange(2, 7, 1000).setNumberFormat('$ #,##0.00'); 
        sheet.getRange(2, 4, 1000).setNumberFormat('@'); // Tel texto
        log(`✅ Hoja '${sheetName}' inicializada.`);
    }
    return sheet;
}

function prepararHojaDetalles(ss, log) {
    const sheetName = "BD_DETALLE_VENTAS_WOOCOMMERCE";
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    
    if (sheet.getLastRow() === 0) {
        const headers = ['ID_DETALLE', 'ID_ORDEN', 'SKU', 'PRODUCTO', 'CANTIDAD', 'PRECIO_UNIT', 'TOTAL_LINEA'];
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

    for (let i = 1; i < data.length; i++) {
        const id = String(data[i][idxId]).trim();
        const cel = String(data[i][idxCel]).trim();
        const email = String(data[i][idxEmail]).trim().toLowerCase();

        if (id) {
            if (cel) mapa.set(cel, id);
            if (email) mapa.set(email, id);
        }
    }
    return mapa;
}

function registrarClienteNuevo(ss, order, log) {
    const sheet = ss.getSheetByName(SHEETS.CLIENTS || "BD_CLIENTES");
    if (!sheet) { log("❌ Error: No existe BD_CLIENTES"); return { id: null }; }

    const billing = order.billing || {};
    const nombre = (billing.first_name + ' ' + billing.last_name).trim() || "Cliente WC";
    const email = billing.email ? billing.email.trim().toLowerCase() : "";
    const phone = billing.phone ? billing.phone.trim() : "";

    // ID Único
    const newId = "WC-" + Utilities.getUuid().slice(0, 8).toUpperCase();

    // Mapeo Provincias
    const mapProvincias = {
      'A': 'Salta', 'B': 'Buenos Aires', 'C': 'Ciudad Autónoma de Buenos Aires',
      'D': 'San Luis', 'E': 'Entre Ríos', 'F': 'La Rioja', 'G': 'Santiago del Estero',
      'H': 'Chaco', 'J': 'San Juan', 'K': 'Catamarca', 'L': 'La Pampa',
      'M': 'Mendoza', 'N': 'Misiones', 'P': 'Formosa', 'Q': 'Neuquén',
      'R': 'Río Negro', 'S': 'Santa Fe', 'T': 'Tucumán', 'U': 'Chubut',
      'V': 'Tierra del Fuego', 'W': 'Corrientes', 'X': 'Córdoba', 'Y': 'Jujuy', 'Z': 'Santa Cruz'
    };
    let provCode = billing.state || "";
    let provNombre = (provCode.length <= 2 && mapProvincias[provCode.toUpperCase()]) ? mapProvincias[provCode.toUpperCase()] : provCode;

    // Dirección Consolidada
    let direccion = billing.address_1 || "";
    if (billing.address_2) direccion += ", " + billing.address_2;
    if (billing.city) direccion += ", " + billing.city;

    // Estructura Fila BD_CLIENTES
    // 0:ID, 1:CLAS, 2:NOM, 3:CEL, 4:EMAIL, 5:CUIT, 6:COND, 7:TIPO, 8:AGENCIA, 9:CP, 10:PROV, 11:MUN, 12:LOC, 13:CALLE...
    const nuevaFila = [
        newId, "WOOCOMMERCE", nombre, phone, email, "", "Consumidor Final", "DOMICILIO", "", 
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
 * PARTE 2: LÓGICA DE DESCUENTO DE STOCK
 */
function procesarDescuentoDeStock(productosString, ss) { // Pasamos ss como param
  if (!ss) ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
  const hojaInventario = ss.getSheetByName(SHEETS.INVENTORY); 
  const hojaConfig = ss.getSheetByName(SHEETS.GENERAL_CONFIG);
  
  if (!hojaInventario || !hojaConfig) return { procesados: 0, detalles: [], errores: ["Falta hoja"] };

  const tiendaIdObjetivo = String(hojaConfig.getRange("A2").getValue()).trim();
  const datosInv = hojaInventario.getDataRange().getValues();
  const mapaProductos = new Map(); 
  const headers = datosInv[0];
  
  const colVentasWeb = headers.indexOf("VENTAS_WEB");
  const colStock = headers.indexOf("STOCK_ACTUAL");
  const colProdId = headers.indexOf("PRODUCTO_ID");
  const colTienda = headers.indexOf("TIENDA_ID");

  if (colVentasWeb === -1 || colStock === -1 || colProdId === -1 || colTienda === -1) return { procesados: 0, detalles: [], errores: ["Columnas no encontradas"] };

  for (let i = 1; i < datosInv.length; i++) {
    if (String(datosInv[i][colTienda]).trim() === tiendaIdObjetivo) {
        const prodId = String(datosInv[i][colProdId]).trim();
        if(prodId && !mapaProductos.has(prodId)) mapaProductos.set(prodId, i + 1); 
    }
  }

  const items = productosString.split(' | ');
  let itemsProcesados = 0;
  let errores = [];
  let detallesExitosis = [];

  items.forEach(item => {
    const match = item.match(/\[(.*?)\] .*?\(x(\d+)\)/);
    if (match) {
      const rawSku = match[1]; 
      const cantidad = parseInt(match[2]);
      let fila = null;
      let skuFinal = rawSku;

      if (mapaProductos.has(rawSku)) fila = mapaProductos.get(rawSku);
      else {
        const cleanSku = rawSku.split('-')[0];
        if (mapaProductos.has(cleanSku)) {
            fila = mapaProductos.get(cleanSku);
            skuFinal = cleanSku;
        }
      }

      if (fila) {
        const cellVentas = hojaInventario.getRange(fila, colVentasWeb + 1);
        cellVentas.setValue((parseInt(cellVentas.getValue()) || 0) + cantidad);
        const cellStock = hojaInventario.getRange(fila, colStock + 1);
        cellStock.setValue((parseInt(cellStock.getValue()) || 0) - cantidad);
        itemsProcesados++;
        detallesExitosis.push(`${skuFinal} (-${cantidad})`);
      } else {
        if (!rawSku.startsWith("ID-")) errores.push(`${rawSku}`);
      }
    }
  });

  return { procesados: itemsProcesados, detalles: detallesExitosis, errores: errores };
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