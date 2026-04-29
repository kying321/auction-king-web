# BidKing DoDrop semantics report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-dodrop-semantics-report.json`
- Schema-backed tables: `<repo>/docs/research/2026-04-29-bidking-schema-backed-table-report.json`
- Focused IL: `<repo>/docs/research/2026-04-29-bidking-focused-il-report.json`
- Parse status: `dodrop_semantics_candidate_built`
- Evidence confidence: `medium_high`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- Live/order/funds path touched: `false`

## Coverage

| signal | value |
| --- | --- |
| drop groups | `594` |
| tuples | `8784` |
| nested group tuples | `2994` |
| weight type counts | {"1":47,"2":547} |
| tuple width counts | {"0":2,"5":8782} |
| IL signal complete | `true` |

## Tuple Semantics Candidate

| tuple index | inferred name | evidence |
| --- | --- | --- |
| 0 | kind_or_nested_group_marker | compared with sentinel 9999 before recursive DoDrop |
| 1 | item_id_or_nested_group_id | passed to AddItem or recursive DoDrop |
| 2 | min_count | first argument to RandomCount |
| 3 | max_count | second argument to RandomCount |
| 4 | weight_or_probability | GetValues(items_list, 4, 10000) |

## Pseudocode Candidate

```text
    result = {}
    for outerIndex in range(repeatCount):
      drop = Table_Drop.getBygroup_id(groupId)
      if drop.weight_type == 1:
        selectedIndexes = RandomProbabilityIndex(GetValues(drop.items_list, 4, 10000))
      else:
        selectedIndexes = [RandomWeightIndex(GetValues(drop.items_list, 4, 10000))]
      for selectedIndex in selectedIndexes:
        tuple = drop.items_list[selectedIndex]
        kindOrNestedMarker = tuple[0]
        itemOrNestedGroupId = tuple[1]
        minCount = tuple[2]
        maxCount = tuple[3]
        count = RandomCount(minCount, maxCount)
        if kindOrNestedMarker == 9999:
          AddRange(result, DoDrop(itemOrNestedGroupId, count))
        else:
          AddItem(result, itemOrNestedGroupId, count)
    return result
```

## Table Samples

| group id | description | weight type | tuple count | tuple samples |
| --- | --- | --- | --- | --- |
| 801 | 个人模拟测试 | 2 | 64 | [[8,8001,1,1,10],[8,8002,1,1,10],[8,8003,1,1,10],[8,8004,1,1,10],[8,8005,1,1,10]] |
| 1000 | 皮肤测试礼盒 | 1 | 20 | [[14,1410101,1,1,10000],[14,1410201,1,1,10000],[14,1410301,1,1,10000],[14,1410401,1,1,10000],[14,1410501,1,1,10000]] |
| 1001 | 头像测试礼盒 | 1 | 21 | [[12,120001,1,1,10000],[12,120002,1,1,10000],[12,120003,1,1,10000],[12,120004,1,1,10000],[12,120005,1,1,10000]] |
| 1002 | 收藏箱礼盒 | 1 | 11 | [[7,1003,1,1,10000],[7,1013,1,1,10000],[7,1023,1,1,10000],[7,1033,1,1,10000],[7,1043,1,1,10000]] |
| 1003 | 角色测试礼盒 | 1 | 20 | [[15,150101,1,1,10000],[15,150102,1,1,10000],[15,150103,1,1,10000],[15,150104,1,1,10000],[15,150105,1,1,10000]] |
| 1011 | 家具物品品质1 | 2 | 52 | [[101,1101006,1,1,844],[101,1031010,1,1,831],[101,1071002,1,1,842],[101,1031001,1,1,802],[101,1051010,1,1,805]] |
| 1012 | 家具物品品质2 | 2 | 37 | [[101,1062007,1,1,382],[101,1032010,1,1,347],[101,1022006,1,1,331],[101,1032002,1,1,355],[101,1042010,1,1,339]] |
| 1013 | 家具物品品质3 | 2 | 35 | [[101,1013007,1,1,581],[101,1073009,1,1,830],[101,1063005,1,1,535],[101,1043010,1,1,732],[101,1013002,1,1,703]] |

## Conclusion

The `DoDrop` method is now reconstructed as a research-only table-backed drop resolver candidate. It is strong enough for a shadow replay prototype, but not for default config or estimator mutation until helper bodies and settlement samples validate it.
