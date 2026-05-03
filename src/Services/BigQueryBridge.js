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
        debugLog("ℹ️ BigQuery está desactivado.");
        return { success: true };
    }
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
    const timezone = Session.getScriptTimeZone();

    try {
        // --- 1. CARGAR DATOS ---
        const vBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES));
        const vPedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.VENTAS_PEDIDOS));
        const dBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES_DETAILS));
        const dPedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DETALLE_VENTAS));
        const clientes = convertirRangoAObjetos(ss.getSheetByName(SHEETS.CLIENTS));
        const cajas = convertirRangoAObjetos(ss.getSheetByName(SHEETS.GESTION_CAJA));

        // --- 2. MAPEAR VENTAS (CONSOLIDADO) ---
        const todasLasVentas = [...vBlogger, ...vPedidos].map(v => {
            const f = v.FECHA instanceof Date ? v.FECHA : new Date(v.FECHA);
            const h = v.HORA instanceof Date ? v.HORA : null;
            
            return {
                VENTA_ID: String(v.CODIGO || v.VENTA_ID || ""),
                TIENDA_ID: String(v.TIENDA_ID || ""),
                ASESOR_ID: String(v.ASESOR_ID || ""),
                FECHA: isNaN(f.getTime()) ? "" : Utilities.formatDate(f, timezone, "yyyy-MM-dd"),
                HORA: h ? Utilities.formatDate(h, timezone, "HH:mm:ss") : String(v.HORA || ""),
                CLIENTE_ID: String(v.CLIENTE_ID || ""),
                CAJA_ID: String(v.CAJA_ID || v.CAJA || ""),
                TIPO_VENTA: String(v.TIPO_VENTA || "DIRECTA"),
                COMPRA_MINIMA: parseFloat(v.COMPRA_MINIMA) || 0,
                PAGO_MIXTO: String(v.PAGO_MIXTO || "FALSE").toUpperCase() === "TRUE",
                METODO_PAGO: String(v.METODO_PAGO || ""),
                DATOS_TRANSFERENCIA: String(v.DATOS_TRANSFERENCIA || ""),
                DESACTIVAR_RECARGO_TRANSFERENCIA: String(v.DESACTIVAR_RECARGO_TRANSFERENCIA || "FALSE").toUpperCase() === "TRUE",
                MONTO_TOTAL_PRODUCTOS: parseFloat(v.MONTO_TOTAL_PRODUCTOS) || 0,
                PAGO_EFECTIVO: parseFloat(v.PAGO_EFECTIVO) || 0,
                SUBTOTAL: parseFloat(v.SUBTOTAL) || 0,
                RECARGO_MENOR: parseFloat(v.RECARGO_MENOR) || 0,
                COSTO_ENVIO: parseFloat(v.COSTO_ENVIO) || 0,
                RECARGO_TRANSFERENCIA: parseFloat(v.RECARGO_TRANSFERENCIA) || 0,
                TOTAL_VENTA: parseFloat(v.TOTAL_VENTA || v.MONTO_TOTAL_PRODUCTOS || 0) || 0,
                ESTADO: String(v.ESTADO || ""),
                CAMBIOS: String(v.CAMBIOS || ""),
                COMPROBANTE_FILE: String(v.COMPROBANTE_FILE || ""),
                DETALLE_AUDITORIA_IA: String(v.DETALLE_AUDITORIA_IA || ""),
                DETALLE_JSON: "", 
                ORIGEN: v.CODIGO ? "Blogger" : "Pedido Local"
            };
        });

        // --- 3. MAPEAR DETALLES (CONSOLIDADO) ---
        const todosLosDetalles = [...dBlogger, ...dPedidos].map(d => ({
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
        }));

        // --- 4. MAPEAR CLIENTES Y CAJAS ---
        const clientesBQ = clientes.map(c => ({
            CLIENTE_ID: String(c.CLIENTE_ID || ""),
            NOMBRE: String(c.NOMBRE || ""),
            TELEFONO: String(c.TELEFONO || ""),
            EMAIL: String(c.EMAIL || ""),
            DIRECCION: String(c.DIRECCION || ""),
            CATEGORIA: String(c.CATEGORIA || ""),
            NOTAS: String(c.NOTAS || "")
        }));

        const cajasBQ = cajas.map(c => {
            const fA = c.FECHA_APERTURA instanceof Date ? c.FECHA_APERTURA : new Date(c.FECHA_APERTURA);
            return {
                CAJA_ID: String(c.CAJA_ID || ""),
                FECHA_APERTURA: isNaN(fA.getTime()) ? "" : Utilities.formatDate(fA, timezone, "yyyy-MM-dd HH:mm:ss"),
                SALDO_INICIAL: parseFloat(c.SALDO_INICIAL) || 0,
                ESTADO: String(c.ESTADO || "")
            };
        });

        // --- 5. SUBIR TODO ---
        if (todasLasVentas.length) pushToBigQuery(BQ_CONFIG.DATASET_ID, BQ_CONFIG.TABLE_VENTAS, todasLasVentas, 'WRITE_TRUNCATE');
        if (todosLosDetalles.length) pushToBigQuery(BQ_CONFIG.DATASET_ID, BQ_CONFIG.TABLE_DETALLES, todosLosDetalles, 'WRITE_TRUNCATE');
        if (clientesBQ.length) pushToBigQuery(BQ_CONFIG.DATASET_ID, "HISTORIAL_CLIENTES", clientesBQ, 'WRITE_TRUNCATE');
        if (cajasBQ.length) pushToBigQuery(BQ_CONFIG.DATASET_ID, "HISTORIAL_CAJAS", cajasBQ, 'WRITE_TRUNCATE');

        debugLog(`🚀 BigQuery Industrial: Sincronización completa.`);
        return { success: true };

    } catch (e) {
        debugLog(`❌ Error en BigQuery Industrial: ${e.message}`);
        return { success: false, message: e.message };
    }
}

