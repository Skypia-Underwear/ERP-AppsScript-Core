/**
 * SCRIPT DE PRUEBA: Validación de correcciones DriveApp
 */
function test_driveFixes() {
    console.log("🧪 Iniciando pruebas de Drive...");

    try {
        // 1. Probar Creación y Lectura (Uso de getBlob().getDataAsString())
        const tempFileName = "TEST_FIX_FILE.json";
        const content = JSON.stringify({ test: "ok", date: new Date().toISOString() });
        const rootFolderId = GLOBAL_CONFIG.DRIVE.JSON_CONFIG_FOLDER_ID;

        if (!rootFolderId) throw new Error("No se encontró JSON_CONFIG_FOLDER_ID");

        const folder = DriveApp.getFolderById(rootFolderId);
        let file;
        const files = folder.getFilesByName(tempFileName);

        if (files.hasNext()) {
            file = files.next();
        } else {
            file = folder.createFile(tempFileName, content, "application/json");
            console.log("✅ Archivo de prueba creado.");
        }

        // Probar Lectura con el nuevo método
        const readContent = file.getBlob().getDataAsString();
        console.log("📖 Contenido leído: " + readContent);

        if (readContent.includes("ok")) {
            console.log("✅ Lectura exitosa.");
        } else {
            throw new Error("El contenido leído no coincide.");
        }

        // 2. Probar Actualización (Uso de drive_updateFileContent)
        const newContent = JSON.stringify({ test: "updated", date: new Date().toISOString() });
        const updateRes = drive_updateFileContent(file.getId(), newContent);

        if (updateRes.success) {
            const readUpdated = file.getBlob().getDataAsString();
            console.log("📖 Contenido actualizado leído: " + readUpdated);
            if (readUpdated.includes("updated")) {
                console.log("✅ Actualización exitosa.");
            } else {
                throw new Error("El contenido actualizado no coincide.");
            }
        } else {
            throw new Error("Fallo en drive_updateFileContent: " + updateRes.message);
        }

        console.log("🎉 Todas las pruebas pasaron con éxito.");

    } catch (e) {
        console.error("❌ Error en prueba: " + e.message);
    }
}
