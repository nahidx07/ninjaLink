const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম লেটার জেনারেটর (১০ অক্ষরের)
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// ২. মিডিয়া হ্যান্ডলার (ভিডিও, ফাইল, ফটো ইত্যাদি)
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে... লিঙ্ক তৈরি করা হচ্ছে।");
  try {
    const user = ctx.from;
    const firstName = user.first_name.replace(/[<>]/g, '');
    const username = user.username ? `@${user.username}` : "নেই";

    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id,
      { caption: "" } 
    );

    const slug = `file${generateRandomSlug(10)}`; 
    const botUsername = ctx.botInfo ? ctx.botInfo.username : "YourBotUsername"; 
    const shareLink = `https://t.me/${botUsername}?start=${slug}`;

    const infoText = `<b>📥 নতুন ফাইল আপলোড হয়েছে!</b>\n\n` +
                     `👤 <b>নাম:</b> ${firstName}\n` +
                     `🆔 <b>ইউজারনেম:</b> ${username}\n` +
                     `🆔 <b>ইউজার আইডি:</b> <code>${user.id}</code>\n\n` +
                     `🚀 <b>ফাইল লিঙ্ক:</b> ${shareLink}`;

    await ctx.telegram.sendMessage(process.env.CHANNEL_ID, infoText, { parse_mode: 'HTML' });

    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: sentMsg.message_id,
      uploader_id: user.id,
      created_at: new Date().toISOString()
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ লিঙ্ক তৈরি সম্পন্ন!\n\n🔗 লিঙ্ক: ${shareLink}`,
      Markup.inlineKeyboard([[Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]])
    );
  } catch (error) {
    ctx.reply("❌ এরর: বট চ্যানেলে এডমিন কি না চেক করুন।");
  }
});

// ৩. /start কমান্ড
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        user_id: userId,
        first_name: ctx.from.first_name,
        start_date: new Date().toISOString()
      });
    }

    if (startParam) {
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id);
      } else {
        ctx.reply("❌ ফাইল পাওয়া যায়নি।");
      }
    } else {
      ctx.reply(`স্বাগতম! আপনার আইডি: <code>${userId}</code>`, { parse_mode: 'HTML' });
    }
  } catch (e) { ctx.reply("ত্রুটি ঘটেছে।"); }
});

// ৪. উন্নত ব্রডকাস্ট সিস্টেম (সফল ও ব্যর্থ ইউজারের হিসাবসহ)
bot.command('broadcast', async (ctx) => {
  const adminId = process.env.ADMIN_ID;
  if (ctx.from.id.toString() !== adminId) return ctx.reply("❌ আপনি এডমিন নন।");

  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ মেসেজ লিখুন। উদাহরণ: /broadcast আসসালামু আলাইকুম");

  try {
    const usersSnapshot = await db.collection('users').get();
    if (usersSnapshot.empty) return ctx.reply("❌ ডাটাবেসে কোনো ইউজার নেই।");

    const userIds = usersSnapshot.docs.map(doc => doc.id);
    await ctx.reply(`📢 ${userIds.length} জন ইউজারকে মেসেজ পাঠানো শুরু হয়েছে...`);

    // সব মেসেজ একসাথে পাঠানোর জন্য প্রমিজ তৈরি
    const promises = userIds.map(id => ctx.telegram.sendMessage(id, msg));

    // সব রেজাল্ট একসাথে চেক করা
    const results = await Promise.allSettled(promises);

    let successCount = 0;
    let failCount = 0;

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        failCount++;
      }
    });

    ctx.reply(
      `✅ **ব্রডকাস্ট সম্পন্ন হয়েছে!**\n\n` +
      `🚀 **সফলভাবে পাঠানো হয়েছে:** ${successCount} জন\n` +
      `❌ **ব্যর্থ হয়েছে:** ${failCount} জন\n\n` +
      `💡 (যারা বট ব্লক করেছে তাদের কাছে মেসেজ যায়নি।)`
    , { parse_mode: 'Markdown' });

  } catch (error) {
    console.error("Broadcast Error:", error);
    ctx.reply("❌ ডাটাবেস থেকে ইউজার লিস্ট নিতে সমস্যা হয়েছে।");
  }
});

// ৫. Webhook Handler (Vercel Fix)
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    // এরর হলেও OK পাঠানো ভালো যাতে টেলিগ্রাম বারবার রিট্রাই না করে একই মেসেজ বারবার না পাঠায়
    res.status(200).send('OK');
  }
};
