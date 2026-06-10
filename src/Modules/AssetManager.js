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

// =====================================================================================
// CONSTANTES DE PLANTILLA DE CATÁLOGO (DISEÑO HORIZONTAL LIMPIO PARA REVENDEDORES)
// =====================================================================================

const ASSET_CATALOG_CARD_TEMPLATE_HTML = `<!-- Ficha de Catálogo Horizontal Limpia -->
<div class="catalog-card" id="catalog-card-{{PRODUCT_ID}}" data-sku="{{PRODUCT_SKU}}">
    <!-- Contenedor Izquierdo: Ficha Técnica -->
    <div class="catalog-card-details">
        <div class="catalog-card-header">
            <h3 class="catalog-card-title">
                {{PRODUCT_NAME}}
            </h3>
            <div class="catalog-sku-container">
                <span class="catalog-sku-label">Código SKU</span>
                <span class="catalog-sku-badge">{{PRODUCT_SKU}}</span>
            </div>
            
            <!-- Estrellas de Calificación (Opcional visual) -->
            <div class="catalog-rating-stars">
                {{RATING_STARS}}
            </div>
        </div>

        <!-- Ficha Técnica -->
        <div class="catalog-specs">
            <div class="catalog-spec-item">
                <i class="fa fa-tag"></i>
                <span class="catalog-spec-label">Modelo:</span>
                <span class="catalog-spec-value">{{PRODUCT_MODELO}}</span>
            </div>
            <div class="catalog-spec-item">
                <i class="fa fa-certificate"></i>
                <span class="catalog-spec-label">Marca:</span>
                <span class="catalog-spec-value">{{PRODUCT_MARCA}}</span>
            </div>
            <div class="catalog-spec-item">
                <i class="fa fa-venus-mars"></i>
                <span class="catalog-spec-label">Género:</span>
                <span class="catalog-spec-value">{{PRODUCT_GENERO}}</span>
            </div>
            <div class="catalog-spec-item">
                <i class="fa fa-paint-brush"></i>
                <span class="catalog-spec-label">Estilo:</span>
                <span class="catalog-spec-value">{{PRODUCT_ESTILO}}</span>
            </div>
            <div class="catalog-spec-item">
                <i class="fa fa-cube"></i>
                <span class="catalog-spec-label">Material:</span>
                <span class="catalog-spec-value">{{PRODUCT_MATERIAL}}</span>
            </div>
            <div class="catalog-spec-item">
                <i class="fa fa-sun-o"></i>
                <span class="catalog-spec-label">Temporada:</span>
                <span class="catalog-spec-value">{{PRODUCT_TEMPORADA}}</span>
            </div>
            <div class="catalog-spec-item">
                <i class="fa fa-arrows-alt"></i>
                <span class="catalog-spec-label">Talles:</span>
                <span class="catalog-spec-value">{{PRODUCT_TALLES}}</span>
            </div>
            <div class="catalog-spec-item align-items-start">
                <i class="fa fa-tint mt-1"></i>
                <span class="catalog-spec-label">Colores:</span>
                <div class="catalog-colors-badges">
                    {{PRODUCT_COLORES}}
                </div>
            </div>
        </div>
    </div>

    <!-- Contenedor Derecho: Imagen y Portada -->
    <div class="catalog-card-gallery">
        <div class="gallery-wrapper">
            <img class="gallery-main-img" src="{{IMAGEN_URL}}" alt="{{PRODUCT_NAME}}">
            <span class="gallery-sticker-portada" style="{{PORTADA_DISPLAY_STYLE}}">⭐ PORTADA</span>
        </div>
    </div>
</div>`;

