import { z } from "zod";

export const ContractVersionSchema = z.literal(1);
export const IdSchema = z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/i);
export const Vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const CommandTypeSchema = z.enum([
  "physics.move", "physics.setGravity", "physics.applyForce",
  "mechanism.rotate", "mechanism.setState", "city.setPolicy",
  "city.advanceSimulation"
]);

const PhysicsMoveSchema = z.object({
  type: z.literal("physics.move"), targetId: IdSchema, destination: Vec2Schema,
  durationMs: z.number().int().min(100).max(10_000)
});
const PhysicsSetGravitySchema = z.object({
  type: z.literal("physics.setGravity"), targetId: IdSchema,
  gravityScale: z.number().min(-1).max(3), durationTicks: z.number().int().min(1).max(3_600)
});
const PhysicsApplyForceSchema = z.object({
  type: z.literal("physics.applyForce"), targetId: IdSchema,
  force: Vec2Schema, durationTicks: z.number().int().min(1).max(600)
});
const MechanismRotateSchema = z.object({
  type: z.literal("mechanism.rotate"), targetId: IdSchema,
  degrees: z.number().min(-360).max(360)
});
const MechanismSetStateSchema = z.object({
  type: z.literal("mechanism.setState"), targetId: IdSchema,
  state: z.enum(["on", "off", "open", "closed"])
});
const CitySetPolicySchema = z.object({
  type: z.literal("city.setPolicy"),
  waterAllocation: z.object({
    residential: z.number().min(0).max(100), agriculture: z.number().min(0).max(100),
    industry: z.number().min(0).max(100), ecology: z.number().min(0).max(100)
  }).refine(v => Math.abs(v.residential + v.agriculture + v.industry + v.ecology - 100) < 0.001,
    "water allocation must total 100"),
  irrigationWindow: z.enum(["day", "night", "balanced"]),
  industryCap: z.number().min(0).max(100)
});
const CityAdvanceSimulationSchema = z.object({
  type: z.literal("city.advanceSimulation"), days: z.number().int().min(1).max(7)
});

export const WorldCommandSchema = z.discriminatedUnion("type", [
  PhysicsMoveSchema, PhysicsSetGravitySchema, PhysicsApplyForceSchema,
  MechanismRotateSchema, MechanismSetStateSchema, CitySetPolicySchema,
  CityAdvanceSimulationSchema
]);
export type WorldCommand = z.infer<typeof WorldCommandSchema>;

export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("immediate") }),
  z.object({ type: z.literal("objectState"), targetId: IdSchema, property: z.string().min(1), equals: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ type: z.literal("stepCompleted"), stepId: IdSchema })
]);

export const ActionStepSchema = z.object({
  id: IdSchema,
  dependsOn: z.array(IdSchema).max(12).default([]),
  trigger: TriggerSchema.default({ type: "immediate" }),
  command: WorldCommandSchema
});

export const ActionPlanSchema = z.object({
  version: ContractVersionSchema,
  requestId: IdSchema,
  worldRevision: z.number().int().nonnegative(),
  summary: z.string().min(1).max(300),
  steps: z.array(ActionStepSchema).min(1).max(16),
  estimatedCost: z.number().nonnegative(),
  requiresConfirmation: z.boolean().default(false)
});
export type ActionPlan = z.infer<typeof ActionPlanSchema>;

export const AgentActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("inspect"), targetId: IdSchema }),
  z.object({
    type: z.literal("navigate"), targetId: IdSchema,
    stopDistance: z.number().min(24).max(240).default(64)
  }),
  z.object({
    type: z.literal("push"), targetId: IdSchema,
    direction: z.enum(["left", "right"]), force: z.number().min(80).max(600)
  }),
  z.object({ type: z.literal("activate"), targetId: IdSchema }),
  z.object({ type: z.literal("stop") })
]);
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const AgentPolicySchema = z.object({
  version: ContractVersionSchema,
  requestId: IdSchema,
  worldRevision: z.number().int().nonnegative(),
  goal: z.string().min(1).max(300),
  constraints: z.array(z.string().min(1).max(160)).max(12),
  steps: z.array(z.object({
    id: IdSchema,
    dependsOn: z.array(IdSchema).max(12).default([]),
    action: AgentActionSchema
  })).min(1).max(16)
});
export type AgentPolicy = z.infer<typeof AgentPolicySchema>;

