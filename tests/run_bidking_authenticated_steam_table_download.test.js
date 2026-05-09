const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_ATTEMPT_REPORT_PATH,
    buildAuthenticatedSteamTableDownloadPlan,
    main,
    redactRunnerText,
    resolveExecutionUsername,
    resolveArgs,
    runAuthenticatedSteamTableDownload
} = require("../scripts/run_bidking_authenticated_steam_table_download.js");

function attemptReport() {
    return {
        schema_version: "ak_bidking_steam_depot_table_acquisition_attempt_v1",
        summary: {
            target_item_id: 1106013,
            current_full_client_depot_id: 4128581,
            current_full_client_manifest_id: "7599723101430486725"
        },
        next_authenticated_commands: {
            filelist_path: "/tmp/ak_bidking_4128581_tables_filelist.txt",
            filelist_lines: [
                "regex:.*BidKing_Data/StreamingAssets/Tables/(Item|Drop)\\.txt$",
                "regex:.*Tables/(Item|Drop)\\.txt$"
            ]
        }
    };
}

test("package exposes authenticated Steam table download runner", () => {
    assert.equal(
        packageJson.scripts["run:bidking-authenticated-steam-table-download"],
        "node scripts/run_bidking_authenticated_steam_table_download.js"
    );
    assert.match(packageJson.scripts["check:js"], /run_bidking_authenticated_steam_table_download\.js/);
    assert.equal(DEFAULT_ATTEMPT_REPORT_PATH.endsWith("2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.json"), true);
});

test("resolveArgs accepts attempt report, output path, username, execute flag, and generated time", () => {
    const result = resolveArgs([
        "attempt.json",
        "runner.json",
        "--username=owned-user",
        "--username-env=AK_STEAM_USERNAME",
        "--auth-mode=remember-password",
        "--execute",
        "--download-dir=/tmp/owned",
        "--depotdownloader-path=/tmp/dd/DepotDownloader",
        "--generated-at=2026-05-08T00:30:00.000+08:00"
    ]);

    assert.equal(result.attemptReportPath, path.resolve("attempt.json"));
    assert.equal(result.outputPath, path.resolve("runner.json"));
    assert.equal(result.username, "owned-user");
    assert.equal(result.usernameEnv, "AK_STEAM_USERNAME");
    assert.equal(result.authMode, "remember-password");
    assert.equal(result.execute, true);
    assert.equal(result.downloadDir, path.resolve("/tmp/owned"));
    assert.equal(result.depotDownloaderPath, path.resolve("/tmp/dd/DepotDownloader"));
    assert.equal(result.generatedAt, "2026-05-08T00:30:00.000+08:00");
});

test("resolveExecutionUsername reads username from an explicit environment variable without artifact exposure", () => {
    const result = resolveExecutionUsername({
        username: null,
        usernameEnv: "AK_STEAM_USERNAME",
        env: { AK_STEAM_USERNAME: "owned-user" }
    });

    assert.equal(result.username, "owned-user");
    assert.equal(result.source, "env");
    assert.equal(result.envName, "AK_STEAM_USERNAME");
});

test("execute mode can use username-env while keeping reports credential-safe", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-username-env-"));
    const fakeDownloader = path.join(tempDir, "DepotDownloader");
    fs.writeFileSync(
        fakeDownloader,
        "#!/bin/sh\necho \"$@\" > \"$AK_ARG_LOG\"\nOUT=''\nwhile [ $# -gt 0 ]; do\n  if [ \"$1\" = \"-dir\" ]; then\n    shift\n    OUT=\"$1\"\n  fi\n  shift\n done\nmkdir -p \"$OUT/BidKing_Data/StreamingAssets/Tables\"\nprintf '1106013\\tRecovered\\n' > \"$OUT/BidKing_Data/StreamingAssets/Tables/Item.txt\"\nprintf '1066\\t[[106,1106013,1,1,3333]]\\n' > \"$OUT/BidKing_Data/StreamingAssets/Tables/Drop.txt\"\necho \"logged in as owned-user\"\n",
        { mode: 0o755 }
    );
    const originalArgLog = process.env.AK_ARG_LOG;
    const originalSteamUsername = process.env.AK_STEAM_USERNAME;
    process.env.AK_ARG_LOG = path.join(tempDir, "args.log");
    process.env.AK_STEAM_USERNAME = "owned-user";

    try {
        const report = runAuthenticatedSteamTableDownload({
            attemptReport: attemptReport(),
            generatedAt: "2026-05-08T00:30:00.000+08:00",
            filelistPath: path.join(tempDir, "filelist.txt"),
            downloadDir: path.join(tempDir, "owned"),
            depotDownloaderPath: fakeDownloader,
            usernameEnv: "AK_STEAM_USERNAME",
            execute: true,
            authMode: "remember-password"
        });

        assert.match(fs.readFileSync(process.env.AK_ARG_LOG, "utf8"), /owned-user/);
        assert.equal(report.summary.username_provided, true);
        assert.equal(report.summary.username_source, "env");
        assert.equal(report.summary.username_env, "AK_STEAM_USERNAME");
        assert.equal(report.summary.download_attempted, true);
        assert.equal(report.summary.source_item_row_recovered, true);
        assert.doesNotMatch(JSON.stringify(report), /owned-user/);
        assert.match(report.downloader.output_redacted, /<STEAM_USERNAME>/);
    } finally {
        if (originalArgLog === undefined) delete process.env.AK_ARG_LOG;
        else process.env.AK_ARG_LOG = originalArgLog;
        if (originalSteamUsername === undefined) delete process.env.AK_STEAM_USERNAME;
        else process.env.AK_STEAM_USERNAME = originalSteamUsername;
    }
});

