---
id: ARTSV-7.3
title: 白板引擎：置中與自由視角、縮放、平移、文件寬度
status: Done
assignee: []
created_date: '2026-11-25T17:17:00Z'
updated_date: '2026-11-26T14:23:00Z'
labels: []
dependencies:
  - ARTSV-7.1
parent_task_id: ARTSV-7
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把預覽框架放在可縮放的白板上：置中視角（文件恆置中）與自由視角（拖空白處平移、拖標頭移動文件）；縮放 40% 至 200%，按住 ⌘ 或 Ctrl 加滾輪縮放，一般滾輪留給文件捲動；縮小、放大、符合視窗按鈕；文件寬度窄 560、原始 780、寬（最多 1040）。只用 transform，不動畫寬高；iframe sandbox 維持 allow-scripts。修正原頁的問題：窄版要可用、展開脈絡列後要重排。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 兩種視角、縮放、平移、寬度切換都可用鍵盤操作
- [x] #2 縮放後 Plannotator 標註、選取與捲動照常運作
- [x] #3 reduced-motion 下沒有動畫
- [x] #4 文件卡頂部與上方介面（脈絡列）之間保留看得到的白板留白（至少 24px，參考 Scott 2026-11-26 截圖），置中、符合視窗、縮放與展開脈絡列後都維持，文件卡不可貼齊或被上方介面切掉
- [x] #5 設計並記錄文件可顯示的最寬寬度：寫明窄、原始、寬三種寬度的上限值與理由（行長、可讀性、Artifact 本身的版面），在 1440、1920、2560 寬的螢幕上，超過上限時文件置中、兩側留白變大而文件不再變寬；寬度選擇器與符合視窗都不可超過這個上限
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
已實作並完成獨立審查修正。驗證：VITEST_MAX_WORKERS=2 pnpm verify:iteration（exit 0；全部測試與門檻不變）；project/evidence/review-board-iteration.json。B/F：UXR-012–018，project/evidence/review-board.json；協定敵意測試：project/evidence/review-reader-protocol.json。
<!-- SECTION:NOTES:END -->
