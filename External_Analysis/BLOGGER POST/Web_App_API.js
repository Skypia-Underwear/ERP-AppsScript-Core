/**
 * =================================================================
 * ARCHIVO: Web_App_API.js
 * UBICACIÓN: /Blogger_Integration/
 * DESCRIPCIÓN: Endpoint para recibir pedidos desde Blogger y 
 *              registrarlos en AppSheet vía API oficial.
 * =================================================================
 */

// [!] REEMPLAZA ESTO CON LOS VALORES DE TU INTEGRACIÓN EN APPSHEET
// Ve a AppSheet -> Manage -> Integrations -> IN -> Enable -> Create Application Access Key
const APPSHEET_API_URL = "https://api.appsheet.com/api/v2/apps/" + CONFIG.IDS.APP_ID + "/tables/";
const APPSHEET_KEY = "V2-hI4pz-a9vti-j75zm-0wJma-dLkxQ-dZ4TT-rVdwk-PXSaL";

/**
 * Recibe peticiones POST desde la web (Blogger)
 */
function doPost(e) {
    try {
        const payload = JSON.parse(e.postData.contents);

        // --- FLUJO DE LOGIN (Traer datos del cliente) ---
        if (payload.action === "LOGIN") {
            const clienteId = payload.cliente_id;
            if (!clienteId || clienteId.trim() === "") {
                return ContentService.createTextOutput(JSON.stringify({
                    status: "error", message: "ID de cliente no proporcionado"
                })).setMimeType(ContentService.MimeType.JSON);
            }

            const clientData = buscarClienteAppSheet(clienteId.trim());
            if (clientData) {
                return ContentService.createTextOutput(JSON.stringify({
                    status: "success",
                    data: {
                        nombre: clientData.NOMBRE || "",
                        telefono: clientData.CELULAR || clientData.TELEFONO || "",
                        cliente_id: clientData.CLIENTE_ID,
                        direccion: clientData.DIRECCION || "",
                        tipoTienda: clientData.TIPO_TIENDA || "",
                        nombreGaleria: clientData.NOMBRE_GALERIA || "",
                        nombreFantasia: clientData.NOMBRE_FANTASIA || "",
                        numeroLocal: clientData.NUMERO_LOCAL || ""
                    }
                })).setMimeType(ContentService.MimeType.JSON);
            } else {
                return ContentService.createTextOutput(JSON.stringify({
                    status: "error", message: "Cliente no encontrado"
                })).setMimeType(ContentService.MimeType.JSON);
            }
        }

        // --- FLUJO DE REGISTRO DE NUEVO CLIENTE ---
        if (payload.action === "REGISTER_CLIENT") {
            const clienteData = payload.clienteData;
            const nuevoCliente = registrarClienteAppSheet(clienteData);
            return ContentService.createTextOutput(JSON.stringify({
                status: "success",
                data: nuevoCliente
            })).setMimeType(ContentService.MimeType.JSON);
        }

        // --- FLUJO DE EDICION DE CLIENTE EXISTENTE ---
        if (payload.action === "EDIT_CLIENT") {
            const clienteData = payload.clienteData;
            const clienteEditado = editarClienteAppSheet(clienteData);
            return ContentService.createTextOutput(JSON.stringify({
                status: "success",
                data: clienteEditado
            })).setMimeType(ContentService.MimeType.JSON);
        }

        // 1. Validar datos
        if (!payload.carrito || payload.carrito.length === 0) {
            throw new Error("El carrito está vacío");
        }
        const nombreCliente = payload.nombre || "Cliente Anónimo";
        const telefonoCliente = payload.telefono || "Sin Teléfono";
        const clienteRef = (payload.cliente_id && payload.cliente_id.trim() !== "") ? payload.cliente_id.trim() : "VENTA_ONLINE";

        // 2. Crear VENTA en AppSheet con fallback optimista
        let ventaID;
        try {
            ventaID = registrarVentaAppSheet(clienteRef, nombreCliente, telefonoCliente, "");
        } catch (e) {
            // Fallback si el ID proporcionado por el usuario no existe en AppSheet
            if (clienteRef !== "VENTA_ONLINE") {
                const warningMsg = "ALERTA: Cliente intentó usar ID inválido: " + clienteRef;
                ventaID = registrarVentaAppSheet("VENTA_ONLINE", nombreCliente, telefonoCliente, warningMsg);
            } else {
                throw e; // Fue otro tipo de error
            }
        }

        // 3. Crear INVENTARIO_MOVIMIENTOS para cada producto
        registrarItemsVenta(ventaID, payload.carrito);

        return ContentService.createTextOutput(JSON.stringify({
            status: "success",
            venta_id: ventaID
        })).setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({
            status: "error",
            message: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * Atiende peticiones GET (útil para verificar que el WebApp está vivo)
 */
function doGet(e) {
    return ContentService.createTextOutput("API Web de JM-MAYORISTA funcionando correctamente.");
}

/**
 * Llama a la API de AppSheet para buscar un cliente por ID
 * @returns {Object|null} Los datos del cliente o null si no existe
 */
function buscarClienteAppSheet(clienteId) {
    const url = APPSHEET_API_URL + "CLIENTES/Action";
    const body = {
        "Action": "Find",
        "Properties": {
            "Locale": "es-AR",
            "Timezone": "America/Argentina/Buenos_Aires"
        },
        "Rows": [
            {
                "CLIENTE_ID": clienteId
            }
        ]
    };

    const options = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
            "ApplicationAccessKey": APPSHEET_KEY
        },
        "payload": JSON.stringify(body),
        "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (result && Array.isArray(result) && result.length > 0) {
        return result[0]; // Retorna el primer cliente encontrado
    }
    return null;
}

/**
 * Registra un nuevo cliente en la tabla CLIENTES de AppSheet.
 * @param {Object} clienteData Datos del cliente a registrar
 * @returns {Object} La data del cliente con su nuevo ID
 */
function registrarClienteAppSheet(clienteData) {
    // Generar un ID único de 8 caracteres alfanuméricos para el cliente
    const nuevoClienteId = Utilities.getUuid().replace(/-/g, '').substring(0, 8);

    const payload = {
        "Action": "Add",
        "Properties": {
            "Locale": "es-AR",
            "Timezone": "America/Argentina/Buenos_Aires"
        },
        "Rows": [
            {
                "CLIENTE_ID": nuevoClienteId,
                "NOMBRE": clienteData.nombre || "",
                "CELULAR": clienteData.telefono || "",
                "TIPO_TIENDA": clienteData.tipoTienda || "",
                "NOMBRE_GALERIA": clienteData.nombreGaleria || "",
                "NOMBRE_FANTASIA": clienteData.nombreFantasia || "",
                "NUMERO_LOCAL": clienteData.numeroLocal || ""
            }
        ]
    };

    const options = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
            "ApplicationAccessKey": APPSHEET_KEY
        },
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
    };

    const url = APPSHEET_API_URL + "CLIENTES/Action";
    const response = UrlFetchApp.fetch(url, options);
    const jsonResp = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200 || !jsonResp.Rows || jsonResp.Rows.length === 0) {
        throw new Error("Error en AppSheet al registrar cliente: " + response.getContentText());
    }

    return {
        cliente_id: nuevoClienteId,
        nombre: clienteData.nombre,
        telefono: clienteData.telefono,
        direccion: clienteData.direccion,
        tipoTienda: clienteData.tipoTienda,
        nombreGaleria: clienteData.nombreGaleria,
        nombreFantasia: clienteData.nombreFantasia,
        numeroLocal: clienteData.numeroLocal
    };
}

