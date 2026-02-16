// =================================================================
// ===      LOGICA CLIENTE EXTERNO & VERIFICACIÓN PAGO (NEW)     ===
// =================================================================

/**
 * Función Principal para renderizar la vista del cliente.
 * Se llama desde Main.js -> doGet cuando view='customer_order'
 */
function renderCustomerSaleView(ventaId) {
    const template = HtmlService.createTemplateFromFile('Web/customer_sale_view');

    // Inicialización de variables de plantilla
    template.venta = null;
    template.error = null;
    template.cliente = null;
    template.productosParaTabla = [];
    template.datosTransferencia = null;
    template.publicComprobanteURL = null;
    template.appName = GLOBAL_CONFIG.APPSHEET.APP_NAME;
    template.tableName = SHEETS.VENTAS_PEDIDOS || "BD_VENTAS_PEDIDOS"; // Fallback seguro

    if (!ventaId) {
        template.error = 'No se encontró un ID de venta. Por favor, revisa el enlace.';
    } else {
        try {
            // 1. Obtener Datos Generales
            const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
            const allVentasData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.VENTAS_PEDIDOS));

            // 2. Buscar Venta
            const venta = allVentasData.find(v => v.VENTA_ID && String(v.VENTA_ID).trim() === String(ventaId).trim());

            if (!venta) {
                template.error = `El pedido #${ventaId} no fue encontrado.`;
            } else {
                // 3. Obtener Datos Relacionados
                const allClientesData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.CLIENTS));
                const allProductosData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.PRODUCTS));
                const allDetalleData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DETALLE_VENTAS));
                const allDatosTransferenciaData = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DATOS_TRANSFERENCIA));

                // 4. Procesar Cliente
                let cliente = allClientesData.find(c => String(c.CLIENTE_ID).trim() === String(venta.CLIENTE_ID).trim());
                if (cliente) {
                    if (!cliente.TIPO_ENVIO) cliente.TIPO_ENVIO = "RETIRO TIENDA";
                    // Lógica de correo faltante (Legacy Port)
                    cliente.correoVacio = !cliente.CORREO_ELECTRONICO || String(cliente.CORREO_ELECTRONICO).trim() === '';
                    if (cliente.correoVacio) cliente.CORREO_ELECTRONICO = "DATO FALTANTE";
                } else {
                    cliente = {
                        CLIENTE_ID: venta.CLIENTE_ID,
                        NOMBRE_COMPLETO: "Cliente no registrado",
                        CORREO_ELECTRONICO: "DATO FALTANTE",
                        correoVacio: true
                    };
                }

                // 5. Procesar Transferencia
                const datosTransferencia = allDatosTransferenciaData.find(dt => dt.CUENTA_ID && String(dt.CUENTA_ID).trim() === String(venta.DATOS_TRANSFERENCIA).trim());

                // 6. Formateo de Fechas y Hora
                const zonaHorariaArgentina = 'GMT-03:00';
                if (venta.FECHA) {
                    try {
                        // Intento 1: Objeto Date directo
                        if (venta.FECHA instanceof Date) {
                            venta.FECHA = Utilities.formatDate(venta.FECHA, zonaHorariaArgentina, 'dd/MM/yyyy');
                        } else {
                            // Intento 2: String fecha ISO o similar
                            venta.FECHA = Utilities.formatDate(new Date(venta.FECHA), zonaHorariaArgentina, 'dd/MM/yyyy');
                        }
                    } catch (e) {
                        // Fallback: Si es un string "Sat Dec 30...", cortamos
                        const strFecha = String(venta.FECHA);
                        if (strFecha.includes("Sat Dec 30 1899")) {
                            // Es una hora pura, error de dato
                            venta.FECHA = "Fecha inválida";
                        }
                    }
                }
                if (venta.HORA) {
                    if (venta.HORA instanceof Date) {
                        venta.HORA = Utilities.formatDate(venta.HORA, zonaHorariaArgentina, 'HH:mm');
                    } else {
                        const horaFraccion = parseFloat(venta.HORA);
                        if (!isNaN(horaFraccion)) {
                            const fechaTemporal = new Date(1899, 11, 30);
                            fechaTemporal.setTime(fechaTemporal.getTime() + horaFraccion * 24 * 60 * 60 * 1000);
                            venta.HORA = Utilities.formatDate(fechaTemporal, zonaHorariaArgentina, 'HH:mm');
                        }
                    }
                }

                // --- HELPER: Parseo Robusto de Montos (Portado de Dashboard.js) ---
                const parseMontoRobust = (rawVal) => {
                    if (rawVal === null || rawVal === undefined || rawVal === '') return 0;
                    if (typeof rawVal === 'number') return rawVal;
                    if (typeof rawVal === 'string') {
                        let limpio = rawVal.trim().replace('$', '').replace(/\s/g, '');
                        // Lógica de detección de formato Argentina vs Internacional
                        if (limpio.match(/\.\d{3},\d{2}$/)) { limpio = limpio.replace(/\./g, '').replace(',', '.'); }
                        else if (limpio.match(/\d+,\d{1,2}$/)) { limpio = limpio.replace(',', '.'); }
                        else if (limpio.match(/\d+\.\d{3}(\.\d{3})*$/)) { limpio = limpio.replace(/\./g, ''); }
                        return parseFloat(limpio) || 0;
                    }
                    return 0;
                };

                // 7. Procesar Productos (Tabla Detalle) & Recalcular Totales
                let calculoMontoProductos = 0;

                const productosParaTabla = allDetalleData
                    .filter(p => String(p.VENTA_ID).trim() === String(ventaId).trim())
                    .map(detalle => {
                        const producto = allProductosData.find(prod => String(prod.CODIGO_ID).trim() === String(detalle.PRODUCTO_ID).trim()) || {};
                        const subtotalItem = parseMontoRobust(detalle.MONTO || detalle.SUBTOTAL);
                        calculoMontoProductos += subtotalItem;

                        return {
                            producto: producto,
                            detalle: {
                                ...detalle,
                                PRECIO_FORMATO: formatoMoneda(parseMontoRobust(detalle.PRECIO)),
                                MONTO_FORMATO: formatoMoneda(subtotalItem)
                            }
                        };
                    });

                // 8. Formateo y Cálculos de Totales (Lógica Fallback)

                // Parseamos valores base
                let totalVenta = parseMontoRobust(venta.TOTAL_VENTA);
                let costoEnvio = parseMontoRobust(venta.COSTO_ENVIO);
                let recargoTransf = parseMontoRobust(venta.RECARGO_TRANSFERENCIA);
                let recargoMenor = parseMontoRobust(venta.RECARGO_MENOR);
                let pagoEfectivo = parseMontoRobust(venta.PAGO_EFECTIVO);

                // Fallback 1: Si no hay monto de productos, usar la suma de detalles
                let montoProductos = parseMontoRobust(venta.MONTO_TOTAL_PRODUCTOS);
                if (!montoProductos && calculoMontoProductos > 0) {
                    montoProductos = calculoMontoProductos;
                }

                // Fallback 2: Si no hay subtotal
                let subtotal = parseMontoRobust(venta.SUBTOTAL);
                if (!subtotal) {
                    // Lógica invertida o fallback básico: Subtotal = Monto Productos
                    subtotal = montoProductos;
                }

                // Actualizamos objeto venta con valores numéricos formateados luego
                venta.MONTO_TOTAL_PRODUCTOS = montoProductos;
                venta.SUBTOTAL = subtotal;
                venta.TOTAL_VENTA = totalVenta;
                venta.COSTO_ENVIO = costoEnvio;
                venta.RECARGO_TRANSFERENCIA = recargoTransf;
                venta.RECARGO_MENOR = recargoMenor;
                venta.PAGO_EFECTIVO = pagoEfectivo;

                const camposMoneda = ['MONTO_TOTAL_PRODUCTOS', 'PAGO_EFECTIVO', 'SUBTOTAL', 'COSTO_ENVIO', 'RECARGO_MENOR', 'RECARGO_TRANSFERENCIA', 'TOTAL_VENTA'];
                camposMoneda.forEach(key => {
                    venta[key] = formatoMoneda(venta[key]);
                });

                // 9. Comprobante Actual
                if (venta.COMPROBANTE_FILE) {
                    template.publicComprobanteURL = getPublicFileURL(venta.COMPROBANTE_FILE, SHEETS.VENTAS_PEDIDOS || "BD_VENTAS_PEDIDOS");
                }

                // Asignar al template
                template.venta = venta;
                template.cliente = cliente;
                template.productosParaTabla = productosParaTabla;
                template.datosTransferencia = datosTransferencia;
            }
        } catch (e) {
            Logger.log('Error Render Customer View: ' + e.message);
            template.error = 'Error interno al cargar los datos. Intente más tarde.';
        }
    }

    return template.evaluate()
        .setTitle(`Pedido #${ventaId || ''}`)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Maneja la subida del comprobante y DETONA la verificación IA.
 */
