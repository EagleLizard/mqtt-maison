
export const dtUtil = {
  tzIso: tzIso,
} as const;

/*
  TODO: Use Temporal API when available in NodeJS
  see:
    - https://stackoverflow.com/a/17415677/4677252
      "How to ISO 8601 format a Date with Timezone Offset in JavaScript?"
_*/
function tzIso(d: Date): string {
  let year = d.getFullYear();
  let day = d.getDate();
  let month = d.getMonth() + 1;
  let hour = d.getHours();
  let minute = d.getMinutes();
  let second = d.getSeconds();
  let millisecond = d.getMilliseconds();

  let dateStr = `${year}-${pad0(month)}-${pad0(day)}`;
  let tzOffsetM = d.getTimezoneOffset() * -1;
  /*
    should always be int, but division *could* result in float
  _*/
  let tzOffsetH = Math.round(tzOffsetM / 60);
  let plusMinusChar = tzOffsetM < 0 ? '-' : '+';
  let tzStr = `${plusMinusChar}${pad0(Math.abs(tzOffsetH))}:00`;
  let timeStr = `${pad0(hour)}:${pad0(minute)}:${pad0(second)}.${pad0(millisecond, 3)}`;
  let tzIsoStr = `${dateStr} ${timeStr}${tzStr}`;
  return tzIsoStr;
}

function pad0(n: number, len = 2): string {
  return (n + '').padStart(len, '0');
}
