const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. Video ID Mapping (উদাহরণ)
const VIDEO_MAP = {
  'movie101': 123, // এখানে 123 হলো আপনার চ্যানেলের message_id
  'series01': 125,
};

// ২. User Registration & Deep Link Handler
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload; // Deep link parameter (?start=...)

  // Firebase এ ইউজার ডাটা সেভ (Duplicate Check)
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();
  
  if (!doc.exists) {
    await userRef.set({
      user_id: userId,
      username: ctx.from.username || 'N/A',
      first_name: ctx.from.first_name,
      start_date: new Date().toISOString()
    });
  }

  // Channel Join Check
  try {
    const member = await ctx.telegram.getChatMember(process.env.CHANNEL_ID, userId);
    if (member.status === 'left' || member.status === 'kicked') {
      return ctx.reply("ভিডিওটি পেতে আমাদের চ্যানেলে জয়েন করুন।", Markup.inlineKeyboard([
        [Markup.button.url("Join Channel", `https://t.me/your_channel_username`)]
      ]));
    }
  } catch (e) { console.log("Join Check Error"); }

  // Deep Link Logic
  if (startParam && VIDEO_MAP[startParam]) {
    const messageId = VIDEO_MAP[startParam];
    await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, messageId);
  } else {
    ctx.reply("স্বাগতম! আপনি কোনো ভ্যালিড লিংক ব্যবহার করেননি।");
  }
});

// ৩. Broadcast System (Admin Only)
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Not Authorized!");
  
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("মেসেজ লিখুন। উদাহরণ: /broadcast Hello");

  const usersSnapshot = await db.collection('users').get();
  let count = 0;

  for (const doc of usersSnapshot.docs) {
    try {
      await ctx.telegram.sendMessage(doc.id, msg);
      count++;
    } catch (e) { continue; }
  }
  ctx.reply(`ব্রডকাস্ট সম্পন্ন! সফল: ${count} জন।`);
});

// Webhook Export for Vercel
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send('Error');
  }
};