function handleReceiptUpload(fileData) {
    try {
        const carpetaId = GLOBAL_CONFIG.APPSHEET.COMPROBANTES_FOLDER_ID;
        if (!carpetaId) throw new Error("Configuración incompleta: Falta ID Carpeta Comprobantes.");

        // 1. Guardar Archivo Físico
        const folder = DriveApp.getFolderById(carpetaId);
        const folderName = folder.getName();
        const originalFileName = fileData.fileName;
        const extension = originalFileName.includes('.') ? originalFileName.substring(originalFileName.lastIndexOf('.')) : '';
        const uniquePart = Math.floor(100000 + Math.random() * 900000);
        const finalFileName = `${fileData.ventaId}.COMPROBANTE_FILE.${uniquePart}${extension}`;

        const decodedContent = Utilities.base64Decode(fileData.content);
        const fileBlob = Utilities.newBlob(decodedContent, fileData.mimeType, finalFileName);
        const file = folder.createFile(fileBlob);

        const relativePath = folderName + "/" + finalFileName;
        Logger.log(`Comprobante guardado: ${relativePath}`);

        // 2. VERIFICACIÓN CON GEMINI (IA)
        const ss = SpreadsheetApp.openById(GLOBAL_CONFIG.SPREADSHEET_ID);
        const allVentas = convertirRangoAObjetos(ss.getSheetByName(SHEETS.VENTAS_PEDIDOS));
        const venta = allVentas.find(v => String(v.VENTA_ID) === String(fileData.ventaId));
        let analysisResult = { success: false, reason: "No venta data" };

        if (venta) {
            const allDatosTrans = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DATOS_TRANSFERENCIA));
            const datosCuenta = allDatosTrans.find(dt => String(dt.CUENTA_ID) === String(venta.DATOS_TRANSFERENCIA));
            analysisResult = verifyReceiptWithGemini(fileBlob, venta, datosCuenta);
        }

        // NOVEDAD: Guardar Análisis en BD (Columna DETALLE_AUDITORIA_IA)
        const analisisJsonString = JSON.stringify(analysisResult);

        // 3. Acciones basadas en IA
        let nuevoEstado = venta.ESTADO;
        let mensajeUsuario = "";
        let updateResult = { success: false, logs: [] };
        // Default 0 for required field compliance
        let currentPagoEfectivo = venta.PAGO_EFECTIVO || "0";
        // Force inclusion of dependency column
        let currentPagoMixto = (venta.PAGO_MIXTO === true || String(venta.PAGO_MIXTO).toUpperCase() === "TRUE") ? "TRUE" : "FALSE";

        // Extra data to prevent "Missing value" errors in strict AppSheet columns
        // Extra data to prevent "Missing value" errors in strict AppSheet columns
        const extraData = {
            RECARGO_TRANSFERENCIA: venta.RECARGO_TRANSFERENCIA,
            RECARGO_MENOR: venta.RECARGO_MENOR,
            COSTO_ENVIO: venta.COSTO_ENVIO,
            SUBTOTAL: venta.SUBTOTAL,
            MONTO_TOTAL_PRODUCTOS: venta.MONTO_TOTAL_PRODUCTOS
        };

        let emailStatus = { sent: false, reason: "Not initiated" };

        if (analysisResult.verified) {
            nuevoEstado = "PAGADO";
            mensajeUsuario = "✅ ¡Pago Verificado por IA! Tu pedido ha sido confirmado.";
            updateResult = updateAppSheetSale(fileData.ventaId, relativePath, "PAGADO", analisisJsonString, currentPagoEfectivo, currentPagoMixto, extraData);

            // [NEW] Enviar Correo de Confirmación
            try {
                const allClientes = convertirRangoAObjetos(ss.getSheetByName(SHEETS.CLIENTS));
                const cliente = allClientes.find(c => String(c.CLIENTE_ID).trim() === String(venta.CLIENTE_ID).trim());

                if (cliente && cliente.CORREO_ELECTRONICO && cliente.CORREO_ELECTRONICO.includes("@")) {
                    // Obtener items para el correo
                    const allDetalle = convertirRangoAObjetos(ss.getSheetByName(SHEETS.DETALLE_VENTAS));
                    const allProductos = convertirRangoAObjetos(ss.getSheetByName(SHEETS.PRODUCTS));

                    const items = allDetalle
                        .filter(d => String(d.VENTA_ID) === String(venta.VENTA_ID))
                        .map(d => {
                            const prod = allProductos.find(p => String(p.CODIGO_ID) === String(d.PRODUCTO_ID));
                            return {
                                nombre: prod ? prod.MODELO : "Producto",
                                cantidad: d.CANTIDAD,
                                precio: d.PRECIO,
                                total: d.MONTO || d.SUBTOTAL
                            };
                        });

                    sendOrderConfirmationEmail(cliente, venta, items);
                    mensajeUsuario += " Se ha enviado el comprobante a tu correo.";
                    emailStatus = { sent: true, recipient: cliente.CORREO_ELECTRONICO };
                } else {
                    emailStatus = { sent: false, reason: "Cliente o Correo no encontrado", clientId: venta.CLIENTE_ID };
                }
            } catch (emailErr) {
                Logger.log("Error enviando email: " + emailErr.message);
                emailStatus = { sent: false, error: emailErr.message };
            }

        } else {
            nuevoEstado = "REVISION MANUAL";
            mensajeUsuario = `⚠️ Comprobante subido, pero la IA detectó inconsistencias: ${analysisResult.reason}. Un humano lo revisará pronto.`;
            updateResult = updateAppSheetSale(fileData.ventaId, relativePath, "REVISION MANUAL", analisisJsonString, currentPagoEfectivo, currentPagoMixto, extraData);
        }


        return {
            success: true,
            relativePath: relativePath,
            verified: analysisResult.verified,
            message: mensajeUsuario,
            verified: analysisResult.verified,
            message: mensajeUsuario,
            aiReason: analysisResult.reason,
            appSheetResult: updateResult,
            emailResult: emailStatus // Retornar estado del email para debug
        };

    } catch (error) {
        Logger.log("Error handleReceiptUpload: " + error.message);
        throw new Error("Error al procesar comprobante: " + error.message);
    }
}

