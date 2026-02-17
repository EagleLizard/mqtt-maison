
import path from 'node:path';
import BSqlite3, { RunResult, Transaction } from 'better-sqlite3';
import { DATA_DIR_PATH, EZD_DB_FILE_NAME } from '../../constants';

const ezd_db_file_path = [
  DATA_DIR_PATH,
  EZD_DB_FILE_NAME,
].join(path.sep);

type SqliteClientInitOpts = {
  filename: string;
  fileMustExist?: boolean;
} & {};

const default_sqlite_client_init_opts: Required<SqliteClientInitOpts> = {
  filename: ezd_db_file_path,
  fileMustExist: true,
};

export class SqliteClient {
  _db: BSqlite3.Database;
  private constructor(
    db: BSqlite3.Database
  ) {
    this._db = db;
  }

  transaction<Fn extends (...params: unknown[]) => void>(fn: Fn): Transaction<Fn> {
    let txnFn = this._db.transaction(fn);
    return txnFn;
  }
  all<T extends unknown[], R = unknown>(source: string, ...params: T): R[] | undefined {
    let stmt = this._db.prepare<T, R>(source);
    return stmt.all(...params);
  }
  get<T extends unknown[], R = unknown>(source: string, ...params: T): R | undefined {
    let stmt = this._db.prepare<T, R>(source);
    return stmt.get(...params);
  }
  run<T extends unknown[]>(source: string, ...params: T): RunResult {
    let stmt = this._db.prepare<T>(source);
    return stmt.run(...params);
  }
  exec(source: string): void {
    this._db.exec(source);
  }

  static init(opts?: SqliteClientInitOpts): SqliteClient {
    let _opts: Required<SqliteClientInitOpts> = Object.assign(
      {},
      default_sqlite_client_init_opts,
      opts,
    );
    let db = new BSqlite3(_opts.filename, {
      fileMustExist: _opts.fileMustExist,
    });
    return new SqliteClient(db);
  }
}
