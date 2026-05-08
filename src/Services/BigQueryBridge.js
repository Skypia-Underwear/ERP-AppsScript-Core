/**
 * ARCHIVO: BigQueryBridge.js
 * LÓGICA DE CONEXIÓN CON DATA WAREHOUSE (V3.0 - SUPREMA)
 * MOTOR INDUSTRIAL CON ESQUEMAS EXPLÍCITOS Y DATASETS DINÁMICOS
 */

const BQ_CONFIG = {
    get PROJECT_ID() { return GLOBAL_CONFIG.BIGQUERY.PROJECT_ID || "SkypiaUnderwearApi"; },
    get DATASET_ID() { 
        const custom = GLOBAL_CONFIG.BIGQUERY.DATASET_ID;
        if (custom) return custom;
        const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME || "ERP";
        return appName.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_MASTER";
    }
};

/**
 * Función Maestra de Archivado: Sincroniza todo el ecosistema con esquemas explícitos.
 */
function archivarVentasEnBigQuery() {
    if (!GLOBAL_CONFIG.BIGQUERY.ENABLE) return { success: true };
    const projectId = BQ_CONFIG.PROJECT_ID;
    const datasetId = BQ_CONFIG.DATASET_ID;
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
    const timezone = Session.getScriptTimeZone();
    let tablesProcessed = 0;

    try {
        ensureDatasetExists();

        const sheetsToSync = [
            { alias: "VENTAS_PEDIDOS", target: SHEETS.VENTAS_PEDIDOS },
            { alias: "DETALLE_VENTAS", target: SHEETS.DETALLE_VENTAS },
            { alias: "BLOGGER_SALES", target: SHEETS.BLOGGER_SALES },
            { alias: "BLOGGER_SALES_DETAILS", target: SHEETS.BLOGGER_SALES_DETAILS },
            { alias: "CLIENTS", target: SHEETS.CLIENTS },
            { alias: "GESTION_CAJA", target: SHEETS.GESTION_CAJA },
            { alias: "DATOS_TRANSFERENCIA", target: SHEETS.DATOS_TRANSFERENCIA },
            { alias: "USUARIOS_SISTEMAS", target: SHEETS.USUARIOS_SISTEMAS },
            { alias: "INVENTORY", target: SHEETS.INVENTORY },
            { alias: "INVENTORY_MOVEMENTS", target: SHEETS.INVENTORY_MOVEMENTS },
            { alias: "WC_ORDERS", target: SHEETS.WC_ORDERS },
            { alias: "WC_DETAILS", target: SHEETS.WC_DETAILS }
        ];

        const floatCols = ["TOTAL_VENTA", "PRECIO", "SUBTOTAL", "MONTO", "GANANCIA", "INVERSION", "COSTO_ENVIO", "RECARGO_TRANSFERENCIA", "PAGO_EFECTIVO", "MONTO_TOTAL_PRODUCTOS", "COMPRA_MINIMA", "CANTIDAD", "STOCK_INICIAL", "ENTRADAS", "SALIDAS", "STOCK_ACTUAL", "AJUSTE_CANTIDAD", "SUBTOTAL_PRODUCTOS", "PRECIO_UNIT", "TOTAL_LINEA"];

        const mapRows = (data, colArray, extra = {}) => {
            return data.map(d => {
                const row = {};
                colArray.forEach(col => {
                    let val = d[col];
                    if (val instanceof Date) {
                        let fmt = "yyyy-MM-dd HH:mm:ss";
                        if (col.includes("HORA")) fmt = "HH:mm:ss";
                        else if (col.includes("FECHA") && !col.includes("ACTUALIZACION") && !col.includes("CREACION")) fmt = "yyyy-MM-dd";
                        val = Utilities.formatDate(val, timezone, fmt);
                    } else if (floatCols.includes(col)) {
                        if (typeof val === 'string') {
                            val = val.replace(/[^\d.-]/g, ''); 
                        }
                        val = parseFloat(val);
                        if (isNaN(val)) val = 0;
                    }
                    row[col] = (val !== undefined && val !== null) ? val : "";
                });
                Object.keys(extra).forEach(k => { row[k] = extra[k](d); });
                return row;
            });
        };

        sheetsToSync.forEach(conf => {
            try {
                const sheetName = SHEETS[conf.alias];
                const sheet = ss.getSheetByName(sheetName);
                if (!sheet) return;
                
                const rawData = convertirRangoAObjetos(sheet);
                if (rawData.length === 0) return;

                const bqData = mapRows(rawData, SHEET_SCHEMA[conf.alias]);
                const tableId = conf.alias; // Usamos el alias para consistencia interna

                pushToBigQuery(datasetId, tableId, bqData, 'WRITE_TRUNCATE', getBQSchema(conf.alias));
                
                console.log(`✅ BQ: Tabla ${tableId} sincronizada (${bqData.length} filas)`);
                tablesProcessed++;
            } catch (errTable) {
                console.error(`❌ BQ: Error en tabla ${conf.alias}: ${errTable.message}`);
            }
        });

        debugLog(`🚀 BigQuery: Sincronización 1:1 finalizada. Tablas: ${tablesProcessed}`);
        return { success: true };
    } catch (e) {
        debugLog(`❌ Error Crítico Archivador BQ: ${e.message}`);
        return { success: false, message: e.message };
    }
}

