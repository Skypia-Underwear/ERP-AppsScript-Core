// -----------------------------------------------------------
// --- FUNCIONES DE ACCESO AL DASHBOARD ---
// -----------------------------------------------------------

/**
 * Consolida y devuelve todas las ventas usando 'convertirRangoAObjetos' (Nativo de tu Main.gs)
 */
function cargarDashboardVentas() {
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
            return {
                success: true,
                message: "⚠️ No se encontraron datos.",
                data: [],
                filterOptions: { cajas: [], origenes: [], metodosPago: [] },
                productImageMap: {}
            };
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

                // Normalización de nombres según origen
                let descripcion, tipoPrecio;
                if (origen === 'Pedido Local') {
                    descripcion = row.VARIACION_ID; // O PRODUCTO_ID según tu hoja
                    tipoPrecio = row.TIPO_PRECIO || 'N/A';
                } else {
                    // Lógica para extraer tipo de precio de Blogger (ej: "Producto (Mayorista)")
                    descripcion = row.PRODUCTO_VARIACION || '';
                    const match = descripcion.match(/\(([^)]+)\)/);
                    tipoPrecio = match && match[1] ? match[1].split('-')[0].trim() : 'Menor';
                }

                const item = {
                    id: ventaId + '-' + index,
                    descripcion: descripcion,
                    cantidad: row.CANTIDAD || 0,
                    precioUnitario: precio,
                    subtotal: subtotal,
                    tipoPrecio: tipoPrecio,
                    productoId: row.PRODUCTO_ID,
                    color: row.COLOR,
                    talle: row.TALLE
                };

                if (!detalleVentasMap[ventaId]) detalleVentasMap[ventaId] = [];
                detalleVentasMap[ventaId].push(item);
            });
        };

        procesarDetalles(detalleBlogger, 'Blogger');
        procesarDetalles(detallePedidos, 'Pedido Local');

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

                // --- CALCULOS PREVIOS ---
                const detallesVenta = detalleVentasMap[ventaId] || [];
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

        return {
            success: true,
            data: ventasConsolidadas,
            filterOptions: {
                cajas: Array.from(uniqueCajas).filter(x => x !== 'N/A').sort(),
                origenes: Array.from(uniqueOrigenes).sort(),
                metodosPago: Array.from(uniquePagos).filter(x => x !== 'N/A').sort()
            },
            productImageMap: productImageMap
        };

    } catch (error) {
        logArray.push(error.toString());
        return { success: false, message: error.toString(), logs: logArray };
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

        if (ventaIdIndex === undefined || estadoIndex === undefined) {
            return { success: false, message: `❌ Columnas VENTA_ID/CODIGO o ESTADO no encontradas en el mapeo de ${origen}.` };
        }

        let filaEncontrada = -1;

        for (let i = 0; i < data.length; i++) {
            if (data[i][ventaIdIndex] === ventaId) {
                filaEncontrada = i + 2;
                hojaVentas.getRange(filaEncontrada, estadoIndex + 1).setValue(nuevoEstado);
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