/**
 * Función Core de Verificación IA
 */
function verifyReceiptWithGemini(imageBlob, ventaData, cuentaData) {
    const apiKey = GLOBAL_CONFIG.GEMINI.API_KEY;
    if (!apiKey) return { verified: false, reason: "Falta API Key IA" };

    // Preparar contexto para el prompt
    const expectedAmount = ventaData.TOTAL_VENTA; // string ej "$10.500,00"
    const expectedBank = cuentaData ? cuentaData.BANCO : "Unknown";
    const expectedHolder = cuentaData ? cuentaData.NOMBRE_CUENTA : "Unknown";
    const today = Utilities.formatDate(new Date(), 'GMT-03:00', 'dd/MM/yyyy');

    const prompt = `
    ACTÚA COMO UN AGENTE DE AUDITORÍA DE PAGOS (Persona: "Agente IA"). Analiza esta imagen (comprobante de pago).
    
    DATOS DE VERIFICACIÓN A COMPARAR:
    - Monto Esperado: ${expectedAmount} (Permite variaciones menores de formato como 10500 vs 10.500)
    - Banco/Billetera Destino Esperada: ${expectedBank}
    - Titular Destino Esperado: ${expectedHolder}
    - Fecha: Debería ser cercana a hoy (${today}).

    TAREA:
    1. Extrae el Monto de la imagen.
    2. Extrae el Nombre del Receptor/Banco de la imagen.
    3. Compara con los Datos de Verificación.
    
    SALIDA JSON SOLAMENTE (Responde en Español):
    {
      "verified": boolean, // true SOLO si el pago es exitoso, el monto coincide (aprox) y el receptor coincide.
      "extracted_amount": "string",
      "extracted_receiver": "string",
      "reason": "breve explicación en español (primera persona, soy Agente IA)"
    }
  `;

    try {
        const base64Image = Utilities.base64Encode(imageBlob.getBytes());

        const payload = {
            "contents": [{
                "parts": [
                    { "text": prompt },
                    { "inline_data": { "mime_type": imageBlob.getContentType(), "data": base64Image } }
                ]
            }]
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const options = {
            "method": "post",
            "contentType": "application/json",
            "payload": JSON.stringify(payload),
            "muteHttpExceptions": true
        };

        const response = UrlFetchApp.fetch(url, options);
        const json = JSON.parse(response.getContentText());

        if (json.candidates && json.candidates.length > 0) {
            const textResponse = json.candidates[0].content.parts[0].text;
            // Limpiar bloques de código markdown si existen
            const cleanJsonStr = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJsonStr);
        }

        return { verified: false, reason: "AI no response" };

    } catch (e) {
        Logger.log("Error Gemini Verification: " + e.message);
        return { verified: false, reason: "AI Error: " + e.message };
    }
}

