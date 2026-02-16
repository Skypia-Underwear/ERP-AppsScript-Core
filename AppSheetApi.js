/**
 * AppSheet API Gateway for Client Management.
 * Handles registration and updates.
 */

/**
 * Sends client data to AppSheet API.
 * @param {string} encryptedData Base64 encoded JSON string.
 */
function enviarDatosAppSheet(encryptedData) {
    try {
        // Correct base64 decoding for Apps Script
        const decodedBytes = Utilities.base64Decode(encryptedData);
        const decodedString = Utilities.newBlob(decodedBytes).getDataAsString();
        const data = JSON.parse(decodedString);
        
        const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
        const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;
        const tableName = "BD_CLIENTES"; // Specific table for clients

        if (!appId || !accessKey) {
            throw new Error("Credenciales de AppSheet no configuradas en BD_APP_SCRIPT.");
        }

        const action = data.ES_ACTUALIZACION ? "Edit" : "Add";
        const url = `https://api.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`;
        
        // Prepare row data matching the header structure
        const row = {
            "CLIENTE_ID": String(data.CLIENTE_ID),
            "CLASIFICACION": data.CLASIFICACION,
            "NOMBRE_COMPLETO": data.NOMBRE_COMPLETO,
            "CELULAR": String(data.CELULAR),
            "CORREO_ELECTRONICO": data.CORREO_ELECTRONICO,
            "CUIT_DNI": String(data.CUIT_DNI || ""),
            "CONDICION_FISCAL": data.CONDICION_FISCAL || "Consumidor Final",
            "TIPO_ENVIO": data.TIPO_ENVIO,
            "AGENCIA_ENVIO": data.AGENCIA_ENVIO || "",
            "CODIGO_POSTAL": data.CODIGO_POSTAL, // Use number if provided by frontend
            "PROVINCIA": data.PROVINCIA || "",
            "MUNICIPIO": data.MUNICIPIO || "",
            "LOCALIDAD": data.LOCALIDAD || "",
            "CALLE": data.CALLE || "",
            "NUMERO": data.NUMERO, // Use number/string as provided
            "PISO": String(data.PISO || ""),
            "DEPARTAMENTO": String(data.DEPARTAMENTO || ""),
            "OBSERVACION": data.OBSERVACION || ""
        };

        const requestBody = {
            "Action": action,
            "Properties": { "Locale": "es-AR", "Timezone": "SA Western Standard Time" },
            "Rows": [row]
        };

        const options = {
            method: 'post',
            contentType: 'application/json',
            headers: { 'ApplicationAccessKey': accessKey },
            payload: JSON.stringify(requestBody),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        const responseCode = response.getResponseCode();
        const responseBody = response.getContentText();

        debugLog(`[AppSheet Client ${action}] Response Code: ${responseCode}`);
        
        if (responseCode !== 200) {
            debugLog(`❌ Error AppSheet: ${responseBody}`);
            return false;
        }

        const result = JSON.parse(responseBody);
        
        debugLog(`✅ AppSheet ${action} exitoso. Procediendo a registrar Auditoría...`, true);
        
        // Log auditing - AppSheet Bot Trigger
        registrarLogFormulario(row.CLIENTE_ID, row.CORREO_ELECTRONICO, action === "Add" ? "Registro" : "Actualización");

        // Force write before returning
        SpreadsheetApp.flush();

        return true;

    } catch (e) {
        debugLog(`❌ Exception in enviarDatosAppSheet: ${e.message}`);
        return false;
    }
}

/**
 * Fetches client data from BD_CLIENTES sheet.
 */
function obtenerDatosCliente(clienteId, correoElectronico) {
    try {
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.CLIENTS || "BD_CLIENTES");
        if (!sheet) throw new Error("Hoja BD_CLIENTES no encontrada.");

        const data = convertirRangoAObjetos(sheet);
        
        // Search by ID and Email (Double verification for updates)
        const client = data.find(c => 
            String(c.CLIENTE_ID).trim() === String(clienteId).trim() && 
            String(c.CORREO_ELECTRONICO).toLowerCase().trim() === String(correoElectronico).toLowerCase().trim()
        );

        if (!client) return null;

        // Return as array to maintain compatibility with External_Analysis logic
        return [client];

    } catch (e) {
        debugLog(`❌ Error en obtenerDatosCliente: ${e.message}`);
        return null;
    }
}

