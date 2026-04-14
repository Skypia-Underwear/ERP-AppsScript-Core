/**
 * =====================================================================================
 * ARCHIVO: AppSheetApi.js
 * RESPONSABILIDAD: Gestión de integraciones con la API REST de AppSheet.
 * VERSIÓN: 4.0 (Smart Cache & Global Audit Ready)
 * =====================================================================================
 */

/**
 * Envía datos de cliente a AppSheet API para registro o actualización.
 * @param {string} encryptedData Cadena JSON codificada en Base64.
 */
function enviarDatosAppSheet(encryptedData) {
    try {
        const decodedBytes = Utilities.base64Decode(encryptedData);
        const decodedString = Utilities.newBlob(decodedBytes).getDataAsString();
        const data = JSON.parse(decodedString);
        
        const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
        const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;
        const tableName = "BD_CLIENTES";

        if (!appId || !accessKey) {
            throw new Error("Credenciales de AppSheet no configuradas en BD_APP_SCRIPT.");
        }

        const action = data.ES_ACTUALIZACION ? "Edit" : "Add";
        const url = `https://api.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`;
        
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
            "CODIGO_POSTAL": data.CODIGO_POSTAL, 
            "PROVINCIA": data.PROVINCIA || "",
            "MUNICIPIO": data.MUNICIPIO || "",
            "LOCALIDAD": data.LOCALIDAD || "",
            "CALLE": data.CALLE || "",
            "NUMERO": data.NUMERO,
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

        debugLog(`✅ AppSheet ${action} exitoso. Procediendo a registrar Auditoría...`, true);
        
        registrarLogFormulario(row.CLIENTE_ID, row.CORREO_ELECTRONICO, action === "Add" ? "Registro" : "Actualización");

        SpreadsheetApp.flush();
        return true;

    } catch (e) {
        debugLog(`❌ Exception in enviarDatosAppSheet: ${e.message}`);
        return false;
    }
}

/**
 * Obtiene datos de cliente desde la hoja BD_CLIENTES.
 */
function obtenerDatosCliente(clienteId, correoElectronico) {
    try {
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.CLIENTS || "BD_CLIENTES");
        if (!sheet) throw new Error("Hoja BD_CLIENTES no encontrada.");

        const data = convertirRangoAObjetos(sheet);
        
        const client = data.find(c => 
            String(c.CLIENTE_ID).trim() === String(clienteId).trim() && 
            String(c.CORREO_ELECTRONICO).toLowerCase().trim() === String(correoElectronico).toLowerCase().trim()
        );

        if (!client) return null;
        return [client];

    } catch (e) {
        debugLog(`❌ Error en obtenerDatosCliente: ${e.message}`);
        return null;
    }
}

/**
 * Retorna las agencias de envío disponibles.
 */
function getAgenciasEnvio() {
    try {
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.SHIPPING_AGENCIES || "BD_AGENCIAS_ENVIO");
        if (!sheet) return [];

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) return [];

        const mS = HeaderManager.getMapping("STORES") || { TIENDA_ID: 0 };
        return data.slice(1).map(row => row[mS.TIENDA_ID]).filter(name => name);
    } catch (e) {
        debugLog(`❌ Error en getAgenciasEnvio: ${e.message}`);
        return [];
    }
}

/**
 * Obtiene la configuración de la tienda para branding dinámico.
 */
