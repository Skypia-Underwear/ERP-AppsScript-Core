const fs = require('fs');
const path = require('path');
const vm = require('vm');

const filePath = path.join(__dirname, '..', 'src', 'Web', 'ai_lab.html');
const content = fs.readFileSync(filePath, 'utf8');

console.log("Analyzing file:", filePath);
console.log("File size:", content.length, "bytes");

// Find all <script> blocks
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;

while ((match = scriptRegex.exec(content)) !== null) {
  count++;
  const jsContent = match[1];
  console.log(`\n--- Script Block #${count} (Length: ${jsContent.length} chars) ---`);

  // Check for non-ASCII or potential problematic characters
  const nonAscii = [];
  for (let i = 0; i < jsContent.length; i++) {
    const charCode = jsContent.charCodeAt(i);
    if (charCode > 127) {
      nonAscii.push({ index: i, char: jsContent[i], code: charCode, line: jsContent.substring(0, i).split('\n').length });
    }
  }

  if (nonAscii.length > 0) {
    console.log(`Found ${nonAscii.length} non-ASCII characters:`);
    // Print first 10
    nonAscii.slice(0, 20).forEach(char => {
      console.log(`  Line ${char.line}: '${char.char}' (Unicode: ${char.code})`);
    });
  }

  // Attempt to compile the JS block
  try {
    new vm.Script(jsContent, { filename: `ai_lab.html#script[${count}]` });
    console.log("✅ Compilation successful! No JavaScript syntax errors found.");
  } catch (err) {
    console.error("❌ Compilation failed with Syntax Error:");
    console.error(err.stack);
  }
}
