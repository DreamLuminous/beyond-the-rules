import Fastify from "fastify";
import { PlanRequestSchema, ActionPlanSchema } from "@btr/contracts";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "btr-api" }));

app.post("/v1/plan", async (request, reply) => {
  const parsed = PlanRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ code: "INVALID_REQUEST", issues: parsed.error.issues });

  // B TODO: 用结构化输出调用模型；当前占位实现明确拒绝，避免伪造计划。
  return reply.code(501).send({ code: "PLANNER_NOT_CONFIGURED", retryable: false });
});

app.post("/v1/validate-plan", async (request, reply) => {
  const parsed = ActionPlanSchema.safeParse(request.body);
  return parsed.success
    ? { valid: true, plan: parsed.data }
    : reply.code(400).send({ valid: false, issues: parsed.error.issues });
});

app.listen({ port: Number(process.env.PORT ?? 8787), host: "0.0.0.0" });

