<?php
/**
 * API Proxy WooCommerce: Create/Update Product via REST API
 * Version 7.9 (ATTRIBUTE POSITIONING + FIX BRANDS)
 */

header("Content-Type: application/json; charset=utf-8");
set_time_limit(300);

// --- 1. SECURITY ---
$CLAVE_SECRETA = 'CASTFER2025';
$api_key_recibida = $_POST['apiKey'] ?? '';

if ($api_key_recibida !== $CLAVE_SECRETA) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Access denied: Invalid API Key."]);
    exit();
}

// --- WooCommerce REST API Config ---
$WC_SITE_URL = "https://castfer.com.ar";
$WC_CONSUMER_KEY = "ck_2f32b23fa4afd30a37556c8dfca74e8823b3a6f6";
$WC_CONSUMER_SECRET = "cs_e20d5a3016f2ab43aba73fb50069858443fcdac2";

$LOG_FILE = __DIR__ . "/woocommerce_sync_error.log";

// --- Attribute Slug Map ---
$ATTRIBUTE_SLUG_MAP = [
    "Color" => "pa_color",
    "Talle" => "pa_talle",
    "Precio" => "pa_precio",
];

// --- Log buffer ---
$LOG_BUFFER = [];
$ATTRIBUTE_ID_CACHE = [];

function log_error($mensaje)
{
    global $LOG_FILE, $LOG_BUFFER;
    $logEntryFile = date("[Y-m-d H:i:s] ") . $mensaje . PHP_EOL;
    file_put_contents($LOG_FILE, $logEntryFile, FILE_APPEND);
    $logMessageBuffer = (strpos($mensaje, "Array") === 0) ? "POST received (see detailed log)" : preg_replace("/\s+/", " ", $mensaje);
    $LOG_BUFFER[] = date("[H:i:s] ") . $logMessageBuffer;
}

log_error("POST received: " . print_r($_POST, true));

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Only POST accepted", "server_logs" => $LOG_BUFFER], JSON_INVALID_UTF8_IGNORE);
    exit();
}

$producto_json = $_POST["producto"] ?? "";
if (!$producto_json) {
    log_error("No product JSON received.");
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "No product JSON received", "server_logs" => $LOG_BUFFER], JSON_INVALID_UTF8_IGNORE);
    exit();
}

$data = json_decode($producto_json, true);
if (!$data) {
    log_error("Invalid JSON received.");
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid JSON", "server_logs" => $LOG_BUFFER], JSON_INVALID_UTF8_IGNORE);
    exit();
}

$sku = $data["SKU"] ?? "";
if (!$sku) {
    log_error("Missing SKU.");
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Missing SKU", "server_logs" => $LOG_BUFFER], JSON_INVALID_UTF8_IGNORE);
    exit();
}

function wc_request($method, $endpoint, $data = null)
{
    global $WC_SITE_URL, $WC_CONSUMER_KEY, $WC_CONSUMER_SECRET;
    $url = rtrim($WC_SITE_URL, "/") . "/wp-json/wc/v3/" . ltrim($endpoint, "/");
    $char = (strpos($url, '?') === false) ? '?' : '&';
    $url .= $char . 'consumer_key=' . $WC_CONSUMER_KEY . '&consumer_secret=' . $WC_CONSUMER_SECRET;

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    if ($data) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_INVALID_UTF8_IGNORE));
    }

    $response = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return ["httpcode" => $httpcode, "response" => $response, "error" => $error];
}

function _get_category_id($name, $parent_id = 0)
{
    $name = trim($name);
    $slug = str_replace(" ", "-", strtolower($name));
    $search = wc_request("GET", "products/categories?slug=" . urlencode($slug) . "&parent=$parent_id");
    if (!empty($search["response"])) {
        $cats = json_decode($search["response"], true);
        if (!empty($cats) && isset($cats[0]["id"]))
            return $cats[0]["id"];
    }
    $create = wc_request("POST", "products/categories", ["name" => $name, "parent" => $parent_id, "slug" => $slug]);
    if (!empty($create["response"])) {
        $new_cat = json_decode($create["response"], true);
        if (isset($new_cat["id"]))
            return $new_cat["id"];
    }
    return null;
}

