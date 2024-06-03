CREATE TABLE IF NOT EXISTS config (
  key INTEGER PRIMARY KEY,
  name TEXT,
  value TEXT NOT NULL
);

INSERT INTO config (name, value)
VALUES
  ('http_ip', '127.0.0.1'),
  ('http_port', '3000'),
  ('domain', 'localhost'),
  ('public_url', 'http://localhost:3000');

CREATE TABLE IF NOT EXISTS template (
  id INTEGER PRIMARY KEY,
  mime_type TEXT NOT NULL,
  content TEXT NOT NULL,
  static_params TEXT
);

INSERT INTO template (mime_type, content, static_params)
VALUES
  (
    'text/html',
    '<!DOCTYPE html><html><head><link rel="stylesheet" type="text/css" href="/test/styles.css" /></head><body><h1 class="red-font">Hello ${this.name}! Static var is: ${this.static}</h1>${this._init_script}</body></html>',
    '{"name": {"compute": "(req) => new URLSearchParams(new URL(req.url).search).get(''ok'')", "value": 21}, "static": {"value": "meow :3"}}'
  );

CREATE TABLE IF NOT EXISTS route (
  base_path TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by INTEGER NOT NULL,
  template INTEGER NOT NULL,
  is_public INTEGER NOT NULL,
  last_backup TEXT,
  config TEXT
);

INSERT INTO route (base_path, version, updated_at, updated_by, template, is_public, last_backup, config)
VALUES ('test', 0, 1717171717, 1, 1, 0, NULL, '{"externalRegistry": {"type": "pkg", "value": [{"name": "lit", "location": "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js", "loadRule": "*"}]}}');

CREATE TABLE IF NOT EXISTS account (
  id INTEGER PRIMARY KEY,
  user_group TEXT NOT NULL,
  username TEXT NOT NULL,
  pw_hash TEXT NOT NULL
);

INSERT INTO account (user_group, username, pw_hash)
VALUES ('admin', 'admin', '1234');

CREATE TABLE IF NOT EXISTS permission (
  id INTEGER PRIMARY KEY,
  route TEXT NOT NULL,
  user_group TEXT NOT NULL,
  user_name TEXT
);

INSERT INTO permission (route, user_group, user_name)
VALUES ('test', 'admin', NULL);
