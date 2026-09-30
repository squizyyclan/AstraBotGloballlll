require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, Events, ActivityType } = require('discord.js');
const { handleComponent } = require('./components');
const { handleMessageXp } = require('./xp');
const { handleVoice, cleanupTemps } = require('./voice');
const { EPH } = require('./utils');
const { startLive } = require('./live');
 
if (!process.env.DISCORD_TOKEN) { console.error('DISCORD_TOKEN fehlt!'); process.exit(1); }
 
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates] });
 
const commands = new Collection();
for (const file of ['moderation', 'community', 'channels', 'level', 'system'])
  for (const c of require(`./commands/${file}`)) commands.set(c.data.name, c);
 
client.once(Events.ClientReady, async c => {
  console.log(`✅ ${c.user.tag} online – ${c.guilds.cache.size} Server, ${commands.size} Befehle`);
  c.user.setActivity('Twitch 💜 /help', { type: ActivityType.Watching });
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    const body = commands.map(cmd => cmd.data.toJSON());
    const route = process.env.DEV_GUILD_ID ? Routes.applicationGuildCommands(c.user.id, process.env.DEV_GUILD_ID) : Routes.applicationCommands(c.user.id);
    await rest.put(route, { body });
    console.log(`📡 ${body.length} Befehle registriert (${process.env.DEV_GUILD_ID ? 'Dev-Server' : 'global'})`);
  } catch (e) { console.error('Befehlsregistrierung fehlgeschlagen:', e); }
  await cleanupTemps(c);
  startLive(c);
});
 
client.on(Events.InteractionCreate, async i => {
  try {
    if (i.isChatInputCommand()) {
      const cmd = commands.get(i.commandName);
      if (cmd) await cmd.execute(i);
    } else if (i.isButton() || i.isModalSubmit()) {
      await handleComponent(i);
    }
  } catch (e) {
    console.error(`Fehler bei ${i.commandName ?? i.customId}:`, e);
    const msg = { content: '❌ Da ist etwas schiefgelaufen. Prüfe meine Berechtigungen und Rollenposition.', ...EPH };
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {});
    else i.reply(msg).catch(() => {});
  }
});
 
client.on(Events.MessageCreate, m => handleMessageXp(m).catch(e => console.error('xp:', e.message)));
client.on(Events.VoiceStateUpdate, (o, n) => handleVoice(o, n).catch(e => console.error('voice:', e.message)));
 
process.on('unhandledRejection', e => console.error('unhandledRejection:', e));
client.login(process.env.DISCORD_TOKEN);
