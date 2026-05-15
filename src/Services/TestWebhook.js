/**
 * TEST: Simular Webhook de WooCommerce
 * Ejecutar esta función para verificar que la lógica de registro funciona.
 */
function test_handleWooCommerceWebhook() {
  const mockOrder = {
    id: 999999,
    status: "processing",
    total: "1500.00",
    currency: "ARS",
    date_created: "2024-03-20T10:00:00",
    billing: {
      first_name: "Juan",
      last_name: "Perez",
      email: "juan.perez.test@example.com",
      phone: "1122334455",
      address_1: "Calle Falsa 123",
      city: "CABA",
      state: "C",
      postcode: "1000"
    },
    meta_data: [
      { key: "_billing_dni", value: "95896584" }
    ],
    line_items: [
      {
        product_id: 123,
        name: "Producto de Prueba",
        quantity: 2,
        price: "750.00",
        total: "1500.00",
        sku: "TEST-SKU-001-Menor",
        meta_data: [
          { key: "Precio", value: "Menor" },
          { key: "Color", value: "Surtido" },
          { key: "Talle", value: "Surtido" }
        ]
      }
    ]
  };

  console.log("🧪 Iniciando prueba de Webhook...");
  const resultado = handleWooCommerceWebhook(mockOrder);
  console.log("📊 Resultado:", JSON.stringify(resultado, null, 2));

  if (resultado.success) {
    console.log("✅ Prueba exitosa. Revisa la hoja BD_VENTAS_WOOCOMMERCE.");
  } else {
    console.log("❌ Prueba fallida.");
  }
}
/**
 * TEST: Verificación de Multiplicadores de Stock (Fase 10)
 */
function test_multiplicadoresStock() {
  const mockOrder = {
    id: "TEST-MULT-001",
    status: "processing",
    total: "12000.00",
    currency: "ARS",
    date_created: new Date().toISOString(),
    billing: {
      first_name: "Test",
      last_name: "Multiplicador",
      email: "test.mult@example.com",
      phone: "1100000000"
    },
    line_items: [
      {
        product_id: 1627,
        name: "PANTALON CARGO (DOCENA)",
        quantity: 1, // 1 pack de docena
        price: "12000.00",
        total: "12000.00",
        sku: "PANT1627-Docena-SURTIDO", // SKU con variedad "Docena"
        meta_data: [
          { key: "Color", value: "Negro" },
          { key: "Talle", value: "XL" }
        ]
      }
    ]
  };

  console.log("🧪 Iniciando prueba de MULTIPLICADORES...");
  console.log("ℹ️ SKU enviado: PANT1627-Docena-SURTIDO (Se espera que descuente 12 unidades)");
  
  const resultado = handleWooCommerceWebhook(mockOrder);
  console.log("📊 Resultado:", JSON.stringify(resultado, null, 2));

  if (resultado.success) {
    console.log("✅ Prueba finalizada. Verifica:");
    console.log("1. Hoja BD_DETALLE_VENTAS_WOOCOMMERCE -> Columna UNIDADES_PACK debe ser 12");
    console.log("2. Hoja BD_INVENTARIO -> El stock debe haber disminuido en 12.");
  } else {
    console.log("❌ Prueba fallida: " + resultado.message);
  }
}

/**
 * TEST: Verificación de Enrutamiento de Telegram (V7.0)
 * Envía un error simulado y un éxito simulado para verificar el destino de cada uno.
 */
function test_telegramRouting() {
  console.log("🧪 Iniciando prueba de enrutamiento de Telegram...");

  const devId = GLOBAL_CONFIG.TELEGRAM.DEV_CHAT_ID;
  const clientId = GLOBAL_CONFIG.TELEGRAM.CHAT_ID;

  console.log(`ℹ️ Configuración actual:
- Destino Desarrollador (DEV_CHAT_ID): ${devId || "NO CONFIGURADO (Fallback a Client)"}
- Destino Cliente (CHAT_ID): ${clientId || "NO CONFIGURADO"}`);

  // 1. Simular un ERROR (Debe ir a DEV_CHAT_ID)
  console.log("📡 Enviando alerta de ERROR simulada...");
  notificarTelegramSalud("Esta es una PRUEBA DE ERROR TÉCNICO.\nSolo debería llegarte a ti como desarrollador.", "ERROR");

  Utilities.sleep(2000);

  // 2. Simular un ÉXITO (Debe ir a CHAT_ID)
  console.log("📡 Enviando notificación de ÉXITO simulada...");
  notificarTelegramSalud("Esta es una PRUEBA DE VENTA EXITOSA.\nDebería llegar al chat de ventas del cliente.", "EXITO");

  console.log("✅ Pruebas enviadas. Por favor verifica tus chats de Telegram.");
}

