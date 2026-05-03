/**
 * ARCHIVO: BigQueryBridge.js
 * LÓGICA DE CONEXIÓN CON DATA WAREHOUSE (V1.0)
 * RESPETANDO ESTRICTAMENTE CONSTANTS.JS
 */

const BQ_CONFIG = {
    get PROJECT_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GCP_PROJECT_ID"] || "SkypiaUnderwearApi"; },
    DATASET_ID: "ERP_MASTER",
    TABLE_VENTAS: "HISTORIAL_VENTAS",
    TABLE_DETALLES: "HISTORIAL_DETALLES"
};

/**
 * Función Maestra: Sincroniza el ecosistema completo con BigQuery usando COLUMNS.
 */
function archivarVentasEnBigQuery() {
    if (!GLOBAL_CONFIG.ENABLE_BIGQUERY) return { success: true };
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
        const transferencia = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DATOS_TRANSFERENCIA));

        // --- 2. MAPEO DINÁMICO (FUENTE DE VERDAD: COLUMNS) ---
        const mapRows = (data, colArray, extra = {}) => {
            return data.map(d => {
                const row = {};
                colArray.forEach(col => {
                    let val = d[col];
                    if (val instanceof Date) {
                        const fmt = (col === "FECHA") ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm:ss";
                        val = Utilities.formatDate(val, timezone, fmt);
                    }
                    row[col] = (val !== undefined && val !== null) ? val : "";
                });
                Object.keys(extra).forEach(k => { row[k] = extra[k](d); });
                return row;
            });
        };

        // --- 3. CONSOLIDAR VENTAS Y DETALLES ---
        
        // Ventas (Pedidos + Blogger mapeados al esquema de VENTAS_PEDIDOS)
        const vLocalesBQ = mapRows(vPedidos, COLUMNS.VENTAS_PEDIDOS, { ORIGEN: () => "Pedido Local" });
        const vBloggerBQ = mapRows(vBlogger, COLUMNS.VENTAS_PEDIDOS, { 
            VENTA_ID: (d) => String(d.CODIGO || ""),
            ORIGEN: () => "Blogger" 
        });

        // Detalles (Pedidos + Blogger mapeados al esquema de DETALLE_VENTAS)
        const dLocalesBQ = mapRows(dPedidos, COLUMNS.DETALLE_VENTAS);
        const dBloggerBQ = mapRows(dBlogger, COLUMNS.DETALLE_VENTAS, {
            VARIACION_ID: (d) => String(d.VARIEDAD_ID || d.VARIACION_ID || ""),
            DESCRIPCION_VENTA: (d) => String(d.PRODUCTO_VARIACION || d.DESCRIPCION_VENTA || "")
        });

        // --- 4. SUBIR A BIGQUERY (MODO ESPEJO / TRUNCATE) ---
        const sync = (tab, data) => pushToBigQuery(BQ_CONFIG.DATASET_ID, tab, data, 'WRITE_TRUNCATE');

        if (vLocalesBQ.length || vBloggerBQ.length) sync(BQ_CONFIG.TABLE_VENTAS, [...vLocalesBQ, ...vBloggerBQ]);
        if (dLocalesBQ.length || dBloggerBQ.length) sync(BQ_CONFIG.TABLE_DETALLES, [...dLocalesBQ, ...dBloggerBQ]);
        
        // Tablas de Referencia (Espejo de tus hojas de cálculo)
        if (clientes.length) sync("HISTORIAL_CLIENTES", mapRows(clientes, COLUMNS.CLIENTS));
        if (cajas.length) sync("HISTORIAL_CAJAS", mapRows(cajas, COLUMNS.GESTION_CAJA));
        if (transferencia.length) sync("HISTORIAL_TRANSFERENCIAS", mapRows(transferencia, COLUMNS.DATOS_TRANSFERENCIA));

        debugLog(`🚀 BigQuery Industrial: Sincronización completa (Ventas, Clientes, Cajas, Bancos).`);
        return { success: true };

    } catch (e) {
        debugLog(`❌ Error BigQuery Bridge: ${e.message}`);
        return { success: false, message: e.message };
    }
}