/**
 * Función genérica de carga (JSON Newline) con reintentos (V2.0)
 */
function pushToBigQuery(datasetId, tableId, rows, writeDisposition = 'WRITE_APPEND') {
    const projectId = BQ_CONFIG.PROJECT_ID;

    const job = {
        configuration: {
            load: {
                destinationTable: { projectId: projectId, datasetId: datasetId, tableId: tableId },
                writeDisposition: writeDisposition,
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
 * Consulta el historial de ventas (cabeceras solamente para velocidad) desde BigQuery.
 */
function tpv_querySalesFromBigQuery() {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const datasetId = BQ_CONFIG.DATASET_ID;
    const tableVentas = BQ_CONFIG.TABLE_VENTAS;

    const query = `
        SELECT * FROM \`${projectId}.${datasetId}.${tableVentas}\`
        ORDER BY FECHA DESC, HORA DESC
        LIMIT 5000
    `;

    try {
        let queryResults = BigQuery.Jobs.query({ query: query, useLegacySql: false }, projectId);
        const rows = queryResults.rows;
        if (!rows) return [];

        return rows.map(row => {
            const bqRow = {};
            row.f.forEach((field, index) => {
                const colName = queryResults.schema.fields[index].name;
                bqRow[colName] = field.v;
            });

            // Normalización de Origen y Datos de Transferencia
            let origenNormalizado = bqRow.ORIGEN === "Blogger" ? "Blogger" : "Pedido Local";
            
            // Intentar extraer Banco y Alias de la cadena DATOS_TRANSFERENCIA
            let banco = "N/A", alias = "N/A";
            const dt = bqRow.DATOS_TRANSFERENCIA || "";
            if (dt.includes("BCO:")) banco = dt.split("BCO:")[1].split(",")[0].trim();
            if (dt.includes("ALIAS:")) alias = dt.split("ALIAS:")[1].split(",")[0].trim();

            return {
                id: String(bqRow.VENTA_ID),
                fecha: `${bqRow.FECHA} ${bqRow.HORA || "00:00"}`,
                origen: origenNormalizado,
                estado: bqRow.ESTADO,
                total: parseFloat(bqRow.TOTAL_VENTA) || 0,
                clienteId: bqRow.CLIENTE_ID,
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
                bancoTransferencia: banco,
                aliasTransferencia: alias,
                detalles: [] // Carga diferida activa
            };
        });
    } catch (e) {
        debugLog("❌ Error consultando BigQuery: " + e.message);
        return null;
    }
}

/**
 * Obtiene los detalles de una venta específica desde BigQuery.
 */
function tpv_getSaleDetailsFromBigQuery(ventaId) {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const datasetId = BQ_CONFIG.DATASET_ID;
    const tableDetalles = BQ_CONFIG.TABLE_DETALLES;

    const query = `
        SELECT * FROM \`${projectId}.${datasetId}.${tableDetalles}\`
        WHERE VENTA_ID = '${ventaId}'
    `;

    try {
        const queryResults = BigQuery.Jobs.query({ query: query, useLegacySql: false }, projectId);
        if (!queryResults.rows) return [];

        return queryResults.rows.map(row => {
            const d = {};
            row.f.forEach((field, index) => {
                const colName = queryResults.schema.fields[index].name;
                d[colName] = field.v;
            });

            return {
                registroId: d.REGISTRO_ID,
                productoId: d.PRODUCTO_ID,
                descripcion: d.DESCRIPCION_VENTA,
                cantidad: parseFloat(d.CANTIDAD) || 0,
                precioUnitario: parseFloat(d.PRECIO) || 0,
                subtotal: parseFloat(d.MONTO) || 0,
                color: d.COLOR,
                talle: d.TALLE,
                variedadId: d.VARIACION_ID
            };
        });
    } catch (e) {
        debugLog("❌ Error buscando detalles en BigQuery: " + e.message);
        return [];
    }
}
