
import SunCalc from 'suncalc';

const sc_latitude = 40.304069;
const sc_longitude = -111.753698;
const sc_elevation_ft = 4521;

export const solar = {
  getTimes: getTimes,
  getSunup: getSunup,
  getSundown: getSundown,
  getSunrise: getSunrise,
  getSunset: getSunset,
} as const;

function getTimes(d: Date) {
  return SunCalc.getTimes(d, sc_latitude, sc_longitude, sc_elevation_ft);
}
function getSunup(d: Date) {
  let sc = SunCalc.getTimes(d, sc_latitude, sc_longitude, sc_elevation_ft);
  let sunup = new Date(sc.sunrise.valueOf() + (1000 * 60 * 60));
  return sunup;
}
function getSundown(d: Date) {
  let sc = SunCalc.getTimes(d, sc_latitude, sc_longitude, sc_elevation_ft);
  let sundown = new Date(sc.sunset.valueOf() - (1000 * 60 * 30));
  return sundown;
}

function getSunrise(d: Date) {
  d = new Date(d.valueOf());
  let sc = SunCalc.getTimes(d, sc_latitude, sc_longitude, sc_elevation_ft);
  return sc.sunrise;
}
function getSunset(d: Date) {
  d = new Date(d.valueOf());
  let sc = SunCalc.getTimes(d, sc_latitude, sc_longitude, sc_elevation_ft);
  return sc.sunset;
}
