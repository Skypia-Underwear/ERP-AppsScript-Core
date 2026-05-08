/**
 * 🛠️ DIAGNÓSTICO DE ARQUITECTURA DUAL-KEY
 * Ejecuta esta función manualmente desde el editor de Apps Script 
 * para verificar los permisos de tus API Keys.
 */
function DIAGNOSTICO_ARQUITECTURA_DUAL() {
  const log = [];
  log.push("🔍 --- INICIANDO DIAGNÓSTICO TÉCNICO ---");

  try {
    const freeKey = GLOBAL_CONFIG.GEMINI.FREE_API_KEY;
    const paidKey = GLOBAL_CONFIG.GEMINI.API_KEY;

    log.push(`✅ Llave Gratuita (Sheet): ${freeKey ? `Presente (...${freeKey.slice(-4)})` : "AUSENTE"}`);
    log.push(`✅ Llave de Pago (Sheet): ${paidKey ? `Presente (...${paidKey.slice(-4)})` : "AUSENTE"}`);

    if (freeKey) {
      log.push("\n🧪 [PRUEBA 1] Verificando Cuenta Gratuita (Análisis)...");
      probarLlaveGemini(freeKey, "Cuenta Gratuita", log);
    }

    if (paidKey) {
      log.push("\n🧪 [PRUEBA 2] Verificando Cuenta de Pago (Renderizado)...");
      probarLlaveGemini(paidKey, "Cuenta de Pago", log);
    }

  } catch (e) {
    log.push(`❌ Error Crítico en Diagnóstico: ${e.message}`);
  }

  log.push("\n🏁 --- FIN DEL DIAGNÓSTICO ---");
  console.log(log.join("\n"));
  return log.join("\n");
}

/**
 * Prueba una llave específica intentando subir un pixel y generar un texto simple.
 */
function probarLlaveGemini(key, label, log) {
  try {
    // 1. Prueba de Modelos (List models)
    const urlList = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const respList = UrlFetchApp.fetch(urlList, { muteHttpExceptions: true });
    if (respList.getResponseCode() === 200) {
      log.push(`   - [OK] Comunicación básica con Google API.`);
    } else {
      log.push(`   - [ERROR] Falló comunicación: ${respList.getContentText().substring(0, 100)}`);
    }

    // 2. Prueba de Generación simple (Text Only)
    const currentModel = label.includes("Gratuita") ? "gemma-4-26b-a4b-it" : "gemini-2.5-flash";
    const urlGen = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
    const payloadGen = { contents: [{ parts: [{ text: "Hola" }] }] };
    const respGen = UrlFetchApp.fetch(urlGen, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify(payloadGen), muteHttpExceptions: true
    });
    if (respGen.getResponseCode() === 200) {
      log.push(`   - [OK] Generación de texto exitosa con ${currentModel}.`);
    } else {
      log.push(`   - [ERROR] Generación de texto (${currentModel}): ${respGen.getContentText().substring(0, 100)}`);
    }

    // 3. Prueba de File API (Upload de 1 pixel)
    const pixelBase64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // GIF Transparent 1x1
    const blob = Utilities.newBlob(Utilities.base64Decode(pixelBase64), "image/gif", "test_pixel.gif");
    
    try {
      const fileApiResult = subirArchivoGeminiFileAPI(blob, "diag_pixel", key);
      log.push(`   - [OK] File API Upload exitoso (URI: ${fileApiResult.uri.split('/').pop()}).`);
      
      // 4. Prueba de Lectura (Permission Check)
      const readModel = label.includes("Gratuita") ? "gemma-4-26b-a4b-it" : "gemini-2.5-flash";
      const urlRead = `https://generativelanguage.googleapis.com/v1beta/models/${readModel}:generateContent?key=${key}`;
      const payloadRead = {
        contents: [{ parts: [{ text: "Describe this image" }, { fileData: { mimeType: "image/gif", fileUri: fileApiResult.uri } }] }]
      };
      const respRead = UrlFetchApp.fetch(urlRead, {
        method: "post", contentType: "application/json",
        payload: JSON.stringify(payloadRead), muteHttpExceptions: true
      });
      if (respRead.getResponseCode() === 200) {
        log.push(`   - [OK] Permisos de lectura de archivos correctos.`);
      } else {
        const err = JSON.parse(respRead.getContentText());
        log.push(`   - [ADVERTENCIA] Error de permiso de lectura: ${err.error?.message || "Desconocido"}`);
        log.push(`     -> Esto confirma que tu cuenta gratuita requiere el bypass 'Base64' activo.`);
      }
    } catch (e) {
      log.push(`   - [ERROR] File API no disponible para esta llave: ${e.message}`);
    }

  } catch (e) {
    log.push(`   - [EXCEPCIÓN] ${e.message}`);
  }
}
