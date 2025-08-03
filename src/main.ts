
/* this should remain the first import */
import 'source-map-support/register';
import assert from 'node:assert';

const cmd_map = {
  mqtt: 'mqtt',
  etc: 'etc',
  db: 'db', // init db
} as const;
assert(Object.entries(cmd_map).every(([ key, val ]) => {
  return key === val;
}));

type EzdCommand = keyof typeof cmd_map;
type EzdArgs = {
  cmd: EzdCommand;
} & {};

(async () => {
  try {
    await main();
  } catch(e) {
    console.error(e);
    throw e;
  }
})();

async function main() {
  setProcName();
  let eArgs = parseArgs();
  switch(eArgs?.cmd) {
    case cmd_map.mqtt:
      await (await import('./cmd/mqtt-ezd/mqtt-ezd')).mqttEzdMain();
      break;
    case cmd_map.etc:
      await (await import('./cmd/etc/etc-ezd')).etcEzdMain();
      break;
    case cmd_map.db:
      await (await import('./cmd/mqtt-db/mqtt-db')).mqttDbMain();
      break;
    default:
      printCmds();
  }
}

function printCmds() {
  let outLines: string[] = [];
  let cmdStrs: string[] = [ ...Object.keys(cmd_map) ];
  outLines.push('commands:');
  outLines.push(`  ${cmdStrs.join(', ')}`);
  process.stdout.write(`${outLines.join('\n')}\n`);
}

/*
  keep it simple for now, parse the command str
_*/
function parseArgs(): EzdArgs | undefined {
  let args: string[];
  let firstArg: string;
  let eArgs: EzdArgs;
  args = process.argv.slice(2);
  if(args.length < 1) {
    return;
  }
  firstArg = args[0];
  if(!checkEzdCommand(firstArg)) {
    return;
  }
  eArgs = {
    cmd: firstArg,
  };
  return eArgs;
}
function checkEzdCommand(cmdStr: string): cmdStr is EzdCommand {
  return ([ ...Object.values(cmd_map) ] as readonly string[]).includes(cmdStr);
}

function setProcName() {
  process.title = 'mqtt-maison';
}
