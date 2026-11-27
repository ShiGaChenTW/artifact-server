---
id: ARTSV-7.13
title: 白板模式：觸控窄版展開脈絡後預覽只剩 71px（UAT F3）
status: To Do
assignee: []
created_date: '2026-11-27T08:48:53Z'
labels: []
dependencies: []
parent_task_id: ARTSV-7
priority: medium
type: bug
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ego Lite UAT（/Users/scottchen/Documents/-Inbox/2026-11-27_review_egolite-reader-uat/README.md F3）：390×844、粗指標模擬、兩張資訊卡可見、展開文件脈絡後，關閉鈕 44px、脈絡 140px、預覽只剩 71px（收合時約 193px）。無橫向溢出，但無法閱讀。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 在 390×844 粗指標、脈絡展開情境加入瀏覽器測試，量測預覽可閱讀高度並設下限
- [ ] #2 展開脈絡後預覽仍有足夠閱讀空間（下限寫進規格或測試），收合行為不退步
- [ ] #3 測試通過，pnpm verify:iteration 通過
<!-- AC:END -->
