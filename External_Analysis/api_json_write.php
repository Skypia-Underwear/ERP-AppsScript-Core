<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Manejar pre-flight de CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// Leer el JSON que envía Apps Script
$input = file_get_contents('php://input');
$json = json_decode($input, true);

if (!$json || !isset($json['fileName']) || !isset($json['data'])) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Datos invalidos"]);
    exit;
}

// Seguridad: limpiar nombre de archivo
$fileName = preg_replace('/[^a-z0-9\-\_\.]/', '', strtolower($json['fileName']));

// --- ?? CAMBIO CLAVE AQUÍ ---
// Quitamos 'JSON_PRETTY_PRINT' para eliminar espacios, tabs y saltos de línea innecesarios.
// Mantenemos 'JSON_UNESCAPED_UNICODE' para que no convierta caracteres como "á" en "\u00e1".
$data = json_encode($json['data'], JSON_UNESCAPED_UNICODE);

// Guardar en el servidor
if (file_put_contents($fileName, $data)) {
    echo json_encode(["status" => "success", "message" => "Archivo guardado: " . $fileName]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Error al escribir el archivo"]);
}
?>