test("execute with missing username env is reported fail-closed without launching downloader", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-username-env-missing-"));
    const fakeDownloader = path.join(tempDir, "DepotDownloader");
    const markerPath = path.join(tempDir, "called");
    fs.writeFileSync(fakeDownloader, `#!/bin/sh\ntouch ${JSON.stringify(markerPath)}\nexit 99\n`, { mode: 0o755 });
    const originalSteamUsername = process.env.AK_STEAM_USERNAME;
    delete process.env.AK_STEAM_USERNAME;

    try {
        const report = runAuthenticatedSteamTableDownload({
            attemptReport: attemptReport(),
            generatedAt: "2026-05-08T00:30:00.000+08:00",
            filelistPath: path.join(tempDir, "filelist.txt"),
            downloadDir: path.join(tempDir, "owned"),
            depotDownloaderPath: fakeDownloader,
            usernameEnv: "AK_STEAM_USERNAME",
            execute: true,
            authMode: "remember-password"
        });

        assert.equal(fs.existsSync(markerPath), false);
        assert.equal(report.summary.execute_requested, true);
        assert.equal(report.summary.username_provided, false);
        assert.equal(report.summary.username_source, "env_missing");
        assert.equal(report.summary.download_attempted, false);
        assert.equal(report.summary.download_blocked_reason, "missing_steam_username_env");
        assert.match(report.summary.recommended_next_action, /set_steam_username_env/);
        assert.equal(report.summary.default_config_update_allowed, false);
    } finally {
        if (originalSteamUsername === undefined) delete process.env.AK_STEAM_USERNAME;
        else process.env.AK_STEAM_USERNAME = originalSteamUsername;
    }
});

test("execute with missing downloader binary is reported fail-closed before spawn", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-missing-tool-"));
    const missingDownloader = path.join(tempDir, "missing", "DepotDownloader");
    const originalSteamUsername = process.env.AK_STEAM_USERNAME;
    process.env.AK_STEAM_USERNAME = "owned-user";

    try {
        const report = runAuthenticatedSteamTableDownload({
            attemptReport: attemptReport(),
            generatedAt: "2026-05-08T00:30:00.000+08:00",
            filelistPath: path.join(tempDir, "filelist.txt"),
            downloadDir: path.join(tempDir, "owned"),
            depotDownloaderPath: missingDownloader,
            usernameEnv: "AK_STEAM_USERNAME",
            execute: true,
            authMode: "remember-password"
        });

        assert.equal(report.summary.username_provided, true);
        assert.equal(report.summary.depotdownloader_available, false);
        assert.equal(report.summary.download_attempted, false);
        assert.equal(report.summary.download_blocked_reason, "missing_depotdownloader_binary");
        assert.match(report.summary.recommended_next_action, /install_depotdownloader/);
        assert.equal(report.summary.default_config_update_allowed, false);
        assert.doesNotMatch(JSON.stringify(report), /owned-user/);
    } finally {
        if (originalSteamUsername === undefined) delete process.env.AK_STEAM_USERNAME;
        else process.env.AK_STEAM_USERNAME = originalSteamUsername;
    }
});

test("execute without safe auth mode is blocked before launching noninteractive password prompt", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-auth-block-"));
    const fakeDownloader = path.join(tempDir, "DepotDownloader");
    const markerPath = path.join(tempDir, "called");
    fs.writeFileSync(fakeDownloader, `#!/bin/sh\ntouch ${JSON.stringify(markerPath)}\nexit 99\n`, { mode: 0o755 });

    const report = runAuthenticatedSteamTableDownload({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath: path.join(tempDir, "filelist.txt"),
        downloadDir: path.join(tempDir, "owned"),
        depotDownloaderPath: fakeDownloader,
        username: "owned-user",
        execute: true
    });

    assert.equal(fs.existsSync(markerPath), false);
    assert.equal(report.summary.execute_requested, true);
    assert.equal(report.summary.download_attempted, false);
    assert.equal(report.summary.auth_mode, "blocked_noninteractive_password_prompt");
    assert.match(report.summary.recommended_next_action, /rerun_with_qr_or_remember_password_or_developer_export/);
    assert.equal(report.summary.default_config_update_allowed, false);
});

