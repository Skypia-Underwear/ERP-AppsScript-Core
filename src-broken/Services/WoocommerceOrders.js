// =================================================================================
// ARCHIVO: WoocommerceOrders.gs
// 1. IMPORTAR VENTAS (Relacional: Usa IDs de Cliente)
// 2. GESTIÓN DE IDENTIDAD (Mapeo automático Cliente <-> Venta)
// 3. DESCUENTO DE STOCK
// 4. ACTUALIZAR ESTADO
// =================================================================================

/**
 * DIAGNÓSTICO: Prueba la conexión con WooCommerce y devuelve los datos de la última orden.
 * Se puede ejecutar manualmente desde el editor de Apps Script.
 */
function testWooCommerceConnection() {
  const log = (msg) => console.log(`[TEST-WC] ${msg}`);
  try {
    const key = GLOBAL_CONFIG.WORDPRESS.CONSUMER_KEY;
    const secret = GLOBAL_CONFIG.WORDPRESS.CONSUMER_SECRET;
    let siteUrl = GLOBAL_CONFIG.WORDPRESS.SITE_URL;
    if (!siteUrl.endsWith('/')) siteUrl += '/';
    
    const authHeader = 'Basic ' + Utilities.base64Encode(`${key}:${secret}`);
    // Intentar con parámetros de URL (más robusto en Hostings que filtran headers)
    const getUrl = `${siteUrl}wp-json/wc/v3/orders/?per_page=1&consumer_key=${key}&consumer_secret=${secret}`;
    
    log(`Conectando a: ${siteUrl}wp-json/wc/v3/orders/?per_page=1&consumer_key=ck_...&consumer_secret=cs_...`);
    const response = UrlFetchApp.fetch(getUrl, { 
      muteHttpExceptions: true 
    });
    
    const code = response.getResponseCode();
    const body = response.getContentText();
    
    if (code === 200) {
      log("✅ Conexión exitosa!");
      const data = JSON.parse(body);
      if (data.length > 0) {
        log(`Última orden encontrada: #${data[0].id} (Status: ${data[0].status})`);
      }
      return "Conexión exitosa. Revisa los logs de ejecución.";
    } else {
      log(`❌ Error ${code}: ${body}`);
      return `Error ${code}: Revisa los logs de ejecución.`;
    }
  } catch (e) {
    log(`❌ Excepción: ${e.message}`);
    return `Excepción: ${e.message}`;
  }
}

/**
 * PARTE 1: MANIPULACIÓN DE ESTADOS (AppSheet -> WooCommerce)
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
    return { success: true, count: ordenes.length, logs: logArray };
  } catch(ex) {
    console.error("❌ Error en importarOrdenesDesdeWC: " + ex.message);
    return { success: false, error: ex.message, logs: logArray };
  }
}

/**
 * ACCIÓN: ACTUALIZAR ESTADO DESDE APPSHEET
 * Se usa cuando el usuario audita y aprueba en AppSheet.
 */