function updateAppSheetSale(ventaId, relativePath, newStatus, logIa, pagoEfectivo, pagoMixto, extraData = {}) {
    const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
    const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;
    const tableName = SHEETS.VENTAS_PEDIDOS || "BD_VENTAS_PEDIDOS";

    if (!appId || !accessKey) {
        Logger.log("Skipping AppSheet Update: Missing Credentials");
        return;
    }

    const url = `https://api.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`;
    const requestBody = {
        "Action": "Edit",
        "Properties": { "Locale": "es-AR", "Timezone": "SA Western Standard Time" },
        "Rows": [
            {
                "VENTA_ID": ventaId,
                "ESTADO": newStatus,
                "COMPROBANTE_FILE": relativePath,
                "DETALLE_AUDITORIA_IA": logIa || "",
                "DETALLE_AUDITORIA_IA": logIa || "",
                "PAGO_EFECTIVO": String(pagoEfectivo || "0"),
                "PAGO_MIXTO": pagoMixto,
                "RECARGO_TRANSFERENCIA": String(extraData.RECARGO_TRANSFERENCIA || "0"),
                "RECARGO_MENOR": String(extraData.RECARGO_MENOR || "0"),
                "COSTO_ENVIO": String(extraData.COSTO_ENVIO || "0"),
                "SUBTOTAL": String(extraData.SUBTOTAL || "0"),
                "MONTO_TOTAL_PRODUCTOS": String(extraData.MONTO_TOTAL_PRODUCTOS || "0")
            }
        ]
    };

    const options = {
        method: 'post',
        contentType: 'application/json',
        headers: { 'ApplicationAccessKey': accessKey },
        payload: JSON.stringify(requestBody),
        muteHttpExceptions: true
    };

    let result = { success: false, logs: [] };
    const log = (msg) => { Logger.log(msg); result.logs.push(msg); };

    try {
        log(`[AppSheet Request] URL: ${url}`);
        // Ocultar payload completo si es muy largo, o mostrarlo
        log(`[AppSheet Request]Payload Preview: ${JSON.stringify(requestBody)}`);

        const response = UrlFetchApp.fetch(url, options);
        const responseCode = response.getResponseCode();
        const responseBody = response.getContentText();

        log(`[AppSheet Response]Code: ${responseCode} `);

        if (responseCode !== 200) {
            log("❌ Error updating AppSheet: " + responseBody);
            result.success = false;
        } else {
            log("✅ AppSheet updated successfully.");
            result.success = true;
        }
    } catch (e) {
        log("❌ Exception during AppSheet update: " + e.message);
        result.success = false;
    }
    return result;
}

