// save as debug-models.js and run: node debug-models.js
const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, 'models');
fs.readdirSync(modelsDir)
  .filter(f => f.endsWith('.js'))
  .forEach(file => {
    const full = path.join(modelsDir, file);
    try {
      const required = require(full);
      const exported = (required && required.default) ? required.default : required;
      console.log(file, '->', typeof exported);
    } catch (err) {
      console.log(file, '-> require error:', err.message);
    }
  });
