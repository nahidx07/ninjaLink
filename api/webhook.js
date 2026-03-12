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
    const sentMsg = await ctx.telegram.copyMessage(process.env.CHANNEL_ID, ctx.chat.id, ctx.message.message_id, { caption: "" });
    const slug = `file${generateRandomSlug(10)}`; 
    const botInfo = await ctx.telegram.getMe();
    const shareLink = `https://t.me/${botInfo.username}?start=${slug}`;

    await ctx.telegram.sendMessage(process.env.CHANNEL_ID, 
      `📥 <b>নতুন ফাইল আপলোড!</b>\n\n👤 নাম: ${user.first_name}\n🆔 আইডি: <code>${user.id}</code>\n🚀 লিঙ্ক: ${shareLink}`, 
      { parse_mode: 'HTML' }
    );

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
  } catch (e) { ctx.reply("❌ এরর ঘটেছে।"); }
});

// ৩. /start কমান্ড (রেফারেল সিস্টেম রিমুভ করা হয়েছে)
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const startParam = ctx.startPayload;

  try {
    let userRef = db.collection('users').doc(userId);
    let userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        user_id: userId,
        first_name: ctx.from.first_name,
        coins: 0,
        start_date: new Date().toISOString()
      });
      userDoc = await userRef.get();
    }

    // ফাইল লিঙ্ক হ্যান্ডলিং
    if (startParam && startParam.startsWith('file')) {
      const videoDoc = await db.collection('videos').doc(startParam).get();
      if (videoDoc.exists) {
        return await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id);
      }
    }

    // সাধারণ স্বাগতম মেসেজ
    const balance = userDoc.data().coins || 0;
    const welcomeText = `স্বাগতম <b>${ctx.from.first_name}</b>!\nআপনার আইডি: <code>${userId}</code>\n\n` +
                        `💰 আপনার ব্যালেন্স: <b>${balance}</b> কয়েন\n\n` +
                        `আপনার ফাইল বা ভিডিও দিয়ে ইউনিক লিঙ্ক পেতে এখানে ফাইলটি সেন্ড করুন। ✔️`;

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback("💳 উইথড্র করুন", "withdraw_menu")],
        [Markup.button.url("🎬 Movie Channel", "https://t.me/MovieFantasyLover")],
        [Markup.button.url("📢 Update Channel", "https://t.me/NinjaLinkUpdate")]
      ])
    });
  } catch (e) { console.error(e); }
});

// ৪. উইথড্র মেনু
bot.action('withdraw_menu', async (ctx) => {
  const userDoc = await db.collection('users').doc(ctx.from.id.toString()).get();
  const coins = userDoc.data().coins || 0;
  if (coins < 1000) return ctx.answerCbQuery(`❌ পর্যাপ্ত কয়েন নেই। আপনার আছে ${coins} কয়েন।`, { show_alert: true });

  await ctx.editMessageText("পেমেন্ট মেথড সিলেক্ট করুন:", Markup.inlineKeyboard([
    [Markup.button.callback("Bkash", "pay_Bkash"), Markup.button.callback("Nagad", "pay_Nagad")],
    [Markup.button.callback("Rocket", "pay_Rocket")]
  ]));
});

// ৫. পেমেন্ট মেথড হ্যান্ডলার
bot.action(/^pay_(.+)$/, async (ctx) => {
  const method = ctx.match[1];
  await ctx.deleteMessage();
  await ctx.reply(`আপনি <b>${method}</b> সিলেক্ট করেছেন।\nনিচের ফরম্যাটে নাম্বার দিন:\n<code>/submit ${method} 017XXXXXXXX</code>`, { parse_mode: 'HTML' });
});

// ৬. উইথড্র সাবমিট
bot.command('submit', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 3) return ctx.reply("❌ সঠিক নিয়ম: /submit [Method] [Number]");

  const userId = ctx.from.id.toString();
  const method = args[1];
  const number = args[2];

  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const coins = userDoc.data().coins || 0;

    if (coins < 1000) return ctx.reply("❌ ব্যালেন্স কম।");

    await userRef.update({ coins: coins - 1000 });

    const adminMsg = `💰 <b>উইথড্র রিকোয়েস্ট!</b>\n\n👤 নাম: ${ctx.from.first_name}\n💳 মেথড: ${method}\n📱 নাম্বার: ${number}`;
    await ctx.telegram.sendMessage(process.env.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });

    ctx.reply("✅ রিকোয়েস্ট পাঠানো হয়েছে।");
  } catch (e) { ctx.reply("ত্রুটি ঘটেছে।"); }
});

// ৭. ব্রডকাস্ট
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  const users = await db.collection('users').get();
  const promises = users.docs.map(doc => ctx.telegram.sendMessage(doc.id, msg));
  await Promise.allSettled(promises);
  ctx.reply("✅ ব্রডকাস্ট সম্পন্ন।");
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
