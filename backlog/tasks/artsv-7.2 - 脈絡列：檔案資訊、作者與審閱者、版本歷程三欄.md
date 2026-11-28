---
id: ARTSV-7.2
title: 脈絡列：檔案資訊、作者與審閱者、版本歷程三欄
status: Done
assignee: []
created_date: '2026-11-25T17:17:00Z'
updated_date: '2026-11-26T14:23:00Z'
labels: []
dependencies:
  - ARTSV-7.1
parent_task_id: ARTSV-7
priority: medium
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
白板模式頂部加可收合的三欄脈絡列。收合時每欄一行摘要；展開後顯示路徑、版本、檔案數與大小、發布者、審閱者、派工對象與版本歷程。用真正的按鈕切換（aria-expanded），不要把整個區塊當按鈕。資料沿用現有 API。窄版改成單欄，收合時只顯示第一欄。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 展開與收合由按鈕控制並更新 aria-expanded
- [x] #2 展開後預覽與連線位置正確重排
- [x] #3 窄版不產生橫向捲動
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
已實作並完成獨立審查修正。驗證：VITEST_MAX_WORKERS=2 pnpm verify:iteration（exit 0；全部測試與門檻不變）；project/evidence/review-board-iteration.json。B/F：UXR-012–018，project/evidence/review-board.json；協定敵意測試：project/evidence/review-reader-protocol.json。
<!-- SECTION:NOTES:END -->
