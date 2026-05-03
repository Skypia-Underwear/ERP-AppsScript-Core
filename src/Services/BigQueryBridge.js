/**
 * ARCHIVO: BigQueryBridge.js
 * LÓGICA DE CONEXIÓN CON DATA WAREHOUSE (V1.0)
 * COMPOSITOR INDUSTRIAL DE DATOS (DROP-IN REPLACEMENT FOR DRIVE JSON)
 */

const BQ_CONFIG = {
    get PROJECT_ID() { return GLOBAL_CONFIG.SCRIPT_CONFIG["GCP_PROJECT_ID"] || "SkypiaUnderwearApi"; },
    DATASET_ID: "ERP_MASTER",
    TABLE_VENTAS: "HISTORIAL_VENTAS",
    TABLE_DETALLES: "HISTORIAL_DETALLES"
};

/**
 * Función Maestra de Archivado: Sincroniza todo el ecosistema.
 */
function archivarVentasEnBigQuery() {
    if (!GLOBAL_CONFIG.ENABLE_BIGQUERY) return { success: true };
    const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
    const timezone = Session.getScriptTimeZone();

    try {
        const vBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES));
        const vPedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.VENTAS_PEDIDOS));
        const dBlogger = convertirRangoAObjetos(ss.getSheetByName(SHEETS.BLOGGER_SALES_DETAILS));
        const dPedidos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DETALLE_VENTAS));
        const clientes = convertirRangoAObjetos(ss.getSheetByName(SHEETS.CLIENTS));
        const cajas = convertirRangoAObjetos(ss.getSheetByName(SHEETS.GESTION_CAJA));
        const bancos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DATOS_TRANSFERENCIA));
        const usuarios = convertirRangoAObjetos(ss.getSheetByName(SHEETS.USUARIOS_SISTEMAS));

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

        const vLocalesBQ = mapRows(vPedidos, COLUMNS.VENTAS_PEDIDOS, { ORIGEN: () => "Pedido Local" });
        const vBloggerBQ = mapRows(vBlogger, COLUMNS.VENTAS_PEDIDOS, { 
            VENTA_ID: (d) => String(d.CODIGO || ""),
            ORIGEN: () => "Blogger" 
        });

        const dLocalesBQ = mapRows(dPedidos, COLUMNS.DETALLE_VENTAS);
        const dBloggerBQ = mapRows(dBlogger, COLUMNS.DETALLE_VENTAS, {
            VARIACION_ID: (d) => String(d.VARIEDAD_ID || d.VARIACION_ID || ""),
            DESCRIPCION_VENTA: (d) => String(d.PRODUCTO_VARIACION || d.DESCRIPCION_VENTA || "")
        });

        const sync = (tab, data) => pushToBigQuery(BQ_CONFIG.DATASET_ID, tab, data, 'WRITE_TRUNCATE');

        sync(BQ_CONFIG.TABLE_VENTAS, [...vLocalesBQ, ...vBloggerBQ]);
        sync(BQ_CONFIG.TABLE_DETALLES, [...dLocalesBQ, ...dBloggerBQ]);
        sync("HISTORIAL_CLIENTES", mapRows(clientes, COLUMNS.CLIENTS));
        sync("HISTORIAL_CAJAS", mapRows(cajas, COLUMNS.GESTION_CAJA));
        sync("HISTORIAL_TRANSFERENCIAS", mapRows(bancos, COLUMNS.DATOS_TRANSFERENCIA));
        sync("HISTORIAL_USUARIOS", mapRows(usuarios, COLUMNS.USUARIOS_SISTEMAS));

        debugLog(`🚀 BigQuery: Sincronización industrial completada.`);
        return { success: true };
    } catch (e) {
        debugLog(`❌ Error Archivador: ${e.message}`);
        return { success: false, message: e.message };
    }
}

/**
 * CONSULTA INDUSTRIAL: Drop-in replacement del JSON de Drive.
 * Realiza el cruce de datos (Mapeos) para devolver el mismo objeto enriquecido.
 */
