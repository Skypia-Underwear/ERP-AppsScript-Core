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
