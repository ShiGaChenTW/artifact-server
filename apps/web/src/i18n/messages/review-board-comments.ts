import {defineMessages} from "@/i18n/locale";

export const boardCommentsText = defineMessages({
  en: {
    gateLabel: "Comment workflow",
    resolveAll: "Resolve all open threads",
    resolving: "Resolving threads…",
    send: "Send to agent",
    sendTo: (name: string) => `Send to ${name}`,
    summary: (sendable: number, open: number, awaiting: number) =>
      `${sendable} ready to send · ${open} open · ${awaiting} awaiting you`,
  },
  "zh-TW": {
    gateLabel: "留言派工與確認",
    resolveAll: "全部標為已解決",
    resolving: "正在標為已解決…",
    send: "交給 Agent",
    sendTo: (name) => `交給 ${name}`,
    summary: (sendable, open, awaiting) =>
      `${sendable} 則尚未派工 · ${open} 則未解決 · ${awaiting} 則待你確認`,
  },
});
