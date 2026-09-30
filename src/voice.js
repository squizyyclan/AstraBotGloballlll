const { ChannelType: T } = require('discord.js');
const db = require('./db');
const { voicePanel } = require('./utils');
 
async function handleVoice(oldS, newS) {
  const guild = newS.guild;
  const cfg = db.getConfig(guild.id);
 
  // Join-to-create
  if (cfg.join_channel && newS.channelId === cfg.join_channel && oldS.channelId !== newS.channelId) {
    const member = newS.member;
    try {
      const ch = await guild.channels.create({
        name: `🔊・${member.displayName}`.slice(0, 100),
        type: T.GuildVoice,
        parent: cfg.join_category || newS.channel.parentId || undefined,
        bitrate: newS.channel.bitrate,
        reason: 'AstraBot Join-to-create',
      });
      db.addTemp(ch.id, guild.id, member.id);
      const moved = await member.voice.setChannel(ch).then(() => true).catch(() => false);
      if (!moved) { db.removeTemp(ch.id); await ch.delete().catch(() => {}); }
      else await ch.send(voicePanel()).catch(() => {}); // Panel im Voice-Chat des Raums
    } catch (e) { console.error('joincreate:', e.message); }
  }
 
  // Aufräumen / Besitzerwechsel
  if (oldS.channelId && oldS.channelId !== newS.channelId) {
    const row = db.getTemp(oldS.channelId);
    if (!row) return;
    const ch = oldS.channel;
    if (!ch) return db.removeTemp(oldS.channelId);
    if (ch.members.size === 0) { db.removeTemp(ch.id); await ch.delete('Raum leer').catch(() => {}); }
    else if (row.owner_id === oldS.id) db.setTempOwner(ch.id, ch.members.first().id);
  }
}
 
async function cleanupTemps(client) {
  for (const t of db.allTemps()) {
    const ch = client.channels.cache.get(t.channel_id);
    if (!ch) db.removeTemp(t.channel_id);
    else if (ch.members?.size === 0) { db.removeTemp(ch.id); await ch.delete('Raum leer').catch(() => {}); }
  }
}
 
module.exports = { handleVoice, cleanupTemps };
