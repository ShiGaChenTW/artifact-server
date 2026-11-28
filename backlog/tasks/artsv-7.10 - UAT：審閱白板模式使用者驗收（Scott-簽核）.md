---
id: ARTSV-7.10
title: UAT：審閱白板模式使用者驗收（Scott 簽核）
status: To Do
assignee: []
created_date: '2026-11-25T21:21:00Z'
updated_date: '2026-11-27T08:49:00Z'
labels: []
dependencies:
  - ARTSV-7.8
  - ARTSV-7.11
  - ARTSV-7.12
  - ARTSV-7.13
parent_task_id: ARTSV-7
priority: high
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
自動測試與 verify:iteration 都通過後，由 Scott 在接近正式的環境親手驗收：建置後重啟 launchd 的 local.artifact-server（127.0.0.1:8787，真實資料），並從 MacBook 經 Tailscale SSH 轉發各驗一次。驗收前由 agent 產出清單 ~/Documents/-Inbox/<產出日>_review_review-board-uat.md，附 Borderloop 原頁與示範檔（2026-11-26_research_borderloop-review-replica）的對照截圖，每個情境寫明步驟、預期結果、通過／不通過／備註欄。情境：用白板審完一份真實規格文件並交給 Agent；在閱讀模式與白板之間來回切換做同一輪審閱；用觸控板縮放與平移的手感；外接 2560 螢幕上的最寬寬度與留白；文件卡頂部留白（對照 Scott 2026-11-26 截圖）；連線在長文件捲動時是否跟得上；Borderloop 配色淺深的可讀性；Safari 與 Chrome 各一次；窄視窗。不通過的項目開 bug 單，修好再複驗。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 驗收清單已產出，含對照截圖與預期結果
- [ ] #2 Scott 在本機與 Tailscale 轉發兩種連線都跑過清單
- [ ] #3 所有不通過項目已修正並複驗，或經 Scott 同意延後並另開單
- [ ] #4 Scott 簽核（清單上註記日期與結論），之後才能合併白板模式
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
UAT清單與原版／示範／實作對照截圖已備妥：/Users/scottchen/Documents/-Inbox/2026-11-26_review_review-board-uat.md。全自動 gate 已通過。Safari／Chrome、觸控板、外接螢幕、本機與Tailscale實機驗收及Scott簽核保持待辦；本輪未更動正式launchd服務。
<!-- SECTION:NOTES:END -->
