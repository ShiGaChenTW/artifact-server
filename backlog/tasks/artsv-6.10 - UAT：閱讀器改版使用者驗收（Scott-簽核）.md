---
id: ARTSV-6.10
title: UAT：閱讀器改版使用者驗收（Scott 簽核）
status: In Progress
assignee: []
created_date: '2026-11-25T21:20:00Z'
updated_date: '2026-11-28T01:29:24Z'
labels: []
dependencies:
  - ARTSV-6.9
parent_task_id: ARTSV-6
priority: high
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E 通過後，由 Scott 在接近正式的環境親手驗收：改版建置後重啟 launchd 的 local.artifact-server（127.0.0.1:8787，真實資料），並從 MacBook 經 Tailscale SSH 轉發（ssh -N -L 18787:127.0.0.1:8787）各驗一次。驗收前由 agent 產出驗收清單 ~/Documents/-Inbox/<產出日>_review_reader-redesign-uat.md，每個情境寫明步驟、預期結果、通過／不通過／備註欄。情境：日常審閱一份真實 Artifact（開抽屜、留言、交給 Agent）；用鍵盤完成一輪審閱不碰滑鼠；從儀表板找到待處理項目；在檔案頁整理資料夾並從垃圾桶救回；淺深主題與中英文各看一遍；Safari 與 Chrome 各一次（注意 *.localhost 預覽在 Safari 可能無法解析）；窄視窗或手機寬度。Scott 填完後，不通過的項目開 bug 單，修好再複驗。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 驗收清單已產出，情境、步驟、預期結果寫清楚
- [ ] #2 Scott 在本機與 Tailscale 轉發兩種連線都跑過清單
- [ ] #3 所有不通過項目已修正並複驗，或經 Scott 同意延後並另開單
- [ ] #4 Scott 簽核（清單上註記日期與結論），之後才能進 ARTSV-6.8 合併
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-28：驗收清單 ~/Documents/-Inbox/2026-11-28_review_reader-redesign-uat.md 已產出（R01–R07），先在 8877 開發版跑並補種 UAT6 資料。查到 launchd 沒有 local.artifact-server、8787 被 atlas.cli 佔用，正式服務那一輪待 Scott 決定。
<!-- SECTION:NOTES:END -->
