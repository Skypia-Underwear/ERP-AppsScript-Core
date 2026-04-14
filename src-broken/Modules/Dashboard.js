// -----------------------------------------------------------
// --- FUNCIONES DE ACCESO AL DASHBOARD ---
// -----------------------------------------------------------

/**
 * Punto de entrada principal para el Dashboard.
 * Intenta cargar desde el JSON optimizado en Drive (Bake & Serve).
 * Si no existe, realiza la carga pesada tradicional.
 */
function cargarDashboardVentas() {
    try {
        const folderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;
        const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME || "erp";
        const appSlug = appName.toLowerCase().replace(/\s+/g, '-');
        const fileName = appSlug + "-ventas-dashboard.json";

        if (folderId) {
            const folder = DriveApp.getFolderById(folderId);
            const files = folder.getFilesByName(fileName);
            if (files.hasNext()) {
                const file = files.next();
                const content = file.getBlob().getDataAsString();
                debugLog("🚀 [Dashboard] Cargado instantáneamente desde Drive (Bake & Serve).");
                return content;
            }
        }
    } catch (e) {
        debugLog("⚠️ Error cargando JSON desde Drive: " + e.message);
    }

    // Fallback a carga pesada
    debugLog("🐢 [Dashboard] JSON no encontrado o error. Iniciando carga pesada...");
    return cargarDashboardVentas_HEAVY();
}

/**
 * Consolida y devuelve todas las ventas procesando las hojas de cálculo (Carga Pesada).
 */
