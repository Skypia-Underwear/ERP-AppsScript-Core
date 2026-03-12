// =================================================================================
// ARCHIVO: Woocommerce.gs
// Funciones específicas para generar CSVs y manejar datos de WooCommerce.
// DEPENDENCIAS: Requiere variables globales (ss, SHEETS) y la función
// convertirRangoAObjetos definida en Main.gs.
// =================================================================================

// = [MENÚ Y FUNCIONES AUXILIARES (DEFINIDAS LOCALMENTE)] =
/**
 * Guarda el ID de WooCommerce devuelto por la API en la hoja BD_PRODUCTOS.
 * @param {string} sku - El SKU Principal (CODIGO_ID) del producto.
 * @param {number|string} wooId - El ID generado por WooCommerce.
 */
function guardarIdWoocommerce(sku, wooId) {
  const ss = getActiveSS();
  const sheet = ss.getSheetByName(SHEETS.PRODUCTS);
  const mapping = HeaderManager.getMapping("PRODUCTS");

  if (!sheet || !mapping || mapping["WOO_ID"] === undefined) {
    throw new Error("No se pudo encontrar la columna WOO_ID o la hoja de productos.");
  }

  const colWooId = mapping["WOO_ID"];

  // Búsqueda optimizada con TextFinder (evita leer toda la hoja)
  const finder = sheet.createTextFinder(String(sku).trim())
    .matchEntireCell(true)
    .matchCase(false);
  const found = finder.findNext();

  if (found) {
    sheet.getRange(found.getRow(), colWooId + 1).setValue(wooId);
    debugLog(`✅ ID ${wooId} asignado a producto ${sku} en BD.`);
    return true;
  }
  throw new Error(` SKU ${sku} no encontrado en la base de datos.`);
}

/**
 * Construye la descripción corta del producto.
 */
function construirDescripcionCorta(producto, variedades) {
  const categoria = producto.CATEGORIA || '';
  const genero = producto.GENERO || '';
  const modelo = producto.MODELO || '';
  const estilo = producto.ESTILO || '';
  let descripcion = `${categoria} de ${genero} modelo ${modelo}`;
  if (estilo) descripcion += ` en estilo ${estilo}`;
  return descripcion.trim() + '.';
}

/**
 * Construye la descripción detallada en formato HTML.
 */
function construirDescripcionHtml(producto, descripcionOriginal, tablaTalles) {
  let html = `<p>${descripcionOriginal || 'Descubre la calidad y estilo de este producto.'}</p><br/>`;
  html += "<h4>Detalles del Producto</h4><ul>";
  if (producto.MARCA) html += `<li><strong>Marca:</strong> ${producto.MARCA}</li>`;
  if (producto.GENERO) html += `<li><strong>Género:</strong> ${producto.GENERO}</li>`;
  if (producto.MATERIAL) html += `<li><strong>Material:</strong> ${producto.MATERIAL}</li>`;
  if (producto.TEMPORADA) html += `<li><strong>Temporada:</strong> ${producto.TEMPORADA}</li>`;
  if (producto.ESTILO) html += `<li><strong>Estilo:</strong> ${producto.ESTILO}</li>`;
  html += "</ul>";
  if (tablaTalles) {
    html += "<br><h3>Guía de Talles</h3>";
    html += tablaTalles;
  }
  return html;
}

/**
 * Guarda o SOBRESCRIBE el archivo CSV en Google Drive con un ID fijo.
 * Busca/Crea el archivo "woocommerce_sync_data.csv" en la carpeta "Woocommerce File".
 * @param {Array<string>} encabezados - Los encabezados del CSV.
 * @param {Array<Array<string|number>>} datos - Las filas de datos del CSV.
 * @returns {string|null} El ID del archivo guardado/sobrescrito, o null si falla.
 */
function guardarCSVEnDrive(encabezados, datos) {
  // --- Configuración ---
  const TARGET_FOLDER_NAME = "WOOCOMMERCE_FILES";
  const TARGET_FILE_NAME = "woocommerce_sync_data.csv"; // <<< NOMBRE FIJO
  // --- Fin Configuración ---

  function formatearFilaCSV(fila) {
    return fila.map(item => {
      const texto = item !== null && item !== undefined ? String(item) : '';
      return `"${texto.replace(/"/g, '""')}"`;
    }).join(',');
  }

  const csvFilas = [encabezados.join(',')];
  datos.forEach(fila => { csvFilas.push(formatearFilaCSV(fila)); });
  const csvContent = csvFilas.join('\n');

  try {
    // 1. Buscar la carpeta de destino (prioridad: ID configurado > nombre > raíz)
    let folder;
    const folderId = GLOBAL_CONFIG.DRIVE.WOO_FOLDER_ID;
    if (folderId) {
      folder = DriveApp.getFolderById(folderId);
      Logger.log(`Carpeta WooCommerce localizada por ID: ${folderId}`);
    } else {
      // Fallback legacy: búsqueda por nombre
      const folders = DriveApp.getFoldersByName(TARGET_FOLDER_NAME);
      if (folders.hasNext()) {
        folder = folders.next();
        Logger.log(`Carpeta encontrada por nombre: "${TARGET_FOLDER_NAME}"`);
      } else {
        folder = DriveApp.getRootFolder();
        Logger.log(`⚠️ Advertencia: Carpeta WooCommerce no encontrada. Usando raíz de Drive.`);
      }
    }

    // 2. Buscar o crear el archivo CON NOMBRE FIJO
    let file;
    const files = folder.getFilesByName(TARGET_FILE_NAME); // <<< BUSCA POR NOMBRE FIJO

    if (files.hasNext()) {
      // --- Archivo encontrado: Sobrescribir contenido ---
      file = files.next();
      file.setContent(csvContent); // <<< SOBRESCRIBE
      Logger.log(`♻️ Archivo CSV "${TARGET_FILE_NAME}" sobrescrito.`);
    } else {
      // --- Archivo NO encontrado: Crear y configurar ---
      const blob = Utilities.newBlob(csvContent, "text/csv", TARGET_FILE_NAME); // <<< USA NOMBRE FIJO
      file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      Logger.log(`✅ Archivo CSV "${TARGET_FILE_NAME}" creado.`);
      Logger.log(`   -> Permisos establecidos: Cualquiera con el enlace puede ver.`);
    }

    const fileId = file.getId();
    const fileUrl = file.getUrl();
    Logger.log(`   -> ID del archivo: ${fileId}`);
    Logger.log(`   -> URL del archivo: ${fileUrl}`);

    // (Opcional) Alerta para ejecución manual
    try {
      // No mostramos alerta aquí si la ejecuta el trigger
      // SpreadsheetApp.getUi().alert(`CSV "${TARGET_FILE_NAME}" generado/actualizado.\nID: ${fileId}`);
    } catch (uiError) {
      // Logger.log("Alerta de UI omitida.");
    }

    return fileId; // Devolver el ID

  } catch (e) {
    Logger.log(`❌ Error al guardar/sobrescribir CSV en Drive: ${e.message}`);
    Logger.log(e.stack);
    // No intentar mostrar alerta si falla desde trigger
    // try { SpreadsheetApp.getUi().alert("Error al guardar/sobrescribir CSV."); } catch(uiError) {}
    return null; // Indicar fallo
  }
}

