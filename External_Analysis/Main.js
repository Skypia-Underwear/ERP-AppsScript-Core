/**
 * =====================================================================================
 * ARCHIVO: Main.gs (Controlador Principal)
 * RESPONSABILIDAD: Recibir todas las peticiones (GET y POST) y delegar la lógica
 * a los archivos de servicio correspondientes.
 * =====================================================================================
 */
/**
 * GESTOR DE PETICIONES POST (VERSIÓN COMPLETA)
 * Se activa para operaciones como registrar una venta, pagar o cancelar.
 */
function doPost(e) {
  Logger.log("Petición POST recibida: " + new Date());
  const operacion = JSON.parse(e.postData.contents);
  let respuestaObjeto = {};

  switch (operacion.op) {
    case "configuracion":
      respuestaObjeto = listar_configuracion(); 
      if (operacion.id) {
        adjuntarPedidoARespuesta(respuestaObjeto, operacion.id);
      }
      break;
    case "cargar_venta":
      respuestaObjeto = JSON.parse(cargar_venta(JSON.stringify(operacion)));
      break;
    case "venta":
      respuestaObjeto = JSON.parse(registrar_venta(JSON.stringify(operacion)));
      break;

    case "pagar":
      respuestaObjeto = JSON.parse(pagar_venta(JSON.stringify(operacion)));
      break;

    case "cancelar":
      respuestaObjeto = JSON.parse(cancelar_venta(JSON.stringify(operacion)));
      break;
    // --- FIN DE CASOS AÑADIDOS ---

    default:
      respuestaObjeto = { status: "-1", message: "Operación no reconocida: " + operacion.op };
      break;
  }

  // Convertimos el objeto a texto JSON justo antes de enviarlo.
  const respuestaJSON = JSON.stringify(respuestaObjeto);
  return ContentService.createTextOutput(respuestaJSON).setMimeType(ContentService.MimeType.JSON);
}

/**
 * GESTOR DE PETICIONES GET (VERSIÓN CORREGIDA FINAL)
 * Se activa como respaldo. Devuelve JSONP.
 */
function doGet(e) {
  Logger.log("Petición GET (respaldo) recibida: " + new Date());

  const parametros = e ? e.parameter : {};
  let respuestaObjeto = {}; // Empezamos con un objeto vacío

  if (parametros.op === "configuracion") {
    // 1. Llamamos a la función en Cache.gs, que devuelve un OBJETO.
    respuestaObjeto = listar_configuracion(); 

    // 2. Si se pide un pedido específico, lo adjuntamos al OBJETO.
    if (parametros.id) {
        adjuntarPedidoARespuesta(respuestaObjeto, parametros.id);
    }
  } else {
    respuestaObjeto = { status: "-1", message: "Operación GET no válida." };
  }

  // 3. ¡EL PRIMER CAMBIO CLAVE! Convertimos el OBJETO a una CADENA DE TEXTO JSON.
  const respuestaJSON_string = JSON.stringify(respuestaObjeto);
  
  // 4. ¡EL SEGUNDO CAMBIO CLAVE! Envolvemos la CADENA en el callback JSONP.
  const callback = parametros.callback || "callback";
  const jsonpResponse = `${callback}(${respuestaJSON_string})`;
  
  // 5. Devolvemos la respuesta como JavaScript.
  return ContentService.createTextOutput(jsonpResponse)
                     .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * FUNCIÓN AUXILIAR (Helper)
 * Para no repetir la lógica de adjuntar un pedido a la respuesta.
 */
function adjuntarPedidoARespuesta(respuestaObjeto, idPedido) {
    try {
        const ventaRaw = cargar_venta(JSON.stringify({ id: idPedido }));
        const venta = JSON.parse(ventaRaw);
        if (venta.status === "0") {
            respuestaObjeto.pedido = venta.pedido;
        }
    } catch (error) {
        Logger.log(`Advertencia: No se pudo adjuntar el pedido ${idPedido}. Error: ${error.toString()}`);
        respuestaObjeto.error_adicional = "No se pudo cargar el pedido adjunto.";
    }
}