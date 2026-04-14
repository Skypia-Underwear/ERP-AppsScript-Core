const https = require('https');
const fs = require('fs');

const APP_ID = "e68c5895-f29e-4b39-a968-8423d172a050";
const ACCESS_KEY = "V2-4fx5C-9IOEB-dRQZK-cjRe2-yBT11-U9jJF-6ytL5-W9wvT";

// Obtener argumentos de la consola (Tabla, Columna, Valor)
const args = process.argv.slice(2);
const defaultTable = args[0] || "BLOGGER_VENTAS";
const defaultColumn = args[1] || "CODIGO";
const defaultValue = args[2] || "B-1D0E8C06";

function appsheetFind(tableName, keyColumn, keyValue) {
    const data = JSON.stringify({
        "Action": "Find",
        "Properties": { "Locale": "es-AR" },
        "Rows": [{ [keyColumn]: keyValue }]
    });

    const options = {
        hostname: 'api.appsheet.com',
        path: `/api/v2/apps/${APP_ID}/tables/${encodeURIComponent(tableName)}/Action`,
        method: 'POST',
        headers: {
            'ApplicationAccessKey': ACCESS_KEY,
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                } catch (e) {
                    reject(body);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

async function main() {
    const report = {
        timestamp: new Date().toISOString(),
        target: { table: defaultTable, column: defaultColumn, value: defaultValue },
        results: {}
    };
    
    try {
        console.log(`🔍 Auditando ${defaultTable} por ${defaultColumn} = ${defaultValue}...`);
        const result = await appsheetFind(defaultTable, defaultColumn, defaultValue);
        
        report.results = result;

        fs.writeFileSync('diagnostic_result.json', JSON.stringify(report, null, 2));
        console.log("✅ Diagnóstico completado. Resultados en 'diagnostic_result.json'");

    } catch (err) {
        fs.writeFileSync('diagnostic_error.log', String(err));
        console.error("❌ ERROR EN LA CONSULTA API:", err);
    }
}

main();
