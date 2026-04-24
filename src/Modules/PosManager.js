/**
 * ARCHIVO: PosManager.js
 * LÓGICA DEL PUNTO DE VENTA (TPV) Y SINCRONIZACIÓN DE CATÁLOGO
 */

/**
 * Sincroniza el catálogo JSON con Google Drive.
 * Utiliza los IDs configurados en GLOBAL_CONFIG.DRIVE.
 */
/**
 * PASO 1: Persistencia Local (Obligatorio).
 * Guarda una copia del catálogo en Google Drive.
 */
function guardarRespaldoEnDrive() {
    return executeWithRetry(() => {
        try {
            const folderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;
            let fileId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FILE_ID;

            if (!folderId) throw new Error("ID de carpeta JSON no configurado.");

            const catalogo = generarCatalogoJsonTPV();
            // Eliminamos timestamp_ms volátil para favorecer hash estable. 
            // La frescura la determinará subirArchivoAGitHub/Donweb solo si cambia la data.
            const content = JSON.stringify(catalogo, null, 2);
            const fileName = GLOBAL_CONFIG.GITHUB.FILE_PATH || "catalog-tpv.json";

            let file;
            if (fileId) {
                try {
                    file = DriveApp.getFileById(fileId);
                    drive_updateFileContent(fileId, content, MimeType.PLAIN_TEXT);
                    debugLog(`✅ Backup en Drive actualizado vía ID (${fileId}).`);
                } catch (errId) {
                    debugLog("⚠️ ID de archivo inválido, buscando por nombre...");
                    fileId = null;
                }
            }

            if (!fileId) {
                const folder = DriveApp.getFolderById(folderId);
                const files = folder.getFilesByName(fileName);
                if (files.hasNext()) {
                    file = files.next();
                    drive_updateFileContent(file.getId(), content, MimeType.PLAIN_TEXT);
                    debugLog(`✅ Backup en Drive actualizado por nombre (${fileName}).`);
                } else {
                    file = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
                    debugLog(`✅ Nuevo backup en Drive creado (${fileName}).`);
                }
            }

            return { success: true, fileId: file.getId() };

        } catch (e) {
            debugLog("❌ Error en respaldo Drive: " + e.message);
            if (e.message.includes("Drive")) throw e;
            return { success: false, message: e.message };
        }
    }, 3);
}

/**
 * Obtiene el catálogo JSON directamente desde el respaldo en Google Drive.
 * Esto es mucho más rápido para el ERP y evita problemas de CORS.
 */
function tpv_obtenerCatalogoDesdeDrive() {
    try {
        const fileId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FILE_ID;
        let content = null;

        if (fileId) {
            try {
                const file = DriveApp.getFileById(fileId);
                content = file.getBlob().getDataAsString();
                debugLog("🚀 [TPV] Catálogo cargado por ID desde Drive.");
            } catch (err) {
                debugLog("⚠️ ID de catálogo no encontrado, buscando backup...");
            }
        }

        if (!content) {
            const folderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;
            const fileName = GLOBAL_CONFIG.GITHUB.FILE_PATH || "catalog-tpv.json";
            if (!folderId) throw new Error("ID de carpeta JSON no configurado.");

            const folder = DriveApp.getFolderById(folderId);
            const files = folder.getFilesByName(fileName);
            if (files.hasNext()) {
                content = files.next().getBlob().getDataAsString();
                debugLog("🚀 [TPV] Catálogo cargado por nombre desde Drive.");
            }
        }

        if (content) {
            const catalog = JSON.parse(content);
            return { success: true, catalog: catalog };
        } else {
            throw new Error("Archivo de catálogo no encontrado en Drive. Por favor, 'Actualiza el Catálogo' primero.");
        }
    } catch (e) {
        debugLog("⚠️ Fallo lectura de catálogo desde Drive: " + e.message);
        return { success: false, message: e.message };
    }
}

/**
 * Genera el archivo JSON del catálogo para el TPV adaptado a la estructura ERP actual.
 * Incluye mapeo de imágenes desde BD_PRODUCTO_IMAGENES.
 */