/**
 * Edita un cliente existente en la tabla CLIENTES de AppSheet.
 * @param {Object} clienteData Datos del cliente a editar (debe incluir el cliente_id)
 * @returns {Object} La data actualizada del cliente
 */
function editarClienteAppSheet(clienteData) {
    if (!clienteData.cliente_id) {
        throw new Error("Se requiere el cliente_id para editar");
    }

    const payload = {
        "Action": "Edit",
        "Properties": {
            "Locale": "es-AR",
            "Timezone": "America/Argentina/Buenos_Aires"
        },
        "Rows": [
            {
                "CLIENTE_ID": clienteData.cliente_id,
                "NOMBRE": clienteData.nombre || "",
                "CELULAR": clienteData.telefono || "",
                "DIRECCION": clienteData.direccion || "",
                "TIPO_TIENDA": clienteData.tipoTienda || "",
                "NOMBRE_GALERIA": clienteData.nombreGaleria || "",
                "NOMBRE_FANTASIA": clienteData.nombreFantasia || "",
                "NUMERO_LOCAL": clienteData.numeroLocal || ""
            }
        ]
    };

    const options = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
            "ApplicationAccessKey": APPSHEET_KEY
        },
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
    };

    const url = APPSHEET_API_URL + "CLIENTES/Action";
    const response = UrlFetchApp.fetch(url, options);
    const jsonResp = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200 || !jsonResp.Rows || jsonResp.Rows.length === 0) {
        throw new Error("Error en AppSheet al editar cliente: " + response.getContentText());
    }

    return clienteData;
}

