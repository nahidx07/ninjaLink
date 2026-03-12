const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম স্লাগ জেনারেটর (ইউনিক লিঙ্কের জন্য)
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// ২. মিডিয়া হ্যান্ডলার (ভিডিও, ফটো, ফাইল আপলোড)
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে... লিঙ্ক তৈরি করা হচ্ছে।");

  try {
    const user = ctx.from;
    const firstName = user.first_name.replace(/[<>]/g, ''); 
    const mention = `<a href="tg://user?id=${user.id}">${firstName}</a>`;

    // ফাইলটি চ্যানেলে কপি করা (ক্যাপশন রিমুভ করে)
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id,
      { caption: "" } 
    );

    // ইউনিক লিঙ্ক জেনারেট করা
    const slug = `file${generateRandomSlug(10)}`; 
    const botInfo = await ctx.telegram.getMe();
    const shareLink = `https://t.me/${botInfo.username}?start=${slug}`;

    // আপনার দেওয়া ফরম্যাটে চ্যানেলে ইনফো পাঠানো
    const infoText = `📥 <b>নতুন ফাইল আপলোড!</b>\n\n` +
                     `👤 <b>নাম:</b> ${firstName}\n` +
                     `🆔 <b>আইডি:</b> <code>${user.id}</code>\n` +
                     `💌 <b>ম্যানশন:</b> ${mention}\n` +
                     `🚀 <b>লিঙ্ক:</b> ${shareLink}`;

    await ctx.telegram.sendMessage(process.env.CHANNEL_ID, infoText, { parse_mode: 'HTML' });

    // Firebase-এ ডাটা সেভ করা
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: sentMsg.message_id,
      uploader_id: user.id,
      created_at: new Date().toISOString()
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    
    await ctx.reply(
      `✅ আপনার ফাইলটি সফলভাবে সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`,
      Markup.inlineKeyboard([
        [Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]
      ])
    );

  } catch (error) {
    console.error("Upload Error:", error);
    ctx.reply("❌ কোনো সমস্যা হয়েছে। বট চ্যানেলে এডমিন কি না চেক করুন।");
  }
});

// ৩. সাধারণ টেক্সট মেসেজ ব্লক করা
bot.on('text', async (ctx, next) => {
  if (!ctx.message.text.startsWith('/')) {
    return ctx.reply("❌ শুধুমাত্র ফটো, ভিডিও বা ফাইল শেয়ার করা যাবে।");
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
        ctx.reply("❌ দুঃখিত, ফাইলটি খুঁজে পাওয়া যায়নি।");
      }
    } else {
      const welcomeText = `স্বাগতম! আপনার আইডি: <code>${userId}</code>\n\n` +
                          `আপনার ফাইল বা ভিডিও দিয়ে ইউনিক লিঙ্ক পেতে এখানে ফাইলটি সেন্ড করুন। ✔️`;

      await ctx.reply(welcomeText, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url("🎬 Movie Channel", "https://t.me/MovieFantasyLover")],
          [Markup.button.url("📢 Update Channel", "https://t.me/NinjaLinkUpdate")]
        ])
      });
    }
  } catch (error) {
    ctx.reply("ত্রুটি ঘটেছে।");
  }
});

// ৫. অ্যাডমিন ব্রডকাস্ট সিস্টেম
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ মেসেজ লিখুন।");

  try {
    const usersSnapshot = await db.collection('users').get();
    const userIds = usersSnapshot.docs.map(doc => doc.id);
    await ctx.reply(`📢 ব্রডকাস্ট শুরু হয়েছে...`);

    const promises = userIds.map(id => ctx.telegram.sendMessage(id, msg).catch(e => {}));
    await Promise.allSettled(promises);

    ctx.reply("✅ ব্রডকাস্ট সম্পন্ন হয়েছে।");
  } catch (error) {
    ctx.reply("❌ ডাটাবেস এরর।");
  }
});

// ৬. Webhook Handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    res.status(200).send('OK');
  }
};
