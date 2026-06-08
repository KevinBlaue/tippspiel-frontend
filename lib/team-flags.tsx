import type { Team } from "@/lib/api";

const teamCodeToFlagCode: Record<string, string> = {
  ALG: "DZ",
  ARG: "AR",
  AUS: "AU",
  AUT: "AT",
  BEL: "BE",
  BIH: "BA",
  BRA: "BR",
  CAN: "CA",
  CIV: "CI",
  COD: "CD",
  COL: "CO",
  CPV: "CV",
  CRO: "HR",
  CUW: "CW",
  CZE: "CZ",
  ECU: "EC",
  EGY: "EG",
  ENG: "GB_ENG",
  ESP: "ES",
  FRA: "FR",
  GER: "DE",
  GHA: "GH",
  HAI: "HT",
  IRN: "IR",
  IRQ: "IQ",
  JOR: "JO",
  JPN: "JP",
  KOR: "KR",
  KSA: "SA",
  MAR: "MA",
  MEX: "MX",
  NED: "NL",
  NOR: "NO",
  NZL: "NZ",
  PAN: "PA",
  PAR: "PY",
  POR: "PT",
  QAT: "QA",
  RSA: "ZA",
  SCO: "GB_SCT",
  SEN: "SN",
  SUI: "CH",
  SWE: "SE",
  TUN: "TN",
  TUR: "TR",
  URY: "UY",
  USA: "US",
  UZB: "UZ",
};

export function getTeamFlagClassName(team: Team): string | null {
  const rawCode = team.code?.trim().toUpperCase();

  if (!rawCode) {
    return null;
  }

  const flagCode = teamCodeToFlagCode[rawCode] ?? rawCode;

  return `flag:${flagCode.replaceAll("_", "-")}`;
}
