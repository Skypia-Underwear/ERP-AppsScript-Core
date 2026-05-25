/**
 * TELEGRAM BOT CONTROLLER (V2.1 - Interactive & Productive)
 * Maneja la interactividad determinística y rápida con soporte para comandos nativos.
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
        const messageId = callbackQuery ? callbackQuery.message.message_id : null;

        // --- PROTECCIÓN DE BUCLES (Cache de Update ID) ---
        const updateId = update.update_id;
        const cache = CacheService.getScriptCache();
        if (cache.get(`msg_${updateId}`)) {
            return ContentService.createTextOutput("ok"); // Ya procesado
        }
        cache.put(`msg_${updateId}`, "true", 86400); // Protección por 24 horas para evitar re-procesar reintentos de Telegram

        // --- SEGURIDAD: Validar si el usuario es el dueño o desarrollador ---
        const config = GLOBAL_CONFIG.TELEGRAM;

        // --- ROUTER DE COMANDOS ---
        if (text === "/setup") {
            const res = configurarComandosNativosTelegram();
            enviarTelegramRespuestaSimple(chatId, res.success ? "✅ Menú de comandos configurado. Reinicia el chat o espera unos segundos para verlo." : "❌ Error: " + res.message);
        } else if (text === "/webapp") {
            const res = configurarMiniAppTelegram();
            enviarTelegramRespuestaSimple(chatId, res.success ? "✅ Botón ERP configurado. Mira el botón al lado de la barra de mensajes." : "❌ Error: " + res.message);
        } else if (text.startsWith("/ventas") || data === "cmd_ventas" || data === "upd_ventas") {
            const isUpdate = (data === "upd_ventas");
            responderResumenVentas(chatId, isUpdate, messageId);
        } else if (text === "/menu" || text === "/start" || data === "cmd_menu") {
            enviarMenuPrincipal(chatId);
        } else if (text === "/salud" || data === "cmd_salud") {
            probarConexionDirectaTelegram();
        } else if (text === "/exportar" || data === "cmd_exportar") {
            responderExportarDatos(chatId);
        } else if (callbackQuery) {
            // Responder al callback para quitar el relojito de carga en Telegram
            answerCallbackQuery(callbackQuery.id);
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
            [{ text: "📄 Exportar Datos (CSV)", callback_data: "cmd_exportar" }],
            [{ text: "🩺 Probar Salud", callback_data: "cmd_salud" }],
            [{ text: "🏠 Menú ERP", callback_data: "cmd_menu" }]
        ]
    };

    enviarMensajeTelegramCompleto(chatId, "🤖 <b>Asistente HostingShop</b>\n¿En qué puedo ayudarte hoy?", keyboard);
}

/**
 * Responde con el resumen de ventas.
 * Soporta actualización dinámica del mensaje original.
 */
function responderResumenVentas(chatId, isUpdate = false, messageId = null) {
    try {
        const res = getFastDailyResumen();

        let resumen = `💰 <b>Resumen de Ventas (Hoy)</b>\n`;
        resumen += `━━━━━━━━━━━━━━━━━━\n`;

        if (res.cantidad === 0) {
            resumen += `No se registraron ventas todavía hoy.\n`;
        } else {
            resumen += `💵 <b>Total:</b> $${res.total.toLocaleString("es-AR")}\n`;
            resumen += `🛍️ <b>Ventas:</b> ${res.cantidad}\n\n`;
            resumen += `<b>Desglose por Pago:</b>\n`;
            for (const mp in res.porMetodo) {
                resumen += `• ${mp}: $${res.porMetodo[mp].toLocaleString("es-AR")}\n`;
            }
        }

        const fechaHora = Utilities.formatDate(new Date(), "GMT-3", "HH:mm:ss");
        resumen += `\n🕒 <i>Última actualización: ${fechaHora}</i>`;

        const keyboard = {
            inline_keyboard: [
                [{ text: "🔄 Actualizar Datos", callback_data: "upd_ventas" }],
                [{ text: "⬅️ Volver", callback_data: "cmd_menu" }]
            ]
        };

        if (isUpdate && messageId) {
            editMessageText(chatId, messageId, resumen, keyboard);
        } else {
            enviarMensajeTelegramCompleto(chatId, resumen, keyboard);
        }
    } catch (e) {
        enviarTelegramRespuestaSimple(chatId, "❌ Error al calcular ventas: " + e.message);
        notificarTelegramSalud(`❌ Error calculando resumen ventas (Bot): ${e.message}`, "ERROR");
    }
}

/**
 * Exporta datos críticos a CSV y los envía al usuario.
 */
