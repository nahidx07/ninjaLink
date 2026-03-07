const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম স্লাগ জেনারেটর (১০ অক্ষরের)
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
    const firstName = user.first_name.replace(/[<>]/g, ''); // HTML safety
    const username = user.username ? `@${user.username}` : "নেই";

    // ক) ফাইলটি চ্যানেলে কপি করা (ক্যাপশন রিমুভ করে)
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id,
      { caption: "" } 
    );

    const messageId = sentMsg.message_id;

    // খ) ইউনিক স্লাগ ও লিঙ্ক জেনারেট করা
    const slug = `file${generateRandomSlug(10)}`; 
    const botUsername = ctx.botInfo ? ctx.botInfo.username : "NinjaLink_Bot"; 
    const shareLink = `https://t.me/${botUsername}?start=${slug}`;

    // গ) চ্যানেলে ইনফো মেসেজ ও লিঙ্ক পাঠানো (HTML ফরম্যাটে)
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
      uploader_name: user.first_name,
      created_at: new Date().toISOString()
    });

    // ঙ) ইউজারকে লিঙ্ক ও শেয়ার বাটন দেওয়া
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

// ৪. /start কমান্ড হ্যান্ডলার (বাটনসহ স্বাগতম মেসেজ)
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;

  try {
    // ইউজারের তথ্য সেভ করা (ব্রডকাস্টের জন্য)
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
      // লিঙ্ক থেকে ফাইল খুঁজে বের করা
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        const { message_id } = videoDoc.data();
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, message_id);
      } else {
        ctx.reply("❌ দুঃখিত, ফাইলটি খুঁজে পাওয়া যায়নি।");
      }
    } else {
      // আপনার চাওয়া স্বাগতম মেসেজ ও বাটন
      const welcomeText = `স্বাগতম! আপনার আইডি: <code>${userId}</code>\n\n` +
                          `আপনার ফাইল , ভিডিও দিয়ে ইউনিক লিংক পান ✔️`;

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

// ৫. দ্রুত ব্রডকাস্ট সিস্টেম (রিপোর্টসহ)
bot.command('broadcast', async (ctx) => {
  const adminId = process.env.ADMIN_ID;
  if (ctx.from.id.toString() !== adminId) return ctx.reply("❌ আপনি এডমিন নন।");

  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ মেসেজ লিখুন। উদাহরণ: /broadcast Hello");

  try {
    const usersSnapshot = await db.collection('users').get();
    if (usersSnapshot.empty) return ctx.reply("❌ ডাটাবেসে কোনো ইউজার নেই।");

    const userIds = usersSnapshot.docs.map(doc => doc.id);
    await ctx.reply(`📢 ${userIds.length} জনকে মেসেজ পাঠানো শুরু হয়েছে...`);

    // সব মেসেজ একসাথে পাঠানো (Parallel processing)
    const promises = userIds.map(id => ctx.telegram.sendMessage(id, msg));
    const results = await Promise.allSettled(promises);

    let successCount = 0;
    let failCount = 0;

    results.forEach((res) => {
      if (res.status === 'fulfilled') successCount++;
      else failCount++;
    });

    ctx.reply(
      `✅ **ব্রডকাস্ট সম্পন্ন হয়েছে!**\n\n` +
      `🚀 **সফল:** ${successCount} জন\n` +
      `❌ **ব্যর্থ:** ${failCount} জন`
    , { parse_mode: 'Markdown' });

  } catch (error) {
    ctx.reply("❌ ডাটাবেস এরর।");
  }
});

// ৬. Webhook Handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(200).send('OK'); // Always send OK to prevent retries
  }
};
