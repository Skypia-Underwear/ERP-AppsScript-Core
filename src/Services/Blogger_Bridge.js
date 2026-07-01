/**
 * =====================================================================================
 * ARCHIVO: Blogger_Bridge.js
 * RESPONSABILIDAD: Puente de integración para el ecosistema de Blogger.
 * VERSIÓN: 3.1 (Dynamic Mapping Refactored)
 * =====================================================================================
 */


function blogger_listar_configuracion_sinCache(forceLocal = false) {
    const ss = getActiveSS();
    const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME;

    // --- MAPEOS DINÁMICOS ---
    const mP = HeaderManager.getMapping("PRODUCTS");
    const mV = HeaderManager.getMapping("PRODUCT_VARIETIES");
    const mI = HeaderManager.getMapping("PRODUCT_IMAGES");
    const mC = HeaderManager.getMapping("CATEGORIES");
    const mS = HeaderManager.getMapping("SVG_GALLERY");
    const mA = HeaderManager.getMapping("SHIPPING_AGENCIES");
    const mInv = HeaderManager.getMapping("INVENTORY");
    const mCol = HeaderManager.getMapping("COLORS");
    const mG = HeaderManager.getMapping("GENERAL_CONFIG");

    const getData = (sheetAlias) => {
        const sheet = ss.getSheetByName(SHEETS[sheetAlias]);
        if (!sheet) return [];
        const data = sheet.getDataRange().getValues();
        return data.length > 1 ? data.slice(1) : [];
    };

    const rowsProductos = getData("PRODUCTS");
    const rowsVariedades = getData("PRODUCT_VARIETIES");
    const rowsImagenes = getData("PRODUCT_IMAGES");
    const rowsCategorias = getData("CATEGORIES");
    const rowsSvg = getData("SVG_GALLERY");
    const rowsAgencias = getData("SHIPPING_AGENCIES"); // getData usa mapeo interno en SHEETS, ok dejar string si getData usa SHEETS[...]
    const rowsInventario = getData("INVENTORY");
    const rowsColores = getData("COLORS");

    const sheetConfig = ss.getSheetByName(SHEETS.GENERAL_CONFIG);
    const configRow = sheetConfig.getRange(2, 1, 1, sheetConfig.getLastColumn()).getValues()[0];
    const tipoRegistroProducto = (configRow[mG.TIPO_REGISTRO_PRODUCTO] || "").toString().trim().toUpperCase();
    const excluirSurtidosVariedades = blogger_esVerdadero(configRow[mG.EXCLUIR_SURTIDOS_VARIANTES]);
    const urlImagenSinImagen = blogger_getPublicImageURL(appName, configRow[mG.SIN_IMAGEN], SHEETS.GENERAL_CONFIG);
    const limiteImagenesPorProducto = configRow[mG.LIMITE_IMAGENES_PRODUCTO] || 10;
    const aplicarMarcaDeAgua = blogger_esVerdadero(configRow[mG.APLICAR_MARCA_DE_AGUA]);

    const sheetTiendas = ss.getSheetByName(SHEETS.STORES);
    const mShtT = HeaderManager.getMapping("STORES");
    const tiendaId = sheetTiendas.getRange(2, mShtT.TIENDA_ID + 1).getValue();
    const celularTienda = sheetTiendas.getRange(2, (mShtT.CELULAR !== undefined ? mShtT.CELULAR : 10) + 1).getValue(); // Fallback to index 10 (col 11) if mapping fails

    const sheetBlogger = ss.getSheetByName(SHEETS.BLOGGER_CONFIG);
    const mB = HeaderManager.getMapping("BLOGGER_CONFIG");
    const dataBlogger = sheetBlogger.getDataRange().getValues();
    const monedaRow = dataBlogger.find(r => (r[mB.PARAMETRO_ID] || "").toString().trim().toUpperCase() === "MONEDA");
    const moneda = monedaRow ? monedaRow[mB.CONFIGURACION] : "$";

    const mapCategoriasHtml = Object.fromEntries(rowsCategorias.map(r => [r[mC.ID], r[mC.HTML]]));
    const mapCategoriasIconos = Object.fromEntries(rowsCategorias.map(r => [r[mC.ID], r[mC.ICONO]]));

    // --- MAPEO DE ICONOS A CDN (v16.0) ---
    const svgIdToNameMap = {};
    rowsSvg.forEach(s => {
        const sid = s[mS.SVG_ID] || s[mS.NOMBRE]; // Llave: ID o Nombre (fallback)
        if (sid) {
            const nombreLimpio = s[mS.NOMBRE] ? String(s[mS.NOMBRE]).trim().toLowerCase().replace(/\s+/g, "_") : String(sid).trim().toLowerCase();
            svgIdToNameMap[sid] = nombreLimpio;
        }
    });

    const mapCategoriaAPadre = Object.fromEntries(rowsCategorias.map(r => [r[mC.ID], r[mC.CATEGORIA_PADRE] || "GENERAL"]));

    // --- PRE-INDEXACIÓN OPTIMIZADA O(1) ---
    const productosMap = {};
    for (const p of rowsProductos) {
        if (p[mP.CODIGO_ID]) productosMap[p[mP.CODIGO_ID]] = p;
    }

    const mapColoresParaDesc = Object.fromEntries(rowsColores.map(r => {
        let hex = String(r[mCol.HEXADECIMAL] || "cccccc").trim();
        if (!hex.startsWith("#")) hex = "#" + hex;
        return [String(r[mCol.ID] || "").trim(), hex];
    }));

    // Imágenes y Videos pre-filtradas
    const imagenesPorProducto = {};
    const videosPorProducto = {};
    for (const r of rowsImagenes) {
        const pId = r[mI.PRODUCTO_ID];
        if (blogger_esVerdadero(r[mI.ESTADO]) && r[mI.URL]) {
            if (r[mI.TIPO_ARCHIVO] === 'video') {
                videosPorProducto[pId] = r;
            } else {
                if (!imagenesPorProducto[pId]) imagenesPorProducto[pId] = [];
                const thumb = r[mI.THUMBNAIL_URL] || "";
                let urlAltaResolucion = r[mI.URL];
                if (thumb && (thumb.includes('=s') || thumb.includes('sz=s'))) {
                    urlAltaResolucion = thumb.replace(/(=|sz=)s\d+.*$/, '$1s1600-rw');
                }
                imagenesPorProducto[pId].push({
                    url: urlAltaResolucion,
                    thumbnail_url: thumb,
                    archivo_id: r[mI.ARCHIVO_ID],
                    portada: blogger_esVerdadero(r[mI.PORTADA]),
                    orden: (mI.ORDEN !== undefined) ? (parseInt(r[mI.ORDEN]) || 999) : 999,
                    fecha_carga: r[mI.FECHA_CARGA]
                });
            }
        }
    }

    // Pre-procesar ordenamiento de imágenes para O(1) en el bucle principal
    for (const pId in imagenesPorProducto) {
        let imgs = imagenesPorProducto[pId]
            .filter(img => img.url && !img.url.toLowerCase().includes('_thumb.'))
            .sort((a, b) => {
                if (a.orden !== b.orden) return a.orden - b.orden;
                return new Date(b.fecha_carga) - new Date(a.fecha_carga);
            });

        const tieneWebp = imgs.some(img => img.url.toLowerCase().endsWith('.webp'));
        const tieneJpg = imgs.some(img => img.url.toLowerCase().endsWith('.jpg'));
        if (tieneWebp && tieneJpg) imgs = imgs.filter(img => img.url.toLowerCase().endsWith('.webp'));

        if (limiteImagenesPorProducto > 0 && imgs.length > limiteImagenesPorProducto) {
            const p = imgs.find(img => img.portada) || imgs[0];
            imgs = [p, ...imgs.filter(img => img !== p).slice(0, limiteImagenesPorProducto - 1)];
        }

        if (imgs.length === 0) {
            imgs = [{ url: urlImagenSinImagen, thumbnail_url: urlImagenSinImagen, portada: true }];
        } else if (!imgs.some(img => img.portada)) {
            imgs[0].portada = true;
        }
        imagenesPorProducto[pId] = imgs;
    }

    // --- LOOP LÓGICO ORIGINAL ---
    const dataArrayPadre = {};
    const rowsVisibles = rowsVariedades.filter(row => blogger_esVerdadero(row[mV.VISIBILIDAD_TIENDA]));

    // ORDENAMIENTO CRÍTICO
    rowsVisibles.sort((a, b) => {
        if (a[mV.CATEGORIA] === b[mV.CATEGORIA]) {
            if (a[mV.PRODUCTO_ID] === b[mV.PRODUCTO_ID]) {
                return new Date(b[mV.ULTIMA_ACTUALIZACION]) - new Date(a[mV.ULTIMA_ACTUALIZACION]);
            }
            return String(a[mV.PRODUCTO_ID]).localeCompare(String(b[mV.PRODUCTO_ID]));
        }
        return String(a[mV.CATEGORIA]).localeCompare(String(b[mV.CATEGORIA]));
    });

    let categoriaActual = "", productoActual = "", dataArrayCategoria = [], contadorCategoria = 0, recordProducto = {};
    const inventarioIndex = blogger_indexarInventario(rowsInventario);

    rowsVisibles.forEach((row, j) => {
        const categoria = row[mV.CATEGORIA];
        const productoId = row[mV.PRODUCTO_ID];
        const variedadNombre = row[mV.VARIEDAD];
        const precio = row[mV.PRECIO_UNITARIO];
        const minima = row[mV.CANTIDAD_MINIMA];
        const fechaUpd = row[mV.ULTIMA_ACTUALIZACION];

        if (!categoria || !productoId || !variedadNombre) return;

        if (categoria !== categoriaActual) {
            if (categoriaActual) {
                const catPadre = mapCategoriaAPadre[categoriaActual] || "GENERAL";
                const rawIcon = mapCategoriasIconos[categoriaActual] || categoriaActual;
                const sid = svgIdToNameMap[rawIcon] || rawIcon;
                const catObjeto = {
                    codigo: contadorCategoria,
                    nombre: categoriaActual,
                    url_categoria: blogger_getWhatsAppPublicURL(appName, mapCategoriasHtml[categoriaActual], SHEETS.CATEGORIES),
                    icono: asset_getUrlParaIcono(sid),
                    producto: dataArrayCategoria
                };
                if (!dataArrayPadre[catPadre]) dataArrayPadre[catPadre] = [];
                dataArrayPadre[catPadre].push(catObjeto);
                dataArrayCategoria = [];
            }
            categoriaActual = categoria;
            contadorCategoria++;
        }

        const sub_variedad = blogger_construirSubVariedadCompleta({
            pId: productoId,
            nombreVar: variedadNombre,
            inventarioIndex,
            coloresBD: rowsColores,
            tiendaId,
            excluirSurtidos: excluirSurtidosVariedades
        });

        const variedad = { moneda, precio, variedad: variedadNombre, minima, sub_variedad };

        if (productoActual !== productoId) {
            let imagenes = imagenesPorProducto[productoId] || [{ url: urlImagenSinImagen, thumbnail_url: urlImagenSinImagen, portada: true }];

            const desc = blogger_generarDescripcionProductoCompleta({
                pId: productoId,
                tipoRegistroProducto,
                productoRow: productosMap[productoId],
                inventarioProducto: inventarioIndex[tiendaId]?.[productoId] || [],
                videoRow: videosPorProducto[productoId],
                mapColores: mapColoresParaDesc,
                celularTienda
            });

            recordProducto = {
                codigo: j + 1,
                categoria: categoriaActual,
                nombre: productoId,
                carpeta_id: productosMap[productoId] ? productosMap[productoId][mP.CARPETA_ID] || "" : "",
                descripcion: desc,
                imagen: imagenes,
                variedad: [variedad],
                upd: fechaUpd
            };
            dataArrayCategoria.push(recordProducto);
            productoActual = productoId;
        } else {
            recordProducto.variedad.push(variedad);
        }

        if (j === rowsVisibles.length - 1) {
            const catPadre = mapCategoriaAPadre[categoriaActual] || "GENERAL";
            const rawIcon = mapCategoriasIconos[categoriaActual] || categoriaActual;
            const sid = svgIdToNameMap[rawIcon] || rawIcon;
            const catObjeto = {
                codigo: contadorCategoria,
                nombre: categoriaActual,
                url_categoria: blogger_getWhatsAppPublicURL(appName, mapCategoriasHtml[categoriaActual], SHEETS.CATEGORIES),
                icono: asset_getUrlParaIcono(sid),
                producto: dataArrayCategoria
            };
            if (!dataArrayPadre[catPadre]) dataArrayPadre[catPadre] = [];
            dataArrayPadre[catPadre].push(catObjeto);
        }
    });

    const dataArray = Object.keys(dataArrayPadre).map(p => ({
        nombre_padre: p,
        categorias: dataArrayPadre[p].sort((a, b) => a.nombre.localeCompare(b.nombre))
    })).sort((a, b) => a.nombre_padre.localeCompare(b.nombre_padre));

    // Agencias y Config Final
    const dataArrayAgencia = rowsAgencias.map(r => ({
        codigo: r[mA.ID] || r[mA.CODIGO] || "",
        descripcion: (r[mA.ID] || r[mA.NOMBRE] || r[mA.AGENCIA] || r[mA.DESCRIPCION] || "").toString(),
        cuit: r[mA.CUIT] || "",
        ubicacion: r[mA.UBICACION] || "",
        moneda,
        costo_envio: r[mA.COSTO] || 0,
        hora_entrega: r[mA.HORA] || ""
    }));

    // --- CONFIGURACIÓN DE BLOGGER DINÁMICA ---
    const getConfigBlogger = (id) => {
        const row = dataBlogger.find(r => (r[mB.PARAMETRO_ID] || "").toString().trim().toUpperCase() === id.toUpperCase());
        return row ? row[mB.CONFIGURACION] : "";
    };

    // --- SMART FETCH: OBTENER DATOS LIVE DE APPSHEET (VIRTUAL COLUMNS) ---
    let tiendaLive = null;
    try {
        // Intentamos obtener el registro de la tienda vía API para tener las VCards y fórmulas actualizadas
        // v12.2: Soportamos forceLocal para no saturar cuotas en regeneración de caché
        tiendaLive = appsheet_findRecord("BD_TIENDAS", "TIENDA_ID", tiendaId, forceLocal);
        if (tiendaLive && !forceLocal) {
            debugLog(`✅ Smart Fetch API: Datos de tienda '${tiendaId}' recuperados con éxito.`, true);
        }
    } catch (e) {
        debugLog(`⚠️ Smart Fetch API falló (usando respaldo de hoja): ${e.message}`, true);
    }

    const formaPagoData = blogger_safeParse(getConfigBlogger("FormaPago"));
    const nombreTiendaData = blogger_safeParse(getConfigBlogger("Nombre"));

    // Enriquecer el objeto de la tienda con datos Live de la API (si están disponibles)
    if (tiendaLive) {
        // Priorizar VCard y otros campos dinámicos de la API
        if (nombreTiendaData) {
            nombreTiendaData.vcard_url = tiendaLive.URL_VCARDS || tiendaLive.VCARD || nombreTiendaData.vcard_url;
            nombreTiendaData.logo_url = (tiendaLive.URL_LOGOTIPO || tiendaLive.LOGO || nombreTiendaData.logo_url || "").replace('&amp;', '&');
            nombreTiendaData.descripcion = tiendaLive.SOBRE_NOSOTROS || nombreTiendaData.descripcion;
            nombreTiendaData.telefono = (tiendaLive.CELULAR || nombreTiendaData.telefono || "").toString().replace(/\s/g, "");
            nombreTiendaData.correo = tiendaLive.EMAIL || tiendaLive.CORREO || nombreTiendaData.correo;
            nombreTiendaData.compra_minima = tiendaLive.COMPRA_MINIMA || nombreTiendaData.compra_minima;

            // Enriquecer Redes Sociales
            nombreTiendaData.redes_sociales = nombreTiendaData.redes_sociales || {};
            nombreTiendaData.redes_sociales.facebook = tiendaLive.FACEBOOK || nombreTiendaData.redes_sociales.facebook;
            nombreTiendaData.redes_sociales.instagram = tiendaLive.INSTAGRAM || nombreTiendaData.redes_sociales.instagram;
            nombreTiendaData.redes_sociales.tiktok = tiendaLive.TIKTOK || nombreTiendaData.redes_sociales.tiktok;

            // Enriquecer Formularios
            nombreTiendaData.formularios = nombreTiendaData.formularios || {};
            nombreTiendaData.formularios.cliente = tiendaLive.FORMULARIO_CLIENTE || nombreTiendaData.formularios.cliente;
            nombreTiendaData.formularios.catalogo_drive = tiendaLive.CATALOGO_DRIVE || nombreTiendaData.formularios.catalogo_drive;

            // Enriquecer Horarios
            nombreTiendaData.horario = nombreTiendaData.horario || {};
            nombreTiendaData.horario.apertura = tiendaLive.APERTURA || nombreTiendaData.horario.apertura;
            nombreTiendaData.horario.cierre = tiendaLive.CIERRE || nombreTiendaData.horario.cierre;

            // Enriquecer datos de ubicación y reseñas
            nombreTiendaData.google_review = nombreTiendaData.google_review || { place_id: "" };
            nombreTiendaData.google_review.place_id = tiendaLive.ID_GOOGLE_MAPS || nombreTiendaData.google_review.place_id;
            nombreTiendaData.coordenadas = tiendaLive.COORDENADAS || nombreTiendaData.coordenadas;
            nombreTiendaData.direccion = tiendaLive.DIRECCION || nombreTiendaData.direccion;
        }
    }

    return {
        status: '0', message: 'Éxito (Bridge V3 + Smart API)',
        pagina_url: getConfigBlogger("URL"),
        pagina_logo: tiendaLive ? (tiendaLive.URL_LOGOTIPO || tiendaLive.LOGO || getConfigBlogger("Logo")).replace('&amp;', '&') : getConfigBlogger("Logo"),
        pagina_tienda: nombreTiendaData,
        contentagencia: dataArrayAgencia,
        pagina_carrusel: blogger_safeParse(getConfigBlogger("Carrusel")),
        contactabilidad: getConfigBlogger("Contactabilidad"),
        content: dataArray,
        formas_pago: formaPagoData.formas_pago || [],
        cuenta_transferencia_dia: formaPagoData.cuenta_transferencia_dia || {},
        aplicar_marca_agua: aplicarMarcaDeAgua,
        timestamp_ms: Date.now()
    };
}

