const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. র‍্যান্ডম স্লাগ জেনারেটর
function generateRandomSlug(length = 10) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// ২. মিডিয়া হ্যান্ডলার
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
    const waitMsg = await ctx.reply("⚡ ফাইল প্রসেস হচ্ছে...");
    try {
        const slug = `file${generateRandomSlug(10)}`;
        const botInfo = await ctx.telegram.getMe();
        const shareLink = `https://t.me/${botInfo.username}?start=${slug}`;
        
        // ইউজারের তথ্য
        const firstName = ctx.from.first_name;
        const userId = ctx.from.id;
        const mention = `[${firstName}](tg://user?id=${userId})`;

        // চ্যানেলে ফাইল কপি করা (ক্যাপশনসহ)
        const sentMsg = await ctx.telegram.copyMessage(
            process.env.CHANNEL_ID,
            ctx.chat.id,
            ctx.message.message_id,
            { caption: ctx.message.caption || "" }
        );

        // চ্যানেলে ফাইলটির নিচে ইনফো মেসেজ পাঠানো
        const infoMessage = `📥 নতুন ফাইল আপলোড!\n\n👤 নাম: ${firstName}\n🆔 আইডি: ${userId}\n💌 ম্যানশন: ${mention}\n🚀 লিঙ্ক: ${shareLink}`;
        
        await ctx.telegram.sendMessage(process.env.CHANNEL_ID, infoMessage, {
            parse_mode: 'Markdown',
            reply_to_message_id: sentMsg.message_id
        });

        // ডাটাবেসে সেভ করা
        await db.collection('videos').doc(slug).set({
            slug: slug,
            message_id: sentMsg.message_id,
            uploader_id: userId,
            created_at: new Date().toISOString()
        });

        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
        await ctx.reply(`✅ ফাইলটি সেভ হয়েছে!\n\n🔗 লিঙ্ক: ${shareLink}`, Markup.inlineKeyboard([[Markup.button.url("🚀 শেয়ার করুন", `https://t.me/share/url?url=${encodeURIComponent(shareLink)}`)]]));
        
    } catch (error) {
        console.error(error);
        ctx.reply("❌ এরর! চেক করুন বট চ্যানেলে এডমিন আছে কি না।");
    }
});

// ৩. /start কমান্ড
bot.start(async (ctx) => {
    const startParam = ctx.startPayload;
    await db.collection('users').doc(ctx.from.id.toString()).set({ username: ctx.from.username || "N/A" });

    if (!startParam) {
        return ctx.reply(`স্বাগতম! ফাইল শেয়ার করতে এখানে পাঠান।`, Markup.inlineKeyboard([[Markup.button.url("🎬 Movie Channel", "https://t.me/MovieFantasyLover")]]));
    }

    const videoDoc = await db.collection('videos').doc(startParam).get();
    if (videoDoc.exists) {
        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id);
    } else {
        ctx.reply("❌ ফাইলটি খুঁজে পাওয়া যায়নি।");
    }
});

// ৪. ইউজার কমান্ড: /mydata
bot.command('mydata', async (ctx) => {
    const vids = await db.collection('videos').where('uploader_id', '==', ctx.from.id).get();
    if (vids.empty) return ctx.reply("❌ আপনি এখনও কোনো ফাইল আপলোড করেননি।");
    let list = `📂 আপনার মোট আপলোড করা ফাইল: ${vids.size}টি\n\n`;
    vids.forEach((doc, i) => list += `${i+1}. আইডি: <code>${doc.data().slug}</code>\n`);
    ctx.reply(list, { parse_mode: 'HTML' });
});

// ৫. টেক্সট হ্যান্ডলার
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('file')) {
        const videoDoc = await db.collection('videos').doc(text).get();
        if (videoDoc.exists) {
            await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, videoDoc.data().message_id);
        } else {
            ctx.reply("❌ ফাইল পাওয়া যায়নি।");
        }
    }
});

// ৬. এডমিন কমান্ড
bot.command('data', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
    const userId = ctx.message.text.split(' ')[1];
    const vids = await db.collection('videos').where('uploader_id', '==', parseInt(userId)).get();
    if (vids.empty) return ctx.reply("❌ ফাইল নেই।");
    let list = `👤 ইউজার: ${userId}\n📂 মোট ফাইল: ${vids.size}টি\n\n`;
    vids.forEach((doc, i) => list += `${i+1}. আইডি: <code>${doc.data().slug}</code>\n`);
    ctx.reply(list, { parse_mode: 'HTML' });
});

bot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
    const msg = ctx.message.text.split(' ').slice(1).join(' ');
    if (!msg) return ctx.reply("❌ নিয়ম: /broadcast [মেসেজ]");
    const users = await db.collection('users').get();
    const promises = users.docs.map(doc => ctx.telegram.sendMessage(doc.id, msg).catch(() => {}));
    await Promise.allSettled(promises);
    ctx.reply(`✅ ব্রডকাস্ট সম্পন্ন!`);
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); }
  catch (err) { res.status(200).send('OK'); }
};
