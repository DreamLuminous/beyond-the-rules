import { z } from "zod";

export const ContractVersionSchema = z.literal(1);
export const IdSchema = z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/i);
export const Vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const SizeSchema = z.object({
  width: z.number().positive().max(8_000),
  height: z.number().positive().max(4_000)
});
export const MirrorOrientationSchema = z.enum(["/", "\\"]);
export type MirrorOrientation = z.infer<typeof MirrorOrientationSchema>;
export const CommandTypeSchema = z.enum([
  "physics.move", "physics.setGravity", "physics.applyForce",
  "mechanism.rotate", "mechanism.setState", "city.setPolicy",
  "city.advanceSimulation", "city.setIrrigation", "city.setFacility"
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
const CitySetIrrigationSchema = z.object({
  type: z.literal("city.setIrrigation"),
  enabled: z.boolean(),
  minimumReserve: z.number().min(0).max(100)
});
const CitySetFacilitySchema = z.object({
  type: z.literal("city.setFacility"),
  facilityId: IdSchema,
  enabled: z.boolean()
});

export const WorldCommandSchema = z.discriminatedUnion("type", [
  PhysicsMoveSchema, PhysicsSetGravitySchema, PhysicsApplyForceSchema,
  MechanismRotateSchema, MechanismSetStateSchema, CitySetPolicySchema,
  CityAdvanceSimulationSchema, CitySetIrrigationSchema, CitySetFacilitySchema
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

export const LevelObjectSchema = z.object({
  id: IdSchema,
  kind: z.string().min(1).max(80),
  position: Vec2Schema,
  size: SizeSchema.optional(),
  properties: z.record(z.union([z.string(), z.number(), z.boolean()])).default({})
});
export type LevelObject = z.infer<typeof LevelObjectSchema>;

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
  objects: z.array(LevelObjectSchema).min(1).max(200),
  successConditions: z.array(z.string().min(1).max(200)).min(1).max(12)
});
export type LevelDraft = z.infer<typeof LevelDraftSchema>;

export const ValidationCheckSchema = z.object({
  id: z.string().min(1).max(80),
  ok: z.boolean(),
  detail: z.string().min(1).max(300)
});
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;

export const LevelValidationIssueSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(300)
});
export type LevelValidationIssue = z.infer<typeof LevelValidationIssueSchema>;

export const LevelSolutionSchema = z.object({
  mirrorOrientations: z.record(MirrorOrientationSchema),
  pathLength: z.number().int().positive(),
  gatesOpened: z.array(IdSchema)
});
export type LevelSolution = z.infer<typeof LevelSolutionSchema>;

export const LevelValidationSchema = z.object({
  version: ContractVersionSchema,
  levelId: IdSchema,
  ok: z.boolean(),
  solvable: z.boolean(),
  checks: z.array(ValidationCheckSchema).min(1).max(32),
  issues: z.array(LevelValidationIssueSchema).max(24).default([]),
  solution: LevelSolutionSchema.optional(),
  difficulty: z.object({
    rating: z.enum(["easy", "normal", "hard"]),
    pathLength: z.number().int().nonnegative(),
    mechanics: z.array(z.string().min(1).max(80)).max(12)
  })
});
export type LevelValidation = z.infer<typeof LevelValidationSchema>;

const LeafRuleConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("always") }),
  z.object({
    type: z.literal("objectState"), targetId: IdSchema, property: z.string().min(1).max(80),
    operator: z.enum(["equals", "greaterThan", "lessThan"]),
    value: z.union([z.string(), z.number(), z.boolean()])
  }),
  z.object({ type: z.literal("timer"), elapsedMs: z.number().int().min(0).max(600_000) })
]);
export type LeafRuleCondition = z.infer<typeof LeafRuleConditionSchema>;

export const RuleConditionSchema = z.union([
  LeafRuleConditionSchema,
  z.object({
    type: z.literal("all"),
    conditions: z.array(LeafRuleConditionSchema).min(1).max(8)
  }),
  z.object({
    type: z.literal("any"),
    conditions: z.array(LeafRuleConditionSchema).min(1).max(8)
  })
]);
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

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

export const CityWeatherSchema = z.enum(["normal", "drought"]);
export type CityWeather = z.infer<typeof CityWeatherSchema>;

export const CityAllocationSchema = z.object({
  residential: z.number().finite(),
  agriculture: z.number().finite(),
  industry: z.number().finite(),
  ecology: z.number().finite()
});
export type CityAllocation = z.infer<typeof CityAllocationSchema>;

export const CityDayReportSchema = z.object({
  day: z.number().int().min(1).max(7),
  weather: CityWeatherSchema,
  inflow: z.number().finite(),
  reservoir: z.number().finite(),
  release: z.number().finite(),
  allocation: CityAllocationSchema,
  residentialSupply: z.number().min(0).max(100),
  energyReliability: z.number().min(0).max(100),
  ecologyIndex: z.number().min(0).max(100),
  soilMoisture: z.number().min(0).max(100),
  industryOutput: z.number().min(0).max(100),
  agricultureOutput: z.number().min(0).max(100),
  activeRuleId: IdSchema,
  events: z.array(z.string().max(120)).max(8)
});
export type CityDayReport = z.infer<typeof CityDayReportSchema>;

export const CityAssessmentSchema = z.object({
  passed: z.boolean(),
  days: z.number().int().min(1).max(7),
  averageResidentialSupply: z.number(),
  averageEnergyReliability: z.number(),
  minEcologyIndex: z.number(),
  minimumReservoir: z.number(),
  failures: z.array(z.string().max(160)).max(12),
  reports: z.array(CityDayReportSchema).min(1).max(7)
});
export type CityAssessment = z.infer<typeof CityAssessmentSchema>;