// =================================================================================
// FUNCIÓN PRINCIPAL - V17 (Depende de Main.gs para ss, SHEETS, convertirRangoAObjetos)
// =================================================================================

/**
 * Genera el CSV completo para WooCommerce desde las hojas de cálculo. V17.
 * @param {boolean} [incluirImagenes=false] - Si es true, incluye la columna 'Images'.
 */
function generarCSVCompletoDesdeBD(incluirImagenes = false) {
  Logger.log(`--- INICIANDO GENERACIÓN DE CSV (V17 - Omitir Imágenes: ${!incluirImagenes}) ---`);

  let productosSheet, inventarioSheet, variedadSheet;
  const ss = getActiveSS();
  try {
    // --- Usa variables globales de Main.gs ---
    productosSheet = ss.getSheetByName(SHEETS.PRODUCTS);
    inventarioSheet = ss.getSheetByName(SHEETS.INVENTORY);
    variedadSheet = ss.getSheetByName(SHEETS.PRODUCT_VARIETIES);
    if (!productosSheet || !inventarioSheet || !variedadSheet) {
      throw new Error("Hojas BD_PRODUCTOS, BD_INVENTARIO o BD_VARIEDAD_PRODUCTOS no encontradas.");
    }
  } catch (e) {
    Logger.log(`Error al acceder a las hojas: ${e.message}`);
    return;
  }

  // --- Usa función global de Main.gs ---
  const productosData = convertirRangoAObjetos(productosSheet);
  const inventarioData = convertirRangoAObjetos(inventarioSheet);
  const variedadData = convertirRangoAObjetos(variedadSheet);

  // --- Encabezados ---
  let encabezados = [ /* ... (los 32 encabezados base) ... */
    "ID", "Type", "SKU", "Name", "Published", "Is featured?", "Short description", "Description",
    "In stock?", "Stock", "Regular price", "Sale price", "Categories", /* Omitimos 'Images' aquí */ "Parent", "Position",
    "Tags", "tax:product_brand",
    "Attribute 1 name", "Attribute 1 value(s)", "Attribute 1 visible", "Attribute 1 global", "Attribute 1 default",
    "Attribute 2 name", "Attribute 2 value(s)", "Attribute 2 visible", "Attribute 2 global", "Attribute 2 default",
    "Attribute 3 name", "Attribute 3 value(s)", "Attribute 3 visible", "Attribute 3 global", "Attribute 3 default"
  ];
  if (incluirImagenes) {
    encabezados.splice(13, 0, "Images");
  }

  const csvData = [];

  for (const producto of productosData) {
    const skuPrincipal = producto.CODIGO_ID;
    if (!skuPrincipal) continue;
    const inventarioProducto = inventarioData.filter(item => item.PRODUCTO_ID === skuPrincipal);
    const variedadesProducto = variedadData.filter(item => item.PRODUCTO_ID === skuPrincipal);

    // --- A. CONSTRUIR LA FILA DEL PRODUCTO PADRE ---
    // (Lógica para obtener datos: defaults, categorías, etc.)
    let defaultTipoPrecio = '', defaultColor = '', defaultTalle = '';
    const tieneVariedadNoMenor = variedadesProducto.some(v => v.VARIEDAD && v.VARIEDAD.trim() !== 'Menor');
    if (tieneVariedadNoMenor) {
      const primeraVariedadNoMenor = variedadesProducto.find(v => v.VARIEDAD && v.VARIEDAD.trim() !== 'Menor');
      if (primeraVariedadNoMenor) defaultTipoPrecio = primeraVariedadNoMenor.VARIEDAD;
      defaultColor = 'Surtido';
      defaultTalle = 'Surtido';
    } else if (variedadesProducto.length > 0 && variedadesProducto[0].VARIEDAD) {
      defaultTipoPrecio = variedadesProducto[0].VARIEDAD;
    }
    const categoriaPadre = producto.CATEGORIA_PADRE ? String(producto.CATEGORIA_PADRE).trim() : '';
    const categoriaHijo = producto.CATEGORIA ? String(producto.CATEGORIA).trim() : '';
    let categoriaCompleta = '';
    if (categoriaPadre && categoriaHijo) categoriaCompleta = `${categoriaPadre}>${categoriaHijo}`;
    else categoriaCompleta = categoriaPadre || categoriaHijo;
    const opcionesTipoPrecio = [...new Set(variedadesProducto.map(v => v.VARIEDAD).filter(Boolean))].join(', ');
    let coloresPadre = (producto.COLORES || '').split(',').map(s => s.trim()).filter(Boolean);
    let tallesPadre = (producto.TALLES || '').split(',').map(s => s.trim()).filter(Boolean);
    if (tieneVariedadNoMenor && !coloresPadre.includes('Surtido')) coloresPadre.push('Surtido');
    if (tieneVariedadNoMenor && !tallesPadre.includes('Surtido')) tallesPadre.push('Surtido');

    // --- Llama a funciones auxiliares LOCALES ---
    const descripcionCorta = construirDescripcionCorta(producto, variedadesProducto);
    const descripcionLargaHtml = construirDescripcionHtml(producto, producto.DESCRIPCION, producto.TABLA_TALLES);

    // ✅ CAMBIO INICIO: Lógica para combinar Material y Marca en "Tags"
    const tagsCombinados = [producto.MATERIAL, producto.MARCA]
      .map(s => s ? String(s).trim() : '')
      .filter(Boolean)
      .join(', ');
    // ✅ CAMBIO FIN

    // --- Construcción de filaPadre ---
    let filaPadre;
    if (incluirImagenes) {
      filaPadre = [ /* 33 elems */ '', 'variable', skuPrincipal, producto.MODELO || '', 1, 0, descripcionCorta, descripcionLargaHtml, '', '', '', '', categoriaCompleta, '', '', 0, tagsCombinados, producto.MARCA || '', 'Precio', opcionesTipoPrecio, 1, 1, defaultTipoPrecio, 'Color', coloresPadre.join(', '), 1, 1, defaultColor, 'Talle', tallesPadre.join(', '), 1, 1, defaultTalle];
    } else {
      filaPadre = [ /* 32 elems */ '', 'variable', skuPrincipal, producto.MODELO || '', 1, 0, descripcionCorta, descripcionLargaHtml, '', '', '', '', categoriaCompleta, '', 0, tagsCombinados, producto.MARCA || '', 'Precio', opcionesTipoPrecio, 1, 1, defaultTipoPrecio, 'Color', coloresPadre.join(', '), 1, 1, defaultColor, 'Talle', tallesPadre.join(', '), 1, 1, defaultTalle];
    }
    csvData.push(filaPadre);

    // --- B. CONSTRUIR LAS FILAS DE CADA VARIACIÓN ---
    let posicionVariacion = 0;
    for (const variedad of variedadesProducto) {
      let filaVariacion = [];
      const variedadNombre = variedad.VARIEDAD ? variedad.VARIEDAD.trim() : '';
      if (!variedadNombre) continue;

      let skuVariacion = '', nombreVariacion = '', precio = '', enStock = 0, stockQty = '';
      let attr1Val = '', attr2Val = '', attr3Val = '';

      if (variedadNombre === 'Menor') {
        skuVariacion = variedad.VARIEDAD_ID || `${skuPrincipal}-MENOR`;
        nombreVariacion = `${producto.MODELO || skuPrincipal} - ${variedadNombre} (por unidad)`;
        precio = Number(variedad.PRECIO_UNITARIO || 0).toFixed(2);
        enStock = 1; stockQty = '';
        attr1Val = variedadNombre; attr2Val = ''; attr3Val = '';
      } else {
        stockQty = Number(inventarioProducto.reduce((sum, item) => sum + Number(item.STOCK_ACTUAL || 0), 0)).toString();
        precio = (Number(variedad.PRECIO_UNITARIO || 0) * Number(variedad.CANTIDAD_MINIMA || 1)).toFixed(2);
        skuVariacion = variedad.VARIEDAD_ID ? `${variedad.VARIEDAD_ID}-SURTIDO` : `${skuPrincipal}-${variedadNombre.toUpperCase()}-SURTIDO`;
        let nombrePaqueteDinamico = variedadNombre;
        if (variedadNombre.toLowerCase() === 'docena') {
          if (Number(variedad.CANTIDAD_MINIMA) === 6) nombrePaqueteDinamico = 'Media Docena';
          else if (Number(variedad.CANTIDAD_MINIMA) === 12) nombrePaqueteDinamico = 'Docena Completa';
        }
        nombreVariacion = `${producto.MODELO || skuPrincipal} - ${nombrePaqueteDinamico} (Mín. ${variedad.CANTIDAD_MINIMA || 1}) - Surtido`;
        enStock = stockQty > 0 ? 1 : 0;
        attr1Val = variedadNombre; attr2Val = 'Surtido'; attr3Val = 'Surtido';
      }

      // --- Construcción de filaVariacion ---
      if (incluirImagenes) {
        filaVariacion = [ /* 33 elems */ '', 'variation', skuVariacion, nombreVariacion, 1, '', '', nombreVariacion, enStock, stockQty, precio, '', '', '', `${skuPrincipal}`, posicionVariacion, '', '', 'Precio', attr1Val, 1, 1, '', 'Color', attr2Val, 1, 1, '', 'Talle', attr3Val, 1, 1, ''];
      } else {
        filaVariacion = [ /* 32 elems */ '', 'variation', skuVariacion, nombreVariacion, 1, '', '', nombreVariacion, enStock, stockQty, precio, '', '', `${skuPrincipal}`, posicionVariacion, '', '', 'Precio', attr1Val, 1, 1, '', 'Color', attr2Val, 1, 1, '', 'Talle', attr3Val, 1, 1, ''];
      }
      csvData.push(filaVariacion);
      posicionVariacion++;
    }
  }

  // --- GENERAR Y GUARDAR EL ARCHIVO CSV ---
  if (csvData.length > 0) {
    // --- Llama a la función guardarCSVEnDrive LOCAL ---
    guardarCSVEnDrive(encabezados, csvData);
  } else {
    Logger.log("No se encontraron productos válidos para generar el CSV.");
  }
}

