function listar_configuracion() {
  const fileId = '1qoRqhGCWUauEu4jjjY7AtXuOjCH7ehgs'; // ← reemplaza con el ID fijo del archivo JSON en Drive
  const startTime = new Date();

  try {
    const file = DriveApp.getFileById(fileId);
    const content = file.getBlob().getDataAsString();
    const json = JSON.parse(content);

    Logger.log("📁 Configuración leída desde archivo JSON en Drive");
    Logger.log("⏱ Tiempo de respuesta (ms): " + (new Date() - startTime));
    return json;
  } catch (e) {
    Logger.log("❌ Error al leer archivo JSON desde Drive: " + e.message);
    // Si falla, podrías regresar una configuración vacía o generar una nueva:
    return listar_configuracion_sinCache(); // fallback
  }
}

function regenerarCacheConfiguracion() {
  const jo = listar_configuracion_sinCache();
  const jsonFinal = JSON.stringify(jo);

  exportarConfiguracionAJsonDrive(jsonFinal); // delega el guardado en Drive
}

function exportarConfiguracionAJsonDrive() {
  const jo = listar_configuracion_sinCache();
  const jsonFinal = JSON.stringify(jo);
  const folderId = "1gM0BNaVa-LfTp80u7JQ177LnhmafqaNf"; // ID de carpeta
  const fileName = "configuracion_sitio.json";

  const folder = DriveApp.getFolderById(folderId);

  let file;
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    file = files.next();
    file.setTrashed(false); // Asegurarse de que no esté en la papelera
    file.setContent(jsonFinal); // 🔁 Sobrescribe el contenido sin cambiar el ID
    Logger.log("♻️ Archivo JSON sobrescrito");
  } else {
    file = folder.createFile(fileName, jsonFinal, "application/json");
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log("✅ Archivo JSON creado: " + file.getUrl());
  }

  Logger.log("🆔 ID del archivo JSON: " + file.getId());
}

function programarRegeneracionCache() {
  // Eliminar triggers previos para evitar duplicados
  const allTriggers = ScriptApp.getProjectTriggers();
  allTriggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "regenerarCacheConfiguracion") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Crear nuevo trigger cada 10 minutos (podés ajustar tiempo)
  ScriptApp.newTrigger("regenerarCacheConfiguracion")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log("🕓 Trigger creado: regenerarCacheConfiguracion cada 10 minutos");
}

function borrarCacheProperties() {
  const folderId = "1gM0BNaVa-LfTp80u7JQ177LnhmafqaNf";
  const folder = DriveApp.getFolderById(folderId);
  const archivos = folder.getFilesByName("configuracion_sitio.json");
  
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    archivo.setTrashed(true); // Mueve a la papelera
  }

  Logger.log("🗑️ Archivo JSON eliminado");
}