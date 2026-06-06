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
 * Registra una entrada de auditoría en la hoja de logs del formulario de clientes.
 * Intenta realizar el guardado vía API REST de AppSheet para disparar automatizaciones/bots.
 * Si la API falla o excede cuotas, registra el error en DEBUG_LOGS, alerta por Telegram (incluyendo
 * dinámicamente el nombre del ERP), y realiza un fallback escribiendo directamente en la hoja de 
 * cálculo para no perder datos.
 */
function registrarLogFormulario(clienteId, email, gestion) {
    const tableName = "BD_FORMULARIO_CLIENTE";
    const tz = Session.getScriptTimeZone() || "GMT-3";
    const fechaHoraIso = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
    const logId = Utilities.getUuid();
    
    // Obtener dinámicamente el nombre de la App / ERP
    const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME || "ERP_CORE";

    const logRow = {
        "LOG_ID": logId,
        "CLIENTE_ID": String(clienteId),
        "CORREO_ELECTRONICO": email,
        "GESTION": gestion,
        "FECHA_HORA": fechaHoraIso
    };

    try {
        const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
        const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;

        if (!appId || !accessKey) {
            throw new Error("Credenciales de AppSheet no configuradas (APP_ID o ACCESS_KEY en blanco).");
        }

        const url = `https://api.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`;
        
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

        debugLog(`📡 [${appName}] [registrarLogFormulario] Intentando registrar auditoría vía API AppSheet...`);
        
        const response = UrlFetchApp.fetch(url, options);
        const responseCode = response.getResponseCode();
        const responseBody = response.getContentText();

        if (responseCode === 200) {
            debugLog(`✅ [${appName}] [registrarLogFormulario] Auditoría guardada con éxito vía API en '${tableName}'. Bots activados.`, true);
            return true;
        } else {
            throw new Error(`API respondió con código ${responseCode}: ${responseBody}`);
        }

    } catch (e) {
        const errorMsg = `⚠️ [${appName}] [registrarLogFormulario] Falló registro vía API: ${e.message}`;
        debugLog(errorMsg);
        
        // Notificar al desarrollador por Telegram sobre el fallo de la API incluyendo el AppName
        try {
            notificarTelegramSalud(
                `⚠️ <b>Fallo en Registro de Auditoría (AppSheet API)</b>\n` +
                `💻 <b>ERP:</b> ${appName}\n` +
                `👤 <b>Cliente:</b> ${clienteId}\n` +
                `⚙️ <b>Gestión:</b> ${gestion}\n` +
                `❌ <b>Error:</b> ${e.message}\n\n` +
                `<i>Se procederá con la escritura directa en Google Sheets como respaldo.</i>`, 
                "WARN"
            );
        } catch (tgError) {
            console.error("No se pudo enviar alerta de Telegram: " + tgError.message);
        }

        // --- FALLBACK: Escritura local directa en la hoja de cálculo para proteger los datos ---
        try {
            const ss = getActiveSS();
            if (!ss) throw new Error("No se pudo obtener la hoja de cálculo activa.");

            // Buscar la hoja física por alias oficial o nombre directo
            let sheetName = SHEETS.CLIENT_FORM_LOG || "BD_CLIENT_FORM_LOG";
            let sheet = ss.getSheetByName(sheetName);
            
            if (!sheet) {
                sheetName = "BD_FORMULARIO_CLIENTE";
                sheet = ss.getSheetByName(sheetName);
            }

            if (!sheet) {
                throw new Error(`Hoja física no encontrada (se buscó '${SHEETS.CLIENT_FORM_LOG}' y 'BD_FORMULARIO_CLIENTE')`);
            }

            // Obtener el mapeo de columnas dinámico
            const mapping = HeaderManager.getMapping("CLIENT_FORM_LOG") || {
                "LOG_ID": 0, "CLIENTE_ID": 1, "CORREO_ELECTRONICO": 2, "GESTION": 3, "FECHA_HORA": 4
            };

            const lastCol = Math.max(sheet.getLastColumn(), 5);
            const rowData = new Array(lastCol).fill("");

            if (mapping.LOG_ID !== undefined) rowData[mapping.LOG_ID] = logId;
            if (mapping.CLIENTE_ID !== undefined) rowData[mapping.CLIENTE_ID] = String(clienteId);
            if (mapping.CORREO_ELECTRONICO !== undefined) rowData[mapping.CORREO_ELECTRONICO] = email;
            if (mapping.GESTION !== undefined) rowData[mapping.GESTION] = gestion;
            if (mapping.FECHA_HORA !== undefined) rowData[mapping.FECHA_HORA] = fechaHoraIso;

            sheet.appendRow(rowData);
            SpreadsheetApp.flush();
            
            debugLog(`✅ [${appName}] [registrarLogFormulario Fallback] Log guardado directamente en la hoja física '${sheet.getName()}' debido a fallas de API.`, true);
            return true;

        } catch (localError) {
            debugLog(`❌ [${appName}] [registrarLogFormulario Crítico] Falló también el fallback de escritura local: ${localError.message}`);
            return false;
        }
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

/**
 * Crea un producto en AppSheet a través de la API REST.
 * Opcionalmente también inserta la imagen asociada en BD_PRODUCTO_IMAGENES.
 */
function appsheet_crearProducto(productData) {
  try {
    const appId = GLOBAL_CONFIG.APPSHEET.APP_ID;
    const accessKey = GLOBAL_CONFIG.APPSHEET.ACCESS_KEY;
    
    if (!appId || !accessKey) {
      throw new Error("Credenciales de AppSheet no configuradas.");
    }

    const fechaSync = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT-3", "yyyy-MM-dd HH:mm:ss");

    // Normalización de género para cumplir estrictamente con los Enums de AppSheet (Hombre, Mujer, Unisex)
    let generoNormalizado = String(productData.GENERO || "").trim();
    const generoUpper = generoNormalizado.toUpperCase();
    if (generoUpper === "FEMENINO" || generoUpper === "MUJER") {
      generoNormalizado = "Mujer";
    } else if (generoUpper === "MASCULINO" || generoUpper === "HOMBRE") {
      generoNormalizado = "Hombre";
    } else if (generoUpper === "UNISEX") {
      generoNormalizado = "Unisex";
    } else {
      generoNormalizado = "Unisex"; // Default seguro
    }

    const ss = getActiveSS();
    const sheetProducts = ss.getSheetByName(SHEETS.PRODUCTS || "BD_PRODUCTOS");
    const mappingProd = HeaderManager.getMapping("PRODUCTS");
    
    let existingRowIdx = -1;
    let finalCodigoId = String(productData.CODIGO_ID).trim().toUpperCase();
    
    if (sheetProducts && mappingProd) {
      const dataProds = sheetProducts.getDataRange().getValues();
      const colCode = mappingProd.CODIGO_ID !== undefined ? mappingProd.CODIGO_ID : 0;
      const colSku = mappingProd.SKU !== undefined ? mappingProd.SKU : 3;
      const colModelo = mappingProd.MODELO !== undefined ? mappingProd.MODELO : 9;
      
      const skuBuscado = normalizeSku(productData.SKU);
      const codeBuscado = String(productData.CODIGO_ID || "").trim().toUpperCase();
      const modeloBuscado = normalizeModelName(productData.MODELO);
      
      let fuzzyMatchRow = -1;
      let fuzzyMatchCode = "";
      
      for (let r = 1; r < dataProds.length; r++) {
        const currentCode = String(dataProds[r][colCode]).trim().toUpperCase();
        const currentSku = normalizeSku(dataProds[r][colSku]);
        const currentModelo = normalizeModelName(dataProds[r][colModelo]);
        
        // Búsqueda robusta por SKU de WhatsApp o por Código ID
        if ((skuBuscado && currentSku === skuBuscado) || (codeBuscado && currentCode === codeBuscado)) {
          existingRowIdx = r + 1;
          finalCodigoId = currentCode;
          break;
        }
        
        // Coincidencia fuzzy como fallback por modelo normalizado
        if (modeloBuscado && currentModelo === modeloBuscado) {
          fuzzyMatchRow = r + 1;
          fuzzyMatchCode = currentCode;
        }
      }
      
      if (existingRowIdx === -1 && fuzzyMatchRow !== -1) {
        existingRowIdx = fuzzyMatchRow;
        finalCodigoId = fuzzyMatchCode;
        debugLog(`[AppSheetApi] Coincidencia fuzzy encontrada por modelo para "${productData.MODELO}" en fila ${existingRowIdx}. Asignando código existente ${finalCodigoId}.`);
      }
    }

    if (existingRowIdx === -1) {
      // 1. Insertar en BD_PRODUCTOS (Omitiendo WOO_ID, CARPETA_ID, DESCRIPCION_IA y otros no insertables/calculados)
      const urlProd = `https://api.appsheet.com/api/v2/apps/${appId}/tables/BD_PRODUCTOS/Action`;
      
      // Preservar precisión de SKU prependeando comilla simple para que Google Sheets lo guarde como Texto Plano
      let finalSku = String(productData.SKU || "").trim();
      if (finalSku && !finalSku.startsWith("'")) {
        finalSku = "'" + finalSku;
      }
      
      const prodRow = {
        "CODIGO_ID": finalCodigoId,
        "CATEGORIA_PADRE": productData.CATEGORIA_PADRE || "",
        "CATEGORIA": productData.CATEGORIA || "",
        "SKU": finalSku,
        "TEMPORADA": productData.TEMPORADA || "",
        "GENERO": generoNormalizado,
        "MARCA": productData.MARCA || "",
        "MODELO": productData.MODELO || "",
        "ESTILO": productData.ESTILO || "",
        "MATERIAL": productData.MATERIAL || "",
        "TALLES": productData.TALLES || "Surtido",
        "COLORES": productData.COLORES || "Surtido",
        "DESCRIPCION_IA": productData.DESCRIPCION_IA || "", // Novedad: Enviado de forma síncrona en el payload gracias a que el usuario habilitó su edición en AppSheet
        "PRECIO_COSTO": parseFloat(productData.PRECIO_COSTO) || 0,
        "RECARGO_MENOR": parseFloat(productData.RECARGO_MENOR) || 0,
        "ESTADO_SINCRONIZACION": "PENDIENTE",
        "ULTIMA_ACTUALIZACION": fechaSync
      };

      const payloadProd = {
        "Action": "Add",
        "Properties": { "Locale": "es-AR", "Timezone": "SA Western Standard Time" },
        "Rows": [prodRow]
      };

      const optionsProd = {
        method: 'post',
        contentType: 'application/json',
        headers: { 'ApplicationAccessKey': accessKey },
        payload: JSON.stringify(payloadProd),
        muteHttpExceptions: true
      };

      const responseProd = UrlFetchApp.fetch(urlProd, optionsProd);
      if (responseProd.getResponseCode() !== 200) {
        throw new Error("Error de API de AppSheet en BD_PRODUCTOS: " + responseProd.getContentText());
      }
      
      debugLog(`[AppSheetApi] Producto ${finalCodigoId} creado con éxito a través de la API.`);
    } else {
      debugLog(`[AppSheetApi] Producto existente encontrado en fila ${existingRowIdx} con código ${finalCodigoId}. Omitiendo creación y ejecutando actualizaciones.`);
    }

    // 1.5 Si es un producto EXISTENTE (ya registrado), actualizar los metadatos modificados directamente en la Sheet.
    if (existingRowIdx !== -1 && sheetProducts && mappingProd) {
      // A. Actualizar descripción si viene en el payload
      if (productData.DESCRIPCION_IA) {
        try {
          const colDesc = mappingProd.DESCRIPCION_IA !== undefined ? mappingProd.DESCRIPCION_IA : mappingProd.DESCRIPCION;
          if (colDesc !== undefined) {
            sheetProducts.getRange(existingRowIdx, colDesc + 1).setValue(productData.DESCRIPCION_IA);
            debugLog(`[AppSheetApi] Descripción de producto existente guardada directamente en Sheet en fila ${existingRowIdx} para ${finalCodigoId}`);
          }
        } catch (sheetErr) {
          console.error("Error al escribir descripción en Sheet: " + sheetErr.message);
        }
      }

      // B. Actualizar PRECIO_COSTO para gatillar los bots de AppSheet
      if (productData.PRECIO_COSTO !== undefined) {
        try {
          const colCosto = mappingProd.PRECIO_COSTO;
          if (colCosto !== undefined) {
            const oldVal = parseFloat(sheetProducts.getRange(existingRowIdx, colCosto + 1).getValue()) || 0;
            const newVal = parseFloat(productData.PRECIO_COSTO) || 0;

            if (oldVal !== newVal) {
              sheetProducts.getRange(existingRowIdx, colCosto + 1).setValue(newVal);
              sheetProducts.getRange(existingRowIdx, mappingProd.ULTIMA_ACTUALIZACION + 1).setValue(fechaSync);
              debugLog(`[AppSheetApi] PRECIO_COSTO de producto existente actualizado en fila ${existingRowIdx} para ${finalCodigoId}: $${oldVal} -> $${newVal}. (Disparará bot de AppSheet)`);
            } else {
              debugLog(`[AppSheetApi] PRECIO_COSTO sin cambios para ${finalCodigoId} ($${newVal}). Omisión de escritura.`);
            }
          }
        } catch (costoErr) {
          console.error("Error al escribir precio de costo en Sheet: " + costoErr.message);
        }
      }
    }

    // 2. Si tiene payload de imagen Base64 o URL de WhatsApp, guardarla directamente en Drive
    if (productData.imageUrl) {
      try {
        const folder = obtenerOCrearCarpetaProducto(finalCodigoId);
        if (folder) {
          // A. Conservamos tu lógica de protección original: Si la carpeta ya contiene cualquier archivo (imagen o vídeo), evitamos la descarga para no sobreescribir con fotos comprimidas de WhatsApp.
          const hasFiles = folder.getFiles().hasNext();
          
          if (!hasFiles) {
            const fileName = `${finalCodigoId}_01.jpg`;
            let blob = null;
            
            // B. Robustecimiento: Analizador Base64 tolerante a MIME-Types genéricos de Meta (application/octet-stream, text/plain)
            if (productData.imageUrl.startsWith("data:")) {
              const parts = productData.imageUrl.split(",");
              const base64Data = parts[1];
              let contentType = parts[0].split(";")[0].split(":")[1] || "image/jpeg";
              
              // Normalizar MIME-Types genéricos o corruptos de Meta en RAM a image/jpeg
              if (contentType === "application/octet-stream" || contentType === "text/plain") {
                contentType = "image/jpeg";
              }
              
              const decodedBytes = Utilities.base64Decode(base64Data);
              blob = Utilities.newBlob(decodedBytes, contentType, fileName);
              debugLog(`[AppSheetApi] Imagen de WhatsApp Base64 decodificada localmente con éxito para ${finalCodigoId} (${contentType})`);
            } else if (productData.imageUrl.startsWith("http")) {
              // C. Descarga tradicional por HTTP (WooCommerce / Blogger / CDN no encriptado)
              const imgResponse = UrlFetchApp.fetch(productData.imageUrl, { muteHttpExceptions: true });
              if (imgResponse.getResponseCode() === 200) {
                blob = imgResponse.getBlob().setName(fileName);
                debugLog(`[AppSheetApi] Imagen por URL HTTP descargada con éxito para ${finalCodigoId}`);
              } else {
                debugLog(`[AppSheetApi] Error HTTP ${imgResponse.getResponseCode()} al descargar la imagen por URL.`);
              }
            }
            
            if (blob) {
              folder.createFile(blob);
              
              // D. Sincronizar imágenes nativas
              sincronizarImagenes(finalCodigoId);
              debugLog(`[AppSheetApi] Sincronización maestra de imágenes finalizada para ${finalCodigoId}`);
            }
          } else {
            debugLog(`[AppSheetApi] La carpeta de Drive para ${finalCodigoId} ya contiene imágenes. Omitiendo descarga de referencia de WhatsApp.`);
          }
        }
      } catch (imgErr) {
        console.error("Error al procesar y sincronizar imagen Base64/URL: " + imgErr.message);
      }
    }

    return { success: true, updated: (existingRowIdx !== -1), codigoId: finalCodigoId };
  } catch (e) {
    console.error("Error en appsheet_crearProducto: " + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Normaliza un SKU limpiando espacios, comillas simples iniciales y manejando notación científica.
 */
function normalizeSku(sku) {
  if (sku === null || sku === undefined) return "";
  let s = String(sku).trim();
  if (s.startsWith("'")) {
    s = s.substring(1);
  }
  // Detectar y convertir notación científica (ej: 2.62975847698751e+17)
  if (/^[+-]?[0-9.]+[eE][+-]?[0-9]+$/.test(s)) {
    try {
      s = BigInt(Math.round(Number(s))).toString();
    } catch (e) {
      s = Number(s).toFixed(0);
    }
  }
  return s.toUpperCase();
}

/**
 * Normaliza el nombre de un modelo/título para comparaciones difusas (remueve espacios, puntuaciones y emojis).
 */
function normalizeModelName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/[\s\-_.\(\)\[\]\{\}]/g, "")
    .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF]/g, ""); // remove emojis
}
