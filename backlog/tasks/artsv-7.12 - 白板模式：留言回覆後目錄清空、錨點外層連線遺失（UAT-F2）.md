---
id: ARTSV-7.12
title: 白板模式：留言回覆後目錄清空、錨點外層連線遺失（UAT F2）
status: To Do
assignee: []
created_date: '2026-11-27T08:48:52Z'
labels: []
dependencies: []
parent_task_id: ARTSV-7
priority: medium
type: bug
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ego Lite UAT（/Users/scottchen/Documents/-Inbox/2026-11-27_review_egolite-reader-uat/README.md F2）：70% 選字→新增留言→儲存→回覆→選中該留言後，目錄顯示「此預覽沒有章節標題」，外層 SVG 超過 10 秒沒有連線路徑；留言與回覆資料未遺失。重新載入後目錄恢復，連線一次重選仍未出現。最小重現步驟尚未縮減。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 縮減出最小重現步驟並寫成真實瀏覽器回歸測試（先失敗）
- [ ] #2 留言新增、回覆、選取之後，目錄章節與選中留言的外層連線都持續存在
- [ ] #3 回歸測試通過，pnpm verify:iteration 通過
<!-- AC:END -->
