const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'ecommerce_theme', 'theme-Blogger.xml');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

console.log("Searching for product item markup in theme-Blogger.xml...");

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('class=') && line.includes('premium-card')) {
        console.log(`Line ${i+1}: ${line}`);
        console.log('--- Context ---');
        for (let j = Math.max(0, i - 15); j <= Math.min(lines.length - 1, i + 35); j++) {
            const marker = j === i ? '>>>' : '   ';
            console.log(`${marker} ${j+1}: ${lines[j]}`);
        }
        console.log('---------------');
        break; // Just need the first match to see the structure
    }
}
