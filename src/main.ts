
import 'source-map-support/register';

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
}

function setProcName() {
  process.title = 'mqtt-maison';
}
