const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const SKIP_DIRS = new Set([
    ".cache",
    ".git",
    ".playwright-cli",
    ".playwright-mcp",
    ".pytest_cache",
    ".superpowers",
    ".wrangler",
    "__pycache__",
    "backups",
    "deploy_backups",
    "dist",
    "node_modules",
    "output",
    "tmp_capture_review"
]);
const SKIP_PATH_PARTS = [
    path.join("data", "thread_image_backups")
];
const BINARY_EXTENSIONS = new Set([
    ".gif",
    ".jpg",
    ".jpeg",
    ".pdf",
    ".png",
    ".webp",
    ".zip"
]);
const FORBIDDEN_PATTERNS = [
    { name: "macos_user_absolute_path", regex: /\/Users\/[A-Za-z0-9._-]+/ },
    { name: "github_token", regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
    { name: "openai_key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
    { name: "private_key", regex: /BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY/ },
    { name: "authorization_bearer", regex: /authorization:\s*bearer\s+[A-Za-z0-9._-]{12,}/i },
    { name: "env_api_key_assignment", regex: /\b[A-Z0-9_]*(API_KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*=\s*['"][^'"]{8,}['"]/ }
];

function walkFiles(rootDir) {
    const results = [];
    const stack = [rootDir];
    while (stack.length) {
        const current = stack.pop();
        const relative = path.relative(rootDir, current);
        const basename = path.basename(current);
        if (relative && SKIP_DIRS.has(basename)) continue;
        if (relative && SKIP_PATH_PARTS.some((part) => relative === part || relative.startsWith(`${part}${path.sep}`))) continue;
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
        } else if (stat.isFile()) {
            results.push(current);
        }
    }
    return results.sort();
}

function isTextCandidate(filePath) {
    if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
    const stat = fs.statSync(filePath);
    return stat.size <= MAX_TEXT_BYTES;
}

function auditPublicRelease(rootDir = ROOT_DIR) {
    const findings = [];
    for (const filePath of walkFiles(rootDir)) {
        if (!isTextCandidate(filePath)) continue;
        const text = fs.readFileSync(filePath, "utf8");
        const lines = text.split(/\r?\n/);
        for (const pattern of FORBIDDEN_PATTERNS) {
            lines.forEach((line, index) => {
                if (pattern.regex.test(line)) {
                    findings.push({
                        pattern: pattern.name,
                        file: path.relative(rootDir, filePath),
                        line: index + 1
                    });
                }
            });
        }
    }
    return {
        schema_version: "ak_public_release_audit_v1",
        root_dir: rootDir,
        checked_file_count: walkFiles(rootDir).filter(isTextCandidate).length,
        finding_count: findings.length,
        release_allowed: findings.length === 0,
        findings
    };
}

function main(argv = process.argv.slice(2)) {
    const rootDir = argv[0] ? path.resolve(argv[0]) : ROOT_DIR;
    const report = auditPublicRelease(rootDir);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.release_allowed) process.exitCode = 1;
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    auditPublicRelease,
    FORBIDDEN_PATTERNS,
    SKIP_DIRS,
    SKIP_PATH_PARTS
};
