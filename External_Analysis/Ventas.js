// =================================================================================
// ARCHIVO: Ventas.gs
// RESPONSABILIDAD: Contiene toda la lógica para crear, cargar y modificar
// las transacciones de ventas.
// =================================================================================

/**
 * Carga los detalles de una venta existente a partir de su ID.
 * @param {string} informacion - Una cadena JSON con la propiedad "id" de la venta.
 * @returns {string} Una cadena JSON con el estado de la operación y los datos del pedido.
 */
function cargar_venta(informacion) {
  const jo = {};
  try {
    const venta = JSON.parse(informacion);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.VENTAS);
    venta.id = venta.id.replace("&m=1", "").replace("?m=1", "");
    const rows_ventas = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    let pedido_ = "";

    for (const dataRow of rows_ventas) {
      if ((dataRow[CONFIG.COLS.VENTAS.CODIGO - 1] + "") === (venta.id + "")) {
        pedido_ = JSON.parse(dataRow[CONFIG.COLS.VENTAS.DETALLE_JSON - 1]);
        break;
      }
    }

    if (pedido_) {
      jo.status = '0';
      jo.message = ' OK ';
      jo.pedido = pedido_;
      jo.pedido.idpedido = venta.id;
    } else {
      jo.status = '1';
      jo.message = ' No se encontro el pedido ' + venta.id;
    }
  } catch (e) {
    jo.status = '-1';
    jo.message = e.toString();
  }
  return JSON.stringify(jo);
}


/**
 * Registra una nueva venta o edita una existente en el sistema.
 * @param {string} informacion - Una cadena JSON con todos los datos de la venta.
 * @returns {string} Una cadena JSON con el estado de la operación y un mensaje para WhatsApp.
 */
