function completarCamposFaltantesDesdeClientes(venta, datosClientes) {
  // Buscar cliente por su ID (clave primaria)
  const clienteIndex = datosClientes.findIndex((fila, i) => i > 0 && (fila[CONFIG.COLS.CLIENTES.CLIENTE_ID - 1] || "") === venta.nombre_entrega);
  if (clienteIndex === -1) return;

  const cliente = datosClientes[clienteIndex];

  // CAMBIO: Se reemplazan todas las llamadas a colIndex() por referencias a CONFIG.COLS.CLIENTES.
  // El '- 1' es para convertir el número de columna (base 1) a índice de array (base 0).
  const nombreCompleto = cliente[CONFIG.COLS.CLIENTES.NOMBRE_COMPLETO - 1] || "";
  const clienteId = cliente[CONFIG.COLS.CLIENTES.CLIENTE_ID - 1] || "";
  venta.nombre_entrega_mostrado = nombreCompleto && clienteId
    ? `${nombreCompleto} (${clienteId})`
    : nombreCompleto || clienteId;

  // Completar campos vacíos con datos del cliente
  if ((!venta.rut_entrega || venta.rut_entrega.trim() === "") && cliente[CONFIG.COLS.CLIENTES.CUIT_DNI - 1]) {
    venta.rut_entrega = cliente[CONFIG.COLS.CLIENTES.CUIT_DNI - 1];
  }
  if ((!venta.telefono_entrega || venta.telefono_entrega.trim() === "") && cliente[CONFIG.COLS.CLIENTES.CELULAR - 1]) {
    venta.telefono_entrega = cliente[CONFIG.COLS.CLIENTES.CELULAR - 1];
  }
  if ((!venta.correo_entrega || venta.correo_entrega.trim() === "") && cliente[CONFIG.COLS.CLIENTES.CORREO_ELECTRONICO - 1]) {
    venta.correo_entrega = cliente[CONFIG.COLS.CLIENTES.CORREO_ELECTRONICO - 1];
  }
  venta.agencia_entrega = cliente[CONFIG.COLS.CLIENTES.AGENCIA_ENVIO - 1] || "";

  if (venta.agencia_entrega) {
    const hojaAgencias = ss.getSheetByName(CONFIG.SHEETS.AGENCIAS_ENVIO);
    const dataAgencias = hojaAgencias.getRange(2, 1, hojaAgencias.getLastRow() - 1, 3).getValues();

    const filaAgencia = dataAgencias.find(fila => fila[0] === venta.agencia_entrega);
    if (filaAgencia) {
      venta.costo_agencia = filaAgencia[1] || "";
      venta.hora_entrega_agencia = filaAgencia[2] || "";
    }
  }

  // Reconstruir dirección completa usando las constantes
  const calle = cliente[CONFIG.COLS.CLIENTES.CALLE - 1] || "";
  const numero = cliente[CONFIG.COLS.CLIENTES.NUMERO - 1] || "";
  const piso = cliente[CONFIG.COLS.CLIENTES.PISO - 1] || "";
  const departamento = cliente[CONFIG.COLS.CLIENTES.DEPARTAMENTO - 1] || "";
  const cp = cliente[CONFIG.COLS.CLIENTES.CODIGO_POSTAL - 1] || "";
  const localidad = cliente[CONFIG.COLS.CLIENTES.LOCALIDAD - 1] || "";
  const provincia = cliente[CONFIG.COLS.CLIENTES.PROVINCIA - 1] || "";
  const observacion = cliente[CONFIG.COLS.CLIENTES.OBSERVACION - 1] || "";
  const tipoEnvio = cliente[CONFIG.COLS.CLIENTES.TIPO_ENVIO - 1] || "";

  if (tipoEnvio === "RETIRO TIENDA") {
    venta.direccion_entrega = ""; // No mostrar dirección para este caso
  } else {
    let direccion = `${calle} ${numero}`.trim();
    if (piso) direccion += ` Piso ${piso}`;
    if (departamento) direccion += ` Depto ${departamento}`;
    direccion += `, CP${cp} ${localidad} - ${provincia}`;
    if (observacion) direccion += ` - Observación: ${observacion}`;
    if (tipoEnvio) direccion += ` - Tipo Envío: ${tipoEnvio}`;

    if (!venta.direccion_entrega || venta.direccion_entrega.trim() === "") {
      venta.direccion_entrega = direccion;
    }
  }
}

function buscarClienteExistente(datosClientes, correo, dni, celular) {
  let index = -1;

  // CAMBIO: Se reemplazan los números de índice fijos por constantes.
  // Buscar por correo electrónico
  index = datosClientes.findIndex(c => (String(c[CONFIG.COLS.CLIENTES.CORREO_ELECTRONICO - 1] || "")).toLowerCase() === (correo || "").toLowerCase());
  if (index !== -1) return index + 2;

  // Buscar por CUIT/DNI
  const dniSanit = (dni || "").replace(/\D/g, '');
  index = datosClientes.findIndex(c => String(c[CONFIG.COLS.CLIENTES.CUIT_DNI - 1] || "").replace(/\D/g, '') === dniSanit);
  if (index !== -1) return index + 2;

  // Buscar por CELULAR
  const celSanit = (celular || "").replace(/\D/g, '');
  index = datosClientes.findIndex(c => String(c[CONFIG.COLS.CLIENTES.CELULAR - 1] || "").replace(/\D/g, '') === celSanit);
  if (index !== -1) return index + 2;

  return -1;
}