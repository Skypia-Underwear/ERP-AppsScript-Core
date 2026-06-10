const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'ecommerce_theme', 'theme-Blogger.xml');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

console.log("Searching for product item function...");

let startLine = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('producto-item compacto')) {
        startLine = i - 40;
        break;
    }
}

if (startLine !== -1) {
    console.log(`Printing from line ${startLine + 1}...`);
    for (let j = startLine; j < startLine + 180; j++) {
        if (lines[j] !== undefined) {
            console.log(`${j + 1}: ${lines[j]}`);
        }
    }
} else {
    console.log("Not found.");
}