/**
 * Consulta optimizada para el Dashboard (Cabeceras).
 */
function tpv_querySalesFromBigQuery() {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const query = `SELECT * FROM \`${projectId}.${BQ_CONFIG.DATASET_ID}.${BQ_CONFIG.TABLE_VENTAS}\` ORDER BY FECHA DESC, HORA DESC LIMIT 5000`;

    try {
        let results = BigQuery.Jobs.query({ query: query, useLegacySql: false }, projectId);
        if (!results.rows) return [];

        return results.rows.map(row => {
            const bqRow = {};
            row.f.forEach((field, index) => { bqRow[results.schema.fields[index].name] = field.v; });

            // Parsear Transferencia si existe (Formato BCO: XXX, ALIAS: YYY)
            let bco = "N/A", ali = "N/A";
            const dt = bqRow.DATOS_TRANSFERENCIA || "";
            if (dt.includes("BCO:")) bco = dt.split("BCO:")[1].split(",")[0].trim();
            if (dt.includes("ALIAS:")) ali = dt.split("ALIAS:")[1].split(",")[0].trim();

            return {
                id: String(bqRow.VENTA_ID),
                fecha: `${bqRow.FECHA} ${bqRow.HORA || "00:00"}`,
                origen: bqRow.ORIGEN,
                estado: bqRow.ESTADO,
                total: parseFloat(bqRow.TOTAL_VENTA) || 0,
                clienteId: bqRow.CLIENTE_ID,
                tiendaId: bqRow.TIENDA_ID,
                metodoPago: bqRow.METODO_PAGO,
                cajaId: bqRow.CAJA_ID,
                asesor: bqRow.ASESOR_ID,
                costoEnvio: parseFloat(bqRow.COSTO_ENVIO) || 0,
                recargoTransferencia: parseFloat(bqRow.RECARGO_TRANSFERENCIA) || 0,
                recargoMenor: parseFloat(bqRow.RECARGO_MENOR) || 0,
                pagoEfectivo: parseFloat(bqRow.PAGO_EFECTIVO) || 0,
                montoProductos: parseFloat(bqRow.MONTO_TOTAL_PRODUCTOS) || 0,
                subtotal: parseFloat(bqRow.SUBTOTAL) || 0,
                tipoVenta: bqRow.TIPO_VENTA,
                pagoMixto: String(bqRow.PAGO_MIXTO).toUpperCase() === 'TRUE',
                bancoTransferencia: bco,
                aliasTransferencia: ali,
                detalles: []
            };
        });
    } catch (e) { return null; }
}

/**
 * Detalles on-demand para Lazy Loading.
 */
function tpv_getSaleDetailsFromBigQuery(ventaId) {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const query = `SELECT * FROM \`${projectId}.${BQ_CONFIG.DATASET_ID}.${BQ_CONFIG.TABLE_DETALLES}\` WHERE VENTA_ID = '${ventaId}'`;

    try {
        const res = BigQuery.Jobs.query({ query: query, useLegacySql: false }, projectId);
        if (!res.rows) return [];

        return res.rows.map(row => {
            const d = {};
            row.f.forEach((field, index) => { d[res.schema.fields[index].name] = field.v; });
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
    } catch (e) { return []; }
}

/**
 * Carga genérica JSON a BigQuery.
 */
function pushToBigQuery(datasetId, tableId, rows, writeDisposition = 'WRITE_APPEND') {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const job = {
        configuration: {
            load: {
                destinationTable: { projectId, datasetId, tableId },
                writeDisposition: writeDisposition,
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                autodetect: true
            }
        }
    };
    const data = rows.map(r => JSON.stringify(r)).join('\n');
    const blob = Utilities.newBlob(data, 'application/octet-stream');
    return BigQuery.Jobs.insert(job, projectId, blob);
}