function getStoreConfig() {
    try {
        const ss = getActiveSS();
        const sheetTiendas = ss.getSheetByName(SHEETS.STORES || "BD_TIENDAS");
        const sheetConfig = ss.getSheetByName(SHEETS.GENERAL_CONFIG || "BD_CONFIGURACION_GENERAL");

        if (!sheetTiendas) throw new Error("Hoja BD_TIENDAS no encontrada.");

        const tiendasData = convertirRangoAObjetos(sheetTiendas);
        const configData = sheetConfig ? convertirRangoAObjetos(sheetConfig) : [{}];

        const mainStore = tiendasData[0] || {};
        const mainConfig = configData[0] || {};

        const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME;
        const sheetName = SHEETS.STORES || "BD_TIENDAS";
        let logoFile = mainStore.LOGOTIPO || "";

        let logoUrl = "";
        if (logoFile) {
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
        return { logoUrl: "", tienda: "ERP System" };
    }
}

/**
 * Registra una entrada de auditoría en BD_FORMULARIO_CLIENTE vía API.
 */
function registrarLogFormulario(clienteId, email, gestion) {
    try {
        const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
        const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;
        const tableName = "BD_FORMULARIO_CLIENTE";

        if (!appId || !accessKey) return;

        const url = `https://api.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`;
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

        UrlFetchApp.fetch(url, options);

    } catch (e) {
        debugLog(`❌ Exception in registrarLogFormulario API: ${e.message}`);
    }
}

/**
 * Busca un registro específico en una tabla de AppSheet vía API (Acción Find).
 * Implementa Smart Catch para evitar Error 429 y optimizar cuotas por 6 horas.
 * @param {string} tableName Nombre de la tabla en AppSheet.
 * @param {string} keyColumn Nombre de la columna clave.
 * @param {string} keyValue Valor de la clave a buscar.
 * @param {boolean} forceLocal Si es true, omite la API y va directo a la Hoja Física.
 * @returns {Object|null} El registro encontrado o null.
 */
function appsheet_findRecord(tableName, keyColumn, keyValue, forceLocal = false) {
    if (!keyValue) return null;
    
    const cacheKey = `appapi_${tableName}__${keyValue}`.replace(/\s/g, "_");
    const breakerKey = "appapi_breaker_active";
    const cache = CacheService.getScriptCache();
    
    try {
        // 1. Verificación en Caché (Prioridad Máxima: 0 consumo de cuota)
        const cachedData = cache.get(cacheKey);
        if (cachedData) return JSON.parse(cachedData);

        // 2. Gestión de Circuit Breaker y Modo Local
        const breakerActive = cache.get(breakerKey);
        if (forceLocal || breakerActive) {
            if (breakerActive) debugLog("⚠️ Circuit Breaker Activo (AppSheet API pausada). Usando Hoja Física.");
            return appsheet_findRecord_PhysicalFallback(tableName, keyColumn, keyValue);
        }

        const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
        const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;
        if (!appId || !accessKey) return appsheet_findRecord_PhysicalFallback(tableName, keyColumn, keyValue);

        const url = `https://api.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`;
        const requestBody = {
            "Action": "Find",
            "Properties": { "Locale": "es-AR", "Timezone": "SA Western Standard Time" },
            "Rows": [{ [keyColumn]: String(keyValue) }]
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

        if (responseCode === 429) {
            debugLog("🚨 Error 429 detectado. Activando Circuit Breaker (10 min).");
            cache.put(breakerKey, "true", 600); // Bloqueo por 10 minutos
            return appsheet_findRecord_PhysicalFallback(tableName, keyColumn, keyValue);
        }

        if (responseCode !== 200) {
            debugLog(`⚠️ AppSheet API Error (${responseCode}). Fallback a Hoja Física.`);
            return appsheet_findRecord_PhysicalFallback(tableName, keyColumn, keyValue);
        }

        const result = JSON.parse(responseBody);
        let record = null;
        
        if (Array.isArray(result) && result.length > 0) {
            record = result[0];
        } else if (result.Rows && Array.isArray(result.Rows) && result.Rows.length > 0) {
            record = result.Rows[0];
        }

        // 3. Persistencia en Caché por 6 horas
        if (record) {
            cache.put(cacheKey, JSON.stringify(record), 21600);
        }

        return record || appsheet_findRecord_PhysicalFallback(tableName, keyColumn, keyValue);

    } catch (e) {
        debugLog(`❌ Exception in appsheet_findRecord API: ${e.message}. Intentando fallback.`);
        return appsheet_findRecord_PhysicalFallback(tableName, keyColumn, keyValue);
    }
}

/**
 * Realiza una búsqueda manual en el Spreadsheet como respaldo de la API.
 */
function appsheet_findRecord_PhysicalFallback(tableName, keyColumn, keyValue) {
    try {
        const ss = getActiveSS();
        // Mapear el nombre de la tabla de AppSheet a la hoja física si es necesario
        const alias = (tableName === "BD_CLIENTES") ? "CLIENTS" : (SHEETS[tableName] ? tableName : null);
        const sheetName = alias ? (SHEETS[alias] || tableName) : tableName;
        
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return null;

        const data = convertirRangoAObjetos(sheet);
        const record = data.find(row => String(row[keyColumn]).trim() === String(keyValue).trim());
        
        if (record) {
            debugLog(`✅ Fallback Físico exitoso para ${keyValue} en ${sheetName}.`);
        }
        return record || null;
    } catch (e) {
        debugLog(`❌ Fallback Físico fallido: ${e.message}`);
        return null;
    }
}
