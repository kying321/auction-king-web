const workspaceRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./workspace_runtime.js")
    : (typeof AK_WORKSPACE_RUNTIME !== "undefined" ? AK_WORKSPACE_RUNTIME : (typeof window !== "undefined" ? window.AK_WORKSPACE_RUNTIME : {}));
const resultPanelRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./result_panel_runtime.js")
    : (typeof AK_RESULT_PANEL_RUNTIME !== "undefined" ? AK_RESULT_PANEL_RUNTIME : (typeof window !== "undefined" ? window.AK_RESULT_PANEL_RUNTIME : {}));
const configEditorRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./config_editor_runtime.js")
    : (typeof AK_CONFIG_EDITOR_RUNTIME !== "undefined" ? AK_CONFIG_EDITOR_RUNTIME : (typeof window !== "undefined" ? window.AK_CONFIG_EDITOR_RUNTIME : {}));
const fieldPanelRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./field_panel_runtime.js")
    : (typeof AK_FIELD_PANEL_RUNTIME !== "undefined" ? AK_FIELD_PANEL_RUNTIME : (typeof window !== "undefined" ? window.AK_FIELD_PANEL_RUNTIME : {}));
const sampleDatasetRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./sample_dataset.js")
    : (typeof AK_SAMPLE_DATASET_RUNTIME !== "undefined" ? AK_SAMPLE_DATASET_RUNTIME : (typeof window !== "undefined" ? window.AK_SAMPLE_DATASET_RUNTIME : {}));
const authorityCalibrationRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./authority_calibration_runtime.js")
    : (typeof AK_AUTHORITY_CALIBRATION_RUNTIME !== "undefined" ? AK_AUTHORITY_CALIBRATION_RUNTIME : (typeof window !== "undefined" ? window.AK_AUTHORITY_CALIBRATION_RUNTIME : {}));
const numericInputRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./numeric_input_runtime.js")
    : (typeof AK_NUMERIC_INPUT_RUNTIME !== "undefined" ? AK_NUMERIC_INPUT_RUNTIME : (typeof window !== "undefined" ? window.AK_NUMERIC_INPUT_RUNTIME : {}));
const roleStrategyRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./role_strategy.js")
    : (typeof AK_ROLE_STRATEGY_RUNTIME !== "undefined"
        ? AK_ROLE_STRATEGY_RUNTIME
        : (typeof window !== "undefined" && window.AK_ROLE_STRATEGY_RUNTIME ? window.AK_ROLE_STRATEGY_RUNTIME : {}));

const {
    listWorkspaceTemplates: listWorkspaceTemplatesFromRuntime,
    buildFieldCatalogIndex: buildFieldCatalogIndexFromRuntime,
    buildEffectiveWorkspaceConfig: buildEffectiveWorkspaceConfigFromRuntime,
    buildLegacyEstimatorStateFromFieldValues: buildLegacyEstimatorStateFromFieldValuesFromRuntime,
    normalizeWorkspaceState: normalizeWorkspaceStateFromRuntime,
    cloneTemplateDefinition: cloneTemplateDefinitionFromRuntime,
    upsertLocalTemplate: upsertLocalTemplateFromRuntime,
    removeLocalTemplateById: removeLocalTemplateByIdFromRuntime
} = workspaceRuntime;
const {
    resetOutputToWaiting: resetOutputToWaitingFromRuntime,
    renderPosteriorSummary: renderPosteriorSummaryFromRuntime,
    renderDistributionList: renderDistributionListFromRuntime,
    renderGridSummary: renderGridSummaryFromRuntime,
    renderValuation: renderValuationFromRuntime
} = resultPanelRuntime;
const {
    setConfigEditorMessage: setConfigEditorMessageFromRuntime,
    renderConfigEditorControls: renderConfigEditorControlsFromRuntime
} = configEditorRuntime;
const {
    renderFieldPanels: renderFieldPanelsFromRuntime
} = fieldPanelRuntime;
const {
    appendSettlementSample: appendSettlementSampleFromRuntime,
    loadSettlementSamples: loadSettlementSamplesFromRuntime,
    saveSettlementSamples: saveSettlementSamplesFromRuntime,
    updateSettlementSampleById: updateSettlementSampleByIdFromRuntime,
    removeSettlementSampleById: removeSettlementSampleByIdFromRuntime,
    attachSettlementSampleScreenshot: attachSettlementSampleScreenshotFromRuntime,
    clearSettlementSamples: clearSettlementSamplesFromRuntime,
    markSettlementSamplesExported: markSettlementSamplesExportedFromRuntime,
    buildSettlementSampleStats: buildSettlementSampleStatsFromRuntime,
    buildSettlementCollectionProgress: buildSettlementCollectionProgressFromRuntime,
    buildSettlementCalibrationReplayPackage: buildSettlementCalibrationReplayPackageFromRuntime,
    buildSettlementAuthorityExportPackage: buildSettlementAuthorityExportPackageFromRuntime,
    createSettlementSampleFromWorkspaceCapture: createSettlementSampleFromWorkspaceCaptureFromRuntime,
    normalizeSettlementScreenshotAttachment: normalizeSettlementScreenshotAttachmentFromRuntime,
    exportAuthorityBattleSamplesByIds: exportAuthorityBattleSamplesByIdsFromRuntime,
    exportAuthorityBattleSamplesForMap: exportAuthorityBattleSamplesForMapFromRuntime,
    exportAuthorityBattleSamples: exportAuthorityBattleSamplesFromRuntime,
    exportSettlementSamples: exportSettlementSamplesFromRuntime,
    getSettlementSampleAuthorityReadiness: getSettlementSampleAuthorityReadinessFromRuntime,
    getSettlementSampleCountFitReadiness: getSettlementSampleCountFitReadinessFromRuntime,
    getSettlementSampleAuthorityExportMeta: getSettlementSampleAuthorityExportMetaFromRuntime,
    isAuthorityReadySettlementSample: isAuthorityReadySettlementSampleFromRuntime,
    isCountFitReadySettlementSample: isCountFitReadySettlementSampleFromRuntime,
    isSettlementSampleAuthorityExported: isSettlementSampleAuthorityExportedFromRuntime
} = sampleDatasetRuntime;
const {
    applyAuthorityCalibration: applyAuthorityCalibrationFromRuntime
} = authorityCalibrationRuntime;
const {
    configureNumericInput: configureNumericInputFromRuntime,
    bindNumericWheelStepper: bindNumericWheelStepperFromRuntime,
    parseLooseNumber: parseLooseNumberFromRuntime
} = numericInputRuntime;
const {
    listRoleProfiles: listRoleProfilesFromRuntime,
    buildRoleStrategy: buildRoleStrategyFromRuntime
} = roleStrategyRuntime;

const WORKSPACE_STATE_STORAGE_KEY = "ak_workspace_state_v2";
const CONFIG_OVERRIDES_STORAGE_KEY = "ak_config_overrides_v2";
const LOCAL_TEMPLATES_STORAGE_KEY = "ak_templates_local_v2";
const CONFIG_SOURCE_STORAGE_KEY = "ak_config_source_v2";
const CALIBRATION_PANEL_MODE_STORAGE_KEY = "ak_calibration_panel_mode_v1";
const CALIBRATION_DRAFT_STORAGE_KEY = "ak_calibration_panel_draft_v1";
const CALIBRATION_APPLIED_STORAGE_KEY = "ak_calibration_panel_applied_v1";
const THEME_MODE_STORAGE_KEY = "ak_theme_mode_v1";
const FULL_SOLVER_WORKER_VERSION = "20260428232030";
const CALIBRATION_QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const CALIBRATION_QUALITY_LABELS = {
    w: "白",
    g: "绿",
    b: "蓝",
    p: "紫",
    o: "橙",
    r: "红"
};
const SETTLEMENT_SCREENSHOT_MAX_DIMENSION = 1280;
const SETTLEMENT_SCREENSHOT_JPEG_QUALITY = 0.72;
const SETTLEMENT_SCREENSHOT_MIN_WIDTH = 320;
const SETTLEMENT_SCREENSHOT_MIN_HEIGHT = 240;

function getRuntimeGlobal(name) {
    if (typeof globalThis !== "undefined" && globalThis[name] !== undefined) return globalThis[name];
    if (typeof window !== "undefined" && window[name] !== undefined) return window[name];
    return undefined;
}

function shouldFallbackToMainThreadFullSolve(error) {
    const message = error && error.message ? String(error.message) : String(error || "");
    return !/timeout|超时/i.test(message);
}

const bundledDefaultConfig = getRuntimeGlobal("AUCTION_KING_DEFAULT_CONFIG");
if (bundledDefaultConfig === undefined) {
    throw new Error("Missing bundled default config: AUCTION_KING_DEFAULT_CONFIG");
}

let defaultConfig = JSON.parse(JSON.stringify(bundledDefaultConfig));
if (typeof applyAuthorityCalibrationFromRuntime === "function" && defaultConfig.calibration) {
    defaultConfig = applyAuthorityCalibrationFromRuntime(defaultConfig, defaultConfig.calibration);
}