function registrar_venta(informacion) {
  const jo = {};
  try {
    let venta = JSON.parse(informacion);

    const hojaClientes = ss.getSheetByName(CONFIG.SHEETS.CLIENTES);
    let datosClientes = hojaClientes.getDataRange().getValues();
    const hojaVentas = ss.getSheetByName(CONFIG.SHEETS.VENTAS);
    const hojaDetalleVentas = ss.getSheetByName(CONFIG.SHEETS.DETALLE_VENTAS);

    let codigoventa = Utilities.getUuid();
    let backup_edicion = "";

    const nombre = (venta.nombre_entrega || "").trim();
    const correo = (venta.correo_entrega || "").trim();
    const rut = (venta.rut_entrega || "").trim();
    const telefono = (venta.telefono_entrega || "").trim();
    const direccion = (venta.direccion_entrega || "").trim();
    const agencia = (venta.agencia_entrega || "").trim();

    const esClientePublico = (nombre === "CLI001" || (!nombre && !correo));

    // --- ⭐ INICIO DE LA CORRECCIÓN: ESTRUCTURA IF / ELSE IF REPARADA ---

    if (esClientePublico) {
      venta.nombre_entrega = "CLI001";
      venta.agencia_entrega = "RETIRO TIENDA";

    } else if (nombre && correo && !rut && !telefono && !direccion && !agencia) {
      // Caso: Se está validando un cliente existente por ID y Correo.
      const clienteExiste = datosClientes.some((fila, i) => {
        if (i === 0) return false;
        const id = (fila[CONFIG.COLS.CLIENTES.CLIENTE_ID - 1] || "").toString().toLowerCase().trim();
        const mail = (fila[CONFIG.COLS.CLIENTES.CORREO_ELECTRONICO - 1] || "").toString().toLowerCase().trim();
        return id === nombre.toLowerCase() && mail === correo.toLowerCase();
      });

      if (!clienteExiste) {
        return JSON.stringify({
          status: "1",
          message: "Cliente no encontrado. No se puede registrar la venta.",
        });
      }
      // Aquí el flujo termina si el cliente no existe, o continúa si existe.

    } else if (nombre && correo && rut && telefono && agencia && !direccion) {
      // Caso: Nuevo cliente con registro SIMPLE (sin dirección).
      const filaCliente = buscarClienteExistente(datosClientes, correo, rut, telefono);
      if (filaCliente !== -1) {
        const clienteID = hojaClientes.getRange(filaCliente, CONFIG.COLS.CLIENTES.CLIENTE_ID).getValue();
        venta.nombre_entrega = clienteID;
        completarCamposFaltantesDesdeClientes(venta, datosClientes);
      } else {
        const nuevaFilaNum = hojaClientes.getLastRow() + 1;
        const clienteID = "CLI" + nuevaFilaNum.toString().padStart(3, "0");

        const nuevaFilaCliente = [];
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CLIENTE_ID - 1] = clienteID;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CLASIFICACION - 1] = "SIMPLE";
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.NOMBRE_COMPLETO - 1] = nombre;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CELULAR - 1] = telefono;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CORREO_ELECTRONICO - 1] = correo;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CUIT_DNI - 1] = rut;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CONDICION_FISCAL - 1] = "Consumidor Final";
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.AGENCIA_ENVIO - 1] = agencia;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.TIPO_ENVIO - 1] = agencia;
        
        hojaClientes.appendRow(nuevaFilaCliente);

        venta.nombre_entrega = clienteID;
        datosClientes = hojaClientes.getDataRange().getValues();
        completarCamposFaltantesDesdeClientes(venta, datosClientes);
      }
    } else if (nombre && correo && rut && telefono && agencia && direccion) {
      // Caso: Nuevo cliente con registro COMPLETO (con dirección).
      const filaCliente = buscarClienteExistente(datosClientes, correo, rut, telefono);
      if (filaCliente !== -1) {
        const clienteID = hojaClientes.getRange(filaCliente, CONFIG.COLS.CLIENTES.CLIENTE_ID).getValue();
        venta.nombre_entrega = clienteID;
        completarCamposFaltantesDesdeClientes(venta, datosClientes);
      } else {
        const partes = direccion.split(" - ").map(s => s.trim());
        let calle = "", numero = "", codigoPostal = "", localidad = "", provincia = "", municipio = "";
        let piso = "", departamento = "", observacion = "", tipoEnvio = "";
        
        const partesDireccionBase = partes.filter(parte => {
            if (/Piso:/i.test(parte)) { piso = (parte.match(/Piso:\s*(.*)/i) || [])[1]?.trim() || ""; return false; }
            else if (/Departamento:/i.test(parte)) { departamento = (parte.match(/Departamento:\s*(.*)/i) || [])[1]?.trim() || ""; return false; }
            else if (/Observación:/i.test(parte)) { observacion = (parte.match(/Observación:\s*(.*)/i) || [])[1]?.trim() || ""; return false; }
            else if (/Tipo de Envío:/i.test(parte)) { tipoEnvio = (parte.match(/Tipo de Envío:\s*(.*)/i) || [])[1]?.trim().toUpperCase() || ""; return false; }
            return true;
        });

        if (partesDireccionBase.length > 0) calle = partesDireccionBase[0];
        if (partesDireccionBase.length > 1) numero = partesDireccionBase[1];
        if (partesDireccionBase.length > 2) { const cpMatch = partesDireccionBase[2].match(/CP\s*(.*)/i); codigoPostal = cpMatch ? cpMatch[1].trim() : ""; }
        if (partesDireccionBase.length > 3) localidad = partesDireccionBase[3];
        if (partesDireccionBase.length > 4) municipio = partesDireccionBase[4];
        if (partesDireccionBase.length > 5) provincia = partesDireccionBase[5];

        const nuevaFilaNum = hojaClientes.getLastRow() + 1;
        const clienteID = "CLI" + nuevaFilaNum.toString().padStart(3, "0");

        const nuevaFilaCliente = [];
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CLIENTE_ID - 1] = clienteID;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CLASIFICACION - 1] = "COMPLETO";
        // ... (resto de la asignación de campos)
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.NOMBRE_COMPLETO - 1] = nombre;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CELULAR - 1] = telefono;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CORREO_ELECTRONICO - 1] = correo;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CUIT_DNI - 1] = rut;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CONDICION_FISCAL - 1] = "Consumidor Final";
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.TIPO_ENVIO - 1] = tipoEnvio;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.AGENCIA_ENVIO - 1] = agencia;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CODIGO_POSTAL - 1] = codigoPostal;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.PROVINCIA - 1] = provincia;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.MUNICIPIO - 1] = municipio;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.LOCALIDAD - 1] = localidad;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.CALLE - 1] = calle;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.NUMERO - 1] = numero;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.PISO - 1] = piso;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.DEPARTAMENTO - 1] = departamento;
        nuevaFilaCliente[CONFIG.COLS.CLIENTES.OBSERVACION - 1] = observacion;
        
        hojaClientes.appendRow(nuevaFilaCliente);

        venta.nombre_entrega = clienteID;
        datosClientes = hojaClientes.getDataRange().getValues();
        completarCamposFaltantesDesdeClientes(venta, datosClientes);
      }
    }

    if (venta.operacion === "e" && venta.id) {
      codigoventa = venta.id;
      const rows_venta = hojaVentas.getRange(2, 1, hojaVentas.getLastRow() - 1, hojaVentas.getLastColumn()).getValues();
      const rows_detalleventa = hojaDetalleVentas.getRange(2, 1, hojaDetalleVentas.getLastRow() - 1, hojaDetalleVentas.getLastColumn()).getValues();

      for (let il = rows_venta.length - 1; il >= 0; il--) {
        if (codigoventa == rows_venta[il][CONFIG.COLS.VENTAS.CODIGO - 1]) {
          backup_edicion = rows_venta[il][CONFIG.COLS.VENTAS.DETALLE_JSON - 1];
          hojaVentas.deleteRow(il + 2);
          break;
        }
      }

      for (let il = rows_detalleventa.length - 1; il >= 0; il--) {
        if (codigoventa == rows_detalleventa[il][CONFIG.COLS.DETALLE_VENTAS.VENTA_ID - 1]) {
          hojaDetalleVentas.deleteRow(il + 2);
        }
      }
    }

    const fecha = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "yyyy-MM-dd");
    const hora = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "HH:mm:ss");
    
    const hojaAgencias = ss.getSheetByName(CONFIG.SHEETS.AGENCIAS_ENVIO);
    let costo_agencia = "", tiempo_agencia = "";
    if (hojaAgencias.getLastRow() > 1) {
      const rows_agencia = hojaAgencias.getRange(2, 1, hojaAgencias.getLastRow() - 1, 3).getValues();
      for (const row of rows_agencia) {
        if (row[0] == venta.agencia_entrega) {
          costo_agencia = row[1];
          tiempo_agencia = row[2];
          break;
        }
      }
    }

    if (venta.operacion === "e" && backup_edicion) {
      try {
        const backupVenta = JSON.parse(backup_edicion);
        if (backupVenta && backupVenta.nombre_entrega) {
          venta.nombre_entrega = backupVenta.nombre_entrega;
        }
      } catch (e) {
        console.error("Error al parsear backup_edicion:", e);
      }
    }

    completarCamposFaltantesDesdeClientes(venta, datosClientes);

    if (hojaAgencias.getLastRow() > 1) {
        const rows_agencia = hojaAgencias.getRange(2, 1, hojaAgencias.getLastRow() - 1, 3).getValues();
        for (const row of rows_agencia) {
            if (row[0] == venta.agencia_entrega) {
                costo_agencia = row[1];
                tiempo_agencia = row[2];
                break;
            }
        }
    }

    const totalConRecargo = parseFloat(venta.total) || 0;
    const recargoOriginal = parseFloat(venta.recargo_valor) || 0;
    const envio = parseFloat(costo_agencia) || 0;
    const subtotalSinRecargo = totalConRecargo - recargoOriginal;
    const porcentajeRecargo = parseFloat(venta.recargo_pago) || 0;
    const nuevoSubtotal = subtotalSinRecargo + envio;
    const recargoRecalculado = nuevoSubtotal * (porcentajeRecargo / 100);
    const totalFinal = nuevoSubtotal + recargoRecalculado;

    venta.total = totalFinal.toFixed(2);
    venta.recargo_valor = recargoRecalculado.toFixed(0);
    venta.costo_agencia = envio;
    venta.hora_entrega_agencia = tiempo_agencia;

    const nuevaFilaVenta = [];
    nuevaFilaVenta[CONFIG.COLS.VENTAS.CODIGO - 1] = codigoventa;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.FECHA - 1] = fecha;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.HORA - 1] = hora;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.CAJA_ID - 1] = "";
    nuevaFilaVenta[CONFIG.COLS.VENTAS.METODO_PAGO - 1] = venta.forma_pago;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.DATOS_TRANSFERENCIA - 1] = venta.cuenta_transferencia_id || "";
    nuevaFilaVenta[CONFIG.COLS.VENTAS.CLIENTE_ID - 1] = venta.nombre_entrega;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.DOCUMENTO - 1] = venta.rut_entrega;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.CELULAR - 1] = venta.telefono_entrega;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.CORREO - 1] = venta.correo_entrega;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.DIRECCION - 1] = venta.direccion_entrega;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.AGENCIA - 1] = venta.agencia_entrega;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.TIEMPO_ENTREGA - 1] = tiempo_agencia;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.MONEDA - 1] = venta.moneda;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.COSTO_ENVIO - 1] = costo_agencia;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.RECARGO - 1] = venta.recargo_valor || 0;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.TOTAL_VENTA - 1] = venta.total;
    nuevaFilaVenta[CONFIG.COLS.VENTAS.DETALLE_JSON - 1] = JSON.stringify(venta);
    nuevaFilaVenta[CONFIG.COLS.VENTAS.ESTADO - 1] = "SOLICITADO";
    nuevaFilaVenta[CONFIG.COLS.VENTAS.JSON_BACKUP - 1] = backup_edicion;

    hojaVentas.appendRow(nuevaFilaVenta);

    // 1. Obtenemos el ID de la tienda ANTES de entrar al bucle para mayor eficiencia.
    const hojaTiendas = ss.getSheetByName(CONFIG.SHEETS.TIENDAS);
    const tiendaId = hojaTiendas.getRange(2, CONFIG.COLS.TIENDAS.TIENDA_ID).getValue();

    let detalle_pedido = "";
    let detalle_pedido_meta = "";

    for (const item of venta.detalle) {
      item.nombre = item.nombre.replace(/<\/?b>/g, "");
      
      // La lógica para extraer productoID, color y talle sigue igual
      const productoID = item.nombre.split(" ")[0];
      const contenidoParentesis = item.nombre.match(/\(([^)]+)\)/);
      const contenido = contenidoParentesis ? contenidoParentesis[1].trim() : "";
      const partes = contenido.split("-").map(part => part.trim());
      const color = partes.length > 1 ? partes[1] : "Surtido";
      let talle = "Surtido";
      if (partes.length > 2) {
        talle = partes.slice(2).join("-");
      }

      detalle_pedido += `${item.nombre} Cant: ${item.cantidad} x ${item.precio} = ${item.moneda}${item.total}\n`;
      detalle_pedido_meta += `${item.nombre} - ${item.moneda}${item.total}\\n`;

      // 2. Construimos el VARIACION_ID con la fórmula requerida.
      const variacionId = `${productoID}-${color}-${talle}-${tiendaId}`;

      const nuevaFilaDetalle = [];
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.VENTA_ID - 1] = codigoventa;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.PRODUCTO_NOMBRE - 1] = item.nombre;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.CATEGORIA - 1] = item.categoria;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.CANTIDAD - 1] = item.cantidad;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.PRECIO - 1] = item.precio;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.TOTAL - 1] = item.total;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.PRODUCTO_ID - 1] = productoID;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.COLOR - 1] = color;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.TALLE - 1] = talle;
      nuevaFilaDetalle[CONFIG.COLS.DETALLE_VENTAS.VARIEDAD_ID - 1] = variacionId;

      hojaDetalleVentas.appendRow(nuevaFilaDetalle);
    }

    jo.status = '0';
    if (venta.operacion === "e" && venta.id) {
      jo.message = 'Se editó la venta exitosamente';
      const rows_venta_codigos = hojaVentas.getRange(2, CONFIG.COLS.VENTAS.CODIGO, hojaVentas.getLastRow() - 1, 1).getValues();
      const fila_actualizar = rows_venta_codigos.flat().lastIndexOf(codigoventa);
      if (fila_actualizar !== -1) {
        hojaVentas.getRange(fila_actualizar + 2, CONFIG.COLS.VENTAS.ESTADO).setValue("EDITADO");
      }
    } else {
      jo.message = 'Se grabó la venta exitosamente';
    }

    jo.message_whatsapp = generarMensajeWhatsApp(venta, codigoventa, fecha, hora, detalle_pedido);

  }
   catch (e) {
    jo.status = '-1';
    jo.message = e.toString();
  }
  return JSON.stringify(jo);
}
/**
 * Marca una venta como PAGADA en la hoja de cálculo.
 * @param {string} informacion - Una cadena JSON con la propiedad "idpedido".
 * @returns {string} Una cadena JSON con el estado de la operación.
 */