// --- REPRODUCCIÓN FIEL DE HELPERS ---

function blogger_indexarInventario(rows) {
    const index = {};
    const mInv = HeaderManager.getMapping("INVENTORY");
    rows.forEach(r => {
        const tId = r[mInv.TIENDA_ID], pId = r[mInv.PRODUCTO_ID];
        if (!index[tId]) index[tId] = {};
        if (!index[tId][pId]) index[tId][pId] = [];
        index[tId][pId].push(r);
    });
    return index;
}

function blogger_construirSubVariedadCompleta({ pId, nombreVar, inventarioIndex, coloresBD, tiendaId, excluirSurtidos }) {
    const mInv = HeaderManager.getMapping("INVENTORY");
    const mCol = HeaderManager.getMapping("COLORS");
    const mapColores = Object.fromEntries(coloresBD.map(r => {
        let id = String(r[mCol.ID] || "").trim();
        let hex = String(r[mCol.HEXADECIMAL] || "cccccc").trim();
        if (!hex.startsWith("#")) hex = "#" + hex;
        return [id, hex];
    }));
    const subtipo = String(nombreVar || "").trim(), surtidoHex = "#FF69B4-800080", res = {};
    const inv = inventarioIndex[tiendaId]?.[pId] || [];
    const conStock = r => Number(r[mInv.STOCK_ACTUAL]) > 0;

    if (["Corte", "Fardo", "Caja", "Docena"].includes(subtipo)) {
        let total = inv.filter(r => r[mInv.COLOR] === "Surtido" && conStock(r)).reduce((acc, r) => acc + Number(r[mInv.STOCK_ACTUAL]), 0);
        if (total > 0) res["Surtido"] = { color: surtidoHex, talles: [{ talle: "Surtido", stock: String(total) }] };
    } else if (subtipo === "Curva") {
        inv.filter(r => r[mInv.TALLE] === "Surtido" && conStock(r)).forEach(r => {
            const c = r[mInv.COLOR]; if (!res[c]) res[c] = { color: mapColores[c] || "#cccccc", talles: [] };
            res[c].talles.push({ talle: "Surtido", stock: String(r[mInv.STOCK_ACTUAL]) });
        });
    } else if (subtipo === "Pack x3") {
        const talles = inv.filter(r => r[mInv.COLOR] === "Surtido" && conStock(r)).map(r => ({ talle: r[mInv.TALLE], stock: String(r[mInv.STOCK_ACTUAL]) }));
        if (talles.length > 0) res["Surtido"] = { color: surtidoHex, talles };
    } else {
        inv.filter(r => conStock(r)).forEach(r => {
            if (excluirSurtidos && (r[mInv.COLOR] === "Surtido" || r[mInv.TALLE] === "Surtido")) return;
            const c = r[mInv.COLOR]; if (!res[c]) res[c] = { color: mapColores[c] || "#cccccc", talles: [] };
            res[c].talles.push({ talle: r[mInv.TALLE], stock: String(r[mInv.STOCK_ACTUAL]) });
        });
    }
    return res;
}

