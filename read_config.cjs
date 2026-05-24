const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join(process.cwd(), 'remote_config.json'), 'utf8');
const partSize = 10000;
for (let i = 0; i < content.length; i += partSize) {
    console.log(`---PART_START---`);
    console.log(content.substring(i, i + partSize));
    console.log(`---PART_END---`);
}
