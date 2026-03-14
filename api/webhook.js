const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম স্লাগ জেনারেটর
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// ২. মিডিয়া হ্যান্ডলার
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ প্রসেসিং হচ্ছে...");
  try {
    const user = ctx.from;
    const originalCaption = ctx.message.caption || "";

    // চ্যানেলে ফাইল কপি করা (ক্যাপশনসহ)
    const sentMsg = await ctx.telegram.copyMessage(
      process.env.CHANNEL_ID,
      ctx.chat.id,
      ctx.message.message_id,
      { caption: originalCaption } 
    );

    const slug = `file${generateRandomSlug(10)}`; 
    const shareLink = `https://t.me/${process.env.BOT_USERNAME}?start=${slug}`;

    // ডাটাবেসে সেভ করা
    await db.collection('videos').doc(slug).set({
      slug: slug,
      message_id: sentMsg.message_id,
      uploader_id: user.id,
      created_at: new Date().toISOString()
    });

    // ইউজারকে ইনস্ট্যান্ট লিঙ্ক দেওয়া
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ ফাইলটি সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.url("Join Channel", "https://t.me/DeveloperNinja")]])
    });

  } catch (error) {
    ctx.reply("❌ এরর: " + error.message);
  }
});

// ৩. /start কমান্ড
bot.start(async (ctx) => {
  const startParam = ctx.startPayload;
  try {
    if (startParam && startParam.startsWith('file')) {
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id, { caption: "" });
      } else {
        ctx.reply("❌ ফাইলটি খুঁজে পাওয়া যায়নি।");
      }
    } else {
      await ctx.reply(`স্বাগতম! আপনার ফাইল শেয়ার করতে এখানে পাঠান। ✔️`, Markup.inlineKeyboard([[Markup.button.url("Join Channel", "https://t.me/DeveloperNinja")]]));
    }
  } catch (error) { ctx.reply("ত্রুটি: " + error.message); }
});

// ৪. /mydata কমান্ড
bot.command('mydata', async (ctx) => {
  const vids = await db.collection('videos').where('uploader_id', '==', ctx.from.id).get();
  if (vids.empty) return ctx.reply("❌ আপনি এখনও কোনো ফাইল আপলোড করেননি।");
  let list = `📂 আপনার আপলোড করা ফাইল:\n\n`;
  vids.forEach((doc, i) => list += `${i+1}. আইডি: <code>${doc.data().slug}</code>\n`);
  ctx.reply(list, { parse_mode: 'HTML' });
});

// ৫. টেক্সট হ্যান্ডলার (ফাইল রিকভারি)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('file')) {
    const videoDoc = await db.collection('videos').doc(text).get();
    if (videoDoc.exists) {
      await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id, { caption: "" });
    }
  }
});

// ৬. এডমিন কমান্ড
bot.command('user', async (ctx) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    await ctx.reply(`👥 মোট ইউজার সংখ্যা: <b>${usersSnapshot.size}</b> জন।`, { parse_mode: 'HTML' });
  } catch (error) { ctx.reply("❌ এরর: " + error.message); }
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID.toString()) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply("❌ নিয়ম: /broadcast [মেসেজ]");
  const users = await db.collection('users').get();
  for (const doc of users.docs) {
    try { await ctx.telegram.sendMessage(doc.id, msg); } catch (e) {}
    await new Promise(r => setTimeout(r, 100)); 
  }
  ctx.reply("✅ ব্রডকাস্ট সম্পন্ন!");
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
