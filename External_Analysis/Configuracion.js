function listar_configuracion_sinCache() {
  // ✅ Usa la constante global para el appName (se usará después)
  const appName = CONFIG.IDS.APP_ID;
  // ✅ Usa la constante global para el ID del Spreadsheet
  const ss = SpreadsheetApp.openById(CONFIG.IDS.SPREADSHEET);

  // 📦 Constantes de nombre de hoja
  // ✅ Se mantiene el objeto local SHEETS, pero se alimenta desde CONFIG.SHEETS
  const SHEETS = {
    productos: CONFIG.SHEETS.PRODUCTOS,
    variedades: CONFIG.SHEETS.VARIEDADES,
    imagenes: CONFIG.SHEETS.IMAGENES,
    categorias: CONFIG.SHEETS.CATEGORIAS,
    svg: CONFIG.SHEETS.GALERIA_SVG,
    config: CONFIG.SHEETS.CONFIG_GENERAL,
    agencias: CONFIG.SHEETS.AGENCIAS_ENVIO,
    inventario: CONFIG.SHEETS.INVENTARIO,
    colores: CONFIG.SHEETS.COLORES,
    tiendas: CONFIG.SHEETS.TIENDAS,
    blogger: CONFIG.SHEETS.CONFIG_BLOGGER
  };

  const getData = (sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.length > 1 ? data.slice(1) : [];
  };

  // 🧾 Obtener datos
  const rowsProductos = getData(SHEETS.productos);
  const rowsVariedades = getData(SHEETS.variedades);
  const rowsImagenes = getData(SHEETS.imagenes);
  const rowsCategorias = getData(SHEETS.categorias);
  const rowsSvg = getData(SHEETS.svg);
  const rowsAgencias = getData(SHEETS.agencias);
  const rowsInventario = getData(SHEETS.inventario);
  const rowsColores = getData(SHEETS.colores);

  const sheetTiendas = ss.getSheetByName(SHEETS.tiendas);
  const tiendaId = sheetTiendas.getRange(2, 1).getValue();
  const celularTienda = sheetTiendas.getRange(2, 10).getValue();

  const sheetConfig = ss.getSheetByName(SHEETS.config);
  // ✅ Se usan las constantes en lugar de "O2", "Q2", etc.
  const tipoRegistroProducto = (sheetConfig.getRange(2, CONFIG.COLS.CONFIG_GENERAL.TIPO_REGISTRO_PRODUCTO).getValue() || "").toString().trim().toUpperCase();
  const excluirSurtidosVariedades = esVerdadero(sheetConfig.getRange(2, CONFIG.COLS.CONFIG_GENERAL.EXCLUIR_SURTIDOS_VARIANTES).getValue());
  // ✅ Llamamos a la función de Utils pasándole el appName
  const urlImagenSinImagen = getPublicImageURL(appName, sheetConfig.getRange(2, CONFIG.COLS.CONFIG_GENERAL.SIN_IMAGEN).getValue(), SHEETS.config);
  const limiteImagenesPorProducto = sheetConfig.getRange(2, CONFIG.COLS.CONFIG_GENERAL.LIMITE_IMAGENES_PRODUCTO).getValue() || 10;
  const aplicarMarcaDeAgua = esVerdadero(sheetConfig.getRange(2, CONFIG.COLS.CONFIG_GENERAL.APLICAR_MARCA_DE_AGUA).getValue());

  const sheetBlogger = ss.getSheetByName(SHEETS.blogger);
  // ✅ Se usa la constante para la columna (la fila 9 es específica de este dato)
  const moneda = sheetBlogger.getRange(9, 2).getValue();

  const mapCategorias = Object.fromEntries(rowsCategorias.map(r => [r[1], r[7]]));
  const mapSvg = Object.fromEntries(rowsSvg.map(r => [r[1], r[3]]));
  // Mapea CATEGORIA_ID (hija, ej: "Boxer") a CATEGORIA_GENERAL (padre, ej: "ROPA INTERIOR")
  const mapCategoriaAPadre = Object.fromEntries(rowsCategorias.map(r => [r[1], r[0] || "SIN CATEGORIZAR"])); // r[1] es CATEGORIA_ID, r[0] es CATEGORIA_GENERAL


  const imagenesPorProducto = {};
  for (const r of rowsImagenes) {
    const [, productoId, carpetaId, , archivoId, url, estado, fechaCarga, fuente, portada, tipoArchivo, thumbnailUrl] = r;

    if (esVerdadero(estado) && url && tipoArchivo !== 'video') {
      if (!imagenesPorProducto[productoId]) imagenesPorProducto[productoId] = [];
      imagenesPorProducto[productoId].push({
        url: url,
        thumbnail_url: thumbnailUrl || "",
        tipo_archivo: tipoArchivo || "imagen",
        archivo_id: archivoId,
        carpeta_id: carpetaId,
        portada: esVerdadero(portada),
        estado: estado,
        fecha_carga: fechaCarga,
        fuente: fuente || ""
      });
    }
  }

  const dataArrayAgencia = rowsAgencias.map(r => ({
    codigo: r[0],
    descripcion: r[0],
    cuit: r[3] || "",
    ubicacion: r[4] || "",
    moneda: moneda,
    costo_envio: r[1] || 0,
    hora_entrega: r[2] || ""
  }));

  // <<< ¡LÍNEA MODIFICADA! 
  // const dataArray = []; // Se reemplaza esta línea
  const dataArrayPadre = {}; // <<< Por esta. Usaremos un objeto para agrupar.

  const rowsVisibles = rowsVariedades.filter(row => esVerdadero(row[6]));

  rowsVisibles.sort((a, b) => {
    if (a[1] === b[1]) {
      if (a[2] === b[2]) return new Date(b[7]) - new Date(a[7]);
      return a[2].localeCompare(b[2]);
    }
    return a[1].localeCompare(b[1]);
  });

  let categoriaActual = "", productoActual = "", dataArrayCategoria = [], contadorCategoria = 0, recordProducto = {};
  const inventarioIndex = indexarInventario(rowsInventario);

  rowsVisibles.forEach((row, j) => {
    const [, categoria, productoId, variedadNombre, precio, minima, , fechaUpd] = row;
    if (!categoria || !productoId || !variedadNombre) return;

    if (categoria !== categoriaActual) {
      if (categoriaActual) { // <<< Si ya había una categoría (ej: "Boxer")
        
        // <<< ¡BLOQUE MODIFICADO! (Antes hacía dataArray.push)
        // 1. Obtener el nombre de la Categoría Padre (ej: "ROPA INTERIOR")
        const categoriaPadre = mapCategoriaAPadre[categoriaActual];

        // 2. Crear el objeto de la Categoría Hija (Boxer) con sus productos
        const categoriaObjeto = {
          codigo: contadorCategoria,
          nombre: categoriaActual, // <-- Este es el nombre "Hijo" (ej: Boxer)
          url_categoria: getWhatsAppPublicURL(mapCategorias[categoriaActual], SHEETS.categorias),
          icono: mapSvg[categoriaActual] || "",
          producto: dataArrayCategoria // <-- Array de productos de "Boxer"
        };

        // 3. Asegurarse de que exista el array para la Categoría Padre
        if (!dataArrayPadre[categoriaPadre]) {
          dataArrayPadre[categoriaPadre] = [];
        }

        // 4. Agregar la Categoría Hija (Boxer) a su Padre (ROPA INTERIOR)
        dataArrayPadre[categoriaPadre].push(categoriaObjeto);
        // <<< FIN DEL BLOQUE MODIFICADO

        dataArrayCategoria = []; // Reseteamos para la nueva categoría
      }
      categoriaActual = categoria;
      contadorCategoria++;
    }

    const sub_variedad = construirSubVariedad({
      codigoProducto: productoId,
      variedad: variedadNombre,
      inventarioIndex,
      coloresBD: rowsColores,
      tiendaId,
      excluirSurtidos: excluirSurtidosVariedades
    });

    const variedad = { moneda, precio, variedad: variedadNombre, minima, sub_variedad };

    // Obtenemos las imágenes y aplicamos el filtro para excluir miniaturas ('_thumb.')
    let imagenes = (imagenesPorProducto[productoId] || [])
      .filter(img => img.url && !img.url.toLowerCase().includes('_thumb.'))
      .sort((a, b) => new Date(b.fecha_carga) - new Date(a.fecha_carga));

    // Comprobamos si, después de filtrar, quedan imágenes con formato WebP y JPG
    const tieneWebp = imagenes.some(img => img.url && img.url.toLowerCase().endsWith('.webp'));
    const tieneJpg = imagenes.some(img => img.url && img.url.toLowerCase().endsWith('.jpg'));

    // Si existen ambos formatos para un mismo producto, priorizamos y nos quedamos solo con WebP
    if (tieneWebp && tieneJpg) {
      imagenes = imagenes.filter(img => img.url && img.url.toLowerCase().endsWith('.webp'));
    }

    // =================================================================
    // === Vertical Limit               NUEVA LÓGICA DE LÍMITE DE IMÁGENES        ===
    // =================================================================
    // Verificamos si la cantidad de imágenes supera el límite establecido y si el límite es mayor que cero
    if (limiteImagenesPorProducto > 0 && imagenes.length > limiteImagenesPorProducto) {
      Logger.log(`⚠️ Producto '${productoId}' tiene ${imagenes.length} imágenes. Aplicando límite de ${limiteImagenesPorProducto}.`);

      // 1. Buscamos y guardamos la imagen de portada
      const imagenPortada = imagenes.find(img => img.portada === true);

      // 2. Creamos una lista con el resto de las imágenes (sin la portada)
      const otrasImagenes = imagenes.filter(img => img.portada !== true);

      // 3. Creamos el nuevo array limitado, empezando por la portada si existe
      let imagenesLimitadas = [];
      if (imagenPortada) {
        imagenesLimitadas.push(imagenPortada);
      }

      // 4. Rellenamos el resto de los espacios con las imágenes más recientes (ya están ordenadas)
      const espaciosRestantes = limiteImagenesPorProducto - imagenesLimitadas.length;
      if (espaciosRestantes > 0) {
        imagenesLimitadas = imagenesLimitadas.concat(otrasImagenes.slice(0, espaciosRestantes));
      }

      // 5. Reemplazamos el array original por el limitado
      imagenes = imagenesLimitadas;
    }

    // Si, tras todos los filtros, no queda ninguna imagen, asignamos una de marcador de posición (placeholder)
    if (imagenes.length === 0) {
      imagenes = [{ url: urlImagenSinImagen, portada: true, fecha_carga: new Date().toISOString(), fuente: "placeholder" }];
    } else if (!imagenes.some(img => img.portada)) {
      // Si hay imágenes pero ninguna está marcada como portada, asignamos la primera (la más reciente) como portada.
      imagenes[0].portada = true;
    }

    const descripcionJSON = generarDescripcionProductoSimple({
      codigoId: productoId,
      tipoRegistroProducto,
      productos: rowsProductos,
      inventario: rowsInventario,
      rowsImagenes: rowsImagenes,
      coloresBD: rowsColores,
      tiendaId,
      celularTienda
    });

    if (productoActual !== productoId) {
      recordProducto = {
        codigo: j + 1,
        categoria: categoriaActual,
        nombre: productoId,
        descripcion: descripcionJSON,
        imagen: imagenes,
        variedad: [variedad],
        upd: fechaUpd
      };
      dataArrayCategoria.push(recordProducto);
      productoActual = productoId;
    } else {
      recordProducto.variedad.push(variedad);
    }

    if (j === rowsVisibles.length - 1) { // <<< Si es el último item del bucle
      
      // <<< ¡BLOQUE MODIFICADO! (Antes hacía dataArray.push)
      // 1. Obtener el nombre de la Categoría Padre
      const categoriaPadre = mapCategoriaAPadre[categoriaActual];

      // 2. Crear el objeto de la Categoría Hija (la última)
      const categoriaObjeto = {
        codigo: contadorCategoria,
        nombre: categoriaActual,
        url_categoria: getWhatsAppPublicURL(mapCategorias[categoriaActual], SHEETS.categorias),
        icono: mapSvg[categoriaActual] || "",
        producto: dataArrayCategoria
      };

      // 3. Asegurarse de que exista el array para la Categoría Padre
      if (!dataArrayPadre[categoriaPadre]) {
        dataArrayPadre[categoriaPadre] = [];
      }

      // 4. Agregar la Categoría Hija a su Padre correspondiente
      dataArrayPadre[categoriaPadre].push(categoriaObjeto);
      // <<< FIN DEL BLOQUE MODIFICADO
    }
  });

  // <<< ¡NUEVO BLOQUE AGREGADO!
  // 5. Convertir el objeto de agrupación (dataArrayPadre) en el array final
  //    (Este es el 'dataArray' que se usará en el JSON)
  const dataArray = Object.keys(dataArrayPadre).map(nombrePadre => {
    
    // Ordenamos las categorías hijas (Boxer, Camiseta) alfabéticamente
    const categoriasHijas = dataArrayPadre[nombrePadre].sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    return {
      nombre_padre: nombrePadre,      // ej: "ROPA INTERIOR"
      categorias: categoriasHijas // ej: [{nombre: "Boxer", ...}, {nombre: "Camiseta", ...}]
    };
  });
  
  // 6. Ordenamos las categorías padre (INDUMENTARIA, ROPA INTERIOR) alfabéticamente
  dataArray.sort((a, b) => a.nombre_padre.localeCompare(b.nombre_padre));
  // <<< FIN DEL NUEVO BLOQUE


  let formasPago = [];
  let cuentaTransferencia = {};

  try {
    const parsed = JSON.parse(sheetBlogger.getRange(7, 2).getValue());
    formasPago = parsed.formas_pago || [];
    cuentaTransferencia = parsed.cuenta_transferencia_dia || {};
  } catch (error) {
    formasPago = [];
    cuentaTransferencia = {};
  }

  const result = {
    status: '0',
    message: 'Éxito',
    pagina_url: sheetBlogger.getRange(4, 2).getValue(),
    pagina_logo: sheetBlogger.getRange(2, 2).getValue(),
    pagina_tienda: JSON.parse(sheetBlogger.getRange(3, 2).getValue()),
    contentagencia: dataArrayAgencia,
    pagina_carrusel: JSON.parse(sheetBlogger.getRange(5, 2).getValue()),
    contactabilidad: sheetBlogger.getRange(8, 2).getValue(),
    content: dataArray, // <<< Esta línea ahora usa el NUEVO dataArray jerárquico
    formas_pago: formasPago,
    cuenta_transferencia_dia: cuentaTransferencia,
    aplicar_marca_agua: aplicarMarcaDeAgua
  };

  return result;

}