function generarCatalogoJsonTPV() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const catalogo = {
        generated_at: new Date().toISOString(),
        stores: {},
        colors: {},
        categories: [],
        products: [],
        priceConfig: {
            tipoRegistroPrecio: "PRECIO + RECARGO ESTANDAR",
            tipoRegistroProducto: "PRODUCTO VARIABLE"
        }
    };

    try {
        // 1. Mapear TIENDAS (BD_TIENDAS)
        const sheetTiendas = ss.getSheetByName(SHEETS.STORES);
        if (!sheetTiendas) throw new Error(`No se encuentra la hoja de tiendas (${SHEETS.STORES})`);

        const tiendasData = convertirRangoAObjetos(sheetTiendas);
        tiendasData.forEach(t => {
            catalogo.stores[t.TIENDA_ID] = {
                name: t.TIENDA_ID,
                address: t.DIRECCION || "",
                phone: t.CELULAR || t.TELEFONO || "",
                policies: t.SOBRE_NOSOTROS || "",
                logoUrl: t.LOGOTIPO || "",
                qrData: t.QR_DATA || "",
                config: {
                    minorSurcharge: parseFloat(t.RECARGO_MENOR || 0),
                    minimumPurchase: parseInt(t.COMPRA_MINIMA || 0),
                    saleMode: t.MODO_VENTA || "BOTONES DE FILTRADO",
                    allowedPaymentMethods: (t.METODOS_PAGO || "").split(',').map(m => m.trim()).filter(m => m !== ""),
                    printerIp: t.IP_IMPRESORA_LOCAL || "127.0.0.1",
                    printSettings: {
                        copias: t.CANTIDAD_COPIAS || 1,
                        sonido: t.ACTIVAR_SONIDO ? "1" : "0",
                        marketing: t.MENSAJE_MARKETING || "",
                        minCupon: parseFloat(t.MONTO_MINIMO_CUPON || 0)
                    }
                }
            };
        });

        // 2. Mapear COLORES (BD_COLORES)
        const sheetColores = ss.getSheetByName(SHEETS.COLORS);
        if (sheetColores) {
            const coloresData = convertirRangoAObjetos(sheetColores);
            coloresData.forEach(c => {
                catalogo.colors[c.COLOR_ID] = {
                    hex: c.HEXADECIMAL || "cccccc",
                    textEdge: c.TEXTO || "Negro"
                };
            });
        }

        // 3. Mapear CATEGORÍAS (BD_CATEGORIAS)
        const sheetCats = ss.getSheetByName(SHEETS.CATEGORIES);
        const svgIdToNameMap = {}; // SVG_ID -> NOMBRE_LIMPIO
        const sheetSvg = ss.getSheetByName(SHEETS.SVG_GALLERY);
        if (sheetSvg) {
            const dataSvg = convertirRangoAObjetos(sheetSvg);
            dataSvg.forEach(s => { 
                if (s.SVG_ID) {
                    // Si tiene NOMBRE, lo limpiamos, si no usamos el ID
                    const nombreLimpio = s.NOMBRE ? String(s.NOMBRE).trim().toLowerCase().replace(/\s+/g, "_") : String(s.SVG_ID).trim().toLowerCase();
                    svgIdToNameMap[s.SVG_ID] = nombreLimpio;
                }
            });
        }

        if (sheetCats) {
            const catsData = convertirRangoAObjetos(sheetCats);
            catalogo.categories = catsData.map(c => {
                const rawIcon = c.ICONO || c.CATEGORIA_ID;
                // Si el valor es un ID de la galería, lo traducimos al nombre del archivo
                const sid = svgIdToNameMap[rawIcon] || rawIcon;
                return {
                    id: c.CATEGORIA_ID,
                    name: c.CATEGORIA_ID,
                    iconUrl: asset_getUrlParaIcono(sid)
                };
            });
        }

        // 4. Mapear IMÁGENES (BD_PRODUCTO_IMAGENES) para catálogo
        const thumbMap = new Map();
        const sheetImg = ss.getSheetByName(SHEETS.PRODUCT_IMAGES);
        if (sheetImg) {
            const dataImg = convertirRangoAObjetos(sheetImg);
            dataImg.forEach(img => {
                const sku = String(img.PRODUCTO_ID);
                const isPortada = String(img.PORTADA).toUpperCase() === 'TRUE';
                const url = img.THUMBNAIL_URL || img.URL;
                if (!url) return;

                // Prioridad Portada, luego la primera que aparezca
                if (!thumbMap.has(sku) || isPortada) {
                    thumbMap.set(sku, url);
                }
            });
        }

        // 4.1 Mapear Iconos de Categoría (Para filtros laterales)
        const categorySvgs = {}; // NOMBRE_CATEGORIA -> URL_CDN
        if (sheetCats) {
            const catsData = convertirRangoAObjetos(sheetCats);
            catsData.forEach(c => {
                const catName = String(c.CATEGORIA_ID || "").trim();
                const rawIcon = c.ICONO || catName;
                const sid = svgIdToNameMap[rawIcon] || rawIcon;
                if (catName) {
                    categorySvgs[catName.toUpperCase()] = asset_getUrlParaIcono(sid);
                }
            });
        }
        catalogo.categorySvgs = categorySvgs;

        // 4.2 Leer CONFIGURACIÓN GLOBAL (BD_CONFIGURACION_GENERAL)
        const sheetConfig = ss.getSheetByName(SHEETS.GENERAL_CONFIG);
        if (sheetConfig) {
            const configData = convertirRangoAObjetos(sheetConfig);
            if (configData.length > 0) {
                const cfg = configData[0]; // Solo hay 1 fila de configuración
                catalogo.generalConfig = cfg; // Guardamos todo el objeto para acceso dinámico
                catalogo.priceConfig = {
                    tipoRegistroPrecio: String(cfg.TIPO_REGISTRO_PRECIO || "PRECIO + RECARGO ESTANDAR").trim(),
                    tipoRegistroProducto: String(cfg.TIPO_REGISTRO_PRODUCTO || "PRODUCTO VARIABLE").trim()
                };
            }
        }

        // 4.3 Mapear VARIEDADES DE PRECIO (BD_VARIEDAD_PRODUCTOS)
        const varietiesByProduct = {};
        const allVarietiesMap = {}; // Para el TPV (visibilidad TRUE)
        const sheetVariedades = ss.getSheetByName(SHEETS.PRODUCT_VARIETIES);
        if (sheetVariedades) {
            const variedadesData = convertirRangoAObjetos(sheetVariedades);
            variedadesData.forEach(v => {
                const pid = String(v.PRODUCTO_ID || "").trim();
                if (!pid) return;
                
                const varietyObj = {
                    variedad_id: String(v.VARIEDAD_ID || v.VARIATION_ID || "").trim(),
                    nombre: String(v.VARIEDAD || v.TIPO_PRECIO || "").trim(),
                    precio_unitario: parseFloat(v.PRECIO_UNITARIO || v.PRECIO_VARIEDAD || 0),
                    cantidad_minima: parseInt(v.CANTIDAD_MINIMA || 1)
                };

                if (!varietiesByProduct[pid]) varietiesByProduct[pid] = [];
                varietiesByProduct[pid].push(varietyObj);

                // Solo para TPV si visibilidad es TRUE
                if (String(v.VISIBILIDAD_TIENDA).toUpperCase() === "TRUE") {
                    if (!allVarietiesMap[pid]) allVarietiesMap[pid] = [];
                    allVarietiesMap[pid].push(varietyObj);
                }
            });
        }
        catalogo.allVarieties = allVarietiesMap;

        // 4.4 Mapear CLIENTES (BD_CLIENTES) - Lista mínima
        const sheetClientes = ss.getSheetByName(SHEETS.CLIENTS);
        catalogo.clients = sheetClientes ? convertirRangoAObjetos(sheetClientes).map(c => ({
            id: c.CLIENTE_ID,
            name: c.NOMBRE_COMPLETO
        })) : [];

        // 4.5 Mapear MÉTODOS DE PAGO (BD_METODOS_PAGO)
        const sheetPagos = ss.getSheetByName(SHEETS.METODOS_PAGO);
        const metodosPagoIcons = {};
        catalogo.paymentMethods = sheetPagos ? convertirRangoAObjetos(sheetPagos).map(p => {
            let val = String(p.PORCENTAJE || "0").replace("%", "").replace(",", ".");
            let numeric = parseFloat(val);
            const percent = (numeric >= 1) ? numeric / 100 : numeric;
            const methodId = p.METODO_PAGO || p.MOVIMIENTO_ID || "Desconocido";
            const sid = svgIdToNameMap[methodId] || methodId;
            
            const iconUrl = asset_getUrlParaIcono(sid);
            metodosPagoIcons[methodId] = {
                porcentaje: percent,
                iconUrl: iconUrl
            };

            return { id: methodId, percent: percent, code: p.MOVIMIENTO_ID, iconUrl: iconUrl };
        }) : [];
        catalogo.metodosPagoIcons = metodosPagoIcons;

        // 4.6 Mapear CUENTAS DE TRANSFERENCIA (BD_DATOS_TRANSFERENCIA)
        const sheetTransfe = ss.getSheetByName(SHEETS.DATOS_TRANSFERENCIA);
        catalogo.transferAccounts = sheetTransfe ? convertirRangoAObjetos(sheetTransfe).map(t => ({
            id: t.CUENTA_ID,
            alias: t.ALIAS,
            name: t.NOMBRE_CUENTA
        })) : [];

        // 5. Mapear PRODUCTOS (BD_PRODUCTOS) y VARIACIONES (BD_INVENTARIO)
        const sheetProductos = ss.getSheetByName(SHEETS.PRODUCTS);
        const sheetInventario = ss.getSheetByName(SHEETS.INVENTORY);

        if (sheetProductos && sheetInventario) {
            const productosData = convertirRangoAObjetos(sheetProductos);
            const inventarioData = convertirRangoAObjetos(sheetInventario);

            const variacionesPorProducto = {};
            inventarioData.forEach(item => {
                const pid = String(item.PRODUCTO_ID).trim();
                const color = String(item.COLOR).trim();
                const size = String(item.TALLE).trim();
                const store = String(item.TIENDA_ID).trim();

                // Generar un ID Único consistente
                const vId = `${pid}-${color}-${size}-${store}`;

                if (!variacionesPorProducto[pid]) variacionesPorProducto[pid] = [];
                variacionesPorProducto[pid].push({
                    color: color,
                    size: size,
                    store_id: store,
                    variation_id: vId
                });
            });

            catalogo.products = productosData
                .filter(p => p.CODIGO_ID && String(p.CODIGO_ID).trim() !== "")
                .map(p => {
                    const pid = p.CODIGO_ID;
                    const pVarieties = varietiesByProduct[String(pid)] || [];
                    const pVariations = variacionesPorProducto[pid] || [];

                    // Precio base: se usa para modos ESTANDAR y PERSONALIZADO.
                    // En modo PRECIO VARIABLE, el precio viene de cada variety.precio_unitario.
                    // Para mostrar en la tarjeta en modo VARIABLE, usamos el menor precio de variedad.
                    let displayPrice = parseFloat(p.PRECIO_COSTO || 0);
                    if (pVarieties.length > 0) {
                        const minVarietyPrice = Math.min(...pVarieties.map(v => v.precio_unitario).filter(Boolean));
                        if (minVarietyPrice > 0) displayPrice = minVarietyPrice;
                    }

                    return {
                        id: pid,
                        model: p.MODELO || "",
                        price: parseFloat(p.PRECIO_COSTO || 0),      // Precio costo base (ESTANDAR/PERSONALIZADO)
                        display_price: displayPrice,                  // Precio a mostrar en tarjeta
                        minor_surcharge: parseFloat(p.RECARGO_MENOR || 0),
                        category_id: p.CATEGORIA || "",
                        categoryName: p.CATEGORIA || "",
                        parentCategory: p.CATEGORIA_PADRE || p.CATEGORIA_GENERAL || "",
                        season: p.TEMPORADA || "",
                        gender: p.GENERO || "",
                        brand: p.MARCA || "",
                        style: p.ESTILO || "",
                        material: p.MATERIAL || "",
                        image: thumbMap.get(String(pid)) || "",
                        carpeta_id: p.CARPETA_ID || "",
                        woo_id: p.WOO_ID || "",
                        varieties: pVarieties,     // Variedades de precio (BD_VARIEDAD_PRODUCTOS)
                        variations: pVariations    // Variaciones de inventario (color/talle)
                    };
                });
        }

        debugLog("✅ Catálogo JSON TPV generado con éxito (incluye imágenes).");
        return catalogo;

    } catch (e) {
        debugLog("❌ Error generando catálogo JSON: " + e.message);
        throw e;
    }
}

