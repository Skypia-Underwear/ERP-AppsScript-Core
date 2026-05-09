import os

path = r"c:\Users\USER\OneDrive\Documents\Proyecto_Web\Macros HostingShop\src\Web\pos_view.html"

replacements = {
    "MÃƒÂ­nima": "Minima",
    "ConfiguraciÃƒÂ³n": "Configuracion",
    "MÃƒÂ©todo": "Metodo",
    "Ã‘ADIR": "ANADIR",
    "PANTALÃƒâ€œN": "PANTALON",
    "SUÃƒâ€°TER": "SUETER",
    "OTOÃƒâ€˜O": "OTONO",
    "Ã“ptimo": "Optimo",
    "Ã³": "o",
    "Ã¡": "a",
    "Ã©": "e",
    "Ã­": "i",
    "Ãº": "u",
    "Ã‘": "N",
    "Ã±": "n",
    "Ã": " "
}

if os.path.exists(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    for old, new in replacements.items():
        content = content.replace(old, new)
    
    # Remove any remaining weird sequences like âš¡ or ðŸ“Œ
    # We'll just replace non-ASCII characters in console.logs
    import re
    content = re.sub(r'console\.log\(".*?"\)', lambda m: m.group(0).encode('ascii', 'ignore').decode('ascii'), content)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Saneamiento completado.")
else:
    print("Archivo no encontrado.")
