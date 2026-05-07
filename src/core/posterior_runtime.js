function defaultNormalPdf(x, mean, sd) {
    const safeSd = Math.max(sd, 1e-9);
    const z = (x - mean) / safeSd;
    return Math.exp(-0.5 * z * z) / (safeSd * Math.sqrt(2 * Math.PI));
}

function normalizePosteriorMass(counts, weights) {
    if (!counts || counts.length === 0) return [];

    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];

    if (total <= 0) {
        const uniformProb = 1 / counts.length;
        return counts.map((count) => ({ count, prob: uniformProb }));
    }

    return counts.map((count, index) => ({ count, prob: weights[index] / total }));
}

function summarizePosteriorMass(mass) {
    if (!mass || mass.length === 0) {
        return { mean_cells: 0, p10_cells: 0, p90_cells: 0 };
    }

    let mean_cells = 0;
    for (let i = 0; i < mass.length; i++) {
        mean_cells += mass[i].count * mass[i].prob;
    }

    let running = 0;
    let p10_cells = mass[0].count;
    let p90_cells = mass[mass.length - 1].count;
    let seen10 = false;

    for (let i = 0; i < mass.length; i++) {
        running += mass[i].prob;
        if (!seen10 && running >= 0.10) {
            p10_cells = mass[i].count;
            seen10 = true;
        }
        if (running >= 0.90) {
            p90_cells = mass[i].count;
            break;
        }
    }

    return { mean_cells, p10_cells, p90_cells };
}

function accumulatePosteriorMass(targetMap, mass, stateWeight) {
    if (!mass || mass.length === 0 || !Number.isFinite(stateWeight) || stateWeight <= 0) return;
    for (let i = 0; i < mass.length; i++) {
        const entry = mass[i];
        if (!entry || !Number.isFinite(entry.count) || !Number.isFinite(entry.prob) || entry.prob <= 0) continue;
        const count = entry.count;
        targetMap[count] = (targetMap[count] || 0) + stateWeight * entry.prob;
    }
}

function summarizePosteriorMassMap(massMap) {
    const counts = Object.keys(massMap).map((count) => parseInt(count, 10)).sort((a, b) => a - b);
    if (counts.length === 0) return { mean_cells: 0, p10_cells: 0, p90_cells: 0 };
    const mass = normalizePosteriorMass(counts, counts.map((count) => massMap[count]));
    return summarizePosteriorMass(mass);
}

function normalizeLabeledWeights(entries) {
    if (!entries || entries.length === 0) return [];

    let total = 0;
    for (let i = 0; i < entries.length; i++) {
        total += entries[i].weight;
    }

    if (total <= 0) {
        const uniformProb = 1 / entries.length;
        return entries.map((entry) => ({ ...entry, prob: uniformProb }));
    }

    return entries.map((entry) => ({ ...entry, prob: entry.weight / total }));
}

function approxPosteriorMass(posterior, normalPdfFn = defaultNormalPdf) {
    if (!posterior) return [];
    if (posterior.mass && posterior.mass.length > 0) return posterior.mass;

    const low = Math.max(0, Math.round(posterior.p10_cells));
    const high = Math.max(low, Math.round(posterior.p90_cells));

    if (low === high) {
        return [{ count: low, prob: 1 }];
    }

    const sd = Math.max((high - low) / 2.56, 0.5);
    const points = [];
    let total = 0;

    for (let count = low; count <= high; count++) {
        const weight = normalPdfFn(count, posterior.mean_cells, sd);
        points.push({ count, weight });
        total += weight;
    }

    if (total <= 0) {
        const uniformProb = 1 / points.length;
        return points.map((point) => ({ count: point.count, prob: uniformProb }));
    }

    return points.map((point) => ({ count: point.count, prob: point.weight / total }));
}

function accumulateConvolvedTotalMass(currentMap, mass) {
    const nextMap = {};
    const currentEntries = Object.entries(currentMap);
    for (let i = 0; i < currentEntries.length; i += 1) {
        const [totalKey, totalProb] = currentEntries[i];
        const total = parseInt(totalKey, 10);
        for (let j = 0; j < mass.length; j += 1) {
            const entry = mass[j];
            if (!entry || !Number.isFinite(entry.count) || !Number.isFinite(entry.prob) || entry.prob <= 0) continue;
            const nextTotal = total + entry.count;
            nextMap[nextTotal] = (nextMap[nextTotal] || 0) + totalProb * entry.prob;
        }
    }
    return nextMap;
}

function getAllowedTotalMassProbability(masses, allowedTotals) {
    if (!Array.isArray(masses) || masses.length === 0) return 0;
    const allowedSet = new Set(Array.isArray(allowedTotals) ? allowedTotals : []);
    if (allowedSet.size === 0) return 0;

    let totalMap = { 0: 1 };
    for (let i = 0; i < masses.length; i += 1) {
        const mass = masses[i];
        if (!Array.isArray(mass) || mass.length === 0) return 0;
        totalMap = accumulateConvolvedTotalMass(totalMap, mass);
    }

    let probability = 0;
    const totalEntries = Object.entries(totalMap);
    for (let i = 0; i < totalEntries.length; i += 1) {
        const [totalKey, totalProb] = totalEntries[i];
        if (allowedSet.has(parseInt(totalKey, 10))) probability += totalProb;
    }
    return probability;
}

const posteriorRuntime = {
    normalizePosteriorMass,
    summarizePosteriorMass,
    accumulatePosteriorMass,
    summarizePosteriorMassMap,
    normalizeLabeledWeights,
    approxPosteriorMass,
    accumulateConvolvedTotalMass,
    getAllowedTotalMassProbability
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = posteriorRuntime;
}

if (typeof globalThis !== "undefined") {
    globalThis.AK_POSTERIOR_RUNTIME = posteriorRuntime;
}
