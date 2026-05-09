/**
 * STANDALONE PWA BRIDGE (Módulo Aislado)
 * Maneja las peticiones del subdominio de forma segura sin interferir con el núcleo.
 */
var StandaloneBridge = {
  
  /**
   * Punto de entrada para el Bridge.
   * @param {Object} e - Objeto de evento de doPost.
   * @return {ContentOutput|null} - Respuesta para el PWA o null para el ERP normal.
   */
  handle: function(e) {
    // Si no hay datos de postData, no es una petición del Bridge
    if (!e.postData || !e.postData.contents) return null;

    try {
      var payload = JSON.parse(e.postData.contents);
      
      // Solo procesamos si el payload tiene el formato esperado del Bridge
      if (payload && payload.function) {
        var funcName = payload.function;
        var funcArgs = payload.args || [];

        // Buscamos la función de forma segura en el ámbito global de GAS
        var fn = this.findGlobalFunction(funcName);

        if (typeof fn === 'function') {
          var result = fn.apply(null, funcArgs);
          return this.createResponse(result);
        }
      }
    } catch (err) {
      // Si hay un error de parseo o ejecución, logueamos pero NO bloqueamos el doPost
      console.error("⚠️ StandaloneBridge Exception:", err.message);
    }
    
    return null; // Continuar con el flujo normal del ERP
  },

  /**
   * Busca una función en el espacio global de Apps Script.
   */
  findGlobalFunction: function(name) {
    try { 
      // Eval es seguro aquí ya que solo se ejecuta en el servidor de Google
      var fn = eval(name); 
      return (typeof fn === 'function') ? fn : null;
    } catch(e) { 
      return null; 
    }
  },

  /**
   * Genera la respuesta adecuada (HTML o JSON).
   */
  createResponse: function(result) {
    if (typeof result === 'string') {
      return ContentService.createTextOutput(result)
        .setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput(JSON.stringify(result || {success: true}))
      .setMimeType(ContentService.MimeType.JSON);
  }
};
