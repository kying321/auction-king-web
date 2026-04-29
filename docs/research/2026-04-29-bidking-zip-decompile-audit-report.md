# BidKing decompile audit

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-zip-decompile-audit-report.json`
- Source: `<local-bidking.zip>`
- Source type: `zip`
- Mechanics recovery: `complete_package_table_and_hotupdate_evidence_ready`
- Evidence confidence: `medium`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Core refactor recommended now: `false`
- Live/order/funds path touched: `false`

## Inventory

| signal | value |
| --- | --- |
| file count | `8240` |
| il2cpp source files | `0` |
| top-level files | BidKing.exe, GameAssembly.dll, UnityCrashHandler64.exe, UnityPlayer.dll, baselib.dll |
| top-level dirs | BidKing_BackUpThisFolder_ButDontShipItWithYourGame, BidKing_Data |
| BidKing_Data | `BidKing_Data` |
| GameAssembly.dll | `GameAssembly.dll` |
| UnityPlayer.dll | `UnityPlayer.dll` |
| global-metadata.dat | `BidKing_Data/il2cpp_data/Metadata/global-metadata.dat` |
| StreamingAssets/Tables files | `52` |
| hot-update assemblies | `16` |
| managed assemblies | `63` |
| missing full recovery inputs | - |
| PE format | `zip_member_not_extracted` |
| PE sections | - |

## Decompiled Type Scan

- Total type comments: `0`
- Non-plugin type comments: `0`
- Gameplay-looking type comments: `0`
- Gameplay samples: `-`
- Non-plugin samples: `-`

## Impact

- Useful now: `complete Unity package inventory is now available as reverse-engineering intake`, `StreamingAssets tables and hot-update assemblies can feed a source-owned mechanics report`, `validation pressure: keep reverse-engineered findings as review-source artifacts, not default weights`
- Not useful now: `inventory alone is not enough to rewrite estimator.js, default_config_bundle.js, or authority calibration`, `table schemas and decompiled method semantics still need review-source artifacts`, `manual validation and replay gates must pass before authority merge`
- Refactor position: `add a reverse_engineering_evidence source lane before considering model refactors`
- Proposed source lane: `bidking_decompile_inventory` -> `bidking_table_mechanics` -> `mechanics_candidate_extraction` -> `manual_mechanics_review` -> `shadow_replay_candidate` -> `authority_handoff_gate`

## Conclusion

Current `BidKing.zip` evidence is strong enough to continue source-owned mechanics extraction from StreamingAssets tables and hot-update assemblies. It is still not authority for default weights or solver rewrites until table schemas, method semantics, manual mechanics review, shadow replay, and authority handoff gates pass.
