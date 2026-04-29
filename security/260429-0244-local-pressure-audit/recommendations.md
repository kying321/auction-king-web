# Recommendations

## Next High-Value Fixes

1. Add browser import byte limits for config, calibration, settlement samples, and screenshots.
2. Add array-count caps for local settlement sample imports.
3. Add a release smoke that fetches deployed headers from `ak.fuuu.fun` after explicit deploy authorization.
4. Consider signed/manual-confirmation manifests if multiple people edit review JSON outside the local trust boundary.

## Current Non-Issues

- Manual confirmation drafts remain blocked until approved and count-consistent.
- Pixel/OCR/system hints are blocked from count-fit training labels.
- Generated review HTML escapes malicious metadata in element text, attributes, and script JSON.
