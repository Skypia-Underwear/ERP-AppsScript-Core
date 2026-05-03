/**
 * ARCHIVO: BigQueryBridge.js
 * LÓGICA DE CONEXIÓN CON DATA WAREHOUSE (V1.0)
 */

const BQ_CONFIG = {
    get PROJECT_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GCP_PROJECT_ID"] || "SkypiaUnderwearApi"; },
    DATASET_ID: "ERP_MASTER",
    TABLE_VENTAS: "HISTORIAL_VENTAS",
    TABLE_DETALLES: "HISTORIAL_DETALLES"
};

/**
 * Función Maestra: Toma las ventas y sus detalles de las hojas y las sube a BigQuery.
 */
function archivarVentasEnBigQuery() {
    if (!GLOBAL_CONFIG.ENABLE_BIGQUERY) {
        debugLog("ℹ️ BigQuery está desactivado en la configuración global.");
        return { success: true, message: "BigQuery desactivado (Postergado)." };
    }
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);

    try {
        // --- 1. PROCESAR CABECERAS DE VENTAS ---
        const ventasBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES));
        const ventasPedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.VENTAS_PEDIDOS));

        const timezone = Session.getScriptTimeZone();
        const todasLasVentas = [...ventasBlogger, ...ventasPedidos].map(v => {
            let fechaObj = v.FECHA instanceof Date ? v.FECHA : new Date(v.FECHA);
            let fechaStr = isNaN(fechaObj.getTime()) ? String(v.FECHA || "") : Utilities.formatDate(fechaObj, timezone, "yyyy-MM-dd");
            
            return {
                VENTA_ID: String(v.CODIGO || v.VENTA_ID || ""),
                TIENDA_ID: String(v.TIENDA_ID || ""),
                ASESOR_ID: String(v.ASESOR_ID || ""),
                FECHA: fechaStr,
                HORA: String(v.HORA || ""),
                CLIENTE_ID: String(v.CLIENTE_ID || ""),
                CAJA_ID: String(v.CAJA_ID || v.CAJA || ""),
                TIPO_VENTA: String(v.TIPO_VENTA || "DIRECTA"),
                COMPRA_MINIMA: parseFloat(v.COMPRA_MINIMA || 0) || 0,
                PAGO_MIXTO: String(v.PAGO_MIXTO || "FALSE").toUpperCase(),
                METODO_PAGO: String(v.METODO_PAGO || ""),
                DATOS_TRANSFERENCIA: String(v.DATOS_TRANSFERENCIA || ""),
                DESACTIVAR_RECARGO_TRANSFERENCIA: String(v.DESACTIVAR_RECARGO_TRANSFERENCIA || "FALSE").toUpperCase(),
                MONTO_TOTAL_PRODUCTOS: parseFloat(v.MONTO_TOTAL_PRODUCTOS || 0) || 0,
                PAGO_EFECTIVO: parseFloat(v.PAGO_EFECTIVO || 0) || 0,
                SUBTOTAL: parseFloat(v.SUBTOTAL || 0) || 0,
                RECARGO_MENOR: parseFloat(v.RECARGO_MENOR || 0) || 0,
                COSTO_ENVIO: parseFloat(v.COSTO_ENVIO || 0) || 0,
                RECARGO_TRANSFERENCIA: parseFloat(v.RECARGO_TRANSFERENCIA || 0) || 0,
                TOTAL_VENTA: parseFloat(v.TOTAL_VENTA || v.MONTO_TOTAL_PRODUCTOS || 0) || 0,
                ESTADO: String(v.ESTADO || ""),
                CAMBIOS: String(v.CAMBIOS || ""),
                COMPROBANTE_FILE: String(v.COMPROBANTE_FILE || ""),
                DETALLE_AUDITORIA_IA: String(v.DETALLE_AUDITORIA_IA || ""),
                DETALLE_JSON: typeof v.DETALLE_JSON === 'string' ? v.DETALLE_JSON : JSON.stringify(v.DETALLE_JSON || {}),
                ORIGEN: v.CODIGO ? "Blogger" : "Pedido Local"
            };
        });

        // --- 2. PROCESAR DETALLES DE VENTAS ---
        const detallesBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES_DETAILS));
        const detallesPedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DETALLE_VENTAS));

        const todosLosDetalles = [...detallesBlogger, ...detallesPedidos].map(d => ({
            VENTA_ID: String(d.CODIGO || d.VENTA_ID || ""),
            REGISTRO_ID: String(d.REGISTRO_ID || ""),
            SCAN: String(d.SCAN || ""),
            VARIACION_ID: String(d.VARIEDAD_ID || d.VARIACION_ID || ""),
            CATEGORIA_PADRE: String(d.CATEGORIA_PADRE || ""),
            CATEGORIA: String(d.CATEGORIA || ""),
            TEMPORADA: String(d.TEMPORADA || ""),
            PRODUCTO_ID: String(d.PRODUCTO_ID || d.CODIGO_ID || ""),
            COLOR: String(d.COLOR || ""),
            TALLE: String(d.TALLE || ""),
            TIPO_PRECIO: String(d.TIPO_PRECIO || ""),
            PRECIO: parseFloat(d.PRECIO || d.PRECIO_UNITARIO || 0) || 0,
            CANTIDAD: parseFloat(d.CANTIDAD || 0) || 0,
            MONTO: parseFloat(d.MONTO || d.SUBTOTAL || 0) || 0,
            INVERSION: parseFloat(d.INVERSION || 0) || 0,
            GANANCIA: parseFloat(d.GANANCIA || 0) || 0,
            DESCRIPCION_VENTA: String(d.DESCRIPCION_VENTA || d.PRODUCTO_VARIACION || d.NOMBRE || "")
        })).filter(d => d.VENTA_ID !== "");

        // --- 3. EMPUJAR A BIGQUERY ---
        if (todasLasVentas.length > 0) {
            pushToBigQuery(BQ_CONFIG.DATASET_ID, BQ_CONFIG.TABLE_VENTAS, todasLasVentas);
            debugLog(`✅ BigQuery: ${todasLasVentas.length} cabeceras sincronizadas.`);
        }

        if (todosLosDetalles.length > 0) {
            pushToBigQuery(BQ_CONFIG.DATASET_ID, BQ_CONFIG.TABLE_DETALLES, todosLosDetalles);
            debugLog(`✅ BigQuery: ${todosLosDetalles.length} líneas de detalle sincronizadas.`);
        }

        return { 
            success: true, 
            message: `Archivado exitoso: ${todasLasVentas.length} ventas y ${todosLosDetalles.length} detalles.` 
        };

    } catch (e) {
        debugLog(`❌ Error en archivarVentasEnBigQuery: ${e.message}`);
        return { success: false, message: e.message };
    }
}

