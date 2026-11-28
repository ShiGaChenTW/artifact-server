---
id: ARTSV-7.11
title: 白板模式：切換 Artifact 後版本抽屜頁籤與面板不一致（UAT F1）
status: Done
assignee: []
created_date: '2026-11-27T08:48:51Z'
updated_date: '2026-11-27T12:06:36Z'
labels: []
dependencies: []
parent_task_id: ARTSV-7
priority: medium
type: bug
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ego Lite UAT（/Users/scottchen/Documents/-Inbox/2026-11-27_review_egolite-reader-uat/README.md F1）已重現兩次：長報告開版本抽屜→選兩版並排比較→切檔案頁籤→關抽屜→上一個 Artifact 再下一個回來→重開版本抽屜。結果四個頁籤 aria-selected=true 數量為 0，面板卻顯示「尚未比較」。點版本頁籤可恢復。根因未查。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 先加入真實瀏覽器回歸測試，照 UAT 步驟重現 F1 並確認測試失敗
- [x] #2 重開抽屜時恰有一個可見頁籤為選取狀態，面板與頁籤一致
- [x] #3 回歸測試通過，pnpm verify:iteration 通過
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-27：原因是切換 Artifact 時清掉比較結果，抽屜卻停在已不存在的『比較』頁籤；改成清掉比較時退回『版本』頁籤（review-app.tsx leaveClearedComparison）。回歸測試 UXR-012-F（version drawer keeps one selected tab…），拿掉修正會失敗。check 通過、test:web 95/95。
<!-- SECTION:NOTES:END -->
