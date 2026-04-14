<?php
// --- Habilitar CORS para permitir acceso desde Blogger ---
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

// --- Ruta al archivo JSON ---
$archivo = __DIR__ . '/ubigeo_fixed.json';

// --- Verificar que el archivo exista ---
if (file_exists($archivo)) {
    readfile($archivo); // Enviar contenido directamente
} else {
    echo json_encode(["error" => "Archivo ubigeo_fixed.json no encontrado"]);
}
?>
