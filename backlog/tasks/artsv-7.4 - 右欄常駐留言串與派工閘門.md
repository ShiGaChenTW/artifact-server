---
id: ARTSV-7.4
title: 右欄常駐留言串與派工閘門
status: To Do
assignee: []
created_date: '2026-11-25T17:17:00Z'
labels: []
dependencies:
  - ARTSV-7.1
parent_task_id: ARTSV-7
priority: high
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
白板模式右側常駐留言串（沿用留言抽屜的資料與操作），上方依狀態篩選：全部、未解決、待你確認、已解決；底部閘門：交給 Agent（只有尚未派工的留言時才可按）、全部標為已解決（只有未解決留言時才可按），下方一行說明各有幾則。這是唯一的流程面小幅優化，不新增狀態或欄位。窄版右欄改成抽屜。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 篩選、選取、回覆、標為已解決與現有留言抽屜行為一致
- [ ] #2 閘門按鈕依狀態啟用並顯示說明
- [ ] #3 窄版右欄以抽屜開啟，Esc 可關閉並歸還焦點
<!-- AC:END -->