const ASSET_CATALOG_CARD_TEMPLATE_CSS = `/* ==========================================================================
   FICHA DE PRODUCTO: CATALOG CARD STYLES
   REPLICADO DEL DISEÑO PREMIUM DE BLOGGER PARA USO EN ERP
   ========================================================================== */

:root {
    --primary-cyan: #00f2ff;
    --primary-cobalt: #002b5c;
    --secondary-cobalt: #004085;
    --accent-cobalt: #001a35;
    --premium-shadow: 0 10px 30px rgba(0, 43, 92, 0.08);
    --premium-shadow-hover: 0 15px 45px rgba(0, 43, 92, 0.15);
    --premium-radius: 12px;
    --outfit-font: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --light-blue-bg: #EFF6FC;
    --border-color: #e2e8f0;
    --text-color: #2d3748;
    --text-muted-color: #64748b;
}

.catalog-card {
    display: flex;
    flex-direction: row;
    background: #ffffff;
    border-radius: var(--premium-radius);
    border: 1px solid var(--border-color);
    box-shadow: var(--premium-shadow);
    overflow: hidden;
    max-width: 800px;
    margin: 15px auto;
    font-family: var(--outfit-font);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
    box-sizing: border-box;
}

.catalog-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--premium-shadow-hover);
}

/* --- DETALLES (COL IZQUIERDA) --- */
.catalog-card-details {
    flex: 1 1 55%;
    padding: 24px;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    justify-content: center;
}

.catalog-card-header {
    margin-bottom: 16px;
}

.catalog-card-title {
    font-size: 1.4rem;
    font-weight: 700;
    font-style: italic;
    color: var(--primary-cobalt);
    margin: 0 0 6px 0;
    letter-spacing: -0.02em;
}

.catalog-sku-container {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
}

.catalog-sku-label {
    background: rgba(0, 43, 92, 0.05);
    color: var(--primary-cobalt);
    font-size: 0.7rem;
    padding: 3px 8px;
    border-radius: 4px;
    font-weight: 600;
    border: 1px solid rgba(0, 43, 92, 0.1);
    text-transform: uppercase;
}

.catalog-sku-badge {
    background: #f1f5f9;
    color: var(--text-muted-color);
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 700;
    border: 1px solid #e2e8f0;
}

.catalog-rating-stars {
    display: flex;
    gap: 4px;
    font-size: 0.9rem;
    margin-bottom: 4px;
}

.catalog-rating-stars i {
    color: #f5a623;
}

/* --- ATRIBUTOS --- */
.catalog-specs {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.catalog-spec-item {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.88rem;
    color: var(--text-color);
    line-height: 1.4;
}

.catalog-spec-item i {
    width: 18px;
    text-align: center;
    color: var(--secondary-cobalt);
    opacity: 0.85;
    font-size: 0.9rem;
}

.catalog-spec-label {
    font-weight: 600;
    color: #1a202c;
    min-width: 90px;
}

.catalog-spec-value {
    color: var(--text-color);
}

.catalog-colors-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.catalog-color-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    border: 1px solid rgba(0,0,0,0.1);
}

/* Surtido o arcoiris */
.catalog-color-surtido {
    background: linear-gradient(to right, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff);
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

/* --- GALERÍA (COL DERECHA) --- */
.catalog-card-gallery {
    flex: 1 1 45%;
    position: relative;
    box-sizing: border-box;
    display: flex;
    align-items: stretch;
}

.gallery-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 380px;
}

.gallery-main-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-left: 1px solid var(--border-color);
}

.gallery-sticker-portada {
    position: absolute;
    top: 10px;
    left: 10px;
    background-color: rgba(255, 215, 0, 0.95);
    color: #000000;
    font-weight: 800;
    font-size: 0.75rem;
    padding: 4px 8px;
    border-radius: 5px;
    z-index: 5;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    letter-spacing: 0.5px;
}

/* --- RESPONSIVE ADJUSTMENTS --- */
@media (max-width: 600px) {
    .catalog-card {
        flex-direction: column;
        max-width: 100%;
    }
    
    .catalog-card-details {
        order: 2;
        padding: 18px;
    }
    
    .catalog-card-gallery {
        order: 1;
        width: 100%;
    }
    
    .gallery-wrapper {
        min-height: 280px;
        height: 280px;
    }
    
    .gallery-main-img {
        border-left: none;
        border-bottom: 1px solid var(--border-color);
    }
}`;

// =====================================================================================
// CONSTANTE DE PLANTILLA DE CATÁLOGO ADAPTADA PARA BOT DE APPSHEET (PDF/HTML)
// =====================================================================================

