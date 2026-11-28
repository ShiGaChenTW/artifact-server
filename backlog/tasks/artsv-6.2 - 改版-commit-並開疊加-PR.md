---
id: ARTSV-6.2
title: 改版 commit 並開疊加 PR
status: Done
assignee: []
created_date: '2026-11-25T13:19:00Z'
updated_date: '2026-11-27T08:49:59Z'
labels: []
dependencies:
  - ARTSV-6.1
parent_task_id: ARTSV-6
priority: high
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
在 worktree fork-artifact-server-reader（分支 feat/reader-redesign）commit 改版：29 個修改檔、4 個新增檔（themes/reader.css、review/app-shell.tsx、i18n/messages/reader.ts、tests/browser/reader-layout.spec.ts），約 +3,000／−1,400 行。PR 先以 feat/workbench-files 為 base，6.1 合併後改成 main。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PR 已開，描述列出變更摘要與偏離（次要色 #566B7E、輸入框邊框、分享鈕位置、上一個/下一個不循環、儀表板分組列表）
- [x] #2 6.1 合併後 PR base 改為 main，沒有衝突
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-27：PR #3 描述補上白板模式、七項偏離中與程式相關的六項、合併前待辦與 UAT F1–F3。
<!-- SECTION:NOTES:END -->
