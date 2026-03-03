const CONFIG = {
  // =============================================================
  // IDs PRINCIPALES (DRIVE, SPREADSHEET)
  // =============================================================
  IDS: {
    APP_ID: "JMMAYORISTA-201513855",  // ID de la app actual JM-MAYORISTA
    SPREADSHEET: "1Y2aNP2xL3H_A2_BDx21iLp9QvDtisTJMSrbYmBWenbU", // [!] REEMPLAZAR CON ID REAL
  },

  // =============================================================
  // NOMBRES DE LAS HOJAS DE CÁLCULO
  // =============================================================
  SHEETS: {
    PRODUCTOS: "PRODUCTOS",
    INVENTARIO: "INVENTARIO",
    INVENTARIO_MOVIMIENTOS: "INVENTARIO_MOVIMIENTOS",
    LISTA_PRECIOS: "LISTA_PRECIOS",
    VENTAS: "VENTAS",
    COBROS: "COBROS",
    CLIENTES: "CLIENTES",
    COMPRAS: "COMPRAS",
    PROVEEDORES: "PROVEEDORES"
  },

  // =============================================================
  // MAPEO DE COLUMNAS (PARA EVITAR NÚMEROS MÁGICOS)
  // NOTA: Todos usan el índice basado en 1 para AppSheet/Sheets
  // =============================================================
  COLS: {

    PRODUCTOS: {
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
      FOTO_PRINCIPAL: 14,
      PRECIO_COSTO: 15,
      STOCK_INICIAL: 16,
      BLOGGER_POST_ID: 17,
      ESTADO_SINCRONIZACION: 18,
      ULTIMA_ACTUALIZACION: 19,
      STOCK_ACTUAL: 21,
      ETIQUETA_LABEL: 22,
      ETIQUETA_RESUMEN: 23
    },

    LISTA_PRECIOS: {
      VARIEDAD_ID: 1,
      PRODUCTO_ID: 2,
      VARIEDAD: 3,
      UNIDAD_PACK: 4,
      PRECIO_VARIEDAD: 5,
      ULTIMA_ACTUALIZACION: 6
    },

    INVENTARIO: {
      INVENTARIO_ID: 1,
      PRODUCTO_ID: 2,
      STOCK_INICIAL: 3,
      ENTRADAS: 4,
      SALIDAS: 5,
      STOCK_ACTUAL: 6,
      FECHA_ACTUALIZACION: 7,
      AJUSTE_CANTIDAD: 8,
      ETIQUETA_LABEL: 9,
      ETIQUETA_IMAGEN: 10
    }
  }
};

/**
 * ===================================================================
 * VARIABLE GLOBAL DE CONEXIÓN A LA PLANILLA DE CÁLCULO
 * ===================================================================
 */
const ss = SpreadsheetApp.openById(CONFIG.IDS.SPREADSHEET);