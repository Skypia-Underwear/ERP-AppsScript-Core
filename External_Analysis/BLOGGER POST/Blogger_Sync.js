/**
 * =================================================================
 * ARCHIVO: Blogger_Sync.js
 * UBICACIÓN: /Blogger_Integration/
 * DESCRIPCIÓN: Script para sincronizar productos usando CONSTANTES GLOBALES.
 * Requiere: Constants_Blogger.js cargado en el mismo proyecto.
 * =================================================================
 */

// NOTA: 'CONFIG' y 'ss' vienen de Constants_Blogger.js
// Si BLOG_ID no está en Constants, lo mantenemos aquí o lo movemos allá.
const BLOG_ID = '127843356634014504';

const DELAY_ENTRE_POSTS = 20000;
const MAX_POSTS_PER_RUN = 5;

// Helper simple para convertir índice de columna (1-based) a array (0-based)
const I = (colNumber) => colNumber - 1;

/**
 * Función Principal para Webhook/Bot
 */
function sincronizarProductoPorId(idProducto) {
    if (!idProducto) throw new Error("Se requiere un ID de producto.");

    // Usamos 'ss' global de Constants.js o abrimos de nuevo si se prefiere seguridad
    const sheetProductos = ss.getSheetByName(CONFIG.SHEETS.PRODUCTOS);
    const data = sheetProductos.getDataRange().getValues();

    let rowIndex = -1;
    let rowData = null;

    // Buscamos usando la columna correcta desde CONFIG
    const idxCodigo = I(CONFIG.COLS.PRODUCTOS.CODIGO_ID);

    for (let i = 1; i < data.length; i++) {
        if (String(data[i][idxCodigo]) === String(idProducto)) {
            rowIndex = i;
            rowData = data[i];
            break;
        }
    }

    if (rowIndex === -1) throw new Error(`Producto ${idProducto} no encontrado actualizalo.`);

    // Pasamos Index + 1 para que sea la Fila Real de la hoja (1-based)
    procesarFilaProducto(rowData, rowIndex + 1, ss, sheetProductos, null);

    return "Sincronización exitosa para " + idProducto;
}

/**
 * Sincronización Masiva
 */
function sincronizacionMasiva() {
    Logger.log("Iniciando sincronización masiva...");
    const sheetProductos = ss.getSheetByName(CONFIG.SHEETS.PRODUCTOS);
    if (!sheetProductos) {
        Logger.log("ERROR CRÍTICO: No se encontró la hoja PRODUCTOS (" + CONFIG.SHEETS.PRODUCTOS + ")");
        return;
    }

    const data = sheetProductos.getDataRange().getValues();
    Logger.log("Se cargaron " + data.length + " filas de la tabla PRODUCTOS.");
    data.shift(); // Remove headers

    let procesadosCount = 0;

    // Indices necesarios para el Loop
    const idxEstado = I(CONFIG.COLS.PRODUCTOS.ESTADO_SINCRONIZACION);
    const idxCodigo = I(CONFIG.COLS.PRODUCTOS.CODIGO_ID);

    Logger.log("Índice de Estado: " + idxEstado + " | Índice de Código: " + idxCodigo);

    for (let i = 0; i < data.length; i++) {
        if (procesadosCount >= MAX_POSTS_PER_RUN) {
            Logger.log("Límite de seguridad alcanzado: " + MAX_POSTS_PER_RUN + " posts por ejecución.");
            break;
        }

        const row = data[i];
        const estadoActual = row[idxEstado];
        const productoId = row[idxCodigo];
        const filaActual = i + 2;

        if (estadoActual === 'Pendiente') {
            Logger.log(`Fila ${filaActual} - ID: ${productoId} - Estado: Pendiente. Procesando...`);
            if (productoId) {
                const exito = procesarFilaProducto(row, filaActual, ss, sheetProductos, null);
                if (exito) {
                    procesadosCount++;
                    Utilities.sleep(DELAY_ENTRE_POSTS);
                }
            } else {
                Logger.log(`Fila ${filaActual} ignorada: Está en Pendiente pero no tiene PRODUCTO_ID válido.`);
            }
        }
    }
    Logger.log("Sincronización masiva finalizada. Posts procesados: " + procesadosCount);
}

/**
 * Procesa una fila individual
 */
