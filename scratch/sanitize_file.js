const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'Web', 'ai_lab.html');
const content = fs.readFileSync(filePath, 'utf8');

let newContent = "";
let replacedCount = 0;

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  const codePoint = content.codePointAt(i);
  
  // If it's a surrogate pair (high-Unicode character > 0xFFFF)
  if (codePoint > 0xFFFF) {
    replacedCount++;
    if (char === '\uD83D' || char === '\uD83C') {
      // It's the first surrogate of a surrogate pair, we reconstruct the full character
      const fullChar = content.substring(i, i + 2);
      if (fullChar === '📷') newContent += '[IMG]';
      else if (fullChar === '🎥') newContent += '[VID]';
      else if (fullChar === '🎬') newContent += '[SCENES]';
      else if (fullChar === '✨') newContent += '[3D]';
      else if (fullChar === '🔬') newContent += '[LAB]';
      else if (fullChar === '🧠') newContent += '[CACHE]';
      else newContent += '[UI]';
      
      i++; // Skip the second surrogate character of the pair
      continue;
    } else {
      newContent += '[UI]';
    }
  } else if (char === '⚡') { // 2-byte emoji
    replacedCount++;
    newContent += '[FAST]';
  } else if (char === '❌') { // 2-byte emoji
    replacedCount++;
    newContent += '[ERR]';
  } else {
    newContent += char;
  }
}

fs.writeFileSync(filePath, newContent, 'utf8');
console.log(`Successfully replaced ${replacedCount} emojis/symbols with ASCII text in ai_lab.html`);