function blogger_generarDescripcionProductoCompleta({ pId, tipoRegistroProducto, productoRow, inventarioProducto, videoRow, mapColores, celularTienda }) {
    const mP = HeaderManager.getMapping("PRODUCTS");
    const mInv = HeaderManager.getMapping("INVENTORY");
    const mI = HeaderManager.getMapping("PRODUCT_IMAGES");

    const p = productoRow;
    if (!p) return null;
    const esSimple = tipoRegistroProducto === "PRODUCTO SIMPLE";
    const inv = inventarioProducto.filter(r => (esSimple ? true : Number(r[mInv.STOCK_ACTUAL]) > 0));
    const colores = new Set(), talles = new Set(); let stockTotal = 0;
    if (esSimple) {
        (p[mP.COLORES] || "").split(",").map(c => c.trim()).filter(Boolean).forEach(c => colores.add(c));
        (p[mP.TALLES] || "").split(",").map(t => t.trim()).filter(Boolean).forEach(t => talles.add(t));
        stockTotal = inv.reduce((acc, r) => acc + Number(r[mInv.STOCK_ACTUAL]), 0);
    } else {
        inv.forEach(r => {
            colores.add(r[mInv.COLOR]);
            talles.add(r[mInv.TALLE]);
            stockTotal += Number(r[mInv.STOCK_ACTUAL]);
        });
    }
    const listColores = [...colores].map(c => ({ nombre: c, hex: mapColores[c] || "#cccccc" }));
    const video = videoRow ? { label: "Video", url: videoRow[mI.URL], thumbnail: videoRow[mI.THUMBNAIL_URL] } : undefined;
    const ageGroupVal = (mP.GRUPO_EDAD !== undefined && p[mP.GRUPO_EDAD]) ? String(p[mP.GRUPO_EDAD]).trim() : "";
    const ageGroupStr = ageGroupVal ? `\n🔹 Edad: ${ageGroupVal}` : "";
    const msgWA = `¡Hola! Interesado en:\n🔹 Código: ${pId}\n🔹 Modelo: ${p[mP.MODELO] || '-'}\n🔹 Marca: ${p[mP.MARCA] || '-'}\n🔹 Género: ${p[mP.GENERO] || '-'}${ageGroupStr}\n🔹 Talles: ${[...talles].join(', ')}`;

    return {
        modelo: { label: "Modelo", valor: p[mP.MODELO] || "-" },
        marca: { label: "Marca", valor: p[mP.MARCA] || "-" },
        genero: {
            label: "Género",
            valor: p[mP.GENERO] || "-",
            icono: blogger_getGeneroIcono(p[mP.GENERO])
        },
        grupo_edad: {
            label: "Edad",
            valor: ageGroupVal || "-",
            icono: "👶"
        },
        estilo: { label: "Estilo", valor: p[mP.ESTILO] || "-" },
        material: { label: "Material", valor: p[mP.MATERIAL] || "-" },
        temporada: {
            label: "Temporada",
            valor: p[mP.TEMPORADA] || "-",
            icono: blogger_getTemporadaIcono(p[mP.TEMPORADA])
        },
        talles: { label: "Talles", valores: [...talles] },
        colores: { label: "Colores", valores: listColores },
        stock: { label: "Stock", valor: String(stockTotal), estado: stockTotal >= 10 ? "Alta" : stockTotal >= 5 ? "Media" : "Baja" },
        ultima_actualizacion: blogger_formatearFecha(p[mP.ULTIMA_ACTUALIZACION]),
        video,
        whatsapp: { label: "Más Info", telefono: celularTienda, url: `https://wa.me/549${celularTienda}?text=` + encodeURIComponent(msgWA) }
    };
}

function blogger_esVerdadero(v) {
    const s = String(v).trim().toLowerCase(); return s === "true" || s === "1" || s === "verdadero" || s === "si" || v === true;
}

function blogger_safeParse(v) {
    if (!v) return {};
    let str = String(v).trim();

    // Si está envuelto en comillas simples externas por Sheets, las removemos
    if (str.startsWith("'") && str.endsWith("'") && str.length > 1) {
        str = str.substring(1, str.length - 1).trim();
    }

    // Reemplazar comillas tipográficas (curvas/curly/smart quotes) por comillas rectas estándar
    str = str.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");

    try {
        return JSON.parse(str);
    } catch (e) {
        console.warn("⚠️ [Blogger safeParse] Error al parsear JSON: " + e.message + " | Valor: " + str);
        return {};
    }
}

function blogger_getPublicImageURL(appName, filePath, tableName) {
    if (!filePath) return "";
    const cleanPath = filePath.replace(/^\//, "");
    return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(tableName)}&fileName=${encodeURIComponent(cleanPath)}`;
}

function blogger_getWhatsAppPublicURL(appName, filePath, tableName) {
    if (!filePath) return "";
    const publicUrl = blogger_getPublicImageURL(appName, filePath, tableName);
    return `https://wa.me/?text=${encodeURIComponent("Mirá mi catálogo: ")}${encodeURIComponent(publicUrl)}`;
}


/**
 * Rehidrata un pedido inyectando descripciones e imágenes desde el catálogo maestro.
 * Esto permite que el registro sea ligero pero la visualización sea completa.
 */
function blogger_rehidratar_pedido(pedido) {
    if (!pedido || !pedido.detalle || !Array.isArray(pedido.detalle)) return pedido;

    try {
        const config = blogger_obtenerConfiguracionDesdeDrive();
        if (!config || !config.secciones) return pedido;

        // Crear mapa de productos del catálogo para búsqueda ultra-rápida (ID -> Objeto)
        const catalogMap = {};
        config.secciones.forEach(sec => {
            if (sec.productos) {
                sec.productos.forEach(p => {
                    catalogMap[p.codigo] = p;
                });
            }
        });

        // Rehidratar cada item del pedido
        pedido.detalle = pedido.detalle.map(item => {
            const master = catalogMap[item.codigo];
            if (master) {
                // Inyectamos datos que fueron podados en el registro por ahorro de espacio
                item.descripcion = item.descripcion || master.descripcion;
                item.imagen = item.imagen || master.imagen;
                item.categoria = item.categoria || master.categoria;
            }
            return item;
        });
        debugLog("💧 [Blogger Hydration] Pedido rehidratado con éxito desde catálogo.");
    } catch (e) {
        debugLog("⚠️ Error en Hidratación Dinámica: " + e.message);
    }
    return pedido;
}

function blogger_cargar_venta(venta) {
    const jo = {};
    try {
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.BLOGGER_SALES);
        if (!sheet) throw new Error("Hoja de ventas de Blogger no encontrada");

        const data = sheet.getDataRange().getValues();
        let pedido = null;
        const mS = HeaderManager.getMapping("BLOGGER_SALES");
        const idBusqueda = (venta.id || venta.idpedido || "").replace("&m=1", "").replace("?m=1", "");

        for (let i = 1; i < data.length; i++) {
            if (String(data[i][mS.CODIGO]) === String(idBusqueda)) {
                pedido = JSON.parse(data[i][mS.DETALLE_JSON]);
                break;
            }
        }

        if (pedido) {
            // --- HIDRATACIÓN DINÁMICA ---
            // Reconstruimos imágenes y descripciones desde el catálogo maestro
            pedido = blogger_rehidratar_pedido(pedido);

            jo.status = '0'; jo.message = 'OK';
            jo.pedido = pedido;
            jo.pedido.idpedido = idBusqueda;
        } else {
            jo.status = '1'; jo.message = 'No se encontró el pedido ' + idBusqueda;
        }
    } catch (e) {
        jo.status = '-1'; jo.message = e.toString();
    }
    return jo;
}

/**
 * Adjunta los detalles de un pedido a un objeto de respuesta.
 * @param {object} respuestaObjeto - El objeto de respuesta (configuración).
 * @param {string} idPedido - El ID del pedido a buscar.
 */
function blogger_adjuntar_pedido_a_respuesta(respuestaObjeto, idPedido) {
    try {
        const ventaRaw = blogger_cargar_venta(JSON.stringify({ id: idPedido }));
        if (ventaRaw.status === "0") {
            respuestaObjeto.pedido = ventaRaw.pedido;
        }
    } catch (error) {
        console.warn(`No se pudo adjuntar el pedido ${idPedido}: ${error.toString()}`);
    }
}

/**
 * Completa los campos faltantes de una venta usando los datos de la base de clientes.
 */
