# -*- coding: utf-8 -*-
import http.server
import socketserver
import urllib.parse
import urllib.request
import os
import time
import socket
import json
import sys
import threading
from datetime import datetime
from escpos.printer import Dummy
import barcode
from barcode.writer import ImageWriter

# IMPORTANTE: Librería nativa para enviar comandos directos a Windows
import win32print

# ==========================================
# CONFIGURACIÓN
# ==========================================
IMPRIMIR_FISICAMENTE = True
PUERTO = 8000
NOMBRE_IMPRESORA_SHARE = "POS" 

CARPETA_SERVER = 'C:\\TPV_Server'
CONFIG_FILE = os.path.join(CARPETA_SERVER, 'config.json')
CARPETA_BACKUP = os.path.join(CARPETA_SERVER, 'backup_tickets')
ARCHIVO_LOGO = os.path.join(CARPETA_SERVER, 'logo.jpg')
ARCHIVO_LOG = os.path.join(CARPETA_SERVER, 'historial.log')

CACHE_IMPRESIONES = {}

# Locks para asegurar exclusión mutua en hilos
cache_lock = threading.Lock()
log_lock = threading.Lock()

# ==========================================
# LOGGER
# ==========================================
class LoggerWriter:
    def __init__(self):
        self.terminal = sys.stdout
        self.log = open(ARCHIVO_LOG, "a", encoding="utf-8")
    def write(self, message):
        with log_lock:
            if self.terminal:
                try: self.terminal.write(message)
                except: pass
            try:
                self.log.write(message)
                self.log.flush()
            except: pass
    def flush(self):
        with log_lock:
            if self.terminal:
                try: self.terminal.flush()
                except: pass
            self.log.flush()

sys.stdout = LoggerWriter()
sys.stderr = LoggerWriter()

# ==========================================
# FUNCIONES AUXILIARES Y SYNC IP
# ==========================================
LISTA_TIENDAS = []
SCRIPT_URL = ""
CORTE_DEFECTO = 1

def cargar_config():
    global LISTA_TIENDAS, SCRIPT_URL, CORTE_DEFECTO
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                c = json.load(f)
                if "TIENDAS_IDS" in c and isinstance(c["TIENDAS_IDS"], list): LISTA_TIENDAS = c["TIENDAS_IDS"]
                elif "TIENDA_ID" in c: LISTA_TIENDAS = [c["TIENDA_ID"]]
                SCRIPT_URL = c.get("SCRIPT_URL", "")
                CORTE_DEFECTO = int(c.get("corte", 1))
        except: pass

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        IP = s.getsockname()[0]
    except:
        try:
            IP = socket.gethostbyname(socket.gethostname())
        except:
            IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def sincronizar_ip_nube(ip_a_sincronizar=None):
    cargar_config()
    if not SCRIPT_URL or not LISTA_TIENDAS: return False
    mi_ip = ip_a_sincronizar or get_local_ip()
    
    # FILTRO ANTI-LOCALHOST: Nunca enviar 127.0.0.1 o 0.0.0.0 a la nube para proteger AppSheet
    if mi_ip == '127.0.0.1' or mi_ip.startswith('127.') or mi_ip == '0.0.0.0':
        print(f"[{datetime.now()}] ⚠️ IP detectada es '{mi_ip}' (loopback/sin conexión). Se omite sincronización para no sobreescribir la nube con localhost.")
        return False

    print(f"[{datetime.now()}] 🌍 Sincronizando IP LAN con la nube: {mi_ip}")
    for t in LISTA_TIENDAS:
        try:
            p = urllib.parse.urlencode({'accion': 'actualizar_ip_local', 'tienda_id': t, 'nueva_ip': mi_ip})
            urllib.request.urlopen(f"{SCRIPT_URL}?{p}", timeout=10)
            print(f"   ✅ Sync OK: {t}")
        except Exception as e:
            print(f"   ❌ Error Sync {t}: {e}")
    return True

ultimo_registro = {
    'ip': '',
    'tiempo': 0.0
}

