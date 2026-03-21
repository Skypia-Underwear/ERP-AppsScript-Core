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

# ==========================================
# LOGGER
# ==========================================
class LoggerWriter:
    def __init__(self):
        self.terminal = sys.stdout
        self.log = open(ARCHIVO_LOG, "a", encoding="utf-8")
    def write(self, message):
        if self.terminal:
            try: self.terminal.write(message)
            except: pass
        try:
            self.log.write(message)
            self.log.flush()
        except: pass
    def flush(self):
        if self.terminal:
            try: self.terminal.flush()
            except: pass
        self.log.flush()

sys.stdout = LoggerWriter()
sys.stderr = LoggerWriter()

# ==========================================
# FUNCIONES AUXILIARES
# ==========================================
LISTA_TIENDAS = []
SCRIPT_URL = ""

def cargar_config():
    global LISTA_TIENDAS, SCRIPT_URL
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                c = json.load(f)
                if "TIENDAS_IDS" in c and isinstance(c["TIENDAS_IDS"], list): LISTA_TIENDAS = c["TIENDAS_IDS"]
                elif "TIENDA_ID" in c: LISTA_TIENDAS = [c["TIENDA_ID"]]
                SCRIPT_URL = c.get("SCRIPT_URL", "")
        except: pass

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(('8.8.8.8', 80)); IP = s.getsockname()[0]
    except: IP = '127.0.0.1'
    finally: s.close()
    return IP

def sincronizar_ip_nube():
    cargar_config()
    if not SCRIPT_URL or not LISTA_TIENDAS: return
    mi_ip = get_local_ip()
    print(f"[{datetime.now()}] 🌍 IP Local: {mi_ip}")
    for t in LISTA_TIENDAS:
        try:
            p = urllib.parse.urlencode({'accion': 'actualizar_ip_local', 'tienda_id': t, 'nueva_ip': mi_ip})
            urllib.request.urlopen(f"{SCRIPT_URL}?{p}")
            print(f"   ✅ Sync OK: {t}")
        except Exception as e:
            print(f"   ❌ Error Sync {t}: {e}")

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
        print(f"❌ Error Win32Print: {e}")
        return False

