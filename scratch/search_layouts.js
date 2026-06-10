const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'ecommerce_theme', 'theme-Blogger.xml');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

console.log("Searching for product HTML render functions...");

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('function') && (line.includes('Producto') || line.includes('Card') || line.includes('Render') || line.includes('render'))) {
        console.log(`Line ${i+1}: ${line}`);
    }
}