const ASSET_CATALOG_CARD_TEMPLATE_APPSHEET = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Ficha de Producto - &lt;&lt;[CODIGO_ID]&gt;&gt;</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
        
        body {
            font-family: 'Outfit', Arial, sans-serif;
            background-color: #ffffff;
            color: #2d3748;
            margin: 0;
            padding: 20px;
        }
        
        .catalog-card {
            display: table;
            width: 100%;
            border-collapse: separate;
            border-spacing: 20px;
            background: #ffffff;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            max-width: 800px;
            margin: 0 auto;
        }
        
        .catalog-card-details {
            display: table-cell;
            width: 55%;
            vertical-align: middle;
            padding: 10px;
        }
        
        .catalog-card-header {
            margin-bottom: 20px;
        }
        
        .catalog-card-title {
            font-size: 24px;
            font-weight: 700;
            font-style: italic;
            color: #002b5c;
            margin: 0 0 8px 0;
            letter-spacing: -0.02em;
        }
        
        .catalog-sku-container {
            margin-bottom: 10px;
        }
        
        .catalog-sku-label {
            background: rgba(0, 43, 92, 0.05);
            color: #002b5c;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 600;
            border: 1px solid rgba(0, 43, 92, 0.1);
            text-transform: uppercase;
            display: inline-block;
        }
        
        .catalog-sku-badge {
            background: #f1f5f9;
            color: #64748b;
            font-size: 12px;
            padding: 3px 8px;
            border-radius: 4px;
            font-weight: 700;
            border: 1px solid #e2e8f0;
            display: inline-block;
            margin-left: 5px;
        }
        
        .catalog-rating-stars {
            color: #f5a623;
            font-size: 16px;
            margin-top: 5px;
        }
        
        .catalog-specs {
            width: 100%;
            margin-top: 15px;
        }
        
        .catalog-spec-item {
            margin-bottom: 8px;
            font-size: 14px;
            color: #4a5568;
        }
        
        .catalog-spec-label {
            font-weight: 600;
            color: #2d3748;
            display: inline-block;
            width: 100px;
        }
        
        .catalog-spec-value {
            color: #4a5568;
        }
        
        .catalog-card-gallery {
            display: table-cell;
            width: 45%;
            vertical-align: middle;
            text-align: center;
        }
        
        .gallery-wrapper {
            position: relative;
            display: inline-block;
            width: 100%;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
        }
        
        .gallery-main-img {
            width: 100%;
            height: auto;
            max-height: 400px;
            object-fit: contain;
            display: block;
        }
        
        .gallery-sticker-portada {
            position: absolute;
            top: 10px;
            left: 10px;
            background-color: #ffd700;
            color: #000000;
            font-weight: 800;
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 5px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            text-transform: uppercase;
        }
    </style>
</head>
<body>

