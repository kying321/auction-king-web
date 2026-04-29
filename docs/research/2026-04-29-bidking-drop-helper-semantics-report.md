# BidKing drop helper semantics report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-drop-helper-semantics-report.json`
- Assembly: `<local-bidking-extract>/dll/Scripts.dll.bytes`
- Parse status: `drop_helper_semantics_candidate_built`
- Evidence confidence: `medium_high`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- RandomCount upper bound exclusive: `true`
- Probability mode independent Bernoulli: `true`
- Weighted mode single cumulative choice: `true`
- Live/order/funds path touched: `false`

## Coverage

| signal | value |
| --- | --- |
| helper methods | `8` |
| missing helper keys | - |

## Helpers

| helper | signature | semantics | IL bytes | instructions |
| --- | --- | --- | --- | --- |
| GetValues/1 | int[](int[][]) | extract tuple[1] from each row | 35 | 29 |
| GetValues/3 | int[](int[][], int, int) | extract tuple[columnIndex] from each row, falling back when the row is too short | 44 | 36 |
| RandomWeightIndex/1 | int(int[]) | single weighted choice by cumulative sum | 80 | 54 |
| RandomProbabilityIndex/1 | System.Collections.Generic.List`1<int>(int[]) | convert integer weights to probabilities and independently select all passing indexes | 49 | 31 |
| SelectByProbability/1 | System.Collections.Generic.List`1<int>(System.Collections.Generic.List`1<double>) | independent Bernoulli selection for each probability entry | 75 | 34 |
| RandomCount/2 | int(int, int) | random integer in normalized [min, max) range, exact return when min == max | 38 | 25 |
| AddRange/2 | void(System.Collections.Generic.Dictionary`2<int, int>, System.Collections.Generic.Dictionary`2<int, int>) | merge dictionary counts through AddItem | 67 | 26 |
| AddItem/3 | void(System.Collections.Generic.Dictionary`2<int, int>, int, int) | accumulate item count by dictionary key | 39 | 22 |

## Pseudocode

### GetValues/1

```text
values = new int[rows.length]
for i in range(rows.length): values[i] = rows[i][1]
return values
```

### GetValues/3

```text
values = new int[rows.length]
for i in range(rows.length):
  values[i] = fallback if columnIndex >= rows[i].length else rows[i][columnIndex]
return values
```

### RandomWeightIndex/1

```text
if weights is null or empty: throw ArgumentException
if weights.length == 1: return 0
total = Sum(weights)
threshold = Random().Next(0, total)
cumulative = 0
for i in range(weights.length):
  cumulative += weights[i]
  if threshold < cumulative: return i
return weights.length - 1
```

### RandomProbabilityIndex/1

```text
total = Sum(weights)
probabilities = weights.map(weight => weight / total)
return SelectByProbability(probabilities)
```

### SelectByProbability/1

```text
if probabilities is null or empty: throw ArgumentException
selected = []
random = new Random()
for i in range(probabilities.Count):
  if random.NextDouble() < probabilities[i]: selected.Add(i)
return selected
```

### RandomCount/2

```text
if a == b: return a
low = min(a, b)
high = max(a, b)
return Random().Next(low, high)
```

### AddRange/2

```text
for (key, value) in source:
  AddItem(target, key, value)
```

### AddItem/3

```text
if result.ContainsKey(itemId): result[itemId] = result[itemId] + count
else: result.Add(itemId, count)
```


## Conclusion

The helper layer is now explicit enough for a shadow-only DoDrop simulator. The most important modeling details are independent Bernoulli selection for probability mode and exclusive upper bound for RandomCount.