/**
 * Función genérica de carga (JSON Newline) con reintentos (V2.0)
 */
function pushToBigQuery(datasetId, tableId, rows) {
    const projectId = BQ_CONFIG.PROJECT_ID;

    const job = {
        configuration: {
            load: {
                destinationTable: { projectId: projectId, datasetId: datasetId, tableId: tableId },
                writeDisposition: 'WRITE_APPEND',
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                autodetect: true
            }
        }
    };

    const data = rows.map(row => JSON.stringify(row)).join('\n');
    const blob = Utilities.newBlob(data, 'application/octet-stream');

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            attempts++;
            const loadJob = BigQuery.Jobs.insert(job, projectId, blob);
            return loadJob;
        } catch (e) {
            const msg = e.message || "";
            const isTransient = msg.includes("503") || msg.includes("Service Unavailable") || msg.includes("Rate limit");

            if (isTransient && attempts < maxAttempts) {
                const delay = Math.pow(2, attempts) * 1000;
                debugLog(`⚠️ [BigQuery] Error temporal (503). Reintentando en ${delay}ms... (Intento ${attempts})`);
                Utilities.sleep(delay);
            } else {
                throw e;
            }
        }
    }
}
/**
 * Consulta el historial de ventas completo (con detalles) desde BigQuery.
 * Usa ARRAY_AGG para traer los detalles anidados de forma eficiente.
 */
