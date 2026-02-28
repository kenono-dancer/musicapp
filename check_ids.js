const fs = require('fs');

const appJs = fs.readFileSync('app.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');

const idRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const ids = [];
while ((match = idRegex.exec(appJs)) !== null) {
    ids.push(match[1]);
}

console.log("Checking IDs from app.js in index.html:");
let missingCount = 0;
for (const id of ids) {
    if (!indexHtml.includes(`id="${id}"`) && !indexHtml.includes(`id='${id}'`)) {
        console.log("- MISSING: " + id);
        missingCount++;
    }
}

if (missingCount === 0) {
    console.log("All IDs found.");
}
