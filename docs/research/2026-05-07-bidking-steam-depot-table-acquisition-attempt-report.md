# BidKing Steam depot table acquisition attempt

- Change class: `RESEARCH_ONLY`
- Recommended change class: `SIM_ONLY`
- JSON: `docs/research/2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.json`
- Target item id: `1106013`
- Current full-client depot: `4128581`
- Download attempted: `true`
- DepotDownloader available: `true`
- Steam account access blocked: `false`
- Table files downloaded: `true`
- Source item row recovered: `false`
- Authority intake allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`
- Recommended next action: `acquire_developer_or_server_side_table_export_for_1106013`

## Attempts

| attempt | exit code | evidence |
| --- | ---: | --- |
| `-` | `-` | - |

## Blockers

- `downloaded_tables_missing_source_item_row_1106013`
- `source_item_row_1106013_not_recovered`
- `authority_handoff_gate_closed`

## Next Authenticated Commands

Create filelist `/tmp/ak_bidking_4128581_tables_filelist.txt` with:

```text
regex:.*BidKing_Data/StreamingAssets/Tables/(Item|Drop)\.txt$
regex:.*Tables/(Item|Drop)\.txt$
```

Run selective table download with an owned Steam account:

```bash
'/tmp/ak_depotdownloader_3_4_0_arm64/DepotDownloader' -app 4128580 -depot 4128581 -manifest 7599723101430486725 -username <STEAM_USERNAME> -filelist '/tmp/ak_bidking_4128581_tables_filelist.txt' -dir '/tmp/ak_bidking_depot_4128581_tables_owned' -validate
```

Then scan the downloaded tables:

```bash
npm run build:bidking-missing-item-source-recovery-scan -- docs/research/2026-05-07-bidking-1106013-resolution-candidate-refresh.json docs/research/2026-05-07-bidking-1106013-authenticated-steam-source-recovery-scan.json --source='/tmp/ak_bidking_depot_4128581_tables_owned' --generated-at=<ISO_TIMESTAMP>
```

## Decision

Downloaded full-client tables only count as authority when the raw `Item.txt` row is present. If the downloaded tables still miss `1106013`, continue with developer/server-side table export or an independently sourced complete table package. Do not synthesize `1106013`, do not drop the `1066 -> 1106013` tuple, and do not update defaults from this attempt.