function tpv_querySalesFromBigQuery() {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const datasetId = BQ_CONFIG.DATASET_ID;
    const tableVentas = BQ_CONFIG.TABLE_VENTAS;
    const tableDetalles = BQ_CONFIG.TABLE_DETALLES;

    // Consulta SQL Industrial: Join entre cabecera y detalle con agregación anidada
    const query = `
        SELECT 
            v.*,
            ARRAY_AGG(STRUCT(
                d.REGISTRO_ID, d.PRODUCTO_ID, d.DESCRIPCION_VENTA as descripcion, 
                d.CANTIDAD as cantidad, d.PRECIO as precioUnitario, d.MONTO as subtotal,
                d.COLOR as color, d.TALLE as talle, d.VARIACION_ID as variedadId
            )) as detalles_anidados
        FROM \`${projectId}.${datasetId}.${tableVentas}\` v
        LEFT JOIN \`${projectId}.${datasetId}.${tableDetalles}\` d ON v.VENTA_ID = d.VENTA_ID
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27
        ORDER BY v.FECHA DESC, v.HORA DESC
        LIMIT 5000
    `;

    const request = { query: query, useLegacySql: false };

    try {
        let queryResults = BigQuery.Jobs.query(request, projectId);
        const jobId = queryResults.jobReference.jobId;

        while (!queryResults.jobComplete) {
            Utilities.sleep(500);
            queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId);
        }

        const rows = queryResults.rows;
        if (!rows) return [];

        return rows.map(row => {
            const bqRow = {};
            row.f.forEach((field, index) => {
                const colName = queryResults.schema.fields[index].name;
                bqRow[colName] = field.v;
            });

            // Recomponer Detalles con nombres de campos exactos para el Ranking del Dashboard
            const detalles = (bqRow.detalles_anidados || []).map(d => {
              const item = {};
              if (!d.v || !d.v.f) return null;
              
              // Mapeo por índice según el STRUCT del SQL en la consulta
              // d.REGISTRO_ID, d.PRODUCTO_ID, d.DESCRIPCION_VENTA, d.CANTIDAD, d.PRECIO, d.MONTO, d.COLOR, d.TALLE, d.VARIEDAD_ID
              const fieldNames = ['registroId', 'productoId', 'descripcion', 'cantidad', 'precioUnitario', 'subtotal', 'color', 'talle', 'variedadId'];
              d.v.f.forEach((field, idx) => {
                 let val = field.v;
                 // Forzar números para campos de cálculo
                 if (idx === 3 || idx === 4 || idx === 5) val = parseFloat(val) || 0;
                 item[fieldNames[idx]] = val;
              });
              return item;
            }).filter(d => d && d.productoId);

            // Formatear Fecha para compatibilidad con filtros (yyyy-MM-dd HH:mm)
            let fechaLimpia = String(bqRow.FECHA || "").trim();
            let horaLimpia = String(bqRow.HORA || "").trim();
            // Si la fecha viene como DD/MM/YYYY o similar, habría que normalizarla aquí. 
            // Asumimos YYYY-MM-DD que es el estándar de BQ.
            const fechaFinal = horaLimpia ? `${fechaLimpia} ${horaLimpia}` : `${fechaLimpia} 00:00`;

            return {
                id: String(bqRow.VENTA_ID),
                fecha: fechaFinal,
                origen: bqRow.ORIGEN,
                estado: bqRow.ESTADO,
                total: parseFloat(bqRow.TOTAL_VENTA) || 0,
                clienteId: bqRow.CLIENTE_ID,
                nombreCliente: bqRow.CLIENTE_NOMBRE || 'Cliente',
                tiendaId: bqRow.TIENDA_ID,
                metodoPago: bqRow.METODO_PAGO,
                cajaId: bqRow.CAJA_ID,
                asesor: bqRow.ASESOR_ID,
                fechaCaja: bqRow.FECHA_CAJA,
                costoEnvio: parseFloat(bqRow.COSTO_ENVIO) || 0,
                recargoTransferencia: parseFloat(bqRow.RECARGO_TRANSFERENCIA) || 0,
                recargoMenor: parseFloat(bqRow.RECARGO_MENOR) || 0,
                pagoEfectivo: parseFloat(bqRow.PAGO_EFECTIVO) || 0,
                montoProductos: parseFloat(bqRow.MONTO_TOTAL_PRODUCTOS) || 0,
                subtotal: parseFloat(bqRow.SUBTOTAL) || 0,
                tipoVenta: bqRow.TIPO_VENTA,
                pagoMixto: String(bqRow.PAGO_MIXTO).toUpperCase() === 'TRUE',
                detalles: detalles
            };
        });

    } catch (e) {
        debugLog("❌ Error consultando BigQuery: " + e.message);
        return null;
    }
}
