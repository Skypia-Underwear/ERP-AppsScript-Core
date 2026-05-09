/**
 * PWA API BRIDGE (V5 - Thread-Safe & Multi-Stack)
 * Optimizado para manejar multiples llamadas simultaneas (UI + Datos) sin bloqueos.
 */

window.google = window.google || {};
window.google.script = window.google.script || {};

(function () {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbySMq7IZrZMhXE2wZAH-4YCLV8S-VpwjiTcKMAa1jonor7Zyjd2IdJo1EHZMs9WJahSKg/exec";

  // --- MAPEO DE VISTAS (Apps Script -> PWA Files) ---
  const VIEW_MAP = {
    'welcome': 'home_dashboard',
    'auditoria': 'sale_dashboard',
    'imagenes_manager': 'images_dashboard',
    'pos_manager': 'pos_view',
    'client_form': 'client_form_view',
    'login': 'login_view',
    'runner': 'page_template',
    'inventory_dashboard': 'inventory_dashboard'
  };

  /**
   * Crea una instancia de corredor independiente para cada cadena de llamadas
   */
  function createRunner(successHandler = null, failureHandler = null) {
    return new Proxy({}, {
      get(target, prop) {
        if (prop === 'withFailureHandler') {
          return (handler) => createRunner(successHandler, handler);
        }
        if (prop === 'withUserObject') {
          return (obj) => createRunner(successHandler, failureHandler);
        }
        if (prop === 'withSuccessHandler') {
          return (handler) => createRunner(handler, failureHandler);
        }

        // Ejecucion de la funcion
        return async (...args) => {
          // --- RUTA A: CARGA DE UI LOCAL ---
          if (prop === 'getPageContent') {
            const viewName = args[0];
            const fileName = (VIEW_MAP[viewName] || viewName) + '.html';
            try {
              console.log(`[Bridge] Cargando UI local: ${fileName}`);
              const res = await fetch(fileName);
              if (res.ok) {
                const html = await res.text();
                if (successHandler) successHandler(html);
                return;
              }
            } catch (e) {
              console.warn(`[Bridge] UI local fallo para ${fileName}, reintentando via GAS...`);
            }
          }

          // --- RUTA B: LLAMADA A SERVIDOR (GAS) ---
          try {
            console.log(`[Bridge] Solicitando a GAS: ${prop}`, args);
            const response = await fetch(GAS_URL, {
              method: 'POST',
              mode: 'cors',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({ function: prop, args: args })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const text = await response.text();
            let data;
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = text; // HTML o Texto plano
            }

            if (successHandler) successHandler(data);
          } catch (error) {
            console.error(`[Bridge Error] ${prop}:`, error);
            if (failureHandler) failureHandler(error);
          }
        };
      }
    });
  }

  // Inicializar el punto de entrada global
  window.google.script.run = createRunner();
  console.info("[PWA Bridge V5] Motor Thread-Safe activado. Listo para carga paralela.");
})();
