const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'Web', 'ai_lab.html');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
let scriptStartLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<script')) {
    scriptStartLine = i + 1;
    console.log(`Found <script> on line ${scriptStartLine}:`, lines[i]);
    break;
  }
}

if (scriptStartLine !== -1) {
  // Let's print the line corresponding to Line 20 of the script block.
  // Note: the script block contents start after the <script> tag.
  // The first line of the script block is scriptStartLine.
  // Line 20 of the script block would be around scriptStartLine + 19 or 20.
  const targetLine = scriptStartLine + 19;
  console.log(`\nLines around line ${targetLine} of the file (Line 20 of the script block):`);
  for (let l = Math.max(0, targetLine - 5); l < Math.min(lines.length, targetLine + 5); l++) {
    console.log(`${l + 1}: ${lines[l]}`);
  }
}