# ==========================================
# SERVIDOR
# ==========================================
class PrintHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

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

            if not texto_ticket:
                self.responder_cierre("ERROR", "#ff0000", "No hay texto")
                return

            if not id_venta: id_venta = f"SinID_{int(time.time())}"
            
            t_now = time.time()
            for k in list(CACHE_IMPRESIONES.keys()):
                if t_now - CACHE_IMPRESIONES[k] > 60: del CACHE_IMPRESIONES[k]
            
            if id_venta in CACHE_IMPRESIONES and force_reprint != "1":
                print(f"[{datetime.now()}] 🚫 DUPLICADO: {id_venta}")
                current_query = parsed_url.query
                reprint_url = f"/print_ticket?{current_query}&force=1"
                self.responder_cierre("YA IMPRESO", "#ff9800", f"Ticket {id_venta} ya enviado.", True, reprint_url)
                return
            
            CACHE_IMPRESIONES[id_venta] = t_now
            safe_id = "".join([c for c in id_venta if c.isalnum() or c in ('-','_')])
            print(f"\n[{datetime.now()}] --- PROCESANDO: {safe_id} (Copias: {num_copias}) ---")

            p = Dummy()
            p.hw("INIT")

            texto_decodificado = urllib.parse.unquote(texto_ticket)
            msj_mkt_clean = urllib.parse.unquote(msj_marketing) if msj_marketing else ""
            u_qr = limpiar_url_qr(urllib.parse.unquote(datos_qr)) if datos_qr else ""

            # BUCLE DE COPIAS
            for i in range(num_copias):
                # 1. Logo
                if os.path.exists(ARCHIVO_LOGO):
                    try: p.set(align='center'); p.image(ARCHIVO_LOGO, impl="bitImageColumn"); p.text("\n"); p.set(align='left')
                    except: pass 
                
                # 2. Texto
                for linea in texto_decodificado.split('\n'):
                    linea = linea.rstrip()
                    if linea.startswith('^^'):
                        p.set(align='left', font='a', text_type='NORMAL', width=1, height=1)
                        p.set(align='center', text_type='B', width=2, height=2)
                        p.text(linea[2:] + "\n")
                        p.set(align='left', font='a', text_type='NORMAL', width=1, height=1)
                    elif linea.startswith('::'):
                        p.set(align='left', text_type='B')
                        p.text(linea[2:] + "\n")
                        p.set(align='left', text_type='NORMAL')
                    elif '---' in linea:
                        p.set(align='center'); p.text(linea + "\n"); p.set(align='left')
                    else:
                        p.text(linea + "\n")
                
                p.text("\n")
                
                # 3. Mkt
                if msj_mkt_clean:
                    p.set(align='center', text_type='B')
                    p.text("********************************\n")
                    p.text(msj_mkt_clean + "\n")
                    p.text("********************************\n\n")
                    p.set(align='left', text_type='NORMAL')

                # 4. Barra y QR
                if datos_barra:
                    try:
                        bc = barcode.get_barcode_class('code128')(urllib.parse.unquote(datos_barra), writer=ImageWriter())
                        fn = os.path.join(CARPETA_SERVER, 'temp_files', f"bar_{safe_id}")
                        img = bc.save(fn, options={"module_height":8.0, "quiet_zone":1.0, "write_text":True, "font_size":0})
                        p.set(align='center'); p.text("ID Venta:\n"); p.image(img, impl="bitImageColumn"); p.text("\n"); p.set(align='left')
                        try: os.remove(img)
                        except: pass
                    except: pass
                
                if u_qr:
                    try: p.set(align='center'); p.text("Info:\n"); p.qr(u_qr, native=False, size=6); p.text("\n\n"); p.set(align='left')
                    except: pass

                # 6. CAJON Y SONIDO (CORREGIDO: Usando comandos RAW para evitar errores)
                if i == 0:
                    if abrir_caja == "1":
                        # Intenta metodo nativo, si falla usa RAW (ESC p 0 50 50)
                        try: p.cashdraw(2)
                        except: p._raw(b'\x1b\x70\x00\x32\x32')
                    
                    if sonido_str == "1":
                        # Intenta metodo nativo, si falla usa RAW (ESC B 4 1)
                        try: p.buzzer()
                        except: p._raw(b'\x1b\x42\x04\x01')

                # CORTE Y FEED
                p.text("\n"); p.set(align='center'); p.text(".\n"); p.text("\n" * 5); p.cut()
                if i < (num_copias - 1): p.text("\n- - - - - CORTAR AQUI - - - - -\n\n")

            # Enviar a impresora
            if IMPRIMIR_FISICAMENTE:
                exito = enviar_raw_a_windows(NOMBRE_IMPRESORA_SHARE, p.output)
                stat_txt = "OK (Enviado)" if exito else "ERROR (Win32Print)"
            else: stat_txt = "OK (Simulado)"

            print(f"[{datetime.now()}] ID: {safe_id} - {stat_txt}")
            
            if "ERROR" in stat_txt:
                self.responder_cierre("ERROR IMPRESION", "#F44336", "Fallo driver Windows.")
            else:
                self.responder_cierre("IMPRESION ENVIADA", "#000000", "Ticket enviado.")

        except Exception as e:
            print(f"Error: {e}")
            self.responder_cierre("ERROR SERVIDOR", "#ff0000", str(e))

    def responder_cierre(self, titulo, color, mensaje, boton_reimprimir=False, url_reimprimir=""):
        self.send_response(200) 
        self.send_header("Content-type", "text/html; charset=utf-8") 
        self.end_headers()
        boton_extra = ""
        if boton_reimprimir:
            boton_extra = f"<button onclick=\"window.location.href='{url_reimprimir}'\" style=\"background-color:#333;border:2px solid white;margin-top:10px;\">🔄 FORZAR REIMPRESIÓN</button>"
        js = "" if boton_reimprimir else "setTimeout(function(){try{window.open('','_self','');window.close()}catch(e){}try{window.history.back()}catch(e){}},1000);"
        html = f"""<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>{titulo}</title><style>body{{background-color:{color};color:white;font-family:sans-serif;text-align:center;padding-top:20vh}}button{{background-color:white;color:{color};border:none;padding:15px;font-size:18px;border-radius:8px;font-weight:bold;margin:10px}}</style><script>window.onload=function(){{{js}}}</script></head><body><h1>{titulo}</h1><p>{mensaje}</p>{boton_extra}<br><button onclick="window.history.back()">VOLVER</button></body></html>"""
        self.wfile.write(html.encode('utf-8'))

if __name__ == "__main__":
    for d in [CARPETA_SERVER, os.path.join(CARPETA_SERVER, 'temp_files'), CARPETA_BACKUP]:
        if not os.path.exists(d): 
            try: os.makedirs(d)
            except: pass
    print(f"[{datetime.now()}] --- INICIANDO SERVIDOR MEJORADO ---")
    sincronizar_ip_nube()
    try:
        with socketserver.TCPServer(("", PUERTO), PrintHandler) as httpd:
            print(f"[{datetime.now()}] Servidor escuchando en puerto {PUERTO}")
            httpd.serve_forever()
    except KeyboardInterrupt: pass