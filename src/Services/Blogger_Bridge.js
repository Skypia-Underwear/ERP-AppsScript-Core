/**
 * =====================================================================================
 * ARCHIVO: Blogger_Bridge.js
 * RESPONSABILIDAD: Puente de integración para el ecosistema de Blogger.
 * VERSIÓN: 3.1 (Dynamic Mapping Refactored)
 * =====================================================================================
 */


function blogger_listar_configuracion_sinCache() {
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
    const rowsAgencias = getData("SHIPPING_AGENCIES");
    const rowsInventario = getData("INVENTORY");
    const rowsColores = getData("COLORS");

    const sheetConfig = ss.getSheetByName(SHEETS.GENERAL_CONFIG);
    const configRow = sheetConfig.getRange(2, 1, 1, sheetConfig.getLastColumn()).getValues()[0];
    const tipoRegistroProducto = (configRow[mG.TIPO_REGISTRO] || "").toString().trim().toUpperCase();
    const excluirSurtidosVariedades = blogger_esVerdadero(configRow[mG.EXCLUIR_SURTIDOS]);
    const urlImagenSinImagen = blogger_getPublicImageURL(appName, configRow[mG.SIN_IMAGEN], SHEETS.GENERAL_CONFIG);
    const limiteImagenesPorProducto = configRow[mG.LIMITE_IMAGENES] || 10;
    const aplicarMarcaDeAgua = blogger_esVerdadero(configRow[mG.MARCA_AGUA]);

    const sheetTiendas = ss.getSheetByName(SHEETS.STORES);
    const mShtT = HeaderManager.getMapping("STORES");
    const tiendaId = sheetTiendas.getRange(2, mShtT.TIENDA_ID + 1).getValue();
    const celularTienda = sheetTiendas.getRange(2, (mShtT.CELULAR !== undefined ? mShtT.CELULAR : 10) + 1).getValue(); // Fallback to index 10 (col 11) if mapping fails

    const sheetBlogger = ss.getSheetByName(SHEETS.BLOGGER_CONFIG);
    const moneda = sheetBlogger.getRange(9, 2).getValue() || "$";

    const mapCategoriasHtml = Object.fromEntries(rowsCategorias.map(r => [r[mC.ID], r[mC.HTML]]));
    const mapCategoriasIconos = Object.fromEntries(rowsCategorias.map(r => [r[mC.ID], r[mC.ICONO]]));
    const mapSvg = Object.fromEntries(rowsSvg.map(r => [r[mS.NOMBRE], r[mS.CODE]]));
    const mapCategoriaAPadre = Object.fromEntries(rowsCategorias.map(r => [r[mC.ID], r[mC.PADRE] || "GENERAL"]));

    // Imágenes
    const imagenesPorProducto = {};
    for (const r of rowsImagenes) {
        const pId = r[mI.PRODUCTO_ID];
        if (blogger_esVerdadero(r[mI.ESTADO]) && r[mI.URL] && r[mI.TIPO_ARCHIVO] !== 'video') {
            if (!imagenesPorProducto[pId]) imagenesPorProducto[pId] = [];
            imagenesPorProducto[pId].push({
                url: r[mI.URL],
                thumbnail_url: r[mI.THUMBNAIL_URL] || "",
                archivo_id: r[mI.ARCHIVO_ID],
                portada: blogger_esVerdadero(r[mI.PORTADA]),
                orden: (mI.ORDEN !== undefined) ? (parseInt(r[mI.ORDEN]) || 999) : 999,
                fecha_carga: r[mI.FECHA_CARGA]
            });
        }
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
                const catPadre = mapCategoriaAPadre[categoriaActual];
                const iconoBuscado = mapCategoriasIconos[categoriaActual] || categoriaActual;
                const catObjeto = {
                    codigo: contadorCategoria,
                    nombre: categoriaActual,
                    url_categoria: blogger_getWhatsAppPublicURL(appName, mapCategoriasHtml[categoriaActual], SHEETS.CATEGORIES),
                    icono: mapSvg[iconoBuscado] || mapSvg[categoriaActual] || "",
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
            // PROCESAR IMÁGENES — ordenadas por campo ORDEN (ascendente)
            let imagenes = (imagenesPorProducto[productoId] || [])
                .filter(img => img.url && !img.url.toLowerCase().includes('_thumb.'))
                .sort((a, b) => {
                    // 1° criterio: ORDEN numérico ascendente
                    if (a.orden !== b.orden) return a.orden - b.orden;
                    // 2° fallback: fecha_carga descendente (comportamiento anterior)
                    return new Date(b.fecha_carga) - new Date(a.fecha_carga);
                });

            const tieneWebp = imagenes.some(img => img.url.toLowerCase().endsWith('.webp'));
            const tieneJpg = imagenes.some(img => img.url.toLowerCase().endsWith('.jpg'));
            if (tieneWebp && tieneJpg) imagenes = imagenes.filter(img => img.url.toLowerCase().endsWith('.webp'));

            if (limiteImagenesPorProducto > 0 && imagenes.length > limiteImagenesPorProducto) {
                const p = imagenes.find(img => img.portada) || imagenes[0];
                imagenes = [p, ...imagenes.filter(img => img !== p).slice(0, limiteImagenesPorProducto - 1)];
            }

            if (imagenes.length === 0) {
                imagenes = [{ url: urlImagenSinImagen, portada: true }];
            } else if (!imagenes.some(img => img.portada)) {
                imagenes[0].portada = true;
            }

            const desc = blogger_generarDescripcionProductoCompleta({
                pId: productoId,
                tipoRegistroProducto,
                rowsProductos,
                rowsInventario,
                rowsImagenes,
                rowsColores,
                tiendaId,
                celularTienda
            });

            recordProducto = {
                codigo: j + 1,
                categoria: categoriaActual,
                nombre: productoId,
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
            const catPadre = mapCategoriaAPadre[categoriaActual];
            const iconoBuscado = mapCategoriasIconos[categoriaActual] || categoriaActual;
            const catObjeto = {
                codigo: contadorCategoria,
                nombre: categoriaActual,
                url_categoria: blogger_getWhatsAppPublicURL(appName, mapCategoriasHtml[categoriaActual], SHEETS.CATEGORIES),
                icono: mapSvg[iconoBuscado] || mapSvg[categoriaActual] || "",
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
        codigo: r[mA.ID], descripcion: r[mA.ID], cuit: r[mA.CUIT] || "", ubicacion: r[mA.UBICACION] || "",
        moneda, costo_envio: r[mA.COSTO] || 0, hora_entrega: r[mA.HORA] || ""
    }));

    const configBloggerJSON = blogger_safeParse(sheetBlogger.getRange(7, 2).getValue());

    return {
        status: '0', message: 'Éxito (Bridge V3)',
        pagina_url: sheetBlogger.getRange(4, 2).getValue(),
        pagina_logo: sheetBlogger.getRange(2, 2).getValue(),
        pagina_tienda: blogger_safeParse(sheetBlogger.getRange(3, 2).getValue()),
        contentagencia: dataArrayAgencia,
        pagina_carrusel: blogger_safeParse(sheetBlogger.getRange(5, 2).getValue()),
        contactabilidad: sheetBlogger.getRange(8, 2).getValue(),
        content: dataArray,
        formas_pago: configBloggerJSON.formas_pago || [],
        cuenta_transferencia_dia: configBloggerJSON.cuenta_transferencia_dia || {},
        aplicar_marca_agua: aplicarMarcaDeAgua
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
        let hex = r[mCol.HEXADECIMAL] || "cccccc";
        if (!hex.startsWith("#")) hex = "#" + hex;
        return [r[mCol.ID], hex];
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

function blogger_generarDescripcionProductoCompleta({ pId, tipoRegistroProducto, rowsProductos, rowsInventario, rowsImagenes, rowsColores, tiendaId, celularTienda }) {
    const mP = HeaderManager.getMapping("PRODUCTS");
    const mInv = HeaderManager.getMapping("INVENTORY");
    const mI = HeaderManager.getMapping("PRODUCT_IMAGES");

    const p = rowsProductos.find(r => r[mP.CODIGO_ID] === pId);
    if (!p) return null;
    const esSimple = tipoRegistroProducto === "PRODUCTO SIMPLE";
    const inv = rowsInventario.filter(r => r[mInv.PRODUCTO_ID] === pId && r[mInv.TIENDA_ID] === tiendaId && (esSimple ? true : Number(r[mInv.STOCK_ACTUAL]) > 0));
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
    const mCol = HeaderManager.getMapping("COLORS");
    const mapColores = Object.fromEntries(rowsColores.map(r => [r[mCol.ID], r[mCol.HEXADECIMAL] || "cccccc"]));
    const listColores = [...colores].map(c => ({ nombre: c, hex: mapColores[c] || "#cccccc" }));
    const videoRow = rowsImagenes.find(r => r[mI.PRODUCTO_ID] === pId && r[mI.TIPO_ARCHIVO] === 'video');
    const video = videoRow ? { label: "Video", url: videoRow[mI.URL], thumbnail: videoRow[mI.THUMBNAIL_URL] } : undefined;
    const msgWA = `¡Hola! Interesado en:\n🔹 Código: ${pId}\n🔹 Modelo: ${p[mP.MODELO] || '-'}\n🔹 Marca: ${p[mP.MARCA] || '-'}\n🔹 Género: ${p[mP.GENERO] || '-'}\n🔹 Talles: ${[...talles].join(', ')}`;

    return {
        modelo: { label: "Modelo", valor: p[mP.MODELO] || "-" },
        marca: { label: "Marca", valor: p[mP.MARCA] || "-" },
        genero: {
            label: "Género",
            valor: p[mP.GENERO] || "-",
            icono: blogger_getGeneroIcono(p[mP.GENERO])
        },
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
    try { return JSON.parse(v || "{}"); } catch (e) { return {}; }
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

function blogger_cargar_venta(informacion) {
    const jo = {};
    try {
        const venta = JSON.parse(informacion);
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.BLOGGER_SALES);
        if (!sheet) throw new Error("Hoja de ventas de Blogger no encontrada");

        const data = sheet.getDataRange().getValues();
        let pedido = null;
        const idBusqueda = (venta.id || "").replace("&m=1", "").replace("?m=1", "");

        const mS = HeaderManager.getMapping("BLOGGER_SALES");

        for (let i = 1; i < data.length; i++) {
            if (String(data[i][mS.CODIGO]) === String(idBusqueda)) {
                pedido = JSON.parse(data[i][mS.DETALLE_JSON]);
                break;
            }
        }

        if (pedido) {
            jo.status = '0'; jo.message = 'OK';
            jo.pedido = pedido; jo.pedido.idpedido = idBusqueda;
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

    const clienteIndex = datosClientes.findIndex((fila, i) => i > 0 && (fila[mC.CLIENTE_ID] || "") === venta.nombre_entrega);
    if (clienteIndex === -1) return;

    const cliente = datosClientes[clienteIndex];
    const nombreCompleto = cliente[mC.NOMBRE_COMPLETO] || "";
    const clienteId = cliente[mC.CLIENTE_ID] || "";
    venta.nombre_entrega_mostrado = nombreCompleto && clienteId ? `${nombreCompleto} (${clienteId})` : nombreCompleto || clienteId;

    if (!venta.rut_entrega && cliente[mC.CUIT_DNI]) venta.rut_entrega = cliente[mC.CUIT_DNI];
    if (!venta.telefono_entrega && cliente[mC.CELULAR]) venta.telefono_entrega = cliente[mC.CELULAR];
    if (!venta.correo_entrega && cliente[mC.CORREO_ELECTRONICO]) venta.correo_entrega = cliente[mC.CORREO_ELECTRONICO];
    venta.agencia_entrega = cliente[mC.AGENCIA_ENVIO] || "";

    if (venta.agencia_entrega) {
        const hojaAgencias = ss.getSheetByName(SHEETS.SHIPPING_AGENCIES);
        if (hojaAgencias) {
            const dataAgencias = hojaAgencias.getRange(2, 1, hojaAgencias.getLastRow() - 1, hojaAgencias.getLastColumn()).getValues();
            const filaAgencia = dataAgencias.find(fila => fila[mA.ID] === venta.agencia_entrega);
            if (filaAgencia) {
                venta.costo_agencia = filaAgencia[mA.COSTO] || "";
                venta.hora_entrega_agencia = filaAgencia[mA.HORA] || "";
            }
        }
    }

    const tipoEnvio = cliente[mC.TIPO_ENVIO] || "";
    if (tipoEnvio === "RETIRO TIENDA") {
        venta.direccion_entrega = "";
    } else {
        let dir = `${cliente[mC.CALLE] || ""} ${cliente[mC.NUMERO] || ""}`.trim();
        if (cliente[mC.PISO]) dir += ` Piso ${cliente[mC.PISO]}`;
        if (cliente[mC.DEPARTAMENTO]) dir += ` Depto ${cliente[mC.DEPARTAMENTO]}`;
        dir += `, CP${cliente[mC.CODIGO_POSTAL] || ""} ${cliente[mC.LOCALIDAD] || ""} - ${cliente[mC.PROVINCIA] || ""}`;
        if (cliente[mC.OBSERVACION]) dir += ` - Obs: ${cliente[mC.OBSERVACION]}`;
        if (tipoEnvio) dir += ` - Tipo Envío: ${tipoEnvio}`;
        if (!venta.direccion_entrega) venta.direccion_entrega = dir;
    }
}

function blogger_buscarClienteExistente(datosClientes, correo, dni, celular) {
    const mC = HeaderManager.getMapping("CLIENTES");
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

function blogger_pagar_venta(informacion) {
    const jo = {};
    try {
        const venta = JSON.parse(informacion);
        const ss = getActiveSS();
        const sheet = ss.getSheetByName(SHEETS.BLOGGER_SALES);
        const mS = HeaderManager.getMapping("BLOGGER_SALES");
        const rows_codigos = sheet.getRange(2, mS.CODIGO + 1, sheet.getLastRow() - 1, 1).getValues();
        const fila_actualizar = rows_codigos.flat().lastIndexOf(venta.idpedido);

        if (fila_actualizar !== -1) {
            sheet.getRange(fila_actualizar + 2, mS.ESTADO + 1).setValue("PAGADO");
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

function blogger_cancelar_venta(informacion) {
    const jo = {};
    try {
        const venta = JSON.parse(informacion);
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
            if ((rowsDetalle[i][0] + "") === (venta.idpedido + "")) {
                hojaDetalle.deleteRow(i + 2);
            }
        }
        jo.status = "0"; jo.message = "Venta y detalles eliminados correctamente";
    } catch (e) {
        jo.status = "-1"; jo.message = e.toString();
    }
    return jo;
}

function blogger_registrar_venta(informacion) {
    const jo = {};
    try {
        let venta = JSON.parse(informacion);
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

        const esClientePublico = (nombre === "CLI001" || (!nombre && !correo));

        if (esClientePublico) {
            venta.nombre_entrega = "CLI001";
            venta.agencia_entrega = venta.agencia_entrega || "RETIRO TIENDA";
        } else if (nombre && correo && !rut && !telefono && !direccion && !agencia) {
            const idx = blogger_buscarClienteExistente(datosClientes, correo, null, null);
            if (idx === -1 || idx === 0) return { status: "1", message: "ID de cliente o correo no encontrado." };

            const idEnBD = (datosClientes[idx][mC.CLIENTE_ID] || "").toString().trim();
            if (idEnBD.toLowerCase() !== nombre.toLowerCase()) return { status: "1", message: "ID de cliente no coincide con el correo." };
            venta.nombre_entrega = idEnBD;
        } else if (nombre && correo && rut && telefono && agencia) {
            const idx = blogger_buscarClienteExistente(datosClientes, correo, rut, telefono);
            if (idx !== -1 && idx > 0) {
                venta.nombre_entrega = datosClientes[idx][mC.CLIENTE_ID];
            } else {
                const nuevaFilaNum = hojaClientes.getLastRow() + 1;
                const clienteID = "CLI" + nuevaFilaNum.toString().padStart(3, "0");
                const nuevaFilaCliente = new Array(hojaClientes.getLastColumn()).fill("");
                nuevaFilaCliente[mC.CLIENTE_ID] = clienteID;
                nuevaFilaCliente[mC.CLASIFICACION] = "SIMPLE";
                nuevaFilaCliente[mC.NOMBRE_COMPLETO] = nombre;
                nuevaFilaCliente[mC.CELULAR] = telefono;
                nuevaFilaCliente[mC.CORREO_ELECTRONICO] = correo;
                nuevaFilaCliente[mC.CUIT_DNI] = rut;
                nuevaFilaCliente[mC.CONDICION_FISCAL] = "Consumidor Final";
                nuevaFilaCliente[mC.AGENCIA_ENVIO] = agencia;
                nuevaFilaCliente[mC.TIPO_ENVIO] = agencia;
                hojaClientes.appendRow(nuevaFilaCliente);
                venta.nombre_entrega = clienteID;
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

        // Guardar Venta (Usando indices del mapeo, asumiendo estructura estándar para appendRow si es posible, o reconstruyendo)
        // Por simplicidad en appendRow manteniendo el orden del ERP:
        sheetVentas.appendRow([
            codigoventa, fechaStr, horaStr, "WEB", venta.forma_pago,
            venta.datos_transferencia_id || "", venta.nombre_entrega,
            venta.rut_entrega, venta.telefono_entrega, venta.correo_entrega,
            venta.direccion_entrega, venta.agencia_entrega,
            venta.hora_entrega_agencia || "", venta.moneda,
            venta.costo_agencia || 0, venta.recargo_valor || 0,
            venta.total, JSON.stringify(venta), "SOLICITADO", ""
        ]);

        const sheetTiendas = ss.getSheetByName(SHEETS.STORES);
        const mShtT = HeaderManager.getMapping("STORES");
        const tiendaId = sheetTiendas ? sheetTiendas.getRange(2, mShtT.TIENDA_ID + 1).getValue() : "T1";
        let detalle_pedido = "";

        venta.detalle.forEach(item => {
            const nombreLimpio = item.nombre.replace(/<\/?b>/g, "").trim();
            item.nombre = nombreLimpio;

            const productID = nombreLimpio.split(" ")[0];
            const contentMatch = nombreLimpio.match(/\(([^)]+)\)/);
            const content = contentMatch ? contentMatch[1].trim() : "";
            const parts = content.split("-").map(p => p.trim());

            const color = parts.length > 1 ? parts[1] : "Surtido";
            let talle = "Surtido";
            if (parts.length > 2) talle = parts.slice(2).join("-");

            const variedadId = `${productID}-${color}-${talle}-${tiendaId}`;
            detalle_pedido += `${nombreLimpio} Cant: ${item.cantidad} x ${item.precio} = ${venta.moneda}${item.total}\n`;

            sheetDetalle.appendRow([
                codigoventa, nombreLimpio, item.categoria, item.cantidad,
                item.precio, item.total, productID, color, talle, variedadId
            ]);
        });

        notificarTelegramSalud(`🛒 <b>Venta Blogger: ${codigoventa}</b>\nCliente: ${venta.nombre_entrega_mostrado || venta.nombre_entrega}\nTotal: ${venta.moneda}${venta.total}`, "EXITO");

        const message_whatsapp = generarMensajeWhatsApp(venta, codigoventa, fechaStr, horaStr, detalle_pedido);

        return {
            status: "0",
            id: codigoventa,
            message: venta.operacion === "e" ? "Se editó la venta exitosamente" : "Se grabó la venta exitosamente",
            message_whatsapp: message_whatsapp
        };
    } catch (e) {
        console.error("Error en blogger_registrar_venta:", e);
        return { status: "-1", message: e.toString() };
    }
}

function generarMensajeWhatsApp(venta, codigoventa, fecha, hora, detalle_pedido) {
    let mensaje = `Pedido: ${venta.url}?o=p&id=${codigoventa}\n`;

    function agregarCampo(campoNombre, campoValor) {
        if (campoValor && campoValor.toString().trim() !== "") {
            mensaje += `*${campoNombre}:*\n${campoValor}\n`;
        }
    }

    const fechaObj = new Date(`${fecha}T${hora}`);
    const fechaPedidoFormateada = blogger_formatearFechaEnEspanol(fechaObj);

    agregarCampo("FECHA DEL PEDIDO", fechaPedidoFormateada);
    agregarCampo('NOMBRE Y APELLIDOS', venta.nombre_entrega_mostrado || venta.nombre_entrega);
    agregarCampo('DOCUMENTO', venta.rut_entrega);
    agregarCampo('CONDICION FISCAL', venta.condicion_fiscal || "Consumidor Final");
    agregarCampo('TELEFONO', venta.telefono_entrega);
    agregarCampo('CORREO', venta.correo_entrega);
    agregarCampo('DIRECCION', venta.direccion_entrega);
    agregarCampo('FORMA DE ENVIO', venta.agencia_entrega);

    try {
        const esRetiroTienda = (venta.agencia_entrega || "").toUpperCase() === "RETIRO TIENDA";
        const etiquetaHora = esRetiroTienda ? 'HORA LIMITE DE RETIRO' : 'HORA ENTREGA';
        if (venta.hora_entrega_agencia) {
            // Lógica Hoy vs Mañana
            const [h, m] = (venta.hora_entrega_agencia + "").split(":").map(Number);
            const fechaHoraEntrega = new Date(fechaObj);
            fechaHoraEntrega.setHours(h || 12, m || 0, 0, 0);

            const ahoraArg = new Date(Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "yyyy-MM-dd'T'HH:mm:ss"));
            if (fechaHoraEntrega < ahoraArg) {
                fechaHoraEntrega.setDate(fechaHoraEntrega.getDate() + 1);
            }

            const mensajeFinal = blogger_formatearFechaEnEspanol(fechaHoraEntrega);
            agregarCampo(etiquetaHora, mensajeFinal);
        } else {
            agregarCampo(etiquetaHora, "No especificada");
        }
    } catch (e) {
        agregarCampo("HORA ENTREGA", venta.hora_entrega_agencia);
    }

    agregarCampo('FORMA DE PAGO', venta.forma_pago);

    if (venta.forma_pago === 'Transferencia' && venta.datos_transferencia_id) {
        // En un entorno integrado real, aquí buscaríamos los datos de la cuenta. 
        // Para el bridge, simplificamos o mostramos el ID si no hay más.
    }

    mensaje += `*PEDIDO:*\n${detalle_pedido}\n`;

    if (venta.costo_agencia) {
        mensaje += `*COSTO ENVÍO:* ${venta.moneda}${venta.costo_agencia}\n`;
    }

    if (venta.recargo_pago && venta.recargo_valor) {
        mensaje += `*RECARGO POR PAGO (${venta.recargo_pago}%):* ${venta.moneda}${venta.recargo_valor}\n`;
    }

    mensaje += `*TOTAL PEDIDO:* ${venta.moneda}${venta.total}\n`;

    return mensaje;
}

function blogger_formatearFechaEnEspanol(fecha) {
    const diasIngles = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const diasEspanol = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

    const mesesIngles = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const mesesEspanol = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

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

    // Capitalizar primera letra
    return str.charAt(0).toUpperCase() + str.slice(1);
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

        // Guardar URL del comprobante si la columna existe en el mapping
        if (mS.URL_COMPROBANTE !== undefined) {
            sheet.getRange(rowIndex + 1, mS.URL_COMPROBANTE + 1).setValue(fileUrl);
        }

        // ── 6. NOTIFICAR TELEGRAM ─────────────────────────────────────────────
        const iconEstado = resultado.verified ? "✅" : "⚠️";
        const etiquetaEstado = resultado.verified ? "APROBADO" : "REVISIÓN MANUAL";
        notificarTelegramSalud(
            `🧾 <b>Comprobante Blogger</b>\n` +
            `Pedido: <code>${idpedido}</code>\n` +
            `IA: ${iconEstado} ${etiquetaEstado}\n` +
            `Motivo: ${resultado.reason || "-"}\n` +
            `Monto detectado: ${resultado.extracted_amount || "-"}\n` +
            `Receptor detectado: ${resultado.extracted_receiver || "-"}\n` +
            `Estado → <b>${nuevoEstado}</b>`,
            resultado.verified ? "EXITO" : "ERROR"
        );

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
