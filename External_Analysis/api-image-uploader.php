<?php
/**
 * API Receptora de Imágenes desde Google Apps Script.
 * VERSIÓN 2.3 - Añade soporte para PORTADA (set_post_thumbnail) y mantiene la lógica de duplicados.
 */

define('WP_USE_THEMES', false);
require_once(__DIR__ . '/wp-load.php');

$clave_secreta_definida = 'CASTFER2025';

// --- VALIDACIÓN DE MÉTODO Y CLAVE ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['status' => 'error', 'message' => 'Solo se aceptan peticiones POST.']));
}

$api_key = $_POST['apiKey'] ?? '';
if ($api_key !== $clave_secreta_definida) {
    http_response_code(403);
    die(json_encode(['status' => 'error', 'message' => 'Clave API no válida.']));
}

// --- PARÁMETROS PRINCIPALES ---
$sku        = isset($_POST['sku']) ? sanitize_file_name($_POST['sku']) : null;
$fileName   = isset($_POST['fileName']) ? sanitize_file_name($_POST['fileName']) : null;
$imageData  = $_POST['imageData'] ?? null;
$is_cover   = isset($_POST['is_cover']) && $_POST['is_cover'] === 'true'; // NUEVO CAMPO

if (!$sku || !$fileName || !$imageData) {
    http_response_code(400);
    die(json_encode(['status' => 'error', 'message' => 'Faltan datos (sku, fileName o imageData).']));
}

// --- RUTAS Y ARCHIVOS ---
$upload_dir_info = wp_upload_dir();
$base_path = $upload_dir_info['basedir'] . '/productos/';
$sku_path = $base_path . $sku . '/';
$file_path = $sku_path . $fileName;

// === 1. Crear carpeta si no existe ===
if (!file_exists($sku_path)) {
    if (!wp_mkdir_p($sku_path)) {
        http_response_code(500);
        die(json_encode(['status' => 'error', 'message' => 'No se pudo crear la carpeta del SKU: ' . $sku]));
    }
}

// === 2. Evitar duplicado ===
if (file_exists($file_path)) {
    http_response_code(200);
    $product_url = obtener_url_producto_por_sku($sku);
    die(json_encode([
        'status' => 'skip',
        'message' => "La imagen '$fileName' ya existe. Se omite subida.",
        'product_url' => $product_url
    ]));
}

// === 3. Guardar el archivo en la carpeta del producto ===
$decoded_image = base64_decode($imageData);
if ($decoded_image === false) {
    http_response_code(400);
    die(json_encode(['status' => 'error', 'message' => 'Los datos no son Base64 válidos.']));
}

if (file_put_contents($file_path, $decoded_image) === false) {
    http_response_code(500);
    die(json_encode(['status' => 'error', 'message' => 'Error al guardar la imagen local.']));
}

// === 4. Registrar el archivo en la biblioteca de medios de WordPress ===
$file_url = $upload_dir_info['baseurl'] . '/productos/' . $sku . '/' . $fileName;

require_once(ABSPATH . 'wp-admin/includes/image.php');
require_once(ABSPATH . 'wp-admin/includes/file.php');
require_once(ABSPATH . 'wp-admin/includes/media.php');

$attachment = [
    'guid'           => $file_url,
    'post_mime_type' => mime_content_type($file_path),
    'post_title'     => preg_replace('/\.[^.]+$/', '', basename($fileName)),
    'post_content'   => '',
    'post_status'    => 'inherit'
];

$attachment_id = wp_insert_attachment($attachment, $file_path);
if (!is_wp_error($attachment_id)) {
    $attach_data = wp_generate_attachment_metadata($attachment_id, $file_path);
    wp_update_attachment_metadata($attachment_id, $attach_data);
}

// === 5. Asociar imagen al producto ===
$product_id = wc_get_product_id_by_sku($sku);
if ($product_id && !is_wp_error($attachment_id)) {

    // Si la imagen es portada, definir como destacada
    if ($is_cover) {
        set_post_thumbnail($product_id, $attachment_id);
        error_log("? Imagen marcada como PORTADA para SKU {$sku}: {$fileName}");
    } else {
        // Si no es portada, agregarla a la galería sin duplicar
        $gallery = get_post_meta($product_id, '_product_image_gallery', true);
        $gallery_ids = $gallery ? explode(',', $gallery) : [];
        if (!in_array($attachment_id, $gallery_ids)) {
            $gallery_ids[] = $attachment_id;
            update_post_meta($product_id, '_product_image_gallery', implode(',', $gallery_ids));
        }
    }
}

// === 6. Retornar URL del producto ===
$product_url = obtener_url_producto_por_sku($sku);

http_response_code(200);
echo json_encode([
    'status' => 'success',
    'message' => "Imagen '$fileName' subida exitosamente.",
    'product_url' => $product_url,
    'is_cover' => $is_cover
]);

/**
 * Función auxiliar: busca la URL del producto por su SKU (slug o campo personalizado).
 */
function obtener_url_producto_por_sku($sku) {
    if (!function_exists('wc_get_product_id_by_sku')) {
        return null;
    }

    $product_id = wc_get_product_id_by_sku($sku);
    if ($product_id) {
        return get_permalink($product_id);
    }

    // Si no se encuentra por SKU, intentar buscar por slug
    $producto = get_page_by_path($sku, OBJECT, 'product');
    if ($producto) {
        return get_permalink($producto->ID);
    }

    return null;
}
?>