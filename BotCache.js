/**
 * BOT CACHE ENGINE (V2.1 - Reports Only)
 * Optimiza el acceso a datos pesados para el Chatbot.
 */

const BOT_CACHE_KEYS = {
    PRODUCT_LIST: 'BOT_PROD_LIST_MIN'
};

/**
 * Obtiene lista mínima de productos.
 * (Repropósito: Útil si en el futuro se agregan otros reportes por producto)
 * Si no se usa, puede eliminarse para ahorrar memoria.
 */
function getBotProductListCached() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(BOT_CACHE_KEYS.PRODUCT_LIST);

    if (cached) {
        try {
            return JSON.parse(cached);
        } catch (e) {
            console.error("Error parsing BOT_PROD_LIST_MIN cache:", e);
        }
    }

    const ss = getActiveSS();
    const sheet = ss.getSheetByName(SHEETS.PRODUCTS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const mapping = HeaderManager.getMapping("PRODUCTS");
    if (!mapping) return [];

    const idIdx = mapping["CODIGO_ID"];
    const modIdx = mapping["MODELO"];
    const priceIdx = mapping["RECARGO_MENOR"];

    const list = data.slice(1).map(row => ({
        id: String(row[idIdx] || ""),
        modelo: String(row[modIdx] || ""),
        precio: parseFloat(row[priceIdx] || 0)
    })).filter(p => p.id !== "");

    try {
        const json = JSON.stringify(list);
        if (json.length < 100000) {
            cache.put(BOT_CACHE_KEYS.PRODUCT_LIST, json, 7200);
        }
    } catch (e) {
        notificarTelegramSalud("⚠️ Caché de lista de productos excedida. Usando lectura directa.", "WARN");
    }

    return list;
}

/**
 * Obtiene un resumen de ventas de HOY sin cargar todo el historial.
 * Escanea las hojas de atrás hacia adelante para encontrar el día actual rápido.
 */
function getFastDailyResumen() {
    const ss = getActiveSS();
    const hoy = new Date();
    const hoyStr = Utilities.formatDate(hoy, Session.getScriptTimeZone(), "yyyy-MM-dd");

    const resumen = {
        total: 0,
        cantidad: 0,
        porMetodo: {},
        success: true
    };

    // Hojas a escanear (Prioridad: las más activas)
    const sheetsToScan = [SHEETS.VENTAS_PEDIDOS, SHEETS.BLOGGER_SALES];

    sheetsToScan.forEach(sName => {
        try {
            const sheet = ss.getSheetByName(sName);
            if (!sheet) return;

            const data = sheet.getDataRange().getValues();
            const mapping = HeaderManager.getMapping(sName === SHEETS.BLOGGER_SALES ? "BLOGGER_SALES" : "VENTAS_PEDIDOS");
            if (!mapping) return;

            const dateIdx = mapping["FECHA"];
            const totalIdx = mapping["TOTAL_VENTA"];
            const methodIdx = mapping["METODO_PAGO"];

            // Escaneamos desde la última fila hacia arriba (LO MÁS RECIENTE PRIMERO)
            for (let i = data.length - 1; i >= 1; i--) {
                const row = data[i];
                const rowDate = row[dateIdx];
                if (!rowDate) continue;

                const rowDateStr = (rowDate instanceof Date)
                    ? Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd")
                    : String(rowDate).split(" ")[0];

                if (rowDateStr === hoyStr) {
                    const monto = parseFloat(String(row[totalIdx] || 0).replace(/\$|\./g, '').replace(',', '.') || 0);
                    const metodo = row[methodIdx] || "N/A";

                    resumen.total += monto;
                    resumen.cantidad++;
                    resumen.porMetodo[metodo] = (resumen.porMetodo[metodo] || 0) + monto;
                } else if (rowDate instanceof Date && rowDate < new Date(new Date().setHours(0, 0, 0, 0))) {
                    // Si ya pasamos a ayer, cortamos el bucle (OPTIMIZACIÓN)
                    break;
                }
            }
        } catch (err) {
            console.error(`Error escaneando hoja ${sName} para bot: ${err.message}`);
        }
    });

    return resumen;
}

/**
 * Provee datos de telemetría para el Dashboard de Inicio.
 */
function getHomeDashboardData() {
    try {
        const ventas = getFastDailyResumen();
        const ss = getActiveSS();
        const sheetNum = ss.getSheetByName(SHEETS.INVENTORY);
        let stockBajo = 0;

        if (sheetNum) {
            const data = sheetNum.getDataRange().getValues();
            const headers = data[0].map(h => String(h).trim());
            const idxStock = headers.indexOf("STOCK_ACTUAL");
            const idxMin = headers.indexOf("STOCK_MINIMO") !== -1 ? headers.indexOf("STOCK_MINIMO") : -1;

            if (idxStock !== -1) {
                for (let i = 1; i < data.length; i++) {
                    const actual = parseFloat(data[i][idxStock]) || 0;
                    const min = idxMin !== -1 ? (parseFloat(data[i][idxMin]) || 5) : 5;
                    if (actual <= min && actual > 0) stockBajo++;
                }
            }
        }

        return {
            ventas: { total: ventas.total, cantidad: ventas.cantidad },
            stock: { bajo: stockBajo },
            system: { mode: GLOBAL_CONFIG.TELEGRAM.MODE || "PROD", target: GLOBAL_CONFIG.PUBLICATION_TARGET || "DONWEB" }
        };
    } catch (e) {
        console.error("Error en getHomeDashboardData: " + e.message);
        return { error: e.message };
    }
}