function handleAppSheetStatusUpdate(contents) {
  // 0. DIAGNÓSTICO Y MAPEATIVO
  // AppSheet a veces anida los datos o usa nombres de columna directo
  const orderId = contents.idOrden || contents.ID_ORDEN || (contents.data && contents.data.ID_ORDEN);
  const nuevoEstado = contents.nuevoEstado || contents.ESTADO || (contents.data && contents.data.ESTADO);
  const logArray = [];
  const log = (msg) => {
    logArray.push(msg);
    console.log(msg);
  };

  if (!orderId || !nuevoEstado) {
    const errorMsg = `❌ AppSheet Sync falló: Faltan parámetros (idOrden:${orderId}, nuevoEstado:${nuevoEstado}). Recibido: ${JSON.stringify(contents)}`;
    console.error(errorMsg);
    return { success: false, message: errorMsg, received: contents };
  }

  // --- PREVENCIÓN DE BUCLES (ECOS) ---
  const cache = CacheService.getScriptCache();
  const ecoKey = `eco_lock_${orderId}_${nuevoEstado}`;
  if (cache.get(ecoKey)) {
    log(`⏳ Ignorando petición duplicada (eco) para Orden #${orderId} -> ${nuevoEstado}`);
    return { success: true, message: "Petición ignorada por eco reciente (prevención de bucles)" };
  }
  cache.put(ecoKey, "1", 15); // Bloqueo de 15 segundos para esta combinación

  log(`🛠️ AppSheet Sync: Iniciando proceso para Orden #${orderId} -> ${nuevoEstado}`);

  try {
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
    
    // 1. CONFIGURACIÓN API
    const key = GLOBAL_CONFIG.WORDPRESS.CONSUMER_KEY;
    const secret = GLOBAL_CONFIG.WORDPRESS.CONSUMER_SECRET;
    let siteUrl = GLOBAL_CONFIG.WORDPRESS.SITE_URL;
    if (!siteUrl.endsWith('/')) siteUrl += '/';
    
    // 2. OBTENER ORDEN DE WOOCOMMERCE
    // Usamos parámetros de URL para mayor compatibilidad con Hostings (Donweb/etc)
    const getUrl = `${siteUrl}wp-json/wc/v3/orders/${orderId}?consumer_key=${key}&consumer_secret=${secret}`;
    log(`📋 Fetching WC Order: ${siteUrl}wp-json/wc/v3/orders/${orderId}?consumer_key=ck_...`);
    
    const getResponse = UrlFetchApp.fetch(getUrl, { 
      muteHttpExceptions: true 
    });
    
    log(`📥 Respuesta GET WC: ${getResponse.getResponseCode()}`);
    if (getResponse.getResponseCode() !== 200) {
      throw new Error(`WC API Error (GET ${orderId}): ${getResponse.getResponseCode()} - ${getResponse.getContentText()}`);
    }
    const orderData = JSON.parse(getResponse.getContentText());

    // 3. ACTUALIZAR ESTADO EN WOOCOMMERCE
    // Evitar actualizar si ya tiene ese estado
    if (orderData.status === nuevoEstado) {
      log(`✅ La orden ya tiene el estado '${nuevoEstado}'. Omitiendo actualización de API.`);
    } else {
      const putUrl = `${siteUrl}wp-json/wc/v3/orders/${orderId}?consumer_key=${key}&consumer_secret=${secret}`;
      const payload = { status: nuevoEstado };
      
      log(`📤 Actualizando WC Status: ${siteUrl}wp-json/wc/v3/orders/${orderId}?consumer_key=ck_... -> ${JSON.stringify(payload)}`);
      
      const putResponse = UrlFetchApp.fetch(putUrl, {
        method: 'put',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      log(`📥 Respuesta PUT WC: ${putResponse.getResponseCode()}`);
      if (putResponse.getResponseCode() !== 200) {
        throw new Error(`WC API Error (PUT ${orderId}): ${putResponse.getResponseCode()} - ${putResponse.getContentText()}`);
      }
    }

    // 4. GESTIÓN DE STOCK PROTEGIDA (BLINDADA)
    let stockStatus = "Omitido (No hubo cambio de estado relevante para stock)";
    
    // USAMOS EL ESTADO ACTUAL EN WOOCOMMERCE COMO 'oldStatus'
    // Esto es más seguro porque AppSheet ya pudo haber actualizado la hoja de cálculo.
    const oldStatus = orderData.status;

    const esNuevoValido = (nuevoEstado === 'processing' || nuevoEstado === 'completed');
    const eraYaValido = (oldStatus === 'processing' || oldStatus === 'completed');
    const esCancelado = (nuevoEstado === 'cancelled' || nuevoEstado === 'trash');

    if (esNuevoValido && !eraYaValido) {
       // --- DESCONTAR ---
       const tiendaId = obtenerTiendaPrincipal(ss);
       log(`📦 [VENTA] Descontando stock: ${orderId} (${oldStatus} -> ${nuevoEstado})`);
       const detalles = extraerDetallesDeOrdenWC(orderData, ss, tiendaId, log);
       const resultadoStock = procesarDescuentoDeStockPreciso(detalles, ss, log, false);
       stockStatus = resultadoStock.procesados > 0 ? `✅ Stock descontado: ${resultadoStock.detalles.join(', ')}` : `⚠️ Stock: ${resultadoStock.errores.join(', ')}`;
    } 
    else if (esCancelado && eraYaValido) {
       // --- DEVOLVER ---
       const tiendaId = obtenerTiendaPrincipal(ss);
       log(`⏪ [DEVOLUCIÓN] Reponiendo stock: ${orderId} (${oldStatus} -> ${nuevoEstado})`);
       const detalles = extraerDetallesDeOrdenWC(orderData, ss, tiendaId, log);
       const resultadoStock = procesarDescuentoDeStockPreciso(detalles, ss, log, true); // true = devolver
       stockStatus = resultadoStock.procesados > 0 ? `⏪ Stock repuesto: ${resultadoStock.detalles.join(', ')}` : `⚠️ Stock: ${resultadoStock.errores.join(', ')}`;
    }
    else if (esNuevoValido && eraYaValido) {
       log(`ℹ️ Stock ya estaba descontado (${oldStatus}). No se requiere acción.`);
       stockStatus = "ℹ️ Stock ya procesado anteriormente.";
    }

    log(`🏁 Sincronización exitosa.`);
    return { 
      success: true, 
      message: `Estado '${nuevoEstado}' sincronizado correctamente`,
      stock: stockStatus,
      logs: logArray
    };

  } catch (e) {
    const errorMsg = "❌ Error en handleAppSheetStatusUpdate: " + e.message;
    console.error(errorMsg);
    log(errorMsg);
    return { success: false, error: e.message, logs: logArray };
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
  
  // --- EXTRACCIÓN DE DATOS FINANCIEROS Y ENVÍO ---
  const shippingTotal = Number(order.shipping_total) || 0;
  const totalOrder = Number(order.total) || 0;
  const subtotal = totalOrder - shippingTotal; // Aproximación lógica (Total - Envío)
  const shippingLines = order.shipping_lines || [];
  const shippingMethodRaw = shippingLines.length > 0 ? shippingLines[0].method_title : "N/A";
  
  // Mapeo Amigable de Tipo de Envío (v15.1)
  let tipoEnvioLabel = "TIENDA WEB";
  const sMethodUpper = shippingMethodRaw.toUpperCase();
  if (sMethodUpper.includes("RETIRO") || sMethodUpper.includes("SUCURSAL") || sMethodUpper.includes("LOCAL")) {
    tipoEnvioLabel = "RETIRO TIENDA";
  } else if (sMethodUpper.includes("ENVIO") || sMethodUpper.includes("DOMICILIO") || sMethodUpper.includes("LIVE")) {
    tipoEnvioLabel = "A DOMICILIO";
  } else if (sMethodUpper.includes("AGENCIA") || sMethodUpper.includes("DESPACHO")) {
    tipoEnvioLabel = "DESPACHO AGENCIA";
  }

  const customerNote = order.customer_note || "";

  // --- CONSTRUCCIÓN DINÁMICA DE FILA (v16.1 Blindaje) ---
  const mapping = HeaderManager.getMapping("WC_ORDERS");
  if (!mapping) throw new Error("No se pudo obtener el mapeo para WC_ORDERS. Verifica Constants.js");

  const rowDataArray = new Array(Math.max(...Object.values(mapping)) + 1).fill("");
  
  rowDataArray[mapping.ID_ORDEN] = orderId;
  rowDataArray[mapping.ESTADO] = order.status;
  rowDataArray[mapping.CLIENTE] = clienteRef;
  rowDataArray[mapping.TELEFONO] = billing.phone || "";
  rowDataArray[mapping.DNI_CUIT] = dniWc || "";
  rowDataArray[mapping.DIRECCION_FACTURACION] = address;
  rowDataArray[mapping.LOCALIDAD] = billing.city || "";
  rowDataArray[mapping.PROVINCIA] = provNombre || "";
  rowDataArray[mapping.CP] = billing.postcode || "";
  rowDataArray[mapping.RESUMEN_PRODUCTOS] = productsStrForStock;
  rowDataArray[mapping.SUBTOTAL_PRODUCTOS] = subtotal;
  rowDataArray[mapping.COSTO_ENVIO] = shippingTotal;
  rowDataArray[mapping.METODO_ENVIO] = shippingMethodRaw;
  rowDataArray[mapping.TIPO_ENVIO] = tipoEnvioLabel;
  rowDataArray[mapping.TOTAL_VENTA] = totalOrder;
  rowDataArray[mapping.FECHA_PEDIDO] = dateStr;
  rowDataArray[mapping.NOTAS_ORDEN] = customerNote;
  rowDataArray[mapping.ULTIMA_ACTUALIZACION] = fechaSync;

  const rowData = rowDataArray;

  if (idsExistentes.has(orderId)) {
    // --- ACTUALIZAR ---
    const dataSheet = sheetOrders.getDataRange().getValues();
    for (let i = 1; i < dataSheet.length; i++) {
      if (String(dataSheet[i][mapping.ID_ORDEN]) === orderId) {
        const oldStatus = dataSheet[i][mapping.ESTADO];
        if (oldStatus !== order.status) {
          log(`🔄 Orden ${orderId}: Estado actualizado ${oldStatus} -> ${order.status}`);
          sheetOrders.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);

          // --- LOGICA DE STOCK BLINDADA ---
          const esNuevoValido = (order.status === 'processing' || order.status === 'completed');
          const eraYaValido = (oldStatus === 'processing' || oldStatus === 'completed');
          const esCancelado = (order.status === 'cancelled' || order.status === 'trash');

          if (esNuevoValido && !eraYaValido) {
            log(`      🚀 Gatillando DESCUENTO de stock por cambio de estado...`);
            const detalles = extraerDetallesDeOrdenWC(order, ss, tiendaIdWeb, log);
            const resultadoStock = procesarDescuentoDeStockPreciso(detalles, ss, log, false);
            if (resultadoStock.procesados > 0) log(`      📦 Stock: ${resultadoStock.detalles.join(', ')}`);
            if (resultadoStock.errores.length > 0) log(`      ⚠️ Alerta Stock: ${resultadoStock.errores.join(', ')}`);
          } 
          else if (esCancelado && eraYaValido) {
            log(`      ⏪ Gatillando REPOSICIÓN de stock por cancelación...`);
            const detalles = extraerDetallesDeOrdenWC(order, ss, tiendaIdWeb, log);
            const resultadoStock = procesarDescuentoDeStockPreciso(detalles, ss, log, true);
            if (resultadoStock.procesados > 0) log(`      ⏪ Stock Repuesto: ${resultadoStock.detalles.join(', ')}`);
            if (resultadoStock.errores.length > 0) log(`      ⚠️ Alerta Reposición: ${resultadoStock.errores.join(', ')}`);
          }
        }
        return { status: "updated", id: orderId };
      }
    }
  } else {
    // --- INSERTAR ---
    sheetOrders.appendRow(rowData);
    idsExistentes.add(orderId); // Para evitar duplicados en el mismo lote

    let msgCliente = clienteIdEncontrado ? `(Cliente ID: ${clienteRef})` : `(Cliente: ${clienteRef})`;
    log(`✨ Nueva orden: ${orderId} ${msgCliente}`);

    const detallesNuevos = extraerDetallesDeOrdenWC(order, ss, tiendaIdWeb, log);
    
    // 4. REGISTRAR DETALLES DINÁMICAMENTE
    if (detallesNuevos.length > 0) {
        const mappingDet = HeaderManager.getMapping("WC_DETAILS");
        const filasDetalles = detallesNuevos.map(d => {
            const f = new Array(Math.max(...Object.values(mappingDet)) + 1).fill("");
            f[mappingDet.ID_DETALLE] = d[0]; f[mappingDet.ID_ORDEN] = d[1];
            f[mappingDet.SKU] = d[2]; f[mappingDet.PRODUCTO] = d[3];
            f[mappingDet.CANTIDAD] = d[4]; f[mappingDet.PRECIO_UNIT] = d[5];
            f[mappingDet.TOTAL_LINEA] = d[6]; f[mappingDet.PRECIO_TIPO] = d[7];
            f[mappingDet.UNIDADES_PACK] = d[8]; f[mappingDet.COLOR] = d[9];
            f[mappingDet.TALLE] = d[10]; f[mappingDet.INVENTARIO_ID] = d[11];
            f[mappingDet.DESCRIPCION_VENTA] = d[12];
            return f;
        });
        sheetDetails.getRange(sheetDetails.getLastRow() + 1, 1, filasDetalles.length, filasDetalles[0].length).setValues(filasDetalles);
    }

    // 5. STOCK (Fase 5: Descuento preciso)
    if (order.status === 'processing' || order.status === 'completed') {
      const resultadoStock = procesarDescuentoDeStockPreciso(detallesNuevos, ss, log);
      if (resultadoStock.procesados > 0) log(`      📦 Stock: ${resultadoStock.detalles.join(', ')}`);
      if (resultadoStock.errores.length > 0) log(`      ⚠️ Alerta Stock: ${resultadoStock.errores.join(', ')}`);
    }
    return { status: "inserted", id: orderId };
  }
}

/**
 * EXTRAER DETALLES DE PRODUCTOS DESDE EL JSON DE WOOCOMMERCE
 */
function extraerDetallesDeOrdenWC(order, ss, tiendaId, log) {
  // 1. Obtener Configuración Global (Fase 10)
  let esProductoSimpleGlobal = false;
  try {
    const sheetConfig = ss.getSheetByName(SHEETS.GENERAL_CONFIG || "BD_CONFIGURACION_GENERAL");
    const tipoReg = (sheetConfig.getRange("O2").getValue() || "").toString().trim().toUpperCase();
    esProductoSimpleGlobal = (tipoReg === "PRODUCTO SIMPLE");
  } catch(e) {
    log(`      ⚠️ Error leyendo Config Global: ${e.message}`);
  }

  const detalles = [];
  const orderId = order.id.toString();

  order.line_items.forEach((item, index) => {
    let skuFull = item.sku || ("ID-" + item.product_id);
    let precioTipo = "";
    
    if (skuFull.includes('-') && !skuFull.startsWith('ID-')) {
      const parts = skuFull.split('-');
      precioTipo = parts[parts.length - 1];
    }

    let color = "";
    let talle = "";
    if (item.meta_data && Array.isArray(item.meta_data)) {
      item.meta_data.forEach(m => {
        const key = String(m.key).toLowerCase();
        const val = String(m.value);
        if (key === "precio" || key === "tipo-de-precio" || key === "tipo_precio") precioTipo = val;
        if (key === "color" || key.includes("pa_color")) color = val;
        if (key === "talle" || key === "talla" || key.includes("pa_talle") || key.includes("pa_talla") || key === "size") talle = val;
      });
    }

    let skuBase = skuFull.split('-')[0];
    
    // --- LÓGICA DE PRECIO TIPO MEJORADA ---
    // Si el meta no lo tiene o es "SURTIDO" (que suele ser el color/talle), 
    // lo extraemos del SKU: CAMP9033-Media-Docena-SURTIDO -> Media-Docena
    if (!precioTipo || precioTipo.toUpperCase() === "SURTIDO") {
      const skuParts = skuFull.split('-');
      if (skuParts.length > 1) {
        precioTipo = skuParts[1]; // Tomamos el segundo segmento (Docena, Media-Docena, Menor, etc.)
      }
    }

    const colorFinal = color || "Surtido";
    const talleFinal = talle || "Surtido";
    
    let inventarioId;
    if (esProductoSimpleGlobal) {
      inventarioId = `${skuBase}-Surtido-Surtido-${tiendaId}`;
    } else {
      inventarioId = `${skuBase}-${colorFinal}-${talleFinal}-${tiendaId}`;
    }

    let unidadesPack = 1;
    try {
      const variedadMap = cargarMapaVariedades(ss);
      const skuLimpio = skuFull.replace("-SURTIDO", "").replace("-Surtido", "");
      if (variedadMap.has(skuLimpio)) {
        unidadesPack = Number(variedadMap.get(skuLimpio)) || 1;
      } else {
        const parts = skuLimpio.split('-');
        const tipoSolo = parts[parts.length - 1];
        for (let [vid, cant] of variedadMap.entries()) {
          if (vid.startsWith(skuBase) && vid.endsWith(tipoSolo)) {
            unidadesPack = Number(cant) || 1;
            break;
          }
        }
      }
    } catch (e) {}

    // --- GENERAR DESCRIPCIÓN DE VENTA (ESTILO APPSHEET PARA WHATSAPP) ---
    const descVenta = `${item.name}
- Codigo ID: *${skuBase}*
- SKU: *${skuFull}*
- Color: ${colorFinal}
- Talles: ${talleFinal}
- Tipo Precio: ${precioTipo || "Unitario"}
- Cant: *${item.quantity} x $${item.price} = $${item.total}*
------------------------------------------ `;

    detalles.push([
      `${orderId}-${index + 1}`, 
      orderId, 
      skuBase,
      item.name, 
      item.quantity, 
      item.price, 
      item.total,
      skuFull, 
      unidadesPack, 
      colorFinal,
      talleFinal,
      inventarioId,
      descVenta
    ]);
  });
  return detalles;
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
    // Encabezados estandarizados HostingShop (v16)
    const headers = [
      "ID_ORDEN", "ESTADO", "CLIENTE", "TELEFONO", "DNI_CUIT", "DIRECCION_FACTURACION", 
      "LOCALIDAD", "PROVINCIA", "CP", "RESUMEN_PRODUCTOS", "SUBTOTAL_PRODUCTOS", 
      "COSTO_ENVIO", "METODO_ENVIO", "TIPO_ENVIO", "TOTAL_VENTA", "FECHA_PEDIDO", 
      "NOTAS_ORDEN", "ULTIMA_ACTUALIZACION"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#673ab7').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    
    // Formatos moneda (Ajustados por nuevas columnas)
    sheet.getRange(2, 4, 1000).setNumberFormat('@'); // TELEFONO texto
    sheet.getRange(2, 11, 1000).setNumberFormat('$ #,##0.00'); // SUBTOTAL
    sheet.getRange(2, 12, 1000).setNumberFormat('$ #,##0.00'); // ENVIO
    sheet.getRange(2, 15, 1000).setNumberFormat('$ #,##0.00'); // TOTAL_VENTA
    log(`✅ Hoja '${sheetName}' inicializada con estructura v16 (Tipo Envío mapeado).`);
  } else {
    // MIGRACIÓN: Si la hoja existe pero no tiene la nueva columna TIPO_ENVIO (v16)
    if (sheet.getLastColumn() < 18) {
      log("⚠️ Detectada estructura v15 o inferior en BD_VENTAS_WOOCOMMERCE. Migrando a v16 (Tipo Envío)...");
      // Insertar 1 columna después de METODO_ENVIO (M es 13)
      sheet.insertColumnAfter(13);
      sheet.getRange(1, 14).setValue("TIPO_ENVIO");
      sheet.getRange(1, 14).setFontWeight('bold').setBackground('#673ab7').setFontColor('#FFFFFF');
      
      // Re-formatear columna de moneda que se desplazó
      sheet.getRange(2, 15, 1000, 1).setNumberFormat('$ #,##0.00'); // TOTAL_VENTA
      log("✅ Migración a v16 completada.");
    }
  }
  return sheet;
}

function prepararHojaDetalles(ss, log) {
  const sheetName = "BD_DETALLE_VENTAS_WOOCOMMERCE";
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    const headers = ['ID_DETALLE', 'ID_ORDEN', 'SKU', 'PRODUCTO', 'CANTIDAD', 'PRECIO_UNIT', 'TOTAL_LINEA', 'PRECIO_TIPO', 'UNIDADES_PACK', 'COLOR', 'TALLE', 'INVENTARIO_ID', 'DESCRIPCION_VENTA'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4caf50').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    log(`✅ Hoja '${sheetName}' inicializada.`);
  } else {
    // MIGRACIÓN: Verificar si falta la columna DESCRIPCION_VENTA
    if (sheet.getLastColumn() <= 12) {
      log("⚠️ Migrando BD_DETALLE_VENTAS_WOOCOMMERCE: Agregando columna DESCRIPCION_VENTA...");
      sheet.getRange(1, 13).setValue("DESCRIPCION_VENTA").setFontWeight('bold').setBackground('#4caf50').setFontColor('#FFFFFF');
    }
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
function procesarDescuentoDeStockPreciso(detalles, ss, logFunc = null, esDevolucion = false) {
  const log = logFunc || ((msg) => Logger.log(msg));
  if (!ss) ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
  const hojaInventario = ss.getSheetByName(SHEETS.INVENTORY);
  if (!hojaInventario) return { procesados: 0, detalles: [], errores: ["Falta hoja inventario"] };

  const datosInv = hojaInventario.getDataRange().getValues();
  const mapping = HeaderManager.getMapping("INVENTORY");

  if (!mapping) return { procesados: 0, detalles: [], errores: ["Error al mapear columnas de Inventario"] };

  const colInvId = mapping["INVENTARIO_ID"];
  const colVentasWeb = mapping["VENTAS_WEB"];
  const colStock = mapping["STOCK_ACTUAL"];

  if (colInvId === undefined || colVentasWeb === undefined || colStock === undefined) {
     return { procesados: 0, detalles: [], errores: ["Columnas críticas (ID, VENTAS_WEB, STOCK) no halladas"] };
  }

  // Crear mapa de llave INVENTARIO_ID -> Fila (Normalizado a mayúsculas)
  const mapaInv = new Map();
  for (let i = 1; i < datosInv.length; i++) {
    const id = String(datosInv[i][colInvId]).trim().toUpperCase();
    if (id) mapaInv.set(id, i + 1);
  }

  let procesados = 0;
  let detallesLogs = [];
  let errores = [];

  detalles.forEach(d => {
    // d = [idDetalle, orderId, sku, name, qty, price, total, precioTipo, unidadesPack, color, talle, inventarioId]
    const unidadesPack = parseInt(d[8]) || 1;
    const qtyBase = parseInt(d[4]);
    const qtyTotal = qtyBase * unidadesPack;
    
    // offset: POSITIVO para venta (suma a ventas, resta a stock)
    //         NEGATIVO para devolución (resta a ventas, suma a stock)
    const offset = esDevolucion ? -qtyTotal : qtyTotal;
    
    let invId = d[11];
    let invIdNorm = invId.toUpperCase();
    
    // Fallback Lógica
    if (!mapaInv.has(invIdNorm)) {
      const skuBase = d[2];
      const segments = invId.split('-');
      const tiendaId = segments[segments.length - 1]; 
      const fallbackId = `${skuBase}-Surtido-Surtido-${tiendaId}`.toUpperCase();
      
      if (mapaInv.has(fallbackId)) {
        log(`      🔄 Fallback: ${invId} -> ${fallbackId}`);
        invIdNorm = fallbackId;
      }
    }

    if (mapaInv.has(invIdNorm)) {
      const fila = mapaInv.get(invIdNorm);
      
      const cellVentas = hojaInventario.getRange(fila, colVentasWeb + 1);
      const currentVentas = parseInt(cellVentas.getValue()) || 0;
      cellVentas.setValue(currentVentas + offset);

      const cellStock = hojaInventario.getRange(fila, colStock + 1);
      const currentStock = parseInt(cellStock.getValue()) || 0;
      cellStock.setValue(currentStock - offset);

      procesados++;
      detallesLogs.push(`${invIdNorm} (${esDevolucion ? '+' : '-'}${qtyTotal})`);
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
 * Carga el mapa de VARIEDAD_ID -> CANTIDAD_MINIMA desde BD_VARIEDAD_PRODUCTOS.
 */
function cargarMapaVariedades(ss) {
  const mapa = new Map();
  const sheet = ss.getSheetByName(SHEETS.PRODUCT_VARIETIES || "BD_VARIEDAD_PRODUCTOS");
  if (!sheet) return mapa;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idxId = headers.indexOf("VARIEDAD_ID");
  const idxCant = headers.indexOf("CANTIDAD_MINIMA");

  if (idxId === -1 || idxCant === -1) return mapa;

  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idxId]).trim();
    const cant = data[i][idxCant];
    if (id) mapa.set(id, cant);
  }
  return mapa;
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