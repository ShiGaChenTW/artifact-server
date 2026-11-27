---
id: ARTSV-6.9
title: E2E：閱讀器改版跨頁使用流程
status: To Do
assignee: []
created_date: '2026-11-25T21:20:00Z'
labels: []
dependencies:
  - ARTSV-6.2
parent_task_id: ARTSV-6
priority: high
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
用 Playwright 對 pnpm build 後的真實伺服器（真實 HTTP、暫存 SQLite 與磁碟，不用 module mock）跑跨頁流程，補足 reader-layout.spec.ts 只測單頁行為的缺口。放在 tests/browser/e2e-reader-journeys.spec.ts，跟 test:web 一起跑並寫入 browser evidence。流程：(1) 用 CLI 或 MCP 發布兩個 Artifact 與一個新版本 → 儀表板分組待處理清單出現它們 → 點進閱讀器；(2) 閱讀器以 T、C、V 開關目錄、留言、版本資訊抽屜，Esc 關閉並歸還焦點，← → 與底列上一個／下一個切換 Artifact 且不循環；(3) 在預覽中標註留言、回覆、標為已解決、交給 Agent，回到儀表板確認計數變化；(4) 版本資訊抽屜切到舊版本、並排比較、還原；(5) 檔案頁移到資料夾、丟到垃圾桶、從垃圾桶還原，閱讀器路徑列同步；(6) 中英文切換、淺深主題切換後重跑 (2)。每個流程在桌面 1440 與 390px 窄版各跑一次。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 六個流程都有 spec，測試名稱帶它跨過的需求編號（UXR、FOV、TRS、FLD、LANG 等）
- [ ] #2 pnpm test:web 全數通過，evidence JSON 有這些測試
- [ ] #3 桌面與 390px 兩種寬度都通過，失敗時附 trace 與截圖
- [ ] #4 發現的問題已修正或另開 bug 單並連回本票
<!-- AC:END -->
