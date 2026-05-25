---
description: Sincronización coordinada total (GitHub + Macro Principal + Múltiples Clientes)
---
# Despliegue Global Coordinado (Todos los Entornos)

Usa este workflow para sincronizar todo el ecosistema del ERP en una sola ejecución. Este comando subirá el código a GitHub, a tu Macro Principal de desarrollo, y secuencialmente a los entornos de Apps Script de todos tus clientes activos.

## 🚀 Pasos de Ejecución Coordinada

### Paso 1: Sincronización General con GitHub
Sube el código base al repositorio compartido:
```powershell
git add .
git commit -m "Sincronización Global: Sincronización unificada de componentes del ERP"
git push
```

### Paso 2: Despliegue a tu Macro Principal (Desarrollo)
Sincroniza tu propia macro de control personal:
```powershell
clasp push
```

### Paso 3: Despliegue al Cliente 1 — Castfer (Donweb)
Sincroniza y publica la WebApp para el cliente Castfer:
```powershell
# 1. Backup y cambio de configuración
Copy-Item .clasp.json .clasp-backup.json
Copy-Item .clasp-castfer.json .clasp.json

# 2. Push y Despliegue
clasp push --force
clasp version "Sincronización Global - Castfer"
# Deploy a la WebApp de Castfer
clasp deploy -i AKfycbySMq7IZrZMhXE2wZAH-4YCLV8S-VpwjiTcKMAa1jonor7Zyjd2IdJo1EHZMs9WJahSKg -d "Sincronización Global - Castfer"

# 3. Restaurar configuración original temporalmente
Copy-Item .clasp-backup.json .clasp.json
Remove-Item .clasp-backup.json
```

### Paso 4: Despliegue al Cliente 2 — MINOM JEANS (Nimon System)
Sincroniza y publica la WebApp para el cliente MINOM JEANS:
```powershell
# 1. Backup y cambio de configuración
Copy-Item .clasp.json .clasp-backup.json
Copy-Item .clasp-minom.json .clasp.json

# 2. Push y Despliegue
clasp push --force
clasp version "Sincronización Global - MINOM"
# Deploy a la WebApp de MINOM JEANS
clasp deploy -i AKfycbzYhSY4sTRnUvPH6EcWNG89LjurVUbeWGAiUZMSdAsaHFpl7S0mjtWeQkfEnknG80A7 -d "Sincronización Global - MINOM"

# 3. Restaurar configuración original
Copy-Item .clasp-backup.json .clasp.json
Remove-Item .clasp-backup.json
```

---

## ⚠️ Recordatorio de Permisos (Scopes)

Después de realizar cambios en `appsscript.json` o si la WebApp del cliente solicita autorización, recuerda indicarle al cliente o acceder tú mismo al editor de Apps Script correspondiente para:
1. Ir a **Implementar > Administrar implementaciones**.
2. Editar la última versión activa de la WebApp.
3. Asegurar que en "Quién tiene acceso" esté seleccionado **"Cualquier persona"** (Any).
4. Hacer clic en **Implementar**.
