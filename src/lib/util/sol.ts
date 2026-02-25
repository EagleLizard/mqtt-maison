
import * as SunriseSunset from 'sunrise-sunset-js';

import { ezdConfig } from '../../config';
import { dtUtil } from './dt-util';
import { EzdError } from '../models/error/ezd-error';

const latitude = ezdConfig.solar.latitude;
const longitude = ezdConfig.solar.longitude;
const elevation_ft = ezdConfig.solar.elevation_ft;

export const sol = {
  getSunup: getSunup,
  getSundown: getSundown,
} as const;

function getSunup(d: Date): Date {
  let sunrise = getSunrise(d);
  let sunup = new Date(sunrise.valueOf() + (1000 * 60 * 60));
  return sunup;
}

function getSunrise(d: Date): Date {
  d = new Date(d.valueOf());
  d.setHours(0,0,0,0);
  let sunrise = SunriseSunset.getSunrise(latitude, longitude, d, {
    elevation: elevation_ft,
  });
  if(sunrise === null) {
    throw new EzdError(`Sunrise returned null for ${dtUtil.tzIso(d)}`, 'sun_0.1');
  }
  return sunrise;
}

function getSundown(d: Date): Date {
  let sunset = getSunset(d);
  let sundown = new Date(sunset.valueOf() - (1000 * 60 * 30));
  return sundown;
}

function getSunset(d: Date): Date {
  d = new Date(d.valueOf());
  d.setHours(0,0,0,0);
  let sunset = SunriseSunset.getSunset(latitude, longitude, d, {
    elevation: elevation_ft,
  });
  if(sunset === null) {
    throw new EzdError(`Sunset returned null for ${dtUtil.tzIso(d)}`, 'sun_0.2');
  }
  return sunset;
}
