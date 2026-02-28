const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');

// Find all function definitions
const definedRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
const definitions = new Set();
let match;
while ((match = definedRegex.exec(content)) !== null) {
    definitions.add(match[1]);
}

// Add known globals and built-ins
const globals = new Set([
    'require', 'console', 'document', 'window', 'setTimeout', 'setInterval',
    'clearTimeout', 'clearInterval', 'Math', 'JSON', 'Object', 'Array',
    'String', 'Number', 'Boolean', 'Date', 'Promise', 'Error', 'URL',
    'Blob', 'FileReader', 'navigator', 'indexedDB', 'alert', 'confirm',
    'fetch', 'caches', 'parseInt', 'parseFloat', 'isNaN', 'requestAnimationFrame',
    'cancelAnimationFrame', 'Audio', 'MediaMetadata', 'jsmediatags', 'Dropbox', 'CustomEvent',
    'btoa', 'atob', 'URLSearchParams', 'encodeURIComponent', 'decodeURIComponent'
]);

// Find all function calls
const callRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
const calls = new Set();
while ((match = callRegex.exec(content)) !== null) {
    calls.add(match[1]);
}

// Report undefined functions
console.log("Undefined function calls:");
for (let call of calls) {
    if (!definitions.has(call) && !globals.has(call) && !content.includes(`const ${call}`) && !content.includes(`let ${call}`) && !content.includes(`var ${call}`) && !content.includes(`${call} =`)) {
        console.log("- " + call);
    }
}