function cargarDashboardVentas_HEAVY() {
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
    const logArray = [];

    try {
        // --- 0. CARGAR DATOS COMO OBJETOS ---
        // Usamos tu función nativa. Si la hoja no existe, devuelve [] automáticamente.
        const ventasBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES));
        const ventasPedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.VENTAS_PEDIDOS));
        const detalleBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES_DETAILS));
        const detallePedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DETALLE_VENTAS));

        // Datos auxiliares
        const clientesData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.CLIENTS));
        const cajaData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.GESTION_CAJA));
        const transferData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DATOS_TRANSFERENCIA));
        const usuariosData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.USUARIOS_SISTEMAS));
        const imagenesData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.PRODUCT_IMAGES));

        // Verificación rápida
        if (!ventasBlogger.length && !ventasPedidos.length) {
            return JSON.stringify({
                success: true,
                message: "⚠️ No se encontraron datos.",
                data: [],
                filterOptions: { cajas: [], origenes: [], metodosPago: [] },
                productImageMap: {}
            });
        }

        const generalId = getGeneralId(ss); // Necesitas la funcion auxiliar getGeneralId del paso anterior

        // --- HELPER: Parseo Robusto de Montos ---
        const parseMontoRobust = (rawVal) => {
            if (rawVal === null || rawVal === undefined || rawVal === '') return 0;
            if (typeof rawVal === 'number') return rawVal;

            if (typeof rawVal === 'string') {
                let limpio = rawVal.trim().replace('$', '').replace(/\s/g, '');
                // Lógica de detección de formato Argentina vs Internacional
                if (limpio.match(/\.\d{3},\d{2}$/)) { limpio = limpio.replace(/\./g, '').replace(',', '.'); }
                else if (limpio.match(/\d+,\d{1,2}$/)) { limpio = limpio.replace(',', '.'); }
                else if (limpio.match(/\d+\.\d{3}(\.\d{3})*$/)) { limpio = limpio.replace(/\./g, ''); }
                return parseFloat(limpio) || 0;
            }
            return 0;
        };

        // --- 1. MAPEAR REFERENCIAS (Lookup Tables) ---

        // 1.1 Usuarios
        const usuarioMap = {};
        usuariosData.forEach(u => {
            if (u.USER_ID) usuarioMap[u.USER_ID] = u.NOMBRE || 'Desconocido';
        });

        // 1.2 Clientes
        const clienteMap = {};
        clientesData.forEach(c => {
            if (c.CLIENTE_ID) clienteMap[c.CLIENTE_ID] = c.NOMBRE_COMPLETO || 'Desconocido';
        });

        // 1.3 Transferencias
        const transferenciaMap = {};
        transferData.forEach(t => {
            if (t.CUENTA_ID) {
                transferenciaMap[t.CUENTA_ID] = { banco: t.BANCO || 'N/A', alias: t.ALIAS || 'N/A' };
            }
        });

        // 1.4 Caja
        const cajaMap = {};
        cajaData.forEach(c => {
            if (c.CAJA_ID) {
                const asesorId = c.ASESOR_ID;
                const asesorNombre = usuarioMap[asesorId] || asesorId;
                cajaMap[c.CAJA_ID] = {
                    asesorId: asesorId,
                    asesor: asesorNombre,
                    fechaCaja: c.FECHA ? Utilities.formatDate(new Date(c.FECHA), Session.getScriptTimeZone(), 'yyyy-MM-dd') : 'N/A'
                };
            }
        });

        // 1.5 Imágenes (Solo portadas)
        const productImageMap = {};
        imagenesData.forEach(img => {
            // Convertimos a string y mayúsculas para asegurar comparación booleana
            const isPortada = String(img.PORTADA).toUpperCase() === 'TRUE';
            if (img.PRODUCTO_ID && isPortada && !productImageMap[img.PRODUCTO_ID]) {
                productImageMap[img.PRODUCTO_ID] = img.URL;
            }
        });

        // --- 2. CONSOLIDAR DETALLES ---
        const detalleVentasMap = {};

        const procesarDetalles = (listaDetalles, origen) => {
            listaDetalles.forEach((row, index) => {
                // Blogger usa 'CODIGO', Pedidos usa 'VENTA_ID'
                const ventaId = row.CODIGO || row.VENTA_ID;
                if (!ventaId) return;

                const precio = parseMontoRobust(row.PRECIO) || 0;
                const subtotal = parseMontoRobust(row.SUBTOTAL || row.MONTO) || 0;

                // Normalización de nombres y variaciones según origen
                let descripcion, tipoPrecio, color, talle, variedadId;
                
                if (origen === 'Pedido Local') {
                    descripcion = row.VARIACION_ID || row.PRODUCTO_ID; 
                    tipoPrecio = row.TIPO_PRECIO || 'N/A';
                    color = row.COLOR || 'N/A';
                    talle = row.TALLE || 'N/A';
                    variedadId = row.VARIACION_ID || '';
                } else {
                    // Blogger: Usamos columnas específicas si existen, sino fallback del nombre
                    descripcion = row.PRODUCTO_VARIACION || row.NOMBRE || row.CODIGO_ID || '';
                    
                    color = row.COLOR || '';
                    talle = row.TALLE || '';
                    variedadId = row.VARIEDAD_ID || '';
                    
                    const match = descripcion.match(/\(([^)]+)\)/);
                    if (match) {
                        const partes = match[1].split('-').map(p => p.trim());
                        tipoPrecio = row.TIPO_PRECIO || partes[0] || 'Menor';
                        if (!color || color === 'N/A') color = partes[1] || 'Surtido';
                        if (!talle || talle === 'N/A') talle = partes[2] || 'Surtido';
                    } else {
                        tipoPrecio = row.TIPO_PRECIO || 'Menor';
                    }
                    
                    if (!color) color = 'Surtido';
                    if (!talle) talle = 'Surtido';
                }

                const item = {
                    id: ventaId + '-' + index,
                    descripcion: descripcion,
                    cantidad: row.CANTIDAD || 0,
                    precioUnitario: precio,
                    subtotal: subtotal,
                    tipoPrecio: tipoPrecio,
                    productoId: row.PRODUCTO_ID,
                    color: color,
                    talle: talle,
                    variedadId: variedadId
                };

                if (!detalleVentasMap[ventaId]) detalleVentasMap[ventaId] = [];
                detalleVentasMap[ventaId].push(item);
            });
        };

        procesarDetalles(detalleBlogger, 'Blogger');
        procesarDetalles(detallePedidos, 'Pedido Local');

        // --- 2.1 HELPER DE NORMALIZACIÓN JSON ---
        const normalizarDetalleJson = (jsonString, ventaId) => {
            try {
                if (!jsonString) return null;
                const parsed = JSON.parse(jsonString);
                const items = parsed.detalle || parsed; // Soporta ambos formatos
                if (!Array.isArray(items)) return null;

                return items.map((it, idx) => {
                    let c = it.color;
                    let t = it.talle;
                    let tp = it.tipoPrecio;
                    const desc = it.nombre || it.descripcion_venta || it.descripcion || '';
                    
                    if (!c || !t || !tp) {
                        const match = desc.match(/\(([^)]+)\)/);
                        if (match) {
                            const partes = match[1].split('-').map(p => p.trim());
                            tp = tp || partes[0] || 'Menor';
                            c = c || partes[1] || 'Surtido';
                            t = t || partes[2] || 'Surtido';
                        }
                    }

                    return {
                        id: ventaId + '-j-' + idx,
                        descripcion: desc || 'Sin descripción',
                        cantidad: it.cantidad || 1,
                        precioUnitario: parseMontoRobust(it.precio || it.precioUnitario),
                        subtotal: parseMontoRobust(it.subtotal || it.monto),
                        tipoPrecio: tp || 'Menor',
                        productoId: it.productoId || it.codigo || '',
                        color: c || 'Surtido',
                        talle: t || 'Surtido',
                        variedadId: it.variedadId || it.variation_id || ''
                    };
                });
            } catch (e) {
                Logger.log("Error parseando DETALLE_JSON para " + ventaId + ": " + e.message);
                return null;
            }
        };

        // --- 3. CONSOLIDAR VENTAS ---
        const ventasConsolidadas = [];
        const uniqueCajas = new Set();
        const uniqueOrigenes = new Set();
        const uniquePagos = new Set();

        const procesarVentas = (listaVentas, origen) => {
            listaVentas.forEach(row => {
                const ventaId = row.CODIGO || row.VENTA_ID;
                if (!ventaId) return;

                // Limpieza de Total (Mismo lógica robusta que antes)
                let rawTotal = row.TOTAL_VENTA || row.MONTO_TOTAL_PRODUCTOS;
                let totalLimpio = parseMontoRobust(rawTotal);

                // Datos relacionados
                let tiendaId = row.TIENDA_ID || 'N/A';
                if (origen === 'Blogger' && tiendaId === 'N/A') tiendaId = generalId;

                const cajaId = row.CAJA_ID || row.CAJA || 'N/A';
                const asesorId = row.ASESOR_ID || 'N/A';
                const infoCaja = cajaMap[cajaId] || { asesor: asesorId, fechaCaja: 'N/A' };

                // Prioridad de nombre de asesor: Caja > Venta > ID
                let nombreAsesor = infoCaja.asesor;
                if (nombreAsesor === asesorId || !nombreAsesor) {
                    nombreAsesor = usuarioMap[asesorId] || asesorId;
                }

                const transferId = row.DATOS_TRANSFERENCIA;
                const infoTransfer = transferenciaMap[transferId] || { banco: 'N/A', alias: 'N/A' };

                // --- 2.2 PRIORIZACIÓN DE DATOS (Híbrido Hoja Detalles / JSON) ---
                // Priorizamos la hoja de detalles (detalleVentasMap) ya que contiene las columnas estructuradas (Color, Talle, VariedadId)
                let detallesVenta = detalleVentasMap[ventaId];

                if (!detallesVenta || detallesVenta.length === 0) {
                    detallesVenta = normalizarDetalleJson(row.DETALLE_JSON, ventaId);
                }

                if (!detallesVenta) detallesVenta = [];

                const recargoTransf = Number(row.RECARGO_TRANSFERENCIA || 0);

                let montoProductos = parseMontoRobust(row.MONTO_TOTAL_PRODUCTOS);
                let subtotal = parseMontoRobust(row.SUBTOTAL);

                // --- FALLBACK LOGIC (Para ventas Blogger que no traen estos campos) ---
                if (!montoProductos) {
                    montoProductos = detallesVenta.reduce((acc, d) => acc + (d.subtotal || 0), 0);
                }

                if (!subtotal) {
                    // Si no hay subtotal, asumimos que es (Total - Recargos Externos "al subtotal")
                    // En el modelo visual: Subtotal + RecargoTransf = Total (aprox, ignorando envio aqui si es separado)
                    // Ajuste segun logica usuario: Subtotal = Total - RecargoTransf
                    subtotal = totalLimpio - recargoTransf;
                }

                ventasConsolidadas.push({
                    id: ventaId,
                    fecha: row.FECHA ? Utilities.formatDate(new Date(row.FECHA), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : '',
                    origen: origen,
                    estado: row.ESTADO || 'SOLICITADO',
                    total: totalLimpio,
                    clienteId: row.CLIENTE_ID || 'CLI001',
                    nombreCliente: clienteMap[row.CLIENTE_ID] || 'Público General',
                    tiendaId: tiendaId,
                    metodoPago: row.METODO_PAGO || 'N/A',
                    cajaId: cajaId,
                    asesor: nombreAsesor,
                    fechaCaja: infoCaja.fechaCaja,
                    bancoTransferencia: infoTransfer.banco,
                    aliasTransferencia: infoTransfer.alias,
                    costoEnvio: Number(row.COSTO_ENVIO || 0),
                    recargoTransferencia: recargoTransf,
                    recargoMenor: Number(row.RECARGO_MENOR || 0),
                    detalles: detallesVenta,

                    // --- NUEVOS CAMPOS (Solicitud Usuario V2) ---
                    pagoEfectivo: parseMontoRobust(row.PAGO_EFECTIVO),
                    montoProductos: montoProductos,
                    subtotal: subtotal,
                    tipoVenta: row.TIPO_VENTA || 'DIRECTA',
                    compraMinima: Number(row.COMPRA_MINIMA || 0),
                    pagoMixto: String(row.PAGO_MIXTO).toUpperCase() === 'TRUE',
                    desactivarRecargoTransferencia: String(row.DESACTIVAR_RECARGO_TRANSFERENCIA).toUpperCase() === 'TRUE'
                });

                uniqueCajas.add(cajaId);
                uniqueOrigenes.add(origen);
                uniquePagos.add(row.METODO_PAGO || 'N/A');
            });
        };

        procesarVentas(ventasBlogger, 'Blogger');
        procesarVentas(ventasPedidos, 'Pedido Local');

        // Ordenar por fecha descendente
        ventasConsolidadas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        return JSON.stringify({
            success: true,
            data: ventasConsolidadas,
            filterOptions: {
                cajas: Array.from(uniqueCajas).filter(x => x !== 'N/A').sort(),
                origenes: Array.from(uniqueOrigenes).sort(),
                metodosPago: Array.from(uniquePagos).filter(x => x !== 'N/A').sort()
            },
            productImageMap: productImageMap
        });

    } catch (error) {
        debugLog("❌ ERROR en cargarDashboardVentas_HEAVY: " + error.toString());
        return JSON.stringify({ success: false, message: error.toString(), logs: logArray });
    }
}

