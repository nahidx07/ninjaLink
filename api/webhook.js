const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

// কমান্ড ও হ্যান্ডলার ইমপোর্ট
bot.use(require('../lib/middleware')); // ইউজার সেভ করার মিডলওয়্যার
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], require('../handlers/media'));
bot.on('text', require('../handlers/text'));

bot.start(require('../commands/start'));
bot.command('mydata', require('../commands/mydata'));
bot.command('data', require('../commands/data'));
bot.command('user', require('../commands/user'));
bot.command('broadcast', require('../commands/broadcast'));

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
