---
id: ARTSV-7.7
title: 浮動卡：目錄卡與留言狀態卡
status: To Do
assignee: []
created_date: '2026-11-25T17:17:00Z'
labels: []
dependencies:
  - ARTSV-7.3
  - ARTSV-7.5
parent_task_id: ARTSV-7
priority: medium
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
白板左上浮動兩張卡：目錄卡（章節由預覽框架回報的 h1 到 h3，點擊捲動到該章，目前章節以 aria-current 標示）、留言狀態卡（未解決、待你確認、已派工、已解決計數）。可關閉，關閉後白板把空間還給文件並出現重新開啟按鈕；閒置時半透明，滑過或取得焦點時不透明。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 目錄隨文件捲動更新目前章節
- [ ] #2 關閉與重開卡片後文件重新置中
- [ ] #3 計數與留言資料一致
<!-- AC:END -->