test("remember-password auth mode appends remember flag without credentials", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-remember-"));
    const report = buildAuthenticatedSteamTableDownloadPlan({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath: path.join(tempDir, "filelist.txt"),
        downloadDir: path.join(tempDir, "owned"),
        depotDownloaderPath: "/tmp/dd/DepotDownloader",
        username: "owned-user",
        execute: true,
        authMode: "remember-password"
    });

    assert.equal(report.summary.auth_mode, "remember-password");
    assert.match(report.plan.depotdownloader_command_redacted, /'-remember-password'/);
    assert.doesNotMatch(report.plan.depotdownloader_command_redacted, /owned-user|'-password'|access token|refresh token|2FA/i);
});

test("qr auth mode appends qr flag and remains credential-safe", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-qr-"));
    const report = buildAuthenticatedSteamTableDownloadPlan({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath: path.join(tempDir, "filelist.txt"),
        downloadDir: path.join(tempDir, "owned"),
        depotDownloaderPath: "/tmp/dd/DepotDownloader",
        username: "owned-user",
        execute: true,
        authMode: "qr"
    });

    assert.equal(report.summary.auth_mode, "qr");
    assert.match(report.plan.depotdownloader_command_redacted, /'-qr'/);
    assert.doesNotMatch(report.plan.depotdownloader_command_redacted, /owned-user|'-password'|access token|refresh token|2FA/i);
});

test("qr auth mode can be planned without username and omits username argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-qr-envless-"));
    const report = buildAuthenticatedSteamTableDownloadPlan({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath: path.join(tempDir, "filelist.txt"),
        downloadDir: path.join(tempDir, "owned"),
        depotDownloaderPath: "/tmp/dd/DepotDownloader",
        execute: true,
        authMode: "qr",
        downloaderAvailable: true
    });

    assert.equal(report.summary.auth_mode, "qr");
    assert.equal(report.summary.username_provided, false);
    assert.equal(report.summary.safe_execute_auth_mode, true);
    assert.equal(report.summary.download_attempted, false);
    assert.equal(report.summary.download_blocked_reason, "qr_requires_interactive_terminal");
    assert.match(report.summary.recommended_next_action, /run_interactive_qr/);
    assert.match(report.plan.depotdownloader_command_redacted, /'-qr'/);
    assert.doesNotMatch(report.plan.depotdownloader_command_redacted, /'-username'|<STEAM_USERNAME>|owned-user/);
});

test("execute qr mode without username is blocked before QR output can be captured", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-qr-block-"));
    const fakeDownloader = path.join(tempDir, "DepotDownloader");
    const markerPath = path.join(tempDir, "called");
    fs.writeFileSync(fakeDownloader, `#!/bin/sh\ntouch ${JSON.stringify(markerPath)}\necho 'QR LOGIN CODE SHOULD NOT BE CAPTURED'\nexit 0\n`, { mode: 0o755 });

    const report = runAuthenticatedSteamTableDownload({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath: path.join(tempDir, "filelist.txt"),
        downloadDir: path.join(tempDir, "owned"),
        depotDownloaderPath: fakeDownloader,
        execute: true,
        authMode: "qr"
    });

    assert.equal(fs.existsSync(markerPath), false);
    assert.equal(report.summary.download_attempted, false);
    assert.equal(report.summary.download_blocked_reason, "qr_requires_interactive_terminal");
    assert.equal(report.downloader, null);
    assert.doesNotMatch(JSON.stringify(report), /QR LOGIN CODE SHOULD NOT BE CAPTURED/);
});

test("dry run writes filelist and produces a credential-safe plan without executing DepotDownloader", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-dry-"));
    const filelistPath = path.join(tempDir, "filelist.txt");
    const report = buildAuthenticatedSteamTableDownloadPlan({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath,
        downloadDir: path.join(tempDir, "owned"),
        depotDownloaderPath: "/tmp/dd/DepotDownloader",
        username: "owned-user",
        execute: false
    });

    assert.equal(report.schema_version, "ak_bidking_authenticated_steam_table_download_runner_v1");
    assert.equal(report.summary.execute_requested, false);
    assert.equal(report.summary.username_provided, true);
    assert.equal(report.summary.download_attempted, false);
    assert.equal(report.summary.table_files_downloaded, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.match(report.plan.depotdownloader_command_redacted, /<STEAM_USERNAME>/);
    assert.doesNotMatch(report.plan.depotdownloader_command_redacted, /owned-user/);
    assert.match(fs.readFileSync(filelistPath, "utf8"), /Item\|Drop/);
});