/**
 * Crea o actualiza el objeto de caché que mapea el Row ID (INVENTARIO_ID) a Stock.
 */
/**
 * Guarda datos en el caché de forma fragmentada (Chucks) para evadir el límite de 100KB.
 */
function _saveChunkedCache(key, data, ttl = 600) {
    const cache = CacheService.getScriptCache();
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    const chunkSize = 90 * 1024; // 90KB por seguridad
    const chunks = [];

    for (let i = 0; i < jsonStr.length; i += chunkSize) {
        chunks.push(jsonStr.substring(i, i + chunkSize));
    }

    // Guardar fragmentos
    chunks.forEach((chunk, index) => {
        cache.put(`${key}_part_${index}`, chunk, ttl);
    });

    // Guardar metadata (cantidad de fragmentos)
    cache.put(`${key}_meta`, JSON.stringify({ count: chunks.length, timestamp: Date.now() }), ttl);
    return chunks.length;
}

/**
 * Recupera datos del caché fragmentado y los ensambla.
 */
function _getChunkedCache(key) {
    const cache = CacheService.getScriptCache();
    const metaStr = cache.get(`${key}_meta`);
    if (!metaStr) return null;

    const meta = JSON.parse(metaStr);
    let fullStr = "";

    for (let i = 0; i < meta.count; i++) {
        const part = cache.get(`${key}_part_${i}`);
        if (part === null) return null; // Si falta una parte, el caché es inválido
        fullStr += part;
    }

    try {
        return JSON.parse(fullStr);
    } catch (e) {
        return fullStr;
    }
}

/**
 * Crea o actualiza el objeto de caché mapeando Row ID a Stock, segregado por TIENDA_ID.
 */
function generateInventoryCache() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    try {
        const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
        const mapping = HeaderManager.getMapping("INVENTORY");
        if (!inventorySheet || !mapping) throw new Error("No se encuentra la hoja de inventario o el mapeo.");

        const data = inventorySheet.getDataRange().getValues();
        if (data.length <= 1) return { success: true, message: "Inventario vacío." };

        const storesData = {}; // TIENDA_ID -> { vId: stock }
        data.shift(); // Remover headers
        
        const idIndex = mapping["INVENTARIO_ID"];
        const stockIndex = mapping["STOCK_ACTUAL"];
        const storeIndex = mapping["TIENDA_ID"];

        if (idIndex === undefined || stockIndex === undefined || storeIndex === undefined) {
            throw new Error("Faltan columnas clave (ID, STOCK o TIENDA) en INVENTORY.");
        }

        for (const row of data) {
            const vId = String(row[idIndex]).trim();
            const stock = parseInt(row[stockIndex]) || 0;
            const storeId = String(row[storeIndex]).trim();

            if (vId && storeId) {
                if (!storesData[storeId]) storesData[storeId] = {};
                storesData[storeId][vId] = stock;
            }
        }

        // Guardar cada tienda en su propio caché fragmentado
        const stores = Object.keys(storesData);
        stores.forEach(sId => {
            const cacheKey = `STOCK_MAP_STORE_${sId}`;
            _saveChunkedCache(cacheKey, storesData[sId], 600); // 10 min
        });

        debugLog(`📦 [Caché] Inventario fragmentado generado para ${stores.length} tiendas.`, false);
        return { success: true, storesCount: stores.length };

    } catch (e) {
        debugLog("❌ Error al generar caché de inventario: " + e.message);
        return { success: false, message: e.message };
    }
}

/**
 * Actualiza el stock en la hoja de INVENTORY de forma masiva.
 * Ahora incluye la actualización de VENTAS_LOCAL.
 */
function updateInventoryStock(cart) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
    const mapping = HeaderManager.getMapping("INVENTORY");
    if (!inventorySheet || !mapping) throw new Error("Hoja de inventario o mapeo no encontrado.");

    const data = inventorySheet.getDataRange().getValues();
    const idCol = mapping["INVENTARIO_ID"];
    const stockCol = mapping["STOCK_ACTUAL"];
    const ventasCol = mapping["VENTAS_LOCAL"];

    if (idCol === undefined || stockCol === undefined || ventasCol === undefined) {
        throw new Error("No se encontraron columnas ID, STOCK o VENTAS_LOCAL en Inventario.");
    }

    // Crear un mapa de índices para búsqueda O(1)
    const rowMap = {};
    for (let i = 1; i < data.length; i++) {
        const id = String(data[i][idCol]).trim();
        if (id) rowMap[id] = i;
    }

    const updatesMap = {};

    cart.forEach(item => {
        const targetId = item.variation_id;
        const rowIndex = rowMap[targetId];

        if (rowIndex !== undefined) {
            // Actualizar Stock Actual (Resta)
            const currentStock = parseInt(data[rowIndex][stockCol]) || 0;
            const newStock = currentStock - item.quantity;
            data[rowIndex][stockCol] = newStock;

            // Actualizar Ventas Local (Suma)
            const currentVentas = parseInt(data[rowIndex][ventasCol]) || 0;
            data[rowIndex][ventasCol] = currentVentas + item.quantity;

            updatesMap[targetId] = newStock;
        } else {
            debugLog("⚠️ Variación no encontrada en inventario para actualizar: " + targetId);
        }
    });

    inventorySheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    return updatesMap;
}