def bucle_sincronizacion_ip():
    global ultimo_registro
    time.sleep(5) # Esperar arranque de red
    while True:
        try:
            ip_actual = get_local_ip()
            tiempo_actual = time.time()
            tiempo_transcurrido = tiempo_actual - ultimo_registro['tiempo']
            
            # FILTRO ANTI-LOCALHOST: Solo procesar si es una IP LAN real válida
            if ip_actual != '127.0.0.1' and not ip_actual.startswith('127.') and ip_actual != '0.0.0.0':
                # Sincronizar si cambió la IP o pasaron 2 horas (7200 segundos como latido/heartbeat)
                if ip_actual != ultimo_registro['ip'] or tiempo_transcurrido >= 7200:
                    print(f"[{datetime.now()}] 🔄 Detectado cambio de IP o timeout de latido. (IP anterior: '{ultimo_registro['ip']}' | IP actual: '{ip_actual}')")
                    if sincronizar_ip_nube(ip_actual):
                        ultimo_registro['ip'] = ip_actual
                        ultimo_registro['tiempo'] = tiempo_actual
            else:
                print(f"[{datetime.now()}] ℹ️ Verificación arrojó IP local '{ip_actual}'. Manteniendo IP LAN registrada ('{ultimo_registro['ip']}').")
        except Exception as e:
            print(f"⚠️ Error en bucle de sincronizacion: {e}")
        
        # Dormir 60 segundos antes de volver a verificar la IP
        time.sleep(60)

def limpiar_url_qr(qr_raw):
    if not qr_raw: return ""
    try:
        if qr_raw.strip().startswith('{') and '"Url":' in qr_raw:
            d = json.loads(qr_raw)
            if "Url" in d: qr_raw = d["Url"]
    except: pass
    if "quickchart.io" in qr_raw and "text=" in qr_raw:
        try:
            parsed = urllib.parse.urlparse(qr_raw)
            qs = urllib.parse.parse_qs(parsed.query)
            if 'text' in qs: return qs['text'][0]
        except: pass
    return qr_raw