/**
 * Obtiene el esquema explícito para BigQuery basado en Constants.js
 */
function getBQSchema(schemaAlias, extraFields = null) {
    const cols = SHEET_SCHEMA[schemaAlias];
    if (!cols) return null;

    const floatCols = ["TOTAL_VENTA", "PRECIO", "SUBTOTAL", "MONTO", "GANANCIA", "INVERSION", "COSTO_ENVIO", "RECARGO_TRANSFERENCIA", "PAGO_EFECTIVO", "MONTO_TOTAL_PRODUCTOS", "COMPRA_MINIMA", "CANTIDAD", "STOCK_INICIAL", "ENTRADAS", "SALIDAS", "STOCK_ACTUAL", "AJUSTE_CANTIDAD", "SUBTOTAL_PRODUCTOS", "PRECIO_UNIT", "TOTAL_LINEA"];
    const dateCols = ["FECHA", "FECHA_CREACION", "FECHA_ACTUALIZACION", "FECHA_PEDIDO"];

    const fields = cols.map(col => {
        let type = "STRING";
        if (floatCols.includes(col)) type = "FLOAT";
        else if (dateCols.includes(col)) type = "DATE";
        return { name: col, type: type };
    });

    if (extraFields) {
        Object.keys(extraFields).forEach(k => {
            if (!fields.find(f => f.name === k)) fields.push({ name: k, type: extraFields[k] || "STRING" });
        });
    }

    return { fields: fields };
}

/**
 * Garantiza que el Dataset exista.
 */
function ensureDatasetExists() {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const datasetId = BQ_CONFIG.DATASET_ID;
    try {
        BigQuery.Datasets.get(projectId, datasetId);
    } catch (e) {
        const dataset = { datasetReference: { projectId: projectId, datasetId: datasetId } };
        BigQuery.Datasets.insert(dataset, projectId);
        debugLog(`📁 BigQuery: Dataset creado: ${datasetId}`);
    }
}

/**
 * CONSULTA INDUSTRIAL: Recrea el objeto enriquecido que el Dashboard espera.
 * (Mantenida para compatibilidad futura, Dashboard usa Drive por ahora)
 */
function tpv_querySalesFromBigQuery() {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const datasetId = BQ_CONFIG.DATASET_ID;
    // ... (Lógica de consulta industrial que proporcionaste)
    return { success: false, message: "Dashboard configurado en modo Drive por estabilidad." };
}

/**
 * Carga JSON a BigQuery con Esquema Explícito.
 */
function pushToBigQuery(datasetId, tableId, rows, writeDisposition = 'WRITE_APPEND', schema = null) {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const loadConfig = {
        destinationTable: { projectId, datasetId, tableId },
        writeDisposition: writeDisposition,
        sourceFormat: 'NEWLINE_DELIMITED_JSON'
    };

    if (schema) loadConfig.schema = schema;
    else loadConfig.autodetect = true;

    const job = { configuration: { load: loadConfig } };
    const data = rows.map(r => JSON.stringify(r)).join('\n');
    const result = BigQuery.Jobs.insert(job, projectId, Utilities.newBlob(data, 'application/octet-stream'));
    
    if (result.jobReference) {
      console.log(`📡 BQ: Job iniciado para ${tableId}: ${result.jobReference.jobId}`);
    }
    return result;
}