function procesarFilaProducto(row, numeroFila, ss, sheetProductos, _mapaColoresIgnorado) {
    const idxCodigo = I(CONFIG.COLS.PRODUCTOS.CODIGO_ID);
    const idxPostId = I(CONFIG.COLS.PRODUCTOS.BLOGGER_POST_ID);
    const idxEstado = I(CONFIG.COLS.PRODUCTOS.ESTADO_SINCRONIZACION);

    const productoId = row[idxCodigo];

    try {
        Logger.log(`Procesando: ${productoId} (Fila ${numeroFila})`);

        const productData = construirDatosProducto(row, ss, null);

        // Indices para textos
        const catPadre = row[I(CONFIG.COLS.PRODUCTOS.CATEGORIA_PADRE)];
        const categoria = row[I(CONFIG.COLS.PRODUCTOS.CATEGORIA)];
        const genero = row[I(CONFIG.COLS.PRODUCTOS.GENERO)];

        // Calculate Price Text for Title
        let priceText = "";
        if (productData.precios && productData.precios.length > 0) {
            const minPrice = Math.min(...productData.precios.map(p => parseFloat(p.precio) || 0));
            if (productData.precios.length === 1) {
                priceText = ` | $${minPrice}`;
            } else {
                priceText = ` | Desde $${minPrice} (${productData.precios.length} Variedades)`;
            }
        }

        const postTitle = `${productData.marca} - ${productData.modelo}${priceText}`;
        const postLabels = [catPadre, categoria, productData.marca, genero].filter(Boolean);

        const postContentHTML = generarHtmlProducto(productData);

        const postId = row[idxPostId];

        // Solo actualizamos si hay un ID que no sea nulo, vacío o el texto literal "undefined"
        if (postId && postId !== "" && String(postId).toLowerCase() !== "undefined") {
            Logger.log(`Actualizando Post ${postId}...`);
            actualizarPostBlogger(postId, postTitle, postContentHTML, postLabels);
        } else {
            Logger.log(`Creando Nuevo Post...`);
            const newPost = crearPostBlogger(postTitle, postContentHTML, postLabels);
            if (!newPost || !newPost.id) throw new Error("La API no devolvió un ID de post válido.");

            // IMPORTANTE: getRange usa índices 1-based, así que usamos CONFIG directo
            sheetProductos.getRange(numeroFila, CONFIG.COLS.PRODUCTOS.BLOGGER_POST_ID).setValue(newPost.id);
        }

        sheetProductos.getRange(numeroFila, CONFIG.COLS.PRODUCTOS.ESTADO_SINCRONIZACION).setValue('Sincronizado');
        return true;

    } catch (error) {
        Logger.log(`Error en ${productoId}: ${error.toString()}`);
        sheetProductos.getRange(numeroFila, CONFIG.COLS.PRODUCTOS.ESTADO_SINCRONIZACION).setValue('Error: ' + error.message);

        if (error.toString().includes("quota") || error.toString().includes("limit") || error.toString().includes("exhausted")) {
            throw error;
        }
        return false;
    }
}

/**
 * Construye objeto de datos leíble
 */
function construirDatosProducto(row, ss, mapaColores) {
    const C = CONFIG.COLS.PRODUCTOS; // Atajo

    const codigo = row[I(C.CODIGO_ID)];
    const marca = row[I(C.MARCA)];
    const modelo = row[I(C.MODELO)];
    const categoria = row[I(C.CATEGORIA)];
    const material = row[I(C.MATERIAL)];
    const estilo = row[I(C.ESTILO)];
    const talles = row[I(C.TALLES)];
    const youtubeId = ''; // No existe ID_VIDEO_YOUTUBE en PRODUCTOS
    const etiquetaResumen = row[I(C.ETIQUETA_RESUMEN)];
    const descIA = etiquetaResumen;

    // Colores (Simplificado para JM-MAYORISTA)
    const rawColores = row[I(C.COLORES)];
    const nombresColores = (rawColores || '').split(',').map(c => c.trim()).filter(Boolean);
    const coloresConHex = nombresColores.map(nombre => ({
        nombre: nombre,
        hex: '#cccccc' // Hardcoded default as there is no COLORES dictionary
    }));

    return {
        codigo: codigo,
        marca: marca,
        modelo: modelo,
        descripcion: (descIA && descIA !== "") ? descIA : `Descripción para ${categoria} ${modelo} de ${material}. Estilo ${estilo}.`,
        talles: talles,
        colores: coloresConHex,
        youtubeId: youtubeId,
        imagenes: buscarImagenes(codigo, ss, row[I(C.FOTO_PRINCIPAL)]),
        precios: buscarPrecios(codigo, ss)
    };
}