function blogger_completarCamposFaltantesDesdeClientes(venta, datosClientes) {
    const ss = getActiveSS();
    const mC = HeaderManager.getMapping("CLIENTS");
    const mA = HeaderManager.getMapping("SHIPPING_AGENCIES");

    const clienteIndex = datosClientes.findIndex((fila, i) => i > 0 && (fila[mC.CLIENTE_ID] || "").toString().toUpperCase() === (venta.nombre_entrega || "").toString().toUpperCase());

    // Si hay cliente en BD, completar datos de contacto y dirección
    if (clienteIndex !== -1) {
        const cliente = datosClientes[clienteIndex];
        const nombreCompleto = cliente[mC.NOMBRE_COMPLETO] || "";
        const clienteId = cliente[mC.CLIENTE_ID] || "";
        venta.nombre_entrega_mostrado = nombreCompleto && clienteId ? `${nombreCompleto} (${clienteId})` : nombreCompleto || clienteId;

        // Función de limpieza interna mejorada para descartar basura (v11.20)
        const clean = (val) => {
            const s = (val || "").toString().trim();
            const lowerS = s.toLowerCase();
            // Detectar "Sin especificar", "N/A", vacío o patrones de plantilla con guiones/CP
            const esBasura = (lowerS === "sin especificar" || lowerS === "n/a" || s === "" || s.includes("- - CP - -") || (s.length < 15 && s.includes("-")));
            return esBasura ? "" : s;
        };

        if (!clean(venta.rut_entrega) && clean(cliente[mC.CUIT_DNI])) venta.rut_entrega = cliente[mC.CUIT_DNI];
        if (!clean(venta.telefono_entrega) && clean(cliente[mC.CELULAR])) venta.telefono_entrega = cliente[mC.CELULAR];
        if (!clean(venta.correo_entrega) && clean(cliente[mC.CORREO_ELECTRONICO])) venta.correo_entrega = cliente[mC.CORREO_ELECTRONICO];

        // Si la venta no traía agencia (ej: desde el carrito), heredar del cliente
        if (!clean(venta.agencia_entrega)) {
            venta.agencia_entrega = clean(cliente[mC.AGENCIA_ENVIO]) || "";
        }

        // Determinar dirección base (v11.21)
        const tipoEnvio = clean(cliente[mC.TIPO_ENVIO]) || "";
        let dirFinal = "";

        if (tipoEnvio !== "RETIRO TIENDA") {
            const partes = [];
            const calleNum = `${clean(cliente[mC.CALLE])} ${clean(cliente[mC.NUMERO])}`.trim();
            if (calleNum) partes.push(calleNum);

            const pisoDepto = `${clean(cliente[mC.PISO]) ? "Piso " + clean(cliente[mC.PISO]) : ""} ${clean(cliente[mC.DEPARTAMENTO]) ? "Depto " + clean(cliente[mC.DEPARTAMENTO]) : ""}`.trim();
            if (pisoDepto) partes.push(pisoDepto);

            const cp = clean(cliente[mC.CODIGO_POSTAL]);
            const loc = clean(cliente[mC.LOCALIDAD]);
            const prov = clean(cliente[mC.PROVINCIA]);

            let zona = `${cp ? "CP" + cp : ""} ${loc}`.trim();
            if (prov) zona += (zona ? " - " : "") + prov;
            if (zona) partes.push(zona);

            dirFinal = partes.join(", ");

            // Solo añadir observación si es relevante
            const obs = clean(cliente[mC.OBSERVACION]);
            if (obs) dirFinal += ` (Obs: ${obs})`;
        } else {
            dirFinal = "Retiro en Tienda";
        }

        // SI LA DIRECCIÓN ACTUAL ES "BASURA" O ESTÁ VACÍA (O ES MODO VALIDAR DATOS), SOBRESCRIBIR POR LA LIMPIA DE LA BD
        if (!clean(venta.direccion_entrega)) {
            venta.direccion_entrega = dirFinal || "Dirección no informada";

            // -- REHIDRATACIÓN DETALLADA (v11.18+) --
            venta.provincia = clean(cliente[mC.PROVINCIA]);
            venta.municipio = clean(cliente[mC.MUNICIPIO]);
            venta.localidad = clean(cliente[mC.LOCALIDAD]);
            venta.codigo_postal = clean(cliente[mC.CODIGO_POSTAL]);
            venta.calle = clean(cliente[mC.CALLE]);
            venta.numero = clean(cliente[mC.NUMERO]);
            venta.piso = clean(cliente[mC.PISO]);
            venta.departamento = clean(cliente[mC.DEPARTAMENTO]);
            venta.observacion = clean(cliente[mC.OBSERVACION]);
        }
    } else {
        // Fallback para nombres mostrados de clientes no registrados (ej: CLI001)
        venta.nombre_entrega_mostrado = venta.nombre_entrega;
    }

    // --- LÓGICA DE AGENCIA (INDEPENDIENTE DEL CLIENTE) ---
    // Siempre intentamos enriquecer con la hora/costo de la agencia seleccionada
    if (venta.agencia_entrega) {
        const hojaAgencias = ss.getSheetByName(SHEETS.SHIPPING_AGENCIES);
        if (hojaAgencias) {
            // Usamos un caché local para no re-leer la hoja si ya la tenemos en esta ejecución
            // Usamos getDisplayValues() para evitar desfases de zona horaria (ej: 15:43 vs 12:00)
            const dataAgenciasDisplay = hojaAgencias.getDataRange().getDisplayValues();
            const filaAgencia = dataAgenciasDisplay.find(fila => (fila[mA.AGENCIA_ID] + "").trim() === (venta.agencia_entrega + "").trim());

            if (filaAgencia) {
                // Guardamos el string exacto del display de la celda (ej: "12:00")
                // El mapeo mA debe tener HORA_ENTREGA y COSTO_ENVIO según el esquema
                venta.hora_entrega_agencia = (filaAgencia[mA.HORA_ENTREGA] || "").trim();

                if (venta.costo_agencia === undefined || venta.costo_agencia === "" || venta.costo_agencia === 0) {
                    venta.costo_agencia = parseFloat((filaAgencia[mA.COSTO_ENVIO] || "0").toString().replace(",", ".")) || 0;
                }
            }
        }
    }
}

function blogger_buscarClienteExistente(datosClientes, correo, dni, celular) {
    const mC = HeaderManager.getMapping("CLIENTS");
    const correoBusq = (correo || "").toString().toLowerCase().trim();
    if (correoBusq) {
        let index = datosClientes.findIndex(c => (String(c[mC.CORREO_ELECTRONICO] || "")).toLowerCase().trim() === correoBusq);
        if (index !== -1) return index;
    }

    const dniSanit = (dni || "").toString().replace(/\D/g, '');
    if (dniSanit) {
        let index = datosClientes.findIndex(c => String(c[mC.CUIT_DNI] || "").toString().replace(/\D/g, '') === dniSanit);
        if (index !== -1) return index;
    }

    const celSanit = (celular || "").toString().replace(/\D/g, '');
    if (celSanit) {
        let index = datosClientes.findIndex(c => String(c[mC.CELULAR] || "").toString().replace(/\D/g, '') === celSanit);
        if (index !== -1) return index;
    }

    return -1;
}

function blogger_confirmar_pago_presencial(payload) {
    const jo = {};
    try {
        const venta = payload;
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.BLOGGER_SALES);
        const mS = HeaderManager.getMapping("BLOGGER_SALES");
        const rows_codigos = sheet.getRange(2, mS.CODIGO + 1, sheet.getLastRow() - 1, 1).getValues();
        const fila_actualizar = rows_codigos.flat().lastIndexOf(venta.idpedido);

        if (fila_actualizar !== -1) {
            sheet.getRange(fila_actualizar + 2, mS.ESTADO + 1).setValue("PAGADO");

            // ASIGNAR CAJA DEL DÍA
            try {
                const cajaId = getCurrentOpenBoxId();
                if (cajaId && mS.CAJA_ID !== undefined) {
                    sheet.getRange(fila_actualizar + 2, mS.CAJA_ID + 1).setValue(cajaId);
                    debugLog(`📦 [Blogger Bridge] Venta ${venta.idpedido} auto-asignada a Caja ${cajaId}`);
                }
            } catch (eC) {
                debugLog("⚠️ No se pudo auto-asignar caja en pagar_venta: " + eC.message);
            }

            jo.status = "0";
            jo.message = "Se notificó el pagó de la venta exitosamente, espere confirmación por WhatsApp";
        } else {
            jo.status = "-1"; jo.message = "Error: No se encontró el pedido";
        }
    } catch (e) {
        jo.status = "-1"; jo.message = e.toString();
    }
    return jo;
}

function blogger_pagar_venta(datos) {
    const jo = {};
    try {
        const venta = datos;
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.BLOGGER_SALES);
        const mS = HeaderManager.getMapping("BLOGGER_SALES");
        const rows_codigos = sheet.getRange(2, mS.CODIGO + 1, sheet.getLastRow() - 1, 1).getValues();
        const fila_actualizar = rows_codigos.flat().lastIndexOf(venta.idpedido);

        if (fila_actualizar !== -1) {
            sheet.getRange(fila_actualizar + 2, mS.ESTADO + 1).setValue("PAGADO");

            // ASIGNAR CAJA DEL DÍA
            try {
                const cajaId = getCurrentOpenBoxId();
                if (cajaId && mS.CAJA_ID !== undefined) {
                    sheet.getRange(fila_actualizar + 2, mS.CAJA_ID + 1).setValue(cajaId);
                    debugLog(`📦 [Blogger Bridge] Venta ${venta.idpedido} auto-asignada a Caja ${cajaId}`);
                }
            } catch (eC) {
                debugLog("⚠️ No se pudo auto-asignar caja en pagar_venta: " + eC.message);
            }

            jo.status = "0";
            jo.message = "Se notificó el pagó de la venta exitosamente, espere confirmación por WhatsApp";
        } else {
            jo.status = "-1"; jo.message = "Error: No se encontró el pedido";
        }
    } catch (e) {
        jo.status = "-1"; jo.message = e.toString();
    }
    return jo;
}

