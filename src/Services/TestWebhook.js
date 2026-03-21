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
