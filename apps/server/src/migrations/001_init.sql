CREATE TABLE questions (
  id          TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disputed', 'retired')),
  category    TEXT NOT NULL,
  answer      REAL NOT NULL,
  unit        TEXT NOT NULL,
  norm_text   TEXT NOT NULL,
  batch_id    TEXT,
  flags       TEXT NOT NULL DEFAULT '[]',
  replaced_by TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX questions_status ON questions (status);

CREATE TABLE question_sources (
  question_id TEXT NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  url_norm    TEXT NOT NULL,
  quote_norm  TEXT NOT NULL
);
CREATE INDEX question_sources_url ON question_sources (url_norm);

CREATE TABLE question_rejections (
  id            INTEGER PRIMARY KEY,
  question_text TEXT NOT NULL,
  norm_text     TEXT NOT NULL,
  reason        TEXT NOT NULL,
  at            TEXT NOT NULL
);

CREATE TABLE disputes (
  id          INTEGER PRIMARY KEY,
  question_id TEXT NOT NULL,
  player_id   TEXT,
  message     TEXT NOT NULL,
  at          TEXT NOT NULL,
  resolved_at TEXT,
  resolution  TEXT
);
CREATE INDEX disputes_open ON disputes (resolved_at);

CREATE TABLE player_seen (
  player_id   TEXT NOT NULL,
  question_id TEXT NOT NULL,
  seen_at     TEXT NOT NULL,
  PRIMARY KEY (player_id, question_id)
);

CREATE TABLE player_lines (
  player_id TEXT NOT NULL,
  line_key  TEXT NOT NULL,
  seen_at   TEXT NOT NULL,
  PRIMARY KEY (player_id, line_key)
);

CREATE TABLE played_questions (
  question_id     TEXT PRIMARY KEY,
  first_played_at TEXT NOT NULL
);

CREATE TABLE games (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  finished_at TEXT,
  settings    TEXT NOT NULL,
  rounds      TEXT NOT NULL DEFAULT '[]',
  final       TEXT
);

CREATE TABLE fermeanie (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  wins         INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0
);
INSERT INTO fermeanie (id) VALUES (1);
