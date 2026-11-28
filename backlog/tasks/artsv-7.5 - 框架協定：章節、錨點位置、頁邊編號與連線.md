---
id: ARTSV-7.5
title: 框架協定：章節、錨點位置、頁邊編號與連線
status: Done
assignee: []
created_date: '2026-11-25T17:17:00Z'
updated_date: '2026-11-26T14:23:00Z'
labels: []
dependencies:
  - ARTSV-7.3
parent_task_id: ARTSV-7
priority: high
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
在 review-frame 協定新增兩種訊息：as-review-outline（框架回報 h1 到 h3）與 as-review-anchor-rects（以 rAF 節流回報可見錨點位置），含 zod schema、版本號與大小上限。框架內為有錨點的留言畫頁邊編號標記（同列時錯開），點擊沿用 as-review-select。主頁以 SVG 疊層畫三次貝茲曲線，從標記連到右欄留言卡，隨捲動、縮放、平移、展開脈絡列重畫。雙方都檢查 e.source。示範做法見 review-board-demo.html。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 新訊息有 schema 驗證與惡意輸入的 F 測試
- [x] #2 選取或滑過留言時畫出連線，位置在捲動、縮放後仍正確
- [x] #3 點頁邊編號會選取右欄對應留言
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
已實作並完成獨立審查修正。驗證：VITEST_MAX_WORKERS=2 pnpm verify:iteration（exit 0；全部測試與門檻不變）；project/evidence/review-board-iteration.json。B/F：UXR-012–018，project/evidence/review-board.json；協定敵意測試：project/evidence/review-reader-protocol.json。
<!-- SECTION:NOTES:END -->