/**
 * Returns available shipping agencies.
 */
function getAgenciasEnvio() {
    try {
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.SHIPPING_AGENCIES || "BD_AGENCIAS_ENVIO");
        if (!sheet) return [];

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) return [];

        // Assume first column contains agency names
        return data.slice(1).map(row => row[0]).filter(name => name);
    } catch (e) {
        debugLog(`❌ Error en getAgenciasEnvio: ${e.message}`);
        return [];
    }
}

/**
 * Fetches store configuration for dynamic branding and Terms & Conditions.
 */
function getStoreConfig() {
    try {
        const ss = getActiveSS();
        const sheetTiendas = ss.getSheetByName(SHEETS.STORES || "BD_TIENDAS");
        const sheetConfig = ss.getSheetByName(SHEETS.GENERAL_CONFIG || "BD_CONFIGURACION_GENERAL");

        if (!sheetTiendas) throw new Error("Hoja BD_TIENDAS no encontrada.");

        // Using helper from Main.js
        const tiendasData = convertirRangoAObjetos(sheetTiendas);
        const configData = sheetConfig ? convertirRangoAObjetos(sheetConfig) : [{}];

        const mainStore = tiendasData[0] || {};
        const mainConfig = configData[0] || {};

        const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME;
        const sheetName = SHEETS.STORES || "BD_TIENDAS";
        let logoFile = mainStore.LOGOTIPO || "";

        // Construct Logo URL using AppSheet's template format
        let logoUrl = "";
        if (logoFile) {
            // FIX: If logoFile already contains the TableName_Images prefix, don't prepend it
            const prefix = `${sheetName}_Images/`;
            if (!logoFile.startsWith(prefix)) {
                logoFile = prefix + logoFile;
            }
            
            logoUrl = `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(sheetName)}&fileName=${encodeURIComponent(logoFile)}`;
        }

        return {
            logoUrl: logoUrl,
            tienda: mainStore.TIENDA_ID || "Nuestra Tienda",
            direccion: mainStore.DIRECCION || "",
            telefono: mainStore.CELULAR || mainStore.TELEFONO || "",
            cuit: mainConfig.CUIT || "",
            responsable: mainConfig.RESPONSABLE || "",
            email: mainStore.CORREO_ELECTRONICO || "",
            web: mainConfig.SITIO_WEB || ""
        };

    } catch (e) {
        debugLog(`❌ Error en getStoreConfig: ${e.message}`);
        return {
            logoUrl: "",
            tienda: "ERP System"
        };
    }
}

/**
 * Records an audit entry in BD_FORMULARIO_CLIENTE via AppSheet API.
 * This MUST use the API (not appendRow) to trigger AppSheet Automation Bots.
 */
function registrarLogFormulario(clienteId, email, gestion) {
    debugLog(`--- Iniciando Registro de Auditoría vía API para ${clienteId} ---`, true);
    try {
        const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
        const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;
        const tableName = "BD_FORMULARIO_CLIENTE";

        if (!appId || !accessKey) {
            throw new Error("Credenciales de AppSheet no configuradas.");
        }

        const url = `https://api.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`;
        
        // Prepare Log Data
        const logRow = {
            "LOG_ID": Utilities.getUuid(),
            "CLIENTE_ID": String(clienteId),
            "CORREO_ELECTRONICO": email,
            "GESTION": gestion,
            "FECHA_HORA": Utilities.formatDate(new Date(), "GMT-3", "M/d/yyyy HH:mm:ss")
        };

        const requestBody = {
            "Action": "Add",
            "Properties": { "Locale": "es-AR", "Timezone": "SA Western Standard Time" },
            "Rows": [logRow]
        };

        const options = {
            method: 'post',
            contentType: 'application/json',
            headers: { 'ApplicationAccessKey': accessKey },
            payload: JSON.stringify(requestBody),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        const responseCode = response.getResponseCode();
        const responseBody = response.getContentText();

        if (responseCode === 200) {
            debugLog(`✅ Audit Log API success: ${clienteId} (${gestion})`, true);
        } else {
            debugLog(`❌ Audit Log API Error (${responseCode}): ${responseBody}`, true);
        }

    } catch (e) {
        debugLog(`❌ Exception in registrarLogFormulario API: ${e.message}`, true);
    }
}
