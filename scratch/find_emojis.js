const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'Web', 'ai_lab.html');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
console.log("Analyzing all lines for emojis or 4-byte characters...");

const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;

let totalCount = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let match;
  // Use a copy of the regex for matching
  const regex = new RegExp(emojiRegex);
  while ((match = regex.exec(line)) !== null) {
    totalCount++;
    console.log(`Line ${i + 1}: Found emoji '${match[0]}' (Code: ${match[0].codePointAt(0).toString(16).toUpperCase()}) in: "${line.trim()}"`);
  }
}

console.log(`\nTotal emojis found: ${totalCount}`);
