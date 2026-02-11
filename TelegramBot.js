/**
 * TELEGRAM BOT CONTROLLER (V2.0 - No-AI / Multi-Tenant)
 * Maneja la interactividad determinística y rápida.
 */

/**
 * Procesa la solicitud entrante de Telegram.
 */
function handleTelegramRequest(contents) {
    try {
        const update = contents;
        const message = update.message;
        const callbackQuery = update.callback_query;

        if (!message && !callbackQuery) return ContentService.createTextOutput("ok");

        const chatId = message ? message.chat.id : callbackQuery.message.chat.id;
        const text = message ? (message.text || "").trim() : "";
        const data = callbackQuery ? callbackQuery.data : "";
        const userId = message ? message.from.id : callbackQuery.from.id;

        // --- PROTECCIÓN DE BUCLES (Cache de Update ID) ---
        const updateId = update.update_id;
        const cache = CacheService.getScriptCache();
        if (cache.get(`msg_${updateId}`)) {
            return ContentService.createTextOutput("ok"); // Ya procesado
        }
        cache.put(`msg_${updateId}`, "true", 600); // 10 min

        // --- SEGURIDAD: Validar si el usuario es el dueño o desarrollador ---
        const config = GLOBAL_CONFIG.TELEGRAM;
        if (String(chatId) !== String(config.CHAT_ID)) {
            // Ignorar mensajes de otros para evitar spam, pero notificar al dueño si se desea
            return ContentService.createTextOutput("ok");
        }

        // --- ROUTER DE COMANDOS ---
        if (text.startsWith("/ventas") || data === "cmd_ventas") {
            responderResumenVentas(chatId);
        } else if (text.startsWith("/stock") || data === "cmd_stock") {
            const parts = text.split(" ");
            const modelo = parts.length > 1 ? parts.slice(1).join(" ") : "";
            responderConsultaStock(chatId, modelo);
        } else if (text === "/menu" || text === "/start" || data === "cmd_menu") {
            enviarMenuPrincipal(chatId);
        } else if (callbackQuery) {
            // Manejar otros botones...
            enviarTelegramRespuestaSimple(chatId, "⚠️ Comando de botón no reconocido.");
        }

    } catch (e) {
        console.error("❌ Error en handleTelegramRequest: " + e.message);
    }

    return ContentService.createTextOutput("ok");
}

/**
 * Envía el menú principal con botones Inline.
 */
function enviarMenuPrincipal(chatId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: "📊 Resumen de Ventas", callback_data: "cmd_ventas" }],
            [{ text: "📦 Consultar Stock", callback_data: "cmd_stock" }],
            [{ text: "🏠 Menú ERP", callback_data: "cmd_menu" }]
        ]
    };

    enviarMensajeTelegramCompleto(chatId, "🤖 <b>Asistente HostingShop</b>\n¿En qué puedo ayudarte hoy?", keyboard);
}

/**
 * Envía resumen de ventas rápido.
 */
function responderResumenVentas(chatId) {
    try {
        // Obtenemos datos financieros simplificados (reusando lógica de Dashboard si es posible)
        // Para velocidad, haremos una lectura directa a BD_VENTAS si Dashboard es muy pesado
        const resumen = "💰 <b>Resumen de Ventas (Hoy)</b>\n\nPróximamente: Integración con Dashboard.js...";
        enviarMensajeTelegramCompleto(chatId, resumen);
    } catch (e) {
        enviarTelegramRespuestaSimple(chatId, "❌ Error al calcular ventas: " + e.message);
    }
}

/**
 * Envía consulta de stock.
 */
function responderConsultaStock(chatId, modelo) {
    if (!modelo) {
        enviarTelegramRespuestaSimple(chatId, "📌 Uso: /stock [modelo]\nEjemplo: /stock Remera Oversize");
        return;
    }

    const respuesta = `🔍 <b>Buscando Stock: "${modelo}"</b>\n\nPróximamente: Integración con Inventario.js...`;
    enviarMensajeTelegramCompleto(chatId, respuesta);
}

/**
 * Función genérica para enviar mensajes con formato y teclado opcional.
 */
function enviarMensajeTelegramCompleto(chatId, text, keyboard = null) {
    const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
    if (!token) return;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
    };

    if (keyboard) {
        payload.reply_markup = JSON.stringify(keyboard);
    }

    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    UrlFetchApp.fetch(url, options);
}
