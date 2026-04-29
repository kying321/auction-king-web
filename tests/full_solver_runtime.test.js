const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createFullSolveRuntime
} = require("../src/browser/full_solver_runtime.js");

function createMockWorker() {
    return {
        posted: [],
        terminated: false,
        onmessage: null,
        onerror: null,
        postMessage(payload) {
            this.posted.push(payload);
        },
        terminate() {
            this.terminated = true;
        }
    };
}

test("createFullSolveRuntime posts requests with monotonically increasing ids", () => {
    const worker = createMockWorker();
    const runtime = createFullSolveRuntime(() => worker, {});

    const firstId = runtime.dispatch({ cacheKey: "a", resolvedConfig: { map: "sunken" }, stateVars: { t: 1 } });
    const secondId = runtime.dispatch({ cacheKey: "b", resolvedConfig: { map: "villa" }, stateVars: { t: 2 } });

    assert.equal(firstId, 1);
    assert.equal(secondId, 2);
    assert.deepEqual(worker.posted[0], {
        type: "solve",
        requestId: 1,
        cacheKey: "a",
        resolvedConfig: { map: "sunken" },
        stateVars: { t: 1 },
        solverOverride: null
    });
    assert.deepEqual(worker.posted[1], {
        type: "solve",
        requestId: 2,
        cacheKey: "b",
        resolvedConfig: { map: "villa" },
        stateVars: { t: 2 },
        solverOverride: null
    });
});

test("createFullSolveRuntime ignores stale worker results and forwards only latest", () => {
    const worker = createMockWorker();
    const received = [];
    const runtime = createFullSolveRuntime(() => worker, {
        onResult: (payload) => received.push(payload)
    });

    runtime.dispatch({ cacheKey: "old", resolvedConfig: { map: "sunken" }, stateVars: { t: 1 } });
    runtime.dispatch({ cacheKey: "new", resolvedConfig: { map: "villa" }, stateVars: { t: 2 } });

    worker.onmessage({ data: { type: "solve_result", requestId: 1, cacheKey: "old", result: { mode: "full" } } });
    worker.onmessage({ data: { type: "solve_result", requestId: 2, cacheKey: "new", result: { mode: "full" } } });

    assert.deepEqual(received, [{ type: "solve_result", requestId: 2, cacheKey: "new", result: { mode: "full" } }]);
});

test("createFullSolveRuntime can terminate and reset worker instance", () => {
    const worker = createMockWorker();
    const runtime = createFullSolveRuntime(() => worker, {});

    runtime.dispatch({ cacheKey: "a", resolvedConfig: {}, stateVars: {} });
    runtime.terminate();

    assert.equal(worker.terminated, true);
});

test("createFullSolveRuntime ignores stale worker results after terminate", () => {
    const worker = createMockWorker();
    const received = [];
    const runtime = createFullSolveRuntime(() => worker, {
        onResult: (payload) => received.push(payload)
    });

    runtime.dispatch({ cacheKey: "a", resolvedConfig: {}, stateVars: {} });
    runtime.terminate();
    worker.onmessage({ data: { type: "solve_result", requestId: 1, cacheKey: "a", result: { phase: "full" } } });

    assert.deepEqual(received, []);
});

test("createFullSolveRuntime terminates worker when a stage exceeds timeout", async () => {
    const worker = createMockWorker();
    const receivedErrors = [];
    const runtime = createFullSolveRuntime(() => worker, {
        onError: (error) => receivedErrors.push(error.message)
    });

    runtime.dispatch({ cacheKey: "slow", resolvedConfig: {}, stateVars: {}, timeoutMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.equal(worker.terminated, true);
    assert.equal(receivedErrors.length, 1);
    assert.match(receivedErrors[0], /超时/);
});
