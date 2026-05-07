const averageObservationRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./average_observation_runtime.js")
    : (typeof AK_AVERAGE_OBSERVATION_RUNTIME !== "undefined" ? AK_AVERAGE_OBSERVATION_RUNTIME : (typeof globalThis !== "undefined" ? globalThis.AK_AVERAGE_OBSERVATION_RUNTIME : {}));

const {
    hasFeasibleAverageForCount,
    getAverageObservationOptionsForState
} = averageObservationRuntime;

function enumerateCountStates(config, state, solverBudget = null) {
    const s = state;
    const T = s.r1_total_items;
    if (T === null || T === undefined || isNaN(T)) return [];

    const known_b = s.r1_blue_count;
    const known_p = s.r2_purple_count;
    const known_o = s.r2_orange_count;
    const known_g = s.r3_green_count;
    const known_wg = s.r5_white_green_total;
    const known_w = s.r5_white_count;
    const known_o_avg = s.r2_orange_avg;
    const known_p_avg = s.r3_purple_avg;
    const known_b_avg = s.r4_blue_avg;
    const known_o_avg_text = s.r2_orange_avg_text;
    const known_p_avg_text = s.r3_purple_avg_text;
    const known_b_avg_text = s.r4_blue_avg_text;
    const custom_o_min = Number.isInteger(s.custom_o_min) ? s.custom_o_min : null;
    const custom_o_max = Number.isInteger(s.custom_o_max) ? s.custom_o_max : null;
    const custom_r_min = Number.isInteger(s.custom_r_min) ? s.custom_r_min : null;
    const custom_r_max = Number.isInteger(s.custom_r_max) ? s.custom_r_max : null;

    const results = [];
    const max_states = solverBudget && Number.isInteger(solverBudget.max_states)
        ? solverBudget.max_states
        : config.solver.max_states;
    const models = config.cells_per_item;
    const orangeAvgObservationOptions = getAverageObservationOptionsForState(config, s, "r2_orange_avg");
    const purpleAvgObservationOptions = getAverageObservationOptionsForState(config, s, "r3_purple_avg");
    const blueAvgObservationOptions = getAverageObservationOptionsForState(config, s, "r4_blue_avg");
    const orangeMinBound = Math.max(0, custom_o_min === null ? 0 : custom_o_min);
    const orangeMaxBound = custom_o_max === null ? Number.POSITIVE_INFINITY : custom_o_max;
    const redMinBound = Math.max(0, custom_r_min === null ? 0 : custom_r_min);
    const redMaxBound = custom_r_max === null ? Number.POSITIVE_INFINITY : custom_r_max;

    if (orangeMinBound > orangeMaxBound || redMinBound > redMaxBound) return [];

    const getOrangeRangeFromRemaining = (remainingAfterWhite) => {
        const lower = Math.max(
            0,
            orangeMinBound,
            Number.isFinite(redMaxBound) ? remainingAfterWhite - redMaxBound : -Infinity
        );
        const upper = Math.min(
            remainingAfterWhite,
            orangeMaxBound,
            remainingAfterWhite - redMinBound
        );
        if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) return null;
        return [lower, upper];
    };

    const getOrangeValuesFromRemaining = (remainingAfterWhite) => {
        const orangeRange = getOrangeRangeFromRemaining(remainingAfterWhite);
        if (!orangeRange) return [];
        if (known_o !== null) {
            return known_o >= orangeRange[0] && known_o <= orangeRange[1] ? [known_o] : [];
        }
        return Array.from({ length: orangeRange[1] - orangeRange[0] + 1 }, (_unused, offset) => orangeRange[0] + offset);
    };

    if (known_b !== null && !hasFeasibleAverageForCount(models.b, known_b, known_b_avg, { rawText: known_b_avg_text, ...blueAvgObservationOptions })) {
        return [];
    }

    const b_values = known_b !== null ? [known_b] : Array.from({ length: T + 1 }, (_, i) => i);

    for (const b of b_values) {
        if (b === null) continue;
        const rem1 = T - b;
        if (rem1 < 0) continue;

        const p_values = known_p !== null ? [known_p] : Array.from({ length: rem1 + 1 }, (_, i) => i);
        for (const p of p_values) {
            if (!hasFeasibleAverageForCount(models.p, p, known_p_avg, { rawText: known_p_avg_text, ...purpleAvgObservationOptions })) continue;
            const rem2 = rem1 - p;
            if (rem2 < 0) continue;

            const g_values = known_g !== null ? [known_g] : Array.from({ length: rem2 + 1 }, (_, i) => i);
            for (const g of g_values) {
                const rem3 = rem2 - g;
                if (rem3 < 0) continue;

                if (known_wg !== null) {
                    const w = known_w !== null ? known_w : known_wg - g;
                    if (known_w !== null && known_w + g !== known_wg) continue;
                    if (w < 0) continue;
                    const rem4 = rem3 - w;
                    if (rem4 < 0) continue;
                    const orangeValues = getOrangeValuesFromRemaining(rem4);
                    if (orangeValues.length === 0) continue;

                    for (let index = 0; index < orangeValues.length; index += 1) {
                        const o = orangeValues[index];
                        if (!hasFeasibleAverageForCount(models.o, o, known_o_avg, { rawText: known_o_avg_text, ...orangeAvgObservationOptions })) continue;
                        const r = rem4 - o;
                        results.push({ w, g, b, p, o, r });
                        if (results.length >= max_states) return results;
                    }
                } else if (known_w !== null) {
                    const w = known_w;
                    const rem4 = rem3 - w;
                    if (rem4 < 0) continue;
                    const orangeValues = getOrangeValuesFromRemaining(rem4);
                    if (orangeValues.length === 0) continue;

                    for (let index = 0; index < orangeValues.length; index += 1) {
                        const o = orangeValues[index];
                        if (!hasFeasibleAverageForCount(models.o, o, known_o_avg, { rawText: known_o_avg_text, ...orangeAvgObservationOptions })) continue;
                        const r = rem4 - o;
                        results.push({ w, g, b, p, o, r });
                        if (results.length >= max_states) return results;
                    }
                } else {
                    for (let w = 0; w <= rem3; w++) {
                        const rem4 = rem3 - w;
                        const orangeValues = getOrangeValuesFromRemaining(rem4);
                        if (orangeValues.length === 0) continue;
                        for (let index = 0; index < orangeValues.length; index += 1) {
                            const o = orangeValues[index];
                            if (!hasFeasibleAverageForCount(models.o, o, known_o_avg, { rawText: known_o_avg_text, ...orangeAvgObservationOptions })) continue;
                            const r = rem4 - o;
                            results.push({ w, g, b, p, o, r });
                            if (results.length >= max_states) return results;
                        }
                    }
                }
            }
        }
    }
    return results;
}

const countConstraintRuntime = {
    enumerateCountStates
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = countConstraintRuntime;
}

if (typeof globalThis !== "undefined") {
    globalThis.AK_COUNT_CONSTRAINT_RUNTIME = countConstraintRuntime;
}
