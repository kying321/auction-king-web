# BidKing method metadata report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-method-metadata-report.json`
- Assembly: `<local-bidking-extract>/dll/Scripts.dll.bytes`
- Metadata parse: `parsed`
- Evidence confidence: `medium_high`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- IL decompilation required for logic refactor: `true`
- Live/order/funds path touched: `false`

## Coverage

| signal | value |
| --- | --- |
| metadata types | `2625` |
| MethodDef rows | `19244` |
| MemberRef rows | `5103` |
| target method markers | `15` |
| primary methods | `18` |
| related compiler methods | `38` |
| body parse counts | {"parsed":56} |
| call references | `521` |
| protocol markers | `8` |
| missing markers | - |

## Primary Method Ownership

| declaring type | count | methods |
| --- | --- | --- |
| PlayerManager | 5 | GameBid, CreateSimGame, SimGameBidPrice, RoomGameBid, AuctionHouseBidPrice |
| GamePlayBackData | 3 | GetRoundSkills, GetHeroSkills, GetItemSkills |
| GameServerDemo.ServerHandler | 2 | DealRoundSkill, DealPlayerSkill |
| GameServerDemo.Utils | 2 | DoDrop, DealSkillEffect |
| MainUtils | 2 | DealSkillEffect, DealSkillEffect |
| AuctionContainerPanel | 1 | InitAuctionItems |
| AuctionPlacePanel_Msg | 1 | AuctionHouseBidPrice |
| BattleRoomEnd_Main | 1 | ParseItemPrice |
| PlayerGameData | 1 | InitSimGame |

## Primary Methods

| family | declaring type | method | signature | RVA | IL bytes | call refs |
| --- | --- | --- | --- | --- | --- | --- |
| skill_resolution | GamePlayBackData | GetRoundSkills | System.Collections.Generic.List`1<Protodata.GameSkillData>(long, int) | 0x00006304 | 165 | 20 |
| skill_resolution | GamePlayBackData | GetHeroSkills | System.Collections.Generic.List`1<Protodata.GameSkillData>(long, int) | 0x000063b8 | 165 | 20 |
| skill_resolution | GamePlayBackData | GetItemSkills | System.Collections.Generic.List`1<Protodata.GameSkillData>(long, int) | 0x0000646c | 165 | 20 |
| sim_setup | PlayerGameData | InitSimGame | System.Threading.Tasks.Task() | 0x00008548 | 55 | 3 |
| bid_flow | PlayerManager | GameBid | System.Threading.Tasks.Task`1<bool>(int) | 0x0000f0fc | 107 | 16 |
| sim_setup | PlayerManager | CreateSimGame | System.Threading.Tasks.Task`1<Protodata.GameData>(int) | 0x0001089c | 91 | 13 |
| bid_flow | PlayerManager | SimGameBidPrice | System.Threading.Tasks.Task`1<Protodata.S2C_127_sim_game_bid_price>(int) | 0x00010904 | 91 | 13 |
| bid_flow | PlayerManager | RoomGameBid | System.Threading.Tasks.Task`1<bool>(int) | 0x000114b8 | 106 | 15 |
| bid_flow | PlayerManager | AuctionHouseBidPrice | System.Threading.Tasks.Task`1<bool>(long, int) | 0x00012360 | 101 | 14 |
| item_price_and_auction_items | BattleRoomEnd_Main | ParseItemPrice | System.Collections.Generic.List`1<UnityEngine.Vector2Int>() | 0x0001f554 | 171 | 16 |
| bid_flow | AuctionPlacePanel_Msg | AuctionHouseBidPrice | void(long, int, System.Action) | 0x0004db0e | 50 | 4 |
| skill_resolution | MainUtils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(Protodata.GameSkillData) | 0x00057344 | 170 | 18 |
| skill_resolution | MainUtils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(System.Collections.Generic.List`1<GridItemData>, System.Collections.Generic.List`1<BattleGridItemData>, int[]) | 0x000573fc | 1235 | 78 |
| item_price_and_auction_items | AuctionContainerPanel | InitAuctionItems | System.Threading.Tasks.Task() | 0x0006ab7c | 55 | 3 |
| skill_resolution | GameServerDemo.ServerHandler | DealRoundSkill | System.Threading.Tasks.Task(int, int, System.Collections.Generic.List`1<System.Net.Sockets.Socket>) | 0x0006fc24 | 79 | 3 |
| skill_resolution | GameServerDemo.ServerHandler | DealPlayerSkill | System.Threading.Tasks.Task(int, int, System.Net.Sockets.Socket) | 0x0006fc80 | 79 | 3 |
| drop_and_randomness | GameServerDemo.Utils | DoDrop | System.Collections.Generic.Dictionary`2<int, int>(int, int) | 0x00070ad4 | 223 | 16 |
| skill_resolution | GameServerDemo.Utils | DealSkillEffect | System.Collections.Generic.List`1<BattleGridItemData>(System.Collections.Generic.List`1<GridItemData>, System.Collections.Generic.List`1<BattleGridItemData>, int[], int&) | 0x00071458 | 1054 | 69 |

