---
id: ARTSV-6.6
title: 收尾：設定頁頂欄、連結資料夾卡片、儀表板文案
status: Done
assignee: []
created_date: '2026-11-25T13:19:00Z'
updated_date: '2026-11-25T13:50:00Z'
labels: []
dependencies:
  - ARTSV-6.2
parent_task_id: ARTSV-6
priority: low
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
設定頁仍是舊頂欄，要換成 app-shell 的共用 AppTopBar；連結資料夾頁內卡片未重新設計；儀表板活動列的「Local · 3 次在」等中點串接文案要改寫。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 設定頁使用共用頂欄
- [x] #2 連結資料夾頁沒有框起來的卡片列
- [x] #3 儀表板活動文案沒有中點串接
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
設定頁改用共用 AppTopBar（area=settings 標示目前，Sign out 放在其後，品牌與 Review 連結回到原審閱網址）；連結資料夾頁拿掉框起來的卡片與 pill 狀態，改為分隔線列，清單表格沿用檔案表樣式，並修正「1 files」；儀表板活動群組與待處理項目改為 i18n 句子（如「25 comments left by Local」「Local 新增了 25 則留言」），連結資料夾清單標題與項目狀態也去掉中點。ledger 未釘住這些文案；UXR-001-B 的 /3.*publish/ 仍符合。commit c321730。
<!-- SECTION:FINAL_SUMMARY:END -->