test("execute mode runs the provided downloader path and redacts username from output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-exec-"));
    const fakeDownloader = path.join(tempDir, "DepotDownloader");
    fs.writeFileSync(
        fakeDownloader,
        "#!/bin/sh\nOUT=''\nwhile [ $# -gt 0 ]; do\n  if [ \"$1\" = \"-dir\" ]; then\n    shift\n    OUT=\"$1\"\n  fi\n  shift\n done\nmkdir -p \"$OUT/BidKing_Data/StreamingAssets/Tables\"\nprintf '1106013\\tRecovered\\n' > \"$OUT/BidKing_Data/StreamingAssets/Tables/Item.txt\"\nprintf '1066\\t[[106,1106013,1,1,3333]]\\n' > \"$OUT/BidKing_Data/StreamingAssets/Tables/Drop.txt\"\necho \"logged in as owned-user\"\n",
        { mode: 0o755 }
    );

    const report = runAuthenticatedSteamTableDownload({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath: path.join(tempDir, "filelist.txt"),
        downloadDir: path.join(tempDir, "owned"),
        depotDownloaderPath: fakeDownloader,
        username: "owned-user",
        execute: true,
        authMode: "remember-password"
    });

    assert.equal(report.summary.execute_requested, true);
    assert.equal(report.summary.download_attempted, true);
    assert.equal(report.summary.downloader_exit_code, 0);
    assert.equal(report.summary.table_files_downloaded, true);
    assert.equal(report.summary.source_item_row_recovered, true);
    assert.doesNotMatch(report.downloader.output_redacted, /owned-user/);
    assert.match(report.downloader.output_redacted, /<STEAM_USERNAME>/);
});

test("runner summarizes downloader signal and keeps failed interactive auth fail-closed", () => {
    const report = buildAuthenticatedSteamTableDownloadPlan({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath: path.join(os.tmpdir(), "ak-steam-runner-signal-filelist.txt"),
        downloadDir: path.join(os.tmpdir(), "ak-steam-runner-signal-owned"),
        depotDownloaderPath: "/tmp/dd/DepotDownloader",
        username: "owned-user",
        execute: true,
        downloaderResult: {
            status: null,
            signal: "SIGABRT",
            stdout: "Enter account password for \"owned-user\":",
            stderr: "LogOn requires a username and password or access token"
        }
    });

    assert.equal(report.summary.downloader_exit_code, null);
    assert.equal(report.summary.downloader_signal, "SIGABRT");
    assert.equal(report.summary.downloader_error_code, null);
    assert.equal(report.summary.downloader_timed_out, false);
    assert.match(report.summary.recommended_next_action, /retry_with_interactive_depotdownloader_or_developer_export/);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.doesNotMatch(report.downloader.output_redacted, /owned-user/);
    assert.doesNotMatch(report.downloader.output_redacted, /access token [^<]/);
});

test("execute mode bounds downloader runtime with a five second default timeout", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-timeout-"));
    const fakeDownloader = path.join(tempDir, "DepotDownloader");
    fs.writeFileSync(fakeDownloader, "#!/bin/sh\nsleep 2\n", { mode: 0o755 });

    const startedAt = Date.now();
    const report = runAuthenticatedSteamTableDownload({
        attemptReport: attemptReport(),
        generatedAt: "2026-05-08T00:30:00.000+08:00",
        filelistPath: path.join(tempDir, "filelist.txt"),
        downloadDir: path.join(tempDir, "owned"),
        depotDownloaderPath: fakeDownloader,
        username: "owned-user",
        execute: true,
        authMode: "remember-password",
        timeoutMs: 10
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(report.summary.downloader_error_code, "ETIMEDOUT");
    assert.equal(report.summary.downloader_timed_out, true);
    assert.ok(elapsedMs < 1500, `expected timeout before sleep completed, got ${elapsedMs}ms`);
});

test("redacts username, password, and token values", () => {
    const redacted = redactRunnerText("user owned-user password hunter2 access token abc", "owned-user");
    assert.doesNotMatch(redacted, /owned-user|hunter2|abc/);
    assert.match(redacted, /<STEAM_USERNAME>/);
});

test("main writes JSON and Markdown runner artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-steam-runner-main-"));
    const attemptPath = path.join(tempDir, "attempt.json");
    const outputPath = path.join(tempDir, "runner.json");
    fs.writeFileSync(attemptPath, JSON.stringify(attemptReport(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            attemptPath,
            outputPath,
            "--username=owned-user",
            `--filelist-path=${path.join(tempDir, "filelist.txt")}`,
            `--download-dir=${path.join(tempDir, "owned")}`,
            "--generated-at=2026-05-08T00:30:00.000+08:00"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.execute_requested, false);
    assert.match(markdown, /authenticated Steam table download runner/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
