import Fastify from "fastify";
import { ActionPlanSchema, ExecutionResultSchema, PlanRequestSchema } from "@btr/contracts";
import { explainResult, generatePlanWithLlm, llmConfigFromEnv } from "./planner";

const app = Fastify({ logger: true });
const cfg = llmConfigFromEnv();

/** M1：请求幂等——相同 requestId 不重复提交，直接返回上次结果。 */
const recent = new Map<string, unknown>();
const RECENT_MAX = 256;
function remember(key: string, value: unknown): void {
  if (recent.size >= RECENT_MAX) {
    const oldest = recent.keys().next().value;
    if (oldest !== undefined) recent.delete(oldest);
  }
  recent.set(key, value);
}

app.get("/health", async () => ({
  ok: true,
  service: "btr-api",
  planner: cfg.apiKey ? "llm" : "rule-based",
}));

app.post("/v1/plan", async (request, reply) => {
  const parsed = PlanRequestSchema.safeParse(request.body);
  if (!parsed.success)
    return reply.code(400).send({ code: "INVALID_REQUEST", userMessage: "请求不符合协议。", issues: parsed.error.issues });

  const { requestId } = parsed.data;

  // 幂等：同 requestId 直接复用
  if (recent.has(`plan:${requestId}`)) {
    const cached = recent.get(`plan:${requestId}`) as { status: number; body: unknown };
    return reply.code(cached.status).send(cached.body);
  }

  const outcome = await generatePlanWithLlm(cfg, parsed.data);

  if ("plan" in outcome) {
    const body = outcome.plan;
    remember(`plan:${requestId}`, { status: 200, body });
    return reply.code(200).send(body);
  }
  const err = outcome.error;
  const status = err.code === "MODEL_TIMEOUT" ? 504 : err.code === "PLANNER_NOT_CONFIGURED" ? 501 : 422;
  const body = { ...err };
  remember(`plan:${requestId}`, { status, body });
  return reply.code(status).send(body);
});

app.post("/v1/validate-plan", async (request, reply) => {
  const parsed = ActionPlanSchema.safeParse(request.body);
  return parsed.success
    ? { valid: true, plan: parsed.data }
    : reply.code(400).send({ valid: false, issues: parsed.error.issues });
});

/** M4：结果解释。只读取 ExecutionResult，绝不虚构世界变化。 */
app.post("/v1/explain", async (request, reply) => {
  const parsed = ExecutionResultSchema.safeParse(request.body);
  if (!parsed.success)
    return reply.code(400).send({ code: "INVALID_REQUEST", userMessage: "请求不符合协议。", issues: parsed.error.issues });
  const history = Array.isArray((request.body as { history?: string[] }).history) ? (request.body as { history: string[] }).history : [];
  return explainResult(parsed.data, history);
});

app.listen({ port: Number(process.env.PORT ?? 8787), host: "0.0.0.0" });