function indexarInventario(inventario) {
  const index = {};

  for (const row of inventario) {
    const tienda = row[2];
    const codigoProducto = row[3];
    if (!index[tienda]) index[tienda] = {};
    if (!index[tienda][codigoProducto]) index[tienda][codigoProducto] = [];
    index[tienda][codigoProducto].push(row);
  }

  return index;
}

function construirSubVariedad({ codigoProducto, variedad, inventarioIndex, coloresBD, tiendaId, excluirSurtidos = false }) {
  const coloresHex = Object.fromEntries(
    coloresBD.map(row => {
      let hex = row[7] || "cccccc";
      if (!hex.startsWith("#")) hex = `#${hex}`;
      return [row[0], hex];
    })
  );

  const subtipo = String(variedad || "").trim();
  const surtidoHex = "#FF69B4-800080";
  const resultado = {};

  const inventarioFiltrado = inventarioIndex[tiendaId]?.[codigoProducto] || [];

  const filtrarConStock = row => Number(row[11]) > 0;

  if (["Corte", "Fardo", "Caja", "Docena"].includes(subtipo)) {
    let total = 0;
    for (const row of inventarioFiltrado) {
      if (row[4] === "Surtido" && row[5] === "Surtido" && filtrarConStock(row)) {
        total += Number(row[11]);
      }
    }
    if (total > 0) {
      resultado["Surtido"] = {
        color: surtidoHex,
        talles: [{ talle: "Surtido", stock: String(total) }]
      };
    }

  } else if (subtipo === "Curva") {
    const agrupadoPorColor = {};
    for (const row of inventarioFiltrado) {
      if (row[5] === "Surtido" && filtrarConStock(row)) {
        const color = row[4];
        agrupadoPorColor[color] = (agrupadoPorColor[color] || 0) + Number(row[11]);
      }
    }
    for (const [color, stock] of Object.entries(agrupadoPorColor)) {
      resultado[color] = {
        color: coloresHex[color] || "#cccccc",
        talles: [{ talle: "Surtido", stock: String(stock) }]
      };
    }

  } else if (subtipo === "Pack x3") {
    const agrupadoPorTalle = {};
    for (const row of inventarioFiltrado) {
      if (row[4] === "Surtido" && filtrarConStock(row)) {
        const talle = row[5];
        agrupadoPorTalle[talle] = (agrupadoPorTalle[talle] || 0) + Number(row[11]);
      }
    }
    if (Object.keys(agrupadoPorTalle).length > 0) {
      resultado["Surtido"] = {
        color: surtidoHex,
        talles: Object.entries(agrupadoPorTalle).map(([talle, stock]) => ({
          talle,
          stock: String(stock)
        }))
      };
    }

  } else {
    const agrupado = {};
    for (const row of inventarioFiltrado) {
      if (!filtrarConStock(row)) continue;
      if (excluirSurtidos && (row[4] === "Surtido" || row[5] === "Surtido")) continue;

      const color = row[4];
      const talle = row[5];
      const stock = Number(row[11]);

      if (!agrupado[color]) agrupado[color] = {};
      agrupado[color][talle] = (agrupado[color][talle] || 0) + stock;
    }

    for (const [color, tallesObj] of Object.entries(agrupado)) {
      resultado[color] = {
        color: coloresHex[color] || "#cccccc",
        talles: Object.entries(tallesObj).map(([talle, stock]) => ({
          talle,
          stock: String(stock)
        }))
      };
    }
  }

  return resultado;
}

