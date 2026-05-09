# BidKing authenticated Steam table download runner

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-05-07-bidking-authenticated-steam-table-download-runner-report.json`
- Execute requested: `true`
- Username provided: `false`
- Auth mode: `qr`
- Safe execute auth mode: `true`
- DepotDownloader available: `true`
- Download blocked reason: `qr_requires_interactive_terminal`
- Download attempted: `false`
- Downloader exit code: `-`
- Downloader signal: `-`
- Downloader error code: `-`
- Downloader timed out: `false`
- Table files downloaded: `false`
- Source item row recovered: `false`
- Authority intake allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Redacted Command

```bash
'/tmp/ak_depotdownloader_3_4_0_arm64/DepotDownloader' '-app' '4128580' '-depot' '4128581' '-manifest' '7599723101430486725' '-filelist' '/tmp/ak_bidking_4128581_tables_filelist.txt' '-dir' '/tmp/ak_bidking_depot_4128581_tables_owned' '-validate' '-qr'
```

## Decision

This runner prepares or executes only the selective Steam table download. It never records Steam passwords, tokens, or 2FA codes, and it never opens authority, replay, or default-config gates.
