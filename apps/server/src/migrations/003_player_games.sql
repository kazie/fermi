-- One row per player per finished game, keyed by the player's private key hash (as in player_seen): what FerMEANie
-- remembers about returning players in the intro's roll call.
CREATE TABLE player_games (
  player_id     TEXT NOT NULL,
  game_id       TEXT NOT NULL,
  finished_at   TEXT NOT NULL,
  score         INTEGER NOT NULL,
  dunces        INTEGER NOT NULL,
  -- she beat every human in this game
  fermeanie_won INTEGER NOT NULL,
  PRIMARY KEY (player_id, game_id)
);