function _get_brand_id($name)
{
    $name = trim($name);
    $slug = str_replace(" ", "-", strtolower($name));
    $search = wc_request("GET", "products/brands?slug=" . urlencode($slug));
    if (!empty($search["response"])) {
        $brands = json_decode($search["response"], true);
        if (!empty($brands) && isset($brands[0]["id"]))
            return $brands[0]["id"];
    }
    $create = wc_request("POST", "products/brands", ["name" => $name, "slug" => $slug]);
    if (!empty($create["response"])) {
        $new_brand = json_decode($create["response"], true);
        if (isset($new_brand["id"]))
            return $new_brand["id"];
    }
    return null;
}

function _get_attribute_id($slug)
{
    global $ATTRIBUTE_ID_CACHE;
    if (empty($ATTRIBUTE_ID_CACHE)) {
        $result = wc_request("GET", "products/attributes?per_page=100");
        if (!empty($result["response"])) {
            $attrs = json_decode($result["response"], true);
            if (is_array($attrs)) {
                foreach ($attrs as $attr) {
                    if (isset($attr['slug']) && isset($attr['id'])) {
                        $s = str_replace('pa_', '', $attr['slug']);
                        $ATTRIBUTE_ID_CACHE[$s] = $attr['id'];
                        $ATTRIBUTE_ID_CACHE['pa_' . $s] = $attr['id'];
                    }
                }
            }
        }
    }
    return $ATTRIBUTE_ID_CACHE[$slug] ?? null;
}

function getStockData($data)
{
    $qty = $data["Stock"] ?? "";
    if ($qty !== "" && is_numeric($qty)) {
        return ["manage_stock" => true, "stock_quantity" => (int) $qty, "stock_status" => (int) $qty > 0 ? "instock" : "outofstock"];
    }
    return ["manage_stock" => false, "stock_quantity" => null, "stock_status" => ($data["In stock?"] ?? "0") === "1" ? "instock" : "outofstock"];
}

function mapWooJSON($data)
{
    global $ATTRIBUTE_SLUG_MAP;
    $stock = getStockData($data);
    $wcData = [
        "name" => $data["Name"] ?? "",
        "type" => $data["Type"] ?? "simple",
        "sku" => $data["SKU"] ?? "",
        "status" => ($data["Published"] ?? "0") === "1" ? "publish" : "draft",
        "description" => $data["Description"] ?? "",
        "short_description" => $data["Short description"] ?? "",
        "regular_price" => $data["Regular price"] ?? "",
        "sale_price" => $data["Sale price"] ?? "",
        "manage_stock" => $stock["manage_stock"],
        "stock_quantity" => $stock["stock_quantity"],
        "stock_status" => $stock["stock_status"],
        "tags" => [],
        "categories" => [],
        "attributes" => [],
        "default_attributes" => []
    ];

    if (!empty($data["Categories"])) {
        $cats = explode(">", $data["Categories"]);
        $parent = 0;
        foreach ($cats as $cat) {
            $id = _get_category_id($cat, $parent);
            if ($id) {
                $wcData["categories"][] = ["id" => $id];
                $parent = $id;
            }
        }
    }

    if (!empty($data["Tags"])) {
        foreach (explode(",", $data["Tags"]) as $t) {
            $wcData["tags"][] = ["name" => trim($t)];
        }
    }

    if (!empty($data["tax:product_brand"])) {
        $bid = _get_brand_id($data["tax:product_brand"]);
        if ($bid) {
            $wcData["brands"] = [["id" => (int) $bid]];
            $wcData["product_brand"] = [["id" => (int) $bid]];
        }
    }

    for ($i = 1; $i <= 3; $i++) {
        $n = $data["Attribute {$i} name"] ?? "";
        $v = $data["Attribute {$i} value(s)"] ?? "";
        if ($n) {
            $slug = $ATTRIBUTE_SLUG_MAP[$n] ?? $n;
            $id = _get_attribute_id($slug);
            $opts = array_map("trim", explode(",", $v));
            $vis = ($data["Attribute {$i} visible"] ?? "0") === "1";

            $attrEntry = ["visible" => $vis, "variation" => true, "position" => ($i - 1), "options" => $opts];
            if ($id) {
                $attrEntry["id"] = $id;
            } else {
                $attrEntry["name"] = $slug;
            }

            $wcData["attributes"][] = $attrEntry;

            $def = $data["Attribute {$i} default"] ?? "";
            if ($def && $id) {
                $wcData["default_attributes"][] = ["id" => $id, "option" => str_replace(" ", "-", strtolower($def))];
            }
        }
    }

    if (!empty($data["variations"]) && $wcData["type"] === "variable") {
        $wcData["variations_data"] = [];
        foreach ($data["variations"] as $var) {
            $vs = getStockData($var);
            $vData = [
                "sku" => $var["SKU"] ?? "",
                "regular_price" => $var["Regular price"] ?? "",
                "sale_price" => $var["Sale price"] ?? "",
                "manage_stock" => $vs["manage_stock"],
                "stock_quantity" => $vs["stock_quantity"],
                "stock_status" => $vs["stock_status"],
                "attributes" => []
            ];
            for ($i = 1; $i <= 3; $i++) {
                $n = $var["Attribute {$i} name"] ?? "";
                $v = $var["Attribute {$i} value(s)"] ?? "";
                if ($n) {
                    $slug = $ATTRIBUTE_SLUG_MAP[$n] ?? $n;
                    $vData["attributes"][] = ["name" => $slug, "option" => str_replace(" ", "-", strtolower($v))];
                }
            }
            $wcData["variations_data"][] = $vData;
        }
    }
    return $wcData;
}

