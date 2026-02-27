const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. ইউজার রেজিস্ট্রেশন ও ভিডিও ডেলিভারি লজিক
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload; // এখানে সরাসরি Message ID আসবে (যেমন: 101)

  try {
    // --- Firebase এ ইউজার ডাটা সেভ (Duplicate Check) ---
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

    // --- ২. Channel Join Check ---
    const member = await ctx.telegram.getChatMember(process.env.CHANNEL_ID, userId);
    const isJoined = ['creator', 'administrator', 'member'].includes(member.status);

    if (!isJoined) {
      return ctx.reply(
        "❌ আপনি আমাদের চ্যানেলে জয়েন নেই!\n\nভিডিওটি পেতে নিচের বাটনে ক্লিক করে জয়েন করুন এবং আবার লিংকে ক্লিক করুন।",
        Markup.inlineKeyboard([
          [Markup.button.url("📢 Join Channel", `https://t.me/your_channel_username`)] // আপনার চ্যানেলের লিংক দিন
        ])
      );
    }

    // --- ৩. সরাসরি Message ID দিয়ে ভিডিও পাঠানো ---
    if (startParam && !isNaN(startParam)) {
      // startParam-এ থাকা সংখ্যাটিকে message_id হিসেবে ব্যবহার করে ভিডিও কপি করা
      await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, parseInt(startParam));
    } else {
      ctx.reply("স্বাগতম! ভিডিও পেতে সঠিক লিংকে ক্লিক করুন।");
    }

  } catch (error) {
    console.error("Error:", error);
    ctx.reply("কিছু একটা সমস্যা হয়েছে। সম্ভবত ভিডিওটি খুঁজে পাওয়া যায়নি বা বটটি চ্যানেলে অ্যাডমিন নয়।");
  }
});

// ৪. Admin Broadcast System
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
      continue; // ইউজার বট ব্লক করলে স্কিপ করবে
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
    console.error(err);
    res.status(500).send('Error');
  }
};