function getWorkspaceBaseConfig() {
    const next = JSON.parse(JSON.stringify(defaultConfig));
    delete next.calibration;
    return next;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function parseLooseNumber(value) {
    if (typeof parseLooseNumberFromRuntime === "function") return parseLooseNumberFromRuntime(value);
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().replace(/[，,]/g, "");
    if (!normalized) return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
}

const AVERAGE_CELL_FIELD_IDS = new Set([
    "orange_avg_cells",
    "purple_avg_cells",
    "white_green_avg_cells",
    "blue_avg_cells"
]);

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizeReplayFilterSlug(value) {
    return String(value || "all")
        .replace(/^batch:/, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "all";
}

function createExportTimestampSlug(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, "").replace(".", "");
}

function buildCalibrationReplayCandidateConfig(mapId, calibrationRecord = {}) {
    if (!mapId) return { maps: {} };
    return {
        maps: {
            [mapId]: {
                alpha_counts: cloneValue(calibrationRecord.alpha_counts || {}),
                value_model: cloneValue(calibrationRecord.value_model || {})
            }
        }
    };
}

function buildReplayPackageExportPayload(basePackage = {}, {
    mapId = null,
    calibrationMode = null,
    calibrationRecord = {},
    sourceArtifactVersion = null
} = {}) {
    const next = cloneValue(basePackage || {});
    if (!next.export_context || typeof next.export_context !== "object" || Array.isArray(next.export_context)) {
        next.export_context = {};
    }
    next.export_context.candidate_mode = calibrationMode || null;
    next.export_context.source_artifact_version = sourceArtifactVersion || null;
    next.candidate_config = buildCalibrationReplayCandidateConfig(mapId, calibrationRecord);
    return next;
}

function buildReplayPackageFilename(mapId, filterValue) {
    return `auction-king-replay-package-${mapId}-${sanitizeReplayFilterSlug(filterValue)}.json`;
}

function buildBeforeClearReplayPackageFilename(mapId, filterValue, timestampSlug) {
    return `auction-king-replay-package-before-clear-${mapId}-${sanitizeReplayFilterSlug(filterValue)}-${timestampSlug}.json`;
}

function buildReplayReportFilename(mapId, filterValue) {
    return `auction-king-replay-report-${mapId}-${sanitizeReplayFilterSlug(filterValue)}.json`;
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function setElementText(element, text) {
    if (!element) return;
    element.innerText = text || "";
    element.textContent = text || "";
}

function clearElementContent(element) {
    if (!element) return;
    element.innerHTML = "";
    element.innerText = "";
    element.textContent = "";
    if (Array.isArray(element.children)) {
        element.children.length = 0;
    }
    if (Array.isArray(element.options)) {
        element.options.length = 0;
    }
}

function formatNumber(value, digits = 0) {
    if (!Number.isFinite(value)) return "-";
    if (digits > 0) return value.toFixed(digits);
    return Math.round(value).toLocaleString();
}

function formatPercent(value) {
    if (!Number.isFinite(value)) return "-";
    return `${(value * 100).toFixed(1)}%`;
}

function createRuntimeCache(limit = 12) {
    const createLruCacheFromGlobal = getRuntimeGlobal("createLruCache");
    if (typeof createLruCacheFromGlobal === "function") return createLruCacheFromGlobal(limit);
    return {
        get() { return undefined; },
        set(_key, value) { return value; },
        clear() {}
    };
}

function loadJsonStorage(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (_error) {
        return null;
    }
}

function saveJsonStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function defaultConfigSourceVersion() {
    return defaultConfig && defaultConfig.app && defaultConfig.app.config_source_version
        ? defaultConfig.app.config_source_version
        : "ak_workspace_v2";
}

function normalizeThemeMode(value) {
    return value === "dark" ? "dark" : "light";
}

function getConfigDiff(currentValue, baseValue) {
    const buildConfigDiffFromGlobal = getRuntimeGlobal("buildConfigDiff");
    if (typeof buildConfigDiffFromGlobal === "function") {
        return buildConfigDiffFromGlobal(currentValue, baseValue) || {};
    }
    return currentValue;
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("DOMContentLoaded", () => {
        const statusDot = document.querySelector(".status-dot");
        const statusText = document.getElementById("status-text");
        const templateSelect = document.getElementById("template_select");
        const mapSelect = document.getElementById("map_select");
        const clearButton = document.getElementById("btn-clear");
        const saveClipboardScreenshotButton = document.getElementById("btn-save-clipboard-screenshot");
        const organizeChainButton = document.getElementById("btn-organize-chain");
        const cloneTemplateButton = document.getElementById("btn-clone-template");
        const newTemplateButton = document.getElementById("btn-new-template");
        const deleteTemplateButton = document.getElementById("btn-delete-template");
        const computeStatusLabel = document.getElementById("compute-status-label");
        const computeHint = document.getElementById("compute-hint");
        const workspaceSaveStatus = document.getElementById("workspace-save-status");
        const templateGroups = document.getElementById("template-groups");
        const moreFieldsPanel = document.getElementById("more-fields-panel");
        const moreFieldsSummaryMeta = document.getElementById("more-fields-summary-meta");
        const moreFieldsSearchInput = document.getElementById("more-fields-search");
        const moreFieldsFilterButtons = {
            all: document.getElementById("more-fields-filter-all"),
            aggregate: document.getElementById("more-fields-filter-aggregate"),
            quality: document.getElementById("more-fields-filter-quality"),
            combo: document.getElementById("more-fields-filter-combo"),
            constraint: document.getElementById("more-fields-filter-constraint")
        };
        const moreFields = document.getElementById("more-fields");
        const errorBox = document.getElementById("error-box");
        const orangeConfidenceNote = document.getElementById("orange-confidence-note");
        const orangeList = document.getElementById("list-orange");
        const redConfidenceNote = document.getElementById("red-confidence-note");
        const posteriorRiskNote = document.getElementById("posterior-risk-note");
        const redList = document.getElementById("list-red");
        const gridSection = document.getElementById("grid-section");
        const gridBody = document.getElementById("grid-tbody");
        const valuationSection = document.getElementById("valuation-section");
        const valDecisionHeadline = document.getElementById("val-decision-headline");
        const valDecisionSummary = document.getElementById("val-decision-summary");
        const valEv = document.getElementById("val-ev");
        const valProb = document.getElementById("val-prob");
        const valRoi = document.getElementById("val-roi");
        const valQ05 = document.getElementById("val-q05");
        const valQ25 = document.getElementById("val-q25");
        const valQ75 = document.getElementById("val-q75");
        const resultPanelContext = {
            orangeConfidenceNote,
            orangeList,
            redConfidenceNote,
            posteriorRiskNote,
            redList,
            errorBox,
            gridSection,
            gridBody,
            valuationSection,
            valDecisionHeadline,
            valDecisionSummary,
            valEv,
            valProb,
            valRoi,
            valQ05,
            valQ25,
            valQ75
        };
        const resultPanelHelpers = {
            documentRef: document,
            clearElementContent,
            setElementText,
            formatNumber,
            formatPercent,
            parseLooseNumber
        };
        const configEditorHelpers = {
            documentRef: document,
            clearElementContent,
            setElementText
        };
        const fieldPanelHelpers = {
            documentRef: document,
            clearElementContent,
            setElementText,
            parseLooseNumber
        };

        const configModal = document.getElementById("config-modal");
        const configModalTitle = document.getElementById("config-modal-title");
        const configViewButtons = {
            structured: document.getElementById("btn-config-view-structured"),
            baseline: document.getElementById("btn-config-view-baseline"),
            overrides: document.getElementById("btn-config-view-overrides")
        };
        const configEditorControls = document.getElementById("config-editor-controls");
        const configEditorStatus = document.getElementById("config-editor-status");
        const configHelpText = document.getElementById("config-help-text");
        const configJsonDetails = document.getElementById("config-json-details");
        const configJson = document.getElementById("config-json");
        const importConfigButton = document.getElementById("btn-config-import");
        const exportConfigButton = document.getElementById("btn-config-export");
        const saveConfigButton = document.getElementById("btn-save-config");
        const resetConfigButton = document.getElementById("btn-reset-config");
        const importConfigFile = document.getElementById("config-import-file");
        const themeToggleButton = document.getElementById("btn-theme-toggle");
        const openConfigButton = document.getElementById("btn-config");
        const closeConfigButton = document.getElementById("close-config");
        const calibrationPanel = document.getElementById("calibration-panel");
        const calibrationModeButtons = {
            draft: document.getElementById("btn-calibration-mode-draft"),
            apply: document.getElementById("btn-calibration-mode-apply")
        };
        const calibrationApplyDraftButton = document.getElementById("btn-calibration-apply-draft");
        const calibrationResetAuthorityButton = document.getElementById("btn-calibration-reset-authority");
        const calibrationImportDraftButton = document.getElementById("btn-calibration-import-draft");
        const calibrationExportDraftButton = document.getElementById("btn-calibration-export-draft");
        const calibrationImportAppliedButton = document.getElementById("btn-calibration-import-applied");
        const calibrationExportAppliedButton = document.getElementById("btn-calibration-export-applied");
        const calibrationImportSamplesButton = document.getElementById("btn-calibration-import-samples");
        const calibrationExportSamplesButton = document.getElementById("btn-calibration-export-samples");
        const calibrationExportFilteredReplaySamplesButton = document.getElementById("btn-calibration-export-filtered-replay-samples");
        const calibrationExportFilteredAuthoritySamplesButton = document.getElementById("btn-calibration-export-filtered-authority-samples");
        const calibrationCaptureSampleButton = document.getElementById("btn-calibration-capture-sample");
        const calibrationExportCurrentMapAuthoritySamplesButton = document.getElementById("btn-calibration-export-current-map-authority-samples");
        const calibrationExportAuthoritySamplesButton = document.getElementById("btn-calibration-export-authority-samples");
        const calibrationClearSamplesButton = document.getElementById("btn-calibration-clear-samples");
        const calibrationImportDraftFile = document.getElementById("calibration-import-draft-file");
        const calibrationImportAppliedFile = document.getElementById("calibration-import-applied-file");
        const calibrationImportSamplesFile = document.getElementById("calibration-import-samples-file");
        const calibrationArtifactMeta = document.getElementById("calibration-artifact-meta");
        const calibrationMapMeta = document.getElementById("calibration-map-meta");
        const calibrationSampleMeta = document.getElementById("calibration-sample-meta");
        const calibrationStatus = document.getElementById("calibration-status");
        const calibrationAlphaGrid = document.getElementById("calibration-alpha-grid");
        const calibrationValueGrid = document.getElementById("calibration-value-grid");
        const calibrationCellsGrid = document.getElementById("calibration-cells-grid");
        const calibrationSampleReview = document.getElementById("calibration-sample-review");

        function applyThemeMode(mode) {
            const normalized = normalizeThemeMode(mode);
            if (document.body && document.body.dataset) {
                document.body.dataset.theme = normalized;
            }
            if (themeToggleButton) {
                setElementText(themeToggleButton, normalized === "dark" ? "日间" : "夜间");
                themeToggleButton.setAttribute("aria-pressed", normalized === "dark" ? "true" : "false");
            }
        }

        let themeMode = normalizeThemeMode(localStorage.getItem(THEME_MODE_STORAGE_KEY));
        applyThemeMode(themeMode);
        if (themeToggleButton) {
            themeToggleButton.addEventListener("click", () => {
                themeMode = themeMode === "dark" ? "light" : "dark";
                localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
                applyThemeMode(themeMode);
            });
        }

        let configOverrides = {};
        const savedConfigVersion = localStorage.getItem(CONFIG_SOURCE_STORAGE_KEY);
        if (savedConfigVersion === defaultConfigSourceVersion()) {
            configOverrides = loadJsonStorage(CONFIG_OVERRIDES_STORAGE_KEY) || {};
        } else {
            localStorage.removeItem(CONFIG_OVERRIDES_STORAGE_KEY);
            localStorage.setItem(CONFIG_SOURCE_STORAGE_KEY, defaultConfigSourceVersion());
        }

        let localTemplates = loadJsonStorage(LOCAL_TEMPLATES_STORAGE_KEY);
        if (!Array.isArray(localTemplates)) localTemplates = [];
        let isOrganizingChain = false;
        let calibrationPanelMode = localStorage.getItem(CALIBRATION_PANEL_MODE_STORAGE_KEY) === "apply" ? "apply" : "draft";
        let calibrationDraftByMap = loadJsonStorage(CALIBRATION_DRAFT_STORAGE_KEY) || {};
        let calibrationAppliedByMap = loadJsonStorage(CALIBRATION_APPLIED_STORAGE_KEY) || {};
        let calibrationSelectedSampleByMap = {};
        let calibrationSampleFilterByMap = {};

        let currentConfig = buildEffectiveWorkspaceConfigFromRuntime(getWorkspaceBaseConfig(), configOverrides, localTemplates);
        let workspaceState = normalizeWorkspaceStateFromRuntime(currentConfig, loadJsonStorage(WORKSPACE_STATE_STORAGE_KEY));
        let configDraft = JSON.parse(JSON.stringify(currentConfig));
        const configModalViews = getRuntimeGlobal("CONFIG_MODAL_VIEWS");
        let activeConfigModalView = configModalViews
            ? configModalViews.STRUCTURED
            : "structured";

        let resultCache = createRuntimeCache(12);
        let coarseResultCache = createRuntimeCache(12);
        let fullSolveRuntime = null;
        let pendingFullSolveContext = null;
        let resolvedConfigCache = { mapId: null, sourceConfig: null, resolvedConfig: null };
        let latestAnalysisSnapshot = null;
        let activeExecutionId = 0;
        let isDirty = false;
        let isComputing = false;
        let hasCoarsePreview = false;
        let activeMoreFieldsFilter = "all";
        let moreFieldsSearchTerm = "";

        function hasConfigModalSurface() {
            return !!(
                configModal
                && configModalTitle
                && configHelpText
                && configJson
                && configEditorControls
                && importConfigButton
                && exportConfigButton
                && saveConfigButton
            );
        }

        function hasWorkspaceInputSurface() {
            return !!(templateGroups && moreFields && moreFieldsPanel && moreFieldsSummaryMeta);
        }

        function hasResultSurface() {
            return !!(
                errorBox
                && orangeConfidenceNote
                && orangeList
                && redConfidenceNote
                && posteriorRiskNote
                && redList
                && gridSection
                && gridBody
                && valuationSection
                && valDecisionHeadline
                && valDecisionSummary
                && valEv
                && valProb
                && valRoi
                && valQ05
                && valQ25
                && valQ75
            );
        }

        function getFieldCatalogIndex() {
            return buildFieldCatalogIndexFromRuntime(currentConfig);
        }

        function getFieldCatalogItems() {
            return currentConfig && currentConfig.fields && Array.isArray(currentConfig.fields.items)
                ? currentConfig.fields.items
                : [];
        }

        function hasRequiredInput() {
            return parseLooseNumber(workspaceState.field_values.total_items) !== null;
        }

        function isSolverBackedField(field) {
            return !!(field && field.participates_in_solver !== false);
        }

        function getVisibleTemplateFieldIds() {
            const activeTemplate = getActiveTemplate();
            return new Set((activeTemplate && Array.isArray(activeTemplate.fields) ? activeTemplate.fields : [])
                .filter((field) => field && field.default_visible !== false)
                .map((field) => field.field_id));
        }

        function getActiveSolverConstraintEntries() {
            const fieldIndex = getFieldCatalogIndex();
            const visibleFieldIds = getVisibleTemplateFieldIds();
            return Object.entries(workspaceState.field_values || {})
                .map(([fieldId, value]) => {
                    const field = fieldIndex[fieldId];
                    const numericValue = parseLooseNumber(value);
                    if (!isSolverBackedField(field) || numericValue === null) return null;
                    return {
                        fieldId,
                        label: field.label || fieldId,
                        value,
                        numericValue,
                        visible: visibleFieldIds.has(fieldId),
                        isAverageCell: AVERAGE_CELL_FIELD_IDS.has(fieldId)
                    };
                })
                .filter(Boolean);
        }

        function formatConstraintEntries(entries) {
            return entries
                .map((entry) => `${entry.label}=${entry.value}`)
                .join("、");
        }

        function clearSolverConstraintFields(fieldIds, statusMessage) {
            const ids = Array.from(new Set(fieldIds || [])).filter(Boolean);
            if (!ids.length) return;
            ids.forEach((fieldId) => {
                if (workspaceState.field_values && Object.prototype.hasOwnProperty.call(workspaceState.field_values, fieldId)) {
                    workspaceState.field_values[fieldId] = null;
                }
                if (workspaceState.field_value_meta) delete workspaceState.field_value_meta[fieldId];
            });
            persistWorkspaceState();
            if (workspaceSaveStatus && statusMessage) setElementText(workspaceSaveStatus, statusMessage);
            resetSolveSession({ clearCaches: true });
            renderFields();
            if (hasRequiredInput()) {
                executeEngine();
            } else {
                resetOutputToWaiting();
                setStatusAppearance("idle");
                updateComputeUi();
            }
        }

        function appendEngineErrorLine(text, className = "engine-error-line") {
            if (!errorBox) return;
            const line = document.createElement("div");
            line.className = className;
            setElementText(line, text);
            errorBox.appendChild(line);
        }

        function appendEngineErrorAction(id, label, onClick) {
            if (!errorBox) return;
            const button = document.createElement("button");
            button.type = "button";
            button.id = id;
            button.className = "btn secondary small-btn engine-error-action";
            setElementText(button, label);
            button.addEventListener("click", onClick);
            errorBox.appendChild(button);
        }

        function renderEngineError(result) {
            errorBox.classList.remove("hidden");
            if (posteriorRiskNote) {
                posteriorRiskNote.classList.add("hidden");
                setElementText(posteriorRiskNote, "");
            }
            clearElementContent(errorBox);
            const messages = Array.isArray(result && result.messages) && result.messages.length
                ? result.messages
                : ["当前输入组合下没有可行解。"];
            messages.forEach((message) => appendEngineErrorLine(message));

            const activeConstraints = getActiveSolverConstraintEntries();
            const hiddenConstraints = activeConstraints.filter((entry) => !entry.visible);
            const zeroAverageConstraints = activeConstraints.filter((entry) => entry.isAverageCell && entry.numericValue === 0);

            if (zeroAverageConstraints.length) {
                appendEngineErrorLine(
                    `检测到均格 0 约束：${formatConstraintEntries(zeroAverageConstraints)}。均格 0 不代表空值；0 件请用数量字段表达。`,
                    "engine-error-line engine-error-diagnostic"
                );
                appendEngineErrorAction(
                    "btn-clear-zero-average-constraints",
                    "清空 0 均格",
                    () => clearSolverConstraintFields(
                        zeroAverageConstraints.map((entry) => entry.fieldId),
                        "已清空 0 均格约束。"
                    )
                );
            }

            if (hiddenConstraints.length) {
                appendEngineErrorLine(
                    `参与求解的隐藏/备用约束：${formatConstraintEntries(hiddenConstraints)}。若不是本局信息，请清空这些字段。`,
                    "engine-error-line engine-error-diagnostic"
                );
                appendEngineErrorAction(
                    "btn-clear-hidden-solver-constraints",
                    "清空隐藏约束",
                    () => clearSolverConstraintFields(
                        hiddenConstraints.map((entry) => entry.fieldId),
                        "已清空隐藏/备用求解约束。"
                    )
                );
            }
        }

        function inferCountFromTotalAndAverage(totalCells, avgCells) {
            const total = parseLooseNumber(totalCells);
            const avg = parseLooseNumber(avgCells);
            if (!Number.isFinite(total) || !Number.isFinite(avg) || avg <= 0) return null;
            const inferred = total / avg;
            const rounded = Math.round(inferred);
            return Math.abs(inferred - rounded) <= 1e-9 && rounded >= 0 ? rounded : null;
        }

        function buildPosteriorConstraintDiagnostics(fieldValues = {}) {
            const totalItems = parseLooseNumber(fieldValues.total_items);
            const blueCount = parseLooseNumber(fieldValues.blue_count);
            const purpleCount = parseLooseNumber(fieldValues.purple_count);
            const orangeCount = parseLooseNumber(fieldValues.orange_count);
            const whiteGreenTotalCells = parseLooseNumber(fieldValues.white_green_total_cells);
            const whiteGreenAvgCells = parseLooseNumber(fieldValues.white_green_avg_cells);
            const directWhiteGreenCount = parseLooseNumber(fieldValues.white_green_total_count);
            const inferredWhiteGreenCount = inferCountFromTotalAndAverage(whiteGreenTotalCells, whiteGreenAvgCells);
            const whiteGreenCount = directWhiteGreenCount ?? inferredWhiteGreenCount;
            const orangeAvg = parseLooseNumber(fieldValues.orange_avg_cells);
            const knownNonOrangeRedCount = [blueCount, purpleCount, whiteGreenCount]
                .filter(Number.isFinite)
                .reduce((sum, value) => sum + value, 0);
            const orangeRedUnknownPool = Number.isFinite(totalItems) ? totalItems - knownNonOrangeRedCount : null;
            const knownCountBalanceComplete = [totalItems, blueCount, purpleCount, whiteGreenCount]
                .every(Number.isFinite);
            return {
                total_items: Number.isFinite(totalItems) ? totalItems : null,
                blue_count: Number.isFinite(blueCount) ? blueCount : null,
                purple_count: Number.isFinite(purpleCount) ? purpleCount : null,
                orange_count: Number.isFinite(orangeCount) ? orangeCount : null,
                white_green_total_cells: Number.isFinite(whiteGreenTotalCells) ? whiteGreenTotalCells : null,
                white_green_avg_cells: Number.isFinite(whiteGreenAvgCells) ? whiteGreenAvgCells : null,
                white_green_total_count: Number.isFinite(directWhiteGreenCount) ? directWhiteGreenCount : null,
                inferred_white_green_count: Number.isFinite(inferredWhiteGreenCount) ? inferredWhiteGreenCount : null,
                orange_avg_cells: Number.isFinite(orangeAvg) ? orangeAvg : null,
                orange_red_unknown_pool: Number.isFinite(orangeRedUnknownPool) ? orangeRedUnknownPool : null,
                known_count_balance_complete: knownCountBalanceComplete,
                orange_count_missing: !Number.isFinite(orangeCount)
            };
        }

        function buildPosteriorRiskDiagnostic(fieldValues = {}, summary = {}) {
            const warnings = [];
            const flags = [];
            const diagnostics = buildPosteriorConstraintDiagnostics(fieldValues);
            const orangeAvg = parseLooseNumber(fieldValues.orange_avg_cells);
            const redMean = parseLooseNumber(summary.count_means && summary.count_means.r);
            const redCellMean = parseLooseNumber(summary.cell_means && summary.cell_means.r);

            if (diagnostics.orange_count_missing && Number.isFinite(orangeAvg) && orangeAvg >= 8) {
                flags.push("extreme_orange_avg_needs_orange_count_confirmation");
                warnings.push("橙色均格极高但缺橙色数量，红色后验会对残差分配非常敏感。");
            }
            if (
                diagnostics.orange_count_missing
                && Number.isFinite(diagnostics.orange_red_unknown_pool)
                && diagnostics.orange_red_unknown_pool >= 6
                && Number.isFinite(redMean)
                && redMean >= diagnostics.orange_red_unknown_pool * 0.45
            ) {
                flags.push("red_residual_sensitive_to_missing_orange_count");
                warnings.push("当前红色期望主要来自橙数缺失后的未知池残差，建议补橙色数量、红色数量或总格数后再按估值出价。");
            }
            if (Number.isFinite(redMean) && redMean >= 8) flags.push("model_predicted_red_count_extreme");
            if (Number.isFinite(redCellMean) && redCellMean >= 30) flags.push("model_predicted_red_cells_extreme");
            if (Number.isFinite(redMean) && redMean >= 8 && Number.isFinite(redCellMean) && redCellMean >= 30) {
                warnings.push("红色后验处于极端区间，未补关键字段前应优先看 Q25/中位数，不要按 EV 上沿追价。");
            }
            return {
                status: warnings.length ? "warning" : "ok",
                warnings,
                flags,
                constraint_diagnostics: diagnostics
            };
        }

        function buildPosteriorRiskWarnings(fieldValues = {}, summary = {}) {
            const { warnings } = buildPosteriorRiskDiagnostic(fieldValues, summary);
            return warnings;
        }

        function renderPosteriorRiskNote(fieldValues = {}, summary = {}) {
            if (!posteriorRiskNote) return;
            const { warnings } = buildPosteriorRiskDiagnostic(fieldValues, summary);
            if (!warnings.length) {
                posteriorRiskNote.classList.add("hidden");
                setElementText(posteriorRiskNote, "");
                return;
            }
            posteriorRiskNote.classList.remove("hidden");
            setElementText(posteriorRiskNote, warnings.join(" "));
        }

        function setStatusAppearance(kind) {
            if (!statusDot || !statusText) return;
            if (kind === "coarse") {
                statusDot.style.background = "#f59e0b";
                statusDot.style.boxShadow = "0 0 10px #f59e0b";
                setElementText(statusText, "阶段结果已显示，后台继续补算");
                return;
            }
            if (kind === "running") {
                statusDot.style.background = "#3b82f6";
                statusDot.style.boxShadow = "0 0 10px #3b82f6";
                setElementText(statusText, "正在计算当前输入");
                return;
            }
            if (kind === "pending") {
                statusDot.style.background = "#f59e0b";
                statusDot.style.boxShadow = "0 0 10px #f59e0b";
                setElementText(statusText, "输入已变化，离框后自动更新");
                return;
            }
            statusDot.style.background = "#10b981";
            statusDot.style.boxShadow = "0 0 10px #10b981";
            setElementText(statusText, hasRequiredInput() ? "结果已与输入同步" : "等待输入完成");
        }

        function updateComputeUi() {
            if (!computeStatusLabel || !computeHint) return;
            if (!hasRequiredInput()) {
                setElementText(computeStatusLabel, "等待总数量");
                setElementText(computeHint, "先填入总数量，离开输入框后自动重算。");
                return;
            }
            if (isComputing && hasCoarsePreview) {
                setElementText(computeStatusLabel, "阶段结果已出");
                setElementText(computeHint, "当前先显示快速结果，更高精度后验仍在后台补算。");
                return;
            }
            if (isComputing) {
                setElementText(computeStatusLabel, "计算中...");
                setElementText(computeHint, "正在计算当前输入结果。");
                return;
            }
            if (isDirty) {
                setElementText(computeStatusLabel, "等待离框");
                setElementText(computeHint, "输入完成后离开输入框会自动更新。");
                return;
            }
            setElementText(computeStatusLabel, "结果已最新");
            setElementText(computeHint, "当前结果已与输入同步，可继续修改。");
        }

        function persistWorkspaceState() {
            saveJsonStorage(WORKSPACE_STATE_STORAGE_KEY, workspaceState);
            if (workspaceSaveStatus) {
                setElementText(workspaceSaveStatus, "模板、配置和上次表单都只保存在当前浏览器。");
            }
        }

        function persistLocalTemplates() {
            saveJsonStorage(LOCAL_TEMPLATES_STORAGE_KEY, localTemplates);
        }

        function persistConfigOverrides() {
            saveJsonStorage(CONFIG_OVERRIDES_STORAGE_KEY, configOverrides);
            localStorage.setItem(CONFIG_SOURCE_STORAGE_KEY, defaultConfigSourceVersion());
        }

        function persistCalibrationMode() {
            localStorage.setItem(CALIBRATION_PANEL_MODE_STORAGE_KEY, calibrationPanelMode);
        }

        function persistCalibrationDrafts() {
            saveJsonStorage(CALIBRATION_DRAFT_STORAGE_KEY, calibrationDraftByMap);
        }

        function persistCalibrationApplied() {
            saveJsonStorage(CALIBRATION_APPLIED_STORAGE_KEY, calibrationAppliedByMap);
        }

        function getCalibrationArtifact() {
            return defaultConfig && defaultConfig.calibration ? defaultConfig.calibration : {};
        }

        function getArtifactQualityStatus(artifact = {}) {
            const sourceSummary = artifact && artifact.source_summary ? artifact.source_summary : {};
            const qualityStatus = artifact && artifact.quality_status ? artifact.quality_status : {};
            return {
                alpha_counts: qualityStatus.alpha_counts
                    || ((sourceSummary.battle_sample_count || 0) > 0 ? "sample_backed" : "fallback_only"),
                value_model_base_items: qualityStatus.value_model_base_items
                    || ((sourceSummary.catalog_batch_count || 0) > 0 ? "catalog_backed" : "fallback_only")
            };
        }

        function getMapCountPriorAuthorityStatus(entry = null) {
            if (entry && entry.count_prior_calibration && entry.count_prior_calibration.authority_status) {
                return entry.count_prior_calibration.authority_status;
            }
            return entry && entry.count_prior_calibration && (entry.count_prior_calibration.battle_sample_count || 0) > 0
                ? "sample_backed"
                : "fallback_only";
        }

        function getMapValueModelAuthorityStatus(entry = null) {
            if (entry && entry.value_model_calibration && entry.value_model_calibration.authority_status) {
                return entry.value_model_calibration.authority_status;
            }
            return entry && entry.value_model_calibration && (entry.value_model_calibration.catalog_batch_count || 0) > 0
                ? "catalog_backed"
                : "fallback_only";
        }

        function getSettlementSamples() {
            return typeof loadSettlementSamplesFromRuntime === "function"
                ? loadSettlementSamplesFromRuntime()
                : [];
        }

        function buildSettlementSampleSummary(mapId) {
            const samples = getSettlementSamples();
            const stats = typeof buildSettlementSampleStatsFromRuntime === "function"
                ? buildSettlementSampleStatsFromRuntime(samples)
                : { sample_count: samples.length, average_loot_value: null };
            const currentMapSamples = samples.filter((sample) => sample && sample.map_id === mapId);
            const currentMapStats = typeof buildSettlementSampleStatsFromRuntime === "function"
                ? buildSettlementSampleStatsFromRuntime(currentMapSamples)
                : { sample_count: currentMapSamples.length };
            const currentMapAuthorityReadySamples = currentMapSamples.filter((sample) => (
                typeof isAuthorityReadySettlementSampleFromRuntime === "function"
                    ? isAuthorityReadySettlementSampleFromRuntime(sample)
                    : false
            ));
            const currentMapCountFitReadySamples = currentMapSamples.filter((sample) => (
                typeof isCountFitReadySettlementSampleFromRuntime === "function"
                    ? isCountFitReadySettlementSampleFromRuntime(sample)
                    : false
            ));
            const currentMapAuthorityExportedSamples = currentMapAuthorityReadySamples.filter((sample) => (
                typeof isSettlementSampleAuthorityExportedFromRuntime === "function"
                    ? isSettlementSampleAuthorityExportedFromRuntime(sample)
                    : false
            ));
            const currentMapUnreadyReasonCounts = {
                missing_observed_state: 0,
                missing_actual_counts: 0
            };
            const currentMapCountFitUnreadyReasonCounts = {
                missing_observed_state: 0,
                missing_full_actual_counts: 0
            };
            let currentMapLatestAuthorityExportMeta = null;
            const mapIds = Object.keys(currentConfig && currentConfig.maps ? currentConfig.maps : {});
            const collectionProgress = typeof buildSettlementCollectionProgressFromRuntime === "function"
                ? buildSettlementCollectionProgressFromRuntime(samples, mapIds)
                : null;
            const currentMapCollectionProgress = collectionProgress && collectionProgress.maps
                ? collectionProgress.maps[mapId] || null
                : null;
            const latestCreatedAt = samples
                .map((sample) => sample && sample.created_at ? String(sample.created_at) : "")
                .filter(Boolean)
                .sort()
                .slice(-1)[0] || null;

            currentMapSamples.forEach((sample) => {
                const readiness = typeof getSettlementSampleAuthorityReadinessFromRuntime === "function"
                    ? getSettlementSampleAuthorityReadinessFromRuntime(sample)
                    : { ready: false, missing_observed_state: true, missing_actual_counts: true };
                if (readiness.ready) return;
                if (readiness.missing_observed_state) currentMapUnreadyReasonCounts.missing_observed_state += 1;
                if (readiness.missing_actual_counts) currentMapUnreadyReasonCounts.missing_actual_counts += 1;
            });
            currentMapSamples.forEach((sample) => {
                const readiness = typeof getSettlementSampleCountFitReadinessFromRuntime === "function"
                    ? getSettlementSampleCountFitReadinessFromRuntime(sample)
                    : { ready: false, missing_observed_state: true, missing_full_actual_counts: true };
                if (readiness.ready) return;
                if (readiness.missing_observed_state) currentMapCountFitUnreadyReasonCounts.missing_observed_state += 1;
                if (readiness.missing_full_actual_counts) currentMapCountFitUnreadyReasonCounts.missing_full_actual_counts += 1;
            });
            currentMapAuthorityExportedSamples.forEach((sample) => {
                const exportMeta = typeof getSettlementSampleAuthorityExportMetaFromRuntime === "function"
                    ? getSettlementSampleAuthorityExportMetaFromRuntime(sample)
                    : null;
                if (!exportMeta) return;
                if (
                    !currentMapLatestAuthorityExportMeta
                    || String(exportMeta.exported_at).localeCompare(String(currentMapLatestAuthorityExportMeta.exported_at)) > 0
                ) {
                    currentMapLatestAuthorityExportMeta = exportMeta;
                }
            });

            return {
                sample_count: stats.sample_count || 0,
                current_map_sample_count: currentMapSamples.length,
                authority_ready_sample_count: stats.authority_ready_sample_count || 0,
                authority_exported_sample_count: stats.authority_exported_sample_count || 0,
                authority_pending_export_sample_count: stats.authority_pending_export_sample_count || 0,
                count_fit_ready_sample_count: stats.count_fit_ready_sample_count || 0,
                latest_authority_exported_at: stats.latest_authority_exported_at || null,
                latest_authority_export_scope: stats.latest_authority_export_scope || null,
                latest_authority_export_batch_id: stats.latest_authority_export_batch_id || null,
                latest_authority_export_sample_count: stats.latest_authority_export_sample_count || null,
                system_hint_sample_count: stats.system_hint_sample_count || 0,
                system_hint_scored_sample_count: stats.system_hint_scored_sample_count || 0,
                current_map_authority_ready_sample_count: currentMapAuthorityReadySamples.length,
                current_map_count_fit_ready_sample_count: currentMapCountFitReadySamples.length,
                current_map_authority_exported_sample_count: currentMapAuthorityExportedSamples.length,
                current_map_authority_pending_export_sample_count: Math.max(0, currentMapAuthorityReadySamples.length - currentMapAuthorityExportedSamples.length),
                current_map_system_hint_sample_count: currentMapStats.system_hint_sample_count || 0,
                current_map_system_hint_scored_sample_count: currentMapStats.system_hint_scored_sample_count || 0,
                current_map_latest_authority_exported_at: currentMapLatestAuthorityExportMeta ? currentMapLatestAuthorityExportMeta.exported_at : null,
                current_map_latest_authority_export_scope: currentMapLatestAuthorityExportMeta ? currentMapLatestAuthorityExportMeta.scope : null,
                current_map_latest_authority_export_batch_id: currentMapLatestAuthorityExportMeta ? currentMapLatestAuthorityExportMeta.batch_id : null,
                current_map_latest_authority_export_sample_count: currentMapLatestAuthorityExportMeta ? currentMapLatestAuthorityExportMeta.sample_count : null,
                current_map_unready_reason_counts: currentMapUnreadyReasonCounts,
                current_map_count_fit_unready_reason_counts: currentMapCountFitUnreadyReasonCounts,
                current_map_collection_progress: currentMapCollectionProgress,
                collection_progress: collectionProgress,
                next_count_fit_map_id: collectionProgress ? collectionProgress.next_map_id : null,
                average_loot_value: stats.average_loot_value,
                latest_created_at: latestCreatedAt
            };
        }

        function getCurrentMapSettlementSamples(mapId) {
            return getSettlementSamples()
                .filter((sample) => sample && sample.map_id === mapId)
                .sort((left, right) => String(right && right.created_at || "").localeCompare(String(left && left.created_at || "")));
        }

        function buildCurrentMapSampleFilterOptions(mapId) {
            const mapSamples = getCurrentMapSettlementSamples(mapId);
            const pendingSamples = mapSamples.filter((sample) => (
                typeof isSettlementSampleAuthorityExportedFromRuntime === "function"
                    ? !isSettlementSampleAuthorityExportedFromRuntime(sample)
                    : true
            ));
            const batchMap = new Map();

            mapSamples.forEach((sample) => {
                const exportMeta = typeof getSettlementSampleAuthorityExportMetaFromRuntime === "function"
                    ? getSettlementSampleAuthorityExportMetaFromRuntime(sample)
                    : null;
                if (!exportMeta || !exportMeta.batch_id) return;
                const current = batchMap.get(exportMeta.batch_id) || {
                    batch_id: exportMeta.batch_id,
                    scope: exportMeta.scope,
                    exported_at: exportMeta.exported_at,
                    count: 0
                };
                current.count += 1;
                if (String(exportMeta.exported_at).localeCompare(String(current.exported_at)) > 0) {
                    current.exported_at = exportMeta.exported_at;
                    current.scope = exportMeta.scope;
                }
                batchMap.set(exportMeta.batch_id, current);
            });

            return [
                { value: "all", label: `全部样本 (${mapSamples.length})` },
                { value: "pending_export", label: `未导出 (${pendingSamples.length})` }
            ].concat(
                Array.from(batchMap.values())
                    .sort((left, right) => String(right.exported_at).localeCompare(String(left.exported_at)))
                    .map((entry) => ({
                        value: `batch:${entry.batch_id}`,
                        label: `${entry.batch_id} (${entry.count}条)`
                    }))
            );
        }

        function getSelectedCalibrationSampleFilter(mapId) {
            const options = buildCurrentMapSampleFilterOptions(mapId);
            const selected = calibrationSampleFilterByMap[mapId];
            const nextValue = options.some((option) => option.value === selected) ? selected : "all";
            calibrationSampleFilterByMap[mapId] = nextValue;
            return nextValue;
        }

        function getSelectedCalibrationSampleFilterDescriptor(mapId) {
            const options = buildCurrentMapSampleFilterOptions(mapId);
            const value = getSelectedCalibrationSampleFilter(mapId);
            return options.find((option) => option.value === value) || options[0] || { value: "all", label: "全部样本" };
        }

        function setSelectedCalibrationSampleFilter(mapId, filterValue) {
            if (!mapId) return;
            calibrationSampleFilterByMap[mapId] = filterValue || "all";
        }

        function getFilteredCurrentMapSettlementSamples(mapId) {
            const filterValue = getSelectedCalibrationSampleFilter(mapId);
            const mapSamples = getCurrentMapSettlementSamples(mapId);
            if (filterValue === "pending_export") {
                return mapSamples.filter((sample) => (
                    typeof isSettlementSampleAuthorityExportedFromRuntime === "function"
                        ? !isSettlementSampleAuthorityExportedFromRuntime(sample)
                        : true
                ));
            }
            if (filterValue.startsWith("batch:")) {
                const batchId = filterValue.slice("batch:".length);
                return mapSamples.filter((sample) => {
                    const exportMeta = typeof getSettlementSampleAuthorityExportMetaFromRuntime === "function"
                        ? getSettlementSampleAuthorityExportMetaFromRuntime(sample)
                        : null;
                    return exportMeta && exportMeta.batch_id === batchId;
                });
            }
            return mapSamples;
        }

        function setSelectedCalibrationSample(mapId, sampleId) {
            if (!mapId) return;
            if (!sampleId) {
                delete calibrationSelectedSampleByMap[mapId];
                return;
            }
            calibrationSelectedSampleByMap[mapId] = sampleId;
        }

        function getSelectedCalibrationSample(mapId) {
            const mapSamples = getFilteredCurrentMapSettlementSamples(mapId);
            if (!mapSamples.length) return null;
            const selected = mapSamples.find((sample) => sample.id === calibrationSelectedSampleByMap[mapId]) || mapSamples[0];
            setSelectedCalibrationSample(mapId, selected.id);
            return selected;
        }

        function buildReviewedActualCounts() {
            const actualCounts = {};
            CALIBRATION_QUALITY_ORDER.forEach((quality) => {
                const input = document.getElementById(`calibration-review-actual-count-${quality}`);
                const numeric = parseLooseNumber(input ? input.value : null);
                if (Number.isInteger(numeric) && numeric >= 0) actualCounts[quality] = numeric;
            });
            return actualCounts;
        }

        function saveCalibrationSampleReview(mapId, sampleId) {
            if (!sampleId || typeof updateSettlementSampleByIdFromRuntime !== "function") {
                setCalibrationPanelStatus("当前运行时不支持保存样本校对。");
                return;
            }
            const actualValueInput = document.getElementById("calibration-review-actual-value");
            const actualCellsInput = document.getElementById("calibration-review-actual-cells");
            const updated = updateSettlementSampleByIdFromRuntime(sampleId, {
                actual_counts: buildReviewedActualCounts(),
                actual_value: parseLooseNumber(actualValueInput ? actualValueInput.value : null),
                actual_cells: parseLooseNumber(actualCellsInput ? actualCellsInput.value : null),
                metadata: {
                    reviewed_in_panel: true
                }
            });
            if (!updated) {
                setCalibrationPanelStatus("未找到要更新的本地样本。");
                return;
            }
            setSelectedCalibrationSample(mapId, updated.id);
            const readiness = typeof getSettlementSampleAuthorityReadinessFromRuntime === "function"
                ? getSettlementSampleAuthorityReadinessFromRuntime(updated)
                : { ready: false };
            const countFitReadiness = typeof getSettlementSampleCountFitReadinessFromRuntime === "function"
                ? getSettlementSampleCountFitReadinessFromRuntime(updated)
                : { ready: false };
            setCalibrationPanelStatus(
                countFitReadiness.ready
                    ? "已更新本地样本校对，并进入权重拟合可用统计。"
                    : readiness.ready
                    ? "已更新本地样本校对，并进入 authority-ready 统计。"
                    : "已更新本地样本校对；仍缺少进入 authority-ready 或权重拟合所需字段。"
            );
            renderCalibrationPanel();
        }

        function deleteCalibrationSampleReview(mapId, sampleId) {
            if (!sampleId || typeof removeSettlementSampleByIdFromRuntime !== "function") {
                setCalibrationPanelStatus("当前运行时不支持删除本地样本。");
                return;
            }
            removeSettlementSampleByIdFromRuntime(sampleId);
            setSelectedCalibrationSample(mapId, null);
            setCalibrationPanelStatus("已删除当前本地样本。");
            renderCalibrationPanel();
        }

        function readScreenshotFileAsDataUrl(file) {
            if (!file) return Promise.reject(new Error("未选择截图文件。"));
            if (typeof file.data_url === "string" && file.data_url) return Promise.resolve(file.data_url);
            if (typeof FileReader !== "undefined") {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
                    reader.onerror = () => reject(new Error("截图读取失败。"));
                    reader.readAsDataURL(file);
                });
            }
            return Promise.reject(new Error("当前浏览器不支持读取截图文件。"));
        }

        function getScreenshotFileNumber(file, key) {
            if (!file || file[key] === null || file[key] === undefined) return null;
            const numeric = Number(file[key]);
            return Number.isFinite(numeric) ? numeric : null;
        }

        function getScreenshotFileText(file, key) {
            if (!file || file[key] === null || file[key] === undefined) return "";
            return String(file[key]).trim();
        }

        function buildBaseScreenshotAttachment(file, dataUrl) {
            return {
                name: getScreenshotFileText(file, "name") || "settlement-screenshot",
                type: getScreenshotFileText(file, "type") || "application/octet-stream",
                size: getScreenshotFileNumber(file, "size"),
                last_modified: getScreenshotFileNumber(file, "lastModified"),
                data_url: dataUrl
            };
        }

        function buildPreencodedScreenshotAttachment(file, dataUrl) {
            const thumbnailDataUrl = getScreenshotFileText(file, "thumbnail_data_url") || getScreenshotFileText(file, "thumbnailDataUrl");
            if (!thumbnailDataUrl) return null;
            return {
                ...buildBaseScreenshotAttachment(file, dataUrl),
                thumbnail_data_url: thumbnailDataUrl,
                thumbnail_type: getScreenshotFileText(file, "thumbnail_type") || getScreenshotFileText(file, "thumbnailType") || "image/jpeg",
                thumbnail_size: getScreenshotFileNumber(file, "thumbnail_size") ?? getScreenshotFileNumber(file, "thumbnailSize"),
                original_width: getScreenshotFileNumber(file, "original_width") ?? getScreenshotFileNumber(file, "originalWidth"),
                original_height: getScreenshotFileNumber(file, "original_height") ?? getScreenshotFileNumber(file, "originalHeight"),
                stored_width: getScreenshotFileNumber(file, "stored_width") ?? getScreenshotFileNumber(file, "storedWidth"),
                stored_height: getScreenshotFileNumber(file, "stored_height") ?? getScreenshotFileNumber(file, "storedHeight"),
                compression: {
                    applied: true,
                    method: "preencoded",
                    max_dimension: SETTLEMENT_SCREENSHOT_MAX_DIMENSION,
                    quality: SETTLEMENT_SCREENSHOT_JPEG_QUALITY
                }
            };
        }

        function loadImageFromDataUrl(dataUrl) {
            const ImageCtor = typeof Image !== "undefined" ? Image : (typeof window !== "undefined" ? window.Image : null);
            if (!ImageCtor) return Promise.reject(new Error("当前浏览器不支持截图压缩。"));
            return new Promise((resolve, reject) => {
                const image = new ImageCtor();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error("截图压缩失败。"));
                image.src = dataUrl;
            });
        }

        function compressScreenshotAttachment(file, dataUrl) {
            const preencodedAttachment = buildPreencodedScreenshotAttachment(file, dataUrl);
            if (preencodedAttachment) return preencodedAttachment;
            const baseAttachment = buildBaseScreenshotAttachment(file, dataUrl);
            if (!dataUrl || !/^data:image\//.test(dataUrl) || typeof document === "undefined" || typeof document.createElement !== "function") {
                return baseAttachment;
            }
            return loadImageFromDataUrl(dataUrl)
                .then((image) => {
                    const originalWidth = Number(image.naturalWidth || image.width);
                    const originalHeight = Number(image.naturalHeight || image.height);
                    if (!Number.isFinite(originalWidth) || !Number.isFinite(originalHeight) || originalWidth <= 0 || originalHeight <= 0) {
                        return baseAttachment;
                    }
                    const scale = Math.min(1, SETTLEMENT_SCREENSHOT_MAX_DIMENSION / Math.max(originalWidth, originalHeight));
                    const storedWidth = Math.max(1, Math.round(originalWidth * scale));
                    const storedHeight = Math.max(1, Math.round(originalHeight * scale));
                    const canvas = document.createElement("canvas");
                    if (!canvas || typeof canvas.getContext !== "function" || typeof canvas.toDataURL !== "function") return baseAttachment;
                    canvas.width = storedWidth;
                    canvas.height = storedHeight;
                    const context = canvas.getContext("2d");
                    if (!context || typeof context.drawImage !== "function") return baseAttachment;
                    context.drawImage(image, 0, 0, storedWidth, storedHeight);
                    return {
                        ...baseAttachment,
                        thumbnail_data_url: canvas.toDataURL("image/jpeg", SETTLEMENT_SCREENSHOT_JPEG_QUALITY),
                        thumbnail_type: "image/jpeg",
                        original_width: originalWidth,
                        original_height: originalHeight,
                        stored_width: storedWidth,
                        stored_height: storedHeight,
                        compression: {
                            applied: true,
                            method: "canvas",
                            max_dimension: SETTLEMENT_SCREENSHOT_MAX_DIMENSION,
                            quality: SETTLEMENT_SCREENSHOT_JPEG_QUALITY
                        }
                    };
                })
                .catch(() => baseAttachment);
        }

        function validateUsableScreenshotAttachment(attachment) {
            if (!attachment || typeof attachment !== "object") return attachment;
            const width = getScreenshotFileNumber(attachment, "stored_width")
                ?? getScreenshotFileNumber(attachment, "storedWidth")
                ?? getScreenshotFileNumber(attachment, "original_width")
                ?? getScreenshotFileNumber(attachment, "originalWidth");
            const height = getScreenshotFileNumber(attachment, "stored_height")
                ?? getScreenshotFileNumber(attachment, "storedHeight")
                ?? getScreenshotFileNumber(attachment, "original_height")
                ?? getScreenshotFileNumber(attachment, "originalHeight");
            if (
                width !== null
                && height !== null
                && (width < SETTLEMENT_SCREENSHOT_MIN_WIDTH || height < SETTLEMENT_SCREENSHOT_MIN_HEIGHT)
            ) {
                throw new Error(`截图尺寸过小（${width}x${height}），请重新截取完整仓库画面。`);
            }
            return attachment;
        }

        function attachScreenshotToCalibrationSample(mapId, sampleId, file) {
            if (!sampleId || typeof attachSettlementSampleScreenshotFromRuntime !== "function") {
                setCalibrationPanelStatus("当前运行时不支持绑定截图。");
                return Promise.resolve(null);
            }
            return readScreenshotFileAsDataUrl(file)
                .then((dataUrl) => compressScreenshotAttachment(file, dataUrl))
                .then((attachment) => validateUsableScreenshotAttachment(attachment))
                .then((attachment) => {
                    const updated = attachSettlementSampleScreenshotFromRuntime(sampleId, attachment);
                    if (!updated) {
                        setCalibrationPanelStatus("绑定截图失败：未找到当前样本。");
                        return null;
                    }
                    setSelectedCalibrationSample(mapId, updated.id);
                    setCalibrationPanelStatus(`已绑定结算截图 ${updated.metadata.screenshot_attachment.name}；清空样本前会随 raw backup 一起导出。`);
                    renderCalibrationPanel();
                    return updated;
                })
                .catch((error) => {
                    setCalibrationPanelStatus(`绑定截图失败：${error.message}`);
                    return null;
                });
        }

        function getClipboardReadApi() {
            const candidates = [
                typeof navigator !== "undefined" ? navigator : null,
                typeof window !== "undefined" ? window.navigator : null
            ];
            const navigatorRef = candidates.find((candidate) => (
                candidate
                && candidate.clipboard
                && typeof candidate.clipboard.read === "function"
            ));
            return navigatorRef ? navigatorRef.clipboard : null;
        }

        function getClipboardImageExtension(mimeType) {
            const normalizedType = String(mimeType || "").toLowerCase();
            if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return "jpg";
            if (normalizedType.includes("webp")) return "webp";
            if (normalizedType.includes("gif")) return "gif";
            return "png";
        }

        function prepareClipboardImageFile(blob, mimeType) {
            const resolvedType = getScreenshotFileText(blob, "type") || mimeType || "image/png";
            const fallbackName = `clipboard-screenshot.${getClipboardImageExtension(resolvedType)}`;
            if (blob && typeof blob === "object" && (
                getScreenshotFileText(blob, "data_url")
                || getScreenshotFileText(blob, "dataUrl")
                || getScreenshotFileText(blob, "thumbnail_data_url")
                || getScreenshotFileText(blob, "thumbnailDataUrl")
            )) {
                return {
                    ...blob,
                    name: getScreenshotFileText(blob, "name") || fallbackName,
                    type: resolvedType,
                    lastModified: getScreenshotFileNumber(blob, "lastModified") || Date.now()
                };
            }
            if (typeof File !== "undefined") {
                return new File([blob], fallbackName, {
                    type: resolvedType,
                    lastModified: Date.now()
                });
            }
            if (blob && typeof blob === "object") {
                try {
                    if (!getScreenshotFileText(blob, "name")) blob.name = fallbackName;
                    if (!getScreenshotFileText(blob, "type")) blob.type = resolvedType;
                    if (!getScreenshotFileNumber(blob, "lastModified")) blob.lastModified = Date.now();
                } catch (_error) {
                    return {
                        name: fallbackName,
                        type: resolvedType,
                        size: getScreenshotFileNumber(blob, "size"),
                        lastModified: Date.now(),
                        blob
                    };
                }
                return blob;
            }
            return {
                name: fallbackName,
                type: resolvedType,
                lastModified: Date.now()
            };
        }

        function readClipboardImageFile() {
            const clipboard = getClipboardReadApi();
            if (!clipboard) {
                return Promise.reject(new Error("当前浏览器不支持读取剪贴板图片。"));
            }
            return Promise.resolve()
                .then(() => clipboard.read())
                .then((items) => {
                    const clipboardItems = Array.isArray(items) ? items : Array.from(items || []);
                    for (const item of clipboardItems) {
                        const types = Array.isArray(item && item.types) ? item.types : Array.from((item && item.types) || []);
                        const imageType = types.find((type) => /^image\//i.test(String(type || "")));
                        if (!imageType || !item || typeof item.getType !== "function") continue;
                        return Promise.resolve(item.getType(imageType))
                            .then((blob) => prepareClipboardImageFile(blob, imageType));
                    }
                    throw new Error("剪贴板里没有图片。请先截图复制到剪贴板。");
                });
        }

        function buildBattleCaptureFilename(mapId, timestampSlug) {
            return `auction-king-battle-capture-${sanitizeReplayFilterSlug(mapId || "unknown")}-${timestampSlug}.json`;
        }

        function buildCurrentEngineCacheKey(resolvedConfig = null, state = workspaceState) {
            const targetConfig = resolvedConfig || getResolvedConfigForSelection(state && state.active_map_id);
            const stateVars = {
                template_id: state && state.active_template_id,
                field_values: state && state.field_values ? state.field_values : {},
                field_value_meta: state && state.field_value_meta ? state.field_value_meta : {}
            };
            return typeof buildEngineCacheKey === "function"
                ? buildEngineCacheKey(targetConfig, stateVars)
                : JSON.stringify({
                    map: state && state.active_map_id,
                    template: state && state.active_template_id,
                    field_values: stateVars.field_values,
                    field_value_meta: stateVars.field_value_meta
                });
        }

        function buildUnavailableAnalysisSnapshot(reason, cacheKey = null) {
            return {
                status: "missing",
                reason,
                cache_key: cacheKey
            };
        }

        function buildCurrentAnalysisSnapshotForCapture() {
            const currentCacheKey = buildCurrentEngineCacheKey();
            if (
                !latestAnalysisSnapshot
                || latestAnalysisSnapshot.status !== "available"
                || latestAnalysisSnapshot.cache_key !== currentCacheKey
            ) {
                return buildUnavailableAnalysisSnapshot(latestAnalysisSnapshot ? "stale_analysis" : "no_current_analysis", currentCacheKey);
            }
            return cloneValue(latestAnalysisSnapshot);
        }

        function buildScreenshotAttachmentSummary(attachment) {
            if (!attachment || typeof attachment !== "object") return null;
            const summary = cloneValue(attachment);
            delete summary.data_url;
            delete summary.dataUrl;
            delete summary.base64;
            delete summary.image_data_url;
            delete summary.blob;
            return summary;
        }

        function buildCurrentBattleCapturePayload(screenshotAttachment, captureContext = {}) {
            const fieldValues = cloneValue(workspaceState.field_values || {});
            const fieldValueMeta = cloneValue(workspaceState.field_value_meta || {});
            const activeTemplate = getActiveTemplate();
            const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
            const activeMap = currentConfig && currentConfig.maps ? currentConfig.maps[mapId] : null;
            const analysisSnapshot = buildCurrentAnalysisSnapshotForCapture();
            const posteriorRisk = analysisSnapshot && analysisSnapshot.posterior_risk
                ? analysisSnapshot.posterior_risk
                : null;
            const observedState = typeof buildLegacyEstimatorStateFromFieldValuesFromRuntime === "function"
                ? buildLegacyEstimatorStateFromFieldValuesFromRuntime(fieldValues, fieldValueMeta)
                : {};
            const normalizedAttachment = typeof normalizeSettlementScreenshotAttachmentFromRuntime === "function"
                ? normalizeSettlementScreenshotAttachmentFromRuntime(screenshotAttachment)
                : screenshotAttachment;
            const nonEmptyFieldValues = Object.values(fieldValues)
                .filter((value) => value !== null && value !== undefined && value !== "").length;
            const screenshotError = captureContext && captureContext.screenshot_error
                ? String(captureContext.screenshot_error)
                : null;
            const screenshotStatus = normalizedAttachment
                ? "attached"
                : (captureContext && captureContext.screenshot_status ? String(captureContext.screenshot_status) : "missing");
            const settlementSample = typeof createSettlementSampleFromWorkspaceCaptureFromRuntime === "function"
                ? createSettlementSampleFromWorkspaceCaptureFromRuntime({
                    map_id: mapId,
                    field_values: fieldValues,
                    field_value_meta: fieldValueMeta,
                    source_kind: "workspace_clipboard_capture",
                    metadata: {
                        capture_source: "workspace_clipboard_screenshot",
                        screenshot_attachment_ref: normalizedAttachment ? "$.screenshot_attachment" : null,
                        screenshot_attachment_summary: buildScreenshotAttachmentSummary(normalizedAttachment)
                    }
                })
                : null;

            return {
                schema_version: "ak_battle_clipboard_capture_v1",
                export_kind: "battle_input_clipboard_screenshot",
                exported_at: new Date().toISOString(),
                map_id: mapId,
                template_id: workspaceState.active_template_id || currentConfig.app.default_template_id,
                template_label: activeTemplate && activeTemplate.label ? activeTemplate.label : null,
                config_source_version: currentConfig.app ? currentConfig.app.config_source_version || null : null,
                capture_context: {
                    capture_source: "workspace_clipboard_screenshot",
                    screenshot_status: screenshotStatus,
                    screenshot_error: screenshotError,
                    map_id: mapId,
                    map_label: activeMap && (activeMap.label || activeMap.map_name) ? (activeMap.label || activeMap.map_name) : null,
                    template_id: workspaceState.active_template_id || currentConfig.app.default_template_id,
                    template_label: activeTemplate && activeTemplate.label ? activeTemplate.label : null,
                    config_source_version: currentConfig.app ? currentConfig.app.config_source_version || null : null,
                    analysis_status: analysisSnapshot.status,
                    analysis_phase: analysisSnapshot.status === "available" ? analysisSnapshot.phase : null,
                    analysis_cache_key: analysisSnapshot.cache_key || null,
                    posterior_risk_status: posteriorRisk ? posteriorRisk.status : null,
                    posterior_risk_flags: posteriorRisk && Array.isArray(posteriorRisk.flags) ? cloneValue(posteriorRisk.flags) : [],
                    posterior_risk_warning_count: posteriorRisk && Array.isArray(posteriorRisk.warnings) ? posteriorRisk.warnings.length : 0,
                    field_value_count: Object.keys(fieldValues).length,
                    non_empty_field_value_count: nonEmptyFieldValues
                },
                field_values: fieldValues,
                field_value_meta: fieldValueMeta,
                observed_state: observedState && typeof observedState === "object" ? observedState : {},
                analysis_snapshot: analysisSnapshot,
                screenshot_attachment: normalizedAttachment,
                settlement_sample: settlementSample
            };
        }

        function saveClipboardScreenshotCapture() {
            if (!saveClipboardScreenshotButton) return Promise.resolve(null);
            saveClipboardScreenshotButton.disabled = true;
            if (workspaceSaveStatus) setElementText(workspaceSaveStatus, "正在读取剪贴板截图并打包本局输入。");
            return readClipboardImageFile()
                .then((file) => readScreenshotFileAsDataUrl(file)
                    .then((dataUrl) => compressScreenshotAttachment(file, dataUrl))
                    .then((attachment) => validateUsableScreenshotAttachment(attachment)))
                .then((attachment) => ({ attachment, screenshotError: null }))
                .catch((error) => ({
                    attachment: null,
                    screenshotError: error && error.message ? error.message : String(error)
                }))
                .then(({ attachment, screenshotError }) => {
                    const payload = buildCurrentBattleCapturePayload(attachment, {
                        screenshot_status: attachment ? "attached" : "missing",
                        screenshot_error: screenshotError
                    });
                    const timestampSlug = createExportTimestampSlug();
                    const filename = buildBattleCaptureFilename(payload.map_id, timestampSlug);
                    const downloaded = downloadJsonFile(filename, payload);
                    if (!downloaded) throw new Error("浏览器未允许下载本局包。");
                    if (workspaceSaveStatus) {
                        if (payload.screenshot_attachment && payload.screenshot_attachment.name) {
                            setElementText(workspaceSaveStatus, `已下载本局输入和剪贴板截图 ${payload.screenshot_attachment.name}；当前输入未清空。`);
                        } else {
                            setElementText(workspaceSaveStatus, "已下载本局输入；剪贴板截图未包含，当前输入未清空。");
                        }
                    }
                    return payload;
                })
                .catch((error) => {
                    if (workspaceSaveStatus) {
                        setElementText(workspaceSaveStatus, `截图后保存失败：${error.message}`);
                    }
                    return null;
                })
                .finally(() => {
                    saveClipboardScreenshotButton.disabled = false;
                });
        }

        function renderCalibrationSampleReviewPanel(mapId) {
            if (!calibrationSampleReview) return;
            clearElementContent(calibrationSampleReview);
            const mapSamples = getCurrentMapSettlementSamples(mapId);
            if (!mapSamples.length) {
                const empty = document.createElement("div");
                empty.className = "calibration-grid-readonly";
                empty.textContent = "当前地图暂无本地样本。先保存当前输入为样本，或导入结算样本。";
                calibrationSampleReview.appendChild(empty);
                return;
            }

            const filterRow = document.createElement("div");
            filterRow.className = "calibration-grid-row";
            const filterLabel = document.createElement("div");
            filterLabel.className = "calibration-grid-label";
            filterLabel.textContent = "筛选";
            const filterSelect = document.createElement("select");
            filterSelect.id = "calibration-review-batch-filter";
            buildCurrentMapSampleFilterOptions(mapId).forEach((optionEntry) => {
                const option = document.createElement("option");
                option.value = optionEntry.value;
                option.innerText = optionEntry.label;
                filterSelect.appendChild(option);
            });
            filterSelect.value = getSelectedCalibrationSampleFilter(mapId);
            filterSelect.addEventListener("change", (event) => {
                setSelectedCalibrationSampleFilter(mapId, event.currentTarget.value);
                renderCalibrationPanel();
            });
            const filterHint = document.createElement("div");
            filterHint.className = "calibration-grid-readonly";
            filterHint.textContent = "按未导出或导出批次回看";
            filterRow.appendChild(filterLabel);
            filterRow.appendChild(filterSelect);
            filterRow.appendChild(filterHint);
            calibrationSampleReview.appendChild(filterRow);

            const selectedSample = getSelectedCalibrationSample(mapId);
            if (!selectedSample) {
                const empty = document.createElement("div");
                empty.className = "calibration-grid-readonly";
                empty.textContent = "当前筛选下暂无本地样本。";
                calibrationSampleReview.appendChild(empty);
                return;
            }

            const reviewRow = document.createElement("div");
            reviewRow.className = "calibration-grid-row";
            const reviewLabel = document.createElement("div");
            reviewLabel.className = "calibration-grid-label";
            reviewLabel.textContent = "样本";
            const reviewSelect = document.createElement("select");
            reviewSelect.id = "calibration-review-sample-select";
            getFilteredCurrentMapSettlementSamples(mapId).forEach((sample) => {
                const option = document.createElement("option");
                option.value = sample.id;
                option.innerText = `${sample.created_at || sample.id} / ${sample.source_kind || "unknown"}`;
                reviewSelect.appendChild(option);
            });
            reviewSelect.value = selectedSample.id;
            reviewSelect.addEventListener("change", (event) => {
                setSelectedCalibrationSample(mapId, event.currentTarget.value);
                renderCalibrationPanel();
            });
            const reviewHint = document.createElement("div");
            reviewHint.className = "calibration-grid-readonly";
            const readiness = typeof getSettlementSampleAuthorityReadinessFromRuntime === "function"
                ? getSettlementSampleAuthorityReadinessFromRuntime(selectedSample)
                : { ready: false };
            const exported = readiness.ready && typeof isSettlementSampleAuthorityExportedFromRuntime === "function"
                ? isSettlementSampleAuthorityExportedFromRuntime(selectedSample)
                : false;
            const exportMeta = exported && typeof getSettlementSampleAuthorityExportMetaFromRuntime === "function"
                ? getSettlementSampleAuthorityExportMetaFromRuntime(selectedSample)
                : null;
            reviewHint.textContent = readiness.ready
                ? `authority-ready / ${exported ? `已导出 ${exportMeta && exportMeta.scope ? `${exportMeta.scope} @ ${exportMeta.exported_at} / batch ${exportMeta.batch_id || "unknown"} / ${exportMeta.sample_count || 0}条` : ""}`.trim() : "未导出"}`
                : "待补实际数量";
            const countFitReadiness = typeof getSettlementSampleCountFitReadinessFromRuntime === "function"
                ? getSettlementSampleCountFitReadinessFromRuntime(selectedSample)
                : { ready: false, missing_quality_counts: [] };
            if (readiness.ready && !countFitReadiness.ready) {
                const missingQualities = Array.isArray(countFitReadiness.missing_quality_counts)
                    ? countFitReadiness.missing_quality_counts.join("/")
                    : "-";
                reviewHint.textContent += ` / 权重拟合缺 ${missingQualities}`;
            } else if (countFitReadiness.ready) {
                reviewHint.textContent += " / 权重拟合可用";
            }
            reviewRow.appendChild(reviewLabel);
            reviewRow.appendChild(reviewSelect);
            reviewRow.appendChild(reviewHint);
            calibrationSampleReview.appendChild(reviewRow);

            CALIBRATION_QUALITY_ORDER.forEach((quality) => {
                const row = document.createElement("div");
                row.className = "calibration-grid-row";
                const label = document.createElement("div");
                label.className = "calibration-grid-label";
                label.textContent = `${CALIBRATION_QUALITY_LABELS[quality]} 实际数量`;
                const input = document.createElement("input");
                input.id = `calibration-review-actual-count-${quality}`;
                configureAppNumericInput(input, { step: "1", min: "0" });
                input.value = selectedSample.actual_counts && selectedSample.actual_counts[quality] !== undefined
                    ? String(selectedSample.actual_counts[quality])
                    : "";
                attachNumberWheelStepper(input);
                const hint = document.createElement("div");
                hint.className = "calibration-grid-readonly";
                hint.textContent = "拟合必填";
                row.appendChild(label);
                row.appendChild(input);
                row.appendChild(hint);
                calibrationSampleReview.appendChild(row);
            });

            [
                { id: "calibration-review-actual-value", label: "实际总价值", value: selectedSample.actual_value },
                { id: "calibration-review-actual-cells", label: "实际总格数", value: selectedSample.actual_cells }
            ].forEach((field) => {
                const row = document.createElement("div");
                row.className = "calibration-grid-row";
                const label = document.createElement("div");
                label.className = "calibration-grid-label";
                label.textContent = field.label;
                const input = document.createElement("input");
                input.id = field.id;
                configureAppNumericInput(input, { step: "0.01", min: "0" });
                input.value = field.value === null || field.value === undefined ? "" : String(field.value);
                attachNumberWheelStepper(input);
                const hint = document.createElement("div");
                hint.className = "calibration-grid-readonly";
                hint.textContent = "可选";
                row.appendChild(label);
                row.appendChild(input);
                row.appendChild(hint);
                calibrationSampleReview.appendChild(row);
            });

            const screenshotRow = document.createElement("div");
            screenshotRow.className = "calibration-grid-row";
            const screenshotLabel = document.createElement("div");
            screenshotLabel.className = "calibration-grid-label";
            screenshotLabel.textContent = "结算截图";
            const screenshotInput = document.createElement("input");
            screenshotInput.id = "calibration-review-screenshot-file";
            screenshotInput.type = "file";
            screenshotInput.accept = "image/*";
            screenshotInput.addEventListener("change", (event) => {
                const file = event.currentTarget.files && event.currentTarget.files[0];
                if (!file) return;
                attachScreenshotToCalibrationSample(mapId, selectedSample.id, file);
            });
            const screenshotHint = document.createElement("div");
            screenshotHint.id = "calibration-review-screenshot-hint";
            screenshotHint.className = "calibration-grid-readonly";
            const screenshotAttachment = selectedSample.metadata && selectedSample.metadata.screenshot_attachment
                ? selectedSample.metadata.screenshot_attachment
                : null;
            screenshotHint.textContent = screenshotAttachment && screenshotAttachment.name
                ? `已绑定 ${screenshotAttachment.name}`
                : "可选；随样本 raw backup 导出";
            screenshotRow.appendChild(screenshotLabel);
            screenshotRow.appendChild(screenshotInput);
            screenshotRow.appendChild(screenshotHint);
            calibrationSampleReview.appendChild(screenshotRow);

            const actionRow = document.createElement("div");
            actionRow.className = "calibration-grid-row";
            const actionLabel = document.createElement("div");
            actionLabel.className = "calibration-grid-label";
            actionLabel.textContent = "保存";
            const actionButton = document.createElement("button");
            actionButton.id = "btn-calibration-save-sample-review";
            actionButton.type = "button";
            actionButton.className = "btn secondary small-btn";
            actionButton.innerText = "保存样本校对";
            actionButton.addEventListener("click", () => saveCalibrationSampleReview(mapId, selectedSample.id));
            const deleteButton = document.createElement("button");
            deleteButton.id = "btn-calibration-delete-sample-review";
            deleteButton.type = "button";
            deleteButton.className = "btn secondary small-btn";
            deleteButton.innerText = "删除当前样本";
            deleteButton.addEventListener("click", () => deleteCalibrationSampleReview(mapId, selectedSample.id));
            const actionHint = document.createElement("div");
            actionHint.className = "calibration-grid-readonly";
            actionHint.textContent = "仅更新本地样本";
            actionRow.appendChild(actionLabel);
            actionRow.appendChild(actionButton);
            actionRow.appendChild(deleteButton);
            actionRow.appendChild(actionHint);
            calibrationSampleReview.appendChild(actionRow);
        }

        function getCalibrationMapEntry(mapId) {
            const artifact = getCalibrationArtifact();
            return artifact && artifact.maps ? artifact.maps[mapId] || null : null;
        }

        function getAuthorityCalibrationSnapshot(mapId) {
            const entry = getCalibrationMapEntry(mapId);
            const currentMapConfig = currentConfig && currentConfig.maps ? currentConfig.maps[mapId] || {} : {};
            const authorityValueModel = entry && entry.value_model_calibration && entry.value_model_calibration.value_model
                ? entry.value_model_calibration.value_model
                : currentMapConfig.value_model || {};
            const alphaCounts = entry && entry.count_prior_calibration && entry.count_prior_calibration.alpha_counts
                ? entry.count_prior_calibration.alpha_counts
                : currentMapConfig.alpha_counts || {};

            return {
                map_id: mapId,
                source_artifact_version: getCalibrationArtifact().artifact_version || null,
                generated_at: getCalibrationArtifact().generated_at || null,
                alpha_counts: cloneValue(alphaCounts),
                value_model: Object.fromEntries(CALIBRATION_QUALITY_ORDER.map((quality) => [
                    quality,
                    {
                        base_item_mean: authorityValueModel[quality] ? authorityValueModel[quality].base_item_mean : null,
                        base_item_sd: authorityValueModel[quality] ? authorityValueModel[quality].base_item_sd : null
                    }
                ])),
                cells_per_item: cloneValue(currentMapConfig.cells_per_item || {}),
                battle_sample_count: entry && entry.count_prior_calibration ? entry.count_prior_calibration.battle_sample_count || 0 : 0,
                catalog_batch_count: entry && entry.value_model_calibration ? entry.value_model_calibration.catalog_batch_count || 0 : 0,
                count_prior_status: getMapCountPriorAuthorityStatus(entry),
                value_model_status: getMapValueModelAuthorityStatus(entry)
            };
        }

        function normalizeCalibrationRecord(mapId, payload = {}) {
            const authority = getAuthorityCalibrationSnapshot(mapId);
            const alphaCounts = {};
            CALIBRATION_QUALITY_ORDER.forEach((quality) => {
                const fallback = authority.alpha_counts[quality];
                const rawValue = payload && payload.alpha_counts ? parseLooseNumber(payload.alpha_counts[quality]) : null;
                alphaCounts[quality] = rawValue === null ? fallback : rawValue;
            });

            const valueModel = {};
            CALIBRATION_QUALITY_ORDER.forEach((quality) => {
                const fallback = authority.value_model[quality] || {};
                const rawValueModel = payload && payload.value_model ? payload.value_model[quality] || {} : {};
                const baseItemMean = parseLooseNumber(rawValueModel.base_item_mean);
                const baseItemSd = parseLooseNumber(rawValueModel.base_item_sd);
                valueModel[quality] = {
                    base_item_mean: baseItemMean === null ? fallback.base_item_mean : baseItemMean,
                    base_item_sd: baseItemSd === null ? fallback.base_item_sd : baseItemSd
                };
            });

            return {
                map_id: mapId,
                source_artifact_version: authority.source_artifact_version,
                alpha_counts: alphaCounts,
                value_model: valueModel
            };
        }

        function getCalibrationRecordForMode(mapId, mode = calibrationPanelMode) {
            if (mode === "apply" && calibrationAppliedByMap && calibrationAppliedByMap[mapId]) {
                return normalizeCalibrationRecord(mapId, calibrationAppliedByMap[mapId]);
            }
            if (mode === "draft" && calibrationDraftByMap && calibrationDraftByMap[mapId]) {
                return normalizeCalibrationRecord(mapId, calibrationDraftByMap[mapId]);
            }
            return normalizeCalibrationRecord(mapId, null);
        }

        function applyCalibrationOverridesToConfig(config) {
            const next = JSON.parse(JSON.stringify(config || {}));
            Object.entries(calibrationAppliedByMap || {}).forEach(([mapId, record]) => {
                if (!next.maps || !next.maps[mapId]) return;
                const normalized = normalizeCalibrationRecord(mapId, record);
                next.maps[mapId].alpha_counts = cloneValue(normalized.alpha_counts);
                if (!isPlainObject(next.maps[mapId].value_model)) next.maps[mapId].value_model = {};
                CALIBRATION_QUALITY_ORDER.forEach((quality) => {
                    const current = next.maps[mapId].value_model[quality] || {};
                    next.maps[mapId].value_model[quality] = {
                        ...current,
                        base_item_mean: normalized.value_model[quality].base_item_mean,
                        base_item_sd: normalized.value_model[quality].base_item_sd
                    };
                });
            });
            return next;
        }

        function exportCalibrationPayload(kind) {
            const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
            const mode = kind === "applied" ? "apply" : "draft";
            return {
                schema_version: "ak_calibration_panel_v1",
                map_id: mapId,
                mode,
                source_artifact_version: getCalibrationArtifact().artifact_version || null,
                alpha_counts: cloneValue(getCalibrationRecordForMode(mapId, mode).alpha_counts),
                value_model: cloneValue(getCalibrationRecordForMode(mapId, mode).value_model)
            };
        }

        function downloadJsonFile(filename, payload) {
            if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            if (typeof link.click === "function") link.click();
            if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
            return true;
        }

        function buildConfigDraft(sourceConfig) {
            return JSON.parse(JSON.stringify(sourceConfig || {}));
        }

        function syncConfigDraftJson() {
            if (!configJson) return;
            configJson.value = JSON.stringify(configDraft, null, 2);
        }

        function clearEngineCaches() {
            resultCache.clear();
            coarseResultCache.clear();
        }

        function terminateFullSolveRuntime() {
            if (!fullSolveRuntime) return;
            fullSolveRuntime.terminate();
            fullSolveRuntime = null;
        }

        function resetSolveSession({ clearCaches = false } = {}) {
            activeExecutionId += 1;
            pendingFullSolveContext = null;
            terminateFullSolveRuntime();
            isComputing = false;
            hasCoarsePreview = false;
            latestAnalysisSnapshot = null;
            if (clearCaches) clearEngineCaches();
        }

        function invalidateResolvedConfigCache() {
            resolvedConfigCache = { mapId: null, sourceConfig: null, resolvedConfig: null };
        }

        function rebuildEffectiveConfig() {
            currentConfig = buildEffectiveWorkspaceConfigFromRuntime(getWorkspaceBaseConfig(), configOverrides, localTemplates);
            currentConfig = applyCalibrationOverridesToConfig(currentConfig);
            workspaceState = normalizeWorkspaceStateFromRuntime(currentConfig, workspaceState);
            configDraft = buildConfigDraft(currentConfig);
            invalidateResolvedConfigCache();
            renderCalibrationPanel();
        }

        function getResolvedConfigForSelection(mapId) {
            const selectedMapId = mapId || workspaceState.active_map_id || currentConfig.app.default_map_id;
            if (
                resolvedConfigCache.sourceConfig === currentConfig
                && resolvedConfigCache.mapId === selectedMapId
                && resolvedConfigCache.resolvedConfig
            ) {
                return resolvedConfigCache.resolvedConfig;
            }

            const resolvedConfig = typeof resolveEstimatorConfig === "function"
                ? resolveEstimatorConfig(currentConfig, selectedMapId)
                : currentConfig;
            resolvedConfigCache = {
                sourceConfig: currentConfig,
                mapId: selectedMapId,
                resolvedConfig
            };
            return resolvedConfig;
        }

        function setCalibrationPanelStatus(message) {
            if (!calibrationStatus) return;
            setElementText(calibrationStatus, message || "");
        }

        function updateCalibrationModeButtons() {
            Object.entries(calibrationModeButtons).forEach(([mode, button]) => {
                if (!button) return;
                button.classList.toggle("active", calibrationPanelMode === mode);
            });
        }

        function attachNumberWheelStepper(input, onValueChange) {
            if (typeof bindNumericWheelStepperFromRuntime === "function") {
                bindNumericWheelStepperFromRuntime(input, onValueChange);
            }
        }

        function configureAppNumericInput(input, options = {}) {
            if (typeof configureNumericInputFromRuntime === "function") {
                return configureNumericInputFromRuntime(input, options);
            }
            if (!input) return input;
            input.type = "number";
            input.step = options.step || "1";
            if (options.min !== undefined && options.min !== null) input.min = String(options.min);
            if (options.max !== undefined && options.max !== null) input.max = String(options.max);
            return input;
        }

        function handleCalibrationInputChange(mode, mapId, updateKind, quality, fieldKey, rawValue) {
            const store = mode === "apply" ? calibrationAppliedByMap : calibrationDraftByMap;
            const normalized = normalizeCalibrationRecord(mapId, store[mapId]);

            if (updateKind === "alpha") {
                const parsed = parseLooseNumber(rawValue);
                normalized.alpha_counts[quality] = parsed === null ? getAuthorityCalibrationSnapshot(mapId).alpha_counts[quality] : parsed;
            } else {
                const parsed = parseLooseNumber(rawValue);
                normalized.value_model[quality][fieldKey] = parsed === null
                    ? getAuthorityCalibrationSnapshot(mapId).value_model[quality][fieldKey]
                    : parsed;
            }

            store[mapId] = normalized;
            if (mode === "apply") {
                persistCalibrationApplied();
                rebuildEffectiveConfig();
                populateMapSelect();
                populateTemplateSelect();
                renderFields();
                clearEngineCaches();
                executeEngine();
                setCalibrationPanelStatus("当前地图校准已直接应用到 workspace。");
            } else {
                persistCalibrationDrafts();
                setCalibrationPanelStatus("当前修改只保存在本地草稿，尚未影响运行结果。");
            }
            renderCalibrationPanel();
        }

        function renderCalibrationPanel() {
            if (!calibrationPanel) return;
            const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
            const artifact = getCalibrationArtifact();
            const authority = getAuthorityCalibrationSnapshot(mapId);
            const record = getCalibrationRecordForMode(mapId, calibrationPanelMode);
            const artifactQualityStatus = getArtifactQualityStatus(artifact);

            updateCalibrationModeButtons();
            if (calibrationArtifactMeta) {
                setElementText(
                    calibrationArtifactMeta,
                    artifact && artifact.artifact_version
                        ? `版本 ${artifact.artifact_version}；图鉴批次 ${artifact.source_summary && artifact.source_summary.catalog_batch_count || 0}；战局样本 ${artifact.source_summary && artifact.source_summary.battle_sample_count || 0}；alpha_counts ${artifactQualityStatus.alpha_counts}；base_item ${artifactQualityStatus.value_model_base_items}`
                        : "未发现权威产物。"
                );
            }
            if (calibrationMapMeta) {
                setElementText(
                    calibrationMapMeta,
                    authority.count_prior_status === "fallback_only"
                        ? `${mapId}：当前地图 battle sample ${authority.battle_sample_count}，catalog batch ${authority.catalog_batch_count}，alpha_counts 仍为地图默认值，尚未被真实样本接管；cells_per_item Phase 1 只读。`
                        : `${mapId}：当前地图 battle sample ${authority.battle_sample_count}，catalog batch ${authority.catalog_batch_count}，alpha_counts 已进入 ${authority.count_prior_status}；cells_per_item Phase 1 只读。`
                );
            }
            if (calibrationSampleMeta) {
                const sampleSummary = buildSettlementSampleSummary(mapId);
                const currentCollection = sampleSummary.current_map_collection_progress;
                const collectionDisplay = currentCollection
                    ? `采集目标 ${currentCollection.map_id} ${currentCollection.count_fit_ready_sample_count}/${currentCollection.target_count_fit_ready_sample_count}；还差 ${currentCollection.count_fit_gap}；下一补样 ${sampleSummary.next_count_fit_map_id || "无"}；`
                    : "";
                const latestExportDisplay = sampleSummary.current_map_latest_authority_exported_at
                    ? `${sampleSummary.current_map_latest_authority_export_scope || "unknown"} @ ${sampleSummary.current_map_latest_authority_exported_at} / batch ${sampleSummary.current_map_latest_authority_export_batch_id || "unknown"} / ${sampleSummary.current_map_latest_authority_export_sample_count || 0}条`
                    : (sampleSummary.latest_authority_exported_at
                        ? `${sampleSummary.latest_authority_export_scope || "unknown"} @ ${sampleSummary.latest_authority_exported_at} / batch ${sampleSummary.latest_authority_export_batch_id || "unknown"} / ${sampleSummary.latest_authority_export_sample_count || 0}条`
                        : "无");
                setElementText(
                    calibrationSampleMeta,
                    `${collectionDisplay}本地结算样本 ${sampleSummary.sample_count}；全局可转 authority ${sampleSummary.authority_ready_sample_count}；全局未导出 ${sampleSummary.authority_pending_export_sample_count}；当前地图 ${sampleSummary.current_map_sample_count}；当前地图可转 authority ${sampleSummary.current_map_authority_ready_sample_count}；当前地图已导出 ${sampleSummary.current_map_authority_exported_sample_count}；当前地图未导出 ${sampleSummary.current_map_authority_pending_export_sample_count}；权重拟合可用 ${sampleSummary.current_map_count_fit_ready_sample_count}；缺观测 ${sampleSummary.current_map_unready_reason_counts.missing_observed_state}；缺实际数量 ${sampleSummary.current_map_unready_reason_counts.missing_actual_counts}；缺完整六色 ${sampleSummary.current_map_count_fit_unready_reason_counts.missing_full_actual_counts}；系统均价 ${sampleSummary.current_map_system_hint_sample_count}/可评分 ${sampleSummary.current_map_system_hint_scored_sample_count}；平均战利品 ${formatNumber(sampleSummary.average_loot_value, 0)}；最近导入 ${sampleSummary.latest_created_at || "无"}；最近导出 ${latestExportDisplay}`
                );
            }

            clearElementContent(calibrationAlphaGrid);
            const alphaHeader = document.createElement("div");
            alphaHeader.className = "calibration-grid-row calibration-grid-row-header";
            ["", "当前值", "权威基线"].forEach((text) => {
                const cell = document.createElement("div");
                cell.className = "calibration-grid-heading";
                cell.textContent = text;
                alphaHeader.appendChild(cell);
            });
            calibrationAlphaGrid.appendChild(alphaHeader);
            CALIBRATION_QUALITY_ORDER.forEach((quality) => {
                const row = document.createElement("div");
                row.className = "calibration-grid-row";
                const label = document.createElement("div");
                label.className = "calibration-grid-label";
                label.textContent = CALIBRATION_QUALITY_LABELS[quality];
                const input = document.createElement("input");
                input.id = `calibration-alpha-input-${quality}`;
                configureAppNumericInput(input, { step: "0.01", min: "0" });
                input.placeholder = "当前值";
                input.title = "当前数量先验 alpha_counts，可用鼠标滚轮微调。";
                input.value = record.alpha_counts[quality] === null || record.alpha_counts[quality] === undefined
                    ? ""
                    : String(record.alpha_counts[quality]);
                input.disabled = false;
                input.addEventListener("input", (event) => {
                    handleCalibrationInputChange(calibrationPanelMode, mapId, "alpha", quality, null, event.currentTarget.value);
                });
                attachNumberWheelStepper(input, (value) => {
                    handleCalibrationInputChange(calibrationPanelMode, mapId, "alpha", quality, null, value);
                });
                const hint = document.createElement("div");
                hint.className = "calibration-grid-readonly";
                hint.textContent = `权威 ${authority.alpha_counts[quality]}`;
                row.appendChild(label);
                row.appendChild(input);
                row.appendChild(hint);
                calibrationAlphaGrid.appendChild(row);
            });

            clearElementContent(calibrationValueGrid);
            const valueHeader = document.createElement("div");
            valueHeader.className = "calibration-grid-row calibration-grid-row-header";
            ["", "图鉴均值", "标准差"].forEach((text) => {
                const cell = document.createElement("div");
                cell.className = "calibration-grid-heading";
                cell.textContent = text;
                valueHeader.appendChild(cell);
            });
            calibrationValueGrid.appendChild(valueHeader);
            CALIBRATION_QUALITY_ORDER.forEach((quality) => {
                const row = document.createElement("div");
                row.className = "calibration-grid-row";
                const label = document.createElement("div");
                label.className = "calibration-grid-label";
                label.textContent = CALIBRATION_QUALITY_LABELS[quality];

                const meanInput = document.createElement("input");
                meanInput.id = `calibration-value-base-item-mean-input-${quality}`;
                configureAppNumericInput(meanInput, { step: "0.01", min: "0" });
                meanInput.placeholder = "图鉴均值";
                meanInput.title = "base_item_mean：图鉴均价，不是最高价或最低价。";
                meanInput.value = record.value_model[quality].base_item_mean === null || record.value_model[quality].base_item_mean === undefined
                    ? ""
                    : String(record.value_model[quality].base_item_mean);
                meanInput.addEventListener("input", (event) => {
                    handleCalibrationInputChange(calibrationPanelMode, mapId, "value", quality, "base_item_mean", event.currentTarget.value);
                });
                attachNumberWheelStepper(meanInput, (value) => {
                    handleCalibrationInputChange(calibrationPanelMode, mapId, "value", quality, "base_item_mean", value);
                });

                const sdInput = document.createElement("input");
                sdInput.id = `calibration-value-base-item-sd-input-${quality}`;
                configureAppNumericInput(sdInput, { step: "0.01", min: "0" });
                sdInput.placeholder = "标准差";
                sdInput.title = "base_item_sd：图鉴条目价格标准差，用于表达价格波动，不是最低价。";
                sdInput.value = record.value_model[quality].base_item_sd === null || record.value_model[quality].base_item_sd === undefined
                    ? ""
                    : String(record.value_model[quality].base_item_sd);
                sdInput.addEventListener("input", (event) => {
                    handleCalibrationInputChange(calibrationPanelMode, mapId, "value", quality, "base_item_sd", event.currentTarget.value);
                });
                attachNumberWheelStepper(sdInput, (value) => {
                    handleCalibrationInputChange(calibrationPanelMode, mapId, "value", quality, "base_item_sd", value);
                });

                row.appendChild(label);
                row.appendChild(meanInput);
                row.appendChild(sdInput);
                calibrationValueGrid.appendChild(row);
            });

            clearElementContent(calibrationCellsGrid);
            CALIBRATION_QUALITY_ORDER.forEach((quality) => {
                const row = document.createElement("div");
                row.className = "calibration-grid-row cells";
                const label = document.createElement("div");
                label.className = "calibration-grid-label";
                label.textContent = CALIBRATION_QUALITY_LABELS[quality];
                const readonly = document.createElement("div");
                readonly.id = `calibration-cells-readonly-${quality}`;
                readonly.className = "calibration-grid-readonly";
                const cellConfig = authority.cells_per_item[quality] || {};
                readonly.textContent = `mean ${cellConfig.mean ?? "-"} / sd ${cellConfig.sd ?? "-"} / [${cellConfig.min ?? "-"}, ${cellConfig.max ?? "-"}]`;
                row.appendChild(label);
                row.appendChild(readonly);
                calibrationCellsGrid.appendChild(row);
            });

            renderCalibrationSampleReviewPanel(mapId);
        }

        function getAllTemplates() {
            return listWorkspaceTemplatesFromRuntime(currentConfig);
        }

        function getActiveTemplate() {
            return getAllTemplates().find((template) => template.id === workspaceState.active_template_id) || getAllTemplates()[0] || null;
        }

        function isLocalTemplate(templateId) {
            return localTemplates.some((template) => template && template.id === templateId);
        }

        function ensureEditableActiveTemplate() {
            const activeTemplate = getActiveTemplate();
            if (!activeTemplate) return null;
            if (isLocalTemplate(activeTemplate.id)) return activeTemplate;

            const cloneId = `local_${Date.now()}`;
            const cloned = cloneTemplateDefinitionFromRuntime(activeTemplate, {
                id: cloneId,
                label: `${activeTemplate.label} 副本`
            });
            localTemplates = upsertLocalTemplateFromRuntime(localTemplates, cloned);
            workspaceState.active_template_id = cloneId;
            persistLocalTemplates();
            persistWorkspaceState();
            rebuildEffectiveConfig();
            populateTemplateSelect();
            return cloned;
        }

        function updateActiveLocalTemplate(mutator) {
            const editableTemplate = ensureEditableActiveTemplate();
            if (!editableTemplate) return;
            const nextTemplate = cloneTemplateDefinitionFromRuntime(editableTemplate, {});
            mutator(nextTemplate);
            localTemplates = upsertLocalTemplateFromRuntime(localTemplates, nextTemplate);
            persistLocalTemplates();
            rebuildEffectiveConfig();
            populateTemplateSelect();
            renderFields();
        }

        function updateOrganizeChainButton() {
            if (!organizeChainButton) return;
            organizeChainButton.setAttribute("aria-pressed", isOrganizingChain ? "true" : "false");
            organizeChainButton.classList.toggle("active", isOrganizingChain);
            setElementText(organizeChainButton, isOrganizingChain ? "完成整理" : "整理链路");
        }

        function addFieldToActiveTemplate(fieldId) {
            updateActiveLocalTemplate((template) => {
                const existing = Array.isArray(template.fields) ? template.fields : [];
                if (existing.some((field) => field.field_id === fieldId)) return;
                const groupId = template.groups && template.groups[0] ? template.groups[0].id : "custom";
                if (!template.groups || !template.groups.length) {
                    template.groups = [{ id: "custom", label: "自定义字段" }];
                }
                template.fields = existing.concat([{
                    field_id: fieldId,
                    group_id: groupId,
                    recommended: false,
                    default_visible: true
                }]);
            });
        }

        function removeFieldFromActiveTemplate(fieldId) {
            updateActiveLocalTemplate((template) => {
                template.fields = (template.fields || []).filter((field) => field.field_id !== fieldId);
            });
        }

        function moveFieldWithinActiveTemplate(fieldId, direction) {
            updateActiveLocalTemplate((template) => {
                const fields = Array.isArray(template.fields) ? template.fields.slice() : [];
                const index = fields.findIndex((field) => field.field_id === fieldId);
                if (index === -1) return;
                const delta = direction === "up" ? -1 : 1;
                const nextIndex = index + delta;
                if (nextIndex < 0 || nextIndex >= fields.length) return;
                const [entry] = fields.splice(index, 1);
                fields.splice(nextIndex, 0, entry);
                template.fields = fields;
            });
        }

        function toggleFieldRecommendedInActiveTemplate(fieldId) {
            updateActiveLocalTemplate((template) => {
                template.fields = (template.fields || []).map((field) => {
                    if (field.field_id !== fieldId) return field;
                    return {
                        ...field,
                        recommended: !field.recommended
                    };
                });
            });
        }

        function populateTemplateSelect() {
            if (!templateSelect) return;
            clearElementContent(templateSelect);
            getAllTemplates().forEach((template) => {
                const option = document.createElement("option");
                option.value = template.id;
                option.innerText = template.label || template.id;
                templateSelect.appendChild(option);
            });
            templateSelect.value = workspaceState.active_template_id;
            if (deleteTemplateButton) {
                deleteTemplateButton.disabled = !isLocalTemplate(workspaceState.active_template_id);
            }
        }

        function populateMapSelect() {
            if (!mapSelect) return;
            clearElementContent(mapSelect);
            Object.keys(currentConfig.maps || {}).forEach((mapId) => {
                const option = document.createElement("option");
                option.value = mapId;
                option.innerText = (currentConfig.maps[mapId] && (currentConfig.maps[mapId].label || currentConfig.maps[mapId].map_name)) || mapId;
                mapSelect.appendChild(option);
            });
            mapSelect.value = workspaceState.active_map_id;
        }

        function renderFields() {
            if (!hasWorkspaceInputSurface()) return;
            renderFieldPanelsFromRuntime(
                {
                    templateGroups,
                    moreFields,
                    moreFieldsPanel,
                    moreFieldsSummaryMeta,
                    moreFieldsFilterButtons,
                    activeTemplate: getActiveTemplate(),
                    fieldCatalogIndex: getFieldCatalogIndex(),
                    fieldCatalogItems: getFieldCatalogItems(),
                    workspaceState,
                    activeMoreFieldsFilter,
                    moreFieldsSearchTerm,
                    isOrganizingChain
                },
                {
                    onFieldInput(fieldId, value) {
                        workspaceState.field_values[fieldId] = value;
                        persistWorkspaceState();
                        resetSolveSession();
                        isDirty = true;
                        setStatusAppearance("pending");
                        updateComputeUi();
                    },
                    onFieldMetaInput(fieldId, value) {
                        if (!workspaceState.field_value_meta || typeof workspaceState.field_value_meta !== "object") {
                            workspaceState.field_value_meta = {};
                        }
                        if (value && typeof value === "object") {
                            workspaceState.field_value_meta[fieldId] = cloneValue(value);
                        } else {
                            delete workspaceState.field_value_meta[fieldId];
                        }
                        persistWorkspaceState();
                        resetSolveSession();
                        isDirty = true;
                        setStatusAppearance("pending");
                        updateComputeUi();
                        renderFields();
                        if (hasRequiredInput()) executeEngine();
                    },
                    onFieldBlur() {
                        if (isDirty && hasRequiredInput()) executeEngine();
                    },
                    onAddFieldToTemplate: addFieldToActiveTemplate,
                    onMoveFieldWithinTemplate: moveFieldWithinActiveTemplate,
                    onRemoveFieldFromTemplate: removeFieldFromActiveTemplate
                },
                fieldPanelHelpers
            );
            updateOrganizeChainButton();
        }

        const resetOutputToWaiting = () => {
            if (!hasResultSurface()) return;
            resetOutputToWaitingFromRuntime(resultPanelContext, resultPanelHelpers);
            posteriorRiskNote.classList.add("hidden");
            setElementText(posteriorRiskNote, "");
        };
        const renderPosteriorSummary = (confidenceEl, entries, suffix = "件", waitingText = "等待输入") => renderPosteriorSummaryFromRuntime(
            confidenceEl,
            entries,
            { suffix, waitingText },
            resultPanelHelpers
        );
        const renderDistributionList = (target, entries, suffix = "件", waitingText = "当前输入下暂无分布。", barClassName = "o-bar") => renderDistributionListFromRuntime(
            target,
            entries,
            { suffix, waitingText, barClassName },
            resultPanelHelpers
        );
        const renderGridSummary = (summary) => renderGridSummaryFromRuntime(gridBody, summary, resultPanelHelpers);
        const renderValuation = (valuation, bidValue) => renderValuationFromRuntime(resultPanelContext, valuation, bidValue, resultPanelHelpers);

        function buildFullSolveErrorResult(error) {
            return {
                error: true,
                messages: [`后台完整求解失败：${error && error.message ? error.message : String(error)}`]
            };
        }

        function applyPendingFullSolveState(hasVisibleCoarse) {
            isComputing = true;
            hasCoarsePreview = !!hasVisibleCoarse;
            setStatusAppearance(hasVisibleCoarse ? "coarse" : "running");
            updateComputeUi();
        }

        function buildStageConfig(resolvedConfig, solverOverride) {
            if (!solverOverride) return resolvedConfig;
            return {
                ...resolvedConfig,
                solver: {
                    ...(resolvedConfig && resolvedConfig.solver ? resolvedConfig.solver : {}),
                    ...solverOverride
                }
            };
        }

        function finalizeSolveStage(context, result) {
            if (!context || context.runId !== activeExecutionId) return;
            pendingFullSolveContext = null;
            resultCache.set(context.cacheKey, result);
            applyEngineResult(result, context.workspaceState, context.resolvedConfig, context.phase, context.runId);
        }

        function runFullSolveOnMainThread(context) {
            if (!context || context.runId !== activeExecutionId) return;
            applyPendingFullSolveState(context.hasVisibleCoarse);
            try {
                const AuctionKingEstimatorFromGlobal = getRuntimeGlobal("AuctionKingEstimator");
                if (typeof AuctionKingEstimatorFromGlobal !== "function") {
                    throw new Error("完整求解器不可用。");
                }
                const estimator = new AuctionKingEstimatorFromGlobal(buildStageConfig(context.resolvedConfig, context.solverOverride), context.legacyState);
                finalizeSolveStage(context, estimator.recompute());
            } catch (error) {
                finalizeSolveStage(context, buildFullSolveErrorResult(error));
            }
        }

        function scheduleMainThreadFullSolve(context) {
            pendingFullSolveContext = context;
            setTimeout(() => runFullSolveOnMainThread(context), 16);
        }

        function ensureFullSolveRuntime() {
            const createFullSolveRuntimeFromGlobal = getRuntimeGlobal("createFullSolveRuntime");
            if (typeof Worker === "undefined" || typeof createFullSolveRuntimeFromGlobal !== "function") return null;
            if (fullSolveRuntime) return fullSolveRuntime;
            fullSolveRuntime = createFullSolveRuntimeFromGlobal(
                () => new Worker(`full_solver_worker.js?v=${FULL_SOLVER_WORKER_VERSION}`),
                {
                    onResult: (payload) => {
                        const context = pendingFullSolveContext;
                        if (!context || payload.cacheKey !== context.cacheKey) return;
                        finalizeSolveStage(context, payload.result);
                    },
                    onError: (error) => {
                        const context = pendingFullSolveContext;
                        pendingFullSolveContext = null;
                        if (!context || context.runId !== activeExecutionId) return;
                        if (shouldFallbackToMainThreadFullSolve(error)) {
                            scheduleMainThreadFullSolve(context);
                        } else {
                            finalizeSolveStage(context, buildFullSolveErrorResult(error));
                        }
                    }
                }
            );
            return fullSolveRuntime;
        }

        function dispatchSolveStage(context) {
            const runtime = ensureFullSolveRuntime();
            if (!runtime) return false;
            pendingFullSolveContext = context;
            applyPendingFullSolveState(context.hasVisibleCoarse);
            try {
                runtime.dispatch({
                    cacheKey: context.cacheKey,
                    resolvedConfig: context.resolvedConfig,
                    stateVars: context.legacyState,
                    solverOverride: context.solverOverride,
                    timeoutMs: context.timeoutMs
                });
                return true;
            } catch (_error) {
                pendingFullSolveContext = null;
                terminateFullSolveRuntime();
                return false;
            }
        }

        function applyEngineResult(result, nextWorkspaceState, resolvedConfig, phase = "full", runId = activeExecutionId) {
            if (runId !== activeExecutionId) return;
            isComputing = phase === "coarse";
            hasCoarsePreview = phase === "coarse" && !result.error;
            isDirty = false;
            setStatusAppearance(phase === "coarse" ? "coarse" : "idle");
            updateComputeUi();
            if (!hasResultSurface()) return;

            if (result.error) {
                renderEngineError(result);
                gridSection.classList.add("hidden");
                valuationSection.classList.add("hidden");
                return;
            }

            const posteriorRisk = buildPosteriorRiskDiagnostic(nextWorkspaceState.field_values, result.summary);
            latestAnalysisSnapshot = {
                status: "available",
                phase,
                cache_key: buildCurrentEngineCacheKey(resolvedConfig, nextWorkspaceState),
                map_id: nextWorkspaceState.active_map_id || (currentConfig.app ? currentConfig.app.default_map_id : null),
                template_id: nextWorkspaceState.active_template_id || (currentConfig.app ? currentConfig.app.default_template_id : null),
                config_source_version: currentConfig.app ? currentConfig.app.config_source_version || null : null,
                bid_price: parseLooseNumber(nextWorkspaceState.field_values && nextWorkspaceState.field_values.bid),
                summary: cloneValue(result.summary || {}),
                valuation: result.valuation ? cloneValue(result.valuation) : null,
                posterior_risk: posteriorRisk
            };

            errorBox.classList.add("hidden");
            renderPosteriorSummary(
                orangeConfidenceNote,
                result.summary.orange_count_probs,
                "件",
                "等待总数量与约束字段。"
            );
            renderPosteriorSummary(
                redConfidenceNote,
                result.summary.red_count_probs,
                "件",
                "等待求解后验。"
            );
            renderDistributionList(
                orangeList,
                result.summary.orange_count_probs,
                "件",
                "等待总数量与约束字段。",
                "o-bar"
            );
            renderDistributionList(
                redList,
                result.summary.red_count_probs,
                "件",
                "等待求解后验。",
                "r-bar"
            );
            renderPosteriorRiskNote(nextWorkspaceState.field_values, result.summary);
            renderGridSummary(result.summary);
            renderValuation(result.valuation, nextWorkspaceState.field_values.bid);
            gridSection.classList.remove("hidden");
            valuationSection.classList.remove("hidden");
        }

        function executeEngine() {
            if (!hasResultSurface()) {
                resetSolveSession();
                isDirty = false;
                setStatusAppearance("idle");
                updateComputeUi();
                return;
            }
            const totalItems = parseLooseNumber(workspaceState.field_values.total_items);
            if (totalItems === null) {
                resetSolveSession();
                resetOutputToWaiting();
                isDirty = false;
                setStatusAppearance("idle");
                updateComputeUi();
                return;
            }

            resetSolveSession();
            const runId = activeExecutionId;
            const resolvedConfig = getResolvedConfigForSelection(workspaceState.active_map_id);
            const legacyState = buildLegacyEstimatorStateFromFieldValuesFromRuntime(workspaceState.field_values, workspaceState.field_value_meta);
            const cacheKey = buildCurrentEngineCacheKey(resolvedConfig, workspaceState);

            const cachedFull = resultCache.get(cacheKey);
            if (cachedFull) {
                applyEngineResult(cachedFull, workspaceState, resolvedConfig, "full", runId);
                return;
            }
            isComputing = true;
            setStatusAppearance("running");
            updateComputeUi();

            const coarseCacheKey = `coarse:${cacheKey}`;
            const buildCoarseEngineResultFromGlobal = getRuntimeGlobal("buildCoarseEngineResult");
            const coarseResult = coarseResultCache.get(coarseCacheKey)
                || (typeof buildCoarseEngineResultFromGlobal === "function" ? buildCoarseEngineResultFromGlobal(resolvedConfig, legacyState) : null);

            if (coarseResult) {
                coarseResultCache.set(coarseCacheKey, coarseResult);
                applyEngineResult(coarseResult, workspaceState, resolvedConfig, "coarse", runId);
                if (coarseResult.error) return;
            }

            const fullContext = {
                runId,
                cacheKey,
                resolvedConfig,
                workspaceState: JSON.parse(JSON.stringify(workspaceState)),
                legacyState,
                phase: "full",
                solverOverride: null,
                timeoutMs: resolvedConfig && resolvedConfig.solver && resolvedConfig.solver.staging
                    ? resolvedConfig.solver.staging.full_timeout_ms_dense
                    : 4200,
                hasVisibleCoarse: !!coarseResult
            };

            if (!dispatchSolveStage(fullContext)) {
                scheduleMainThreadFullSolve(fullContext);
            }
        }

        function renderConfigModalView(view) {
            if (!hasConfigModalSurface()) return;
            const getConfigModalViewStateFromGlobal = getRuntimeGlobal("getConfigModalViewState");
            const modalState = typeof getConfigModalViewStateFromGlobal === "function"
                ? getConfigModalViewStateFromGlobal(view, configDraft, defaultConfig)
                : null;
            if (!modalState) return;
            activeConfigModalView = modalState.view;
            setElementText(configModalTitle, modalState.title);
            setElementText(configHelpText, modalState.helpText);
            configJson.readOnly = !!modalState.readOnly;
            configJson.value = modalState.jsonText;
            configEditorControls.classList.toggle("hidden", !modalState.showStructuredControls);
            if (configJsonDetails) {
                configJsonDetails.open = activeConfigModalView !== (configModalViews ? configModalViews.STRUCTURED : "structured");
            }
            importConfigButton.disabled = !modalState.showImportExport;
            exportConfigButton.disabled = !modalState.showImportExport;
            saveConfigButton.disabled = !modalState.showSaveAction;

            Object.entries(configViewButtons).forEach(([key, button]) => {
                if (!button) return;
                button.classList.toggle("active", activeConfigModalView === key);
            });

            renderConfigEditorControls();
        }

        function setConfigEditorMessage(message, isError = false) {
            setConfigEditorMessageFromRuntime(configEditorStatus, message, isError, configEditorHelpers);
        }

        function renderConfigEditorControls() {
            if (!configEditorControls) return;
            renderConfigEditorControlsFromRuntime(
                {
                    container: configEditorControls,
                    activeConfigModalView,
                    structuredView: configModalViews ? configModalViews.STRUCTURED : "structured",
                    configDraft,
                    activeMapId: workspaceState.active_map_id
                },
                {
                    buildConfigEditorSections: typeof getRuntimeGlobal("buildConfigEditorSections") === "function" ? getRuntimeGlobal("buildConfigEditorSections") : null,
                    applyTemplateFieldMutation: typeof getRuntimeGlobal("applyTemplateFieldMutation") === "function" ? getRuntimeGlobal("applyTemplateFieldMutation") : null,
                    applyConfigEditorValue: typeof getRuntimeGlobal("applyConfigEditorValue") === "function" ? getRuntimeGlobal("applyConfigEditorValue") : null,
                    onDraftReplace(nextDraft, options = {}) {
                        configDraft = nextDraft;
                        syncConfigDraftJson();
                        if (options.rerender) renderConfigEditorControls();
                    },
                    onMessage: setConfigEditorMessage
                },
                configEditorHelpers
            );
        }

        function openConfigModal() {
            if (!hasConfigModalSurface()) return;
            configDraft = buildConfigDraft(currentConfig);
            renderConfigModalView(activeConfigModalView);
            configModal.classList.remove("hidden");
        }

        function closeConfigModal() {
            if (!configModal) return;
            configModal.classList.add("hidden");
        }

        function handleSaveConfig() {
            const nextDraft = JSON.parse(JSON.stringify(configDraft || {}));
            const nextLocalTemplates = nextDraft && nextDraft.templates && Array.isArray(nextDraft.templates.local)
                ? nextDraft.templates.local
                : [];
            if (nextDraft && nextDraft.templates && Array.isArray(nextDraft.templates.local)) {
                delete nextDraft.templates.local;
            }
            localTemplates = nextLocalTemplates;
            persistLocalTemplates();
            configOverrides = getConfigDiff(nextDraft, getWorkspaceBaseConfig());
            persistConfigOverrides();
            rebuildEffectiveConfig();
            populateMapSelect();
            populateTemplateSelect();
            renderFields();
            clearEngineCaches();
            executeEngine();
            closeConfigModal();
        }

        function handleResetConfig() {
            configOverrides = {};
            localStorage.removeItem(CONFIG_OVERRIDES_STORAGE_KEY);
            rebuildEffectiveConfig();
            persistWorkspaceState();
            populateMapSelect();
            populateTemplateSelect();
            renderFields();
            clearEngineCaches();
            renderConfigModalView(configModalViews ? configModalViews.STRUCTURED : "structured");
            executeEngine();
        }

        function handleExportConfig() {
            if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
            const blob = new Blob([JSON.stringify(configDraft, null, 2)], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "auction-king-config.json";
            if (typeof link.click === "function") link.click();
            if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
        }

        function handleImportConfigText(rawText) {
            try {
                const parsed = JSON.parse(rawText);
                const importedLocalTemplates = parsed && parsed.templates && Array.isArray(parsed.templates.local)
                    ? parsed.templates.local
                    : localTemplates;
                configDraft = buildConfigDraft(buildEffectiveWorkspaceConfigFromRuntime(getWorkspaceBaseConfig(), parsed, importedLocalTemplates));
                renderConfigModalView(configModalViews ? configModalViews.STRUCTURED : "structured");
            } catch (error) {
                setConfigEditorMessage(`导入 JSON 失败：${error.message}`, true);
            }
        }

        function applyCalibrationDraftToWorkspace() {
            const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
            calibrationAppliedByMap[mapId] = normalizeCalibrationRecord(mapId, calibrationDraftByMap[mapId]);
            persistCalibrationApplied();
            rebuildEffectiveConfig();
            populateMapSelect();
            populateTemplateSelect();
            renderFields();
            clearEngineCaches();
            executeEngine();
            setCalibrationPanelStatus("已把草稿应用到当前 workspace。");
            renderCalibrationPanel();
        }

        function resetCalibrationToAuthority() {
            const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
            delete calibrationAppliedByMap[mapId];
            persistCalibrationApplied();
            rebuildEffectiveConfig();
            populateMapSelect();
            populateTemplateSelect();
            renderFields();
            clearEngineCaches();
            executeEngine();
            setCalibrationPanelStatus("当前地图已回到 repo 权威产物。");
            renderCalibrationPanel();
        }

        function importCalibrationPayload(rawText, kind) {
            try {
                const parsed = JSON.parse(rawText);
                const mapId = parsed && parsed.map_id ? String(parsed.map_id) : (workspaceState.active_map_id || currentConfig.app.default_map_id);
                const normalized = normalizeCalibrationRecord(mapId, parsed);
                if (kind === "applied") {
                    calibrationAppliedByMap[mapId] = normalized;
                    persistCalibrationApplied();
                    rebuildEffectiveConfig();
                    populateMapSelect();
                    populateTemplateSelect();
                    renderFields();
                    clearEngineCaches();
                    executeEngine();
                    setCalibrationPanelStatus(`已导入 ${mapId} 的应用态校准。`);
                } else {
                    calibrationDraftByMap[mapId] = normalized;
                    persistCalibrationDrafts();
                    setCalibrationPanelStatus(`已导入 ${mapId} 的草稿校准。`);
                }
                renderCalibrationPanel();
            } catch (error) {
                setCalibrationPanelStatus(`导入校准 JSON 失败：${error.message}`);
            }
        }

        function exportSettlementSamplePayload() {
            if (typeof exportSettlementSamplesFromRuntime !== "function") return [];
            try {
                return JSON.parse(exportSettlementSamplesFromRuntime());
            } catch (_error) {
                return [];
            }
        }

        function exportFilteredReplaySamplePayload(mapId) {
            const filteredSamples = getFilteredCurrentMapSettlementSamples(mapId);
            const filteredIds = filteredSamples.map((sample) => sample.id);
            const filterDescriptor = getSelectedCalibrationSampleFilterDescriptor(mapId);
            try {
                const basePackage = typeof buildSettlementCalibrationReplayPackageFromRuntime === "function"
                    ? buildSettlementCalibrationReplayPackageFromRuntime(filteredIds, {
                        map_id: mapId,
                        filter_value: filterDescriptor.value,
                        filter_label: filterDescriptor.label,
                        exported_at: new Date().toISOString()
                    })
                    : {
                        schema_version: "ak_settlement_calibration_replay_package_v1",
                        export_kind: "settlement_calibration_replay",
                        export_context: {
                            map_id: mapId,
                            filter_value: filterDescriptor.value,
                            filter_label: filterDescriptor.label,
                            exported_at: new Date().toISOString(),
                            sample_count: filteredIds.length,
                            selected_sample_count: filteredIds.length,
                            skipped_sample_count: 0
                        },
                        samples: JSON.parse(
                            typeof exportAuthorityBattleSamplesByIdsFromRuntime === "function"
                                ? exportAuthorityBattleSamplesByIdsFromRuntime(filteredIds)
                                : "[]"
                        )
                    };
                return buildReplayPackageExportPayload(basePackage, {
                    mapId,
                    calibrationMode: calibrationPanelMode,
                    calibrationRecord: getCalibrationRecordForMode(mapId, calibrationPanelMode),
                    sourceArtifactVersion: getCalibrationArtifact().artifact_version || null
                });
            } catch (_error) {
                const fallbackPackage = {
                    schema_version: "ak_settlement_calibration_replay_package_v1",
                    export_kind: "settlement_calibration_replay",
                    export_context: {
                        map_id: mapId,
                        filter_value: filterDescriptor.value,
                        filter_label: filterDescriptor.label,
                        exported_at: new Date().toISOString(),
                        sample_count: 0,
                        selected_sample_count: filteredIds.length,
                        skipped_sample_count: filteredIds.length
                    },
                    samples: []
                };
                return buildReplayPackageExportPayload(fallbackPackage, {
                    mapId,
                    calibrationMode: calibrationPanelMode,
                    calibrationRecord: getCalibrationRecordForMode(mapId, calibrationPanelMode),
                    sourceArtifactVersion: getCalibrationArtifact().artifact_version || null
                });
            }
        }

        function createAuthorityExportIdentity(scope) {
            const normalizedScope = typeof scope === "string" && scope.trim() ? scope.trim() : "global";
            return {
                scope: normalizedScope,
                exported_at: new Date().toISOString(),
                batch_id: `authority_export_${normalizedScope}_${Date.now()}`
            };
        }

        function buildAuthorityExportPackagePayload({
            mapId = null,
            sampleIds = [],
            scope = "global",
            filterValue = "all",
            filterLabel = null
        } = {}) {
            const normalizedSampleIds = (Array.isArray(sampleIds) ? sampleIds : [sampleIds])
                .map((sampleId) => String(sampleId || "").trim())
                .filter(Boolean);
            const exportIdentity = createAuthorityExportIdentity(scope);
            try {
                const authorityPackage = typeof buildSettlementAuthorityExportPackageFromRuntime === "function"
                    ? buildSettlementAuthorityExportPackageFromRuntime(normalizedSampleIds, {
                        map_id: mapId,
                        filter_value: filterValue,
                        filter_label: filterLabel,
                        source_artifact_version: getCalibrationArtifact().artifact_version || null,
                        ...exportIdentity
                    })
                    : (() => {
                        const samples = JSON.parse(
                            typeof exportAuthorityBattleSamplesByIdsFromRuntime === "function" && normalizedSampleIds.length
                                ? exportAuthorityBattleSamplesByIdsFromRuntime(normalizedSampleIds)
                                : "[]"
                        );
                        return {
                            schema_version: "ak_authority_battle_sample_package_v1",
                            export_kind: "authority_battle_samples",
                            export_context: {
                                map_id: mapId,
                                filter_value: filterValue,
                                filter_label: filterLabel,
                                source_artifact_version: getCalibrationArtifact().artifact_version || null,
                                ...exportIdentity,
                                sample_count: samples.length,
                                selected_sample_count: normalizedSampleIds.length,
                                skipped_sample_count: Math.max(0, normalizedSampleIds.length - samples.length)
                            },
                            samples
                        };
                    })();
                if (
                    authorityPackage
                    && authorityPackage.export_context
                    && typeof authorityPackage.export_context === "object"
                    && Array.isArray(authorityPackage.samples)
                    && !Number.isFinite(authorityPackage.export_context.sample_count)
                ) {
                    authorityPackage.export_context.sample_count = authorityPackage.samples.length;
                }
                return {
                    filterValue,
                    selectedCount: normalizedSampleIds.length,
                    exportContext: authorityPackage && authorityPackage.export_context ? authorityPackage.export_context : null,
                    authorityPackage,
                    samples: authorityPackage && Array.isArray(authorityPackage.samples) ? authorityPackage.samples : []
                };
            } catch (_error) {
                return {
                    filterValue,
                    selectedCount: normalizedSampleIds.length,
                    exportContext: {
                        map_id: mapId,
                        filter_value: filterValue,
                        filter_label: filterLabel,
                        source_artifact_version: getCalibrationArtifact().artifact_version || null,
                        ...exportIdentity,
                        sample_count: 0,
                        selected_sample_count: normalizedSampleIds.length,
                        skipped_sample_count: normalizedSampleIds.length
                    },
                    authorityPackage: {
                        schema_version: "ak_authority_battle_sample_package_v1",
                        export_kind: "authority_battle_samples",
                        export_context: {
                            map_id: mapId,
                            filter_value: filterValue,
                            filter_label: filterLabel,
                            source_artifact_version: getCalibrationArtifact().artifact_version || null,
                            ...exportIdentity,
                            sample_count: 0,
                            selected_sample_count: normalizedSampleIds.length,
                            skipped_sample_count: normalizedSampleIds.length
                        },
                        samples: []
                    },
                    samples: []
                };
            }
        }

        function exportFilteredAuthoritySamplePayload(mapId) {
            const filteredSamples = getFilteredCurrentMapSettlementSamples(mapId);
            const filterDescriptor = getSelectedCalibrationSampleFilterDescriptor(mapId);
            return buildAuthorityExportPackagePayload({
                mapId,
                sampleIds: filteredSamples.map((sample) => sample.id),
                scope: "filtered",
                filterValue: filterDescriptor.value,
                filterLabel: filterDescriptor.label
            });
        }

        function markAuthoritySamplesExported(sampleIds, scopeOrContext) {
            if (!Array.isArray(sampleIds) || !sampleIds.length || typeof markSettlementSamplesExportedFromRuntime !== "function") {
                return;
            }
            const scope = typeof scopeOrContext === "string"
                ? scopeOrContext
                : (scopeOrContext && typeof scopeOrContext.scope === "string" ? scopeOrContext.scope : "global");
            const exportedAt = scopeOrContext && typeof scopeOrContext === "object" && !Array.isArray(scopeOrContext)
                ? scopeOrContext.exported_at
                : null;
            const batchId = scopeOrContext && typeof scopeOrContext === "object" && !Array.isArray(scopeOrContext)
                ? scopeOrContext.batch_id
                : null;
            const sampleCount = scopeOrContext && typeof scopeOrContext === "object" && !Array.isArray(scopeOrContext)
                ? scopeOrContext.sample_count
                : null;
            markSettlementSamplesExportedFromRuntime(sampleIds, {
                scope,
                exported_at: typeof exportedAt === "string" && exportedAt ? exportedAt : new Date().toISOString(),
                batch_id: typeof batchId === "string" && batchId ? batchId : `authority_export_${scope}_${Date.now()}`,
                sample_count: Number.isFinite(sampleCount) ? sampleCount : sampleIds.length
            });
        }

        function importSettlementSamplesText(rawText) {
            try {
                const parsed = JSON.parse(rawText);
                if (!Array.isArray(parsed)) throw new Error("样本 JSON 须为数组。");
                if (typeof saveSettlementSamplesFromRuntime === "function") {
                    saveSettlementSamplesFromRuntime(parsed);
                }
                setCalibrationPanelStatus(`已导入 ${parsed.length} 条本地结算样本。`);
                renderCalibrationPanel();
            } catch (error) {
                setCalibrationPanelStatus(`导入结算样本失败：${error.message}`);
            }
        }

        function clearSettlementSamplesFromPanel() {
            const rawSamples = exportSettlementSamplePayload();
            const rawSampleCount = Array.isArray(rawSamples) ? rawSamples.length : 0;
            let replaySampleCount = 0;
            let replaySelectedCount = 0;
            let replaySkippedCount = 0;
            let replayDownloaded = false;

            if (rawSampleCount > 0) {
                const timestampSlug = createExportTimestampSlug();
                downloadJsonFile(`auction-king-settlement-samples-before-clear-${timestampSlug}.json`, rawSamples);

                const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
                const replayPayload = exportFilteredReplaySamplePayload(mapId);
                const replayContext = replayPayload && replayPayload.export_context ? replayPayload.export_context : {};
                const replaySamples = replayPayload && Array.isArray(replayPayload.samples) ? replayPayload.samples : [];
                replaySampleCount = replaySamples.length;
                replaySelectedCount = Number.isFinite(replayContext.selected_sample_count)
                    ? replayContext.selected_sample_count
                    : replaySampleCount;
                replaySkippedCount = Number.isFinite(replayContext.skipped_sample_count)
                    ? replayContext.skipped_sample_count
                    : Math.max(0, replaySelectedCount - replaySampleCount);
                if (replaySampleCount > 0) {
                    const filterValue = replayContext.filter_value || "all";
                    replayDownloaded = downloadJsonFile(
                        buildBeforeClearReplayPackageFilename(mapId, filterValue, timestampSlug),
                        replayPayload
                    );
                }
            }

            if (typeof clearSettlementSamplesFromRuntime === "function") {
                clearSettlementSamplesFromRuntime();
            }
            if (rawSampleCount > 0 && replayDownloaded) {
                setCalibrationPanelStatus(`清空前已导出本地样本 ${rawSampleCount} 条；当前地图 replay package ${replaySampleCount} 条；已清空本地结算样本缓存。`);
            } else if (rawSampleCount > 0) {
                setCalibrationPanelStatus(`清空前已导出本地样本 ${rawSampleCount} 条；当前地图 replay package 0 条，已跳过（筛选 ${replaySelectedCount} 条，跳过 ${replaySkippedCount} 条）；已清空本地结算样本缓存。`);
            } else {
                setCalibrationPanelStatus("本地没有结算样本可导出；已清空本地结算样本缓存。");
            }
            renderCalibrationPanel();
        }

        function captureCurrentWorkspaceAsSettlementSample() {
            if (
                typeof createSettlementSampleFromWorkspaceCaptureFromRuntime !== "function"
                || typeof appendSettlementSampleFromRuntime !== "function"
            ) {
                setCalibrationPanelStatus("当前运行时不支持从 workspace 直接生成样本。");
                return null;
            }

            const fieldValues = cloneValue(workspaceState.field_values || {});
            const hasMeaningfulFieldValue = Object.values(fieldValues).some((value) => value !== null && value !== undefined && value !== "");
            if (!hasMeaningfulFieldValue) {
                setCalibrationPanelStatus("当前没有可保存的观测输入。");
                return null;
            }

            const sample = createSettlementSampleFromWorkspaceCaptureFromRuntime({
                map_id: workspaceState.active_map_id || currentConfig.app.default_map_id,
                field_values: fieldValues,
                field_value_meta: cloneValue(workspaceState.field_value_meta || {}),
                fieldCatalogItems: getFieldCatalogItems(),
                metadata: {
                    template_id: workspaceState.active_template_id || null,
                    config_source_version: defaultConfigSourceVersion()
                }
            });
            appendSettlementSampleFromRuntime(sample);
            const readyState = typeof getSettlementSampleAuthorityReadinessFromRuntime === "function"
                ? getSettlementSampleAuthorityReadinessFromRuntime(sample)
                : { ready: false };
            setCalibrationPanelStatus(
                readyState.ready
                    ? "已保存当前 workspace 为本地结算样本，并进入 authority-ready 统计。"
                    : "已保存当前 workspace 为本地结算样本；如补齐实际数量，可进入 authority-ready 统计。"
            );
            renderCalibrationPanel();
            return sample;
        }

        function createEmptyFieldValues() {
            const fieldValues = {};
            getFieldCatalogItems().forEach((field) => {
                fieldValues[field.id] = null;
            });
            return fieldValues;
        }

        function clearWorkspace() {
            resetSolveSession({ clearCaches: true });
            workspaceState.field_values = createEmptyFieldValues();
            workspaceState.field_value_meta = {};
            persistWorkspaceState();
            renderFields();
            resetOutputToWaiting();
            isDirty = false;
            setStatusAppearance("idle");
            updateComputeUi();
        }

        function createBlankTemplate() {
            const id = `local_${Date.now()}`;
            return {
                id,
                label: "新建模板",
                description: "本地模板",
                groups: [{ id: "custom", label: "自定义字段" }],
                fields: []
            };
        }

        if (openConfigButton) {
            openConfigButton.addEventListener("click", (event) => {
                if (openConfigButton.dataset && openConfigButton.dataset.configPage) return;
                if (event && typeof event.preventDefault === "function") event.preventDefault();
                openConfigModal();
            });
        }
        if (closeConfigButton) closeConfigButton.addEventListener("click", closeConfigModal);
        if (saveConfigButton) saveConfigButton.addEventListener("click", handleSaveConfig);
        if (resetConfigButton) resetConfigButton.addEventListener("click", handleResetConfig);
        if (exportConfigButton) exportConfigButton.addEventListener("click", handleExportConfig);
        if (importConfigButton) {
            importConfigButton.addEventListener("click", () => {
                if (importConfigFile && typeof importConfigFile.click === "function") {
                    importConfigFile.click();
                }
            });
        }
        if (importConfigFile) {
            importConfigFile.addEventListener("change", () => {
                const file = importConfigFile.files && importConfigFile.files[0];
                if (!file || typeof file.text !== "function") return;
                file.text().then((text) => handleImportConfigText(text));
            });
        }
        Object.entries(calibrationModeButtons).forEach(([mode, button]) => {
            if (!button) return;
            button.addEventListener("click", () => {
                calibrationPanelMode = mode;
                persistCalibrationMode();
                setCalibrationPanelStatus(mode === "draft" ? "当前处于本地草稿模式。" : "当前处于直接应用模式。");
                renderCalibrationPanel();
            });
        });
        if (calibrationApplyDraftButton) {
            calibrationApplyDraftButton.addEventListener("click", applyCalibrationDraftToWorkspace);
        }
        if (calibrationResetAuthorityButton) {
            calibrationResetAuthorityButton.addEventListener("click", resetCalibrationToAuthority);
        }
        if (calibrationExportDraftButton) {
            calibrationExportDraftButton.addEventListener("click", () => {
                downloadJsonFile("auction-king-calibration-draft.json", exportCalibrationPayload("draft"));
            });
        }
        if (calibrationExportAppliedButton) {
            calibrationExportAppliedButton.addEventListener("click", () => {
                downloadJsonFile("auction-king-calibration-applied.json", exportCalibrationPayload("applied"));
            });
        }
        if (calibrationExportSamplesButton) {
            calibrationExportSamplesButton.addEventListener("click", () => {
                downloadJsonFile("auction-king-settlement-samples.json", exportSettlementSamplePayload());
            });
        }
        if (calibrationExportFilteredReplaySamplesButton) {
            calibrationExportFilteredReplaySamplesButton.addEventListener("click", () => {
                const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
                const payload = exportFilteredReplaySamplePayload(mapId);
                const filterValue = payload && payload.export_context ? payload.export_context.filter_value : "all";
                const filename = buildReplayPackageFilename(mapId, filterValue);
                const reportFilename = buildReplayReportFilename(mapId, filterValue);
                downloadJsonFile(filename, payload);
                if (payload && Array.isArray(payload.samples) && payload.samples.length > 0) {
                    const selectedCount = payload.export_context && Number.isFinite(payload.export_context.selected_sample_count)
                        ? payload.export_context.selected_sample_count
                        : payload.samples.length;
                    const skippedCount = payload.export_context && Number.isFinite(payload.export_context.skipped_sample_count)
                        ? payload.export_context.skipped_sample_count
                        : Math.max(0, selectedCount - payload.samples.length);
                    setCalibrationPanelStatus(`已导出当前筛选 ${selectedCount} 条，其中可回放 ${payload.samples.length} 条，跳过 ${skippedCount} 条；当前 ${calibrationPanelMode} 候选配置已内嵌；文件 ${filename}；报告默认将写入 ${reportFilename}；下一步在 repo 执行 npm run build:settlement-calibration-replay -- /absolute/path/to/${filename}`);
                    return;
                }
                setCalibrationPanelStatus("当前筛选没有可回放样本可导出；至少需要 observed_state/field_values/state 和 actual_counts。");
            });
        }
        if (calibrationExportFilteredAuthoritySamplesButton) {
            calibrationExportFilteredAuthoritySamplesButton.addEventListener("click", () => {
                const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
                const result = exportFilteredAuthoritySamplePayload(mapId);
                const filename = `auction-king-authority-battle-samples-${mapId}-${sanitizeReplayFilterSlug(result.filterValue)}.json`;
                downloadJsonFile(filename, result.authorityPackage);
                if (Array.isArray(result.samples) && result.samples.length > 0) {
                    markAuthoritySamplesExported(result.samples.map((entry) => entry.id), result.exportContext);
                    const skippedCount = Math.max(0, result.selectedCount - result.samples.length);
                    setCalibrationPanelStatus(`已导出当前筛选 ${result.selectedCount} 条，其中可发布 ${result.samples.length} 条，跳过 ${skippedCount} 条；文件 ${filename}；下一步在 repo 执行 npm run build:authority-from-samples -- /absolute/path/to/${filename}`);
                    renderCalibrationPanel();
                    return;
                }
                setCalibrationPanelStatus("当前筛选没有可发布的 Authority Battle Samples；至少需要 observed_state/field_values/state 和 actual_counts。");
            });
        }
        if (calibrationExportCurrentMapAuthoritySamplesButton) {
            calibrationExportCurrentMapAuthoritySamplesButton.addEventListener("click", () => {
                const mapId = workspaceState.active_map_id || currentConfig.app.default_map_id;
                const result = buildAuthorityExportPackagePayload({
                    mapId,
                    sampleIds: getCurrentMapSettlementSamples(mapId).map((sample) => sample.id),
                    scope: "current_map",
                    filterValue: "all",
                    filterLabel: "全部样本"
                });
                downloadJsonFile(`auction-king-authority-battle-samples-${mapId}.json`, result.authorityPackage);
                if (Array.isArray(result.samples) && result.samples.length > 0) {
                    markAuthoritySamplesExported(result.samples.map((entry) => entry.id), result.exportContext);
                    setCalibrationPanelStatus(`已导出当前地图 ${mapId} 的 ${result.samples.length} 条 Authority Battle Samples；下一步在 repo 执行 npm run build:authority-from-samples -- /absolute/path/to/auction-king-authority-battle-samples-${mapId}.json`);
                    renderCalibrationPanel();
                    return;
                }
                setCalibrationPanelStatus("当前地图没有 authority-ready 样本可导出；不会带出其他地图样本。");
            });
        }
        if (calibrationCaptureSampleButton) {
            calibrationCaptureSampleButton.addEventListener("click", captureCurrentWorkspaceAsSettlementSample);
        }
        if (calibrationExportAuthoritySamplesButton) {
            calibrationExportAuthoritySamplesButton.addEventListener("click", () => {
                const result = buildAuthorityExportPackagePayload({
                    mapId: null,
                    sampleIds: getSettlementSamples().map((sample) => sample.id),
                    scope: "global",
                    filterValue: "all",
                    filterLabel: "全部样本"
                });
                downloadJsonFile("auction-king-authority-battle-samples.json", result.authorityPackage);
                if (Array.isArray(result.samples) && result.samples.length > 0) {
                    markAuthoritySamplesExported(result.samples.map((entry) => entry.id), result.exportContext);
                    setCalibrationPanelStatus(`已导出 ${result.samples.length} 条 Authority Battle Samples；下一步在 repo 执行 npm run build:authority-from-samples -- /absolute/path/to/auction-king-authority-battle-samples.json`);
                    renderCalibrationPanel();
                    return;
                }
                setCalibrationPanelStatus("当前没有 authority-ready 样本可导出；至少需要 observed_state/field_values/state 和 actual_counts。");
            });
        }
        if (calibrationImportDraftButton && calibrationImportDraftFile) {
            calibrationImportDraftButton.addEventListener("click", () => calibrationImportDraftFile.click());
            calibrationImportDraftFile.addEventListener("change", () => {
                const file = calibrationImportDraftFile.files && calibrationImportDraftFile.files[0];
                if (!file || typeof file.text !== "function") return;
                file.text().then((text) => importCalibrationPayload(text, "draft"));
            });
        }
        if (calibrationImportAppliedButton && calibrationImportAppliedFile) {
            calibrationImportAppliedButton.addEventListener("click", () => calibrationImportAppliedFile.click());
            calibrationImportAppliedFile.addEventListener("change", () => {
                const file = calibrationImportAppliedFile.files && calibrationImportAppliedFile.files[0];
                if (!file || typeof file.text !== "function") return;
                file.text().then((text) => importCalibrationPayload(text, "applied"));
            });
        }
        if (calibrationImportSamplesButton && calibrationImportSamplesFile) {
            calibrationImportSamplesButton.addEventListener("click", () => calibrationImportSamplesFile.click());
            calibrationImportSamplesFile.addEventListener("change", () => {
                const file = calibrationImportSamplesFile.files && calibrationImportSamplesFile.files[0];
                if (!file || typeof file.text !== "function") return;
                file.text().then((text) => importSettlementSamplesText(text));
            });
        }
        if (calibrationClearSamplesButton) {
            calibrationClearSamplesButton.addEventListener("click", clearSettlementSamplesFromPanel);
        }
        Object.entries(configViewButtons).forEach(([view, button]) => {
            if (!button) return;
            button.addEventListener("click", () => renderConfigModalView(view));
        });

        if (moreFieldsSearchInput) {
            moreFieldsSearchInput.addEventListener("input", (event) => {
                moreFieldsSearchTerm = String(event.currentTarget.value || "").trim().toLowerCase();
                if (moreFieldsPanel) moreFieldsPanel.open = true;
                renderFields();
            });
        }
        Object.entries(moreFieldsFilterButtons).forEach(([filterKey, button]) => {
            if (!button) return;
            button.addEventListener("click", () => {
                activeMoreFieldsFilter = filterKey;
                if (moreFieldsPanel) moreFieldsPanel.open = true;
                renderFields();
            });
        });

        if (templateSelect) {
            templateSelect.addEventListener("change", () => {
                workspaceState.active_template_id = templateSelect.value;
                persistWorkspaceState();
                renderFields();
                setStatusAppearance("pending");
                isDirty = true;
                updateComputeUi();
            });
        }

        if (mapSelect) {
            mapSelect.addEventListener("change", () => {
                workspaceState.active_map_id = mapSelect.value;
                persistWorkspaceState();
                invalidateResolvedConfigCache();
                clearEngineCaches();
                setStatusAppearance("pending");
                isDirty = true;
                updateComputeUi();
                renderCalibrationPanel();
                executeEngine();
            });
        }

        if (clearButton) clearButton.addEventListener("click", clearWorkspace);
        if (saveClipboardScreenshotButton) {
            saveClipboardScreenshotButton.addEventListener("click", () => {
                saveClipboardScreenshotCapture();
            });
        }
        if (organizeChainButton) {
            organizeChainButton.addEventListener("click", () => {
                isOrganizingChain = !isOrganizingChain;
                renderFields();
            });
        }
        if (cloneTemplateButton) {
            cloneTemplateButton.addEventListener("click", () => {
                const activeTemplate = getActiveTemplate();
                if (!activeTemplate) return;
                const cloned = cloneTemplateDefinitionFromRuntime(activeTemplate, {
                    id: `local_${Date.now()}`,
                    label: `${activeTemplate.label} 副本`
                });
                localTemplates = upsertLocalTemplateFromRuntime(localTemplates, cloned);
                workspaceState.active_template_id = cloned.id;
                persistLocalTemplates();
                persistWorkspaceState();
                rebuildEffectiveConfig();
                populateTemplateSelect();
                renderFields();
            });
        }
        if (newTemplateButton) {
            newTemplateButton.addEventListener("click", () => {
                const blankTemplate = createBlankTemplate();
                localTemplates = upsertLocalTemplateFromRuntime(localTemplates, blankTemplate);
                workspaceState.active_template_id = blankTemplate.id;
                persistLocalTemplates();
                persistWorkspaceState();
                rebuildEffectiveConfig();
                populateTemplateSelect();
                renderFields();
            });
        }
        if (deleteTemplateButton) {
            deleteTemplateButton.addEventListener("click", () => {
                if (!isLocalTemplate(workspaceState.active_template_id)) return;
                localTemplates = removeLocalTemplateByIdFromRuntime(localTemplates, workspaceState.active_template_id);
                workspaceState.active_template_id = currentConfig.app.default_template_id;
                persistLocalTemplates();
                persistWorkspaceState();
                rebuildEffectiveConfig();
                populateTemplateSelect();
                renderFields();
            });
        }

        populateMapSelect();
        populateTemplateSelect();
        renderFields();
        renderCalibrationPanel();
        resetOutputToWaiting();
        setStatusAppearance("idle");
        updateComputeUi();
        executeEngine();
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        buildCalibrationReplayCandidateConfig,
        buildReplayPackageExportPayload,
        buildReplayPackageFilename,
        buildReplayReportFilename,
        escapeHtml,
        shouldFallbackToMainThreadFullSolve,
        parseLooseNumber,
        formatPercent,
        formatNumber
    };
}
