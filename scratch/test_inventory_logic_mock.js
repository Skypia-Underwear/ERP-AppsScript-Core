/**
 * SCRATCH: test_inventory_logic_mock.js
 * PRUEBA DE CONCEPTO PARA REFACTORIZACIÓN DE INVENTARIO
 */

// --- MOCK DATA ---
const mockMovementData = [
    ["FECHA", "INVENTARIO_ID", "MOVIMIENTO", "CANTIDAD"],
    ["2023-01-01", "PROD001-Azul-S-T01", "ENTRADA", 10],
    ["2023-01-02", "PROD001-Azul-S-T01", "SALIDA", 2],
    ["2023-01-03", "PROD001-Azul-S-T01", "ENTRADA", 5],
    ["2023-01-04", "PROD002-Rojo-M-T01", "ENTRADA", 20]
];

const mockSalesData = {
    success: true,
    data: [
        {
            tiendaId: "T01",
            origen: "Blogger",
            detalles: [
                { productoId: "PROD001", color: "Azul", talle: "S", cantidad: 3 }
            ]
        },
        {
            tiendaId: "T01",
            origen: "Pedido Local",
            detalles: [
                { productoId: "PROD001", color: "Azul", talle: "S", cantidad: 1 }
            ]
        }
    ]
};

// --- LOGIC UNDER TEST ---
function testRefactorLogic() {
    console.log("🧪 Iniciando simulación de recálculo...");

    // 1. Resumen de Movimientos (O(M))
    const movementsSummary = new Map();
    for (let i = 1; i < mockMovementData.length; i++) {
        const [_, invId, type, amount] = mockMovementData[i];
        if (!movementsSummary.has(invId)) {
            movementsSummary.set(invId, { entries: 0, exits: 0 });
        }
        const stats = movementsSummary.get(invId);
        if (type === 'ENTRADA') stats.entries += amount;
        else if (type === 'SALIDA') stats.exits += amount;
    }

    // 2. Resumen de Ventas (O(S))
    const salesSummary = new Map();
    mockSalesData.data.forEach(sale => {
        const isWeb = sale.origen === "Blogger";
        sale.detalles.forEach(detail => {
            const invId = `${detail.productoId}-${detail.color}-${detail.talle}-${sale.tiendaId}`;
            if (!salesSummary.has(invId)) {
                salesSummary.set(invId, { web: 0, local: 0 });
            }
            if (isWeb) salesSummary.get(invId).web += detail.cantidad;
            else salesSummary.get(invId).local += detail.cantidad;
        });
    });

    // 3. Simulación de Inventario (O(N))
    const productId = "PROD001";
    const inventoryRow = ["PROD001-Azul-S-T01", "T01", "PROD001", "Azul", "S", 0, /*Entries*/ 0, /*Exits*/ 0, /*Local*/ 0, /*Web*/ 0, /*Initial*/ 10];
    
    // Suponiendo índices (ajustados para el mock)
    const invIdIdx = 0;
    const initialStockIdx = 10;
    
    const invId = inventoryRow[invIdIdx];
    const initialStock = inventoryRow[initialStockIdx] || 0;
    
    const movStats = movementsSummary.get(invId) || { entries: 0, exits: 0 };
    const saleStats = salesSummary.get(invId) || { web: 0, local: 0 };
    
    const newCurrentStock = initialStock + movStats.entries - (movStats.exits + saleStats.web + saleStats.local);

    console.log(`Resultados para ${invId}:`);
    console.log(`- Stock Inicial: ${initialStock}`);
    console.log(`- Entradas: ${movStats.entries} (Esperado: 15)`);
    console.log(`- Salidas: ${movStats.exits} (Esperado: 2)`);
    console.log(`- Ventas Web: ${saleStats.web} (Esperado: 3)`);
    console.log(`- Ventas Local: ${saleStats.local} (Esperado: 1)`);
    console.log(`- Stock Final Calculado: ${newCurrentStock} (Esperado: 10 + 15 - (2 + 3 + 1) = 19)`);

    if (newCurrentStock === 19) {
        console.log("✅ PRUEBA EXITOSA");
    } else {
        console.error("❌ ERROR EN EL CÁLCULO");
    }
}

testRefactorLogic();
