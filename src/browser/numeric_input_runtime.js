function parseLooseNumber(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value)
        .trim()
        .replace(/[，,\s]/g, "")
        .replace(/。/g, ".");
    if (!normalized) return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
}

function getStepPrecision(stepValue) {
    const text = String(stepValue || "1");
    if (/e-/i.test(text)) {
        const exponent = Number(text.split(/e-/i)[1]);
        return Number.isFinite(exponent) ? exponent : 0;
    }
    const decimalPart = text.split(".")[1];
    return decimalPart ? decimalPart.length : 0;
}

function formatStepValue(value, stepValue) {
    const precision = Math.min(6, getStepPrecision(stepValue));
    return precision > 0 ? value.toFixed(precision) : String(Math.round(value));
}

function normalizeFiniteNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function configureNumericInput(input, options = {}) {
    if (!input) return input;
    const step = options.step === null || options.step === undefined ? "1" : String(options.step);
    const precision = getStepPrecision(step);
    input.type = "text";
    input.inputMode = precision > 0 || options.decimal === true ? "decimal" : "numeric";
    input.step = step;
    if (options.min !== undefined && options.min !== null) input.min = String(options.min);
    if (options.max !== undefined && options.max !== null) input.max = String(options.max);
    if (typeof input.setAttribute === "function") {
        input.setAttribute("data-numeric-input", precision > 0 || options.decimal === true ? "decimal" : "integer");
        input.setAttribute("autocomplete", "off");
        input.setAttribute("spellcheck", "false");
    }
    return input;
}

function getWheelStepDirection(event) {
    const deltaY = Number(event && event.deltaY);
    if (Number.isFinite(deltaY) && deltaY !== 0) return deltaY > 0 ? -1 : 1;
    const wheelDelta = Number(event && event.wheelDelta);
    if (Number.isFinite(wheelDelta) && wheelDelta !== 0) return wheelDelta > 0 ? 1 : -1;
    const detail = Number(event && event.detail);
    if (Number.isFinite(detail) && detail !== 0) return detail > 0 ? -1 : 1;
    return 0;
}

function bindNumericWheelStepper(input, onValueChange) {
    if (!input || typeof input.addEventListener !== "function") return;
    const marker = typeof input.getAttribute === "function"
        ? input.getAttribute("data-numeric-input")
        : (input.dataset && input.dataset.numericInput ? input.dataset.numericInput : null);
    if (!marker && input.type !== "number") return;
    input.addEventListener("wheel", (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        const direction = getWheelStepDirection(event);
        if (!direction) return;
        const stepValue = input.step || "1";
        const step = Number(stepValue);
        const current = parseLooseNumber(input.value);
        const min = normalizeFiniteNumber(input.min);
        const max = normalizeFiniteNumber(input.max);
        let next = (current !== null ? current : 0) + direction * (Number.isFinite(step) && step > 0 ? step : 1);
        if (min !== null) next = Math.max(min, next);
        if (max !== null) next = Math.min(max, next);
        input.value = formatStepValue(next, stepValue);
        if (typeof onValueChange === "function") onValueChange(input.value);
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseLooseNumber,
        getStepPrecision,
        formatStepValue,
        configureNumericInput,
        bindNumericWheelStepper
    };
}

if (typeof window !== "undefined") {
    window.AK_NUMERIC_INPUT_RUNTIME = {
        parseLooseNumber,
        getStepPrecision,
        formatStepValue,
        configureNumericInput,
        bindNumericWheelStepper
    };
}
