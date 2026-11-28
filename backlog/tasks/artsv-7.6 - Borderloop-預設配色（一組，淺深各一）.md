---
id: ARTSV-7.6
title: Borderloop 預設配色（一組，淺深各一）
status: Done
assignee: []
created_date: '2026-11-25T17:17:00Z'
updated_date: '2026-11-26T14:23:00Z'
labels: []
dependencies: []
parent_task_id: ARTSV-7
priority: medium
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
新增一組配色：Borderloop 的預設配色（不設 data-palette 時的值），不做 paper、teal、graphite。值取自 /Users/scottchen/Desktop/封存/Borderloop/docs/Design/UI_J2-h2-buttons-warn-polish.html 的 :root 與 [data-theme="dark"] 區塊。淺色：底 #F3F4F8、面 #FFFFFF、hover #E9EBF2、線 #D3D7E3、文字 #1D2130、次要 #6B7185、強調 #4F63D6（accent-2 #3A4EBF）。深色：底 #15171E、面 #1F222C、hover #272B37、線 #353A48、文字 #E6E8F0、次要 #8E94A6、強調 #8FA2F0。對應到專案的主題變數，作為與 reader 主題並列的一套主題，可在設定或頂欄選擇，選擇存在瀏覽器。強調色仍只用在版本與派工狀態；文字與背景組合需達 WCAG AA，不足時調整並記錄。（Scott 2026-11-26 調整：只留預設那一組）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Borderloop 預設配色淺深都可切換並保留選擇
- [x] #2 所有文字對比達 AA，非文字邊界達 3:1
- [x] #3 閱讀模式與審閱白板都套用所選配色
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
已實作並完成獨立審查修正。驗證：VITEST_MAX_WORKERS=2 pnpm verify:iteration（exit 0；全部測試與門檻不變）；project/evidence/review-board-iteration.json。B/F：UXR-012–018，project/evidence/review-board.json；協定敵意測試：project/evidence/review-reader-protocol.json。
<!-- SECTION:NOTES:END -->