try {
    $wcReadyData = mapWooJSON($data);
    $variationsData = $wcReadyData["variations_data"] ?? null;
    unset($wcReadyData["variations_data"]);

    $check = wc_request("GET", "products?sku=" . urlencode($sku));
    $checkData = json_decode($check["response"], true);

    $product_id = null;
    $status = "";

    if (!empty($checkData) && isset($checkData[0]["id"])) {
        $product_id = $checkData[0]["id"];
        $result = wc_request("PUT", "products/$product_id", $wcReadyData);
        $status = "updated";
    } else {
        $result = wc_request("POST", "products", $wcReadyData);
        $status = "created";
    }

    $respData = json_decode($result["response"], true);
    if (isset($respData["id"])) {
        $product_id = $respData["id"];
    } else {
        throw new Exception("API Error: " . $result["response"]);
    }

    if ($product_id && $wcReadyData["type"] === "variable" && !empty($variationsData)) {
        $eVars = wc_request("GET", "products/$product_id/variations?per_page=100");
        $eVarsData = json_decode($eVars["response"], true);
        $existingSKUs = [];
        $allIDs = [];
        if (is_array($eVarsData)) {
            foreach ($eVarsData as $v) {
                if (isset($v["id"]))
                    $allIDs[] = $v["id"];
                if (!empty($v["sku"]))
                    $existingSKUs[$v["sku"]] = $v["id"];
            }
        }
        $batch = ["create" => [], "update" => [], "delete" => []];
        $kept = [];
        foreach ($variationsData as $var) {
            if (empty($var['regular_price']) || floatval($var['regular_price']) == 0)
                continue;
            if (isset($existingSKUs[$var["sku"]])) {
                $id = $existingSKUs[$var["sku"]];
                $var["id"] = $id;
                $batch["update"][] = $var;
                $kept[] = $id;
            } else {
                $batch["create"][] = $var;
            }
        }
        $deleteIDs = array_diff($allIDs, $kept);
        if (!empty($deleteIDs))
            $batch["delete"] = array_values($deleteIDs);
        if (!empty($batch["create"]) || !empty($batch["update"]) || !empty($batch["delete"])) {
            wc_request("POST", "products/$product_id/variations/batch", $batch);
        }
    }

    echo json_encode(["status" => $status, "message" => "Product processed successfully", "sku" => $sku, "product_id" => $product_id, "product_url" => $respData["permalink"] ?? "", "server_logs" => $LOG_BUFFER], JSON_INVALID_UTF8_IGNORE);

} catch (Exception $e) {
    log_error("CRITICAL: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage(), "server_logs" => $LOG_BUFFER], JSON_INVALID_UTF8_IGNORE);
}
?>