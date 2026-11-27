---
id: ARTSV-9
title: CI 上連結資料夾暖掃描超過 5 秒規格上限（FOV-003-B）
status: To Do
assignee: []
created_date: '2026-11-27T02:43:00Z'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #2 合併前手動跑兩次 CI（runs 45921912765、45928581032），tests/smoke/file-management-performance.test.ts 的 FOV-003-B 都失敗：20,000 個檔案的暖掃描最慢一次 7,634ms 與 9,525ms，規格 file-management-spec.md 第 509 行上限 5 秒；本機單獨跑通過。Scott 2026-11-27 決定先以本機證據合併 PR #2，main 的 CI 會維持紅燈直到修好。先分辨原因：在 CI 上單獨（不和其他套件平行）跑這個 smoke 測試量一次。單跑在 5 秒內就是平行負載造成，改成 CI 單獨跑效能 smoke 並記錄理由；單跑仍超標就是真的效能問題，要找出掃描的瓶頸（stat、雜湊、分頁寫入交易）並修正。不可放寬規格預算，也不可只為 CI 改測試門檻。另外確認 fork 的 CI 為何不被 pull_request 觸發。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 查明 CI 超標是平行負載還是掃描本身太慢，結論與量測數字寫進 project/performance/FINDINGS.md
- [ ] #2 main 上的 CI（含 macOS portability）全綠，且 FOV-003-B 仍以 5 秒規格預算斷言
- [ ] #3 fork 的 PR 會自動觸發 CI，或已記錄不能觸發的原因與替代流程
<!-- AC:END -->
