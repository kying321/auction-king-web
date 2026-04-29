importScripts("estimator.js?v=20260428232030");

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
        const estimator = new AuctionKingEstimator(effectiveConfig, stateVars);
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