function pagar_venta(informacion) {
  const jo = {};
  try {
    const venta = JSON.parse(informacion);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.VENTAS);
    const rows_codigos = sheet.getRange(2, CONFIG.COLS.VENTAS.CODIGO, sheet.getLastRow() - 1, 1).getValues();
    const fila_actualizar = rows_codigos.flat().lastIndexOf(venta.idpedido);

    if (fila_actualizar !== -1) {
      sheet.getRange(fila_actualizar + 2, CONFIG.COLS.VENTAS.ESTADO).setValue("PAGADO");
      jo.status = "0";
      jo.message = "Se notifico el pagó de la venta exitosamente, espere confirmacion por WhatsApp";
    } else {
      jo.status = "-1";
      jo.message = "Error: No se encontró el pedido";
    }
  } catch (e) {
    jo.status = "-1";
    jo.message = e.toString();
  }
  return JSON.stringify(jo);
}


/**
 * Elimina una venta y sus detalles correspondientes de las hojas de cálculo.
 * @param {string} informacion - Una cadena JSON con la propiedad "idpedido".
 * @returns {string} Una cadena JSON con el estado de la operación.
 */
function cancelar_venta(informacion) {
  const jo = {};
  try {
    const venta = JSON.parse(informacion);
    const hojaVentas = ss.getSheetByName(CONFIG.SHEETS.VENTAS);
    const hojaDetalle = ss.getSheetByName(CONFIG.SHEETS.DETALLE_VENTAS);

    const rowsVentas = hojaVentas.getRange(2, CONFIG.COLS.VENTAS.CODIGO, hojaVentas.getLastRow() - 1, 1).getValues();
    const filaVenta = rowsVentas.flat().lastIndexOf(venta.idpedido);

    if (filaVenta !== -1) {
      hojaVentas.deleteRow(filaVenta + 2);
    } else {
      jo.status = "-1";
      jo.message = `Error: No se encontró el pedido en ${CONFIG.SHEETS.VENTAS}`;
      return JSON.stringify(jo);
    }

    const rowsDetalle = hojaDetalle.getRange(2, CONFIG.COLS.DETALLE_VENTAS.VENTA_ID, hojaDetalle.getLastRow() - 1, 1).getValues();
    for (let i = rowsDetalle.length - 1; i >= 0; i--) {
      if ((rowsDetalle[i][0] + "") === (venta.idpedido + "")) {
        hojaDetalle.deleteRow(i + 2);
      }
    }

    jo.status = "0";
    jo.message = "Venta y detalles eliminados correctamente";

  } catch (e) {
    jo.status = "-1";
    jo.message = e.toString();
  }
  return JSON.stringify(jo);
}