def enviar_raw_a_windows(printer_name, raw_data):
    """ Envía bytes directos a la cola de impresión de Windows """
    try:
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            hJob = win32print.StartDocPrinter(hPrinter, 1, ("Ticket TPV", None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                win32print.WritePrinter(hPrinter, raw_data)
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
        return True
    except Exception as e:
        print(f"❌ Error Win32Print ({printer_name}): {e}")
        return False

# ==========================================
# TRABAJO DE IMPRESIÓN ASINCRÓNICO
# ==========================================
def ejecutar_trabajo_impresion(safe_id, id_venta, num_copias, texto_decodificado, msj_mkt_clean, u_qr, datos_barra, abrir_caja, sonido_str, habilitar_corte):
    """ Construye y envía el ticket a la impresora en segundo plano para no congelar el navegador """
    try:
        p = Dummy()
        p.encoding = 'cp850'
        p.hw("INIT")
        p._raw(b'\x1c\x2e')      # Desactivar modo Kanji/Chino
        p._raw(b'\x1b\x74\x02')  # Seleccionar tabla CP850 (Latin-1 / Español)

        for i in range(num_copias):
            # 1. Logo
            if os.path.exists(ARCHIVO_LOGO):
                try:
                    p._raw(b'\x1b\x61\x01')  # Centrar
                    p.image(ARCHIVO_LOGO, impl="bitImageColumn")
                    p.text("\n")
                    p._raw(b'\x1b\x61\x00')  # Izquierda
                except: pass 
            
            # 2. Texto
            for linea in texto_decodificado.split('\n'):
                linea_stripped = linea.lstrip()
                if linea_stripped.startswith('^^'):
                    texto_linea = linea_stripped[2:]
                    if texto_linea.startswith('::'): texto_linea = texto_linea[2:]
                    p._raw(b'\x1b\x61\x01')  # Centrar
                    p._raw(b'\x1b\x21\x38')  # ESC ! 56 (Negrita + Doble tamaño)
                    p.text(texto_linea.strip() + "\n")
                    p._raw(b'\x1b\x21\x00')  # Restaurar
                    p._raw(b'\x1b\x61\x00')  # Izquierda
                elif linea_stripped.startswith('^'):
                    texto_linea = linea_stripped[1:]
                    p._raw(b'\x1b\x61\x01')  # Centrar
                    p.text(texto_linea.strip() + "\n")
                    p._raw(b'\x1b\x61\x00')  # Izquierda
                elif linea_stripped.startswith('::'):
                    p._raw(b'\x1b\x61\x00')  # Izquierda
                    p._raw(b'\x1b\x45\x01')  # Negrita activada
                    p.text(linea_stripped[2:].strip() + "\n")
                    p._raw(b'\x1b\x45\x00')  # Negrita desactivada
                elif '---' in linea:
                    p._raw(b'\x1b\x61\x01')  # Centrar
                    p.text(linea + "\n")
                    p._raw(b'\x1b\x61\x00')  # Izquierda
                else:
                    p.text(linea + "\n")
            
            # 3. Marketing
            if msj_mkt_clean:
                p.text("\n")
                p._raw(b'\x1b\x61\x01')  # Centrar
                p._raw(b'\x1b\x45\x01')  # Negrita activada
                p.text("********************************\n")
                p.text(msj_mkt_clean + "\n")
                p.text("********************************\n")
                p._raw(b'\x1b\x45\x00')  # Negrita desactivada
                p._raw(b'\x1b\x61\x00')  # Izquierda

            # 4. Código de Barra y QR
            if datos_barra:
                try:
                    bc = barcode.get_barcode_class('code128')(urllib.parse.unquote(datos_barra), writer=ImageWriter())
                    fn = os.path.join(CARPETA_SERVER, 'temp_files', f"bar_{safe_id}")
                    img = bc.save(fn, options={"module_height":8.0, "quiet_zone":1.0, "write_text":True, "font_size":0})
                    p.text("\n")
                    p._raw(b'\x1b\x61\x01')  # Centrar
                    p.text("ID Venta:\n")
                    p.image(img, impl="bitImageColumn")
                    p.text("\n")
                    p._raw(b'\x1b\x61\x00')  # Izquierda
                    try: os.remove(img)
                    except: pass
                except Exception as e_bar:
                    print(f"[{datetime.now()}] ⚠️ Aviso: No se pudo generar código de barras: {e_bar}")
            
            if u_qr:
                try:
                    p.text("\n")
                    p._raw(b'\x1b\x61\x01')  # Centrar
                    p.text("Info:\n")
                    p.qr(u_qr, native=False, size=6)
                    p.text("\n")
                    p._raw(b'\x1b\x61\x00')  # Izquierda
                except: pass

            # 5. Cajón y Sonido
            if i == 0:
                if abrir_caja == "1":
                    p._raw(b'\x1b\x70\x00\x14\x14')
                if sonido_str == "1":
                    try: p.buzzer()
                    except: p._raw(b'\x1b\x42\x04\x01')

            # 6. Corte de papel
            if habilitar_corte == 1:
                p.text("\n" * 3)
                try: p.cut()
                except: pass
            else:
                p.text("\n")
            
            if i < (num_copias - 1): p.text("\n- - - - - CORTAR AQUI - - - - -\n\n")

        # Enviar a impresora de Windows
        if IMPRIMIR_FISICAMENTE:
            exito = enviar_raw_a_windows(NOMBRE_IMPRESORA_SHARE, p.output)
            stat_txt = "OK (Enviado a impresora)" if exito else "ERROR (Fallo Win32Print)"
        else:
            stat_txt = "OK (Simulado)"

        print(f"[{datetime.now()}] 🖨️ Job {safe_id} - {stat_txt}")
        
        # Guardar backup local
        try:
            backup_filename = f"ticket_{safe_id}_{int(time.time())}.txt"
            backup_path = os.path.join(CARPETA_BACKUP, backup_filename)
            with open(backup_path, 'w', encoding='utf-8') as backup_file:
                backup_file.write(f"--- RESPALDO DE TICKET DE VENTA ---\n")
                backup_file.write(f"ID Venta: {id_venta}\n")
                backup_file.write(f"Fecha Impresion: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                backup_file.write(f"Estado Impresion: {stat_txt}\n")
                backup_file.write(f"-----------------------------------\n\n")
                backup_file.write(texto_decodificado)
                if msj_mkt_clean:
                    backup_file.write(f"\n\n===================================\nMensaje Publicitario:\n{msj_mkt_clean}\n")
            print(f"[{datetime.now()}] 💾 Backup guardado en: {backup_path}")
        except Exception as e_backup:
            print(f"[{datetime.now()}] ⚠️ Error guardando backup de ticket: {e_backup}")
            
    except Exception as e:
        print(f"[{datetime.now()}] ❌ Error en ejecutar_trabajo_impresion ({safe_id}): {e}")

# ==========================================
# SERVIDOR HTTP
# ==========================================
class PrintHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_OPTIONS(self):
        """ Responder preflights CORS y Private Network Access de Chrome/AppSheet """
        self.send_response(204) # No Content
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Private-Network")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        try:
            parsed_url = urllib.parse.urlparse(self.path)
            if parsed_url.path != '/print_ticket':
                self.send_error(404)
                return

            query_params = urllib.parse.parse_qs(parsed_url.query)
            id_venta = query_params.get('id', [''])[0] 
            texto_ticket = query_params.get('texto', [''])[0]
            datos_qr = query_params.get('qr', [''])[0]
            datos_barra = query_params.get('barra', [''])[0]
            abrir_caja = query_params.get('caja', ['0'])[0]
            
            copias_str = query_params.get('copias', ['1'])[0]
            try: num_copias = int(copias_str)
            except: num_copias = 1
            
            sonido_str = query_params.get('sonido', ['0'])[0]
            msj_marketing = query_params.get('extra', [''])[0]
            force_reprint = query_params.get('force', ['0'])[0]
            
            corte_str = query_params.get('corte', [str(CORTE_DEFECTO)])[0]
            try: habilitar_corte = int(corte_str)
            except: habilitar_corte = CORTE_DEFECTO

            if not texto_ticket:
                self.responder_cierre("ERROR", "#ff0000", "No hay texto en el ticket")
                return

            if not id_venta: id_venta = f"SinID_{int(time.time())}"
            
            t_now = time.time()
            es_duplicado = False
            with cache_lock:
                for k in list(CACHE_IMPRESIONES.keys()):
                    if t_now - CACHE_IMPRESIONES[k] > 60: del CACHE_IMPRESIONES[k]
                
                if id_venta in CACHE_IMPRESIONES and force_reprint != "1":
                    es_duplicado = True
                else:
                    CACHE_IMPRESIONES[id_venta] = t_now

            if es_duplicado:
                print(f"[{datetime.now()}] 🚫 DUPLICADO DETECTADO: {id_venta}")
                current_query = parsed_url.query
                reprint_url = f"/print_ticket?{current_query}&force=1"
                self.responder_cierre("YA IMPRESO", "#ff9800", f"Ticket {id_venta} ya fue enviado hace momentos.", True, reprint_url)
                return
            
            safe_id = "".join([c for c in id_venta if c.isalnum() or c in ('-','_')])
            print(f"\n[{datetime.now()}] --- RECIBIDA ORDEN DE IMPRESIÓN: {safe_id} (Copias: {num_copias}) ---")

            texto_decodificado = urllib.parse.unquote(texto_ticket).rstrip()
            msj_mkt_clean = urllib.parse.unquote(msj_marketing) if msj_marketing else ""
            u_qr = limpiar_url_qr(urllib.parse.unquote(datos_qr)) if datos_qr else ""

            # 1. RESPONDER DE INMEDIATO AL NAVEGADOR (EVITA PANTALLAS EN BLANCO Y CONGELAMIENTOS EN APPSHEET)
            self.responder_cierre("IMPRESIÓN ENVIADA", "#2b78e4", "Ticket recibido correctamente. Procesando en cola...")

            # 2. PROCESAR IMPRESIÓN Y GUARDADO DE BACKUP EN HILO DE FONDO
            hilo_print = threading.Thread(
                target=ejecutar_trabajo_impresion,
                args=(safe_id, id_venta, num_copias, texto_decodificado, msj_mkt_clean, u_qr, datos_barra, abrir_caja, sonido_str, habilitar_corte),
                daemon=True
            )
            hilo_print.start()

        except (ConnectionAbortedError, ConnectionResetError) as conn_err:
            print(f"[{datetime.now()}] ⚠️ Conexión abortada por el cliente: {conn_err}")
        except Exception as e:
            print(f"[{datetime.now()}] ❌ Error en do_GET: {e}")
            try: self.responder_cierre("ERROR SERVIDOR", "#ff0000", str(e))
            except: pass

    def responder_cierre(self, titulo, color, mensaje, boton_reimprimir=False, url_reimprimir=""):
        try:
            self.send_response(200) 
            self.send_header("Content-type", "text/html; charset=utf-8") 
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.end_headers()
            boton_extra = ""
            if boton_reimprimir:
                boton_extra = f"<button onclick=\"window.location.href='{url_reimprimir}'\" style=\"background-color:#333;border:2px solid white;margin-top:10px;\">🔄 FORZAR REIMPRESIÓN</button>"
            # Cierre y regreso optimizado para móviles y AppSheet sin colisión
            js = "" if boton_reimprimir else "setTimeout(function(){try{window.open('','_self','');window.close();}catch(e){}try{if(window.history.length>1){window.history.back();}else{document.body.innerHTML='<h1>✅ Ticket Enviado</h1><p>Puedes regresar a la aplicación de AppSheet.</p>';}}catch(e){}}, 800);"
            html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>{titulo}</title><style>body{{background-color:{color};color:white;font-family:sans-serif;text-align:center;padding-top:15vh}}button{{background-color:white;color:{color};border:none;padding:15px;font-size:18px;border-radius:8px;font-weight:bold;margin:10px;cursor:pointer}}</style><script>window.onload=function(){{{js}}}</script></head><body><h1>{titulo}</h1><p>{mensaje}</p>{boton_extra}<br><button onclick="try{{window.history.back()}}catch(e){{}}">VOLVER A APPSHEET</button></body></html>"""
            self.wfile.write(html.encode('utf-8'))
        except (ConnectionAbortedError, ConnectionResetError) as conn_err:
            print(f"[{datetime.now()}] ⚠️ Conexión abortada al responder: {conn_err}")
        except Exception as e:
            print(f"[{datetime.now()}] ⚠️ Error en responder_cierre: {e}")

if __name__ == "__main__":
    try:
        for d in [CARPETA_SERVER, os.path.join(CARPETA_SERVER, 'temp_files'), CARPETA_BACKUP]:
            if not os.path.exists(d): 
                try: os.makedirs(d)
                except: pass
        print(f"[{datetime.now()}] --- INICIANDO SERVIDOR MEJORADO ---")
        
        # 1. Sincronización inicial al arrancar (con filtro anti-localhost)
        ip_init = get_local_ip()
        if ip_init != '127.0.0.1' and not ip_init.startswith('127.') and ip_init != '0.0.0.0':
            sincronizar_ip_nube(ip_init)
            ultimo_registro['ip'] = ip_init
            ultimo_registro['tiempo'] = time.time()
        else:
            print(f"[{datetime.now()}] ⚠️ IP de arranque arrojó '{ip_init}'. Se esperará a que se conecte a la red LAN para sincronizar.")
        
        # 2. Iniciar bucle de monitoreo en segundo plano
        hilo_sync = threading.Thread(target=bucle_sincronizacion_ip, daemon=True)
        hilo_sync.start()
        
        try:
            socketserver.ThreadingTCPServer.allow_reuse_address = True
            with socketserver.ThreadingTCPServer(("", PUERTO), PrintHandler) as httpd:
                print(f"[{datetime.now()}] Servidor escuchando en puerto {PUERTO}")
                httpd.serve_forever()
        except KeyboardInterrupt: pass
    except Exception as main_err:
        import traceback
        with open(os.path.join(CARPETA_SERVER, 'crash.log'), 'a', encoding='utf-8') as crash_f:
            crash_f.write(f"\n[{datetime.now()}] --- CRASH DETECTADO ---\n")
            traceback.print_exc(file=crash_f)