const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম লেটার জেনারেটর (১০ অক্ষর)
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// ২. মিডিয়া হ্যান্ডলার (ভিডিও, ফটো, ফাইল, APK)
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে... দয়া করে অপেক্ষা করুন।");

  try {
    const user = ctx.from;
    const firstName = user.first_name.replace(/[<>]/g, ''); // HTML এরর এড়াতে
    const username = user.username ? `@${user.username}` : "নেই";

    // ক) ফাইলটি চ্যানেলে কপি করা (ক্যাপশন ছাড়া)
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id,
      { caption: "" }
    );

    const messageId = sentMsg.message_id;

    // খ) লিঙ্ক তৈরি করা
    const slug = `file${generateRandomSlug(10)}`; 
    // যদি ctx.botInfo কাজ না করে তবে সরাসরি বটের ইউজারনেম লিখে দিন
    const botUsername = ctx.botInfo ? ctx.botInfo.username : "YourBotUsername"; 
    const shareLink = `https://t.me/${botUsername}?start=${slug}`;

    // গ) চ্যানেলে ইনফো মেসেজ পাঠানো (HTML ফরম্যাটে যা বেশি নিরাপদ)
    const infoText = `<b>📥 নতুন ফাইল আপলোড হয়েছে!</b>\n\n` +
                     `👤 <b>নাম:</b> ${firstName}\n` +
                     `🆔 <b>ইউজারনেম:</b> ${username}\n` +
                     `🆔 <b>ইউজার আইডি:</b> <code>${user.id}</code>\n\n` +
                     `🚀 <b>ফাইল লিঙ্ক:</b> ${shareLink}`;

    await ctx.telegram.sendMessage(process.env.CHANNEL_ID, infoText, { parse_mode: 'HTML' });

    // ঘ) Firebase-এ ডাটা সেভ করা
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: messageId,
      uploader_id: user.id,
      created_at: new Date().toISOString()
    });

    // ঙ) ইউজারকে শেয়ারিং লিঙ্ক দেওয়া
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    
    await ctx.reply(
      `✅ আপনার ফাইলটি সফলভাবে চ্যানেলে সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`,
      Markup.inlineKeyboard([
        [Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]
      ])
    );

  } catch (error) {
    console.error("Error Detail:", error); // ভেরসেল লগে এরর দেখার জন্য
    ctx.reply("❌ কোনো সমস্যা হয়েছে। আইডি বা পারমিশন চেক করুন।");
  }
});

// ৩. টেক্সট মেসেজ ব্লক করা
bot.on('text', async (ctx, next) => {
  if (!ctx.message.text.startsWith('/')) {
    return ctx.reply("❌ শুধুমাত্র ভিডিও বা ফাইল পাঠান।");
  }
  return next();
});

// ৪. /start কমান্ড
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;

  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        user_id: userId,
        username: ctx.from.username || 'N/A',
        first_name: ctx.from.first_name,
        start_date: new Date().toISOString()
      });
    }

    if (startParam) {
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        const { message_id } = videoDoc.data();
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
      } else {
        ctx.reply("❌ ফাইলটি খুঁজে পাওয়া যায়নি।");
      }
    } else {
      ctx.reply(`স্বাগতম ${ctx.from.first_name}!`);
    }
  } catch (error) {
    ctx.reply("ত্রুটি ঘটেছে।");
  }
});

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) { res.status(500).send('Error'); }
};
