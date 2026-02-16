function formatearFecha(fecha) {
  return (fecha instanceof Date && !isNaN(fecha))
    ? { label: "UPD", valor: Utilities.formatDate(fecha, "GMT-3", "dd-MM-yyyy") }
    : undefined;
}

function formatearFechaEnEspanol(fecha) {
  const diasIngles = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const diasEspanol = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  const mesesIngles = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mesesEspanol = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  let str = Utilities.formatDate(fecha, "America/Argentina/Buenos_Aires", "EEEE d 'de' MMMM 'a las' HH:mm 'hs'");

  // Reemplazar días
  for (let i = 0; i < diasIngles.length; i++) {
    const regex = new RegExp(diasIngles[i], "g");
    str = str.replace(regex, diasEspanol[i]);
  }

  // Reemplazar meses
  for (let i = 0; i < mesesIngles.length; i++) {
    const regex = new RegExp(mesesIngles[i], "g");
    str = str.replace(regex, mesesEspanol[i]);
  }

  // Capitalizar primera letra
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function crearMapaColores(coloresBD) {
  const mapa = new Map();
  for (const row of coloresBD) {
    const nombre = row[0];
    let hex = row[7] || "cccccc";
    if (!hex.startsWith("#")) hex = "#" + hex;
    mapa.set(nombre, hex);
  }
  return mapa;
}

function modeloJson(valor, label = "Modelo", icono) {
  if (!valor) return undefined;
  const json = { label, valor };
  if (icono) json.icono = icono;
  return json;
}

function getGeneroIcono(valor) {
  return valor === "Hombre" ? "♂️"
    : valor === "Mujer" ? "♀️"
    : valor === "Unisex" ? "⚧"
    : "";
}

function getTemporadaIcono(valor) {
  return valor === "INVIERNO" ? "❄️"
    : valor === "VERANO" ? "☀️"
    : valor === "SIN-TEMPORADA" ? "🚫"
    : "";
}

function esVerdadero(valor) {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor === 1;
  if (typeof valor === 'string') {
    const texto = valor.trim().toLowerCase();
    return texto === 'true' || texto === '1' || texto === 'verdadero';
  }
  return false;
}

// ✅ AHORA RECIBE appName COMO PARÁMETRO
function getPublicImageURL(appName, filePath, tableName) {
  if (!filePath) return "";
  const cleanPath = filePath.replace(/^\//, "");
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(tableName)}&fileName=${encodeURIComponent(cleanPath)}`;
}

// ✅ AHORA RECIBE appName COMO PARÁMETRO
/**
 * Genera una URL de WhatsApp para compartir un archivo/catálogo.
 * @param {string} appName - El ID de tu aplicación de AppSheet (viene de CONFIG.IDS.APP_ID).
 * @param {string} filePath - La ruta del archivo a compartir (el valor de la columna HTML).
 * @param {string} tableName - El nombre de la tabla de donde viene el archivo (ej: "BD_PRODUCTOS").
 * @returns {string} La URL completa de WhatsApp.
 */
// EN EL ARCHIVO: Utils.gs

function getWhatsAppPublicURL(filePath, tableName) {
  // Si no hay ruta de archivo, no hace nada (esto está bien).
  if (!filePath) {
    return "";
  }
  const appName = CONFIG.IDS.APP_ID; 
  // Tu lógica original para limpiar la ruta (esto está bien).
  const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  // Ahora la URL se construirá con los parámetros en el orden correcto.
  const publicUrl = `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=${encodeURIComponent(tableName)}&fileName=${encodeURIComponent(cleanPath)}`;
  const mensaje = "Mirá mi catálogo que preparé para vos: ";
  return `https://wa.me/?text=${encodeURIComponent(mensaje)}${encodeURIComponent(publicUrl)}`;
}