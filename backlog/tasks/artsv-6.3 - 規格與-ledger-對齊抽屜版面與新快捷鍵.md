---
id: ARTSV-6.3
title: 規格與 ledger 對齊抽屜版面與新快捷鍵
status: Done
assignee: []
created_date: '2026-11-25T13:19:00Z'
updated_date: '2026-11-25T13:50:00Z'
labels: []
dependencies:
  - ARTSV-6.2
parent_task_id: ARTSV-6
priority: high
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
抽屜、T/C/V/←/→ 快捷鍵、上一個/下一個連動在 project/spec/conformance.yml 沒有需求編號。要新增 UXR 編號並把 reader-layout.spec.ts 的測試改成帶編號；UXR-004-F 的「預設 inspector 寬度」改寫為版本資訊抽屜；快捷鍵一覽條文（UXR-008 附近）補上新按鍵；artifact-server-product-spec.html 版面段落同步。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 新增的 UXR 需求各有 -B、-F 測試並通過
- [x] #2 UXR-004-F 與快捷鍵條文已更新，check-conformance-test-ids 與 validate-conformance 通過
- [x] #3 產品規格版面描述與實作一致
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
新增 UXR-009（抽屜預設收起、aria-expanded/aria-controls、不蓋滿預覽）、UXR-010（T/C/V/←/→/Esc，帶修飾鍵、輸入框、預覽 iframe 內不攔截）、UXR-011（底列上一個/下一個讓名稱、版本、路徑同步）。reader-layout.spec.ts 六個測試改名為 UXR-009~011 的 -B/-F，並新增 iframe 與目錄兩端的反向測試，全部通過。UXR-004-F 改為「留言抽屜預設寬度」，UXR-006-B 補列 ← → T C V（測試已驗證快捷鍵表確實列出）。review-refinements-spec.md 新增第 4 節 Reader layout，產品規格加一段版面描述。三個新需求狀態為 implementing（proof_gap：尚未以 pnpm test:web 記錄 browser 證據）。validate-conformance、check-conformance-test-ids 通過。commit 295d71a。
<!-- SECTION:FINAL_SUMMARY:END -->
