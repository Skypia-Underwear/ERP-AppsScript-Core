<?php
// --- ?? NUEVA LÍNEA: Activa la compresión GZIP automática ---
if (isset($_SERVER['HTTP_ACCEPT_ENCODING']) && substr_count($_SERVER['HTTP_ACCEPT_ENCODING'], 'gzip')) {
    ob_start("ob_gzhandler");
} else {
    ob_start();
}

// Permitir que Apps Script y Blogger accedan (CORS)
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// Limpiar el nombre del archivo por seguridad
$file = preg_replace('/[^a-z0-9\-\_\.]/', '', strtolower($_GET['file'] ?? ''));

if (!$file || !file_exists($file)) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Archivo no encontrado: " . $file]);
    exit;
}

// Leer y entregar el archivo
readfile($file);

// Finaliza el buffer y envía el contenido comprimido
ob_end_flush();
?>
