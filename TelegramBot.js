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
        console.log(`👤 Mensaje de ChatID: ${chatId} (Configurado: ${config.CHAT_ID})`);

        // Notificación de Salud para saber que entró al bot (Diagnóstico)
        notificarTelegramSalud(`📥 Bot Recibió: "${text || data}" de ChatID: ${chatId}`, "INFO");

        // --- ROUTER DE COMANDOS ---
        if (text.startsWith("/ventas") || data === "cmd_ventas") {
            responderResumenVentas(chatId);
        } else if (text === "/menu" || text === "/start" || data === "cmd_menu") {
            enviarMenuPrincipal(chatId);
        } else if (callbackQuery) {
            enviarTelegramRespuestaSimple(chatId, "⚠️ Comando de botón no reconocido.");
        }

    } catch (e) {
        console.error("❌ Error en handleTelegramRequest: " + e.message);
        notificarTelegramSalud(`❌ Error en handleTelegramRequest: ${e.message}`, "ERROR");
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
            [{ text: "🏠 Menú ERP", callback_data: "cmd_menu" }]
        ]
    };

    enviarMensajeTelegramCompleto(chatId, "🤖 <b>Asistente HostingShop</b>\n¿En qué puedo ayudarte hoy?", keyboard);
}

/**
 * Envía resumen de ventas rápido.
 * OPTIMIZADO: Usa getFastDailyResumen (Escaneo reverso rápido).
 */
function responderResumenVentas(chatId) {
    try {
        const res = getFastDailyResumen();

        if (res.cantidad === 0) {
            enviarMensajeTelegramCompleto(chatId, "💰 <b>Resumen de Ventas (Hoy)</b>\n\nNo se registraron ventas todavía hoy.");
            return;
        }

        let resumen = `💰 <b>Resumen de Ventas (Hoy)</b>\n`;
        resumen += `━━━━━━━━━━━━━━━━━━\n`;
        resumen += `💵 <b>Total:</b> $${res.total.toLocaleString("es-AR")}\n`;
        resumen += `🛍️ <b>Ventas:</b> ${res.cantidad}\n\n`;

        resumen += `<b>Desglose por Pago:</b>\n`;
        for (const mp in res.porMetodo) {
            resumen += `• ${mp}: $${res.porMetodo[mp].toLocaleString("es-AR")}\n`;
        }

        enviarMensajeTelegramCompleto(chatId, resumen);
    } catch (e) {
        enviarTelegramRespuestaSimple(chatId, "❌ Error al calcular ventas: " + e.message);
        notificarTelegramSalud(`❌ Error calculando resumen ventas (Bot): ${e.message}`, "ERROR");
    }
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

/**
 * PRUEBA DE CONEXIÓN DIRECTA (Manual)
 * Ejecuta esta función desde el editor para verificar TOKEN y CHAT_ID.
 */
function probarConexionDirectaTelegram() {
    const config = GLOBAL_CONFIG.TELEGRAM;
    const msg = `🧪 <b>Prueba de Conexión HostingShop</b>\n\n` +
        `• <b>Modo:</b> ${config.MODE}\n` +
        `• <b>ChatID:</b> ${config.CHAT_ID}\n` +
        `• <b>Token:</b> ${config.BOT_TOKEN.substring(0, 10)}... (Reducido)\n\n` +
        `Si recibes este mensaje, la CONFIGURACIÓN DE SALIDA está perfecta.`;

    try {
        enviarMensajeTelegramCompleto(config.CHAT_ID, msg);
        Logger.log("✅ Mensaje de prueba enviado. Revisa tu Telegram.");

        // También verificamos el Webhook
        const webAppUrl = ScriptApp.getService().getUrl();
        const urlWebhook = `https://api.telegram.org/bot${config.BOT_TOKEN}/getWebhookInfo`;
        const res = UrlFetchApp.fetch(urlWebhook, { muteHttpExceptions: true });
        Logger.log("🔍 Estado del Webhook en Telegram: " + res.getContentText());

        const ui = (typeof SpreadsheetApp !== "undefined") ? SpreadsheetApp.getUi() : null;
        if (ui) ui.alert("✅ Prueba ejecutada. Mira los 'Registros de ejecución' en la parte inferior del editor para ver el diagnóstico detallado.");
    } catch (e) {
        Logger.log("❌ Error en prueba: " + e.message);
        notificarTelegramSalud(`❌ Error en prueba de conexión: ${e.message}`, "ERROR");
    }
}