// =================================================================================
// FUNCION DE AYUDA (Helper)
// =================================================================================

/**
 * Genera un mensaje de texto formateado para ser enviado por WhatsApp con los detalles de la venta.
 * @param {object} venta - El objeto de la venta, con todos los datos del cliente y del pedido.
 * @param {string} codigoventa - El ID único de la venta.
 * @param {string} fecha - La fecha de la venta en formato "yyyy-MM-dd".
 * @param {string} hora - La hora de la venta en formato "HH:mm:ss".
 * @param {string} detalle_pedido - El string pre-formateado con los ítems del pedido.
 * @returns {string} El mensaje completo y formateado para WhatsApp.
 */
function generarMensajeWhatsApp(venta, codigoventa, fecha, hora, detalle_pedido) {
  let mensaje = `Pedido: ${venta.url}?o=p&id=${codigoventa}\n`;

  function agregarCampo(campoNombre, campoValor) {
    if (campoValor && campoValor.toString().trim() !== "") {
      mensaje += `*${campoNombre}:*\n${campoValor}\n`;
    }
  }

  const fechaObj = new Date(`${fecha}T${hora}`);
  const fechaPedidoFormateada = formatearFechaEnEspanol(fechaObj);

  agregarCampo("FECHA DEL PEDIDO", fechaPedidoFormateada);
  agregarCampo('NOMBRE Y APELLIDOS', venta.nombre_entrega_mostrado || venta.nombre_entrega);
  agregarCampo('DOCUMENTO', venta.rut_entrega);
  agregarCampo('CONDICION FISCAL', venta.condicion_fiscal);
  agregarCampo('TELEFONO', venta.telefono_entrega);
  agregarCampo('CORREO', venta.correo_entrega);
  agregarCampo('DIRECCION', venta.direccion_entrega);
  agregarCampo('FORMA DE ENVIO', venta.agencia_entrega);

  try {
    const esRetiroTienda = (venta.agencia_entrega || "").toUpperCase() === "RETIRO TIENDA";
    const etiquetaHora = esRetiroTienda ? 'HORA LIMITE DE RETIRO' : 'HORA ENTREGA';
    if (venta.hora_entrega_agencia) {
      const horaStr = Utilities.formatDate(new Date(venta.hora_entrega_agencia), "America/Argentina/Buenos_Aires", "HH:mm");
      const fechaStr = fecha;
      const fechaHoraEntrega = new Date(`${fechaStr}T${horaStr}:00-03:00`);
      const ahora = new Date();
      const ahoraArg = new Date(Utilities.formatDate(ahora, "America/Argentina/Buenos_Aires", "yyyy-MM-dd'T'HH:mm:ss"));
      if (fechaHoraEntrega < ahoraArg) {
        fechaHoraEntrega.setDate(fechaHoraEntrega.getDate() + 1);
      }
      const mensajeFinal = formatearFechaEnEspanol(fechaHoraEntrega);
      agregarCampo(etiquetaHora, mensajeFinal);
    } else {
      agregarCampo(etiquetaHora, "No especificada");
    }
  } catch (e) {
    agregarCampo("HORA ENTREGA", venta.hora_entrega_agencia);
  }

  agregarCampo('TIPO DE ENVIO', venta.tipo_envio);
  agregarCampo('FORMA DE PAGO', venta.forma_pago);

  if (venta.forma_pago === 'Transferencia' && venta.cuenta_transferencia) {
    agregarCampo('ALIAS', venta.cuenta_transferencia.alias);
    agregarCampo('CBU', venta.cuenta_transferencia.cbu);
    agregarCampo('CUENTA', venta.cuenta_transferencia.cuenta);
    agregarCampo('BANCO', venta.cuenta_transferencia.banco);
  }

  mensaje += `*PEDIDO:*\n${detalle_pedido}\n`;
  agregarCampo('COSTO ENVÍO', venta.costo_agencia ? `${venta.moneda}${venta.costo_agencia}` : 'Sin costo');
  if (venta.recargo_pago && venta.recargo_valor) {
    agregarCampo('RECARGO POR PAGO', `${venta.recargo_pago}% → ${venta.moneda}${venta.recargo_valor}`);
  }
  mensaje += `*TOTAL PEDIDO:* ${venta.moneda}${venta.total}\n`;

  return mensaje;
}