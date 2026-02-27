const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. ফাইল, ফটো, ভিডিও, APK ও টেক্সট/লিংক হ্যান্ডলার
bot.on(['video', 'document', 'photo', 'text', 'animation', 'audio'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে... দয়া করে অপেক্ষা করুন।");

  try {
    let sentMsg;
    const user = ctx.from;
    const userMention = `[${user.first_name}](tg://user?id=${user.id})`;
    const username = user.username ? `@${user.username}` : "নেই";

    // ক) আইটেমটি চ্যানেলে কপি বা সেন্ড করা
    if (ctx.message.text) {
      // যদি টেক্সট বা লিংক হয়
      sentMsg = await ctx.telegram.sendMessage(process.env.CHANNEL_ID, ctx.message.text);
    } else {
      // যদি ভিডিও, ফটো, APK বা ফাইল হয়
      sentMsg = await ctx.telegram.copyMessage(
        process.env.CHANNEL_ID,
        ctx.chat.id,
        ctx.message.message_id
      );
    }

    const messageId = sentMsg.message_id;

    // খ) চ্যানেলে দ্বিতীয় মেসেজ: আপলোডারের তথ্য পাঠানো
    const infoText = `📥 **নতুন ফাইল আপলোড হয়েছে!**\n\n` +
                     `👤 নাম: ${user.first_name}\n` +
                     `🆔 ইউজারনেম: ${username}\n` +
                     `🔗 মেনশন: ${userMention}\n` +
                     `🆔 ইউজার আইডি: \`${user.id}\``;

    await ctx.telegram.sendMessage(process.env.CHANNEL_ID, infoText, { parse_mode: 'Markdown' });

    // গ) Firebase-এ ডাটা সেভ করা
    const slug = `Video${messageId}`;
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: messageId,
      uploader_id: user.id,
      uploader_name: user.first_name,
      type: ctx.message.text ? 'text' : 'media',
      created_at: new Date().toISOString()
    });

    // ঘ) ইউজারকে শেয়ারিং লিঙ্ক দেওয়া
    const shareLink = `https://t.me/${ctx.botInfo.username}?start=${slug}`;
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    
    await ctx.reply(
      `✅ সফলভাবে সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`,
      Markup.inlineKeyboard([
        [Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${shareLink}`)]
      ])
    );

  } catch (error) {
    console.error("Error:", error);
    ctx.reply("❌ এটি সেভ করা সম্ভব হয়নি। এডমিনকে চ্যানেল পারমিশন চেক করতে বলুন।");
  }
});

// ২. /start কমান্ড (লিঙ্ক থেকে ভিডিও ডেলিভারি ও ইউজার ট্র্যাকিং)
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
        ctx.reply("❌ লিঙ্কটি সঠিক নয় বা ফাইলটি মুছে ফেলা হয়েছে।");
      }
    } else {
      ctx.reply(`স্বাগতম ${ctx.from.first_name}!\n\nযেকোনো ফাইল বা লিঙ্ক এখানে পাঠান, আমি লিঙ্ক তৈরি করে দিব।`);
    }
  } catch (error) {
    ctx.reply("কিছু একটা সমস্যা হয়েছে।");
  }
});

// ৩. এডমিন ব্রডকাস্ট সিস্টেম
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("মেসেজ লিখুন।");

  const usersSnapshot = await db.collection('users').get();
  ctx.reply("ব্রডকাস্ট শুরু হয়েছে...");
  let count = 0;
  for (const doc of usersSnapshot.docs) {
    try {
      await ctx.telegram.sendMessage(doc.id, msg);
      count++;
    } catch (e) { continue; }
  }
  ctx.reply(`✅ সফল! ${count} জনকে পাঠানো হয়েছে।`);
});

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) { res.status(500).send('Error'); }
};
