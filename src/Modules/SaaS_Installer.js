/**
 * @fileoverview SaaS Packager (PWA Installer) para BlogShop.
 * Genera un archivo .zip con el App Shell preconfigurado para nuevos clientes.
 * Requisito: Este código es puramente administrativo y no modifica la lógica del ERP actual.
 */

function generarPaquetePWA() {
  try {
    // 1. Lógica de Extracción de Datos
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("BD_CONFIGURACION_GENERAL");
    if (!sheet) {
      throw new Error("No se encontró la hoja BD_CONFIGURACION_GENERAL");
    }
    
    // Buscamos el valor de GENERAL_ID
    var data = sheet.getDataRange().getValues();
    var generalId = "BlogShop ERP"; // Fallback por defecto
    for (var i = 0; i < data.length; i++) {
      for (var j = 0; j < data[i].length; j++) {
        // En la estructura actual, el encabezado está en la fila 1 y el valor en la fila 2
        // Buscamos "GENERAL_ID" y tomamos el valor exactamente debajo (data[i+1][j])
        if (data[i][j] === "GENERAL_ID" && (i + 1) < data.length) {
          generalId = data[i+1][j];
          break;
        }
      }
      if (generalId !== "BlogShop ERP") break;
    }
    
    // Generar nombre de directorio sanitizado (minúsculas, sin espacios ni especiales)
    var nombreDirectorio = generalId.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + "-erp";
    var appName = generalId + " ERP";
    
    // 2. Obtención y reemplazo de URL de la macro (El Bypass Android)
    var rawUrl = ScriptApp.getService().getUrl();
    // Reemplazo crítico para asegurar compatibilidad multi-cuenta en Android
    var bypassUrl = rawUrl.replace('/macros/s/', '/a/~/macros/s/');
    
    // 3. Plantillas Base (Strings en código)
    
    // Manifest
    var manifestContent = '{' +
      '\n  "name": "' + appName + '",' +
      '\n  "short_name": "' + appName + '",' +
      '\n  "start_url": "./index.html",' +
      '\n  "display": "standalone",' +
      '\n  "background_color": "#ffffff",' +
      '\n  "theme_color": "#000000",' +
      '\n  "icons": [' +
      '\n    {' +
      '\n      "src": "icon-192x192.png",' +
      '\n      "sizes": "192x192",' +
      '\n      "type": "image/png"' +
      '\n    },' +
      '\n    {' +
      '\n      "src": "icon-512x512.png",' +
      '\n      "sizes": "512x512",' +
      '\n      "type": "image/png"' +
      '\n    }' +
      '\n  ]' +
      '\n}';

    // Index.html
    var indexContent = '<!DOCTYPE html>\n' +
'<html lang="es">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n' +
'    <title>' + appName + '</title>\n' +
'    <link rel="manifest" href="manifest.json">\n' +
'    <link rel="icon" href="favicon.ico" type="image/x-icon">\n' +
'    <style>\n' +
'        body, html {\n' +
'            margin: 0;\n' +
'            padding: 0;\n' +
'            height: 100%;\n' +
'            overflow: hidden;\n' +
'            background-color: #f5f5f5;\n' +
'        }\n' +
'        #loader {\n' +
'            position: absolute;\n' +
'            top: 0;\n' +
'            left: 0;\n' +
'            width: 100%;\n' +
'            height: 100%;\n' +
'            display: flex;\n' +
'            justify-content: center;\n' +
'            align-items: center;\n' +
'            background: linear-gradient(135deg, #ece9e6 0%, #ffffff 100%);\n' +
'            z-index: 9999;\n' +
'            transition: opacity 0.5s ease;\n' +
'        }\n' +
'        .spinner {\n' +
'            width: 50px;\n' +
'            height: 50px;\n' +
'            border: 5px solid #ccc;\n' +
'            border-top-color: #333;\n' +
'            border-radius: 50%;\n' +
'            animation: spin 1s linear infinite;\n' +
'        }\n' +
'        @keyframes spin {\n' +
'            100% { transform: rotate(360deg); }\n' +
'        }\n' +
'        iframe {\n' +
'            width: 100%;\n' +
'            height: 100%;\n' +
'            border: none;\n' +
'            display: none;\n' +
'            margin-top: -36px; \n' +
'            height: calc(100% + 36px);\n' +
'        }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'    <div id="loader"><div class="spinner"></div></div>\n' +
'    <iframe id="app-frame" src="' + bypassUrl + '" allow="camera; microphone; fullscreen"></iframe>\n' +
'    \n' +
'    <script>\n' +
'    (function () {\n' +
'      \'use strict\';\n' +
'      const loader = document.getElementById(\'loader\');\n' +
'      const iframe = document.getElementById(\'app-frame\');\n' +
'\n' +
'      // --- REENVÍO DE PARÁMETROS (Deep Linking) ---\n' +
'      const currentUrl = new URL(window.location.href);\n' +
'      const params = currentUrl.search;\n' +
'      if (params && iframe) {\n' +
'        const baseUrl = iframe.src;\n' +
'        const separator = baseUrl.indexOf(\'?\') === -1 ? \'?\' : \'&\';\n' +
'        iframe.src = baseUrl + separator + params.substring(1);\n' +
'      }\n' +
'\n' +
'      function hideLoader() {\n' +
'        if (!loader) return;\n' +
'        loader.style.opacity = \'0\';\n' +
'        setTimeout(() => {\n' +
'          loader.style.display = \'none\';\n' +
'          iframe.style.display = \'block\';\n' +
'        }, 500);\n' +
'      }\n' +
'\n' +
'      // --- PROTOCOLO DE SINCRONIZACIÓN DE SESIÓN ---\n' +
'      window.addEventListener(\'message\', function(event) {\n' +
'        if (!event.origin.includes(\'script.google.com\') && !event.origin.includes(\'googleusercontent.com\')) return;\n' +
'        \n' +
'        if (event.data.type === \'ERP_READY\') {\n' +
'          console.info(\'🚀 [Shell] ERP listo. Sincronizando sesión...\');\n' +
'          hideLoader();\n' +
'\n' +
'          const session = localStorage.getItem(\'erp_session\');\n' +
'          if (session && iframe.contentWindow) {\n' +
'            iframe.contentWindow.postMessage({ \n' +
'              type: \'LOAD_SESSION\', \n' +
'              session: JSON.parse(session) \n' +
'            }, \'*\');\n' +
'          }\n' +
'        }\n' +
'\n' +
'        if (event.data.type === \'SAVE_SESSION\') {\n' +
'          console.info(\'💾 [Shell] Guardando sesión...\');\n' +
'          localStorage.setItem(\'erp_session\', JSON.stringify(event.data.session));\n' +
'        }\n' +
'      });\n' +
'\n' +
'      // Fallback de carga\n' +
'      setTimeout(() => {\n' +
'        if (loader && loader.style.display !== \'none\') {\n' +
'          console.warn(\'⚠️ [Shell] Tiempo de espera agotado.\');\n' +
'          hideLoader();\n' +
'        }\n' +
'      }, 15000);\n' +
'\n' +
'      // Service Worker\n' +
'      if (\'serviceWorker\' in navigator) {\n' +
'        window.addEventListener(\'load\', () => {\n' +
'          navigator.serviceWorker.register(\'./sw.js\').catch(err => console.warn(\'[SW] Error:\', err));\n' +
'        });\n' +
'      }\n' +
'    })();\n' +
'    </script>\n' +
'</body>\n' +
'</html>';

    // sw.js
    var swContent = "self.addEventListener('install', function(event) {\n" +
      "  self.skipWaiting();\n" +
      "});\n" +
      "self.addEventListener('activate', function(event) {\n" +
      "  event.waitUntil(clients.claim());\n" +
      "});\n" +
      "self.addEventListener('fetch', function(event) {\n" +
      "  // Pass-through genérico sin caché estricto para no interferir con la lógica del ERP\n" +
      "});";

    // 4. Inclusión de Iconos Base (Dinámico desde LOGOTIPO en BD_TIENDAS)
    var logoPath = "";
    var sheetTiendas = ss.getSheetByName("BD_TIENDAS");
    if (sheetTiendas) {
      var tiendasData = sheetTiendas.getDataRange().getValues();
      var colId = -1;
      var colLogo = -1;
      
      if (tiendasData.length > 0) {
        for (var j = 0; j < tiendasData[0].length; j++) {
          if (tiendasData[0][j] === "TIENDA_ID") colId = j;
          if (tiendasData[0][j] === "LOGOTIPO") colLogo = j;
        }
      }
      
      if (colId !== -1 && colLogo !== -1) {
        for (var i = 1; i < tiendasData.length; i++) {
          if (tiendasData[i][colId] === generalId) {
            logoPath = tiendasData[i][colLogo];
            break;
          }
        }
      }
    }

    var iconBytes;
    if (logoPath) {
      try {
        var appNameGlobal = (typeof GLOBAL_CONFIG !== 'undefined' && GLOBAL_CONFIG.APPSHEET && GLOBAL_CONFIG.APPSHEET.APP_NAME) ? GLOBAL_CONFIG.APPSHEET.APP_NAME : "CASTFERSYSTEMV1-201513855";
        var logoUrl = "https://www.appsheet.com/template/gettablefileurl?appName=" + encodeURIComponent(appNameGlobal) + "&tableName=BD_TIENDAS&fileName=" + encodeURIComponent(logoPath);
        var response = UrlFetchApp.fetch(logoUrl, {muteHttpExceptions: true});
        
        if (response.getResponseCode() === 200) {
          iconBytes = response.getBlob().getBytes();
        } else {
          // Si la ruta ya es una URL completa
          if (logoPath.toString().indexOf('http') === 0) {
            var directResponse = UrlFetchApp.fetch(logoPath, {muteHttpExceptions: true});
            if (directResponse.getResponseCode() === 200) {
              iconBytes = directResponse.getBlob().getBytes();
            }
          }
        }
      } catch (e) {
        Logger.log("Error al obtener logo para PWA: " + e.toString());
      }
    }

    if (!iconBytes) {
      // Fallback a PNG transparente
      var transparentPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      iconBytes = Utilities.base64Decode(transparentPngBase64);
    }

    var icon192Blob = Utilities.newBlob(iconBytes, 'image/png', 'icon-192x192.png');
    var icon512Blob = Utilities.newBlob(iconBytes, 'image/png', 'icon-512x512.png');
    var faviconBlob = Utilities.newBlob(iconBytes, 'image/x-icon', 'favicon.ico');

    // 5. Archivo LEEME_INSTALACION.txt
    var readmeContent = "=========================================================\n" +
      "INSTRUCCIONES DE INSTALACIÓN - PWA ERP\n" +
      "=========================================================\n\n" +
      "Esta carpeta contiene el App Shell preconfigurado para tu ERP.\n\n" +
      "Sigue estos pasos para poner el sistema en producción:\n\n" +
      "Paso 1: Obtener Certificado SSL de 90 días gratis\n" +
      "- Ve a PunchSalad (o proveedor similar).\n" +
      "- Sigue las instrucciones para verificar el dominio.\n" +
      "- Notarás que dentro de este .zip ya viene generada la estructura de carpetas: .well-known/acme-challenge/\n" +
      "- Guarda el archivo de validación que te dé PunchSalad EXACTAMENTE dentro de la carpeta acme-challenge/.\n\n" +
      "Paso 2: Configurar los certificados en el Hosting\n" +
      "- Ingresa al panel de control de tu hosting (Ferozo, cPanel, etc.).\n" +
      "- Ve a la sección de SSL/TLS y pega los contenidos de los certificados .crt y .key obtenidos en el Paso 1.\n\n" +
      "Paso 3: Subir los archivos vía FTP\n" +
      "- Conéctate a tu servidor vía FTP.\n" +
      "- Sube TODOS los archivos incluidos en este .zip directamente a la carpeta /public_html (o la carpeta raíz pública de tu dominio).\n\n" +
      "Paso 4: Personalización (¡Importante!)\n" +
      "- Reemplaza los archivos icon-192x192.png, icon-512x512.png y favicon.ico incluidos en este paquete por el logo real de tu cliente/marca.\n" +
      "- Asegúrate de respetar las dimensiones y los nombres de los archivos.\n\n" +
      "¡Listo! Tu ERP ahora es instalable como aplicación nativa.\n";

    // Carpeta .well-known/acme-challenge/
    var acmeChallengeBlob = Utilities.newBlob(
      "Guarda o sube el archivo de validación que te provee PunchSalad EXACTAMENTE en esta carpeta (junto a este archivo o reemplazándolo).", 
      MimeType.PLAIN_TEXT, 
      '.well-known/acme-challenge/PUNCHSALAD_AQUI.txt'
    );

    // 6. Empaquetado
    var blobs = [
      Utilities.newBlob(indexContent, MimeType.HTML, 'index.html'),
      Utilities.newBlob(manifestContent, MimeType.JSON, 'manifest.json'),
      Utilities.newBlob(swContent, MimeType.JAVASCRIPT, 'sw.js'),
      Utilities.newBlob(readmeContent, MimeType.PLAIN_TEXT, 'LEEME_INSTALACION.txt'),
      icon192Blob,
      icon512Blob,
      faviconBlob,
      acmeChallengeBlob
    ];
    
    var zipBlob = Utilities.zip(blobs, nombreDirectorio + '.zip');
    
    // 7. Guardado en Drive
    var folderName = "BlogShop Releases";
    var folders = DriveApp.getFoldersByName(folderName);
    var targetFolder;
    
    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      // Si no existe, la crea en la raíz del Drive
      targetFolder = DriveApp.createFolder(folderName);
    }
    
    var file = targetFolder.createFile(zipBlob);
    
    // Retornamos información de éxito para el frontend
    return {
      success: true,
      url: file.getUrl(),
      downloadUrl: file.getDownloadUrl(),
      fileName: file.getName()
    };
    
  } catch (error) {
    Logger.log("Error en generarPaquetePWA: " + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}
