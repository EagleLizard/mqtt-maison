
import path from 'node:path';
import fs from 'node:fs';
import { files } from '../../lib/util/files';
import { CONFIG_DIR_PATH, MAISON_DEVICES_DEF_FILE_NAME } from '../../constants';
import { maisonConfig } from '../../lib/config/maison-config';
import { SqliteClient } from '../../lib/db/sqlite-client';
import { MaisonDeviceSchema } from '../../lib/models/maison-device';
import { MaisonDeviceDto, MaisonDeviceDtoSchema } from '../../lib/models/maison-device-dto';

const MAISON_DEVICES_DEF_FILE_PATH = [
  CONFIG_DIR_PATH,
  MAISON_DEVICES_DEF_FILE_NAME,
].join(path.sep);

export async function mqttDbMain() {
  console.log('mqtt-db main ~');
  let dbClient = await SqliteClient.init();
  let db = dbClient._db;
  // let stmt = db.prepare('select * from ezd_state es');
  // let rows = stmt.all();
  let defFileExists = files.checkFile(MAISON_DEVICES_DEF_FILE_PATH);
  if(!defFileExists) {
    // throw new Error(`Device def file not found: ${MAISON_DEVICES_DEF_FILE_PATH}`);
    writeDeviceDefFile();
  }
  let deviceDefJsonStr = fs.readFileSync(MAISON_DEVICES_DEF_FILE_PATH).toString();
  let rawDevices = JSON.parse(deviceDefJsonStr);
  // if(!prim.isString(rawDevices)) {
  if(!Array.isArray(rawDevices)) {
    throw new Error('Invalid devices: expected devices to be an array.');
  }
  let deviceDefs = rawDevices.map(MaisonDeviceSchema.parse);
  let getDeviceStmt = db.prepare('select * from ezd_device ed where ed.name = @name');
  for(let i = 0; i < deviceDefs.length; i++) {
    let deviceDef = deviceDefs[i];
    let rawDeviceDto = getDeviceStmt.get({
      name: deviceDef.name,
    });
    /* if not exist insert */
    if(rawDeviceDto === undefined) {
      console.log(`inserting device: ${deviceDef.name}`);
      let insertDeviceStmt = db.prepare('insert into ezd_device (name) values (@name)');
      let insertDeviceRes = insertDeviceStmt.run({
        name: deviceDef.name,
      });
      console.log(insertDeviceRes);
    } else {
      console.log(`${deviceDef.name}`);
    }
  }
  let getDevicesStmt = db.prepare('select * from ezd_device');
  let rawDeviceDtos = getDevicesStmt.all();
  let deviceDtos: MaisonDeviceDto[] = [];
  for(let i = 0; i < rawDeviceDtos.length; i++) {
    let rawDeviceDto = rawDeviceDtos[i];
    let deviceDto = MaisonDeviceDtoSchema.parse(rawDeviceDto);
    deviceDtos.push(deviceDto);
  }
  console.log(deviceDtos);
}

/*
This is a temporary solution and will probably not be maintained
_*/
function writeDeviceDefFile() {
  let devicesJsonStr = JSON.stringify(maisonConfig.maison_devices, null, 2);
  fs.writeFileSync(MAISON_DEVICES_DEF_FILE_PATH, devicesJsonStr);
}
