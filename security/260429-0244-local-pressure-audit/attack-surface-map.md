# Attack Surface Map

| Surface | Entry Point | Current Defense | Result |
| --- | --- | --- | --- |
| Static deploy headers | `_headers`, `dist/_headers` | CSP, frame-ancestors, nosniff, referrer, permissions policy | fixed |
| Manual confirmation HTML | `formatCodexVisualManualConfirmationResultsHtml` | HTML escaping and script JSON escaping | tested |
| Manual confirmation import | `build_count_fit_sample_review_import.js` | status, manual source, timestamp, full counts, total consistency gates | tested |
| Solver CPU budget | `deriveAdaptiveSolverBudget` | shipped hard cap for states and MC samples | fixed |
| Full solver worker timeout | `createFullSolveRuntime` + `app.js` onError | timeout no longer falls back to main thread | fixed |
| OCR subprocess | `runTesseractOnBuffer` | 5000ms bounded timeout and SIGKILL | fixed |
| Browser local import | `handleImportConfigText`, `importCalibrationPayload`, `importSettlementSamplesText` | JSON parse try/catch only | residual |
| Screenshot import | `readScreenshotFileAsDataUrl` | compression after full read; min-dimension validation | residual |
