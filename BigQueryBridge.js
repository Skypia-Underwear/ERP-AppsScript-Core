/**
 * ARCHIVO: BigQueryBridge.js
 * LÓGICA DE CONEXIÓN CON DATA WAREHOUSE (V1.0)
 */

const BQ_CONFIG = {
    get PROJECT_ID() { return SCRIPT_CONFIG["GCP_PROJECT_ID"] || "SkypiaUnderwearApi"; },
    DATASET_ID: "ERP_MASTER",
    TABLE_VENTAS: "HISTORIAL_VENTAS"
};

/**
 * Función Maestra: Toma las ventas actuales de las hojas y las sube a BigQuery.
 * Se puede llamar manualmente o durante el Reseteo de Sistema.
 */
function archivarVentasEnBigQuery() {
    if (!GLOBAL_CONFIG.ENABLE_BIGQUERY) {
        debugLog("ℹ️ BigQuery está desactivado en la configuración global.");
        return { success: true, message: "BigQuery desactivado (Postergado)." };
    }
    const logArray = ["🚀 Iniciando archivado en BigQuery..."];
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);

    try {
        // 1. Cargar Ventas de ambos orígenes (Blogger y Pedidos)
        const ventasBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES));
        const ventasPedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.VENTAS_PEDIDOS));

        // 2. Unificar y Formatear para el esquema de BigQuery
        // Debemos asegurarnos de que los nombres de campos coincidan con el SQL ejecutado
        const todasLasVentas = [...ventasBlogger, ...ventasPedidos].map(v => {
            return {
                VENTA_ID: String(v.CODIGO || v.VENTA_ID || ""),
                FECHA: String(v.FECHA || ""),
                ORIGEN: v.CODIGO ? "Blogger" : "Pedido Local",
                ESTADO: String(v.ESTADO || ""),
                TOTAL: parseFloat(v.TOTAL_VENTA || v.MONTO_TOTAL_PRODUCTOS || 0) || 0,
                CLIENTE_ID: String(v.CLIENTE_ID || ""),
                TIENDA_ID: String(v.TIENDA_ID || ""),
                METODO_PAGO: String(v.METODO_PAGO || ""),
                CAJA_ID: String(v.CAJA_ID || v.CAJA || ""),
                ASESOR: String(v.ASESOR_ID || ""),
                FECHA_CAJA: String(v.FECHA_CAJA || ""),
                COSTO_ENVIO: parseFloat(v.COSTO_ENVIO || 0) || 0,
                RECARGO_TRANSFERENCIA: parseFloat(v.RECARGO_TRANSFERENCIA || 0) || 0,
                RECARGO_MENOR: parseFloat(v.RECARGO_MENOR || 0) || 0,
                PAGO_EFECTIVO: parseFloat(v.PAGO_EFECTIVO || 0) || 0,
                MONTO_TOTAL_PRODUCTOS: parseFloat(v.MONTO_TOTAL_PRODUCTOS || 0) || 0,
                SUBTOTAL: parseFloat(v.SUBTOTAL || 0) || 0,
                TIPO_VENTA: String(v.TIPO_VENTA || "DIRECTA"),
                PAGO_MIXTO: String(v.PAGO_MIXTO || "FALSE").toUpperCase()
            };
        });

        if (todasLasVentas.length === 0) {
            debugLog("⚠️ No hay ventas para archivar.");
            return { success: true, message: "No hay datos nuevos." };
        }

        // 3. Empujar a BigQuery
        pushToBigQuery(BQ_CONFIG.DATASET_ID, BQ_CONFIG.TABLE_VENTAS, todasLasVentas);

        debugLog(`✅ Se enviaron ${todasLasVentas.length} registros a BigQuery.`);
        return { success: true, message: `Archivado exitoso: ${todasLasVentas.length} ventas.` };

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
                autodetect: false
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
