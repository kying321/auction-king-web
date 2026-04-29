# BidKing public authority source search

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-public-authority-source-search-report.json`
- Target item id: `1106013`
- Direct public authority row found: `false`
- SteamDB visible manifest count: `25`
- Visible Item.txt change count: `0`
- Steam older manifest path viable: `false`
- Authority intake allowed: `false`
- Staging item ingest allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Manifest History

| seen at UTC | manifest | table changes |
| --- | --- | --- |
| `2026-03-27T10:07:30Z` | `1315456865473715661` | [] |
| `2026-03-08T04:43:10Z` | `4886628206852187961` | ["Modified BidKing_Data/StreamingAssets/Tables/BidMap.txt","Modified BidKing_Data/StreamingAssets/Tables/UIWnd.txt"] |
| `2026-03-06T23:56:38Z` | `5576874997177669598` | [] |
| `2026-03-05T07:51:12Z` | `8698809290618236723` | [] |
| `2026-03-05T00:34:06Z` | `4182572642630314667` | [] |
| `2026-03-05T00:10:14Z` | `2340981591259985735` | [] |
| `2026-03-03T12:28:33Z` | `2153546685868663515` | [] |
| `2026-03-03T08:09:25Z` | `5131151526784359445` | [] |
| `2026-03-03T05:22:08Z` | `6031622431758926749` | [] |
| `2026-03-03T04:44:35Z` | `5022372084761066812` | [] |
| `2026-03-02T16:07:29Z` | `6349242050786958380` | [] |
| `2026-03-02T11:55:28Z` | `5876006455415871414` | [] |
| `2026-03-01T06:33:28Z` | `2370499148997698552` | [] |
| `2026-02-28T11:16:37Z` | `3563099403767696362` | [] |
| `2026-02-27T11:44:25Z` | `8212627120037214570` | [] |
| `2026-02-26T23:33:38Z` | `2793736098442106886` | [] |
| `2026-02-25T15:33:16Z` | `9171888562104012148` | [] |
| `2026-02-25T08:23:23Z` | `6930259792601057946` | [] |
| `2026-02-25T07:52:02Z` | `151962360258298603` | [] |
| `2026-02-24T12:36:09Z` | `6596320064435764614` | [] |
| `2026-02-24T11:15:35Z` | `7487338112914403735` | [] |
| `2026-02-24T05:12:37Z` | `6641342558605775562` | [] |
| `2026-02-23T18:52:15Z` | `340218291271457690` | [] |
| `2026-02-23T18:26:32Z` | `7350724336958074923` | [] |
| `2026-02-23T14:25:33Z` | `4903037663004784443` | [] |

## Candidate Paths

| path | status | priority | can enter intake |
| --- | --- | --- | --- |
| `steam_older_manifest_selective_tables_download` | `demoted_after_manifest_history_scan` | `low` | `false` |
| `developer_or_server_side_table_export` | `recommended` | `high` | `true` |
| `independent_older_client_package_outside_visible_steam_history` | `possible_but_unproven` | `medium` | `true` |

## Blockers

- `no_direct_public_item_row_found`
- `steam_visible_manifest_history_has_no_item_txt_change`
- `current_public_manifest_has_authority_gap`
- `developer_or_server_side_table_export_required`

## Decision

Logged-in SteamDB history does not show any visible `Item.txt` change, so old public Steam manifest download is demoted. The next authority-grade path is a developer/server-side table export or an independently sourced complete `StreamingAssets/Tables` package with a raw `1106013\t` row.
