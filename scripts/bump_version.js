import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Usage: node scripts/bump_version.js <new_version>');
    process.exit(1);
}

// Validate version format (x.y.z)
if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error('Error: Version must be in format x.y.z (e.g., 2.0.1)');
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');

const files = [
    {
        path: path.join(rootDir, 'package.json'),
        regex: /"version":\s*"[^"]+"/,
        replacement: `"version": "${newVersion}"`
    },
    {
        path: path.join(rootDir, 'src-tauri', 'tauri.conf.json'),
        regex: /"version":\s*"[^"]+"/,
        replacement: `"version": "${newVersion}"`
    },
    {
        path: path.join(rootDir, 'src-tauri', 'Cargo.toml'),
        regex: /^version\s*=\s*"[^"]+"/m,
        replacement: `version = "${newVersion}"`
    },
    {
        path: path.join(rootDir, 'src', 'components', 'Sidebar.tsx'),
        regex: /<div className="text-xs text-zinc-500">v[^<]+<\/div>/,
        replacement: `<div className="text-xs text-zinc-500">v${newVersion}</div>`
    },
    {
        path: path.join(rootDir, 'src', 'pages', 'AboutPage.tsx'),
        regex: /const appVersion = "[^"]+";/,
        replacement: `const appVersion = "${newVersion}";`
    }
];

let hasError = false;

files.forEach(file => {
    try {
        if (fs.existsSync(file.path)) {
            let content = fs.readFileSync(file.path, 'utf8');
            if (file.regex.test(content)) {
                content = content.replace(file.regex, file.replacement);
                fs.writeFileSync(file.path, content, 'utf8');
                console.log(`Updated ${path.basename(file.path)} to version ${newVersion}`);
            } else {
                console.warn(`Warning: Could not find version pattern in ${path.basename(file.path)}`);
            }
        } else {
            console.error(`Error: File not found: ${file.path}`);
            hasError = true;
        }
    } catch (e) {
        console.error(`Error updating ${file.path}:`, e);
        hasError = true;
    }
});

if (hasError) {
    process.exit(1);
} else {
    console.log(`\nSuccessfully updated project version to ${newVersion}`);
}
