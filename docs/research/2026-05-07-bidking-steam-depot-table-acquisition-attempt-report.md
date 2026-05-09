# BidKing Steam depot table acquisition attempt

- Change class: `RESEARCH_ONLY`
- Recommended change class: `SIM_ONLY`
- JSON: `docs/research/2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.json`
- Target item id: `1106013`
- Current full-client depot: `4128581`
- Download attempted: `true`
- DepotDownloader available: `true`
- Steam account access blocked: `true`
- Table files downloaded: `false`
- Source item row recovered: `false`
- Authority intake allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`
- Recommended next action: `retry_with_owned_authenticated_steam_account_or_developer_export`

## Attempts

| attempt | exit code | evidence |
| --- | ---: | --- |
| `anonymous_noauth_blocked` | `1` | Using filelist: '/tmp/ak_bidking_4128581_tables_filelist.txt'. No username given. Using anonymous account with dedicated server subscription. Connecting to Steam3... Done! Logging anonymously into Steam3... Done! Using S |

## Blockers

- `steam_depot_requires_owned_authenticated_account`
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

The current full-client depot path remains viable only with owned authenticated Steam access or an equivalent developer/server-side table export. Do not synthesize `1106013`, do not drop the `1066 -> 1106013` tuple, and do not update defaults from this attempt.
