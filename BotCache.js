/**
 * BOT CACHE ENGINE
 * Optimiza el acceso a datos pesados para el Chatbot.
 */

const BOT_CACHE_KEYS = {
    PRODUCT_LIST: 'BOT_PROD_LIST_MIN', // [{id, modelo, precio}]
    SALES_TODAY: 'BOT_SALES_TODAY'
};

/**
 * Obtiene lista mínima de productos para búsqueda rápida.
 * Si no está en caché, la genera.
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

    // Regenerar si falta
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

    // Guardar en caché 2 horas (7200 seg)
    // Nota: El límite de CacheService es 100KB. Si la lista es enorme, esto fallará.
    // Como salvaguarda, si falla el guardado, simplemente devolvemos la lista.
    try {
        const json = JSON.stringify(list);
        if (json.length < 100000) {
            cache.put(BOT_CACHE_KEYS.PRODUCT_LIST, json, 7200);
        }
    } catch (e) { }

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

    const sheetsToScan = [SHEETS.BLOGGER_SALES, SHEETS.VENTAS_PEDIDOS];

    sheetsToScan.forEach(sName => {
        const sheet = ss.getSheetByName(sName);
        if (!sheet) return;

        const data = sheet.getDataRange().getValues();
        const mapping = HeaderManager.getMapping(sName === SHEETS.BLOGGER_SALES ? "BLOGGER_SALES" : "VENTAS_PEDIDOS");
        if (!mapping) return;

        const dateIdx = mapping["FECHA"];
        const totalIdx = sName === SHEETS.BLOGGER_SALES ? mapping["TOTAL_VENTA"] : mapping["TOTAL_VENTA"];
        const methodIdx = mapping["METODO_PAGO"];

        // Escaneamos desde la última fila hacia arriba
        for (let i = data.length - 1; i >= 1; i--) {
            const row = data[i];
            const rowDate = row[dateIdx];
            if (!rowDate) continue;

            const rowDateStr = (rowDate instanceof Date)
                ? Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd")
                : String(rowDate).split(" ")[0]; // Fallback para strings

            // Si llegamos a una fecha distinta a hoy, dejamos de buscar en esta hoja 
            // (Asumiendo que están relativamente ordenadas por fecha)
            if (rowDateStr !== hoyStr) {
                // Si la fecha es anterior a hoy, cortamos (optimización crítica)
                if (rowDate instanceof Date && rowDate < new Date(hoy.setHours(0, 0, 0, 0))) {
                    break;
                }
                continue;
            }

            const monto = parseFloat(String(row[totalIdx]).replace(/\$|\./g, '').replace(',', '.') || 0);
            const metodo = row[methodIdx] || "N/A";

            resumen.total += monto;
            resumen.cantidad++;
            resumen.porMetodo[metodo] = (resumen.porMetodo[metodo] || 0) + monto;
        }
    });

    return resumen;
}