// Helper local reutilizado (o importar de Main si fuera módulo ES6, que no es)
function formatoMoneda(numero) {
    if (numero === null || numero === undefined || String(numero) === '') return '$0.00';
    // Si ya tiene símbolo $, devolver
    if (String(numero).includes('$')) return numero;
    return `$${Number(numero).toLocaleString('es-AR', { minimumFractionDigits: 2 })} `;
}

function getPublicFileURL(fileName, tableName) {
    if (!fileName) return "";
    const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME;
    return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(tableName)}&fileName=${encodeURIComponent(fileName)}`;
}

/**
 * Actualiza el correo del cliente en AppSheet.
 * Se llama desde la vista cliente si falta el dato.
 */
function updateClientEmail(clienteId, email) {
    const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
    const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;
    const tableName = SHEETS.CLIENTS || "BD_CLIENTES";

    if (!appId || !accessKey) throw new Error("Credenciales de AppSheet no configuradas.");

    const url = `https://api.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`;
    const requestBody = {
        "Action": "Edit",
        "Properties": { "Locale": "es-AR" },
        "Rows": [
            {
                "CLIENTE_ID": clienteId,
                "CORREO_ELECTRONICO": email
            }
        ]
    };

    const options = {
        method: 'post',
        contentType: 'application/json',
        headers: { 'ApplicationAccessKey': accessKey },
        payload: JSON.stringify(requestBody),
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        if (response.getResponseCode() !== 200) {
            throw new Error("Error AppSheet: " + response.getContentText());
        }
        return { success: true };
    } catch (e) {
        Logger.log("Error updateClientEmail: " + e.message);
        throw new Error(e.message);
    }
}