/**
 * Actualiza la caché del servidor de forma selectiva para las tiendas afectadas.
 */
function updateCacheSelectively(updatesMap) {
    if (!updatesMap || Object.keys(updatesMap).length === 0) return;

    // En el nuevo sistema por tienda, si hay cambios, lo más seguro es forzar la regeneración
    // o identificar qué tiendas fueron afectadas. Para simplificar y dado que es asíncrono en TPV:
    generateInventoryCache();
}

/**
 * Devuelve el mapa de stock desde la caché para una tienda específica.
 */
function getAllStockFromCache(storeId) {
    if (!storeId) {
        // Si no hay storeId, intentamos regenerar todo (fallback)
        generateInventoryCache();
        return { success: false, message: "Se requiere ID de tienda para leer stock." };
    }

    const cacheKey = `STOCK_MAP_STORE_${storeId}`;
    const stockMap = _getChunkedCache(cacheKey);

    if (stockMap) {
        return { success: true, stockMap: stockMap };
    }

    // Si está vacío, regenera todo y vuelve a intentar
    generateInventoryCache();
    const retryMap = _getChunkedCache(cacheKey);
    
    if (retryMap) {
        return { success: true, stockMap: retryMap };
    }

    return { success: false, message: "No se encontró stock para la tienda: " + storeId };
}

/**
 * Fuerza la actualización de la caché desde la hoja real.
 */
function manualRefreshStockCache() {
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(10000)) return { success: false, message: "Servidor ocupado." };
                return generateInventoryCache();
    } catch (e) {
        return { success: false, message: e.message };
    } finally {
        lock.releaseLock();
    }
}

/**
 * FUNCIÓN ORQUESTADORA: Publicación de Catálogo TPV
 * El destino se controla con PUBLICATION_TARGET en BD_APP_SCRIPT:
 *   "AMBOS"  → Donweb + GitHub (máxima redundancia, valor por defecto)
 *   "DONWEB" → Solo Donweb    (instalaciones sin GitHub configurado)
 *   "GITHUB" → Solo GitHub    (instalaciones sin servidor Donweb / sin SITIO_WEB)
 * También dispara la regeneración del caché de Blogger.
 */
function publicarCatalogo() {
    if (!isSystemInWorkingHours()) {
        console.log("💤 [Modo Nocturno] Sincronización suspendida por horario.");
        return { success: true, message: "Suspendido por horario nocturno." };
    }
    // Leer interruptores de destino (separados para TPV y Blogger)
    const target = (GLOBAL_CONFIG.TPV_PUBLICATION_TARGET || "DRIVE").toUpperCase();
    const useDrive = target === "DRIVE" || target === "AMBOS" || target === "DONWEB" || target === "GITHUB"; 
    const useDonweb = target === "DONWEB" || target === "AMBOS";
    const useGitHub = target === "GITHUB" || target === "AMBOS";

    debugLog("🚀 Iniciando publicación TPV (Fase 1 Local) [PUBLICATION_TARGET=" + target + "] Donweb=" + useDonweb + " GitHub=" + useGitHub);

    // 1. PASO 1: Persistencia Local e Intensiva (Obligatorio — Drive siempre)
    // Dentro de guardarRespaldoEnDrive() se llama a generarCatalogoJsonTPV() calculando todo.
    const respaldo = guardarRespaldoEnDrive();
    if (!respaldo.success) {
        return { success: false, message: "Fallo el respaldo obligatorio: " + respaldo.message };
    }

    // 2. PASO 2: Ecosistema Blogger (caché propio + su publicación en su propio thread)
    try {
        if (typeof blogger_regenerarCacheConfiguracion === 'function') {
            blogger_regenerarCacheConfiguracion();
        }
    } catch (e) {
        debugLog("⚠️ Error al desatar caché Blogger (No crítico para TPV): " + e.message);
    }

    // 3. PASO 3: Programar Despacho Remoto asíncronico para saltar el límite de 6 mins
    tpv_programarSubidaRemota();

    return { success: true, message: "Catálogo guardado localmente. Tareas de red despachadas asincrónicamente." };
}

/**
 * Programa la fase secundaria asincrónica para subir a redes (Donweb/GitHub).
 * Esto evita el límite de los 6 minutos de Google Apps Script.
 */
function tpv_programarSubidaRemota() {
    const handler = "tpv_procesarSubidasRemotas";
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(triggers[i]);
    }

    // Instanciar gatillo 1 minuto en el futuro
    ScriptApp.newTrigger(handler)
        .timeBased()
        .after(1 * 60 * 1000)
        .create();

    debugLog("⏳ [TPV Cache] Fase 2 (Subida Red) programada en 1 minuto.");
}

/**
 * Función secundaria asincrónica: Extrae el JSON local de TPV y lo publica.
 */
function tpv_procesarSubidasRemotas() {
    debugLog("🚀 [TPV Cache] Fase 2: Subida remota asincrónica...");

    // Auto-destruir este trigger
    const handler = "tpv_procesarSubidasRemotas";
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(triggers[i]);
    }

    try {
        const target = (GLOBAL_CONFIG.TPV_PUBLICATION_TARGET || "DRIVE").toUpperCase();
        const useDonweb = target === "DONWEB" || target === "AMBOS";
        const useGitHub = target === "GITHUB" || target === "AMBOS";

        const folderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;
        if (!folderId) throw new Error("Falta DRIVE_JSON_CONFIG_FOLDER_ID en la BD");

        const fileName = GLOBAL_CONFIG.GITHUB.FILE_PATH || "hostingshop.json";

        // Lectura de Drive con executeWithRetry para errores transitorios
        const catalogo = executeWithRetry(() => {
            const folder = DriveApp.getFolderById(folderId);
            const files = folder.getFilesByName(fileName);
            if (!files.hasNext()) throw new Error(`JSON local TPV (${fileName}) no encontrado en Drive.`);
            const file = files.next();
            const contenidoStr = file.getBlob().getDataAsString();
            return JSON.parse(contenidoStr);
        }, 3);

        // -- Destino Donweb --
        let resDonweb = { success: false };
        if (useDonweb) {
            resDonweb = subirCatalogoADonweb(catalogo);
            if (resDonweb.success) {
                debugLog("✅ Donweb: catálogo sincronizado.");
            } else {
                debugLog("⚠️ Donweb falló: " + resDonweb.message);
                notificarTelegramSalud("⚠️ TPV Donweb: " + resDonweb.message, "ERROR");
            }
        }

        // -- Destino GitHub --
        let resGitHub = { success: false };
        if (useGitHub) {
            resGitHub = subirCatalogoAGitHub(catalogo);
            if (resGitHub.success) {
                debugLog("✅ GitHub: catálogo sincronizado.");
            } else {
                debugLog("⚠️ GitHub falló: " + resGitHub.message);
                notificarTelegramSalud("⚠️ TPV GitHub: " + resGitHub.message, "ERROR");
            }
        }

        const exito = resDonweb.success || resGitHub.success;
        if (exito) {
            notificarTelegramSalud(
                "📡 Catálogo TPV publicado [" + target + "] " +
                (useDonweb ? "Donweb=" + (resDonweb.success ? "✅" : "❌") + " " : "") +
                (useGitHub ? "GitHub=" + (resGitHub.success ? "✅" : "❌") : ""),
                "EXITO"
            );
        }

    } catch (e) {
        debugLog("❌ [TPV Cache] Error subida remota: " + e.message);
        notificarTelegramSalud("🚨 Error interno en Subidor Remoto TPV: " + e.message, "ERROR");
    }
}