/**
 * Función para actualizar el estado de una venta específica (para auditar/corregir).
 */
function actualizarEstadoVenta(ventaId, nuevoEstado, origen) {
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
    const hojaVentas = origen === 'Blogger' ? ss.getSheetByName(SHEETS.BLOGGER_SALES) : ss.getSheetByName(SHEETS.VENTAS_PEDIDOS);

    if (!hojaVentas) {
        return { success: false, message: `❌ Hoja de ventas (${origen}) no encontrada.` };
    }

    try {
        const mapping = HeaderManager.getMapping(origen === 'Blogger' ? "BLOGGER_SALES" : "VENTAS_PEDIDOS");
        if (!mapping) return { success: false, message: `❌ Mapeo para ${origen} no encontrado.` };

        const ventaIdHeader = origen === 'Blogger' ? "CODIGO" : "VENTA_ID";
        const ventaIdIndex = mapping[ventaIdHeader];
        const estadoIndex = mapping["ESTADO"];
        const cajaIndex = mapping["CAJA_ID"];

        if (ventaIdIndex === undefined || estadoIndex === undefined) {
            return { success: false, message: `❌ Columnas VENTA_ID/CODIGO o ESTADO no encontradas en el mapeo de ${origen}.` };
        }

        const dataRows = hojaVentas.getDataRange().getValues();
        dataRows.shift(); // Quitar encabezados

        for (let i = 0; i < dataRows.length; i++) {
            if (dataRows[i][ventaIdIndex] === ventaId) {
                const filaEncontrada = i + 2;
                hojaVentas.getRange(filaEncontrada, estadoIndex + 1).setValue(nuevoEstado);

                // --- ASIGNACIÓN AUTOMÁTICA DE CAJA (Solo Blogger) ---
                if (origen === 'Blogger' && (nuevoEstado === 'PAGADO' || nuevoEstado === 'ENTREGADO') && cajaIndex !== undefined) {
                    const currentCaja = dataRows[i][cajaIndex];
                    if (!currentCaja || currentCaja === 'N/A' || currentCaja === '') {
                        try {
                            const activeBoxId = getCurrentOpenBoxId();
                            if (activeBoxId) {
                                hojaVentas.getRange(filaEncontrada, cajaIndex + 1).setValue(activeBoxId);
                                debugLog(`📦 [Caja Auto] Venta ${ventaId} asignada a Caja ${activeBoxId}`);
                            }
                        } catch (eBox) {
                            debugLog(`⚠️ No se pudo asignar caja automáticamente: ${eBox.message}`);
                        }
                    }
                }

                SpreadsheetApp.flush();
                return { success: true, message: `✅ Estado de venta ${ventaId} (${origen}) actualizado a "${nuevoEstado}".` };
            }
        }

        return { success: false, message: `⚠️ Venta ${ventaId} no encontrada en la hoja ${hojaVentas.getName()}.` };

    } catch (e) {
        Logger.log(`ERROR en actualizarEstadoVenta: ${e.message} - ${e.stack}`);
        return { success: false, message: `❌ Error interno al actualizar el estado: ${e.message}` };
    }
}