# BidKing focused IL report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-focused-il-report.json`
- Assembly: `<local-bidking-extract>/dll/Scripts.dll.bytes`
- Parse status: `focused_il_disassembly_built`
- Evidence confidence: `medium`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- Live/order/funds path touched: `false`

## Coverage

| signal | value |
| --- | --- |
| focused methods | `14` |
| parse counts | {"parsed":14} |
| signal instructions | `908` |
| token references | `636` |
| unresolved token references | `198` |
| unresolved token ratio | `0.3113` |

## Bid Wrappers

| method | request messages | send calls | implication |
| --- | --- | --- | --- |
| PlayerManager.GameBid | Protodata.C2S_34_game_bid..ctor, Protodata.C2S_34_game_bid.set_Token, Protodata.C2S_34_game_bid.set_GameUid, Protodata.C2S_34_game_bid.set_BidPrice | NetworkMgr.Send | network request wrapper; not a probability model source |
| PlayerManager.RoomGameBid | Protodata.C2S_188_room_game_bid..ctor, Protodata.C2S_188_room_game_bid.set_Token, Protodata.C2S_188_room_game_bid.set_RoomUid, Protodata.C2S_188_room_game_bid.set_BidPrice | NetworkMgr.Send | network request wrapper; not a probability model source |
| PlayerManager.SimGameBidPrice | Protodata.C2S_126_sim_game_bid_price..ctor, Protodata.C2S_126_sim_game_bid_price.set_Token, Protodata.C2S_126_sim_game_bid_price.set_Price | NetworkMgr.Send | network request wrapper; not a probability model source |
| PlayerManager.AuctionHouseBidPrice | Protodata.C2S_280_auction_house_bid_price..ctor, Protodata.C2S_280_auction_house_bid_price.set_Token, Protodata.C2S_280_auction_house_bid_price.set_ItemUid, Protodata.C2S_280_auction_house_bid_price.set_Price | NetworkMgr.Send | network request wrapper; not a probability model source |

## Drop Randomness

- Method: `GameServerDemo.Utils.DoDrop`
- Table calls: `Table_Drop.getBygroup_id, Table_Drop.weight_type, Table_Drop.items_list, Table_Drop.items_list, Table_Drop.items_list`
- Random calls: `GameServerDemo.Utils.GetValues, GameServerDemo.Utils.RandomProbabilityIndex, GameServerDemo.Utils.GetValues, GameServerDemo.Utils.RandomWeightIndex, GameServerDemo.Utils.RandomCount, GameServerDemo.Utils.RandomCount`
- Implication: `primary source candidate for table-backed drop weighting`

## Skill Visibility

| method | table calls | grid calls | implication |
| --- | --- | --- | --- |
| MainUtils.DealSkillEffect | - | Battle_Handler.get_BattleGridItemDatas, BattleGridItemData.Parse, BattleGridItemData.lunkuo, BattleGridItemData.Sync | primary source candidate for reveal/scan/grid visibility semantics |
| MainUtils.DealSkillEffect | Table_SkillEffect.getByEffectId, Table_SkillEffect.Category, Table_Item.getByid, Table_Item.get_Size, Table_Item.get_Size, Table_Item.getByid, Table_Item.get_SalePrice, Table_Item.getByid, Table_Item.item_quality, Table_Item.getByid, Table_Item.item_quality, Table_Item.getByid, Table_Item.get_Size, Table_Item.get_Size, Table_Item.getByid, Table_Item.get_Size, Table_Item.get_Size | GridItemData.uuid, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.hasShowSize, GridItemData.pos, BattleGridItemData.pos, BattleGridItemData.Size, BattleGridItemData.Size, GridItemData.rotate, BattleGridItemData.rotate, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.price, BattleGridItemData.price, BattleGridItemData.hasShowPos, BattleGridItemData.pos, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.hasShowAll, GridItemData.itemId, BattleGridItemData.itemId, GridItemData.pos, BattleGridItemData.pos, BattleGridItemData.rank, GridItemData.rotate, BattleGridItemData.rotate, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.hasShowAll, BattleGridItemData.rank, BattleGridItemData.hasShowPos, BattleGridItemData.pos, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.hasShowSizeCount, BattleGridItemData.sizeCount, BattleGridItemData.hasShowPos, BattleGridItemData.pos, GridItemData.itemId, GridItemData.uuid, GridItemData.pos, BattleGridItemData.pos, BattleGridItemData.Size, BattleGridItemData.Size, GridItemData.rotate, BattleGridItemData.rotate, BattleGridItemData.lunkuo | primary source candidate for reveal/scan/grid visibility semantics |
| GameServerDemo.Utils.DealSkillEffect | Table_SkillEffect.getByEffectId, Table_SkillEffect.Category, Table_Item.getByid, Table_Item.get_Size, Table_Item.get_Size, Table_Item.getByid, Table_Item.get_Size, Table_Item.getByid, Table_Item.get_Size, Table_Item.getByid, Table_Item.get_SalePrice, Table_Item.getByid, Table_Item.getByid, Table_Item.item_quality, Table_Item.getByid, Table_Item.get_SalePrice, Table_Item.getByid, Table_Item.get_Size, Table_Item.get_SalePrice | GridItemData.uuid, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.hasShowSize, GridItemData.pos, BattleGridItemData.pos, BattleGridItemData.Size, BattleGridItemData.Size, GridItemData.itemId, GridItemData.itemId, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.price, BattleGridItemData.price, GridItemData.pos, BattleGridItemData.pos, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.hasShowAll, GridItemData.itemId, BattleGridItemData.itemId, GridItemData.pos, BattleGridItemData.pos, GridItemData.itemId, GridItemData.uuid, BattleGridItemData.hasShowAll, BattleGridItemData.rank, GridItemData.pos, BattleGridItemData.pos, GridItemData.itemId, GridItemData.itemId | primary source candidate for reveal/scan/grid visibility semantics |