/**
 * Helper function called by the daily trigger.
 * Ensures the CSV is generated WITHOUT the "Images" column.
 */
function generarCSVSyncDiario() {
  Logger.log("Activador diario: Iniciando generación de CSV para sincronización (sin imágenes)...");
  generarCSVCompletoDesdeBD(false); // Llama a la función principal con 'false'
  Logger.log("Activador diario: Generación de CSV completada.");
}

/**
 * Construye el JSON completo para WooCommerce leyendo directamente de las hojas de cálculo.
 * Elimina la dependencia del CSV maestro para sincronización individual.
 * @param {string} sku - El SKU (CODIGO_ID) del producto a construir.
 * @returns {{ wooId: string|null, payload: Object }} El JSON listo para enviar al proxy PHP.
 */
function construirJSONProductoDesdeSheets(sku) {
  const ss = getActiveSS();
  const productosSheet = ss.getSheetByName(SHEETS.PRODUCTS);
  const inventarioSheet = ss.getSheetByName(SHEETS.INVENTORY);
  const variedadSheet = ss.getSheetByName(SHEETS.PRODUCT_VARIETIES);

  if (!productosSheet || !inventarioSheet || !variedadSheet) {
    throw new Error("Hojas BD_PRODUCTOS, BD_INVENTARIO o BD_VARIEDAD_PRODUCTOS no encontradas.");
  }

  const productosData = convertirRangoAObjetos(productosSheet);
  const inventarioData = convertirRangoAObjetos(inventarioSheet);
  const variedadData = convertirRangoAObjetos(variedadSheet);

  const SKU_NORM = String(sku).trim().toUpperCase();
  const producto = productosData.find(p => String(p.CODIGO_ID || '').trim().toUpperCase() === SKU_NORM);
  if (!producto) throw new Error(`SKU ${SKU_NORM} no encontrado en BD_PRODUCTOS.`);

  const skuPrincipal = producto.CODIGO_ID;
  const inventarioProducto = inventarioData.filter(item => String(item.PRODUCTO_ID) === skuPrincipal);
  const variedadesProducto = variedadData.filter(item => String(item.PRODUCTO_ID) === skuPrincipal);

  // --- Obtener WOO_ID existente (null si es producto nuevo) ---
  const wooIdExistente = producto.WOO_ID ? String(producto.WOO_ID).trim() : null;

  // --- Construir datos del padre (misma lógica que generarCSVCompletoDesdeBD) ---
  let defaultTipoPrecio = '', defaultColor = '', defaultTalle = '';
  const tieneVariedadNoMenor = variedadesProducto.some(v => v.VARIEDAD && v.VARIEDAD.trim() !== 'Menor');
  if (tieneVariedadNoMenor) {
    const primeraVariedadNoMenor = variedadesProducto.find(v => v.VARIEDAD && v.VARIEDAD.trim() !== 'Menor');
    if (primeraVariedadNoMenor) defaultTipoPrecio = primeraVariedadNoMenor.VARIEDAD;
    defaultColor = 'Surtido';
    defaultTalle = 'Surtido';
  } else if (variedadesProducto.length > 0 && variedadesProducto[0].VARIEDAD) {
    defaultTipoPrecio = variedadesProducto[0].VARIEDAD;
  }

  const categoriaPadre = producto.CATEGORIA_PADRE ? String(producto.CATEGORIA_PADRE).trim() : '';
  const categoriaHijo = producto.CATEGORIA ? String(producto.CATEGORIA).trim() : '';
  let categoriaCompleta = '';
  if (categoriaPadre && categoriaHijo) categoriaCompleta = `${categoriaPadre}>${categoriaHijo}`;
  else categoriaCompleta = categoriaPadre || categoriaHijo;

  const opcionesTipoPrecio = [...new Set(variedadesProducto.map(v => v.VARIEDAD).filter(Boolean))].join(', ');
  let coloresPadre = (producto.COLORES || '').split(',').map(s => s.trim()).filter(Boolean);
  let tallesPadre = (producto.TALLES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (tieneVariedadNoMenor && !coloresPadre.includes('Surtido')) coloresPadre.push('Surtido');
  if (tieneVariedadNoMenor && !tallesPadre.includes('Surtido')) tallesPadre.push('Surtido');

  // --- Priorizar DESCRIPCION_IA ---
  const descripcionLargaHtml = (producto.DESCRIPCION_IA || "").trim() !== "" 
    ? producto.DESCRIPCION_IA 
    : construirDescripcionHtml(producto, producto.DESCRIPCION, producto.TABLA_TALLES);

  const descripcionCorta = (producto.DESCRIPCION_IA || "").trim() !== ""
    ? String(producto.DESCRIPCION_IA).split('\n')[0].replace(/<[^>]*>/g, '').substring(0, 160) // Extraer texto plano del primer párrafo
    : construirDescripcionCorta(producto, variedadesProducto);

  const tagsCombinados = [producto.MATERIAL, producto.MARCA]
    .map(s => s ? String(s).trim() : '')
    .filter(Boolean)
    .join(', ');

  // --- Determinar estado de publicación ---
  // Si la columna ESTADO_WOO existe y dice Borrador u Oculto, mandamos 0. Si no, 1.
  const estadoWoo = (producto.ESTADO_WOO || '').trim().toLowerCase();
  const publishedValue = (estadoWoo === 'borrador' || estadoWoo === 'oculto') ? '0' : '1';

  // --- Construir JSON del padre ---
  const json = {
    Type: 'variable',
    SKU: skuPrincipal,
    Name: producto.MODELO || '',
    Published: publishedValue,
    'Is featured?': '0',
    'Short description': descripcionCorta,
    Description: descripcionLargaHtml,
    'In stock?': '',
    Stock: '',
    'Regular price': '',
    'Sale price': '',
    Categories: categoriaCompleta,
    Parent: '',
    Position: '0',
    Tags: tagsCombinados,
    'tax:product_brand': producto.MARCA || '',
    'Attribute 1 name': 'Precio',
    'Attribute 1 value(s)': opcionesTipoPrecio,
    'Attribute 1 visible': '1',
    'Attribute 1 global': '1',
    'Attribute 1 default': defaultTipoPrecio,
    'Attribute 2 name': 'Color',
    'Attribute 2 value(s)': coloresPadre.join(', '),
    'Attribute 2 visible': '1',
    'Attribute 2 global': '1',
    'Attribute 2 default': defaultColor,
    'Attribute 3 name': 'Talle',
    'Attribute 3 value(s)': tallesPadre.join(', '),
    'Attribute 3 visible': '1',
    'Attribute 3 global': '1',
    'Attribute 3 default': defaultTalle,
    variations: []
  };

  // --- Construir variaciones ---
  let posicionVariacion = 0;
  for (const variedad of variedadesProducto) {
    const variedadNombre = variedad.VARIEDAD ? variedad.VARIEDAD.trim() : '';
    if (!variedadNombre) continue;

    let skuVariacion = '', nombreVariacion = '', precio = '', enStock = '', stockQty = '';
    let attr1Val = '', attr2Val = '', attr3Val = '';

    if (variedadNombre === 'Menor') {
      skuVariacion = variedad.VARIEDAD_ID || `${skuPrincipal}-MENOR`;
      nombreVariacion = `${producto.MODELO || skuPrincipal} - ${variedadNombre} (por unidad)`;
      precio = Number(variedad.PRECIO_UNITARIO || 0).toFixed(2);
      enStock = '1'; stockQty = '';
      attr1Val = variedadNombre; attr2Val = ''; attr3Val = '';
    } else {
      stockQty = Number(inventarioProducto.reduce((sum, item) => sum + Number(item.STOCK_ACTUAL || 0), 0)).toString();
      precio = (Number(variedad.PRECIO_UNITARIO || 0) * Number(variedad.CANTIDAD_MINIMA || 1)).toFixed(2);
      skuVariacion = variedad.VARIEDAD_ID ? `${variedad.VARIEDAD_ID}-SURTIDO` : `${skuPrincipal}-${variedadNombre.toUpperCase()}-SURTIDO`;
      let nombrePaqueteDinamico = variedadNombre;
      if (variedadNombre.toLowerCase() === 'docena') {
        if (Number(variedad.CANTIDAD_MINIMA) === 6) nombrePaqueteDinamico = 'Media Docena';
        else if (Number(variedad.CANTIDAD_MINIMA) === 12) nombrePaqueteDinamico = 'Docena Completa';
      }
      nombreVariacion = `${producto.MODELO || skuPrincipal} - ${nombrePaqueteDinamico} (Mín. ${variedad.CANTIDAD_MINIMA || 1}) - Surtido`;
      enStock = stockQty > 0 ? '1' : '0';
      attr1Val = variedadNombre; attr2Val = 'Surtido'; attr3Val = 'Surtido';
    }

    json.variations.push({
      Type: 'variation',
      SKU: skuVariacion,
      Name: nombreVariacion,
      'In stock?': enStock,
      Stock: stockQty,
      'Regular price': precio,
      'Sale price': '',
      Parent: skuPrincipal,
      Position: String(posicionVariacion),
      'Attribute 1 name': 'Precio',
      'Attribute 1 value(s)': attr1Val,
      'Attribute 1 visible': '1',
      'Attribute 1 global': '1',
      'Attribute 1 default': '',
      'Attribute 2 name': 'Color',
      'Attribute 2 value(s)': attr2Val,
      'Attribute 2 visible': '1',
      'Attribute 2 global': '1',
      'Attribute 2 default': '',
      'Attribute 3 name': 'Talle',
      'Attribute 3 value(s)': attr3Val,
      'Attribute 3 visible': '1',
      'Attribute 3 global': '1',
      'Attribute 3 default': ''
    });
    posicionVariacion++;
  }

  return { wooId: wooIdExistente, payload: json, estadoWoo: estadoWoo };
}

/**
 * Envía un producto a WooCommerce (Versión 6.0 - Lectura Directa).
 * Lee los datos directamente de las hojas de cálculo en tiempo real.
 * Soporta creación (sin WOO_ID) y actualización (con WOO_ID).
 * @param {string} sku - El SKU del producto a sincronizar.
 */
function enviarProductoWP(sku) {
  const logArray = [];
  try {
    if (!sku) throw new Error("Se requiere un SKU para enviar a WooCommerce.");

    const SKU_NORM = String(sku).trim().toUpperCase();
    logArray.push(`ℹ️ Iniciando envío de SKU: ${SKU_NORM} a WooCommerce...`);

    // 1️⃣ Construir JSON directamente desde las hojas de cálculo (sin CSV intermediario)
    logArray.push(`📊 Leyendo datos en tiempo real desde las hojas de cálculo...`);
    const { wooId, payload: wooJSON, estadoWoo } = construirJSONProductoDesdeSheets(sku);

    if (estadoWoo === "no publicar") {
      const msgSkip = "ℹ️ Sincronización OMITIDA: El producto está marcado como 'No publicar' (Venta Solo Local).";
      logArray.push(msgSkip);
      return { success: true, message: msgSkip, logs: logArray };
    }

    if (!wooJSON) throw new Error("Error al construir el paquete de datos JSON.");

    const esActualizacion = !!wooId;
    logArray.push(esActualizacion
      ? `🔄 Modo ACTUALIZACIÓN — WOO_ID existente: ${wooId}`
      : `🆕 Modo CREACIÓN — Producto nuevo en WooCommerce`);
    logArray.push(`✅ Datos construidos (${wooJSON.variations ? wooJSON.variations.length : 0} variaciones).`);

    // 2️⃣ Enviar al Proxy PHP con API Key
    const payloadHTTP = {
      apiKey: GLOBAL_CONFIG.WORDPRESS.IMAGE_API_KEY || 'CASTFER2025',
      producto: JSON.stringify(wooJSON)
    };
    // Incluir woo_id para que el proxy PHP haga PUT (update) en vez de POST (create)
    if (esActualizacion) {
      payloadHTTP.woo_id = wooId;
    }

    const options = {
      method: "post",
      payload: payloadHTTP,
      muteHttpExceptions: true
    };

    const url = GLOBAL_CONFIG.WORDPRESS.PRODUCT_API_URL;
    logArray.push(`⏳ Sincronizando con WordPress...`);

    // --- Resumen Técnico para Auditoría ---
    try {
      let resumenVariaciones = "Producto Simple (sin variaciones)";
      if (wooJSON.variations && wooJSON.variations.length > 0) {
        resumenVariaciones = wooJSON.variations.map(v => {
          const attr = v['Attribute 1 value(s)'] || "Normal";
          const price = v['Regular price'] || "0.00";
          const stock = v['Stock'] || "N/A";
          return `- ${attr}: Stock ${stock}, Precio $${price}`;
        }).join("\n");
      }
      logArray.push(`🛠️ RESUMEN TÉCNICO:\nProducto: ${wooJSON.Name || sku}\nCategoría: ${wooJSON.Categories || 'N/A'}\nMarca: ${wooJSON['tax:product_brand'] || 'N/A'}\nVariaciones:\n${resumenVariaciones}`);
    } catch (e) {
      logArray.push(`⚠️ No se pudo generar resumen técnico: ${e.message}`);
    }

    const response = UrlFetchApp.fetch(url, options);
    const responseText = response.getContentText();
    const responseCode = response.getResponseCode();
    logArray.push(`✅ Respuesta de PHP recibida (HTTP ${responseCode}).`);

    let resJSON = null;
    try {
      resJSON = JSON.parse(responseText);

      // --- CAPTURAR LOGS DEL SERVIDOR (PHP) ---
      if (resJSON.server_logs && Array.isArray(resJSON.server_logs)) {
        logArray.push(`--- 📜 INICIO LOGS DEL SERVIDOR (PHP) ---`);
        resJSON.server_logs.forEach(log => {
          const cleanLog = log.replace(/Array \( .+\) \n/, 'Array(...)');
          logArray.push(`[PHP] ${cleanLog}`);
        });
        logArray.push(`--- 📜 FIN LOGS DEL SERVIDOR (PHP) ---`);
      }
    } catch (e) {
      logArray.push(`⚠️ Error parseando JSON de respuesta: ${e.message}`);
    }

    // --- MOSTRAR JSON COMPLETO (Debug) ---
    logArray.push(`--- 🕵️‍♂️ RESPUESTA JSON COMPLETA (Debug) ---`);
    if (resJSON) {
      logArray.push(JSON.stringify(resJSON, null, 2));
    } else {
      logArray.push(`🔹 Respuesta cruda recibida: ${responseText.substring(0, 500)}...`);
    }
    logArray.push(`--- 🕵️‍♂️ FIN RESPUESTA JSON ---`);

    if (responseCode === 200 && resJSON) {
      const status = resJSON.status;
      const msg = resJSON.message || "Sincronización completada.";

      if (status === "success" || status === "created" || status === "updated") {
        logArray.push(`✅ Éxito: ${msg}`);
        if (resJSON.product_url) logArray.push(`PRODUCT_URL: ${resJSON.product_url}`);

        // --- PERSISTIR ID DE WOOCOMMERCE ---
        if (resJSON.product_id) {
          try {
            guardarIdWoocommerce(sku, resJSON.product_id);
            logArray.push(`💾 ID de WooCommerce (${resJSON.product_id}) guardado en la base de datos.`);
          } catch (e) {
            logArray.push(`⚠️ Error al guardar ID en BD: ${e.message}`);
          }
        }

        return { success: true, message: msg, logs: logArray };
      } else {
        throw new Error(msg);
      }
    } else {
      logArray.push(`❌ Error Server (HTTP ${responseCode}): ${responseText.substring(0, 300)}`);
      throw new Error("El servidor WordPress no respondió correctamente.");
    }

  } catch (error) {
    logArray.push(`❌ ERROR: ${error.message}`);
    return { success: false, message: error.message, logs: logArray };
  }
}

/**
 * Envía una petición DELETE a WooCommerce para enviar un producto a la papelera.
 * Depende del nuevo soporte de action=delete en el proxy PHP de Donweb.
 * @param {string|number} wooId - El ID del producto en WooCommerce (puede ser nulo si se provee sku).
 * @param {string} sku - El SKU (CODIGO_ID) del producto para la búsqueda fallback.
 */
function eliminarProductoWP(wooId, sku) {
  try {
    if (!wooId && !sku) throw new Error("Se requiere al menos un WOO_ID o SKU para eliminar en WooCommerce.");

    console.log(`🗑️ Solicitando eliminación en WooCommerce para wooId: ${wooId || 'N/A'}, sku: ${sku || 'N/A'}...`);

    const payloadHTTP = {
      apiKey: GLOBAL_CONFIG.WORDPRESS.IMAGE_API_KEY || 'CASTFER2025',
      action: "delete"
    };

    if (wooId) payloadHTTP.woo_id = wooId;
    if (sku) payloadHTTP.sku = sku;

    const options = {
      method: "post",
      payload: payloadHTTP,
      muteHttpExceptions: true
    };

    const url = GLOBAL_CONFIG.WORDPRESS.PRODUCT_API_URL;
    const response = UrlFetchApp.fetch(url, options);

    let resJSON = null;
    try { resJSON = JSON.parse(response.getContentText()); } catch (e) { }

    if (response.getResponseCode() === 200 && resJSON && resJSON.status === "deleted") {
      console.log(`✅ Producto wooId:${wooId} enviado a la papelera en WooCommerce de forma exitosa.`);
      return { success: true, message: `Producto Eliminado de WooCommerce.` };
    } else {
      throw new Error(resJSON ? resJSON.message : "El servidor WordPress falló la eliminación.");
    }
  } catch (error) {
    console.error(`❌ ERROR WooCommerce Delete: ${error.message}`);
    return { success: false, message: error.message };
  }
}

/**
 * Genera el JSON completo para WooCommerce a partir de filas de CSV maestro.
 * Mantiene exactamente los valores del CSV sin completar campos ni agregar decimales.
 */
function buildWooJSONCSVExacto(rows) {
  if (!rows || !rows.length) return null;

  // Identificar producto padre y variaciones
  const padre = rows.find(r => r['Type'] === 'variable');
  const variaciones = rows.filter(r => r['Type'] === 'variation');

  if (!padre) return null;

  const skuPrincipal = padre['SKU'];
  const json = {
    Type: padre['Type'] || '',
    SKU: skuPrincipal,
    Name: padre['Name'] || '',
    Published: padre['Published'] || '',
    'Is featured?': padre['Is featured?'] || '',
    'Short description': padre['Short description'] || '',
    Description: padre['Description'] || '',
    'In stock?': padre['In stock?'] || '',
    Stock: padre['Stock'] || '',
    'Regular price': padre['Regular price'] || '',
    'Sale price': padre['Sale price'] || '',
    Categories: padre['Categories'] || '',
    Parent: padre['Parent'] || '',
    Position: padre['Position'] || '',
    Tags: padre['Tags'] || '',
    'tax:product_brand': padre['tax:product_brand'] || '',
    'Attribute 1 name': padre['Attribute 1 name'] || '',
    'Attribute 1 value(s)': padre['Attribute 1 value(s)'] || '',
    'Attribute 1 visible': padre['Attribute 1 visible'] || '',
    'Attribute 1 global': padre['Attribute 1 global'] || '',
    'Attribute 1 default': padre['Attribute 1 default'] || '',
    'Attribute 2 name': padre['Attribute 2 name'] || '',
    'Attribute 2 value(s)': padre['Attribute 2 value(s)'] || '',
    'Attribute 2 visible': padre['Attribute 2 visible'] || '',
    'Attribute 2 global': padre['Attribute 2 global'] || '',
    'Attribute 2 default': padre['Attribute 2 default'] || '',
    'Attribute 3 name': padre['Attribute 3 name'] || '',
    'Attribute 3 value(s)': padre['Attribute 3 value(s)'] || '',
    'Attribute 3 visible': padre['Attribute 3 visible'] || '',
    'Attribute 3 global': padre['Attribute 3 global'] || '',
    'Attribute 3 default': padre['Attribute 3 default'] || '',
    variations: variaciones.map((v, index) => ({
      Type: v['Type'] || '',
      SKU: v['SKU'] || '',
      Name: v['Name'] || '',
      'In stock?': v['In stock?'] || '',
      Stock: v['Stock'] || '',
      'Regular price': v['Regular price'] || '',
      'Sale price': v['Sale price'] || '',
      Parent: skuPrincipal,
      Position: v['Position'] || index,
      'Attribute 1 name': v['Attribute 1 name'] || '',
      'Attribute 1 value(s)': v['Attribute 1 value(s)'] || '',
      'Attribute 1 visible': v['Attribute 1 visible'] || '',
      'Attribute 1 global': v['Attribute 1 global'] || '',
      'Attribute 1 default': v['Attribute 1 default'] || '',
      'Attribute 2 name': v['Attribute 2 name'] || '',
      'Attribute 2 value(s)': v['Attribute 2 value(s)'] || '',
      'Attribute 2 visible': v['Attribute 2 visible'] || '',
      'Attribute 2 global': v['Attribute 2 global'] || '',
      'Attribute 2 default': v['Attribute 2 default'] || '',
      'Attribute 3 name': v['Attribute 3 name'] || '',
      'Attribute 3 value(s)': v['Attribute 3 value(s)'] || '',
      'Attribute 3 visible': v['Attribute 3 visible'] || '',
      'Attribute 3 global': v['Attribute 3 global'] || '',
      'Attribute 3 default': v['Attribute 3 default'] || ''
    }))
  };

  return json;
}

// =================================================================================
// FUNCIONES ADICIONALES (MANTENIDAS LOCALMENTE COMO SOLICITASTE)
// =================================================================================

/**
 * Limpia los colores en BD_PRODUCTOS que no existen en BD_COLORES.
 * Usa la variable local ssWC.
 */
function limpiarColoresHuerfanos() {
  let ui; try { ui = SpreadsheetApp.getUi(); } catch (e) { } // Intentar obtener UI

  try { // Confirmación opcional si hay UI
    if (ui) {
      const confirmacion = ui.alert('Confirmación', 'Este proceso eliminará de la columna "COLORES" en "BD_PRODUCTOS" aquellos colores que no existan en "BD_COLORES". ¿Continuar?', ui.ButtonSet.YES_NO);
      if (confirmacion !== ui.Button.YES) {
        ui.alert('Proceso cancelado.');
        return;
      }
    }
  } catch (e) { Logger.log("Iniciando limpieza de colores (sin UI)..."); }

  let hojaColores, hojaProductos;
  const ss = getActiveSS();
  try {
    hojaColores = ss.getSheetByName(SHEETS.COLORS);
    hojaProductos = ss.getSheetByName(SHEETS.PRODUCTS);
    if (!hojaColores || !hojaProductos) {
      throw new Error("Hoja BD_COLORES o BD_PRODUCTOS no encontrada.");
    }
  } catch (e) {
    Logger.log(`Error al acceder a hojas: ${e.message}`);
    if (ui) ui.alert(`Error: ${e.message}`);
    return;
  }

  // --- Usa la función global de Main.gs ---
  const coloresData = convertirRangoAObjetos(hojaColores);
  const coloresValidos = new Set();

  // Asumiendo que el nombre del color está en la propiedad 'COLOR_ID'
  coloresData.forEach(colorRow => {
    if (colorRow.COLOR_ID) {
      coloresValidos.add(String(colorRow.COLOR_ID).trim().toLowerCase());
    }
  });

  Logger.log(`Se encontraron ${coloresValidos.size} colores válidos.`);

  const rangoProductos = hojaProductos.getDataRange();
  const productsData = rangoProductos.getValues();
  const headers = productsData[0];
  const coloresColumnIndex = headers.indexOf('COLORES');

  if (coloresColumnIndex === -1) {
    Logger.log('Error: Columna "COLORES" no encontrada en BD_PRODUCTOS.');
    if (ui) ui.alert('Error: Columna "COLORES" no encontrada.');
    return;
  }

  let modificadosCount = 0;
  for (let i = 1; i < productsData.length; i++) {
    const coloresOriginalesStr = productsData[i][coloresColumnIndex] || '';
    if (coloresOriginalesStr) {
      const coloresOriginalesArr = String(coloresOriginalesStr).split(',').map(c => c.trim()).filter(Boolean);
      const coloresLimpiosArr = coloresOriginalesArr.filter(colorNombre => coloresValidos.has(colorNombre.toLowerCase()));
      const coloresLimpiosStr = coloresLimpiosArr.join(', ');

      if (coloresLimpiosStr !== coloresOriginalesStr) {
        productsData[i][coloresColumnIndex] = coloresLimpiosStr;
        modificadosCount++;
      }
    }
  }

  if (modificadosCount > 0) {
    rangoProductos.setValues(productsData);
    Logger.log(`Limpieza completada. Se modificaron ${modificadosCount} registros.`);
    if (ui) ui.alert(`Limpieza completada. Se modificaron ${modificadosCount} registros.`);
  } else {
    Logger.log("Limpieza completada. No se encontraron colores huérfanos.");
    if (ui) ui.alert("Limpieza completada. No se encontraron colores huérfanos.");
  }
}


/**
 * Genera un array PHP $mapa_colores desde la hoja BD_COLORES.
 * Usa variable local ssWC y función global convertirRangoAObjetos.
 */
function generarCodigoPHPParaColores() {
  let ui; try { ui = SpreadsheetApp.getUi(); } catch (e) { }
  const NOMBRE_COLUMNA_COLOR = "COLOR_ID"; // Nombre exacto del encabezado
  const NOMBRE_COLUMNA_HEX = "HEXADECIMAL"; // Nombre exacto del encabezado

  let hojaColores;
  const ss = getActiveSS();
  try {
    hojaColores = ss.getSheetByName(SHEETS.COLORS);
    if (!hojaColores) throw new Error("Hoja BD_COLORES no encontrada.");
  } catch (e) {
    Logger.log(`Error: ${e.message}`);
    if (ui) ui.alert(`Error: ${e.message}`);
    return;
  }

  // --- Usa la función global de Main.gs ---
  const coloresData = convertirRangoAObjetos(hojaColores);
  if (coloresData.length === 0) {
    Logger.log('Hoja BD_COLORES vacía.');
    if (ui) ui.alert('Hoja BD_COLORES vacía.');
    return;
  }

  let phpArrayString = "$mapa_colores = array(\n";
  let coloresProcesados = 0;

  for (const color of coloresData) {
    const nombreColor = color[NOMBRE_COLUMNA_COLOR];
    let codigoHex = color[NOMBRE_COLUMNA_HEX];

    if (nombreColor && codigoHex && String(nombreColor).trim().toLowerCase() !== 'surtido') {
      const nombreColorPHP = String(nombreColor).trim().replace(/'/g, "\\'");
      let codigoHexFormateado = String(codigoHex).trim();
      if (!codigoHexFormateado.startsWith('#')) {
        codigoHexFormateado = '#' + codigoHexFormateado;
      }
      phpArrayString += `    '${nombreColorPHP}' => '${codigoHexFormateado}',\n`;
      coloresProcesados++;
    }
  }
  phpArrayString += ");";

  // Mostrar en diálogo HTML (si hay UI)
  if (ui) {
    const htmlOutput = HtmlService.createHtmlOutput(
      `<h3>Código PHP Generado (${coloresProcesados} colores)</h3>` +
      '<p>Copia y pega en tu fragmento de WordPress:</p>' +
      '<textarea style="width: 98%; height: 300px; font-family: monospace;" readonly>' +
      phpArrayString +
      '</textarea>'
    )
      .setWidth(600).setHeight(450);
    ui.showModalDialog(htmlOutput, 'Mapa de Colores PHP');
  } else {
    Logger.log("Código PHP generado:\n" + phpArrayString); // Fallback
  }
}

/**
 * Test: Genera el JSON para un SKU específico desde tu CSV maestro
 */
function testGenerarJSONWoo() {
  const SKU_TEST = 'PANT2984'; // <-- Aquí ponés el SKU que querés probar

  Logger.log(`🚀 Iniciando prueba para SKU: ${SKU_TEST}`);

  // ID del CSV maestro en Drive
  const CSV_FILE_ID = '1dgY89IjwuH4-IkRKObAb0QwlsojsprZq';
  const csvFile = DriveApp.getFileById(CSV_FILE_ID);
  const csvContent = csvFile.getBlob().getDataAsString();

  // Convertir CSV a filas con encabezados
  const rows = Utilities.parseCsv(csvContent);
  const encabezados = rows.shift(); // primera fila = encabezados
  const data = rows.map(fila => {
    const obj = {};
    fila.forEach((valor, i) => {
      obj[encabezados[i]] = valor;
    });
    return obj;
  });

  // Filtrar filas que coincidan con el SKU o que sean variaciones del mismo
  const rowsProducto = data.filter(r => r['SKU'] === SKU_TEST || r['Parent'] === SKU_TEST);

  if (!rowsProducto.length) {
    Logger.log(`❌ No se encontraron registros para SKU: ${SKU_TEST}`);
    return;
  }

  // Generar JSON usando la función adaptada a tu CSV
  const jsonWoo = buildWooJSONCSVExacto(rowsProducto);

  Logger.log(`✅ JSON generado para WooCommerce:`);
  Logger.log(JSON.stringify(jsonWoo, null, 2));
  Logger.log(`🏁 Se completó la ejecución de prueba`);
}

/**
 * 🛠️ Herramienta Administrativa / Auditoría:
 * Barre la hoja BD_PRODUCTOS, encuentra productos sin WOO_ID y los busca en WooCommerce
 * utilizando su CODIGO_ID (SKU). Si los encuentra, los rellena mágicamente en la hoja.
 */
function herramienta_sincronizarIdsFaltantesWP() {
  Logger.log("🚀 Iniciando Auditoría y Sync Masivo de WOO_IDs faltantes...");

  const ss = getActiveSS();
  const sheet = ss.getSheetByName(SHEETS.PRODUCTS);
  if (!sheet) throw new Error("No se encontró BD_PRODUCTOS");

  const data = convertirRangoAObjetos(sheet);
  const mapping = HeaderManager.getMapping("PRODUCTS");
  const colWooId = mapping["WOO_ID"];

  if (colWooId === undefined) {
    throw new Error("No se pudo mapear la columna WOO_ID.");
  }

  let procesados = 0;
  let encontrados = 0;

  const apiUrl = GLOBAL_CONFIG.WORDPRESS.PRODUCT_API_URL;
  const apiKey = GLOBAL_CONFIG.WORDPRESS.IMAGE_API_KEY || 'CASTFER2025';

  const scriptProps = PropertiesService.getScriptProperties();
  const lastIndex = parseInt(scriptProps.getProperty("WooSyncLastIndex") || "-1", 10);
  const startIndex = lastIndex + 1;
  const startTime = Date.now();
  const MAX_EXECUTION_TIME_MS = 280 * 1000; // 4.6 minutos de límite seguro (Google corta a los 6 min)
  let cortePorTiempo = false;
  let currIndex = startIndex;

  // Itera sobre todos los productos, comenzando desde el último procesado
  for (let i = startIndex; i < data.length; i++) {
    currIndex = i;
    // Protección contra el límite de ejecución (6 minutos de Apps Script)
    if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
      Logger.log(`⏳ Límite de tiempo seguro alcanzado (${MAX_EXECUTION_TIME_MS / 1000}s). Se pausa el proceso por seguridad.`);
      cortePorTiempo = true;
      break;
    }

    const row = data[i];
    const sku = row.CODIGO_ID;
    const wooIdActual = row.WOO_ID;

    // Si tiene SKU pero le falta el WOO_ID
    if (sku && !wooIdActual) {
      procesados++;
      Logger.log(`Buscando ID para SKU: ${sku}...`);

      const payloadHTTP = {
        apiKey: apiKey,
        action: "get_id_by_sku",
        sku: String(sku).trim()
      };

      const options = {
        method: "post",
        payload: payloadHTTP,
        muteHttpExceptions: true
      };

      try {
        const response = UrlFetchApp.fetch(apiUrl, options);
        if (response.getResponseCode() === 200) {
          const resJson = JSON.parse(response.getContentText());
          if (resJson.status === "success" && resJson.woo_id) {
            const nuevoWooId = resJson.woo_id;
            Logger.log(`✅ Encontrado: ${sku} -> ${nuevoWooId}`);
            // i + 2 porque el array de 'data' omite el header (= fila 1)
            sheet.getRange(i + 2, colWooId + 1).setValue(nuevoWooId);
            encontrados++;
          } else {
            Logger.log(`⚠️ No encontrado en WC: ${sku}`);
          }
        } else {
          Logger.log(`❌ Error servidor al buscar ${sku}: HTTP ${response.getResponseCode()}`);
        }
      } catch (e) {
        Logger.log(`❌ Error de red buscando ${sku}: ${e.message}`);
      }
    }
  }

  if (cortePorTiempo) {
    // Guardar dónde nos quedamos
    scriptProps.setProperty("WooSyncLastIndex", currIndex.toString());

    // Crear un Trigger para que arranque de nuevo en 1 minuto
    eliminarTriggersWooSync(); // Limpiar previos por seguridad
    ScriptApp.newTrigger("herramienta_sincronizarIdsFaltantesWP")
      .timeBased()
      .after(60 * 1000) // Reanudar en 1 minuto (60.000 ms)
      .create();

    Logger.log(`🏁 Secuencia pausada en fila ${currIndex}. Evaluados hoy: ${procesados}, Encontrados: ${encontrados}. El Auto-Trigger correrá en 1 minuto.`);
  } else {
    // Terminó de recorrer toda la base, limpiar basuras
    scriptProps.deleteProperty("WooSyncLastIndex");
    eliminarTriggersWooSync();
    Logger.log(`🏁 Sincronización masiva completada al 100%. Evaluados hoy: ${procesados}, Encontrados y Guardados: ${encontrados}.`);

    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert(`Auditoría Completada ✅\n\nTodos los productos han sido evaluados y se recuperaron todos los IDs posibles.`);
    } catch (e) { }
  }
}

/**
 * Utilidad privada para limpiar triggers huérfanos de la sincronización.
 */
function eliminarTriggersWooSync() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "herramienta_sincronizarIdsFaltantesWP") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}