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
    try {
        const folderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;
        let fileId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FILE_ID;

        if (!folderId) throw new Error("ID de carpeta JSON no configurado.");

        const folder = DriveApp.getFolderById(folderId);
        const catalogo = generarCatalogoJsonTPV();
        const content = JSON.stringify(catalogo, null, 2);
        const fileName = "hostingshop.json";

        let file;
        if (fileId) {
            try {
                file = DriveApp.getFileById(fileId);
                file.setContent(content);
                debugLog("✅ Respaldo en Drive actualizado.");
            } catch (e) {
                fileId = null;
            }
        }

        if (!fileId) {
            file = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
            debugLog("✅ Nuevo respaldo en Drive creado.");
        }

        return { success: true, fileId: file.getId() };

    } catch (e) {
        debugLog("❌ Error en respaldo Drive: " + e.message);
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
        products: []
    };

    try {
        // 1. Mapear TIENDAS (BD_TIENDAS)
        const sheetTiendas = ss.getSheetByName(SHEETS.STORES);
        if (sheetTiendas) {
            const tiendasData = convertirRangoAObjetos(sheetTiendas);
            tiendasData.forEach(t => {
                catalogo.stores[t.TIENDA_ID] = {
                    name: t.TIENDA_ID,
                    address: t.DIRECCION || "",
                    phone: t.CELULAR || t.TELEFONO || "",
                    policies: t.SOBRE_NOSOTROS || "",
                    logoUrl: t.LOGOTIPO || "",
                    qrData: t.QR_DATA || ""
                };
            });
        }

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
        const svgMap = {}; // ID -> SVG_CODE (Carga anticipada para usar en categorías)
        const sheetSvg = ss.getSheetByName(SHEETS.SVG_GALLERY);
        if (sheetSvg) {
            const dataSvg = convertirRangoAObjetos(sheetSvg);
            dataSvg.forEach(s => { if (s.SVG_ID) svgMap[s.SVG_ID] = s.SVG_CODE; });
        }

        if (sheetCats) {
            const catsData = convertirRangoAObjetos(sheetCats);
            catalogo.categories = catsData.map(c => {
                const sid = c.ICONO || "";
                return {
                    id: c.CATEGORIA_ID,
                    name: c.CATEGORIA_ID,
                    svg: svgMap[sid] || sid
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

        // 4.1 Mapear SVGs (Categorías) por petición del usuario para filtros laterales
        const categorySvgs = {}; // NOMBRE_CATEGORIA -> SVG_CODE
        if (sheetCats) {
            const catsData = convertirRangoAObjetos(sheetCats);
            catsData.forEach(c => {
                const name = String(c.CATEGORIA_ID || "").trim();
                const sid = c.ICONO;
                if (name && sid && svgMap[sid]) {
                    categorySvgs[name.toUpperCase()] = svgMap[sid];
                }
            });
        }
        catalogo.categorySvgs = categorySvgs;

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

            catalogo.products = productosData.map(p => {
                const pid = p.CODIGO_ID;
                return {
                    id: pid,
                    model: p.MODELO || "",
                    price: parseFloat(p.PRECIO_COSTO || 0),
                    minor_surcharge: parseFloat(p.RECARGO_MENOR || 0),
                    category_id: p.CATEGORIA || "",
                    categoryName: p.CATEGORIA || "",
                    parentCategory: p.CATEGORIA_PADRE || "",
                    season: p.TEMPORADA || "",
                    gender: p.GENERO || "",   // Nuevo filtro
                    brand: p.MARCA || "",     // Nuevo filtro
                    style: p.ESTILO || "",     // Nuevo filtro
                    material: p.MATERIAL || "", // Nuevo filtro
                    image: thumbMap.get(String(pid)) || "",
                    carpeta_id: p.CARPETA_ID || "",
                    woo_id: p.WOO_ID || "",    // --- NUEVO: ID de WooCommerce ---
                    variations: variacionesPorProducto[pid] || []
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
function generateInventoryCache() {
    const cache = CacheService.getScriptCache();
    const INVENTORY_CACHE_KEY = 'REAL_TIME_STOCK_MAP';
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    try {
        const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
        const mapping = HeaderManager.getMapping("INVENTORY");
        if (!inventorySheet || !mapping) throw new Error("No se encuentra la hoja de inventario o el mapeo.");

        const data = inventorySheet.getDataRange().getValues();
        if (data.length <= 1) {
            cache.put(INVENTORY_CACHE_KEY, JSON.stringify({}), 300);
            return { success: true, message: "Inventario vacío, caché actualizada." };
        }

        const stockMap = {};
        data.shift(); // Remover headers
        const idIndex = mapping["INVENTARIO_ID"];
        const stockIndex = mapping["STOCK_ACTUAL"];

        if (idIndex === undefined || stockIndex === undefined) {
            throw new Error("Faltan columnas clave (INVENTARIO_ID o STOCK_ACTUAL) en INVENTORY.");
        }

        for (const row of data) {
            const vId = String(row[idIndex]).trim();
            const stock = parseInt(row[stockIndex]) || 0;

            if (vId) {
                stockMap[vId] = stock;
            }
        }

        // Guardamos por 10 minutos (600 segundos)
        cache.put(INVENTORY_CACHE_KEY, JSON.stringify(stockMap), 600);

        // DEBUG LOG: Muestra para el usuario
        const keys = Object.keys(stockMap);
        if (keys.length > 0) {
            const sample = keys.slice(0, 2).map(k => `${k}: ${stockMap[k]}`).join(" | ");
            debugLog("📦 [DEBUG] Inventario Cacheado: " + sample + " ... Total: " + keys.length, true);
        }

        return { success: true, stockMap: stockMap };

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
 * Actualiza la caché del servidor de forma selectiva.
 */
function updateCacheSelectively(updatesMap) {
    if (!updatesMap || Object.keys(updatesMap).length === 0) return;

    const cache = CacheService.getScriptCache();
    const INVENTORY_CACHE_KEY = 'REAL_TIME_STOCK_MAP';
    const lock = LockService.getScriptLock();

    try {
        if (!lock.tryLock(5000)) return;

        let stockMap = {};
        const cachedData = cache.get(INVENTORY_CACHE_KEY);

        if (cachedData) {
            stockMap = JSON.parse(cachedData);
            Object.assign(stockMap, updatesMap);
            cache.put(INVENTORY_CACHE_KEY, JSON.stringify(stockMap), 600);
            debugLog("⚡ [Caché Selectiva] Actualizada para " + Object.keys(updatesMap).length + " ítems.");
        } else {
            generateInventoryCache();
        }

    } catch (e) {
        debugLog("❌ Error en updateCacheSelectively: " + e.message);
    } finally {
        lock.releaseLock();
    }
}

/**
 * Devuelve el mapa de stock desde la caché o lo regenera si está vacío.
 */
function getAllStockFromCache() {
    const cache = CacheService.getScriptCache();
    const INVENTORY_CACHE_KEY = 'REAL_TIME_STOCK_MAP';
    const cachedData = cache.get(INVENTORY_CACHE_KEY);

    if (cachedData) {
        return { success: true, stockMap: JSON.parse(cachedData) };
    }

    // Si está vacío, regenera
    return generateInventoryCache();
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
 * Función para subir el catálogo JSON al servidor externo del usuario (Modelo PUSH).
 */
/**
 * FUNCIÓN ORQUESTADORA: Publicación Selectiva (Respaldo + Publicación Externo)
 */
function publicarCatalogo() {
    debugLog("🚀 Iniciando proceso de Publicación Selectiva...");

    // 1. PASO 1: Persistencia Local (Obligatorio)
    const respaldo = guardarRespaldoEnDrive();
    if (!respaldo.success) {
        return { success: false, message: "Fallo el respaldo obligatorio: " + respaldo.message };
    }

    // 2. PASO 2: Publicación Externo (Condicional)
    const target = (GLOBAL_CONFIG.PUBLICATION_TARGET || "DONWEB").toUpperCase();
    debugLog(`📡 Destino de publicación: ${target}`);

    if (target === "GITHUB") {
        return subirCatalogoAGitHub();
    } else {
        return subirCatalogoADonweb();
    }
}

/**
 * Publicación vía GitHub API
 */
function subirCatalogoAGitHub() {
    try {
        const user = GLOBAL_CONFIG.GITHUB.USER;
        const repo = GLOBAL_CONFIG.GITHUB.REPO;
        const token = GLOBAL_CONFIG.GITHUB.TOKEN;
        const path = GLOBAL_CONFIG.GITHUB.FILE_PATH || "catalogo.json";

        if (!user || !repo || !token) {
            throw new Error("GitHub: Faltan credenciales (USER, REPO o TOKEN)");
        }

        const url = `https://api.github.com/repos/${user}/${repo}/contents/${path}`;
        const catalogo = generarCatalogoJsonTPV();
        const content = JSON.stringify(catalogo, null, 2);
        const contentBase64 = Utilities.base64Encode(content, Utilities.Charset.UTF_8);

        // A. Obtener SHA para actualización
        let sha = null;
        const getOptions = {
            method: "get",
            headers: { "Authorization": "token " + token },
            muteHttpExceptions: true
        };
        const getResponse = UrlFetchApp.fetch(url, getOptions);
        if (getResponse.getResponseCode() === 200) {
            const data = JSON.parse(getResponse.getContentText());
            sha = data.sha;
        }

        // B. Ejecutar el PUT
        const payload = {
            message: "Update catalog from ERP - " + new Date().toISOString(),
            content: contentBase64
        };
        if (sha) payload.sha = sha;

        const putOptions = {
            method: "put",
            contentType: "application/json",
            headers: { "Authorization": "token " + token },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, putOptions);
        const code = response.getResponseCode();

        if (code === 200 || code === 201) {
            debugLog("✅ Sincronización Exitosa con GitHub.");
            return { success: true, message: "GitHub actualizado." };
        } else {
            throw new Error(`GitHub API Error (${code}): ${response.getContentText()}`);
        }
    } catch (e) {
        debugLog("❌ Error GitHub: " + e.message);
        return { success: false, message: e.message };
    }
}

/**
 * Publicación vía Donweb (Legacy Endpoint)
 */
function subirCatalogoADonweb() {
    try {
        const urlDestino = "https://castfer.com.ar/actualizar_json_hostingshop.php";
        const catalogo = generarCatalogoJsonTPV();
        const options = {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(catalogo),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(urlDestino, options);
        if (response.getResponseCode() === 200) {
            debugLog("✅ Sincronización Exitosa con Donweb.");
            return { success: true, message: "Donweb actualizado." };
        } else {
            throw new Error(`HTTP Error: ${response.getResponseCode()}`);
        }
    } catch (e) {
        debugLog("❌ Error Donweb: " + e.message);
        return { success: false, message: e.message };
    }
}

/**
 * Configura el activador para actualizar el TPV cada 5 minutos.
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

    // Crear nuevo disparador (cada 5 min)
    ScriptApp.newTrigger("publicarCatalogo")
        .timeBased()
        .everyMinutes(5)
        .create();

    debugLog("⏰ Activador de actualización TPV (5 min) configurado.");
    return "Activador configurado cada 5 minutos.";
}

/**
 * Obtiene los datos iniciales necesarios para cargar la interfaz del TPV.
 */
function getInitialPosData(managedStoreId, userId) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        // 1. Cargar Clientes
        const sheetClientes = ss.getSheetByName(SHEETS.CLIENTS);
        const clientes = sheetClientes ? convertirRangoAObjetos(sheetClientes).map(c => ({
            id: c.CLIENTE_ID,
            name: c.NOMBRE_COMPLETO
        })) : [];

        // 2. Cargar Métodos de Pago
        const sheetPagos = ss.getSheetByName(SHEETS.METODOS_PAGO);
        const paymentMethods = sheetPagos ? convertirRangoAObjetos(sheetPagos).map(p => {
            let val = String(p.PORCENTAJE || "0").replace(",", ".");
            let numeric = parseFloat(val);
            // Si el valor es > 1 (ej: 10), asumimos que es el % entero. 
            // Si es <= 1 y > 0 (ej: 0.1), asumimos que ya es el decimal de AppSheet/Sheets.
            const percent = (numeric > 1) ? numeric / 100 : numeric;
            return {
                id: p.MOVIMIENTO_ID,
                percent: percent
            };
        }) : [];

        // 3. Cargar Cuentas de Transferencia
        const sheetTransfe = ss.getSheetByName(SHEETS.DATOS_TRANSFERENCIA);
        const transferAccounts = sheetTransfe ? convertirRangoAObjetos(sheetTransfe).map(t => ({
            id: t.CUENTA_ID,
            alias: t.ALIAS,
            name: t.NOMBRE_CUENTA
        })) : [];

        // 4. Buscar Caja Abierta y Datos de Tienda (Impresora, etc.)
        let activeCashRegisterId = null;
        let printerIp = "127.0.0.1";
        let printSettings = {
            copias: 1,
            sonido: "0"
        };

        const sheetCaja = ss.getSheetByName(SHEETS.GESTION_CAJA);
        if (sheetCaja) {
            const hoy = new Date().toLocaleDateString('es-AR');
            const cajas = convertirRangoAObjetos(sheetCaja);
            const cajaAbierta = cajas.find(c =>
                new Date(c.FECHA).toLocaleDateString('es-AR') === hoy &&
                c.ASESOR_ID === userId &&
                c.TIENDA_ID === managedStoreId &&
                c.ESTADO === "ABIERTA"
            );
            if (cajaAbierta) activeCashRegisterId = cajaAbierta.CAJA_ID;
        }

        const sheetTiendas = ss.getSheetByName(SHEETS.STORES);
        let storeConfig = {
            minorSurcharge: 0,
            minimumPurchase: 0,
            saleMode: "BOTONES DE FILTRADO",
            allowedPaymentMethods: []
        };

        if (sheetTiendas) {
            const tiendas = convertirRangoAObjetos(sheetTiendas);
            const tienda = tiendas.find(t => t.TIENDA_ID === managedStoreId);
            if (tienda) {
                printerIp = tienda.IP_IMPRESORA_LOCAL || "127.0.0.1";
                printSettings = {
                    copias: tienda.CANTIDAD_COPIAS || 1,
                    sonido: tienda.ACTIVAR_SONIDO ? "1" : "0",
                    marketing: tienda.MENSAJE_MARKETING || "",
                    minCupon: parseFloat(tienda.MONTO_MINIMO_CUPON || 0)
                };
                storeConfig = {
                    minorSurcharge: parseFloat(tienda.RECARGO_MENOR || 0),
                    minimumPurchase: parseInt(tienda.COMPRA_MINIMA || 0),
                    saleMode: tienda.MODO_VENTA || "BOTONES DE FILTRADO",
                    allowedPaymentMethods: (tienda.METODOS_PAGO || "").split(',').map(m => m.trim()).filter(m => m !== "")
                };
            }
        }

        return {
            success: true,
            customers: clientes,
            paymentMethods: paymentMethods,
            transferAccounts: transferAccounts,
            activeCashRegisterId: activeCashRegisterId,
            printerIp: printerIp,
            printSettings: printSettings,
            storeConfig: storeConfig
        };

    } catch (e) {
        console.error("Error en getInitialPosData: " + e.message);
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

        // 1. Registrar en BD_VENTAS_PEDIDOS (24 columnas)
        const ventaRow = [
            saleData.saleId,                    // VENTA_ID
            saleData.storeId,                   // TIENDA_ID
            saleData.userId,                    // ASESOR_ID
            now,                                // FECHA
            horaStr,                            // HORA
            saleData.customerId,                // CLIENTE_ID
            saleData.cashRegisterId,            // CAJA_ID
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
            ""                                  // DETALLE_AUDITORIA_IA
        ];
        sheetVentas.appendRow(ventaRow);

        // 2. Registrar en BD_DETALLE_VENTAS (18 columnas) y actualizar Inventario
        saleData.cart.forEach(item => {
            const detalleRow = [
                saleData.saleId,                  // VENTA_ID
                `REG-${Utilities.getUuid()}`,      // REGISTRO_ID
                item.variation_id,                // SCAN
                item.variation_id,                // VARIACION_ID
                "",                               // CATEGORIA_PADRE
                item.categoryName,                // CATEGORIA
                "",                               // TEMPORADA
                item.product_id,                  // PRODUCTO_ID
                item.color,                       // COLOR
                item.size,                        // TALLE
                "MENOR",                          // TIPO_PRECIO
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
            updatesMap: updatesMap
        };

    } catch (e) {
        debugLog("❌ Error procesando venta TPV: " + e.message);
        return { success: false, message: e.message };
    } finally {
        lock.releaseLock();
    }
}