function blogger_cancelar_venta(venta) {
    const jo = {};
    try {
        const ss = getActiveSS();
        const mS = HeaderManager.getMapping("BLOGGER_SALES");
        const mSD = HeaderManager.getMapping("BLOGGER_SALES_DETAILS");
        const hojaVentas = ss.getSheetByName(SHEETS.BLOGGER_SALES);
        const hojaDetalle = ss.getSheetByName(SHEETS.BLOGGER_SALES_DETAILS);

        const rowsVentas = hojaVentas.getRange(2, mS.CODIGO + 1, hojaVentas.getLastRow() - 1, 1).getValues();
        const filaVenta = rowsVentas.flat().lastIndexOf(venta.idpedido);

        if (filaVenta !== -1) {
            hojaVentas.deleteRow(filaVenta + 2);
        } else {
            jo.status = "-1"; jo.message = `Error: No se encontró el pedido en ${SHEETS.BLOGGER_SALES}`;
            return jo;
        }

        const rowsDetalle = hojaDetalle.getRange(2, mSD.VENTA_ID + 1, hojaDetalle.getLastRow() - 1, 1).getValues();
        for (let i = rowsDetalle.length - 1; i >= 0; i--) {
            if (String(rowsDetalle[i][0]) === String(venta.idpedido)) {
                hojaDetalle.deleteRow(i + 2);
            }
        }
        jo.status = "0"; jo.message = "Venta y detalles eliminados correctamente";
    } catch (e) {
        jo.status = "-1"; jo.message = e.toString();
    }
    return jo;
}

function blogger_registrar_venta(venta) {
    const jo = {};
    try {
        // --- DESCONTAMINACIÓN JSONP ---
        // Eliminamos metadatos de transporte para evitar polución en BD_VENTAS
        const transportKeys = ["callback", "_", "prefix", "venta_data"];
        transportKeys.forEach(k => delete venta[k]);
        debugLog("📋 [BRV-1] Inicio blogger_registrar_venta | op: " + venta.op + " | nombre: " + venta.nombre_entrega + " | total: " + venta.total, true);

        const ss = getActiveSS();
        const mC = HeaderManager.getMapping("CLIENTS");
        const mS = HeaderManager.getMapping("BLOGGER_SALES");
        const mSD = HeaderManager.getMapping("BLOGGER_SALES_DETAILS");

        const hojaClientes = ss.getSheetByName(SHEETS.CLIENTS);
        let datosClientes = hojaClientes.getDataRange().getValues();
        const sheetVentas = ss.getSheetByName(SHEETS.BLOGGER_SALES);
        const sheetDetalle = ss.getSheetByName(SHEETS.BLOGGER_SALES_DETAILS);

        let codigoventa = "B-" + Utilities.getUuid().substring(0, 8).toUpperCase();
        let backup_edicion = "";

        const nombre = (venta.nombre_entrega || "").trim();
        const correo = (venta.correo_entrega || "").trim();
        const rut = (venta.rut_entrega || "").trim();
        const telefono = (venta.telefono_entrega || "").trim();
        const direccion = (venta.direccion_entrega || "").trim();
        const agencia = (venta.agencia_entrega || "").trim();

        // v14.0 - Lógica de Identidad y Blindaje
        const idEnviado = (venta.id_cliente || "").toString().trim();
        const nombreEnviado = (venta.nombre_enviado || "").trim();
        const esClientePublico = (idEnviado === "CLI001" || (!idEnviado && !correo));

        debugLog("📋 [BRV-2] Tipo cliente | esPublico: " + esClientePublico + " | ID: '" + idEnviado + "' | Nombre: '" + nombreEnviado + "'", true);

        const actualizarDatos = venta.actualizar_datos === true || venta.actualizar_datos === "true";

        if (esClientePublico) {
            venta.nombre_entrega = "CLI001";
            venta.nombre_para_json = nombreEnviado + "(CLI001)";
            venta.agencia_entrega = venta.agencia_entrega || "RETIRO TIENDA";
        } else if (idEnviado && correo && !rut && !telefono && !direccion) {
            // Caso: Validación rápida (Login)
            const idx = blogger_buscarClienteExistente(datosClientes, correo, null, null);
            if (idx === -1 || idx === 0) return { status: "1", message: "ID de cliente o correo no encontrado." };

            const idEnBD = (datosClientes[idx][mC.CLIENTE_ID] || "").toString().trim();
            if (idEnBD.toLowerCase() !== idEnviado.toLowerCase()) return { status: "1", message: "ID de cliente no coincide con el correo." };
            venta.nombre_entrega = idEnBD;
            venta.nombre_para_json = datosClientes[idx][mC.NOMBRE_COMPLETO];
        } else if (idEnviado && correo && rut && telefono) {
            // Caso: Registro o Validación con Hidratación/Edición
            const idx = blogger_buscarClienteExistente(datosClientes, correo, rut, telefono);

            if (idx !== -1 && idx > 0) {
                const clienteID = datosClientes[idx][mC.CLIENTE_ID];
                venta.nombre_entrega = clienteID;
                venta.nombre_para_json = nombreEnviado;

                // --- ACTUALIZACIÓN DE CLIENTE EXISTENTE (v14.0) ---
                if (actualizarDatos) {
                    const filaAModificar = datosClientes[idx].slice(); // Copiar fila actual
                    filaAModificar[mC.NOMBRE_COMPLETO] = nombreEnviado;
                    filaAModificar[mC.CELULAR] = telefono;
                    filaAModificar[mC.CORREO_ELECTRONICO] = correo;
                    filaAModificar[mC.CUIT_DNI] = rut;
                    filaAModificar[mC.AGENCIA_ENVIO] = agencia;
                    filaAModificar[mC.TIPO_ENVIO] = agencia;

                    // Actualizar Direcciones Detalladas
                    if (mC.PROVINCIA !== undefined) filaAModificar[mC.PROVINCIA] = (venta.provincia || "").trim();
                    if (mC.LOCALIDAD !== undefined) filaAModificar[mC.LOCALIDAD] = (venta.localidad || "").trim();
                    if (mC.MUNICIPIO !== undefined) filaAModificar[mC.MUNICIPIO] = (venta.municipio || "").trim();
                    if (mC.CODIGO_POSTAL !== undefined) filaAModificar[mC.CODIGO_POSTAL] = (venta.codigo_postal || "").trim();

                    const rangeUpdate = hojaClientes.getRange(idx + 1, 1, 1, hojaClientes.getLastColumn());
                    rangeUpdate.setValues([filaAModificar]);
                    debugLog("📋 [BRV-ACT] Cliente " + clienteID + " actualizado permanentemente.");
                }
            } else {
                // Registro de Nuevo Cliente
                const nuevaFilaNum = hojaClientes.getLastRow() + 1;
                const clienteID = "CLI" + nuevaFilaNum.toString().padStart(3, "0");
                const nuevaFilaCliente = new Array(hojaClientes.getLastColumn()).fill("");

                nuevaFilaCliente[mC.CLIENTE_ID] = clienteID;
                nuevaFilaCliente[mC.CLASIFICACION] = "SIMPLE";
                nuevaFilaCliente[mC.NOMBRE_COMPLETO] = nombreEnviado;
                nuevaFilaCliente[mC.CELULAR] = telefono;
                nuevaFilaCliente[mC.CORREO_ELECTRONICO] = correo;
                nuevaFilaCliente[mC.CUIT_DNI] = rut;
                nuevaFilaCliente[mC.CONDICION_FISCAL] = "Consumidor Final";
                nuevaFilaCliente[mC.AGENCIA_ENVIO] = agencia;
                nuevaFilaCliente[mC.TIPO_ENVIO] = agencia;

                if (mC.PROVINCIA !== undefined) nuevaFilaCliente[mC.PROVINCIA] = (venta.provincia || "").trim();
                if (mC.LOCALIDAD !== undefined) nuevaFilaCliente[mC.LOCALIDAD] = (venta.localidad || "").trim();

                hojaClientes.appendRow(nuevaFilaCliente);
                venta.nombre_entrega = clienteID;
                venta.nombre_para_json = nombreEnviado;
                datosClientes = hojaClientes.getDataRange().getValues();
            }
        }

        blogger_completarCamposFaltantesDesdeClientes(venta, datosClientes);

        // --- RECALCULO DE COSTOS Y RECARGOS ---
        const totalConRecargo = parseFloat(venta.total) || 0;
        const recargoOriginal = parseFloat(venta.recargo_valor) || 0;
        const envio = parseFloat(venta.costo_agencia) || 0;
        const porcentajeRecargo = parseFloat(venta.recargo_pago) || 0;

        const subtotalSinRecargo = totalConRecargo - recargoOriginal;
        const nuevoSubtotalBase = subtotalSinRecargo + envio;
        const recargoRecalculado = nuevoSubtotalBase * (porcentajeRecargo / 100);
        const totalFinal = nuevoSubtotalBase + recargoRecalculado;

        venta.total = totalFinal.toFixed(2);
        venta.recargo_valor = recargoRecalculado.toFixed(0);

        // --- MODO EDICIÓN ---
        if (venta.operacion === "e" && venta.id) {
            codigoventa = venta.id;
            const rowsV = sheetVentas.getRange(2, 1, sheetVentas.getLastRow() - 1, sheetVentas.getLastColumn()).getValues();
            const rowsD = sheetDetalle.getRange(2, 1, sheetDetalle.getLastRow() - 1, sheetDetalle.getLastColumn()).getValues();
            for (let i = rowsV.length - 1; i >= 0; i--) {
                if (codigoventa == rowsV[i][mS.CODIGO]) {
                    backup_edicion = rowsV[i][mS.DETALLE_JSON];
                    sheetVentas.deleteRow(i + 2);
                    break;
                }
            }
            for (let i = rowsD.length - 1; i >= 0; i--) {
                if (codigoventa == rowsD[i][mSD.VENTA_ID]) {
                    sheetDetalle.deleteRow(i + 2);
                }
            }
        }

        const fecha = new Date();
        const fechaStr = Utilities.formatDate(fecha, "GMT-3", "yyyy-MM-dd");
        const horaStr = Utilities.formatDate(fecha, "GMT-3", "HH:mm:ss");

        // CORRECCIÓN AUDITORÍA: Inyectar fecha y hora en el JSON para consistencia en Frontend
        venta.fecha = fechaStr;
        venta.hora = horaStr;
        venta.id = codigoventa;
        venta.estado = "SOLICITADO";

        const sheetTiendas = ss.getSheetByName(SHEETS.STORES);
        const mShtT = HeaderManager.getMapping("STORES");
        const tiendaId = sheetTiendas ? sheetTiendas.getRange(2, mShtT.TIENDA_ID + 1).getValue() : "T1";
        let detalle_pedido = "";

        // Forzamos desempacado y validación agresiva de la matriz de detalle.
        if (!venta.detalle && venta.venta_data) {
            try {
                let vd = typeof venta.venta_data === "string" ? JSON.parse(venta.venta_data) : venta.venta_data;
                if (vd.detalle) venta.detalle = vd.detalle;
            } catch (e) { }
        }

        if (typeof venta.detalle === "string") {
            try { venta.detalle = JSON.parse(venta.detalle); } catch (e) { }
        }
        if (!venta.detalle || !Array.isArray(venta.detalle)) {
            return { status: "-1", message: "CRÍTICO: venta.detalle esta perdido o no devolvió matriz. Obj llegado: " + JSON.stringify(venta).substring(0, 200) };
        }

        // Procesar y enriquecer cada item antes de guardar el JSON final
        venta.detalle.forEach(item => {
            const nombreOriginal = item.nombre || "";
            const nombreLimpio = nombreOriginal.replace(/<\/?b>/g, "").trim();
            item.nombre = nombreLimpio;

            // --- PARSEO ROBUSTO DE VARIEDADES ---
            const productID = nombreLimpio.split(" ")[0];

            // Si no vienen del frontend, intentamos extraer del nombre: "PRODUCTO ( Precio - Color - Talle )"
            if (!item.color || !item.talle || !item.tipoPrecio) {
                const match = nombreLimpio.match(/\(([^)]+)\)/);
                if (match) {
                    const partes = match[1].split('-').map(p => p.trim());
                    item.tipoPrecio = item.tipoPrecio || partes[0] || "Menor";
                    item.color = item.color || partes[1] || "Surtido";
                    item.talle = item.talle || partes[2] || "Surtido";
                }
            }

            // Fallbacks seguros
            const color = item.color || "Surtido";
            const talle = item.talle || "Surtido";
            const tipoPrecio = item.tipoPrecio || "Menor";

            // Atributos normalizados en el item para el JSON
            item.color = color;
            item.talle = talle;
            item.tipoPrecio = tipoPrecio;

            // VARIEDAD_ID Crítico para ajuste de stock en AppSheet
            const variedadId = item.variedadId || item.varianteId || `${productID}-${color}-${talle}-${tiendaId}`;
            item.variedadId = variedadId;

            // --- CONSTRUCCIÓN DE RESUMEN PARA WHATSAPP ---
            const cantStr = (item.cantidad || 1).toString();
            const artResumen = `*${cantStr}x* ${nombreLimpio}\n`;
            detalle_pedido += artResumen;

            // --- REGISTRO DE DETALLE DINÁMICO ---
            const dRow = new Array(Math.max(...Object.values(mSD)) + 1).fill("");
            dRow[mSD.VENTA_ID] = codigoventa;
            dRow[mSD.PRODUCTO_VARIACION] = nombreLimpio.trim();
            dRow[mSD.DETALLE_JSON] = item.categoria || "";
            dRow[mSD.CANTIDAD] = parseFloat(item.cantidad) || 0;
            dRow[mSD.PRECIO] = parseFloat(item.precio) || 0;
            dRow[mSD.SUBTOTAL] = parseFloat(item.total) || 0;
            dRow[mSD.PRODUCTO_ID] = productID;
            dRow[mSD.COLOR] = color;
            dRow[mSD.TALLE] = talle;
            dRow[mSD.VARIEDAD_ID] = variedadId;

            sheetDetalle.appendRow(dRow);
        });

        // --- REGISTRO DE VENTA DINÁMICO (v16.2 Blindaje Pro) ---
        const vRow = new Array(Math.max(...Object.values(mS)) + 1).fill("");
        vRow[mS.CODIGO] = codigoventa;
        vRow[mS.FECHA] = fechaStr;
        vRow[mS.HORA] = horaStr;
        vRow[mS.METODO_PAGO] = venta.forma_pago || "";
        vRow[mS.DATOS_TRANSFERENCIA] = venta.datos_transferencia_id || "";
        vRow[mS.CLIENTE_ID] = venta.nombre_entrega || "";
        if (mS.CELULAR !== undefined) vRow[mS.CELULAR] = venta.telefono_entrega || "";
        vRow[mS.AGENCIA] = venta.agencia_entrega || "";
        vRow[mS.TIEMPO_ENTREGA_AGENCIA] = venta.hora_entrega_agencia || "";
        vRow[mS.MONEDA] = venta.moneda || "$";
        vRow[mS.COSTO_ENVIO] = venta.costo_agencia || 0;
        vRow[mS.RECARGO_TRANSFERENCIA] = venta.recargo_valor || 0;
        vRow[mS.TOTAL_VENTA] = venta.total || 0;
        vRow[mS.DETALLE_JSON] = JSON.stringify(venta);
        vRow[mS.ESTADO] = "SOLICITADO";
        vRow[mS.JSON_BACKUP] = backup_edicion || "";
        vRow[mS.URL_COMPROBANTE] = ""; // Se llena en procesos de IA posteriores

        // Asignar caja si es posible (Opcional en registro inicial)
        if (mS.CAJA_ID !== undefined) {
            try { vRow[mS.CAJA_ID] = getCurrentOpenBoxId() || ""; } catch (e) { }
        }

        sheetVentas.appendRow(vRow);

        notificarTelegramSalud(`🛒 <b>Venta Blogger: ${codigoventa}</b>\nCliente: ${venta.nombre_entrega_mostrado || venta.nombre_entrega}\nTotal: ${venta.moneda}${venta.total}`, "EXITO");

        debugLog("📋 [BRV-3] Guardando en Sheets | codigoventa: " + codigoventa + " | items: " + venta.detalle.length, true);
        const message_whatsapp = generarMensajeWhatsApp(venta, codigoventa, fechaStr, horaStr, detalle_pedido);
        debugLog("📋 [BRV-4] message_whatsapp generado: " + (message_whatsapp ? "SI (" + message_whatsapp.length + " chars)" : "NO/VACIO"), true);

        const resp = {
            status: "0",
            id: codigoventa,
            message: venta.operacion === "e" ? "Se editó la venta exitosamente" : "Se grabó la venta exitosamente",
            message_whatsapp: message_whatsapp
        };

        debugLog("🚀 [BRV-5] Respuesta FINAL enviada: status=" + resp.status + " | id=" + resp.id + " | whatsapp_len=" + (resp.message_whatsapp || "").length, true);

        return resp;
    } catch (e) {
        debugLog("❌ [BRV-ERROR] " + e.toString() + " | Stack: " + (e.stack || "N/A"), true);
        console.error("Error en blogger_registrar_venta:", e);
        return { status: "-1", message: e.toString() };
    }
}

