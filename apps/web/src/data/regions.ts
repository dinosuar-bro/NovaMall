import regionLevels from "province-city-china/dist/level.json" with { type: "json" };

interface RegionArea {
  code: string;
  name: string;
}

interface RegionCity {
  code: string;
  name: string;
  children?: RegionArea[];
}

interface RegionProvince {
  code: string;
  name: string;
  children?: RegionCity[];
}

export interface RegionOption {
  code: string;
  name: string;
}

const municipalities = new Set(["北京市", "天津市", "上海市", "重庆市", "香港特别行政区", "澳门特别行政区"]);
const provinces = regionLevels as RegionProvince[];

export function listProvinces(): RegionOption[] {
  return provinces.map(({ code, name }) => ({ code, name }));
}

export function listCities(provinceName: string): RegionOption[] {
  const province = findProvince(provinceName);
  if (province === undefined) {
    return [];
  }
  if (isMunicipality(province)) {
    return [{ code: province.code, name: province.name }];
  }
  return (province.children ?? []).map(({ code, name }) => ({ code, name }));
}

export function listDistricts(provinceName: string, cityName: string): RegionOption[] {
  const province = findProvince(provinceName);
  if (province === undefined) {
    return [];
  }
  if (isMunicipality(province)) {
    return (province.children ?? []).map(({ code, name }) => ({ code, name }));
  }
  const city = province.children?.find((item) => item.name === cityName);
  return (city?.children ?? []).map(({ code, name }) => ({ code, name }));
}

export function defaultRegion(): { province: string; city: string; district: string } {
  const province = findProvince("广东省") ?? provinces[0];
  const city = province === undefined ? undefined : listCities(province.name)[0];
  const district = province === undefined || city === undefined ? undefined : listDistricts(province.name, city.name)[0];
  return {
    province: province?.name ?? "",
    city: city?.name ?? "",
    district: district?.name ?? ""
  };
}

function findProvince(provinceName: string): RegionProvince | undefined {
  return provinces.find((province) => province.name === provinceName);
}

function isMunicipality(province: RegionProvince): boolean {
  return municipalities.has(province.name);
}
