# Phase 03 deterministic seed sample

Runtime: v22.22.1; OS: win32; CPU: Intel(R) Core(TM) i5-6500 CPU @ 3.20GHz.

Timing wraps generateLevel only, including its analyzer/solver/witness verification. Vitest Node worker, not an Android device benchmark.

Cases: 1000; generated: 1000; fully verified: 1000.

| Requested profile | Seeds | Verified | Mean score | Mean arrows | Mean density | Mean chain | Mean ms | p95 ms | Max ms | Tier matches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| easy | 0–249 | 250/250 | 40.81 | 6.73 | 52.7% | 2.35 | 11.11 | 28.29 | 54.09 | 203/250 |
| medium | 250–499 | 250/250 | 54.38 | 12.50 | 60.6% | 3.91 | 11.63 | 28.67 | 113.46 | 247/250 |
| hard | 500–749 | 250/250 | 68.35 | 19.19 | 63.9% | 5.77 | 14.35 | 30.22 | 61.80 | 250/250 |
| expert | 750–999 | 250/250 | 81.75 | 25.34 | 62.5% | 7.97 | 29.65 | 68.80 | 127.39 | 248/250 |

The JSON report includes actual tier distributions, layout diversity, choice/bend/dependency metrics, rejection totals and explicit failure seeds. Timing varies with CPU load and JIT warmup.