function generarMensajeWhatsApp(venta, codigoventa, fecha, hora, detalle_pedido) {
    try {
        const ahora = new Date();
        const fNorm = (fecha && fecha !== "n/a" && fecha !== "") ? fecha : Utilities.formatDate(ahora, "GMT-3", "yyyy-MM-dd");
        const hNorm = (hora && hora !== "n/a" && hora !== "") ? hora : Utilities.formatDate(ahora, "GMT-3", "HH:mm:ss");

        let mensaje = `Pedido: ${venta.url || ""}?o=p&id=${codigoventa}\n`;

        const fechaObj = new Date(`${fNorm}T${hNorm}`);
        const fechaPedidoFormateada = blogger_formatearFechaEnEspanol(fechaObj);

        // 1. Datos del Cliente e Identidad
        const esRetiro = (venta.agencia_entrega || "").toUpperCase() === "RETIRO TIENDA";

        mensaje += `*FECHA DEL PEDIDO:* ${fechaPedidoFormateada}\n`;
        mensaje += `*NOMBRE Y APELLIDOS:* ${venta.nombre_para_json || venta.nombre_enviado || venta.nombre_entrega}\n`;
        mensaje += `*CELULAR:* ${venta.telefono_entrega || "n/a"}\n`;
        mensaje += `*CONDICION FISCAL:* ${venta.condicion_fiscal || "Consumidor Final"}\n`;

        if (!esRetiro) {
            mensaje += `*DIRECCION:* ${venta.direccion_entrega || "n/a"}\n`;
        }
        let horaLimiteTexto = "No especificada";

        try {
            if (venta.hora_entrega_agencia) {
                let horaSTR = "";
                if (Object.prototype.toString.call(venta.hora_entrega_agencia) === '[object Date]') {
                    horaSTR = Utilities.formatDate(venta.hora_entrega_agencia, Session.getScriptTimeZone(), "HH:mm");
                } else {
                    const hStr = (venta.hora_entrega_agencia + "");
                    horaSTR = hStr.includes("T") ? hStr.split("T")[1].substring(0, 5) : hStr.substring(0, 5);
                }

                const parts = horaSTR.split(":");
                if (parts.length >= 2) {
                    const hLimite = Number(parts[0]);
                    const mLimite = Number(parts[1]);
                    let fechaCalculada = new Date(fechaObj);
                    const hActual = fechaCalculada.getHours();
                    const yaPasoHoraCorte = (hActual > hLimite) || (hActual === hLimite && fechaCalculada.getMinutes() >= mLimite);
                    const esFinSemana = (fechaCalculada.getDay() === 0 || fechaCalculada.getDay() === 6);

                    if (yaPasoHoraCorte || esFinSemana) {
                        fechaCalculada.setDate(fechaCalculada.getDate() + 1);
                        while (fechaCalculada.getDay() === 0 || fechaCalculada.getDay() === 6) {
                            fechaCalculada.setDate(fechaCalculada.getDate() + 1);
                        }
                    }
                    fechaCalculada.setHours(hLimite, mLimite, 0, 0);
                    horaLimiteTexto = blogger_formatearFechaEnEspanol(fechaCalculada);
                }
            }
        } catch (e) {
            console.warn("Error en cálculo de hora límite:", e);
        }

        mensaje += `*FORMA DE ENVIO:* ${venta.agencia_entrega || "RETIRO TIENDA"}\n`;
        mensaje += `*${esRetiro ? 'HORA LIMITE DE RETIRO' : 'HORA ENTREGA'}:* ${horaLimiteTexto}\n`;

        // 3. Pago y Detalle
        mensaje += `*FORMA DE PAGO:* ${venta.forma_pago || "Efectivo"}\n`;
        mensaje += `\n*PEDIDO:*\n${detalle_pedido || ""}\n`;

        // 4. Totales
        if (parseFloat(venta.recargo_valor) > 0) {
            mensaje += `*RECARGO POR PAGO (${venta.recargo_pago || 0}%):* ${venta.moneda}${venta.recargo_valor}\n`;
        }
        mensaje += `*TOTAL PEDIDO:* ${venta.moneda}${venta.total}\n`;

        return mensaje;
    } catch (e) {
        console.error("Fallo critico en generarMensajeWhatsApp:", e);
        return `Pedido Registrado: ${codigoventa}\nSu pedido ha sido recibido correctamente.`;
    }
}

