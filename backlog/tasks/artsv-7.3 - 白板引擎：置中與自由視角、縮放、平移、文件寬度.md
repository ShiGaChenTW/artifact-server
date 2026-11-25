---
id: ARTSV-7.3
title: 白板引擎：置中與自由視角、縮放、平移、文件寬度
status: To Do
assignee: []
created_date: '2026-11-25T17:17:00Z'
labels: []
dependencies:
  - ARTSV-7.1
parent_task_id: ARTSV-7
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把預覽框架放在可縮放的白板上：置中視角（文件恆置中）與自由視角（拖空白處平移、拖標頭移動文件）；縮放 40% 至 200%，按住 ⌘ 或 Ctrl 加滾輪縮放，一般滾輪留給文件捲動；縮小、放大、符合視窗按鈕；文件寬度窄 560、原始 780、寬（最多 1040）。只用 transform，不動畫寬高；iframe sandbox 維持 allow-scripts。修正原頁的問題：窄版要可用、展開脈絡列後要重排。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 兩種視角、縮放、平移、寬度切換都可用鍵盤操作
- [ ] #2 縮放後 Plannotator 標註、選取與捲動照常運作
- [ ] #3 reduced-motion 下沒有動畫
<!-- AC:END -->
