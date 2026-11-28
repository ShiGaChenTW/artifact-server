---
id: ARTSV-10
title: CI：macOS portability job 在整套平行測試下 lifecycle CLI 測試逾時
status: To Do
assignee: []
created_date: '2026-11-27T18:44:05Z'
updated_date: '2026-11-28T01:29:25Z'
labels: []
dependencies:
  - ARTSV-9
priority: medium
type: bug
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #4（ARTSV-9）把 macOS job 從已停用的 macos-14 改成 macos-15 後，第一次跑完（run 46006158547）：115 個測試檔 114 通過，tests/cli/lifecycle-cli.test.ts 的 foundation: initialization… 在 30 s 逾時；本機 M5 Max 單獨跑 5.5 s，Linux CI 通過。重跑因 GitHub macOS arm64 容量不足、15 分鐘排不到機器而取消。推測是 3 核 runner 上整套平行測試造成的負載。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 在 macOS CI 上確認逾時原因（負載或真的慢），結論寫進 project/performance/FINDINGS.md 或票的 notes
- [ ] #2 macOS portability job 在 main 上通過，且不靠放寬測試逾時或跳過測試
- [ ] #3 若 macOS arm64 容量長期不足，記錄替代方案（例如 macos-15-intel）與取捨
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-28：main push 的 run 46051581432 macOS 有取得 runner，但整個 job 超過 timeout-minutes: 12 被取消（前一次 PR run 是 8.5 分鐘跑到 lifecycle-cli 逾時）。兩次都指向 macOS runner 上整套測試太慢；處理時要一併檢討 job 的 12 分鐘上限與 vitest worker 數。

2026-11-28：結論是 job 時間預算不夠，不是測試失敗。run 46051581432 的 pnpm check 在 9m15s 內通過（115/115 測試檔），之後 pnpm cache 冷啟動多出約 2 分鐘安裝，加上 cache save，超過 12 分鐘上限。PR #5 把 job 上限改成 20 分鐘，測試逾時不變。lifecycle-cli 30 s 逾時目前只出現過一次，列為剩下的風險。
<!-- SECTION:NOTES:END -->
