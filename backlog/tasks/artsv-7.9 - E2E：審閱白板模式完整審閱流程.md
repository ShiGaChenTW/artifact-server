---
id: ARTSV-7.9
title: E2E：審閱白板模式完整審閱流程
status: Done
assignee: []
created_date: '2026-11-25T21:21:00Z'
updated_date: '2026-11-26T14:23:00Z'
labels: []
dependencies:
  - ARTSV-7.1
  - ARTSV-7.2
  - ARTSV-7.3
  - ARTSV-7.4
  - ARTSV-7.5
  - ARTSV-7.6
  - ARTSV-7.7
parent_task_id: ARTSV-7
priority: high
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
用 Playwright 對 pnpm build 後的真實伺服器（真實 HTTP、暫存 SQLite 與磁碟、真實 review-frame iframe，不用 module mock）跑白板模式的完整流程，放在 tests/browser/e2e-review-board.spec.ts。流程：(1) 發布一份有 h1 到 h3 與多則錨點留言的 Artifact → 從閱讀模式切到白板，Artifact、版本、選取的留言都保留，重新整理後仍在白板；(2) 展開與收合脈絡列，文件卡頂部與脈絡列之間至少 24px 留白，連線重排正確；(3) 置中與自由視角切換、⌘／Ctrl 加滾輪縮放 40% 到 200%、拖曳平移、窄／原始／寬三種寬度與符合視窗，在 1440、1920、2560 寬下文件不超過設計上限；縮放後在預覽中標註新留言仍正確；(4) 點頁邊編號選取右欄留言、滑過留言畫出連線，捲動與縮放後連線端點仍對準；(5) 右欄篩選、回覆、標為已解決，閘門按鈕依狀態啟用，按「交給 Agent」後 dispatch_inbox 收到派工；(6) 目錄卡隨捲動更新 aria-current，關閉與重開浮動卡後文件重新置中；(7) Borderloop 配色淺深切換並保留選擇；(8) 390px 窄版下右欄改抽屜，Esc 關閉並歸還焦點；(9) 框架送出不合 schema 或來源不對的訊息時主頁忽略且不出錯。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 九個流程都有 spec，測試名稱帶 ARTSV-7.8 新增的 UXR 編號與既有 PRS、SND 等編號
- [x] #2 pnpm test:web 全數通過，evidence JSON 有這些測試
- [x] #3 桌面（1440、1920、2560）與 390px 都通過，失敗時附 trace 與截圖
- [x] #4 發現的問題已修正或另開 bug 單並連回本票
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
已實作並完成獨立審查修正。驗證：VITEST_MAX_WORKERS=2 pnpm verify:iteration（exit 0；全部測試與門檻不變）；project/evidence/review-board-iteration.json。B/F：UXR-012–018，project/evidence/review-board.json；協定敵意測試：project/evidence/review-reader-protocol.json。
<!-- SECTION:NOTES:END -->
