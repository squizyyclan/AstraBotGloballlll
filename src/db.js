const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'astrabot.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  log_channel TEXT, level_channel TEXT,
  xp_enabled INTEGER DEFAULT 1, xp_min INTEGER DEFAULT 15, xp_max INTEGER DEFAULT 25, xp_cooldown INTEGER DEFAULT 60,
  ticket_category TEXT, ticket_role TEXT,
  join_channel TEXT, join_category TEXT,
  schedule TEXT, twitch_url TEXT
);
CREATE TABLE IF NOT EXISTS levels (guild_id TEXT, user_id TEXT, xp INTEGER DEFAULT 0, last_msg INTEGER DEFAULT 0, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS level_roles (guild_id TEXT, level INTEGER, role_id TEXT, PRIMARY KEY (guild_id, level));
CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, user_id TEXT, mod_id TEXT, reason TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS temp_channels (channel_id TEXT PRIMARY KEY, guild_id TEXT, owner_id TEXT);
`);

const KEYS = ['log_channel', 'level_channel', 'xp_enabled', 'xp_min', 'xp_max', 'xp_cooldown', 'ticket_category', 'ticket_role', 'join_channel', 'join_category', 'schedule', 'twitch_url'];

function getConfig(g) {
  db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(g);
  return db.prepare('SELECT * FROM guild_config WHERE guild_id=?').get(g);
}
function setConfig(g, key, value) {
  if (!KEYS.includes(key)) throw new Error('Ungültiger Config-Key');
  getConfig(g);
  db.prepare(`UPDATE guild_config SET ${key}=? WHERE guild_id=?`).run(value, g);
}

// Level
const getUser = (g, u) => db.prepare('SELECT xp, last_msg FROM levels WHERE guild_id=? AND user_id=?').get(g, u) || { xp: 0, last_msg: 0 };
const setXp = (g, u, xp, last) => db.prepare('INSERT INTO levels (guild_id,user_id,xp,last_msg) VALUES (?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=excluded.xp, last_msg=excluded.last_msg').run(g, u, xp, last);
const rankOf = (g, xp) => db.prepare('SELECT COUNT(*)+1 AS r FROM levels WHERE guild_id=? AND xp>?').get(g, xp).r;
const top = (g, n) => db.prepare('SELECT user_id, xp FROM levels WHERE guild_id=? AND xp>0 ORDER BY xp DESC LIMIT ?').all(g, n);

// Level-Rollen
const addLevelRole = (g, level, role) => db.prepare('INSERT INTO level_roles (guild_id,level,role_id) VALUES (?,?,?) ON CONFLICT(guild_id,level) DO UPDATE SET role_id=excluded.role_id').run(g, level, role);
const removeLevelRole = (g, level) => db.prepare('DELETE FROM level_roles WHERE guild_id=? AND level=?').run(g, level).changes;
const getLevelRoles = g => db.prepare('SELECT level, role_id FROM level_roles WHERE guild_id=? ORDER BY level').all(g);

// Verwarnungen
function addWarn(g, u, mod, reason) {
  db.prepare('INSERT INTO warnings (guild_id,user_id,mod_id,reason,created_at) VALUES (?,?,?,?,?)').run(g, u, mod, reason, Date.now());
  return db.prepare('SELECT COUNT(*) AS c FROM warnings WHERE guild_id=? AND user_id=?').get(g, u).c;
}
const listWarns = (g, u) => db.prepare('SELECT * FROM warnings WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 10').all(g, u);
const countWarns = (g, u) => db.prepare('SELECT COUNT(*) AS c FROM warnings WHERE guild_id=? AND user_id=?').get(g, u).c;

// Temporäre Sprachkanäle
const addTemp = (c, g, o) => db.prepare('INSERT OR REPLACE INTO temp_channels VALUES (?,?,?)').run(c, g, o);
const getTemp = c => db.prepare('SELECT * FROM temp_channels WHERE channel_id=?').get(c);
const setTempOwner = (c, o) => db.prepare('UPDATE temp_channels SET owner_id=? WHERE channel_id=?').run(o, c);
const removeTemp = c => db.prepare('DELETE FROM temp_channels WHERE channel_id=?').run(c);
const allTemps = () => db.prepare('SELECT * FROM temp_channels').all();

const resetGuild = db.transaction(g => {
  for (const t of ['guild_config', 'levels', 'level_roles', 'warnings', 'temp_channels']) db.prepare(`DELETE FROM ${t} WHERE guild_id=?`).run(g);
});

module.exports = { getConfig, setConfig, getUser, setXp, rankOf, top, addLevelRole, removeLevelRole, getLevelRoles, addWarn, listWarns, countWarns, addTemp, getTemp, setTempOwner, removeTemp, allTemps, resetGuild };