function generarDescripcionProductoSimple({
  codigoId,
  productos,
  inventario,
  rowsImagenes,
  coloresBD,
  tiendaId,
  celularTienda,
  tipoRegistroProducto = "PRODUCTO VARIABLE" // por defecto
}) {
  const esProductoSimple = tipoRegistroProducto === "PRODUCTO SIMPLE";

  const producto = productos.find(row => row[0] === codigoId);
  if (!producto) return null;

  // Extraer columnas necesarias de producto
  const [
    CODIGO_ID,            // 0 CODIGO_ID
    ,                     // 1 CATEGORIA_PADRE
    ,                     // 2 CATEGORIA
    ,                     // 3 SKU
    ,                     // 4 CARPETA_ID
    TEMPORADA,            // 5 TEMPORADA
    GENERO,               // 6 GENERO
    MARCA,                // 7 MARCA
    MODELO,               // 8 MODELO
    ESTILO,               // 9 ESTILO
    MATERIAL,            // 10 MATERIAL
    TALLES,              // 11 TALLES
    COLORES,             // 12 COLORES
    ,                    // 13 PRECIO_COSTO
    ,                    // 14 RECARGO_MENOR
    ,                    // 15 ID_VIDEO_YOUTUBE
    ,                    // 16 SINCRONIZAR_FOTOS
    ,                    // 17 BLOGGER_POST_ID
    ,                    // 18 ESTADO_SINCRONIZACION
    ULTIMA_ACTUALIZACION // 16 ULTIMA_ACTUALIZACION
  ] = producto;

  // Si es simple, no filtramos por stock
  const inventarioFiltrado = inventario.filter(row =>
    row[3] === CODIGO_ID && row[2] === tiendaId && (esProductoSimple ? true : Number(row[11]) > 0)
  );

  const coloresUnicos = new Set();
  const tallesUnicos = new Set();
  let stockTotal = 0;

  if (esProductoSimple) {
    // Usamos los campos TALLES y COLORES del producto
    const coloresLista = (COLORES || "").split(",").map(c => c.trim()).filter(Boolean);
    const tallesLista = (TALLES || "").split(",").map(t => t.trim()).filter(Boolean);

    coloresLista.forEach(c => coloresUnicos.add(c));
    tallesLista.forEach(t => tallesUnicos.add(t));

    stockTotal = inventarioFiltrado.reduce((acc, row) => acc + Number(row[11] || 0), 0);

  } else {
    // Usamos datos del inventario con stock
    for (const row of inventarioFiltrado) {
      coloresUnicos.add(row[4]);
      tallesUnicos.add(row[5]);
      stockTotal += Number(row[11]) || 0;
    }
  }

  // Mapeo de colores con HEX
  const coloresMap = crearMapaColores(coloresBD);
  const coloresConHex = [...coloresUnicos].map(nombreColor => ({
    nombre: nombreColor,
    hex: coloresMap.get(nombreColor) || "#cccccc"
  }));

  const alerta = 5;
  const stockEstado = stockTotal >= alerta * 2 ? "Alta" : stockTotal >= alerta ? "Media" : "Baja";

  const videoInfo = rowsImagenes.find(row => {
  const productoIdDeImagen = row[1]; // Columna B: PRODUCTO_ID
  const tipoArchivo = row[10];       // Columna K: TIPO_ARCHIVO
    return productoIdDeImagen === CODIGO_ID && tipoArchivo === 'video';
  });

  let videoData = undefined; // Por defecto, no hay video.
  if (videoInfo) {
    // Si encontramos un video, creamos un objeto con sus datos.
    const videoUrl = videoInfo[5];      // Columna F: URL del video
    const thumbnailUrl = videoInfo[11]; // Columna L: THUMBNAIL_URL del video

    videoData = {
      label: "Video",
      url: videoUrl,
      thumbnail: thumbnailUrl // Incluimos la miniatura para usarla como póster
    };
  }

  const textoWhatsApp = 
`¡Hola! Estoy interesado en el siguiente producto:

 🔹 Código: ${CODIGO_ID}
 🔹 Modelo: ${MODELO || '-'}
 🔹 Estilo: ${ESTILO || '-'}
 🔹 Marca: ${MARCA || '-'}
 🔹 Género: ${GENERO || '-'}
 🔹 Material: ${MATERIAL || '-'}
 🔹 Temporada: ${TEMPORADA || '-'}
 🔹 Talles: ${[...tallesUnicos].join(', ') || '-'}
 🔹 Colores: ${coloresConHex.map(c => c.nombre).join(', ') || '-'}`;

  const descripcion = {
    modelo: modeloJson(MODELO),
    estilo: modeloJson(ESTILO, "Estilo"),
    marca: modeloJson(MARCA, "Marca"),
    genero: modeloJson(GENERO, "Género", getGeneroIcono(GENERO)),
    material: modeloJson(MATERIAL, "Material"),
    temporada: modeloJson(TEMPORADA, "Temporada", getTemporadaIcono(TEMPORADA)),
    talles: { label: "Talles", valores: [...tallesUnicos] },
    colores: { label: "Colores", valores: coloresConHex },
    stock: { label: "Stock", valor: stockTotal.toString(), estado: stockEstado },
    ultima_actualizacion: formatearFecha(ULTIMA_ACTUALIZACION),
    video: videoData,
    whatsapp: {
      label: "Más Info",
      telefono: celularTienda,
      mensaje: textoWhatsApp,
      url: `https://wa.me/549${celularTienda}?text=` + encodeURIComponent(textoWhatsApp)
    }
  };

  return descripcion;
}