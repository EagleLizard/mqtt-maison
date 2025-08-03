
import path from 'node:path';
import BSqlite3 from 'better-sqlite3';
import { DATA_DIR_PATH, EZD_DB_FILE_NAME } from '../../constants';

const db_file_path = [
  DATA_DIR_PATH,
  EZD_DB_FILE_NAME,
].join(path.sep);

export class SqliteClient {
  _db: BSqlite3.Database;
  private constructor(
    db: BSqlite3.Database
  ) {
    this._db = db;
  }

  // prepare(source: string) {
  //   let stmt: BSqlite3.Statement;
  //   stmt = this._db.prepare(source);
  // }

  static async init(): Promise<SqliteClient> {
    let db: BSqlite3.Database;
    db = new BSqlite3(db_file_path, {
      fileMustExist: true,
    });
    return new SqliteClient(db);
  }
}
