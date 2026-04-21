<?php
// config_sync_wc.php
// Configuración para la sincronización de WooCommerce desde Google Drive CSV

// ID del archivo CSV en Google Drive
// ¡¡¡IMPORTANTE!!! Asegúrate de que este archivo sea compartible
// con "Cualquier persona con el enlace puede ver".
define('GOOGLE_DRIVE_CSV_FILE_ID', '1dgY89IjwuH4-IkRKObAb0QwlsojsprZq');

// Opcional: Si prefieres usar un enlace de descarga directa (formato: 'https://drive.google.com/uc?export=download&id=FILE_ID')
// define('GOOGLE_DRIVE_CSV_DIRECT_URL', 'TU_URL_DE_DESCARGA_DIRECTA_AQUI');

// Ruta temporal donde se descargará el CSV en tu servidor
// Asegúrate de que esta carpeta exista y tenga permisos de escritura.
// Puedes usar wp_get_upload_dir() para ponerlo en la carpeta de uploads.
define('TEMP_CSV_PATH', __DIR__ . '/temp_woocommerce_sync.csv');

?>