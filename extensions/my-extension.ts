import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // 注册自定义工具(LLM 可调用)
  pi.registerTool({
    description: "Greet someone by name",
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return {
        content: [
          {
            text: `Hello, ${params.name}!`,
            type: "text",
          },
        ],
        details: {},
      };
    },
    label: "Greet",
    name: "greet",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
  });

  // 订阅生命周期事件
  pi.on("tool_call", async (event, ctx) => {
    if (
      event.toolName === "bash" &&
      (event.input.command as string).includes?.("rm -rf")
    ) {
      const ok = await ctx.ui.confirm("危险操作!", "允许 rm -rf 吗?");
      if (!ok) {
        return { block: true, reason: "用户拒绝" };
      }
    }
  });

  // 注册斜杠命令
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) =>
      ctx.ui.notify(`Hello ${args || "world"}!`, "info"),
  });
}
