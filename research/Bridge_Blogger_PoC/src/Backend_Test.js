/**
 * BACKEND_TEST.js
 * Este archivo debe ir en el NUEVO proyecto de Apps Script.
 * Se encarga de recibir las peticiones desde Blogger vía JSONP.
 */

function doGet(e) {
  const callback = e.parameter.callback;
  const accion = e.parameter.accion;
  const payload = JSON.parse(e.parameter.payload || "[]");

  let responseData = { success: false, message: "Acción no reconocida" };

  try {
    if (accion === 'tpv_obtenerCatalogoDesdeDrive') {
      // Simulación de respuesta de catálogo
      responseData = {
        success: true,
        message: "Catálogo recuperado exitosamente",
        data: { /* ... datos ... */ }
      };
    } else if (accion === 'procesarAccionInventario') {
      const type = payload[0]; // getHydration, guardarMatrizStock, etc.
      console.log("🛠️ Inventario Acción:", type);
      
      if (type === 'getHydration') {
        responseData = {
          success: true,
          map: {
            "v1": { s: 10, e: 5, sa: 0, vw: 2, vl: 3 } // Ejemplo de mock
          }
        };
      } else {
        responseData = { success: true, message: "Acción " + type + " recibida." };
      }
    } else if (accion === 'getBartenderFullHistory') {
      responseData = [];
    } else if (accion === 'checkNewProductsFlag') {
      responseData = { success: true, hasNew: false };
    }
    // Añadir aquí la lógica real mapeada del ERP
  } catch (err) {
    responseData = { success: false, message: err.toString() };
  }

  // Empaquetar para JSONP
  const output = callback + "(" + JSON.stringify(responseData) + ")";
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
