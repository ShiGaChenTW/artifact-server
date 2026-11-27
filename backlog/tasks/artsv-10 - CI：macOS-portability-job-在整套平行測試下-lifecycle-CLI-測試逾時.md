---
id: ARTSV-10
title: CI：macOS portability job 在整套平行測試下 lifecycle CLI 測試逾時
status: To Do
assignee: []
created_date: '2026-11-27T18:44:05Z'
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
- [ ] #1 在 macOS CI 上確認逾時原因（負載或真的慢），結論寫進 project/performance/FINDINGS.md 或票的 notes
- [ ] #2 macOS portability job 在 main 上通過，且不靠放寬測試逾時或跳過測試
- [ ] #3 若 macOS arm64 容量長期不足，記錄替代方案（例如 macos-15-intel）與取捨
<!-- AC:END -->
