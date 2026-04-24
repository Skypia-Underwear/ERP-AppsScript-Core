/**
 * =====================================================================================
 * ARCHIVO: CatalogManager.js
 * RESPONSABILIDAD: Motor de Catálogo Único Optimizado (V4.0)
 * Reestablece la estabilidad del catálogo único integrando AssetManager para iconos.
 * =====================================================================================
 */

/**
 * Publicación Principal (Orquestador).
 */
function publicarCatalogo() {
    if (!isSystemInWorkingHours()) return { success: true, message: "Modo nocturno activo." };
    
    console.log("📦 [CatalogManager] Iniciando generación de catálogo único...");
    const catalogData = generarCatalogoJsonTPV();
    
    // 1. Respaldo en Drive
    guardarRespaldoEnDrive(catalogData);
    
    // 2. Sincronización Blogger (Legacy)
    try { 
        if (typeof blogger_regenerarCacheConfiguracion === 'function') {
            blogger_regenerarCacheConfiguracion(); 
        }
    } catch(e){
        console.warn("⚠️ Error en sincronización Blogger: " + e.message);
    }

    // 3. Despacho Remoto (Donweb + GitHub)
    tpv_ejecutarDespachoRemoto(catalogData);
    
    return { success: true, message: "Catálogo Único Publicado con Éxito." };
}

/**
 * Genera el JSON completo del catálogo para el TPV.
 * Integra URLs de CDN para iconos vía AssetManager.
 */
function generarCatalogoJsonTPV() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Carga de Componentes
    const categories = tpv_cargarCategorias(ss);
    const stores = tpv_cargarTiendas(ss);
    const clients = tpv_cargarClientes(ss);
    const paymentMethods = tpv_cargarMetodosPago(ss);
    const transferAccounts = tpv_cargarCuentasTransferencia(ss);
    const generalConfig = tpv_cargarConfiguracionGeneral(ss);
    const priceConfig = tpv_obtenerPriceConfig(ss);

    // 2. Carga Enriquecida de Productos y Variedades
    const varietiesRaw = tpv_cargarVariedadesPrecios(ss); 
    const inventoryRaw = tpv_cargarVariacionesStock(ss);
    const products = tpv_cargarProductosFinales(ss, varietiesRaw, inventoryRaw);

    // 3. Ensamblado Final (Jerarquía 1:1)
    return {
        generated_at: new Date().toISOString(),
        timestamp_ms: Date.now(),
        stores: stores,
        categories: categories,
        products: products,
        clients: clients,
        paymentMethods: paymentMethods.list,
        paymentIcons: paymentMethods.icons,
        transferAccounts: transferAccounts,
        generalConfig: generalConfig,
        priceConfig: priceConfig,
        // Mapa de búsqueda rápida para el Shell
        categoryMap: categories.reduce((acc, c) => { acc[c.id.toUpperCase()] = c; return acc; }, {})
    };
}

/**
 * Carga productos integrando sus variedades y stock.
 */
function tpv_cargarProductosFinales(ss, varietiesRaw, inventoryRaw) {
    const sheet = ss.getSheetByName(SHEETS.PRODUCTS);
    if (!sheet) return [];
    const data = convertirRangoAObjetos(sheet);
    
    return data.map(row => {
        const pid = row.CODIGO_ID || row.PRODUCTO_ID;
        if (!pid) return null;

        return {
            sku: pid,
            nombre: row.MODELO || row.NOMBRE || "Sin Nombre",
            category: row.CATEGORIA || "",
            brand: row.MARCA || "",
            gender: row.GENERO || "",
            image: row.URL_IMAGEN || row.IMAGEN_PRINCIPAL || "",
            variations: inventoryRaw.mapByProduct[pid] || [],
            prices: varietiesRaw.mapByProduct[pid] || []
        };
    }).filter(p => p !== null);
}

/**
 * Carga categorías inyectando URLs de CDN.
 */
function tpv_cargarCategorias(ss) {
    const sheet = ss.getSheetByName(SHEETS.CATEGORIES);
    if (!sheet) return [];
    return convertirRangoAObjetos(sheet).map(row => {
        const id = row.ID || row.CATEGORIA_ID;
        // Inyección de AssetManager (CDN GitHub)
        const iconUrl = (typeof asset_getUrlParaIcono === 'function') ? asset_getUrlParaIcono(id) : "";
        
        return { 
            id: id, 
            name: row.CATEGORIA || row.NOMBRE || id, 
            parent: row.PADRE || "GENERAL",
            iconUrl: iconUrl
        };
    });
}

/**
 * Cargadores de Soporte
 */
function tpv_cargarTiendas(ss) {
    const sheet = ss.getSheetByName(SHEETS.STORES);
    if (!sheet) return [];
    return convertirRangoAObjetos(sheet);
}

function tpv_cargarClientes(ss) {
    const sheet = ss.getSheetByName(SHEETS.CLIENTS);
    if (!sheet) return [];
    return convertirRangoAObjetos(sheet).slice(0, 100);
}

function tpv_cargarMetodosPago(ss) {
    const sheet = ss.getSheetByName(SHEETS.METODOS_PAGO);
    const list = [], icons = {};
    if (!sheet) return { list, icons };
    convertirRangoAObjetos(sheet).forEach(row => {
        const id = row.METODO_ID || row.CODIGO || "";
        list.push(row);
        icons[id] = (typeof asset_getUrlParaIcono === 'function') ? asset_getUrlParaIcono(id) : "";
    });
    return { list, icons };
}

