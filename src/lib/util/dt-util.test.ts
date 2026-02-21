
import { describe, test, expect, beforeEach } from 'vitest';

import { dtUtil } from './dt-util';

const base_datetime_string = '2026-02-21T15:01:18.507Z';

describe('dt-util', () => {
  let d: Date;
  beforeEach(() => {
    d = new Date(base_datetime_string);
  });
  test('.tzIso()', () => {
    let tzStr = dtUtil.tzIso(d);
    let tzd = new Date(tzStr);
    expect(tzd.valueOf()).toBe(d.valueOf());
  });
  test('.tzIso() with incremental date changes', () => {
    for(let i = 0; i < 100; i++) {
      let testDate = new Date(d.valueOf() + (1000 * 60 * 33.333 * i));
      let tzStr = dtUtil.tzIso(testDate);
      let tzd = new Date(tzStr);
      expect(tzd.valueOf()).toBe(testDate.valueOf());
    }
  });
});
