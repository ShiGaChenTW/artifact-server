---
id: ARTSV-7.8
title: 規格、測試與驗證
status: Done
assignee: []
created_date: '2026-11-25T17:17:00Z'
updated_date: '2026-11-26T14:23:00Z'
labels: []
dependencies:
  - ARTSV-7.2
  - ARTSV-7.4
  - ARTSV-7.5
  - ARTSV-7.6
  - ARTSV-7.7
  - ARTSV-7.9
parent_task_id: ARTSV-7
priority: high
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
在 conformance.yml 新增白板模式 UXR-012 至 UXR-018（模式、脈絡、白板引擎、浮動卡、右欄閘門、協定與配色），以真實 HTTP、暫存 SQLite／磁碟及實際 review-frame 寫 B/F 測試。只保留 Borderloop 預設配色一組的淺深色，桌面及 390px 截圖；跑完整 pnpm verify:iteration 並附證據。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 新 UXR 需求皆 verified 並附證據
- [x] #2 pnpm verify:iteration 通過
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
已實作並完成獨立審查修正。驗證：VITEST_MAX_WORKERS=2 pnpm verify:iteration（exit 0；全部測試與門檻不變）；project/evidence/review-board-iteration.json。B/F：UXR-012–018，project/evidence/review-board.json；協定敵意測試：project/evidence/review-reader-protocol.json。
<!-- SECTION:NOTES:END -->
