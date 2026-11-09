// Validates a release tag against the project versions and generates the release notes.
// Env: RELEASE_TAG (required), RELEASE_REF (git ref to read history from, defaults to the tag),
//      GITHUB_REPOSITORY (owner/repo), GITHUB_OUTPUT (set by GitHub Actions)
// Usage: node scripts/ci/prepare_release.mjs <notesOutputPath>
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
    ROOT_DIR, TAG_REGEX, classifyTag, readJson, readBundleTargets, getExpectedAssets, PLATFORM_LABELS,
} from './release_assets.mjs';

const notesPath = process.argv[2] || 'release-notes.md';
const tag = (process.env.RELEASE_TAG || '').trim();
const ref = process.env.RELEASE_REF || tag;
const repo = process.env.GITHUB_REPOSITORY || 'lucasdeeiroz/robot_runner';

function fail(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}

function git(...args) {
    return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
}

// 1. Tag format & version consistency (prevents artifacts named after a version they don't contain)
const tagMatch = tag.match(TAG_REGEX);
if (!tagMatch) fail(`Invalid release tag "${tag}". Expected vX.Y.Z or vX.Y.Z-stageN (e.g. v3.0.0-stable1).`);
const version = tagMatch[1];

const read = (relativePath) => fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
const projectVersions = {
    'package.json': readJson('package.json').version,
    'src-tauri/tauri.conf.json': readJson('src-tauri/tauri.conf.json').version,
    'src-tauri/Cargo.toml': read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    'companion/app/build.gradle.kts': read('companion/app/build.gradle.kts').match(/versionName\s*=\s*"([^"]+)"/)?.[1],
};
const mismatches = Object.entries(projectVersions).filter(([, value]) => value !== version);
if (mismatches.length > 0) {
    fail(`Tag ${tag} does not match the project version: ${mismatches.map(([file, value]) => `${file}=${value}`).join(', ')}. `
        + `Run "node scripts/bump_version.js ${version}" and recreate the tag.`);
}

const { channel, prerelease } = classifyTag(tag);

// 2. Previous tag: stable releases compare against the previous stable one, pre-releases against any previous tag
function findPreviousTag() {
    let tags;
    try {
        // All tags reachable through any parent (merge commits included); the current tag is excluded below
        tags = git('tag', '--merged', ref, '--sort=-creatordate').split('\n').filter(Boolean);
    } catch {
        return null;
    }
    const candidates = tags.filter(t => TAG_REGEX.test(t) && t !== tag);
    if (!prerelease) {
        const previousStable = candidates.find(t => !classifyTag(t).prerelease);
        if (previousStable) return previousStable;
    }
    return candidates[0] || null;
}
const previousTag = findPreviousTag();

// 3. Commits grouped by conventional-commit type
const SECTIONS = [
    { types: ['feat'], title: '✨ Features' },
    { types: ['improvement'], title: '🚀 Improvements' },
    { types: ['fix'], title: '🐛 Bug Fixes' },
    { types: ['perf'], title: '⚡ Performance' },
    { types: ['refactor'], title: '♻️ Refactoring' },
    { types: ['docs'], title: '📚 Documentation' },
    { types: ['test'], title: '🧪 Tests' },
    { types: ['ci', 'build'], title: '👷 CI & Build' },
    { types: ['chore', 'style'], title: '🔧 Chores' },
];
const OTHER_TITLE = '📦 Other Changes';
const IGNORED = [/^chore(\([^)]*\))?:\s*bump version/i, /^bump version/i, /^Merge /];

// Legacy commit style used in this repo ("NEW ...", "IMPROVED ...", "FIXED ...")
const LEGACY_PREFIXES = [
    { regex: /^NEW\s+(.+)$/, type: 'feat' },
    { regex: /^IMPROVED?\s+(.+)$/, type: 'improvement' },
    { regex: /^FIX(?:ED)?\s+(.+)$/, type: 'fix' },
    { regex: /^ADDED\s+(.+)$/, type: 'feat' },
];

// Returns { type, scope, description, breaking } for conventional or legacy subjects
function parseSubject(subject) {
    const conventional = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
    if (conventional) {
        return { type: conventional[1].toLowerCase(), scope: conventional[2], description: conventional[4], breaking: !!conventional[3] };
    }
    for (const legacy of LEGACY_PREFIXES) {
        const match = subject.trim().match(legacy.regex);
        if (match) return { type: legacy.type, description: match[1].trim(), breaking: false };
    }
    return { type: null, description: subject, breaking: false };
}

const range = previousTag ? `${previousTag}..${ref}` : ref;
const logLines = git('log', '--no-merges', '--format=%h%x09%s', range).split('\n').filter(Boolean).slice(0, 200);

const grouped = new Map();
for (const line of logLines) {
    const [hash, subject] = line.split('\t');
    if (!subject || IGNORED.some(re => re.test(subject))) continue;

    const parsed = parseSubject(subject);
    const section = SECTIONS.find(s => s.types.includes(parsed.type));
    const title = section ? section.title : OTHER_TITLE;
    const description = section ? parsed.description : subject;
    const scope = section && parsed.scope ? `**${parsed.scope}:** ` : '';
    const breaking = parsed.breaking ? '⚠️ **BREAKING** ' : '';

    if (!grouped.has(title)) grouped.set(title, []);
    grouped.get(title).push(`- ${breaking}${scope}${description} (\`${hash}\`)`);
}

// 4. Release notes
const CHANNEL_LABELS = {
    stable: '🟢 **Stable** — recommended for everyone.',
    beta: '🟡 **Beta** — feature-complete preview. Delivered to the Beta update channel.',
    alpha: '🔴 **Alpha** — experimental build. Delivered to the Alpha update channel only.',
};
const downloadUrl = (file) => `https://github.com/${repo}/releases/download/${tag}/${file}`;

const lines = [
    `## Robot Runner ${version}`,
    '',
    CHANNEL_LABELS[channel],
    '',
    '### 📥 Downloads',
    '',
    '| Platform | Package | File |',
    '|---|---|---|',
    ...getExpectedAssets(version, readBundleTargets()).map(asset =>
        `| ${PLATFORM_LABELS[asset.platform]} | ${asset.label} | [${asset.name}](${downloadUrl(asset.name)}) |`),
    '',
    `Verify your download with [SHA256SUMS.txt](${downloadUrl('SHA256SUMS.txt')}).`,
    '',
    previousTag ? `### 📝 Changes since ${previousTag}` : '### 📝 Changes',
    '',
];

const orderedTitles = [...SECTIONS.map(s => s.title), OTHER_TITLE].filter(title => grouped.has(title));
if (orderedTitles.length === 0) {
    lines.push('_No user-facing changes._', '');
}
for (const title of orderedTitles) {
    lines.push(`#### ${title}`, '', ...grouped.get(title), '');
}
if (previousTag) {
    lines.push(`**Full Changelog**: https://github.com/${repo}/compare/${previousTag}...${tag}`, '');
}

fs.writeFileSync(notesPath, lines.join('\n'), 'utf8');
console.log(`Release notes written to ${notesPath}`);

// 5. Outputs for the next workflow jobs
const outputs = { version, channel, prerelease: String(prerelease), previous_tag: previousTag || '' };
if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
} else {
    console.log(outputs);
}