/**
 * Envía correo de confirmación de pago.
 */
function sendOrderConfirmationEmail(cliente, venta, items) {
    const asunto = `Pago Confirmado - Pedido #${venta.VENTA_ID}`;
    const scriptUrl = ScriptApp.getService().getUrl();
    const orderLink = `${scriptUrl}?view=customer_order&oid=${venta.VENTA_ID}`;

    // Construir filas de productos
    const filasProductos = items.map(item => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #334155; color: #e2e8f0;">${item.nombre}</td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center; color: #cbd5e1;">${item.cantidad}</td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: right; color: #e2e8f0;">${formatoMoneda(item.total)}</td>
        </tr>
    `).join('');

    // Filas adicionales (Orden Específico: Recargo Menor -> Envío -> Pago Efectivo -> Subtotal -> Recargo Transf)
    let extraRows = '';

    if (venta.RECARGO_MENOR && parseFloat(venta.RECARGO_MENOR) > 0) {
        extraRows += `<tr><td colspan="2" style="padding: 8px; text-align: right; color: #fb923c;">Recargo Menor:</td><td style="padding: 8px; text-align: right; color: #cbd5e1;">+${formatoMoneda(venta.RECARGO_MENOR)}</td></tr>`;
    }

    if (venta.COSTO_ENVIO && parseFloat(venta.COSTO_ENVIO) > 0) {
        extraRows += `<tr><td colspan="2" style="padding: 8px; text-align: right; color: #60a5fa;">Envío:</td><td style="padding: 8px; text-align: right; color: #cbd5e1;">+${formatoMoneda(venta.COSTO_ENVIO)}</td></tr>`;
    }

    if (venta.PAGO_EFECTIVO && parseFloat(venta.PAGO_EFECTIVO) > 0) {
        extraRows += `<tr><td colspan="2" style="padding: 8px; text-align: right; color: #34d399;">Pago Efectivo:</td><td style="padding: 8px; text-align: right; color: #cbd5e1;">-${formatoMoneda(venta.PAGO_EFECTIVO)}</td></tr>`;
    }

    if (venta.SUBTOTAL && parseFloat(venta.SUBTOTAL) > 0) {
        extraRows += `<tr><td colspan="2" style="padding: 10px 8px 8px 8px; text-align: right; color: #e2e8f0; border-top: 1px solid #334155; font-weight: bold;">Subtotal:</td><td style="padding: 10px 8px 8px 8px; text-align: right; color: #e2e8f0; border-top: 1px solid #334155; font-weight: bold;">${formatoMoneda(venta.SUBTOTAL)}</td></tr>`;
    }

    if (venta.RECARGO_TRANSFERENCIA && parseFloat(venta.RECARGO_TRANSFERENCIA) > 0) {
        extraRows += `<tr><td colspan="2" style="padding: 8px; text-align: right; color: #facc15;">Recargo Transf.:</td><td style="padding: 8px; text-align: right; color: #cbd5e1;">+${formatoMoneda(venta.RECARGO_TRANSFERENCIA)}</td></tr>`;
    }

    const htmlBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #e2e8f0; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b;">
            <div style="background-color: #10b981; padding: 30px 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">¡Pago Recibido!</h1>
                <p style="color: #ecfdf5; margin-top: 5px; font-size: 16px;">Pedido #${venta.VENTA_ID}</p>
            </div>
            
            <div style="padding: 30px;">
                <p style="font-size: 16px; line-height: 1.5; color: #cbd5e1;">Hola <strong style="color: white;">${cliente.NOMBRE_COMPLETO}</strong>,</p>
                <p style="font-size: 15px; line-height: 1.5; color: #94a3b8;">
                    Hemos verificado tu pago correctamente. Aquí tienes el resumen de tu compra confirmada:
                </p>
                
                <div style="margin-top: 25px; background-color: #1e293b; border-radius: 8px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background-color: #334155;">
                                <th style="padding: 12px; text-align: left; color: #f8fafc; font-weight: 600;">Producto</th>
                                <th style="padding: 12px; text-align: center; color: #f8fafc; font-weight: 600;">Cant</th>
                                <th style="padding: 12px; text-align: right; color: #f8fafc; font-weight: 600;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasProductos}
                        </tbody>
                        <tfoot style="background-color: #1e293b; border-top: 2px solid #334155;">
                            ${extraRows}
                             <tr>
                                <td colspan="2" style="padding: 15px 12px; text-align: right; font-weight: bold; font-size: 16px; color: white;">Total Pagado:</td>
                                <td style="padding: 15px 12px; text-align: right; font-weight: bold; font-size: 18px; color: #10b981;">${formatoMoneda(venta.TOTAL_VENTA)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div style="text-align: center; margin-top: 30px;">
                    <a href="${orderLink}" style="background-color: #3b82f6; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Ver Detalle Completo</a>
                </div>

                <p style="margin-top: 40px; font-size: 13px; color: #64748b; text-align: center;">
                    Si tienes alguna duda, responde a este correo.<br>
                    <a href="${orderLink}" style="color: #3b82f6;">Ver en el navegador</a>
                </p>
            </div>
             <div style="background-color: #020617; padding: 20px; text-align: center; font-size: 11px; color: #475569;">
                &copy; ${new Date().getFullYear()} ${GLOBAL_CONFIG.APPSHEET.APP_NAME || "Macro HostingShop"}
            </div>
        </div>
    `;

    MailApp.sendEmail({
        to: cliente.CORREO_ELECTRONICO,
        subject: asunto,
        htmlBody: htmlBody
    });
};
