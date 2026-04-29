# BidKing decompile audit

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-28-bidking-decompile-audit-report.json`
- Source: `<local-bidking>`
- Mechanics recovery: `insufficient_package_for_bid_mechanics`
- Evidence confidence: `low`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Core refactor recommended now: `false`
- Live/order/funds path touched: `false`

## Inventory

| signal | value |
| --- | --- |
| file count | `28` |
| il2cpp source files | `5` |
| top-level files | .DS_Store, BidKing.exe, baselib.dll |
| top-level dirs | BidKing_BackUpThisFolder_ButDontShipItWithYourGame |
| BidKing_Data | `-` |
| GameAssembly.dll | `-` |
| global-metadata.dat | `-` |
| missing full recovery inputs | missing_BidKing_Data, missing_global_metadata_dat, missing_GameAssembly_dll |
| PE format | `PE32+` |
| PE sections | .text, .rdata, .data, .pdata, _RDATA, .rsrc, .reloc |

## Decompiled Type Scan

- Total type comments: `735`
- Non-plugin type comments: `29`
- Gameplay-looking type comments: `0`
- Gameplay samples: `-`
- Non-plugin samples: `GiphyDemo`, `GiphyDemo/<>c`, `GiphyDemo/<>c__DisplayClass28_0`, `Microsoft.Win32.SafeHandles.SafeFileHandle`, `Mono.Net.Security.MobileTlsProvider`, `Mono.Security.Interface.MonoTlsSettings`, `OnEnableTrigger`, `PGif`, `PGif/<>c__DisplayClass31_0`, `PGif/<>c__DisplayClass39_0`, `PGif/<>c__DisplayClass43_0`, `PGif/<>c__DisplayClass44_0`, `PGif/<>c__DisplayClass45_0`, `PGif/<>c__DisplayClass46_0`, `PGif/<>c__DisplayClass47_0`, `PGif/<>c__DisplayClass48_0`, `PGif/<>c__DisplayClass49_0`, `PGif/<>c__DisplayClass50_0`, `SRDebugger.IncrementAttribute`, `SRDebugger.Internal.InternalOptionsRegistry`

## Impact

- Useful now: `negative evidence: current BidKing package is not enough to recover bidding mechanics`, `validation pressure: keep reverse-engineered findings as review-source artifacts, not default weights`, `architecture direction: external mechanics should enter through a source-owned evidence lane and shadow gates`
- Not useful now: `no safe basis to rewrite estimator.js, default_config_bundle.js, or authority calibration from this package`, `no recovered item rarity, bid timing, opponent, settlement, or value formulas`, `no executable Unity data folder or IL2CPP metadata for asset/game-state correlation`
- Refactor position: `do not refactor core solver from this package; first acquire complete Unity data or authoritative samples`
- Proposed source lane: `bidking_decompile_inventory` -> `mechanics_candidate_extraction` -> `manual_mechanics_review` -> `shadow_replay_candidate` -> `authority_handoff_gate`

## Conclusion

Current local `BidKing` evidence is not strong enough to justify rewriting the solver, estimator, default weights, or authority calibration. Treat it as a reverse-engineering intake gap and acquire a complete package or source-level gameplay classes before any core refactor. If a complete build appears, route recovered mechanics through a source-owned evidence lane, manual mechanics review, shadow replay, and authority handoff gate before merge.