<div class="catalog-card">
    <div class="catalog-card-details">
        <div class="catalog-card-header">
            <h1 class="catalog-card-title">
                &lt;&lt;[CODIGO_ID]&gt;&gt;
            </h1>
            <div class="catalog-sku-container">
                <span class="catalog-sku-label">Código SKU</span>
                <span class="catalog-sku-badge">&lt;&lt;[SKU]&gt;&gt;</span>
            </div>
            
            <div class="catalog-rating-stars">
                ⭐ ⭐ ⭐ ⭐ ⭐
            </div>
        </div>

        <div class="catalog-specs">
            <div class="catalog-spec-item">
                <span class="catalog-spec-label">Modelo:</span>
                <span class="catalog-spec-value">&lt;&lt;[MODELO]&gt;&gt;</span>
            </div>
            <div class="catalog-spec-item">
                <span class="catalog-spec-label">Marca:</span>
                <span class="catalog-spec-value">&lt;&lt;[MARCA]&gt;&gt;</span>
            </div>
            <div class="catalog-spec-item">
                <span class="catalog-spec-label">Género:</span>
                <span class="catalog-spec-value">&lt;&lt;[GENERO]&gt;&gt;</span>
            </div>
            <div class="catalog-spec-item">
                <span class="catalog-spec-label">Estilo:</span>
                <span class="catalog-spec-value">&lt;&lt;[ESTILO]&gt;&gt;</span>
            </div>
            <div class="catalog-spec-item">
                <span class="catalog-spec-label">Material:</span>
                <span class="catalog-spec-value">&lt;&lt;[MATERIAL]&gt;&gt;</span>
            </div>
            <div class="catalog-spec-item">
                <span class="catalog-spec-label">Temporada:</span>
                <span class="catalog-spec-value">&lt;&lt;[TEMPORADA]&gt;&gt;</span>
            </div>
            <div class="catalog-spec-item">
                <span class="catalog-spec-label">Talles:</span>
                <span class="catalog-spec-value">&lt;&lt;[TALLES]&gt;&gt;</span>
            </div>
            <div class="catalog-spec-item">
                <span class="catalog-spec-label">Colores:</span>
                <span class="catalog-spec-value">&lt;&lt;[COLORES]&gt;&gt;</span>
            </div>
        </div>
    </div>

    <div class="catalog-card-gallery">
        <div class="gallery-wrapper">
            &lt;&lt;If: NOT(ISBLANK(ANY(SELECT(BD_PRODUCTO_IMAGENES[URL], AND([PRODUCTO_ID] = [_THISROW].[CODIGO_ID], [PORTADA] = TRUE)))))&gt;&gt;
                <img class="gallery-main-img" src="&lt;&lt;ANY(SELECT(BD_PRODUCTO_IMAGENES[URL], AND([PRODUCTO_ID] = [_THISROW].[CODIGO_ID], [PORTADA] = TRUE)))&gt;&gt;" alt="&lt;&lt;[CODIGO_ID]&gt;&gt;">
                <span class="gallery-sticker-portada">⭐ PORTADA</span>
            &lt;&lt;Else&gt;&gt;
                <img class="gallery-main-img" src="&lt;&lt;ANY(SELECT(BD_PRODUCTO_IMAGENES[URL], [PRODUCTO_ID] = [_THISROW].[CODIGO_ID]))&gt;&gt;" alt="&lt;&lt;[CODIGO_ID]&gt;&gt;">
            &lt;&lt;EndIf&gt;&gt;
        </div>
    </div>
</div>

</body>
</html>`;

/**
 * Sincroniza las plantillas del catálogo de revendedores (HTML y CSS) con el repositorio compartido.
 * @returns {{ success: boolean, message: string }} Resultado de la sincronización.
 */
function asset_syncCatalogTemplateToGitHub() {
    console.log("🚀 [AssetManager] Iniciando sincronización de plantillas de catálogo...");
    
    try {
        const htmlRes = asset_subirArchivoFisicoAGitHub(ASSET_CATALOG_CARD_TEMPLATE_HTML, "assets/templates/catalog-card.html");
        if (!htmlRes.success) {
            throw new Error("Error al subir el template HTML: " + htmlRes.message);
        }
        console.log("✅ [AssetManager] Template HTML de catálogo sincronizado con éxito.");

        const cssRes = asset_subirArchivoFisicoAGitHub(ASSET_CATALOG_CARD_TEMPLATE_CSS, "assets/css/catalog-card.css");
        if (!cssRes.success) {
            throw new Error("Error al subir el CSS de catálogo: " + cssRes.message);
        }
        console.log("✅ [AssetManager] CSS de catálogo sincronizado con éxito.");

        const appsheetRes = asset_subirArchivoFisicoAGitHub(ASSET_CATALOG_CARD_TEMPLATE_APPSHEET, "assets/templates/catalog-card-appsheet.html");
        if (!appsheetRes.success) {
            throw new Error("Error al subir el template de AppSheet: " + appsheetRes.message);
        }
        console.log("✅ [AssetManager] Template HTML de AppSheet sincronizado con éxito.");

        return { 
            success: true, 
            message: "Plantillas de catálogo (incluyendo AppSheet) sincronizadas correctamente.",
            htmlSkipped: !!htmlRes.skipped,
            cssSkipped: !!cssRes.skipped,
            appsheetSkipped: !!appsheetRes.skipped
        };
    } catch (e) {
        console.error("❌ [AssetManager] Error al sincronizar plantillas: " + e.message);
        return { success: false, message: e.message };
    }
}