function tpv_cargarCuentasTransferencia(ss) {
    const sheet = ss.getSheetByName(SHEETS.DATOS_TRANSFERENCIA);
    return sheet ? convertirRangoAObjetos(sheet) : [];
}

function tpv_cargarConfiguracionGeneral(ss) {
    const sheet = ss.getSheetByName(SHEETS.GENERAL_CONFIG);
    if (!sheet) return {};
    const config = {};
    const data = convertirRangoAObjetos(sheet);
    data.forEach(row => { if (row.CLAVE) config[row.CLAVE] = row.VALOR; });
    return config;
}

function tpv_obtenerPriceConfig(ss) {
    const config = tpv_cargarConfiguracionGeneral(ss);
    return {
        moneda: config.MONEDA || "$",
        impuestos: parseFloat(config.IMPUESTOS) || 0,
        tipoVenta: config.MODO_VENTA || "MINORISTA"
    };
}

function tpv_cargarVariedadesPrecios(ss) {
    const sheet = ss.getSheetByName(SHEETS.PRODUCT_VARIETIES);
    const mapByProduct = {};
    if (!sheet) return { mapByProduct };
    convertirRangoAObjetos(sheet).forEach(row => {
        const pid = row.PRODUCTO_ID;
        if (!pid) return;
        if (!mapByProduct[pid]) mapByProduct[pid] = [];
        mapByProduct[pid].push(row);
    });
    return { mapByProduct };
}

function tpv_cargarVariacionesStock(ss) {
    const sheet = ss.getSheetByName(SHEETS.INVENTORY);
    const mapByProduct = {};
    if (!sheet) return { mapByProduct };
    convertirRangoAObjetos(sheet).forEach(row => {
        const pid = row.PRODUCTO_ID;
        if (!pid) return;
        if (!mapByProduct[pid]) mapByProduct[pid] = [];
        mapByProduct[pid].push(row);
    });
    return { mapByProduct };
}

/**
 * INFRAESTRUCTURA DE DESPACHO
 */

function tpv_ejecutarDespachoRemoto(catalogData) {
    const fileName = tpv_obtenerBaseNameCatalogo();
    
    // Throttling para estabilidad de red
    Utilities.sleep(1000);
    subirArchivoADonweb(catalogData, fileName);
    
    Utilities.sleep(1000);
    subirArchivoAGitHub(catalogData, fileName);
}

function guardarRespaldoEnDrive(catalogData) {
    const folderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;
    if (!folderId) return;
    const fileName = tpv_obtenerBaseNameCatalogo();
    const content = JSON.stringify(catalogData, null, 2);
    
    try {
        const folder = DriveApp.getFolderById(folderId);
        const files = folder.getFilesByName(fileName);
        if (files.hasNext()) {
            drive_updateFileContent(files.next().getId(), content);
        } else {
            folder.createFile(fileName, content, "application/json");
        }
    } catch (e) {
        console.error("❌ Error respaldo Drive: " + e.message);
    }
}

function tpv_obtenerBaseNameCatalogo() {
    return (GLOBAL_CONFIG.APPSHEET.APP_NAME || "default").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() + "-catalog-tpv.json";
}

function subirArchivoADonweb(jsonData, fileName) {
    const url = GLOBAL_CONFIG.DONWEB.WRITE_URL;
    if (!url || url.includes("tudominio")) return;

    try {
        const res = UrlFetchApp.fetch(url, {
            method: "POST",
            contentType: "application/json",
            payload: JSON.stringify({ fileName: fileName, data: jsonData }),
            muteHttpExceptions: true
        });
        
        if (res.getResponseCode() === 200) {
            console.log(`✅ Donweb: '${fileName}' publicado.`);
        } else {
            console.error(`❌ Donweb Error '${fileName}': ${res.getContentText().substring(0, 100)}`);
        }
    } catch (e) {
        console.error(`❌ Donweb Crash '${fileName}': ${e.message}`);
    }
}

function subirArchivoAGitHub(jsonData, fileName) {
    const user = GLOBAL_CONFIG.GITHUB.USER, repo = GLOBAL_CONFIG.GITHUB.REPO, token = GLOBAL_CONFIG.GITHUB.TOKEN;
    if (!user || !repo || !token) return;

    try {
        const url = `https://api.github.com/repos/${user}/${repo}/contents/${fileName}`;
        let sha = null;
        const existing = UrlFetchApp.fetch(url, { headers: { "Authorization": "token " + token }, muteHttpExceptions: true });
        if (existing.getResponseCode() === 200) sha = JSON.parse(existing.getContentText()).sha;

        const res = UrlFetchApp.fetch(url, {
            method: "put", contentType: "application/json", headers: { "Authorization": "token " + token },
            payload: JSON.stringify({ 
                message: "Update Catalog " + new Date().toISOString(), 
                content: Utilities.base64Encode(JSON.stringify(jsonData, null, 2), Utilities.Charset.UTF_8), 
                sha: sha 
            }),
            muteHttpExceptions: true
        });
        
        if (res.getResponseCode() === 200 || res.getResponseCode() === 201) {
            console.log(`✅ GitHub: '${fileName}' actualizado.`);
        } else {
            console.error(`❌ GitHub Error '${fileName}': ${res.getContentText().substring(0, 100)}`);
        }
    } catch (e) {
        console.error(`❌ GitHub Crash '${fileName}': ${e.message}`);
    }
}

/**
 * Función para ejecución manual desde el editor.
 */
function manualForceModularPublication() {
    return publicarCatalogo();
}

function _computeJsonHash(obj) {
    const raw = JSON.stringify(obj);
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw, Utilities.Charset.UTF_8);
    return digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
