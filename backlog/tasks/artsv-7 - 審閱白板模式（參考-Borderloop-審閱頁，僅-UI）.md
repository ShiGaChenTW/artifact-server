---
id: ARTSV-7
title: 審閱白板模式（參考 Borderloop 審閱頁，僅 UI）
status: In Progress
assignee: []
created_date: '2026-11-25T17:17:00Z'
updated_date: '2026-11-26T14:23:00Z'
labels: []
dependencies:
  - ARTSV-6
references:
  - >-
    /Users/scottchen/Documents/-Inbox/2026-11-26_research_borderloop-review-replica/README.md
priority: medium
type: feature
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
在審閱頁新增第二種模式「審閱白板」，與 ARTSV-6 的閱讀模式可切換。版面與互動參考 Borderloop 規格審閱頁（/Users/scottchen/Desktop/封存/Borderloop/docs/Design/UI_J2-h2-buttons-warn-polish.html），報告與示範：/Users/scottchen/Documents/-Inbox/2026-11-26_research_borderloop-review-replica/README.md、/Users/scottchen/Documents/-Inbox/2026-11-26_research_borderloop-review-replica/review-board-demo.html。Scott 2026-11-26 定案：(1) 做成第二種模式；(2) 不加留言風險等級；(3) 不做段落三態、批准規格、AI 起草出處，本次只調整 UI 元件，流程面只做小幅優化；(4) 只沿用 Borderloop 的預設配色一組（淺深各一），不做 paper、teal、graphite。發現對應留言串，核准閘對應派工（交給 Agent）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 閱讀模式與審閱白板可切換，兩者共用留言、版本、派工資料
- [x] #2 新行為有帶 UXR 編號的 B/F 瀏覽器測試並通過
- [x] #3 pnpm verify:iteration 通過
- [ ] #4 E2E 完整審閱流程通過（ARTSV-7.9），UAT 已由 Scott 簽核（ARTSV-7.10）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ARTSV-7.1–7.9 自動實作與驗證完成；母單第4條仍待 ARTSV-7.10 Scott 實機UAT簽核，不標為完成。未推送或合併。
<!-- SECTION:NOTES:END -->
