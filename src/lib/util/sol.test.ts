
import { beforeEach, describe, expect, test } from 'vitest';

import { sol } from './sol';
import { dtUtil } from './dt-util';

const days_in_year = 365;
const years_to_test = 100;

const base_datetime_str = '2026-02-25T00:00:00';

const years_test_timeout_ms = 15_000;

/*
  Tests assume local timezone
_*/
describe('sol', () => {
  let d: Date;

  beforeEach(() => {
    d = new Date(base_datetime_str);
  });

  test('.getSunup() returns same day for 12 AM', () => {
    let sunup = sol.getSunup(d);
    expect(sunup.getDate()).toBe(d.getDate());
  });
  test('.getSunup() returns same day for 11:59:59 PM', () => {
    d.setHours(23, 59, 59);
    let sunup = sol.getSunup(d);
    expect(sunup.getDate()).toBe(d.getDate());
  });
  test(`.getSunup() returns same day for the next ${years_to_test} years`, () => {
    let nDays = days_in_year * years_to_test;
    for(let i = 0; i < nDays; i++) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      let sunup = sol.getSunup(d);
      expect(sunup.getDate(), `date: ${dtUtil.tzIso(d)},sunrise: ${dtUtil.tzIso(sunup)}`).toBe(d.getDate());
    }
  }, years_test_timeout_ms);
  test('.getSundown() returns same day for 12 AM', () => {
    let sundown = sol.getSundown(d);
    expect(sundown.getDate()).toBe(d.getDate());
  });
  test('.getSundown() returns same day for 11:59:59 PM', () => {
    d.setHours(23, 59, 59);
    let sundown = sol.getSundown(d);
    expect(sundown.getDate()).toBe(d.getDate());
  });
  test(`.getSundown() returns same day for the next ${years_to_test} years`, () => {
    let nDays = days_in_year * years_to_test;
    for(let i = 0; i < nDays; i++) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      let sundown = sol.getSundown(d);
      if(i === nDays - 1) {
        console.log(dtUtil.tzIso(sundown));
      }
      expect(sundown.getDate(), `date: ${dtUtil.tzIso(d)}, sundown: ${dtUtil.tzIso(sundown)}`).toBe(d.getDate());
    }
  }, years_test_timeout_ms);
});