## Focused Methods

| reason | declaring type | method | signature | IL bytes | instructions | instruction kinds | domains |
| --- | --- | --- | --- | --- | --- | --- | --- |
| drop_table_random_weight_logic | GameServerDemo.Utils | DoDrop | System.Collections.Generic.Dictionary`2<int, int>(int, int) | 223 | 95 | {"call":16,"other":52,"constant":14,"branch":8,"field":4,"exit":1} | {"table_lookup":1,"random_or_weight":6} |
| client_skill_visibility_and_grid_mutation | MainUtils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(Protodata.GameSkillData) | 170 | 63 | {"call":18,"other":31,"branch":6,"constant":3,"field":4,"exit":1} | {"skill_resolution":9} |
| client_skill_visibility_and_grid_mutation | MainUtils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(System.Collections.Generic.List`1<GridItemData>, System.Collections.Generic.List`1<BattleGridItemData>, int[]) | 1235 | 401 | {"call":78,"other":208,"constant":22,"branch":45,"field":47,"exit":1} | {"skill_resolution":50,"table_lookup":14,"auction_item_or_price":1,"random_or_weight":3} |
| server_skill_visibility_and_grid_mutation | GameServerDemo.Utils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(System.Collections.Generic.List`1<GridItemData>, System.Collections.Generic.List`1<BattleGridItemData>, int[], int&) | 1054 | 391 | {"call":69,"other":223,"constant":28,"branch":38,"field":32,"exit":1} | {"skill_resolution":34,"table_lookup":17,"auction_item_or_price":3} |
| bid_network_wrapper | PlayerManager | GameBid | System.Threading.Tasks.Task`1<bool>(int) | 107 | 32 | {"call":16,"other":12,"field":2,"constant":1,"exit":1} | {"network_protocol":5,"auction_item_or_price":1,"async_task":1} |
| room_bid_network_wrapper | PlayerManager | RoomGameBid | System.Threading.Tasks.Task`1<bool>(int) | 106 | 32 | {"call":15,"other":13,"field":2,"constant":1,"exit":1} | {"network_protocol":5,"auction_item_or_price":1,"async_task":1} |
| sim_bid_network_wrapper | PlayerManager | SimGameBidPrice | System.Threading.Tasks.Task`1<Protodata.S2C_127_sim_game_bid_price>(int) | 91 | 28 | {"call":13,"other":11,"field":2,"constant":1,"exit":1} | {"network_protocol":4,"auction_item_or_price":3,"async_task":1} |
| auction_house_bid_network_wrapper | PlayerManager | AuctionHouseBidPrice | System.Threading.Tasks.Task`1<bool>(long, int) | 101 | 31 | {"call":14,"other":13,"field":2,"constant":1,"exit":1} | {"network_protocol":5,"auction_item_or_price":3,"async_task":1} |
| settlement_price_projection | BattleRoomEnd_Main | ParseItemPrice | System.Collections.Generic.List`1<UnityEngine.Vector2Int>() | 171 | 63 | {"call":16,"other":29,"field":6,"constant":5,"branch":6,"exit":1} | {"auction_item_or_price":6} |
| auction_item_async_loading_entry | AuctionContainerPanel | InitAuctionItems | System.Threading.Tasks.Task() | 55 | 17 | {"other":7,"call":3,"field":5,"constant":1,"exit":1} | {"async_task":2,"auction_item_or_price":5} |
| auction_item_async_loading_body | <InitAuctionItems>d__15 | MoveNext | void() | 855 | 271 | {"other":115,"field":60,"branch":22,"call":57,"constant":13,"exit":4} | {"auction_item_or_price":44,"async_task":5,"table_lookup":1} |
| round_skill_async_body | <DealRoundSkill>d__18 | MoveNext | void() | 402 | 136 | {"other":70,"field":35,"branch":7,"call":17,"constant":6,"exit":1} | {"skill_resolution":32,"async_task":5} |
| player_skill_async_body | <DealPlayerSkill>d__19 | MoveNext | void() | 294 | 101 | {"other":53,"field":24,"branch":5,"call":14,"constant":4,"exit":1} | {"skill_resolution":21,"async_task":5} |
| auction_house_bid_callback_async_body | <<AuctionHouseBidPrice>b__0>d | MoveNext | void() | 342 | 121 | {"other":58,"field":25,"branch":10,"constant":8,"call":19,"exit":1} | {"auction_item_or_price":21,"async_task":2} |

## Conclusion

Focused IL disassembly confirms the next useful reconstruction target is not the bid request wrapper layer. The refactor path should reconstruct `DoDrop` and `DealSkillEffect` semantics first, then validate them against schema-backed tables and shadow replay.
