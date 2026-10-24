import type { CityAllocation, CityDayReport, CityWeather } from "@btr/contracts";

export const CITY_DAYS = 7;
export const RESIDENTIAL_NEED = 6;
export const INDUSTRY_NEED = 6;
export const AGRICULTURE_NEED = 4;
export const ECOLOGY_NEED = 4;

export type CityPolicy = {
  share: CityAllocation;
  industryCap: number;
  irrigation: boolean;
  minimumReserve: number;
  sparePump: boolean;
};

export const DEFAULT_POLICY: CityPolicy = {
  share: { residential: 35, agriculture: 25, industry: 22, ecology: 18 },
  industryCap: 80,
  irrigation: true,
  minimumReserve: 20,
  sparePump: false
};

export type CityRuntimeState = {
  reservoir: number;
  ecologyIndex: number;
  soilMoisture: number;
  lastResidentialSupply: number;
  lastEnergyReliability: number;
  exploredSparePump: boolean;
};

export type DaySchedule = {
  weather: CityWeather;
  inflow: number;
  pumpFailure: boolean;
};

export function createCityState(exploredSparePump = false): CityRuntimeState {
  return {
    reservoir: 70,
    ecologyIndex: 70,
    soilMoisture: 48,
    lastResidentialSupply: 100,
    lastEnergyReliability: 100,
    exploredSparePump
  };
}

export function scheduleForDay(day: number): DaySchedule {
  const weather: CityWeather = day === 3 || day === 4 ? "drought" : "normal";
  return {
    weather,
    inflow: weather === "drought" ? 3 : 14,
    pumpFailure: day === 5 || day === 6
  };
}

export function waterDemand(policy: CityPolicy): number {
  return (
    RESIDENTIAL_NEED +
    (INDUSTRY_NEED * policy.industryCap) / 100 +
    (policy.irrigation ? AGRICULTURE_NEED : 1) +
    ECOLOGY_NEED
  );
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export type DayOutcome = {
  next: CityRuntimeState;
  report: CityDayReport;
};

export function simulateCityDay(
  state: CityRuntimeState,
  policy: CityPolicy,
  day: number,
  activeRuleId: string
): DayOutcome {
  const schedule = scheduleForDay(day);
  const available = state.reservoir + schedule.inflow;
  const demand = waterDemand(policy);
  const scarce = available < demand;
  const release = scarce ? available : demand;
  const shareTotal = Math.max(
    1,
    policy.share.residential + policy.share.agriculture + policy.share.industry + policy.share.ecology
  );

  const needIndustry = (INDUSTRY_NEED * policy.industryCap) / 100;
  const allocation: CityAllocation = scarce
    ? {
        residential: (policy.share.residential / shareTotal) * release,
        agriculture: (policy.share.agriculture / shareTotal) * release,
        industry: (policy.share.industry / shareTotal) * release,
        ecology: (policy.share.ecology / shareTotal) * release
      }
    : {
        residential: RESIDENTIAL_NEED,
        agriculture: policy.irrigation ? AGRICULTURE_NEED : 1,
        industry: needIndustry,
        ecology: ECOLOGY_NEED
      };

  const residentialSupply = clamp((allocation.residential / RESIDENTIAL_NEED) * 100);
  const industryOutput = needIndustry > 0 ? clamp((allocation.industry / needIndustry) * 100) : 100;

  const evaporates = schedule.weather === "drought" ? 12 : 8;
  const irrigationAllowed = policy.irrigation && state.reservoir > policy.minimumReserve;
  const moistureGain = allocation.agriculture * (irrigationAllowed ? 2.5 : 0.5);
  const soilMoisture = clamp(state.soilMoisture + moistureGain - evaporates);
  const agricultureOutput = clamp(soilMoisture * 1.2);

  const ecologyDelta = (allocation.ecology - ECOLOGY_NEED) * 1.2;
  const ecologyIndex = clamp(state.ecologyIndex + ecologyDelta);

  const pumpPenalty = schedule.pumpFailure
    ? policy.sparePump && state.exploredSparePump
      ? 10
      : 28
    : 0;
  const energySupply = 62 + Math.min(10, release * 0.4) - pumpPenalty;
  const energyDemand = 45 + allocation.industry * 3 + (irrigationAllowed ? 3 : 0);
  const energyReliability = clamp((energySupply / Math.max(1, energyDemand)) * 100);
  const reservoir = Math.max(0, available - release);

  const events: string[] = [];
  if (schedule.weather === "drought") events.push("突发干旱：来水骤减");
  if (schedule.pumpFailure) events.push("泵站故障：一台机组停机");
  if (pumpPenalty === 28) events.push("没有备用泵，供电能力下降");
  if (scarce) events.push("水量不足，按配比削减供给");
  if (reservoir <= 0.5) events.push("水库见底");

  return {
    next: {
      ...state,
      reservoir,
      ecologyIndex,
      soilMoisture,
      lastResidentialSupply: residentialSupply,
      lastEnergyReliability: energyReliability
    },
    report: {
      day,
      weather: schedule.weather,
      inflow: schedule.inflow,
      reservoir,
      release,
      allocation,
      residentialSupply,
      energyReliability,
      ecologyIndex,
      soilMoisture,
      industryOutput,
      agricultureOutput,
      activeRuleId,
      events
    }
  };
}
