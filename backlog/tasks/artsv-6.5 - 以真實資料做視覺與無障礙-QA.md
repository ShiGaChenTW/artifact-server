---
id: ARTSV-6.5
title: 以真實資料做視覺與無障礙 QA
status: Done
assignee: []
created_date: '2026-11-25T13:19:00Z'
updated_date: '2026-11-25T13:50:00Z'
labels: []
dependencies:
  - ARTSV-6.2
parent_task_id: ARTSV-6
priority: medium
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
改版截圖用的是測試資料。要補測：空狀態、錯誤狀態、超長檔名、大量留言、大量 Artifact、中英文介面切換、窄版、螢幕閱讀器朗讀抽屜與 aria-expanded。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 各情境在淺深兩色、桌面與 390px 窄版都有截圖
- [x] #2 發現的問題已修正或另開單
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
以真實 API 播種（60 個 Artifact、30 則留言、超長中英檔名與路徑、空專案、不存在的 Artifact、兩個連結資料夾），在淺/深色、1440 與 390 寬、中英文介面截 120 張圖，存於 ~/Documents/-Inbox/2026-11-25_proposal_reader-redesign/screenshots/qa/，另有 qa-findings.json 與 qa-aria-report.txt。axe（wcag2a/aa）0 違規；三個抽屜都有可及名稱，鍵盤 Tab 可到達所有抽屜控制項（33/33、68/68、6/6）。已修：檔案表長檔名把其他欄擠出畫面、390 寬頂欄導覽縮成一條、空狀態與錯誤狀態變成整高窄欄且被錯誤列蓋住、資料夾樹「Default · Whole project」中點字串、標題截斷時無完整名稱。未修（列為後續）：目錄數字與位置只計已載入的頁（60 個顯示 23）、窄版標題列佔約 300px 高、設定頁專案狀態與目錄列 public 仍是 pill（UXR-002 釘住）、page 錨點留言顯示「找不到位置」。commit ce76f35。
<!-- SECTION:FINAL_SUMMARY:END -->
