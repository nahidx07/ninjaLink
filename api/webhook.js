const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. ইউজার রেজিস্ট্রেশন ও ভিডিও ডেলিভারি লজিক
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload; // সরাসরি Message ID (যেমন: 5)

  try {
    // --- Firebase এ ইউজার ডাটা সেভ ---
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

    // --- সরাসরি ভিডিও পাঠানোর লজিক (No Join Required) ---
    if (startParam && !isNaN(startParam)) {
      const messageId = parseInt(startParam);
      
      // চ্যানেলের ভিডিওটি ইউজারের কাছে কপি করা
      await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, messageId);
    } else {
      ctx.reply("স্বাগতম! ভিডিও পেতে সঠিক লিঙ্কে ক্লিক করুন।");
    }

  } catch (error) {
    console.error("Detailed Error:", error);
    ctx.reply("দুঃখিত, ভিডিওটি পাঠানো সম্ভব হচ্ছে না। নিশ্চিত করুন বটটি চ্যানেলে অ্যাডমিন এবং ভিডিও আইডি সঠিক।");
  }
});

// ২. Admin Broadcast System
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Not Authorized!");
  
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("মেসেজ লিখুন। উদাহরণ: /broadcast Hello");

  const usersSnapshot = await db.collection('users').get();
  let count = 0;

  ctx.reply(`ব্রডকাস্ট শুরু হয়েছে...`);

  for (const doc of usersSnapshot.docs) {
    try {
      await ctx.telegram.sendMessage(doc.id, msg);
      count++;
    } catch (e) {
      continue; 
    }
  }
  ctx.reply(`✅ ব্রডকাস্ট সফল! মোট পাঠানো হয়েছে: ${count} জনকে।`);
});

// Vercel Webhook Export
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send('Error');
  }
};