/**
 * Llama a la API de AppSheet para agregar un registro en VENTAS
 */
function registrarVentaAppSheet(clienteId, nombre, telefono, mensajeAlerta = "") {
    const url = APPSHEET_API_URL + "VENTAS/Action";
    const desc = "Web - " + nombre + " (" + telefono + ")" + (mensajeAlerta ? " | " + mensajeAlerta : "");

    const body = {
        "Action": "Add",
        "Properties": {
            "Locale": "es-AR",
            "Timezone": "America/Argentina/Buenos_Aires"
        },
        "Rows": [
            {
                "VENTA_ID": Utilities.getUuid(), // Generamos ID único aquí o en la BBDD
                "TIPO_VENTA": "DIRECTA",
                "CLIENTE_ID": clienteId,
                "ESTADO": "SOLICITADO",
                "DESCRIPCION_VENTA": desc
            }
        ]
    };
    const options = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
            "applicationAccessKey": APPSHEET_KEY
        },
        "payload": JSON.stringify(body),
        "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);
    const jsonResp = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200 || !jsonResp.Rows || jsonResp.Rows.length === 0) {
        throw new Error("Error en AppSheet API (Ventas): " + response.getContentText());
    }

    return jsonResp.Rows[0].VENTA_ID;
}

/**
 * Llama a la API de AppSheet para agregar los INVENTARIO_MOVIMIENTOS
 */
function registrarItemsVenta(ventaId, carrito) {
    const url = APPSHEET_API_URL + "INVENTARIO_MOVIMIENTOS/Action";

    // Transformamos el carrito de Blogger al formato que espera AppSheet
    const rows = carrito.map(item => {
        return {
            "REGISTRO_ID": Utilities.getUuid(),
            "VENTA_ID": ventaId,
            "MOVIMIENTO": "VENTA",
            // OJO: Asumiremos que item.codigo corresponde al INVENTARIO_ID o PRODUCTO_ID de tu tabla INVENTARIO
            "INVENTARIO_ID": item.codigo,
            "CANTIDAD": item.cantidad,
            "PRECIO": item.precio,
            // Si el precio VIP se guardó en Blogger, acá se le pasará al sistema.
            // O AppSheet recalculará el subtotal con su fórmula.
        };
    });

    const body = {
        "Action": "Add",
        "Properties": {
            "Locale": "es-AR",
            "Timezone": "America/Argentina/Buenos_Aires"
        },
        "Rows": rows
    };

    const options = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
            "applicationAccessKey": APPSHEET_KEY
        },
        "payload": JSON.stringify(body),
        "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() !== 200) {
        throw new Error("Error en AppSheet API (Movimientos): " + response.getContentText());
    }
}

