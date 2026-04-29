function createFullSolveRuntime(workerFactory, { onResult, onError } = {}) {
    let worker = null;
    let activeRequestId = 0;
    let activeTimeout = null;

    function clearActiveTimeout() {
        if (activeTimeout !== null) clearTimeout(activeTimeout);
        activeTimeout = null;
    }

    function ensureWorker() {
        if (worker) return worker;
        worker = workerFactory();
        worker.onmessage = (event) => {
            const payload = event && event.data ? event.data : null;
            if (!payload || payload.requestId !== activeRequestId) return;
            clearActiveTimeout();
            if (payload.type === "solve_result" && typeof onResult === "function") {
                onResult(payload);
            }
        };
        worker.onerror = (error) => {
            clearActiveTimeout();
            if (typeof onError === "function") onError(error);
        };
        return worker;
    }

    return {
        dispatch({ cacheKey, resolvedConfig, stateVars, solverOverride = null, timeoutMs = 0 }) {
            activeRequestId += 1;
            clearActiveTimeout();
            const currentRequestId = activeRequestId;
            if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
                activeTimeout = setTimeout(() => {
                    if (currentRequestId !== activeRequestId) return;
                    if (worker) {
                        worker.terminate();
                        worker = null;
                    }
                    clearActiveTimeout();
                    if (typeof onError === "function") {
                        onError(new Error(`后台求解超时（>${timeoutMs}ms）`));
                    }
                }, timeoutMs);
            }
            ensureWorker().postMessage({
                type: "solve",
                requestId: activeRequestId,
                cacheKey,
                resolvedConfig,
                stateVars,
                solverOverride
            });
            return activeRequestId;
        },
        terminate() {
            clearActiveTimeout();
            activeRequestId += 1;
            if (!worker) return;
            worker.terminate();
            worker = null;
        }
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        createFullSolveRuntime
    };
}

if (typeof window !== "undefined") {
    window.createFullSolveRuntime = createFullSolveRuntime;
}
