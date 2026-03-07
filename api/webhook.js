const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম লেটার জেনারেটর ফাংশন (১০ অক্ষরের)
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// ২. মিডিয়া হ্যান্ডলার (ফটো, ভিডিও, ফাইল, APK) - ক্যাপশন রিমুভ করবে
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে... ক্যাপশন রিমুভ করা হচ্ছে।");

  try {
    const user = ctx.from;
    const userMention = `[${user.first_name}](tg://user?id=${user.id})`;
    const username = user.username ? `@${user.username}` : "নেই";

    // ক) ফাইলটি চ্যানেলে কপি করা (caption: "" দেওয়ার ফলে আগের সব লেখা মুছে যাবে)
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id,
      { caption: "" } // এটি ভিডিওর নিচের সব টেক্সট বা লিংক মুছে দিবে
    );

    const messageId = sentMsg.message_id;

    // খ) 'file' প্রিফিক্স দিয়ে ইউনিক লেটার স্লাগ তৈরি
    const slug = `file${generateRandomSlug(10)}`; 

    // গ) চ্যানেলে আপলোডারের তথ্য আলাদা মেসেজে পাঠানো
    const infoText = `📥 **নতুন ফাইল আপলোড হয়েছে!**\n\n` +
                     `👤 নাম: ${user.first_name}\n` +
                     `🆔 ইউজারনেম: ${username}\n` +
                     `🔗 মেনশন: ${userMention}\n` +
                     `🆔 ইউজার আইডি: \`${user.id}\``;

    await ctx.telegram.sendMessage(process.env.CHANNEL_ID, infoText, { parse_mode: 'Markdown' });

    // ঘ) Firebase-এ ডাটা সেভ করা
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: messageId,
      uploader_id: user.id,
      uploader_name: user.first_name,
      created_at: new Date().toISOString()
    });

    // ঙ) ইউজারের জন্য লিঙ্ক জেনারেট করা
    const shareLink = `https://t.me/${ctx.botInfo.username}?start=${slug}`;
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    
    await ctx.reply(
      `✅ আপনার ফাইলটি ক্যাপশন ছাড়াই সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`,
      Markup.inlineKeyboard([
        [Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]
      ])
    );

  } catch (error) {
    console.error("Error:", error);
    ctx.reply("❌ এটি সেভ করা সম্ভব হয়নি।");
  }
});

// ৩. টেক্সট মেসেজ ব্লক করা (শুধুমাত্র কমান্ড ছাড়া)
bot.on('text', async (ctx, next) => {
  if (!ctx.message.text.startsWith('/')) {
    return ctx.reply("❌ শুধুমাত্র ফটো, ভিডিও বা ফাইল শেয়ার করা যাবে। টেক্সট বা লিংক এলাউড নয়।");
  }
  return next();
});

// ৪. /start কমান্ড হ্যান্ডলার
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
      ctx.reply(`স্বাগতম ${ctx.from.first_name}!\nফাইল শেয়ার করতে এখানে মিডিয়া পাঠান।`);
    }
  } catch (error) {
    ctx.reply("সমস্যা হয়েছে।");
  }
});

// ৫. এডমিন ব্রডকাস্ট সিস্টেম
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  const usersSnapshot = await db.collection('users').get();
  for (const doc of usersSnapshot.docs) {
    try { await ctx.telegram.sendMessage(doc.id, msg); } catch (e) {}
  }
  ctx.reply("ব্রডকাস্ট সম্পন্ন।");
});

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) { res.status(500).send('Error'); }
};
