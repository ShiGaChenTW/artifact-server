---
id: ARTSV-7.1
title: 模式切換：閱讀模式與審閱白板
status: To Do
assignee: []
created_date: '2026-11-25T17:17:00Z'
labels: []
dependencies: []
parent_task_id: ARTSV-7
priority: medium
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
標題列加入「閱讀／審閱白板」切換，帶 aria-pressed，鍵盤可操作；切換時保留目前 Artifact、版本與選取的留言；模式選擇存在瀏覽器（localStorage，讀寫失敗時退回閱讀模式）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 兩種模式可來回切換且不重新載入預覽
- [ ] #2 重新整理後保留上次的模式
- [ ] #3 窄版（760px 以下）兩種模式都可用
<!-- AC:END -->
