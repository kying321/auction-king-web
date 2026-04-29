# BidKing method callgraph report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-method-callgraph-report.json`
- Method metadata: `<repo>/docs/research/2026-04-29-bidking-method-metadata-report.json`
- Parse status: `method_metadata_callgraph_built`
- Evidence confidence: `medium`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- Live/order/funds path touched: `false`

## Coverage

| signal | value |
| --- | --- |
| method nodes | `56` |
| direct call edges | `521` |
| domain counts | {"skill_resolution":50,"async_task":40,"network_protocol":26,"auction_item_or_price":36,"table_lookup":33,"random_or_weight":9} |
| unresolved edges | `240` |
| unresolved ratio | `0.4607` |

## Bid Flow

| method | signature | request message | send call |
| --- | --- | --- | --- |
| PlayerManager.GameBid | System.Threading.Tasks.Task`1<bool>(int) | Protodata.C2S_34_game_bid..ctor | NetworkMgr.Send |
| PlayerManager.RoomGameBid | System.Threading.Tasks.Task`1<bool>(int) | Protodata.C2S_188_room_game_bid..ctor | NetworkMgr.Send |
| PlayerManager.SimGameBidPrice | System.Threading.Tasks.Task`1<Protodata.S2C_127_sim_game_bid_price>(int) | Protodata.C2S_126_sim_game_bid_price..ctor | NetworkMgr.Send |
| PlayerManager.AuctionHouseBidPrice | System.Threading.Tasks.Task`1<bool>(long, int) | Protodata.C2S_280_auction_house_bid_price..ctor | NetworkMgr.Send |

## Drop Flow

- Status: `drop_table_and_random_helpers_identified`
- Method: `GameServerDemo.Utils.DoDrop`
- Table lookup: `Table_Drop.getBygroup_id`
- Random/weight calls: `GameServerDemo.Utils.GetValues, GameServerDemo.Utils.RandomProbabilityIndex, GameServerDemo.Utils.RandomWeightIndex, GameServerDemo.Utils.RandomCount`

## Skill Flow

| method | signature | table calls | grid calls |
| --- | --- | --- | --- |
| MainUtils.DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(Protodata.GameSkillData) | - | Battle_Handler.get_BattleGridItemDatas, BattleGridItemData.Parse, BattleGridItemData.Sync |
| MainUtils.DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(System.Collections.Generic.List`1<GridItemData>, System.Collections.Generic.List`1<BattleGridItemData>, int[]) | Table_SkillEffect.getByEffectId, Table_Item.getByid, Table_Item.get_Size, Table_Item.get_SalePrice | BattleGridItemData.hasShowSize, BattleGridItemData.hasShowPos, BattleGridItemData.hasShowAll, BattleGridItemData.hasShowSizeCount |
| GameServerDemo.Utils.DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(System.Collections.Generic.List`1<GridItemData>, System.Collections.Generic.List`1<BattleGridItemData>, int[], int&) | Table_SkillEffect.getByEffectId, Table_Item.getByid, Table_Item.get_Size, Table_Item.get_SalePrice | BattleGridItemData.hasShowSize, BattleGridItemData.hasShowAll |

## Primary Method Domains

| family | declaring type | method | signature | call refs | domain counts |
| --- | --- | --- | --- | --- | --- |
| skill_resolution | GamePlayBackData | GetRoundSkills | System.Collections.Generic.List`1<Protodata.GameSkillData>(long, int) | 20 | {"skill_resolution":5} |
| skill_resolution | GamePlayBackData | GetHeroSkills | System.Collections.Generic.List`1<Protodata.GameSkillData>(long, int) | 20 | {"skill_resolution":5} |
| skill_resolution | GamePlayBackData | GetItemSkills | System.Collections.Generic.List`1<Protodata.GameSkillData>(long, int) | 20 | {"skill_resolution":5} |
| sim_setup | PlayerGameData | InitSimGame | System.Threading.Tasks.Task() | 3 | {"async_task":2} |
| bid_flow | PlayerManager | GameBid | System.Threading.Tasks.Task`1<bool>(int) | 16 | {"network_protocol":5,"auction_item_or_price":1,"async_task":1} |
| sim_setup | PlayerManager | CreateSimGame | System.Threading.Tasks.Task`1<Protodata.GameData>(int) | 13 | {"network_protocol":4,"async_task":1} |
| bid_flow | PlayerManager | SimGameBidPrice | System.Threading.Tasks.Task`1<Protodata.S2C_127_sim_game_bid_price>(int) | 13 | {"network_protocol":4,"auction_item_or_price":3,"async_task":1} |
| bid_flow | PlayerManager | RoomGameBid | System.Threading.Tasks.Task`1<bool>(int) | 15 | {"network_protocol":5,"auction_item_or_price":1,"async_task":1} |
| bid_flow | PlayerManager | AuctionHouseBidPrice | System.Threading.Tasks.Task`1<bool>(long, int) | 14 | {"network_protocol":5,"auction_item_or_price":3,"async_task":1} |
| item_price_and_auction_items | BattleRoomEnd_Main | ParseItemPrice | System.Collections.Generic.List`1<UnityEngine.Vector2Int>() | 16 | {"auction_item_or_price":6} |
| bid_flow | AuctionPlacePanel_Msg | AuctionHouseBidPrice | void(long, int, System.Action) | 4 | {"auction_item_or_price":1,"async_task":1} |
| skill_resolution | MainUtils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(Protodata.GameSkillData) | 18 | {"skill_resolution":8} |
| skill_resolution | MainUtils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(System.Collections.Generic.List`1<GridItemData>, System.Collections.Generic.List`1<BattleGridItemData>, int[]) | 78 | {"skill_resolution":9,"table_lookup":14,"auction_item_or_price":1,"random_or_weight":3} |
| item_price_and_auction_items | AuctionContainerPanel | InitAuctionItems | System.Threading.Tasks.Task() | 3 | {"async_task":2} |
| skill_resolution | GameServerDemo.ServerHandler | DealRoundSkill | System.Threading.Tasks.Task(int, int, System.Collections.Generic.List`1<System.Net.Sockets.Socket>) | 3 | {"async_task":2} |
| skill_resolution | GameServerDemo.ServerHandler | DealPlayerSkill | System.Threading.Tasks.Task(int, int, System.Net.Sockets.Socket) | 3 | {"async_task":2} |
| drop_and_randomness | GameServerDemo.Utils | DoDrop | System.Collections.Generic.Dictionary`2<int, int>(int, int) | 16 | {"table_lookup":1,"random_or_weight":6} |
| skill_resolution | GameServerDemo.Utils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(System.Collections.Generic.List`1<GridItemData>, System.Collections.Generic.List`1<BattleGridItemData>, int[], int&) | 69 | {"skill_resolution":5,"table_lookup":17,"auction_item_or_price":3} |

## Conclusion

The callgraph confirms bid endpoints are network wrappers, while probability/mechanics candidates are concentrated in `DoDrop`, `DealSkillEffect`, table lookups, and async auction item loading. This remains research-only until unresolved generic tokens and control flow are decoded.
