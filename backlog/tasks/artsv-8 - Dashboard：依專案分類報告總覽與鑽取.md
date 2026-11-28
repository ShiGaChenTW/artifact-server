---
id: ARTSV-8
title: Dashboard：依專案分類報告總覽與鑽取
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-26T20:19:00Z'
updated_date: '2026-11-28T04:45:32Z'
labels:
  - project-reports
dependencies: []
references:
  - ARTSV-1
  - ARTSV-5
documentation:
  - >-
    /Users/scottchen/Documents/-Inbox/2026-11-27_research_project-report-classification.md
  - project/spec/dashboard-insights-spec.md
  - project/spec/conformance.yml
  - project/spec/phase-8-project-scoped-artifacts.md
priority: medium
type: enhancement
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
讓使用者在同一頁看出各專案的報告數量、審閱待辦與用量，並直接進入該專案報告清單，免去反覆切換專案才能比較的操作。此處「報告」沿用現有 artifact 的定義，不新增只靠副檔名判定的報告類型。

執行限制：Scott 於 2026-11-27 明確要求「研究專案報告分類做法後開單等待我通知實作」。本單僅追蹤後續工作，維持 To Do、未指派；收到 Scott 明確通知前不得取單、修改產品碼或啟動實作。研究建議為提案，尚非核准的介面設計。

背景：專案歸屬、專案內資料夾與標籤、跨專案移動及單一專案 Dashboard 已存在；本單補「各專案並列摘要與報告入口」。依前文 Dashboard 情境界定本單；若後續要的是不同的報告分類工作流，開工前由 Scott 確認並調整範圍。沿用目前部署支援範圍，不藉此擴張其他儲存提供者。既有 ARTSV-1 與 ARTSV-5 提供基礎能力，避免重做。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 所有專案視圖逐一列出專案名稱、artifact 數、版本數、最後發佈時間；零、一、多專案及空專案均有清楚且可區別的呈現，封存狀態可辨識，同名專案不混併。
- [x] #2 各專案摘要包含未解決留言串數、進行中與失敗派工數、保留版本的邏輯儲存量；數值與同範圍單一專案統計一致，現存總量與時間窗內活動的口徑可辨識。
- [x] #3 跨專案共用內容的去重用量明確標示其計算範圍；專案數字相加不被誤稱為整個 installation 的實際磁碟占用，垃圾桶保留版本與已清除資料依既有口徑處理。
- [x] #4 每個專案可進入其報告／檔案清單及單一專案 Dashboard，網址保留專案範圍與適用的時間窗；重新整理後仍保持選取範圍，清單不混入其他專案資料。
- [x] #5 分類以既有專案為主，資料夾與標籤保有既有用途；瀏覽摘要不自動搬移或重建報告，artifact／version ID、不可變內容及既有連結維持有效。
- [x] #6 未授權與外部 installation 的專案不可被列出、鑽取或從數字推知；未知專案與不支援統計的部署延續既有錯誤語意，載入與失敗狀態不得偽裝成零。
- [x] #7 以真實服務與隔離儲存驗證兩專案、共用 blob、同名／空／封存專案、垃圾桶及跨專案權限案例；繁中與英文、鍵盤操作、窄螢幕與深淺主題的分類摘要和入口皆通過瀏覽器驗收。
- [x] #8 同步產品規格與 ledger，為新增行為及敵意情境附可追溯的驗收證據；pnpm verify:iteration 通過，效能敏感變更依 AGENTS.md 附同環境前後基準，尚未證明的需求明確列出。
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-28：Scott 下令開工（原 awaiting-user-go 移除）。分支 feat/artsv-8-project-overview。

2026-11-28 實作完成（待 parent 收單）：
- 改動：ProjectInsight 每列新增 openThreads、inProgressDispatches（queued/claimed/delivered）、failedDispatches、logicalBytes、versionsInWindow；SQLite 以 5 個限定 installation 範圍的 GROUP BY 子查詢計算，非逐專案查詢。儀表板「概況」分頁在所有專案視圖顯示專案表（零／一／多專案皆顯示），連結至該專案儀表板（保留時間窗）與 Files（/review/files?project=），同名專案顯示 ID，空／封存專案有標記，去重實際儲存標示為整台伺服器範圍。
- 新需求：DSH-006、DSH-007（conformance：tests/conformance/dsh-project-overview.test.ts）、DSH-008（Playwright：tests/browser/dsh-project-overview.spec.ts），spec 與 ledger 已同步，status verified。
- 驗證：npx -y pnpm@10.34.3 verify:iteration → EXIT 0（vitest 404/404、Playwright 98/98、conformance ledger 357 項有效）。
- 效能：perf:baseline 前後同機執行，指標於雜訊範圍（該基準不涵蓋 insights）；另以 31 專案×10 artifact×2 版本實測 readInsights：全部專案中位數 2.6→2.8ms、單一專案 1.6→1.85ms（多算 5 項欄位）。
- 已清除（purge）依 file-management-spec 9.4 不回收位元組，故仍計入保留位元組；零專案狀態以瀏覽器 route 改寫回應驗證（實際 installation 必有預設專案）。
<!-- SECTION:NOTES:END -->
