/**
 * GAS-BRIDGE.js
 * Simula el entorno de Google Apps Script dentro de Blogger.
 * Reemplaza google.script.run con llamadas fetch/JSONP al ruteador de la Macro.
 */

if (typeof google === 'undefined') {
    window.google = {};
}

if (!google.script) {
    google.script = {
        run: {}
    };
}

/**
 * Función para inicializar el puente con la URL de la Macro.
 * @param {string} webAppUrl - URL del despliegue de Apps Script.
 */
window.initGasBridge = function(webAppUrl) {
    const bridge = {};
    
    // Lista de funciones conocidas que existen en el backend
    // Esto se puede automatizar si el backend devuelve una lista de métodos
    const functions = [
        "getPageContent",
        "logErrorFromFrontend",
        "tpv_obtenerCatalogoDesdeDrive",
        "registrar_venta_desde_blogger",
        "consultar_cliente_si_existe",
        "actualizar_stock_desde_tpv",
        "procesarAccionInventario",
        "getAllStockFromCache",
        "getBartenderFullHistory",
        "checkNewProductsFlag"
    ];

    functions.forEach(fnName => {
        google.script.run[fnName] = function(...args) {
            return {
                withSuccessHandler: function(onSuccess) {
                    return {
                        withFailureHandler: function(onFailure) {
                            // Ejecutar la llamada real vía JSONP o Fetch
                            console.log(`📡 [Bridge] Llamando a ${fnName} con args:`, args);
                            
                            // Construir URL con parámetros
                            const params = new URLSearchParams();
                            params.append('op', fnName);
                            params.append('args', JSON.stringify(args));
                            
                            // JSONP for cross-domain
                            const callbackName = 'gas_cb_' + Math.floor(Math.random() * 1000000);
                            window[callbackName] = function(response) {
                                if (onSuccess) onSuccess(response);
                                delete window[callbackName];
                                document.getElementById(callbackName).remove();
                            };

                            const script = document.createElement('script');
                            script.id = callbackName;
                            script.src = `${webAppUrl}?callback=${callbackName}&accion=${fnName}&payload=${encodeURIComponent(JSON.stringify(args))}`;
                            document.body.appendChild(script);
                        }
                    };
                }
            };
        };
    });

    console.log("✅ [Bridge] google.script.run emulado con éxito.");
};
