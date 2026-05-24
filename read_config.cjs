const fs = require('fs');
const path = require('path');
let content = '';
try {
    content = fs.readFileSync(path.join(process.cwd(), 'remote_config.json'), 'utf8');
} catch (error) {
    console.error('Failed to read remote_config.json from current working directory.');
    process.exit(1);
}
const partSize = 10000;
for (let i = 0; i < content.length; i += partSize) {
    console.log(`---PART_START---`);
    console.log(content.substring(i, i + partSize));
    console.log(`---PART_END---`);
}