function blogger_formatearFechaEnEspanol(fecha) {
    if (!(fecha instanceof Date) || isNaN(fecha.getTime())) {
        return "Fecha no disponible";
    }
    const diasIngles = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const diasEspanol = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

    const mesesIngles = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const mesesEspanol = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    try {
        let str = Utilities.formatDate(fecha, "America/Argentina/Buenos_Aires", "EEEE d 'de' MMMM 'a las' HH:mm 'hs'");

        // Reemplazar días
        for (let i = 0; i < diasIngles.length; i++) {
            const regex = new RegExp(diasIngles[i], "g");
            str = str.replace(regex, diasEspanol[i]);
        }

        // Reemplazar meses
        for (let i = 0; i < mesesIngles.length; i++) {
            const regex = new RegExp(mesesIngles[i], "g");
            str = str.replace(regex, mesesEspanol[i]);
        }

        return str.charAt(0).toUpperCase() + str.slice(1);
    } catch (e) {
        return fecha.toLocaleString();
    }
}

function blogger_formatearFecha(fecha) {
    return (fecha instanceof Date && !isNaN(fecha))
        ? { label: "UPD", valor: Utilities.formatDate(fecha, "GMT-3", "dd-MM-yyyy") }
        : undefined;
}

function blogger_crearMapaColores(coloresBD) {
    const mapa = new Map();
    const mCol = HeaderManager.getMapping("COLORS");
    for (const row of coloresBD) {
        const nombre = row[mCol.ID];
        let hex = row[mCol.HEXADECIMAL] || "cccccc";
        if (!hex.startsWith("#")) hex = "#" + hex;
        mapa.set(nombre, hex);
    }
    return mapa;
}

function blogger_modeloJson(valor, label = "Modelo", icono) {
    if (!valor) return undefined;
    const json = { label, valor };
    if (icono) json.icono = icono;
    return json;
}

function blogger_getGeneroIcono(valor) {
    return valor === "Hombre" ? "♂️"
        : valor === "Mujer" ? "♀️"
            : valor === "Unisex" ? "⚧"
                : "";
}

function blogger_getTemporadaIcono(valor) {
    return valor === "INVIERNO" ? "❄️"
        : valor === "VERANO" ? "☀️"
            : valor === "SIN-TEMPORADA" ? "🚫"
                : "";
}

/**
 * Verifica el comprobante de pago de una venta Blogger usando Gemini IA.
 * Reutiliza verifyReceiptWithGemini() definida en ExternalClient.js.
 *
 * Payload esperado (POST op=pagar_con_comprobante):
 * {
 *   op: "pagar_con_comprobante",
 *   idpedido: "B-XXXXXXXX",
 *   fileData: {
 *     fileName: "comprobante.jpg",
 *     mimeType: "image/jpeg",
 *     content: "<base64>"
 *   }
 * }
 *
 * Respuesta:
 * {
 *   status: "0",
 *   verified: true|false,
 *   aiReason: "...",
 *   nuevoEstado: "PAGADO"|"REVISION_MANUAL",
 *   fileUrl: "https://drive.google.com/..."
 * }
 */
function blogger_pagar_venta_con_comprobante(payload) {
    const jo = {};
    try {
        const { idpedido, fileData } = payload;
        const appName = GLOBAL_CONFIG.APPSHEET.APP_NAME;

        if (!idpedido || !fileData || !fileData.content) {
            return { status: "-1", message: "Faltan datos: idpedido o fileData" };
        }

        // ── 1. GUARDAR IMAGEN EN DRIVE ────────────────────────────────────────
        const carpetaId = GLOBAL_CONFIG.SCRIPT_CONFIG["BLOGGER_COMPROBANTES_FOLDER_ID"];
        if (!carpetaId) return { status: "-1", message: "Falta BLOGGER_COMPROBANTES_FOLDER_ID. Ejecutá el Installer." };

        const folder = DriveApp.getFolderById(carpetaId);
        const extension = fileData.fileName.includes('.')
            ? fileData.fileName.substring(fileData.fileName.lastIndexOf('.'))
            : '';
        const finalFileName = `${idpedido}.COMPROBANTE.${Math.floor(100000 + Math.random() * 900000)}${extension}`;

        const decodedContent = Utilities.base64Decode(fileData.content);
        const blob = Utilities.newBlob(decodedContent, fileData.mimeType, finalFileName);
        const file = folder.createFile(blob);
        const fileUrl = file.getUrl();
        Logger.log(`[Blogger Comprobante] Guardado: ${finalFileName}`);

        // ── 2. LEER VENTA DESDE BLOGGER_VENTAS ───────────────────────────────
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.BLOGGER_SALES);
        if (!sheet) return { status: "-1", message: `Hoja ${SHEETS.BLOGGER_SALES} no encontrada.` };

        const mS = HeaderManager.getMapping("BLOGGER_SALES");
        const data = sheet.getDataRange().getValues();

        // Buscar la fila (ignorando encabezado, índice 0)
        const rowIndex = data.findIndex((r, i) => i > 0 && String(r[mS.CODIGO]) === String(idpedido));
        if (rowIndex === -1) return { status: "-1", message: `Pedido ${idpedido} no encontrado en ${SHEETS.BLOGGER_SALES}.` };

        const row = data[rowIndex];

        // Construir objeto venta compatible con verifyReceiptWithGemini()
        const ventaData = {
            TOTAL_VENTA: row[mS.TOTAL_VENTA],
            DATOS_TRANSFERENCIA: row[mS.DATOS_TRANSFERENCIA] || ""
        };

        // ── 3. OBTENER DATOS DE CUENTA DESTINO (para prompt IA) ──────────────
        // Intenta leer BD_DATOS_TRANSFERENCIA si existe; sino IA verifica sin esos datos.
        let cuentaData = null;
        try {
            const sheetCuentas = ss.getSheetByName("BD_DATOS_TRANSFERENCIA");
            if (sheetCuentas && ventaData.DATOS_TRANSFERENCIA) {
                const cuentas = convertirRangoAObjetos(sheetCuentas);
                cuentaData = cuentas.find(c => String(c.CUENTA_ID) === String(ventaData.DATOS_TRANSFERENCIA));
            }
        } catch (eCuenta) {
            Logger.log("[Blogger Comprobante] No se pudo leer BD_DATOS_TRANSFERENCIA: " + eCuenta.message);
        }

        // ── 4. VERIFICAR CON GEMINI ← REUTILIZA ExternalClient.js ────────────
        const resultado = verifyReceiptWithGemini(blob, ventaData, cuentaData);
        Logger.log("[Blogger Comprobante] IA resultado: " + JSON.stringify(resultado));

        // ── 5. ACTUALIZAR ESTADO EN HOJA ──────────────────────────────────────
        const nuevoEstado = resultado.verified ? "PAGADO" : "REVISION_MANUAL";
        sheet.getRange(rowIndex + 1, mS.ESTADO + 1).setValue(nuevoEstado);

        // ASIGNAR CAJA SI ESTÁ PAGADO
        if (nuevoEstado === "PAGADO" && mS.CAJA_ID !== undefined) {
            try {
                const activeBoxId = getCurrentOpenBoxId();
                if (activeBoxId) {
                    sheet.getRange(rowIndex + 1, mS.CAJA_ID + 1).setValue(activeBoxId);
                }
            } catch (e) { }
        }

        // Actualizar DETALLE_JSON con el nuevo estado y URL
        updateBloggerJson(sheet, rowIndex, mS, {
            estado: nuevoEstado,
            comprobante_url: fileUrl,
            fecha_pago: new Date().toISOString()
        });

        // Guardar URL del comprobante si la columna existe en el mapping
        if (mS.URL_COMPROBANTE !== undefined) {
            sheet.getRange(rowIndex + 1, mS.URL_COMPROBANTE + 1).setValue(fileUrl);
        }

        // ── 6. NOTIFICAR TELEGRAM ─────────────────────────────────────────────
        // ── 6. NOTIFICAR TELEGRAM ─────────────────────────────────────────────
        const iconEstado = resultado.verified ? "✅" : "⚠️";
        const etiquetaEstado = resultado.verified ? "APROBADO" : "REVISIÓN MANUAL";

        const mensajeTelegram =
            `🧾 <b>Comprobante Blogger</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `💻 Sistema: ${appName}\n` +
            `🌐 Entorno: CLIENT\n` +
            `📅 Fecha: ${new Date().toLocaleString("es-AR")}\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `📝 <b>Reporte de Verificación IA:</b>\n` +
            `Pedido: <code>${idpedido}</code>\n` +
            `IA: ${iconEstado} <b>${etiquetaEstado}</b>\n` +
            `Motivo: ${resultado.reason || "-"}\n` +
            `Monto detectado: ${resultado.extracted_amount || "-"}\n` +
            `Receptor detectado: ${resultado.extracted_receiver || "-"}\n\n` +
            `Estado Final → <b>${nuevoEstado}</b>`;

        notificarTelegramSalud(mensajeTelegram, resultado.verified ? "EXITO" : "ADVERTENCIA");

        jo.status = "0";
        jo.verified = resultado.verified;
        jo.aiReason = resultado.reason || "";
        jo.nuevoEstado = nuevoEstado;
        jo.fileUrl = fileUrl;
        jo.message = resultado.verified
            ? "✅ Pago verificado por IA. Estado actualizado a PAGADO."
            : "⚠️ No se pudo verificar automáticamente. Estado: REVISION_MANUAL.";

    } catch (e) {
        console.error("[Blogger Comprobante] Error:", e);
        jo.status = "-1";
        jo.message = e.toString();
    }
    return jo;
}