/**
 * Helpers Visuales (Sin cambios de lógica, solo indentación)
 */
function generarHtmlProducto(data) {
    const datosParaFrontend = {
        codigo: data.codigo,
        nombre: `${data.marca} - ${data.modelo}`,
        descripcion: data.descripcion,
        imagen: data.imagenes.length > 0 ? data.imagenes[0] : "",
        variedad: data.precios.map(p => ({
            variedad: p.variedad,
            precio: p.precio,
            cantidadMinima: p.cantidadMinima
        }))
    };

    // Si no hay opciones de precio en LISTA_PRECIOS, agregamos Talle Surtidos por defecto
    if (datosParaFrontend.variedad.length === 0) {
        datosParaFrontend.variedad.push({
            variedad: "Talle Surtidos / Curva",
            precio: 0,
            cantidadMinima: 1
        });

        data.precios.push({
            variedad: "Talle Surtidos / Curva",
            precio: 0,
            cantidadMinima: 1
        });
    }

    const jsonString = JSON.stringify(datosParaFrontend).replace(/"/g, '&quot;');

    let galeriaHtml = '<p class="text-white-50 mt-5">Sin imágenes disponibles.</p>';
    if (data.imagenes && data.imagenes.length > 0) {
        const imagenPrincipal = data.imagenes[0];
        let miniaturas = '';
        if (data.imagenes.length > 1) {
            data.imagenes.slice(1).forEach(url => {
                miniaturas += `
          <a data-fancybox="gallery" href="${url}" class="d-inline-block me-1 mb-1">
            <img src="${url}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" />
          </a>`;
            });
        }
        galeriaHtml = `
      <div class="mb-3 text-center">
        <a data-fancybox="gallery" href="${imagenPrincipal}">
          <img src="${imagenPrincipal}" class="img-fluid rounded shadow-sm" style="max-height: 400px;" alt="${data.modelo}" />
        </a>
      </div>
      <div class="d-flex flex-wrap justify-content-center">${miniaturas}</div>
    `;
    }

    let preciosHtml = '<ul class="list-group mb-3 shadow-sm">';
    data.precios.forEach(p => {
        let textUnidad = '';
        if (p.cantidadMinima > 1) {
            const unitPrice = (p.precio / p.cantidadMinima).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            textUnidad = `<br><small class="text-success fw-bold" style="font-size: 0.8em;">(Unitario: $${unitPrice})</small>`;
        }

        // Identificar si la variedad es VIP para ocultarla por defecto
        const isVip = p.variedad.toUpperCase().includes("VIP");
        const vipClass = isVip ? "variedad-vip d-none" : "variedad-normal";
        const badgeColor = isVip ? "bg-warning text-dark" : "bg-primary text-white";

        preciosHtml += `
      <li class="list-group-item d-flex justify-content-between align-items-center ${vipClass}" style="background-color: var(--bs-card-bg, #fff); border-color: var(--bs-border-color, #dee2e6);">
        <span style="color: var(--bs-body-color, #212529);">${p.variedad} <small class="text-white-50 ms-1">(Pack: ${p.cantidadMinima} u.)</small>${textUnidad}</span>
        <span class="badge ${badgeColor} rounded-pill fs-6">$${p.precio}</span>
      </li>`;
    });
    preciosHtml += '</ul>';

    const htmlAgregarRapido = datosParaFrontend.variedad.length === 1
        ? `<button class="btn btn-outline-primary btn-lg py-2 fw-bold mt-2 shadow-sm" onclick="bridge_agregarDirectamente(this)" data-json="${jsonString}"><i class="fa fa-bolt"></i> AGREGAR RÁPIDO (1 Pack)</button>`
        : '';

    return `
    <div class="row producto-container" style="color: var(--bs-body-color, #212529);">
      <div class="col-md-6">${galeriaHtml}</div>
      <div class="col-md-6">
        <h2 class="h3 mb-3 font-weight-bold" style="color: var(--bs-heading-color, #212529);">${data.marca} <span class="font-weight-light text-white-50">/ ${data.modelo}</span></h2>
        <p class="mb-3" style="font-size: 1.05em; color: var(--bs-body-color, #333);">${data.descripcion}</p>
        
        <div class="p-2 mb-4 rounded text-center shadow-sm" style="background: linear-gradient(135deg, var(--bs-light, #f8f9fa) 0%, var(--bs-secondary-bg, #e9ecef) 100%); border-left: 4px solid var(--bs-primary, #0d6efd);">
          <small class="fw-bold fs-6" style="background: linear-gradient(45deg, #ff6b6b, #48cae4); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">✨ Colores y Talles Surtidos Automáticamente ✨</small>
        </div>

        <h5 class="mb-2 text-primary fw-bold">Precios Disponibles</h5>
        ${preciosHtml}
        
        <div class="alert border shadow-sm mt-4" style="background-color: var(--bs-tertiary-bg, #f8f9fa); border-color: var(--bs-border-color, #dee2e6);">
          <div class="d-grid gap-2">
            <button class="btn btn-success btn-lg py-3 fw-bold shadow-sm" onclick="abrirModalDesdePost(this)" data-json="${jsonString}">
              <i class="fa fa-shopping-cart"></i> AGREGAR AL PEDIDO
            </button>
            ${htmlAgregarRapido}
          </div>
          <small class="text-white-50 mt-3 d-block text-center"><i class="fa fa-info-circle"></i> Selecciona cantidad y variedad en el siguiente paso.</small>
        </div>
        ${data.youtubeId ? `<div class="mt-4 ratio ratio-16x9 shadow-sm"><iframe src="https://www.youtube.com/embed/${data.youtubeId}" allowfullscreen class="rounded"></iframe></div>` : ''}
      </div>
    </div>
    <script>if(typeof Fancybox !== 'undefined') { Fancybox.bind("[data-fancybox='gallery']"); }</script>
  `;
}

// ======================= HELPERS DE DATOS (USANDO CONFIG) =======================

// Se eliminó la función obtenerColoresConCache por falta de tabla BD_COLORES en JM-MAYORISTA

function buscarImagenes(id, ss, fotoPrincipal) {
    // En JM-MAYORISTA, la imagen principal viene directamente en la fila de PRODUCTOS
    // Convertimos la ruta relativa de AppSheet (ej. PRODUCTOS_Images/foto.jpg) a una URL pública
    const images = [];
    if (fotoPrincipal && fotoPrincipal !== '') {
        const appSheetAppId = CONFIG.IDS.APP_ID;
        // La URL de AppSheet para imágenes necesita el App ID y la ruta del archivo asegurada (URI encoded)
        const encodedPath = encodeURIComponent(fotoPrincipal);
        const publicUrl = `https://www.appsheet.com/template/gettablefileurl?appName=${appSheetAppId}&tableName=${CONFIG.SHEETS.PRODUCTOS}&fileName=${encodedPath}`;
        images.push(publicUrl);
    }
    return images;
}

function buscarPrecios(id, ss) {
    const sheet = ss.getSheetByName(CONFIG.SHEETS.LISTA_PRECIOS);
    if (!sheet) {
        Logger.log("ERROR: No se encontró la hoja LISTA_PRECIOS");
        return [];
    }
    const data = sheet.getDataRange().getValues();

    const idxProdId = I(CONFIG.COLS.LISTA_PRECIOS.PRODUCTO_ID);
    const idxVar = I(CONFIG.COLS.LISTA_PRECIOS.VARIEDAD);
    const idxPrecio = I(CONFIG.COLS.LISTA_PRECIOS.PRECIO_VARIEDAD);
    const idxMin = I(CONFIG.COLS.LISTA_PRECIOS.UNIDAD_PACK);

    const precios = [];
    data.forEach(r => {
        if (r[idxProdId] == id) {
            precios.push({
                variedad: r[idxVar],
                precio: r[idxPrecio],
                cantidadMinima: r[idxMin]
            });
        }
    });
    return precios;
}

// ======================= HELPERS DE API BLOGGER =======================

function crearPostBlogger(title, content, labels) {
    const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/`;
    const payload = { title, content, labels };
    const params = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
    };
    return procesarRespuesta(UrlFetchApp.fetch(url, params));
}

function actualizarPostBlogger(postId, title, content, labels) {
    const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${postId}`;
    const payload = { title, content, labels };
    const params = {
        method: 'put',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
    };
    return procesarRespuesta(UrlFetchApp.fetch(url, params));
}

function procesarRespuesta(response) {
    const json = JSON.parse(response.getContentText());
    if (json.error) {
        throw new Error(`API Blogger Error: ${json.error.message}`);
    }
    return json;
}
