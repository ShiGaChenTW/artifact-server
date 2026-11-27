---
id: ARTSV-7.13
title: 白板模式：觸控窄版展開脈絡後預覽只剩 71px（UAT F3）
status: Done
assignee: []
created_date: '2026-11-27T08:48:53Z'
updated_date: '2026-11-27T12:06:36Z'
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
- [x] #1 在 390×844 粗指標、脈絡展開情境加入瀏覽器測試，量測預覽可閱讀高度並設下限
- [x] #2 展開脈絡後預覽仍有足夠閱讀空間（下限寫進規格或測試），收合行為不退步
- [x] #3 測試通過，pnpm verify:iteration 通過
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-27：窄版展開脈絡時暫時隱藏兩張卡、工具列改單列橫捲，sheet 高度改為 100%/scale。新規則寫入 UXR-013-F 與 review-board-spec.html：展開後預覽至少為白板高度一半且不低於收合時。回歸測試在 390×844 hasTouch/isMobile 下跑，拿掉修正會失敗。
<!-- SECTION:NOTES:END -->