/**
 * Calcula un hash MD5 de un objeto JSON para detectar cambios.
 * Usado internamente para evitar subidas redundantes.
 * @param {Object} jsonData - Objeto a hashear.
 * @returns {string} Hash MD5 en hexadecimal.
 */
function _computeJsonHash(jsonData) {
    // Para que la comparación sea estable, clonamos y eliminamos timestamp_ms si existe
    // Así solo detectamos cambios en el contenido real de los productos.
    const cleanData = JSON.parse(JSON.stringify(jsonData));
    if (cleanData.timestamp_ms) delete cleanData.timestamp_ms;

    const raw = JSON.stringify(cleanData);
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw, Utilities.Charset.UTF_8);
    return digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

/**
 * GENÉRICO: Sube cualquier objeto JSON a GitHub en el path indicado.
 * Reutilizable por PosManager (TPV) y Blogger_Cache.
 * Incluye: Hash Check (evita subidas redundantes) + Circuit Breaker (1h de pausa tras fallos).
 * @param {Object} jsonData  - Objeto a serializar y subir.
 * @param {string} filePath  - Ruta dentro del repo (ej: "catalogo.json" o "blogger_config.json").
 * @returns {{ success: boolean, message: string }}
 */
function subirArchivoAGitHub(jsonData, filePath) {
    const MAX_RETRIES = 3;
    const RETRYABLE_CODES = [409, 500, 502, 503, 504];

    try {
        const cache = CacheService.getScriptCache();
        const breakerKey = "GITHUB_CIRCUIT_BREAKER_" + filePath.replace(/[^a-zA-Z0-9]/g, "_");

        // --- Circuit Breaker: omitir si hay bloqueo activo por fallos continuos ---
        if (cache.get(breakerKey)) {
            debugLog(`⚠️ Pausa preventiva: Envío a GitHub omitido para '${filePath}' (Circuit Breaker activo por fallos continuos).`);
            return { success: false, message: `Envío omitido temporalmente por protección del servidor.` };
        }

        // --- Hash Check Estabilizado: omitir subida si el contenido NO CAMBIÓ ---
        // Se calcula el hash ANTES de inyectar el timestamp dinámico.
        const hashKey = "LAST_DATA_HASH_GITHUB_" + filePath.replace(/[^a-zA-Z0-9]/g, "_");
        const dataHash = _computeJsonHash(jsonData);
        const props = PropertiesService.getScriptProperties();

        if (props.getProperty(hashKey) === dataHash) {
            debugLog("⏭️ GitHub: '" + filePath + "' sin cambios reales en data. Subida omitida.");
            return { success: true, message: "Sin cambios en data, subida omitida." };
        }

        // --- Configuración API GitHub ---
        const user = GLOBAL_CONFIG.GITHUB.USER;
        const repo = GLOBAL_CONFIG.GITHUB.REPO;
        const token = GLOBAL_CONFIG.GITHUB.TOKEN;

        if (!user || !repo || !token) {
            throw new Error("Configuración de GitHub incompleta (User, Repo o Token).");
        }

        const url = `https://api.github.com/repos/${user}/${repo}/contents/${filePath}`;

        // Si hay cambios, actualizamos el timestamp interno para el Frontend
        jsonData.timestamp_ms = Date.now();
        const content = JSON.stringify(jsonData, null, 2);
        const contentBase64 = Utilities.base64Encode(content, Utilities.Charset.UTF_8);

        // Intentar PUT con retry en errores transitorios o de conflicto SHA
        let lastCode = 0;
        let lastBody = "";
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                const waitMs = 2000 * attempt; // 2s, 4s, 6s
                debugLog(`⏳ GitHub retry ${attempt}/${MAX_RETRIES} en ${waitMs / 1000}s...`);
                Utilities.sleep(waitMs);
            }

            // Obtener SHA para actualización dentro del loop para evitar el 409
            let sha = null;
            const headers = { 
                "Authorization": "token " + token,
                "User-Agent": "ERP-AppsScript-Sync"
            };

            const getResponse = UrlFetchApp.fetch(url, {
                method: "get",
                headers: headers,
                muteHttpExceptions: true
            });
            if (getResponse.getResponseCode() === 200) {
                sha = JSON.parse(getResponse.getContentText()).sha;
            }

            const payload = {
                message: "ERP auto-update: " + filePath + " @ " + new Date().toISOString(),
                content: contentBase64
            };
            if (sha) payload.sha = sha;

            const response = UrlFetchApp.fetch(url, {
                method: "put",
                contentType: "application/json",
                headers: headers,
                payload: JSON.stringify(payload),
                muteHttpExceptions: true
            });

            lastCode = response.getResponseCode();
            lastBody = response.getContentText();

            if (lastCode === 200 || lastCode === 201) {
                if (attempt > 0) debugLog(`✅ GitHub: éxito en retry ${attempt}.`);
                props.setProperty(hashKey, dataHash); // Guardamos el hash de la data pura
                debugLog(`✅ GitHub: '${filePath}' subido correctamente (data actualizada).`);
                return { success: true, message: `GitHub '${filePath}' actualizado.` };
            }

            // Solo reintentar en errores transitorios del servidor
            if (!RETRYABLE_CODES.includes(lastCode)) break;
        }

        throw new Error(`GitHub API Error (${lastCode}): ${lastBody}`);
    } catch (e) {
        debugLog("❌ Error GitHub: " + e.message);

        // Activar el Circuit Breaker por 1 hora si falla consistentemente
        try {
            const cache = CacheService.getScriptCache();
            const breakerKey = "GITHUB_CIRCUIT_BREAKER_" + filePath.replace(/[^a-zA-Z0-9]/g, "_");
            cache.put(breakerKey, "true", 3600); // 1 hora de bloqueo
            debugLog(`🛑 Circuit Breaker activado para GitHub '${filePath}' durante 60 minutos.`);
        } catch (cacheErr) {
            // Ignorar errores de cache
        }

        return { success: false, message: e.message };
    }
}

/**
 * Publicación del catálogo TPV vía GitHub API.
 * @param {Object} [catalogoPreGenerado] - Catálogo ya generado (evita recalcular). Si no se pasa, lo genera.
 */
