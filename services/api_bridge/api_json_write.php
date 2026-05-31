<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Manejar pre-flight de CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// Leer el JSON que envia Apps Script
$input = file_get_contents('php://input');
$json = json_decode($input, true);

if (!$json || !isset($json['fileName']) || !isset($json['data'])) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Datos invalidos"]);
    exit;
}

// Seguridad: limpiar nombre de archivo
$fileName = preg_replace('/[^a-z0-9\-\_\.]/', '', strtolower($json['fileName']));

// Verificar si viene comprimido con GZIP
if (isset($json['gzipped']) && $json['gzipped'] === true) {
    $decodedData = base64_decode($json['data']);
    if ($decodedData === false) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Error al decodificar Base64"]);
        exit;
    }
    
    $decompressedData = gzdecode($decodedData);
    if ($decompressedData === false) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Error al descomprimir GZIP"]);
        exit;
    }
    
    // Decodificar el JSON descomprimido a una estructura PHP
    $decodedJson = json_decode($decompressedData, true);
    if ($decodedJson === null && json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "JSON descomprimido invalido"]);
        exit;
    }
    
    // Mantenemos 'JSON_UNESCAPED_UNICODE' para que no convierta caracteres especiales a secuencias unicode
    $data = json_encode($decodedJson, JSON_UNESCAPED_UNICODE);
} else {
    // Fallback: compatible con envios sin comprimir anteriores
    $data = json_encode($json['data'], JSON_UNESCAPED_UNICODE);
}

// Guardar en el servidor
if (file_put_contents($fileName, $data)) {
    echo json_encode(["status" => "success", "message" => "Archivo guardado: " . $fileName]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Error al escribir el archivo"]);
}
?>
