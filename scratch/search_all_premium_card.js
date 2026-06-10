const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'ecommerce_theme', 'theme-Blogger.xml');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

console.log("Searching for base premium-card class styling...");

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('.premium-card') && !line.includes('.producto-item')) {
        console.log(`Line ${i+1}: ${line}`);
        console.log('--- Context ---');
        for (let j = Math.max(0, i - 10); j <= Math.min(lines.length - 1, i + 20); j++) {
            const marker = j === i ? '>>>' : '   ';
            console.log(`${marker} ${j+1}: ${lines[j]}`);
        }
        console.log('---------------');
    }
}
