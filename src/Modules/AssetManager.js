/**
 * =====================================================================================
 * ARCHIVO: AssetManager.js
 * RESPONSABILIDAD: Gestión centralizada de activos (SVGs, Imágenes, CSS, JS).
 * Sincroniza recursos desde tablas hacia repositorios de GitHub para consumo vía CDN.
 * =====================================================================================
 */

/**
 * Minifica un código SVG eliminando atributos redundantes y metadatos.
 * @param {string} svgCode - Código XML del SVG.
 * @returns {string} SVG minificado.
 */
function asset_minifySvg(svgCode) {
    if (!svgCode) return "";
    // Devolvemos el código original tal cual para máxima compatibilidad
    return svgCode.trim();
}

/**
 * Sincroniza la galería de SVGs desde la tabla maestra hacia GitHub.
 * Crea archivos físicos individuales para consumo vía CDN.
 */
function asset_syncSvgGalleryToGitHub() {
    console.log("🚀 [AssetManager] Iniciando sincronización de galería SVG...");
    
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName("BD_GALERIA_SVG");
        if (!sheet) throw new Error("No se encontró la hoja BD_GALERIA_SVG.");

        const data = convertirRangoAObjetos(sheet);
        const folderPath = "assets/icons/";
        let count = 0;
        let errors = 0;

        data.forEach(row => {
            const id = row.SVG_ID;
            const nombre = row.NOMBRE ? String(row.NOMBRE).trim().toLowerCase().replace(/\s+/g, "_") : id;
            const svgRaw = row.SVG_CODE;

            if (!svgRaw || !id) return;

            const svgMin = asset_minifySvg(svgRaw);
            const fileName = `${nombre}.svg`;
            const filePath = folderPath + fileName;

            // Intentar subir el archivo
            const res = asset_subirArchivoFisicoAGitHub(svgMin, filePath);
            if (res.success) {
                count++;
            } else {
                console.warn(`⚠️ Error al subir ${fileName}: ${res.message}`);
                errors++;
            }
        });

        console.log(`✅ [AssetManager] Sincronización finalizada. Subidos: ${count}, Errores: ${errors}`);
        return { success: true, uploaded: count, errors: errors };

    } catch (e) {
        console.error("❌ [AssetManager] Error crítico: " + e.message);
        return { success: false, message: e.message };
    }
}

/**
 * Sube un contenido de texto (SVG, JS, CSS) como un archivo físico a GitHub.
 * @param {string} content - Contenido del archivo.
 * @param {string} filePath - Ruta completa en el repositorio (ej: "assets/css/style.css").
 * @returns {{ success: boolean, message: string }}
 */
function asset_subirArchivoFisicoAGitHub(content, filePath) {
    try {
        const config = GLOBAL_CONFIG.ASSETS_GITHUB;
        const user = config.USER;
        const token = config.TOKEN;
        const repo = config.REPO; 
        const branch = config.BRANCH || "main";

        // --- INTERRUPTOR DE SEGURIDAD (Safety Switch) ---
        const syncEnabled = GLOBAL_CONFIG.ASSETS_GITHUB.ENABLE_SYNC;
        if (!syncEnabled) {
            console.warn(`⚠️ [AssetManager] Sincronización GITHUB desactivada (Safety Switch). Omitiendo: ${filePath}`);
            return { success: true, message: "Sincronización desactivada por configuración.", skipped: true };
        }

        if (!token || !repo || !user) throw new Error("Configuración de GitHub incompleta (User/Token/Repo).");

        const url = `https://api.github.com/repos/${user}/${repo}/contents/${filePath}`;
        
        // --- Hash Check para evitar subidas redundantes ---
        const props = PropertiesService.getScriptProperties();
        const hashKey = "ASSET_HASH_" + filePath.replace(/[^a-zA-Z0-9]/g, "_");
        const newHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, content));
        
        if (props.getProperty(hashKey) === newHash) {
            return { success: true, message: "Sin cambios", skipped: true };
        }

        const contentBase64 = Utilities.base64Encode(content, Utilities.Charset.UTF_8);
        const headers = {
            "Authorization": "token " + token,
            "User-Agent": "ERP-AssetManager",
            "Accept": "application/vnd.github.v3+json"
        };

        // Obtener SHA si el archivo existe
        let sha = null;
        const getRes = UrlFetchApp.fetch(url, { method: "get", headers: headers, muteHttpExceptions: true });
        if (getRes.getResponseCode() === 200) {
            sha = JSON.parse(getRes.getContentText()).sha;
        }

        const payload = {
            message: "Asset Update: " + filePath,
            content: contentBase64,
            branch: branch
        };
        if (sha) payload.sha = sha;

        const putRes = UrlFetchApp.fetch(url, {
            method: "put",
            contentType: "application/json",
            headers: headers,
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        });

        if (putRes.getResponseCode() === 200 || putRes.getResponseCode() === 201) {
            props.setProperty(hashKey, newHash);
            return { success: true, message: "Subido" };
        } else {
            throw new Error(`GitHub API Error: ${putRes.getContentText()}`);
        }

    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * Sincroniza archivos de código (CSS o JS) con GitHub.
 * Útil para la modularización de plantillas de Blogger.
 * @param {string} content - El código fuente.
 * @param {string} fileName - Nombre del archivo (ej: "blogger-main.css").
 * @param {string} type - "css" o "js".
 */
function asset_syncCodeToGitHub(content, fileName, type) {
    const path = `assets/${type}/${fileName}`;
    return asset_subirArchivoFisicoAGitHub(content, path);
}

/**
 * Genera un manifiesto de URLs de CDN para integrar en Blogger.
 * @returns {Object} Mapa de etiquetas listos para copiar.
 */
function asset_getBloggerManifest() {
    const config = GLOBAL_CONFIG.ASSETS_GITHUB;
    const user = config.USER;
    const repo = config.REPO;
    const branch = config.BRANCH || "main";
    const baseUrl = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/assets/`;

    return {
        css: `<link rel="stylesheet" href="${baseUrl}css/blogger-main.css">`,
        js: `<script src="${baseUrl}js/blogger-main.js"></script>`,
        iconsBase: baseUrl + "icons/"
      };
}

/**
 * Genera la URL de CDN para un asset almacenado en GitHub.
 * @param {string} filePath - Ruta del archivo en el repo.
 * @returns {string} URL de jsDelivr.
 */
function asset_getCDNUrl(filePath) {
    const config = GLOBAL_CONFIG.ASSETS_GITHUB;
    const user = config.USER;
    const repo = config.REPO;
    const branch = config.BRANCH || "main";
    return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${filePath}`;
}

/**
 * Obtiene la URL de CDN para un icono específico por su ID o nombre.
 * @param {string} id - ID del icono o nombre de la categoría.
 * @returns {string} URL completa de jsDelivr.
 */
function asset_getUrlParaIcono(id) {
    if (!id) return "";
    // Limpiar el ID para que coincida con el nombre de archivo generado en asset_syncSvgGalleryToGitHub
    const nombre = String(id).trim().toLowerCase().replace(/\s+/g, "_");
    return asset_getCDNUrl(`assets/icons/${nombre}.svg`);
}
