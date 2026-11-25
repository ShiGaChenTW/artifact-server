---
id: ARTSV-6.8
title: 完整 verify:iteration、code review、合併改版
status: To Do
assignee: []
created_date: '2026-11-25T13:19:00Z'
updated_date: '2026-11-25T14:07:00Z'
labels: []
dependencies:
  - ARTSV-6.3
  - ARTSV-6.4
  - ARTSV-6.5
parent_task_id: ARTSV-6
priority: high
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
在有 Docker 的環境跑完整 pnpm verify:iteration，並把 pnpm test、test:web 寫出的 evidence JSON 一起 commit。Code review 重點是 review-app.tsx 的快捷鍵、抽屜狀態、inspector 搬進抽屜。合併前注意 dependabot #99（motion 14）是否已合併，若有要重跑測試。改版合併前不要開其他動審閱頁的分支。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm verify:iteration 通過，證據已 commit
- [ ] #2 code review 的問題已處理
- [ ] #3 PR 已合併進 main
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25 完整 pnpm verify:iteration 通過（exit 0，含 Docker、MinIO、Postgres、Keycloak、Helm、Pulumi 步驟），瀏覽器 66/66。UXR-009～011 已標為 verified 並附 browser.json 證據。待 code review 與合併。
<!-- SECTION:NOTES:END -->
