const { ChannelType: T } = require('discord.js');
const db = require('./db');
const { voicePanel, embed, sendLog } = require('./utils');
 
async function handleVoice(oldS, newS) {
  const guild = newS.guild;
  const cfg = db.getConfig(guild.id);
 
  // Join-to-create
  if (cfg.join_channel && newS.channelId === cfg.join_channel && oldS.channelId !== newS.channelId) {
    const member = newS.member;
    try {
      // Kategorie nur verwenden, wenn sie noch existiert – sonst die des Join-Kanals
      const parent = (cfg.join_category && guild.channels.cache.has(cfg.join_category) ? cfg.join_category : null) || newS.channel.parentId || undefined;
      const ch = await guild.channels.create({
        name: `🔊・${member.displayName}`.slice(0, 100),
        type: T.GuildVoice,
        parent,
        bitrate: Math.min(newS.channel.bitrate, guild.maximumBitrate),
        reason: 'AstraBot Join-to-create',
      });
      db.addTemp(ch.id, guild.id, member.id);
 
      let moveErr = null;
      const moved = await member.voice.setChannel(ch).then(() => true).catch(e => { moveErr = e.message; return false; });
      if (!moved) {
        db.removeTemp(ch.id);
        await ch.delete().catch(() => {});
        console.error('joincreate (verschieben):', moveErr);
        sendLog(guild, embed('⚠️ Join-to-create', `Raum für ${member} konnte nicht genutzt werden: **${moveErr}**\nDer Bot braucht die Berechtigung „Mitglieder verschieben“ (oder Administrator).`));
      } else {
        await ch.send(voicePanel()).catch(() => {}); // Panel im Voice-Chat des Raums
      }
    } catch (e) {
      console.error('joincreate:', e.message);
      sendLog(guild, embed('⚠️ Join-to-create', `Raum konnte nicht erstellt werden: **${e.message}**\nDer Bot braucht „Kanäle verwalten“ und „Mitglieder verschieben“ (oder Administrator).`));
    }
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