function subirCatalogoAGitHub(catalogoPreGenerado) {
    const path = GLOBAL_CONFIG.GITHUB.FILE_PATH || "catalogo.json";
    const catalogo = catalogoPreGenerado || generarCatalogoJsonTPV();
    return subirArchivoAGitHub(catalogo, path);
}

/**
 * GENÉRICO: Sube cualquier objeto JSON a Donweb con el nombre de archivo indicado.
 * El PHP de destino debe aceptar { fileName, data } y guardar data como fileName.
 * Reutilizable por PosManager (TPV) y Blogger_Cache.
 * @param {Object} jsonData  - Objeto a serializar y subir.
 * @param {string} fileName  - Nombre del archivo a guardar en el servidor (ej: "skypia-catalog-tpv.json").
 * @returns {{ success: boolean, message: string }}
 */
function subirArchivoADonweb(jsonData, fileName) {
    try {
        const cache = CacheService.getScriptCache();
        const breakerKey = "DONWEB_CIRCUIT_BREAKER_" + fileName;

        // --- Circuit Breaker: omitir si hay bloqueo activo por fallos continuos ---
        if (cache.get(breakerKey)) {
            debugLog(`⚠️ Pausa preventiva: Envío a Donweb omitido para '${fileName}' (Circuit Breaker activo por fallos continuos).`);
            return { success: false, message: `Envío omitido temporalmente por protección del servidor.` };
        }

        // --- Hash Check Estabilizado ---
        const hashKey = "LAST_DATA_HASH_DONWEB_" + fileName.replace(/[^a-zA-Z0-9]/g, "_");
        const dataHash = _computeJsonHash(jsonData);
        const props = PropertiesService.getScriptProperties();

        if (props.getProperty(hashKey) === dataHash) {
            debugLog("⏭️ Donweb: '" + fileName + "' sin cambios reales en data. Subida omitida.");
            return { success: true, message: "Sin cambios en data, subida omitida." };
        }

        // Actualizar timestamp solo si la data cambió
        jsonData.timestamp_ms = Date.now();

        const url = GLOBAL_CONFIG.DONWEB.WRITE_URL;
        if (!url) throw new Error("Falta configurar DONWEB_WRITE_URL en BD_APP_SCRIPT.");

        const payload = JSON.stringify({ fileName: fileName, data: jsonData });
        const sizeMB = (payload.length / (1024 * 1024)).toFixed(2);
        const isCriticalSize = payload.length > 2 * 1024 * 1024; // > 2MB

        const MAX_RETRIES = 3;
        const RETRYABLE_CODES = [400, 403, 408, 429, 500, 502, 503, 504];
        let lastCode = 0;
        let lastBody = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                const waitMs = 2000 * attempt;
                debugLog(`⏳ Donweb retry ${attempt}/${MAX_RETRIES} en ${waitMs / 1000}s...`);
                Utilities.sleep(waitMs);
            }

            debugLog(`📤 Enviando a Donweb [${fileName}] (${sizeMB} MB) ${isCriticalSize ? '⚠️ ALTO VOLUMEN' : ''} -> ${url}`);

            const response = UrlFetchApp.fetch(url, {
                method: "post",
                contentType: "application/json",
                payload: payload,
                muteHttpExceptions: true,
                followRedirects: true,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                }
            });

            lastCode = response.getResponseCode();
            lastBody = response.getContentText();

            if (lastCode === 200) {
                if (attempt > 0) debugLog(`✅ Donweb: éxito en retry ${attempt}.`);
                props.setProperty(hashKey, dataHash);
                debugLog(`✅ Donweb: '${fileName}' guardado correctamente.`);
                return { success: true, message: `Donweb '${fileName}' actualizado.` };
            }

            if (!RETRYABLE_CODES.includes(lastCode)) break;
        }

        throw new Error(`HTTP Error (${lastCode}): ${lastBody}`);
    } catch (e) {
        debugLog("❌ Error Donweb: " + e.message);

        // Activar el Circuit Breaker por 1 hora si falla consistentemente
        try {
            const cache = CacheService.getScriptCache();
            const breakerKey = "DONWEB_CIRCUIT_BREAKER_" + fileName;
            cache.put(breakerKey, "true", 3600); // 1 hora de bloqueo
            debugLog(`🛑 Circuit Breaker activado para '${fileName}' durante 60 minutos.`);
        } catch (cacheErr) {
            // Ignorar errores de cache
        }

        return { success: false, message: e.message };
    }
}

/**
 * Publicación del catálogo TPV vía Donweb.
 * Se reutiliza GITHUB_FILE_PATH como nombre porque ambos destinos comparten la misma convención.
 * @param {Object} [catalogoPreGenerado] - Catálogo ya generado (evita recalcular). Si no se pasa, lo genera.
 */
function subirCatalogoADonweb(catalogoPreGenerado) {
    const fileName = GLOBAL_CONFIG.GITHUB.FILE_PATH || "catalog-tpv.json";
    const catalogo = catalogoPreGenerado || generarCatalogoJsonTPV();
    return subirArchivoADonweb(catalogo, fileName);
}

/**
 * Configura el activador para actualizar el TPV cada 15 minutos.
 */
function setupTpvUpdateTrigger() {
    // Eliminar disparadores previos de esta función
    const triggers = ScriptApp.getProjectTriggers();
    const handlersToDelete = ["subirCatalogoAHostExterno", "publicarCatalogo"];

    triggers.forEach(t => {
        if (handlersToDelete.includes(t.getHandlerFunction())) {
            ScriptApp.deleteTrigger(t);
        }
    });

    // Crear nuevo disparador (cada 15 min)
    ScriptApp.newTrigger("publicarCatalogo")
        .timeBased()
        .everyMinutes(15)
        .create();

    debugLog("⏰ Activador de actualización TPV (15 min) configurado.");
    return "Activador configurado cada 15 minutos.";
}

/**
 * Obtiene los datos iniciales necesarios para cargar la interfaz del TPV.
 * @deprecated Los datos estáticos ahora se cargan desde el catálogo JSON.
 * Usar getStoreDynamicStatus para datos volátiles.
 */
function getInitialPosData(managedStoreId, userId) {
    // Redirigimos a la nueva función que solo trae lo necesario
    return getStoreDynamicStatus(managedStoreId, userId);
}

/**
 * Obtiene solo los datos VOLÁTILES necesarios para el TPV (Caja, Sesión).
 * Es mucho más rápido que getInitialPosData.
 */
function getStoreDynamicStatus(managedStoreId, userId) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let activeCashRegisterId = null;

        const sheetCaja = ss.getSheetByName(SHEETS.GESTION_CAJA);
        if (sheetCaja) {
            const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
            const cajas = convertirRangoAObjetos(sheetCaja);
            const cajaAbierta = cajas.find(c =>
                Utilities.formatDate(new Date(c.FECHA), Session.getScriptTimeZone(), "yyyy-MM-dd") === hoy &&
                String(c.ASESOR_ID) === String(userId) &&
                String(c.TIENDA_ID) === String(managedStoreId) &&
                c.ESTADO === "ABIERTA"
            );
            if (cajaAbierta) activeCashRegisterId = cajaAbierta.CAJA_ID;
        }

        const sessionResult = getStoreSessionData(managedStoreId, userId);

        return {
            success: true,
            activeCashRegisterId: activeCashRegisterId,
            session: sessionResult.session || null
        };
    } catch (e) {
        console.error("Error en getStoreDynamicStatus: " + e.message);
        return { success: false, message: e.message };
    }
}