/**
 * Confirma un pago presencial (Efectivo, Débito, Crédito).
 * Cambia el estado a REVISION_MANUAL para que el vendedor lo confirme luego.
 * 
 * @param {Object} contents - { op: "confirmar_pago_presencial", idpedido: "..." }
 */
function blogger_confirmar_pago_presencial(contents) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);
        const pedidoId = contents.idpedido;
        if (!pedidoId) return { status: "-1", message: "Falta ID del pedido" };

        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BLOGGER_VENTAS"); // Usar nombre hardcoded o del schema
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const mS = HeaderManager.getMapping("BLOGGER_SALES"); // Fix: Usar getMapping existente

        // Buscar pedido
        let rowIndex = -1;
        for (let i = 1; i < data.length; i++) {
            if (String(data[i][mS.CODIGO]) === String(pedidoId)) {
                rowIndex = i;
                break;
            }
        }

        if (rowIndex === -1) return { status: "-1", message: "Pedido no encontrado" };

        // Actualizar estado
        const estadoActual = data[rowIndex][mS.ESTADO];
        if (estadoActual === "PAGADO") {
            return { status: "-1", message: "El pedido ya figura como PAGADO." };
        }

        const nuevoEstado = contents.nuevoEstado || "REVISION_MANUAL";
        sheet.getRange(rowIndex + 1, mS.ESTADO + 1).setValue(nuevoEstado);

        // ASIGNAR CAJA SI ES PAGADO O ENTREGADO
        if ((nuevoEstado === "PAGADO" || nuevoEstado === "ENTREGADO") && mS.CAJA_ID !== undefined) {
            try {
                const activeBoxId = getCurrentOpenBoxId();
                if (activeBoxId) {
                    sheet.getRange(rowIndex + 1, mS.CAJA_ID + 1).setValue(activeBoxId);
                }
            } catch (e) { }
        }

        // Actualizar DETALLE_JSON
        updateBloggerJson(sheet, rowIndex, mS, {
            estado: nuevoEstado,
            metodo_pago_presencial: true,
            fecha_confirmacion: new Date().toISOString()
        });

        // Notificar Telegram
        try {
            const mensaje = `💳 <b>Pago Presencial Reportado</b>\n` +
                `🆔 Pedido: <code>${pedidoId}</code>\n` +
                `ℹ️ Estado: <b>${nuevoEstado}</b>\n` +
                `👤 Cliente: ${data[rowIndex][mS.CLIENTE_ID] || "?"}\n` +
                `💰 Monto: ${data[rowIndex][mS.TOTAL_VENTA] || "?"}`;

            // Usar funcion existente de notificación si es posible, o enviar directo
            // Asumiendo que existe enviarNotificacionTelegram
            enviarNotificacionTelegramSimple(mensaje);
        } catch (e) {
            console.error("Error notificando Telegram: " + e.message);
        }

        return {
            status: "0",
            message: "Pago registrado para revisión manual.",
            nuevoEstado: nuevoEstado
        };

    } catch (e) {
        console.error(e);
        return { status: "-1", message: "Error: " + e.message };
    } finally {
        lock.releaseLock();
    }
}

/**
 * Helper simple para notificar (si no se exporta la del bot)
 */
function enviarNotificacionTelegramSimple(msg) {
    // Intentar usar la global si existe
    if (typeof notificarTelegramSalud === 'function') {
        // Es para salud, mejor usar la config
        const token = GLOBAL_CONFIG.TELEGRAM.BOT_TOKEN;
        const chatId = GLOBAL_CONFIG.TELEGRAM.CHAT_ID;
        if (token && chatId) {
            UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "post",
                payload: { chat_id: chatId, text: msg, parse_mode: "HTML" }
            });
        }
    }
}


/**
 * Centralized router for Blogger operations.
 * Handles both JSON strings (from POST) and Objects (from GET/Parameters).
 */
function blogger_router(data) {
    try {
        let payload = data;
        if (typeof data === "string") {
            try {
                payload = JSON.parse(data);
            } catch (e) {
                console.error("Error parseando payload Blogger:", e);
                return { status: "-1", message: "Error de formato JSON: " + e.toString() };
            }
        }

        // SOPORTE PARA JSONP CROSS-DOMAIN (Frontend envía objeto serializado puro en url parameter)
        if (payload && payload.venta_data) {
            try {
                // EXTREMADAMENTE CRITICO: `data` (e.parameter) es un Proxy Object en Google Apps Script
                // que ES DE SOLO LECTURA y TRAGA (ignora) silenciosamente cualquier intento de asignarle
                // nuevas propiedades (como "detalle" desde inner).
                // DEBEMOS CLONARLO EN UN OBJETO NATIVO JS.
                let unproxiedPayload = {};
                for (let k in payload) unproxiedPayload[k] = payload[k];

                const inner = JSON.parse(unproxiedPayload.venta_data);

                Object.keys(inner).forEach(k => {
                    unproxiedPayload[k] = inner[k];
                });

                payload = unproxiedPayload; // Reasignamos la variable para que el switch(op) funcione sobre el clon completo.

            } catch (e) {
                console.warn("No se pudo parsear venta_data anidado:", e);
                return { status: "-1", message: "CRÍTICO EN SERVIDOR: El payload JSONP llegó truncado o corrupto. Error: " + e.message };
            }
        }

        const op = payload.op || payload.accion || payload.o || "";
        debugLog("📡 [Blogger Router] Operación: " + op, true);

        switch (op) {
            case "venta":
                return blogger_registrar_venta(payload);

            case "p":           // Paga (Visor de pedido)
            case "d":           // Detalle (Visor de pedido)
            case "e":           // Edicion (Cargar datos de pedido/cliente)
            case 'consultar_cliente':
                return blogger_consultar_cliente(payload);
            case 'cargar_venta':
                return blogger_cargar_venta(payload);

            case "pagar":
                return blogger_pagar_venta(payload);

            case "cancelar":
                return blogger_cancelar_venta(payload);

            case "confirmar_pago_presencial":
                return blogger_confirmar_pago_presencial(payload);

            case "pagar_con_comprobante":
                return blogger_pagar_venta_con_comprobante(payload);

            case "configuracion":
                let resConfig = blogger_obtenerConfiguracionDesdeDrive();

                // Parsear a objeto si la caché viene serializada como string desde Drive
                if (resConfig && typeof resConfig === "string") {
                    try {
                        resConfig = JSON.parse(resConfig);
                    } catch (errJson) {
                        debugLog("⚠️ [Blogger Router] Error parseando caché de Drive. Forzando regeneración.");
                        resConfig = null;
                    }
                }

                if (!resConfig || payload.refresh === true) {
                    debugLog("⚠️ [Blogger Router] Caché no disponible o refresh forzado. Generando config en tiempo real (Local)...", true);
                    resConfig = blogger_listar_configuracion_sinCache(true); // forzar local
                }

                if (payload.id && resConfig && typeof resConfig === "object") {
                    blogger_adjuntar_pedido_a_respuesta(resConfig, payload.id);
                }
                return resConfig;

            case "health":
                return {
                    status: "0",
                    health: blogger_obtenerResumenSalud(),
                    server_time: Date.now()
                };

            default:
                return { status: "-1", message: "Operación no reconocida: " + op };
        }
    } catch (e) {
        console.error("Fallo crítico en blogger_router:", e);
        return { status: "-1", message: "Error crítico: " + e.toString() };
    }
}

function updateBloggerJson(sheet, rowIndex, mS, updates) {
    try {
        if (mS.DETALLE_JSON === undefined) return;

        // Columna es 1-indexed, array map es 0-indexed, rowIndex es 0-indexed relative to data
        // pero getRange usa 1-indexed absoluto. rowIndex viene de loop data[i] donde data[0] es header.
        // Ojo: en las funciones de arriba rowIndex viene de data.findIndex.
        // Si rowIndex es 10 (fila 11 en sheet), getRange debe ser rowIndex+1.

        const cell = sheet.getRange(rowIndex + 1, mS.DETALLE_JSON + 1);
        const jsonRaw = cell.getValue();
        let json = {};
        try { json = JSON.parse(jsonRaw); } catch (e) { }

        // Aplicar updates
        Object.assign(json, updates);

        cell.setValue(JSON.stringify(json));
    } catch (e) {
        console.error("Error actualizando JSON Blogger: " + e.message);
    }
}

/**
 * Consulta un cliente en BD_CLIENTES vía AppSheet API (o Smart Cache).
 * @param {Object} payload { id: string, email: string }
 */
function blogger_consultar_cliente(payload) {
    try {
        const id = (payload.id || "").toString().trim();
        const email = (payload.email || "").toString().trim();

        if (!id || !email) {
            return { status: "-1", message: "Faltan datos de ID o Correo." };
        }

        // Usamos la lógica de AppSheetApi.js para búsqueda consistente
        const cliente = appsheet_findRecord("BD_CLIENTES", "CLIENTE_ID", id);

        if (cliente) {
            // Validación de seguridad: el correo debe coincidir
            const correoBD = (cliente.CORREO_ELECTRONICO || "").toString().toLowerCase().trim();
            if (correoBD === email.toLowerCase()) {
                debugLog(`🔍 [Blogger API] Cliente ${id} validado exitosamente.`);
                return { status: "0", message: "Cliente validado", cliente: cliente };
            } else {
                return { status: "-1", message: "El ID existe, pero el correo no coincide con el registrado." };
            }
        } else {
            return { status: "-1", message: "Cliente no encontrado. Verifique sus datos o regístrese." };
        }
    } catch (e) {
        debugLog("❌ Error en blogger_consultar_cliente: " + e.message);
        return { status: "-1", message: "Error interno en la consulta." };
    }
}
