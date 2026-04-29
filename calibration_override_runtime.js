function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepMergeConfig(base = {}, override = {}) {
    if (!isPlainObject(base)) return cloneValue(override);
    const next = cloneValue(base);
    if (!isPlainObject(override)) return next;
    Object.entries(override).forEach(([key, value]) => {
        if (isPlainObject(value) && isPlainObject(next[key])) {
            next[key] = deepMergeConfig(next[key], value);
        } else {
            next[key] = cloneValue(value);
        }
    });
    return next;
}

function isStructuredWorkspaceConfig(config = {}) {
    return isPlainObject(config)
        && isPlainObject(config.app)
        && isPlainObject(config.model)
        && isPlainObject(config.maps);
}

function extractScopedOverrides(config = {}, globalKey, mapId = null) {
    if (!isPlainObject(config)) return {};
    const globalValue = isPlainObject(config.model) && isPlainObject(config.model[globalKey])
        ? config.model[globalKey]
        : isPlainObject(config[globalKey])
            ? config[globalKey]
            : {};
    const mapValue = mapId && isPlainObject(config.maps) && isPlainObject(config.maps[mapId]) && isPlainObject(config.maps[mapId][globalKey])
        ? config.maps[mapId][globalKey]
        : {};
    return deepMergeConfig(globalValue, mapValue);
}

function extractAlphaCountOverrides(config = {}, mapId = null) {
    return extractScopedOverrides(config, "alpha_counts", mapId);
}

function extractValueModelOverrides(config = {}, mapId = null) {
    return extractScopedOverrides(config, "value_model", mapId);
}

module.exports = {
    isPlainObject,
    cloneValue,
    deepMergeConfig,
    isStructuredWorkspaceConfig,
    extractAlphaCountOverrides,
    extractValueModelOverrides
};