/**
 * Procesa la venta atómica desde el TPV.
 */
function processSale(saleData) {
    const lock = LockService.getScriptLock();
    try {
        if (!lock.tryLock(30000)) throw new Error("Servidor ocupado. Intenta de nuevo.");

        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheetVentas = ss.getSheetByName(SHEETS.VENTAS_PEDIDOS);
        const sheetDetalle = ss.getSheetByName(SHEETS.DETALLE_VENTAS);
        const sheetInventario = ss.getSheetByName(SHEETS.INVENTORY);

        const now = new Date();
        const fechaStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
        const horaStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");

        // --- VALIDACIÓN DE HORARIO ---
        const sessionInfo = getStoreSessionData(saleData.storeId, saleData.userId);
        if (sessionInfo.success && !sessionInfo.session.isWithinSchedule && !saleData.forceSale) {
            const h = sessionInfo.session.horario;
            throw new Error(`VENTA RESTRINGIDA: La tienda ${saleData.storeId} está fuera de su horario de operación (${h.apertura} a ${h.cierre}).`);
        }


        // --- LÓGICA DE CAJA ---
        let activeCashRegisterId = saleData.cashRegisterId;
        const sheetCaja = ss.getSheetByName(SHEETS.GESTION_CAJA);
        
        if (!activeCashRegisterId && sheetCaja) {
            const cashData = convertirRangoAObjetos(sheetCaja);
            const hoy = new Date().toLocaleDateString('es-AR');
            
            const cajaAbierta = cashData.find(c => 
                new Date(c.FECHA).toLocaleDateString('es-AR') === hoy &&
                String(c.ASESOR_ID) === String(saleData.userId) &&
                String(c.TIENDA_ID) === String(saleData.storeId) &&
                c.ESTADO === "ABIERTA"
            );
            
            if (cajaAbierta) {
                activeCashRegisterId = cajaAbierta.CAJA_ID;
            } else {
                activeCashRegisterId = `CR-${Utilities.getUuid()}`;
                const mappingCaja = HeaderManager.getMapping("GESTION_CAJA");
                if (mappingCaja && mappingCaja["CAJA_ID"] !== undefined) {
                    const newRow = new Array(Object.keys(mappingCaja).length).fill('');
                    newRow[mappingCaja["CAJA_ID"]] = activeCashRegisterId;
                    newRow[mappingCaja["TIENDA_ID"]] = saleData.storeId;
                    newRow[mappingCaja["ASESOR_ID"]] = saleData.userId;
                    newRow[mappingCaja["FECHA"]] = now;
                    newRow[mappingCaja["ESTADO"]] = 'ABIERTA';
                    sheetCaja.appendRow(newRow);
                    debugLog(`Nueva caja registradora abierta en TPV: ${activeCashRegisterId}`);
                }
            }
        }
        // --- FIN LÓGICA CAJA ---

        // 1.1 Generar DETALLE_JSON para optimización de Dashboard
        const detalleJson = JSON.stringify({
            detalle: saleData.cart.map(item => ({
                productoId: item.product_id || "",
                nombre: item.model || item.product_id || "Producto",
                cantidad: item.quantity || 0,
                precio: item.price || 0,
                monto: (item.price || 0) * (item.quantity || 0),
                color: item.color || "N/A",
                talle: item.size || "N/A",
                tipoPrecio: item.tipoPrecio || "Estándar",
                variedadId: item.variedad_id || ""
            }))
        });

        // 1.2 Registrar en BD_VENTAS_PEDIDOS (24 columnas físicas + DETALLE_JSON en la 26)
        const ventaRow = [
            saleData.saleId,                    // VENTA_ID
            saleData.storeId,                   // TIENDA_ID
            saleData.userId,                    // ASESOR_ID
            now,                                // FECHA
            horaStr,                            // HORA
            saleData.customerId,                // CLIENTE_ID
            activeCashRegisterId || "",         // CAJA_ID (reemplazando a saleData.cashRegisterId nulo)
            "DIRECTA",                          // TIPO_VENTA
            saleData.minimumPurchaseAmount || 0,// COMPRA_MINIMA
            saleData.isMixedPayment,            // PAGO_MIXTO
            saleData.paymentMethod,             // METODO_PAGO
            saleData.transferAccountId || "",   // DATOS_TRANSFERENCIA
            saleData.deactivateSurcharge,       // DESACTIVAR_RECARGO_TRANSFERENCIA
            saleData.totalProductAmount,        // MONTO_TOTAL_PRODUCTOS
            saleData.cashPaymentAmount,         // PAGO_EFECTIVO
            saleData.subtotal,                  // SUBTOTAL
            saleData.minorSurcharge,            // RECARGO_MENOR
            0,                                  // COSTO_ENVIO
            saleData.transferSurcharge,         // RECARGO_TRANSFERENCIA
            saleData.totalAmount,               // TOTAL_VENTA
            "ENTREGADO",                        // ESTADO
            "",                                 // CAMBIOS
            "",                                 // COMPROBANTE_FILE
            "",                                 // DETALLE_AUDITORIA_IA
            detalleJson                         // 25: DETALLE_JSON
        ];
        sheetVentas.appendRow(ventaRow);

        // 2. Registrar en BD_DETALLE_VENTAS y actualizar Inventario
        saleData.cart.forEach(item => {
            // Para PRECIO VARIABLE, usamos el VARIEDAD_ID como referencia de precio
            const tipoPrecioRegistro = item.tipoPrecio || "Estándar";
            const scanRef = item.variedad_id && item.variedad_id !== ''
                ? item.variedad_id
                : item.variation_id;

            const detalleRow = [
                saleData.saleId,                  // VENTA_ID
                `REG-${Utilities.getUuid()}`,      // REGISTRO_ID
                scanRef,                           // SCAN (variedad_id si PRECIO VARIABLE, si no variation_id)
                item.variation_id,                 // VARIACION_ID
                "",                               // CATEGORIA_PADRE
                item.categoryName,                // CATEGORIA
                "",                               // TEMPORADA
                item.product_id,                  // PRODUCTO_ID
                item.color,                       // COLOR
                item.size,                        // TALLE
                tipoPrecioRegistro,               // TIPO_PRECIO (ej: 'Mayor', 'Menor', 'Curva')
                item.price,                       // PRECIO
                item.quantity,                    // CANTIDAD
                item.price * item.quantity,       // MONTO
                0,                                // INVERSION
                0,                                // GANANCIA
                ""                                // DESCRIPCION_VENTA
            ];
            sheetDetalle.appendRow(detalleRow);
        });

        // 3. Actualizar Inventario y Caché (Lógica TPV Muestra)
        let updatesMap = {};
        try {
            updatesMap = updateInventoryStock(saleData.cart);
            updateCacheSelectively(updatesMap);
            debugLog("📊 Stock actualizado con éxito para la venta: " + saleData.saleId);
        } catch (err) {
            debugLog("⚠️ Error actualizando stock (Venta registrada): " + err.message);
        }

        // 4. Ya no se genera printData en el servidor (Migrado al Frontend)

        return {
            success: true,
            saleId: saleData.saleId,
            cashRegisterId: activeCashRegisterId,
            updatesMap: updatesMap
        };

    } catch (e) {
        debugLog("❌ Error procesando venta TPV: " + e.message);
        notificarTelegramSalud(`❌ Error procesando venta TPV (${saleData.saleId}): ${e.message}`, "ERROR");
        return { success: false, message: e.message };
    } finally {
        lock.releaseLock();
    }
}


