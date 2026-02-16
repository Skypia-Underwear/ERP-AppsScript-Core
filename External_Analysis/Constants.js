const CONFIG = {
  // =============================================================
  // IDs PRINCIPALES (DRIVE, SPREADSHEET)
  // =============================================================
  IDS: {
    APP_ID: "HOSTINGSHOPBLOGGER-227675214",  //ID de tu Aplicacion en Appsheet
    SPREADSHEET: "15x9wDRIBw4fGNXJ1MJCG9QvycLfFtAtf-i2SYiUMehc", // ID de tu Hoja de Cálculo
    DRIVE_FOLDER_CACHE: "1gM0BNaVa-LfTp80u7JQ177LnhmafqaNf",   // ID de la carpeta en Drive donde se guarda el JSON
    JSON_CACHE_FILE: "1qoRqhGCWUauEu4jjjY7AtXuOjCH7ehgs",       // ID fijo del archivo JSON de configuración
    CACHE_FILENAME: "configuracion_sitio.json"         // Nombre del Archivo JSON
  },

  // =============================================================
  // NOMBRES DE LAS HOJAS DE CÁLCULO
  // =============================================================
  SHEETS: {
    // Hojas de Transacciones
    VENTAS: "BLOGGER_VENTAS",
    DETALLE_VENTAS: "BLOGGER_DETALLE_VENTAS",
    CONFIG_BLOGGER: "BLOGGER_CONFIGURACION",

    // Hojas de Base de Datos (BD)
    PRODUCTOS: "BD_PRODUCTOS",
    CLIENTES: "BD_CLIENTES",
    INVENTARIO: "BD_INVENTARIO",
    IMAGENES: "BD_PRODUCTO_IMAGENES",
    VARIEDADES: "BD_VARIEDAD_PRODUCTOS",
    CATEGORIAS: "BD_CATEGORIAS",
    COLORES: "BD_COLORES",
    TIENDAS: "BD_TIENDAS",
    AGENCIAS_ENVIO: "BD_AGENCIAS_ENVIO",
    GALERIA_SVG: "BD_GALERIA_SVG",
    CONFIG_GENERAL: "BD_CONFIGURACION_GENERAL"
  },

  // =============================================================
  // MAPEO DE COLUMNAS (PARA EVITAR NÚMEROS MÁGICOS)
  // =============================================================
  COLS: {

    PRODUCTOS: { // Corregido para iniciar en 1
      CODIGO_ID: 1,
      CATEGORIA_GENERAL: 2,
      CATEGORIA: 3,
      SKU: 4,
      CARPETA_ID: 5,
      TEMPORADA: 6,
      GENERO: 7,
      MARCA: 8,
      MODELO: 9,
      ESTILO: 10,
      MATERIAL: 11,
      TALLES: 12,
      COLORES: 13,
      PRECIO_COSTO: 14,
      RECARGO_MENOR: 15,
      ID_VIDEO_YOUTUBE: 16,
      SINCRONIZAR_FOTOS: 17,
      BLOGGER_POST_ID: 18,
      ESTADO_SINCRONIZACION: 19,
      ULTIMA_ACTUALIZACION: 20
    },

    VENTAS: {
      CODIGO: 1,
      FECHA: 2,
      HORA: 3,
      CAJA_ID: 4,
      METODO_PAGO: 5,
      DATOS_TRANSFERENCIA: 6,
      CLIENTE_ID: 7,
      DOCUMENTO: 8,
      CELULAR: 9,
      CORREO: 10,
      DIRECCION: 11,
      AGENCIA: 12,
      TIEMPO_ENTREGA: 13,
      MONEDA: 14,
      COSTO_ENVIO: 15,
      RECARGO_TRANSFERENCIA: 16,
      TOTAL_VENTA: 17,
      DETALLE_JSON: 18,
      ESTADO: 19,
      JSON_BACKUP: 20
    },

    DETALLE_VENTAS: {
      VENTA_ID: 1,
      PRODUCTO_VARIACION: 2,
      CATEGORIA: 3,
      CANTIDAD: 4,
      PRECIO: 5,
      SUBTOTAL: 6,
      PRODUCTO_ID: 7,
      COLOR: 8,
      TALLE: 9,
      VARIEDAD_ID: 10
    },

    CLIENTES: {
      CLIENTE_ID: 1,
      CLASIFICACION: 2,
      NOMBRE_COMPLETO: 3,
      CELULAR: 4,
      CORREO_ELECTRONICO: 5,
      CUIT_DNI: 6,
      CONDICION_FISCAL: 7,
      TIPO_ENVIO: 8,
      AGENCIA_ENVIO: 9,
      CODIGO_POSTAL: 10,
      PROVINCIA: 11,
      MUNICIPIO: 12,
      LOCALIDAD: 13,
      CALLE: 14,
      NUMERO: 15,
      PISO: 16,
      DEPARTAMENTO: 17,
      OBSERVACION: 18
    },

    INVENTARIO: {
      INVENTARIO_ID: 1,
      FECHA_CREACION: 2,
      TIENDA_ID: 3,
      PRODUCTO_ID: 4,
      COLOR: 5,
      TALLE: 6,
      STOCK_INICIAL: 7,
      ENTRADAS: 8,
      SALIDAS: 9,
      VENTAS_WEB: 10,
      VENTAS_LOCAL: 11,
      STOCK_ACTUAL: 12,
      FECHA_ACTUALIZACION: 13,
      AJUSTE_CANTIDAD: 14
    },

    IMAGENES: {
      IMAGEN_ID: 1,
      PRODUCTO_ID: 2,
      CARPETA_ID: 3,
      IMAGEN_RUTA: 4,
      ARCHIVO_ID: 5,
      URL: 6,
      ESTADO: 7,
      FECHA_CARGA: 8,
      FUENTE: 9,
      PORTADA: 10,
      PROMPT: 11
    },

    VARIEDADES: {
      VARIEDAD_ID: 1,
      CATEGORIA: 2,
      PRODUCTO_ID: 3,
      VARIEDAD: 4,
      PRECIO_UNITARIO: 5,
      CANTIDAD_MINIMA: 6,
      VISIBILIDAD_TIENDA: 7,
      ULTIMA_ACTUALIZACION: 8
    },

    CATEGORIAS: {
      CATEGORIA_GENERAL: 1,
      CATEGORIA_ID: 2,
      LISTADO_MARCAS: 3,
      LISTADO_TALLES: 4,
      LISTADO_PRECIOS: 5,
      RECARGO_MENOR: 6,
      GENERAR_HTML: 7,
      HTML: 8,
      ICONO: 9
    },

    COLORES: {
      COLOR_ID: 1,
      RED: 2,
      GREEN: 3,
      BLUE: 4,
      TEXTO: 5,
      BORDE: 6,
      COMBINACION: 7,
      HEXADECIMAL: 8,
      IMAGEN: 9
    },

    TIENDAS: {
      TIENDA_ID: 1,
      LOGOTIPO: 2,
      SOBRE_NOSOTROS: 3,
      INICIO_ACTIVIDADES: 4,
      DIRECCION: 5,
      HORA_APERTURA: 6,
      HORA_CIERRE: 7,
      COORDENADAS: 8,
      ID_GOOGLE_MAPS: 9,
      TELEFONO: 10,
      CELULAR: 11,
      CORREO_ELECTRONICO: 12,
      QR_DATA: 13,
      VENDEDOR_ID: 14,
      TIPO_COMPROBANTE: 15,
      IP_IMPRESORA_LOCAL: 16,
      CANTIDAD_COPIAS: 17,
      ACTIVAR_SONIDO: 18,
      MENSAJE_MARKETING: 19,
      MONTO_MINIMO_CUPON: 20,
      MODO_VENTA: 21,
      METODOS_PAGO: 22,
      CUENTAS_TRANSFERENCIA: 23,
      COMPRA_MINIMA: 24,
      RECARGO_MENOR: 25
    },

    AGENCIAS_ENVIO: {
      AGENCIA_ID: 1,
      COSTO_ENVIO: 2,
      HORA_ENTREGA: 3,
      CUIT: 4,
      UBICACION: 5,
      ESTADO: 6
    },

    GALERIA_SVG: {
      SVG_ID: 1,
      NOMBRE: 2,
      TIPO: 3,
      SVG_CODE: 4,
      PERSONALIZAR: 5,
      COLOR_CIRCULO: 6,
      TAMAÑO_CIRCULO: 7,
      X_CIRCULO: 8,
      C_TEXTO: 9,
      Y_CIRCULO: 10,
      COLOR_TEXTO: 11
    },

    CONFIG_GENERAL: {
      GENERAL_ID: 1,
      RESPONSABLE: 2,
      CUIT: 3,
      TELEFONO: 4,
      CELULAR: 5,
      CORREO_ELECTRONICO: 6,
      TIENDA_BLOGGER: 7,
      SITIO_WEB: 8,
      CATALOGO_DRIVE: 9,
      FORMULARIO_COMPROBANTE: 10,
      FORMULARIO_CLIENTE: 11,
      FACEBOOK: 12,
      INSTAGRAM: 13,
      TIKTOK: 14,
      TIPO_REGISTRO_PRODUCTO: 15,
      TIPO_REGISTRO_PRECIO: 16,
      EXCLUIR_SURTIDOS_VARIANTES: 17,
      DOLAR_BLUE_VENTA: 18,
      DOLAR_BLUE_COMPRA: 19,
      CLAVE_FILESTACK: 20,
      SIN_IMAGEN: 21,
      LIMITE_IMAGENES_PRODUCTO: 22,
      APLICAR_MARCA_DE_AGUA: 23,
      CARRUSELES: 24
    },

    CONFIG_BLOGGER: {
      PARAMETRO_ID: 1,
      CONFIGURACION: 2,
      TIENDA_ID: 3
    }
  }
};

/**
 * ===================================================================
 * VARIABLE GLOBAL DE CONEXIÓN A LA PLANILLA DE CÁLCULO
 * ===================================================================
 */
const ss = SpreadsheetApp.openById(CONFIG.IDS.SPREADSHEET);