## Compiler Generated Related Methods

| marker | kind | declaring type | method | RVA | IL bytes |
| --- | --- | --- | --- | --- | --- |
| GetRoundSkills | closure_display_class | <>c__DisplayClass5_0 | <GetRoundSkills>b__0 | 0x000d3b12 | 15 |
| GetRoundSkills | closure_display_class | <>c__DisplayClass5_0 | <GetRoundSkills>b__1 | 0x000d3b22 | 15 |
| GetRoundSkills | closure_display_class | <>c__DisplayClass5_0 | <GetRoundSkills>b__2 | 0x000d3b32 | 15 |
| GetHeroSkills | closure_display_class | <>c__DisplayClass6_0 | <GetHeroSkills>b__0 | 0x000d3b4a | 15 |
| GetHeroSkills | closure_display_class | <>c__DisplayClass6_0 | <GetHeroSkills>b__1 | 0x000d3b5a | 15 |
| GetHeroSkills | closure_display_class | <>c__DisplayClass6_0 | <GetHeroSkills>b__2 | 0x000d3b6a | 15 |
| GetItemSkills | closure_display_class | <>c__DisplayClass7_0 | <GetItemSkills>b__0 | 0x000d3b82 | 15 |
| GetItemSkills | closure_display_class | <>c__DisplayClass7_0 | <GetItemSkills>b__1 | 0x000d3b92 | 15 |
| GetItemSkills | closure_display_class | <>c__DisplayClass7_0 | <GetItemSkills>b__2 | 0x000d3ba2 | 15 |
| InitSimGame | async_state_machine_move_next | <InitSimGame>d__196 | MoveNext | 0x000d598c | 164 |
| InitSimGame | async_state_machine_support | <InitSimGame>d__196 | SetStateMachine | 0x000d5a4c | 13 |
| GameBid | closure_display_class | <>c__DisplayClass33_0 | <GameBid>b__0 | 0x000d8ad9 | 13 |
| GameBid | closure_display_class | <>c__DisplayClass33_0 | <GameBid>b__1 | 0x000d8ae7 | 24 |
| CreateSimGame | closure_display_class | <>c__DisplayClass87_0 | <CreateSimGame>b__0 | 0x000d996c | 106 |
| CreateSimGame | closure_display_class | <>c__DisplayClass87_0 | <CreateSimGame>b__1 | 0x000d99e2 | 24 |
| SimGameBidPrice | closure_display_class | <>c__DisplayClass88_0 | <SimGameBidPrice>b__0 | 0x000d9a04 | 20 |
| SimGameBidPrice | closure_display_class | <>c__DisplayClass88_0 | <SimGameBidPrice>b__1 | 0x000d9a24 | 24 |
| RoomGameBid | closure_display_class | <>c__DisplayClass115_0 | <RoomGameBid>b__0 | 0x000da23b | 13 |
| RoomGameBid | closure_display_class | <>c__DisplayClass115_0 | <RoomGameBid>b__1 | 0x000da249 | 24 |
| AuctionHouseBidPrice | closure_display_class | <>c__DisplayClass147_0 | <AuctionHouseBidPrice>b__0 | 0x000dab25 | 13 |
| AuctionHouseBidPrice | closure_display_class | <>c__DisplayClass147_0 | <AuctionHouseBidPrice>b__1 | 0x000dab33 | 24 |
| ParseItemPrice | closure_display_class | <>c__DisplayClass19_0 | <ParseItemPrice>b__0 | 0x000dd663 | 15 |
| ParseItemPrice | closure_display_class | <>c__DisplayClass19_0 | <ParseItemPrice>b__1 | 0x000dd673 | 15 |
| AuctionHouseBidPrice | closure_display_class | <>c__DisplayClass7_0 | <AuctionHouseBidPrice>b__0 | 0x000e9744 | 55 |
| DealSkillEffect | closure_display_class | <>c__DisplayClass64_0 | <DealSkillEffect>b__0 | 0x000eaeef | 20 |
| DealSkillEffect | closure_display_class | <>c__DisplayClass65_0 | <DealSkillEffect>b__0 | 0x000eaf0c | 15 |
| InitAuctionItems | closure_display_class | <>c__DisplayClass15_0 | <InitAuctionItems>b__2 | 0x000ee9f4 | 79 |
| InitAuctionItems | closure_display_class | <>c__DisplayClass15_1 | <InitAuctionItems>b__0 | 0x000eea57 | 22 |
| InitAuctionItems | closure_display_class | <>c__DisplayClass15_1 | <InitAuctionItems>b__1 | 0x000eea70 | 108 |
| InitAuctionItems | async_state_machine_move_next | <InitAuctionItems>d__15 | MoveNext | 0x000eeae8 | 855 |
| InitAuctionItems | async_state_machine_support | <InitAuctionItems>d__15 | SetStateMachine | 0x000eeeb0 | 13 |
| DealRoundSkill | async_state_machine_move_next | <DealRoundSkill>d__18 | MoveNext | 0x000f0f74 | 402 |
| DealRoundSkill | async_state_machine_support | <DealRoundSkill>d__18 | SetStateMachine | 0x000f1130 | 13 |
| DealPlayerSkill | async_state_machine_move_next | <DealPlayerSkill>d__19 | MoveNext | 0x000f1140 | 294 |
| DealPlayerSkill | async_state_machine_support | <DealPlayerSkill>d__19 | SetStateMachine | 0x000f1284 | 13 |
| DealSkillEffect | closure_display_class | <>c__DisplayClass22_0 | <DealSkillEffect>b__0 | 0x000f199e | 15 |
| AuctionHouseBidPrice | async_lambda_state_machine_move_next | <<AuctionHouseBidPrice>b__0>d | MoveNext | 0x000fca88 | 342 |
| AuctionHouseBidPrice | related_method | <<AuctionHouseBidPrice>b__0>d | SetStateMachine | 0x000fcc08 | 13 |

## Protocol Markers

| declaring type | field | type | token |
| --- | --- | --- | --- |
| ID | C2S34GameBid | ID | 0x04002bd7 |
| ID | S2C35GameBid | ID | 0x04002bd8 |
| ID | C2S126SimGameBidPrice | ID | 0x04002c2e |
| ID | S2C127SimGameBidPrice | ID | 0x04002c2f |
| ID | C2S188RoomGameBid | ID | 0x04002c63 |
| ID | S2C189RoomGameBid | ID | 0x04002c64 |
| ID | C2S280AuctionHouseBidPrice | ID | 0x04002cb0 |
| ID | S2C281AuctionHouseBidPrice | ID | 0x04002cb1 |

## Conclusion

BidKing hot-update logic is now indexed at method/signature/RVA/body-summary level. This is still not enough to rewrite Auction King estimator behavior: the next step is IL call graph and async `MoveNext` decoding for bid, drop, skill, and auction item flows.
