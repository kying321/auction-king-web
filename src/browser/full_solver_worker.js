import "../core/source_data_runtime.js?v=20260508020400";
import "../core/authority_calibration_runtime.js?v=20260508020400";
import "../core/average_observation_runtime.js?v=20260508020400";
import "../core/posterior_runtime.js?v=20260508020400";
import "../core/count_constraint_runtime.js?v=20260508020400";
import "../core/valuation_runtime.js?v=20260508020400";
import "../core/estimator.js?v=20260508020400";

self.onmessage = function onWorkerMessage(event) {
    const payload = event && event.data ? event.data : null;
    if (!payload || payload.type !== "solve") return;

    const { requestId, cacheKey, resolvedConfig, stateVars, solverOverride } = payload;

    try {
        const effectiveConfig = solverOverride
            ? {
                ...resolvedConfig,
                solver: {
                    ...(resolvedConfig && resolvedConfig.solver ? resolvedConfig.solver : {}),
                    ...solverOverride
                }
            }
            : resolvedConfig;
        const AuctionKingEstimatorFromGlobal = globalThis.AuctionKingEstimator;
        if (typeof AuctionKingEstimatorFromGlobal !== "function") {
            throw new Error("完整求解器不可用。");
        }
        const estimator = new AuctionKingEstimatorFromGlobal(effectiveConfig, stateVars);
        const result = estimator.recompute();
        self.postMessage({
            type: "solve_result",
            requestId,
            cacheKey,
            result
        });
    } catch (error) {
        self.postMessage({
            type: "solve_result",
            requestId,
            cacheKey,
            result: {
                error: true,
                messages: [`后台完整求解失败：${error && error.message ? error.message : String(error)}`]
            }
        });
    }
};