/**
 * Limpia físicamente las filas vacías en medio de las hojas de Productos e Inventario.
 * Esto corrige el desfase causado por AppSheet al "eliminar" registros.
 */
function tpv_limpiarFilasVaciasEstructural() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojasCriticas = [SHEETS.PRODUCTS, SHEETS.INVENTORY, SHEETS.PRODUCT_VARIETIES, SHEETS.PRODUCT_IMAGES];
    let totalEliminadas = 0;

    hojasCriticas.forEach(nombreHoja => {
        const sheet = ss.getSheetByName(nombreHoja);
        if (!sheet) return;

        const data = sheet.getDataRange().getValues();
        const mapping = HeaderManager.getMapping(nombreHoja);

        // Determinar columna de ID según la hoja
        let colIdName = "CODIGO_ID";
        if (nombreHoja === SHEETS.INVENTORY) colIdName = "INVENTARIO_ID";
        if (nombreHoja === SHEETS.PRODUCT_VARIETIES) colIdName = "VARIATION_ID";
        if (nombreHoja === SHEETS.PRODUCT_IMAGES) colIdName = "PRODUCTO_ID";

        const colIndex = mapping[colIdName];
        if (colIndex === undefined) return;

        // Recorrer de abajo hacia arriba para no alterar índices al borrar
        for (let i = data.length - 1; i >= 1; i--) { // i >= 1 para saltar header
            const rowValue = String(data[i][colIndex] || "").trim();

            // Si el ID está vacío, verificamos si toda la fila está vacía (por seguridad)
            if (!rowValue) {
                const isEntireRowEmpty = data[i].every(cell => String(cell || "").trim() === "");
                if (isEntireRowEmpty) {
                    sheet.deleteRow(i + 1);
                    totalEliminadas++;
                }
            }
        }
    });

    if (totalEliminadas > 0) {
        debugLog(`🧹 [Limpieza Estructural] Se eliminaron ${totalEliminadas} filas vacías en el centro de las hojas.`);
    }
    return { success: true, eliminadas: totalEliminadas };
}

/**
 * Busca el primer ID de caja abierta para el día actual.
 * @returns {string|null} El CAJA_ID o null si no hay ninguna abierta hoy.
 */
function getCurrentOpenBoxId() {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheetCaja = ss.getSheetByName(SHEETS.GESTION_CAJA);
        if (!sheetCaja) return null;

        const mapping = HeaderManager.getMapping("GESTION_CAJA");
        const data = sheetCaja.getDataRange().getValues();
        const headers = data.shift();

        const hoy = new Date().toLocaleDateString('es-AR');
        
        // Buscamos de abajo hacia arriba para obtener la más reciente
        for (let i = data.length - 1; i >= 0; i--) {
            const row = data[i];
            const fechaCaja = new Date(row[mapping.FECHA]).toLocaleDateString('es-AR');
            const estado = row[mapping.ESTADO];

            if (fechaCaja === hoy && estado === "ABIERTA") {
                return row[mapping.CAJA_ID];
            }
        }
        return null;
    } catch (e) {
        debugLog("Error en getCurrentOpenBoxId: " + e.message);
        return null;
    }
}

/**
 * Obtiene datos específicos de una sesión de tienda (Caja, Horario, etc.)
 */
function getStoreSessionData(storeId, userId) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheetTiendas = ss.getSheetByName(SHEETS.STORES);
        const sheetCaja = ss.getSheetByName(SHEETS.GESTION_CAJA);
        
        let session = {
            storeId: storeId,
            horario: { apertura: "00:00:00", cierre: "23:59:59" },
            activeCashRegisterId: null,
            defaultTransferAccount: null,
            printerIp: "127.0.0.1",
            isWithinSchedule: true
        };

        if (sheetTiendas) {
            const tiendas = convertirRangoAObjetos(sheetTiendas);
            const tienda = tiendas.find(t => t.TIENDA_ID === storeId);
            if (tienda) {
                session.horario = {
                    apertura: tienda.HORA_APERTURA || "10:00:00",
                    cierre: tienda.HORA_CIERRE || "17:00:00"
                };
                session.defaultTransferAccount = tienda.CUENTAS_TRANSFERENCIA || null;
                session.printerIp = tienda.IP_IMPRESORA_LOCAL || "127.0.0.1";
            }
        }

        if (sheetCaja) {
            const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
            const cajas = convertirRangoAObjetos(sheetCaja);
            const cajaAbierta = cajas.find(c =>
                Utilities.formatDate(new Date(c.FECHA), Session.getScriptTimeZone(), "yyyy-MM-dd") === hoy &&
                c.ASESOR_ID === userId &&
                c.TIENDA_ID === storeId &&
                c.ESTADO === "ABIERTA"
            );
            if (cajaAbierta) session.activeCashRegisterId = cajaAbierta.CAJA_ID;
        }

        // Normalizador de hora seguro (garantiza formato HH:mm:ss con padding)
        const normalizeTime = (input) => {
            if (input instanceof Date) {
                return Utilities.formatDate(input, Session.getScriptTimeZone(), "HH:mm:ss");
            }
            if (typeof input === 'string' && input.trim()) {
                const parts = input.split(':');
                if (parts.length >= 2) {
                    const h = parts[0].padStart(2, '0');
                    const m = parts[1].padStart(2, '0');
                    const s = (parts[2] || "00").padStart(2, '0');
                    return `${h}:${m}:${s}`;
                }
            }
            return String(input || "00:00:00");
        };

        const aperturaStr = normalizeTime(session.horario.apertura);
        const cierreStr = normalizeTime(session.horario.cierre);
        
        // Validación de Horario (Local Argentina)
        const now = new Date();
        const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");
        
        session.horario.apertura = aperturaStr;
        session.horario.cierre = cierreStr;

        // Si no hay horario definido (00:00 a 00:00 o similar), permitimos siempre
        if (aperturaStr === cierreStr && aperturaStr === "00:00:00") {
            session.isWithinSchedule = true;
        } else {
            session.isWithinSchedule = (timeStr >= aperturaStr && timeStr <= cierreStr);
        }

        // Bypass Global vía Configuración (Opcional)
        if (GLOBAL_CONFIG.SCRIPT_CONFIG["TPV_ENFORCE_SCHEDULE"] === "FALSE") {
            session.isWithinSchedule = true;
        }

        return { success: true, session: session };

    } catch (e) {
        return { success: false, message: e.message };
    }
}