export const WorldObjectSchema = z.object({
  id: IdSchema, kind: z.string().min(1), label: z.string().min(1),
  position: Vec2Schema.optional(), state: z.record(z.union([z.string(), z.number(), z.boolean()])),
  capabilities: z.array(z.string()), immutable: z.boolean().default(false)
});

export const WorldSnapshotSchema = z.object({
  version: ContractVersionSchema, levelId: IdSchema, worldRevision: z.number().int().nonnegative(),
  selectedObjectIds: z.array(IdSchema), objective: z.string().min(1),
  constraints: z.array(z.string().min(1).max(160)).max(24).default([]),
  budgetRemaining: z.number().nonnegative(), objects: z.array(WorldObjectSchema).max(100),
  allowedCommands: z.array(CommandTypeSchema).min(1)
});
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;

export const LevelDraftSchema = z.object({
  version: ContractVersionSchema,
  id: IdSchema,
  name: z.string().min(1).max(120),
  size: z.object({
    width: z.number().int().min(640).max(8_000),
    height: z.number().int().min(360).max(4_000)
  }),
  spawn: Vec2Schema,
  objective: z.string().min(1).max(300),
  constraints: z.array(z.string().min(1).max(160)).max(24).default([]),
  objects: z.array(z.object({
    id: IdSchema,
    kind: z.string().min(1).max(80),
    position: Vec2Schema,
    size: Vec2Schema.optional(),
    properties: z.record(z.union([z.string(), z.number(), z.boolean()])).default({})
  })).min(1).max(200),
  successConditions: z.array(z.string().min(1).max(200)).min(1).max(12)
});
export type LevelDraft = z.infer<typeof LevelDraftSchema>;

const RuleConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("always") }),
  z.object({
    type: z.literal("objectState"), targetId: IdSchema, property: z.string().min(1).max(80),
    operator: z.enum(["equals", "greaterThan", "lessThan"]),
    value: z.union([z.string(), z.number(), z.boolean()])
  }),
  z.object({ type: z.literal("timer"), elapsedMs: z.number().int().min(0).max(600_000) })
]);

export const RuleScriptSchema = z.object({
  version: ContractVersionSchema,
  id: IdSchema,
  name: z.string().min(1).max(120),
  rules: z.array(z.object({
    id: IdSchema,
    when: RuleConditionSchema,
    then: z.array(WorldCommandSchema).min(1).max(12),
    once: z.boolean().default(false)
  })).min(1).max(32)
});
export type RuleScript = z.infer<typeof RuleScriptSchema>;

export const PlanRequestSchema = z.object({
  version: ContractVersionSchema, requestId: IdSchema,
  utterance: z.string().min(1).max(1_000), snapshot: WorldSnapshotSchema
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const ExecutionResultSchema = z.object({
  version: ContractVersionSchema, requestId: IdSchema, planId: IdSchema.optional(),
  status: z.enum(["completed", "rejected", "cancelled", "partially_completed"]),
  worldRevisionBefore: z.number().int().nonnegative(), worldRevisionAfter: z.number().int().nonnegative(),
  stepResults: z.array(z.object({
    stepId: IdSchema, status: z.enum(["completed", "rejected", "skipped"]),
    code: z.string().optional(), message: z.string(), changes: z.array(z.string()).default([])
  })),
  userMessage: z.string().min(1), undoToken: z.string().optional()
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export const LevelDefinitionSchema = z.object({
  version: ContractVersionSchema, id: IdSchema, name: z.string().min(1), mode: z.enum(["platform", "simulation"]),
  objective: z.string().min(1), budget: z.number().positive(), allowedCommands: z.array(z.string()).min(1),
  immutableObjectIds: z.array(IdSchema), successConditions: z.array(z.string()).min(1),
  testedSolutionIds: z.array(IdSchema).min(2), hiddenAreas: z.array(IdSchema), achievementIds: z.array(IdSchema)
});
export type LevelDefinition = z.infer<typeof LevelDefinitionSchema>;