function responderExportarDatos(chatId) {
    try {
        enviarTelegramRespuestaSimple(chatId, "⏳ Generando reporte de stock crítico...");

        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.INVENTORY);
        if (!sheet) throw new Error("No se encontró la hoja de inventario.");

        const data = sheet.getDataRange().getValues();
        // Filtrar solo productos con stock > 0 para que el archivo no sea gigante
        const mapping = HeaderManager.getMapping("INVENTORY");
        if (!mapping) throw new Error("Mapeo de inventario no disponible");

        const colStock = mapping.STOCK_ACTUAL;
        const csvRows = [data[0].join(",")]; // Encabezados originales

        for (let i = 1; i < data.length; i++) {
            const stockVal = parseFloat(data[i][colStock]);
            if (stockVal > 0) {
                csvRows.push(data[i].join(","));
            }
        }
        const csvContent = csvRows.join("\n");
        const fileName = `Inventario_HostingShop_${Utilities.formatDate(new Date(), "GMT-3", "yyyy-MM-dd")}.csv`;
        const blob = Utilities.newBlob(csvContent, "text/csv", fileName);

        enviarDocumentoTelegram(chatId, blob, "📦 Aquí tienes el reporte de stock actual (solo productos con existencia).");
    } catch (e) {
        enviarTelegramRespuestaSimple(chatId, "❌ Error al exportar: " + e.message);
    }
}

/**
 * Configura los comandos nativos en el menú del bot (/ventas, /menu, /salud).
 */
function configurarComandosNativosTelegram() {
    const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
    if (!token || token.trim() === "" || token.includes("AQUÍ") || token.includes("BOT_TOKEN")) {
        return { success: false, message: "Telegram Bot no configurado (Token vacío o de plantilla)." };
    }

    const url = `https://api.telegram.org/bot${token}/setMyCommands`;
    const payload = {
        commands: [
            { command: "ventas", description: "Ver resumen de ventas de hoy" },
            { command: "exportar", description: "Descargar CSV de stock actual" },
            { command: "menu", description: "Abrir menú principal interactivo" },
            { command: "salud", description: "Diagnóstico de salud del sistema" }
        ]
    };

    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        const res = UrlFetchApp.fetch(url, options);
        const data = JSON.parse(res.getContentText());
        return { success: data.ok, data: data };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * Configura el Botón de Menú de Telegram para que abra el ERP como una Mini App (Web App).
 * Esto reemplaza el icono de "/" por uno que abre tu Dashboard directamente.
 */
function configurarMiniAppTelegram() {
    const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
    const webAppUrl = ScriptApp.getService().getUrl();

    if (!token || token.trim() === "" || token.includes("AQUÍ") || token.includes("BOT_TOKEN") || !webAppUrl) {
        return { success: false, message: "Token o URL de Web App no configurados." };
    }

    const url = `https://api.telegram.org/bot${token}/setChatMenuButton`;
    const payload = {
        menu_button: JSON.stringify({
            type: "web_app",
            text: "Abrir ERP",
            web_app: { url: webAppUrl }
        })
    };

    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        const res = UrlFetchApp.fetch(url, options);
        const data = JSON.parse(res.getContentText());
        return { success: data.ok, data: data };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * Responde a un callback_query para quitar el estado de carga en el cliente.
 */
function answerCallbackQuery(callbackQueryId) {
    const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
    if (!token || token.trim() === "" || token.includes("AQUÍ") || token.includes("BOT_TOKEN")) {
        console.log("⚠️ Telegram Bot no configurado (Token vacío o de plantilla). answerCallbackQuery omitida.");
        return;
    }

    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
    const payload = { callback_query_id: callbackQueryId };

    UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });
}

/**
 * Edita el texto de un mensaje existente.
 */
function editMessageText(chatId, messageId, text, keyboard = null) {
    const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
    if (!token || token.trim() === "" || token.includes("AQUÍ") || token.includes("BOT_TOKEN")) {
        console.log("⚠️ Telegram Bot no configurado (Token vacío o de plantilla). editMessageText omitida.");
        return;
    }

    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: "HTML"
    };

    if (keyboard) {
        payload.reply_markup = JSON.stringify(keyboard);
    }

    UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });
}

/**
 * Envía un documento (Blob) a Telegram.
 */
function enviarDocumentoTelegram(chatId, blob, caption = "") {
    const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
    if (!token || token.trim() === "" || token.includes("AQUÍ") || token.includes("BOT_TOKEN")) {
        console.log("⚠️ Telegram Bot no configurado (Token vacío o de plantilla). enviarDocumentoTelegram omitida.");
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendDocument`;
    const payload = {
        chat_id: String(chatId),
        document: blob,
        caption: caption
    };

    const options = {
        method: "post",
        payload: payload,
        muteHttpExceptions: true
    };

    try {
        UrlFetchApp.fetch(url, options);
    } catch (e) {
        console.error("Error enviando documento a Telegram: " + e.message);
    }
}

/**
 * Función genérica para enviar mensajes con formato y teclado opcional.
 */
function enviarMensajeTelegramCompleto(chatId, text, keyboard = null) {
    const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
    if (!token || token.trim() === "" || token.includes("AQUÍ") || token.includes("BOT_TOKEN")) {
        console.log("⚠️ Telegram Bot no configurado (Token vacío o de plantilla). enviarMensajeTelegramCompleto omitida.");
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
    };

    if (keyboard) {
        payload.reply_markup = JSON.stringify(keyboard);
    }

    UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });
}

/**
 * PRUEBA DE CONEXIÓN DIRECTA (Manual)
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
    } catch (e) {
        Logger.log("❌ Error en prueba: " + e.message);
        notificarTelegramSalud(`❌ Error en prueba de conexión: ${e.message}`, "ERROR");
    }
}
