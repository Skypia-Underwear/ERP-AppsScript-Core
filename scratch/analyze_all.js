const fs = require('fs');
const path = require('path');
const vm = require('vm');

const webDir = path.join(__dirname, '..', 'src', 'Web');
const files = fs.readdirSync(webDir);

console.log("Scanning directory:", webDir);

files.forEach(file => {
  if (file.endsWith('.html')) {
    const filePath = path.join(webDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Find all <script> blocks
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let count = 0;
    let hasError = false;

    while ((match = scriptRegex.exec(content)) !== null) {
      count++;
      const jsContent = match[1];

      try {
        new vm.Script(jsContent, { filename: `${file}#script[${count}]` });
      } catch (err) {
        hasError = true;
        console.error(`\n❌ Syntax Error in file: ${file} (Script Block #${count})`);
        console.error(err.stack);
      }
    }
    
    if (!hasError && count > 0) {
      console.log(`✅ ${file}: ${count} script block(s) compiled successfully.`);
    }
  }
});