function tpv_querySalesFromBigQuery() {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const datasetId = BQ_CONFIG.DATASET_ID;

    try {
        // 1. CARGAR REFERENCIAS (Lookups) DESDE BIGQUERY
        const fetchBQTable = (tab) => {
            const res = BigQuery.Jobs.query({ query: `SELECT * FROM \`${projectId}.${datasetId}.${tab}\``, useLegacySql: false }, projectId);
            if (!res.rows) return [];
            return res.rows.map(row => {
                const obj = {};
                row.f.forEach((field, i) => { obj[res.schema.fields[i].name] = field.v; });
                return obj;
            });
        };

        const clientesData = fetchBQTable("HISTORIAL_CLIENTES");
        const usuariosData = fetchBQTable("HISTORIAL_USUARIOS");
        const cajasData = fetchBQTable("HISTORIAL_CAJAS");
        const bancosData = fetchBQTable("HISTORIAL_TRANSFERENCIAS");

        const clienteMap = {}; clientesData.forEach(c => { if (c.CLIENTE_ID) clienteMap[c.CLIENTE_ID] = c.NOMBRE_COMPLETO || 'Desconocido'; });
        const usuarioMap = {}; usuariosData.forEach(u => { if (u.USER_ID) usuarioMap[u.USER_ID] = u.NOMBRE || 'Desconocido'; });
        const bancoMap = {}; bancosData.forEach(b => { if (b.CUENTA_ID) bancoMap[b.CUENTA_ID] = { banco: b.BANCO || 'N/A', alias: b.ALIAS || 'N/A' }; });
        const cajaMap = {}; cajasData.forEach(c => { if (c.CAJA_ID) cajaMap[c.CAJA_ID] = { asesorId: c.ASESOR_ID, asesor: usuarioMap[c.ASESOR_ID] || c.ASESOR_ID, fecha: c.FECHA }; });

        // 2. CARGAR VENTAS (CABECERAS)
        const queryVentas = `SELECT * FROM \`${projectId}.${datasetId}.${BQ_CONFIG.TABLE_VENTAS}\` ORDER BY FECHA DESC, HORA DESC LIMIT 5000`;
        const resVentas = BigQuery.Jobs.query({ query: queryVentas, useLegacySql: false }, projectId);
        if (!resVentas.rows) return [];

        return resVentas.rows.map(row => {
            const v = {};
            row.f.forEach((field, i) => { v[resVentas.schema.fields[i].name] = field.v; });

            const infoCaja = cajaMap[v.CAJA_ID] || { asesor: v.ASESOR_ID || 'N/A', fecha: 'N/A' };
            const infoBanco = bancoMap[v.DATOS_TRANSFERENCIA] || { banco: 'N/A', alias: 'N/A' };

            // Retornamos el objeto EXACTO que el Dashboard espera (mismo que el JSON de Drive)
            return {
                id: String(v.VENTA_ID),
                fecha: `${v.FECHA} ${v.HORA || "00:00"}`,
                origen: v.ORIGEN,
                estado: v.ESTADO || 'SOLICITADO',
                total: parseFloat(v.TOTAL_VENTA) || 0,
                clienteId: v.CLIENTE_ID || 'CLI001',
                nombreCliente: clienteMap[v.CLIENTE_ID] || 'Público General',
                tiendaId: v.TIENDA_ID,
                metodoPago: v.METODO_PAGO || 'N/A',
                cajaId: v.CAJA_ID,
                asesor: infoCaja.asesor,
                fechaCaja: infoCaja.fecha,
                bancoTransferencia: infoBanco.banco,
                aliasTransferencia: infoBanco.alias,
                costoEnvio: parseFloat(v.COSTO_ENVIO) || 0,
                recargoTransferencia: parseFloat(v.RECARGO_TRANSFERENCIA) || 0,
                recargoMenor: parseFloat(v.RECARGO_MENOR) || 0,
                pagoEfectivo: parseFloat(v.PAGO_EFECTIVO) || 0,
                montoProductos: parseFloat(v.MONTO_TOTAL_PRODUCTOS) || 0,
                subtotal: parseFloat(v.SUBTOTAL) || 0,
                tipoVenta: v.TIPO_VENTA || 'DIRECTA',
                compraMinima: parseFloat(v.COMPRA_MINIMA) || 0,
                pagoMixto: String(v.PAGO_MIXTO).toUpperCase() === 'TRUE',
                desactivarRecargoTransferencia: String(v.DESACTIVAR_RECARGO_TRANSFERENCIA).toUpperCase() === 'TRUE',
                detalles: [] // Carga diferida
            };
        });
    } catch (e) {
        debugLog("❌ Error Compositor BigQuery: " + e.message);
        return null;
    }
}

/**
 * Obtiene los detalles on-demand.
 */
function tpv_getSaleDetailsFromBigQuery(ventaId) {
    const projectId = BQ_CONFIG.PROJECT_ID;
    const query = `SELECT * FROM \`${projectId}.${BQ_CONFIG.DATASET_ID}.${BQ_CONFIG.TABLE_DETALLES}\` WHERE VENTA_ID = '${ventaId}'`;

    try {
        const res = BigQuery.Jobs.query({ query: query, useLegacySql: false }, projectId);
        if (!res.rows) return [];

        return res.rows.map(row => {
            const d = {};
            row.f.forEach((field, i) => { d[res.schema.fields[i].name] = field.v; });
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
 * Carga JSON a BigQuery.
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
    return BigQuery.Jobs.insert(job, projectId, Utilities.newBlob(data, 'application/octet-stream'));
}
