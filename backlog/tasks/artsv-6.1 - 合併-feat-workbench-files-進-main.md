---
id: ARTSV-6.1
title: 合併 feat/workbench-files 進 main
status: Done
assignee: []
created_date: '2026-11-25T13:19:00Z'
updated_date: '2026-11-27T02:43:00Z'
labels: []
dependencies: []
parent_task_id: ARTSV-6
priority: high
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
feat/workbench-files（b22120b）比 main 多 55 個 commit，包含檔案頁、連結資料夾、垃圾桶、FLD-008，目前沒有 PR。改版依賴這些頁面，必須先合併。b22120b 已有 verify:iteration 證據，主要工作是開 PR、等 CI、review。不可夾帶 docs/repo-xray-pm/、graft 相關檔案、.artifact-server symlink。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PR 開到 ShiGaChenTW/artifact-server，base main
- [x] #2 CI 全綠並合併
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-27 合併 PR #2（merge commit c32a465）。fork 的 CI 不會被 pull_request 自動觸發，手動 dispatch 兩次（runs 45921912765、45928581032）：Build、Browser、Cloudflare 通過；FOV-003-B 暖掃描在 GitHub runner 7.6s、9.5s 超過 5s 規格上限，本機通過。Scott 決定以本機 verify:iteration 證據合併，CI 掃描效能另開 ARTSV-9 追蹤。
<!-- SECTION:NOTES:END -->
