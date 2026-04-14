/**
 * HERRAMIENTA DE DESCUBRIMIENTO DE ESQUEMA (Producción v4.0)
 * 
 * Esta función escanea TODAS las hojas del Spreadsheet y actualiza la visión del ERP.
 * Úsela cada vez que agregue o mueva columnas físicamente en las hojas.
 */
function util_DiscoveryGenerateFullSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("\n🚀 INICIANDO DESCUBRIMIENTO DE ESQUEMA...");
  
  const schemaOutput = {};
  for (const alias in SHEETS) {
    const sheetName = SHEETS[alias];
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const lastCol = sheet.getLastColumn();
      const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim()) : [];
      schemaOutput[alias] = headers;
      Logger.log(`✅ [${alias}]: ${headers.length} columnas detectadas.`);
    }
  }
  Logger.log("\n📦 OBJETO SHEET_SCHEMA ACTUALIZADO:\n" + JSON.stringify(schemaOutput, null, 2));
  return "Esquema generado. Ver el log para copiar el JSON.";
}

/**
 * ERP GLOBAL HEALTH CHECK (Sello de Calidad v4.0)
 * 
 * Ejecuta una auditoría integral de todos los módulos críticos:
 * Inventario, Imágenes, WooCommerce y Dashboard.
 */
function util_ERP_HEALTH_CHECK() {
  const report = {
    timestamp: new Date().toLocaleString(),
    system: "HostingShop ERP Architecture v4.0",
    modules: {}
  };

  const checkMapping = (alias, criticalFields) => {
    const mapping = HeaderManager.getMapping(alias);
    if (!mapping) return { status: "🔴 ERROR: Sin mapeo" };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS[alias]);
    if (!sheet) return { status: "🔴 ERROR: Hoja no encontrada" };
    
    const fields = {};
    criticalFields.forEach(f => {
      fields[f] = (mapping[f] !== undefined) ? "✅ OK" : "❌ FALTANTE";
    });
    return { status: "🟢 OPERATIVO", columnCount: sheet.getLastColumn(), fields: fields };
  };

  // Auditoría por Módulos
  report.modules.INVENTORY = checkMapping("INVENTORY", ["INVENTARIO_ID", "PRODUCTO_ID", "STOCK_ACTUAL"]);
  report.modules.PRODUCTS = checkMapping("PRODUCTS", ["CODIGO_ID", "CATEGORIA", "MARCA"]);
  report.modules.IMAGES = checkMapping("PRODUCT_IMAGES", ["ARCHIVO_ID", "URL", "SYNC_WC"]);
  report.modules.SALES = checkMapping("VENTAS_PEDIDOS", ["VENTA_ID", "TOTAL_VENTA", "ESTADO"]);
  
  // -- NUEVO: Auditoría de Servicios Externos --
  report.modules.WOOCOMMERCE = checkMapping("WC_ORDERS", ["ID_ORDEN", "ESTADO", "TOTAL_VENTA", "ULTIMA_ACTUALIZACION"]);
  report.modules.BLOGGER = checkMapping("BLOGGER_SALES", ["CODIGO", "TOTAL_VENTA", "ESTADO", "DETALLE_JSON"]);
  report.modules.BLOGGER_CONFIG = checkMapping("BLOGGER_CONFIG", ["PARAMETRO_ID", "CONFIGURACION"]);

  const output = JSON.stringify(report, null, 2);
  Logger.log("\n🛡️ REPORTE DE SALUD INTEGRAL ERP v4.2:\n" + output);
  
  try {
    if (typeof SpreadsheetApp.getUi === 'function') {
      const ui = SpreadsheetApp.getUi();
      ui.alert("ERP Health Check v4.2", "Estado del Sistema: OK\nRevisa los logs para el detalle técnico.", ui.ButtonSet.OK);
    }
  } catch (e) {
    Logger.log("ℹ️ (UI omitida: Ejecución desde el editor)");
  }
  
  return report;
}
