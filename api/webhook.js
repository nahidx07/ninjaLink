const { Telegraf, Markup } = require('telegraf');
const db = require('../lib/firebase');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ১. ইউনিক আইডি জেনারেটর
function generateRandomSlug(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// ২. ডাটাবেস থেকে ক্লাউড চ্যানেল আইডি
async function getCloudChannels() {
  const settings = await db.collection('settings').doc('cloud_config').get();
  return settings.exists ? settings.data().channels || [] : [];
}

// ৩. মিডিয়া হ্যান্ডলার
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ ফাইল প্রসেসিং এবং ক্লাউড ব্যাকআপ হচ্ছে...");
  try {
    const cloudChannels = await getCloudChannels();
    let backupRecords = [];
    for (const channelId of cloudChannels) {
      try {
        const sentMsg = await ctx.telegram.copyMessage(channelId, ctx.chat.id, ctx.message.message_id, { caption: "" });
        backupRecords.push({ channel_id: channelId, message_id: sentMsg.message_id });
      } catch (err) { console.error(`Backup Error to ${channelId}:`, err.message); }
    }
    const slug = `file${generateRandomSlug(10)}`;
    await db.collection('videos').doc(slug).set({
      slug, backups: backupRecords, uploader_id: ctx.from.id, created_at: new Date().toISOString()
    });
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ ফাইল সেভ হয়েছে!\n🔗 লিঙ্ক: https://t.me/${(await ctx.telegram.getMe()).username}?start=${slug}`);
  } catch (e) { ctx.reply("❌ এরর: বট সব চ্যানেলে এডমিন আছে কিনা চেক করুন।"); }
});

// ৪. স্মার্ট রিকভারি
bot.start(async (ctx) => {
  const param = ctx.startPayload;
  if (param && param.startsWith('file')) {
    const doc = await db.collection('videos').doc(param).get();
    if (!doc.exists) return ctx.reply("❌ ফাইল নেই।");
    const backups = doc.data().backups;
    for (const b of backups) {
      try { await ctx.telegram.copyMessage(ctx.chat.id, b.channel_id, b.message_id); return; } 
      catch (e) { continue; }
    }
    ctx.reply("❌ সব ব্যাকআপ চ্যানেল থেকে ফাইলটি মুছে গেছে।");
  } else { ctx.reply(`স্বাগতম! ফাইল শেয়ার করতে পাঠান।\n\nCommands:\n/start\n/mydata`); }
});

// ৫. ক্লাউড ম্যানেজমেন্ট
bot.command('addcloud', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const id = ctx.message.text.split(' ')[1];
  const doc = db.collection('settings').doc('cloud_config');
  const snap = await doc.get();
  let list = snap.exists ? snap.data().channels : [];
  if (!list.includes(id)) { list.push(id); await doc.set({ channels: list }); ctx.reply("✅ চ্যানেল যুক্ত হয়েছে।"); }
});

bot.command('removecloud', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const id = ctx.message.text.split(' ')[1];
  const doc = db.collection('settings').doc('cloud_config');
  const snap = await doc.get();
  if (snap.exists) {
    let list = snap.data().channels.filter(c => c !== id);
    await doc.set({ channels: list });
    ctx.reply("✅ চ্যানেল রিমুভ হয়েছে।");
  }
});

bot.command('listcloud', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const channels = await getCloudChannels();
  ctx.reply(`☁️ চ্যানেল লিস্ট:\n${channels.join('\n')}`);
});

// ৬. আপডেট করা ডেটা ট্রান্সফার কমান্ড
bot.command('sentdata', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  const oldID = args[1], newID = args[2];
  if (!oldID || !newID) return ctx.reply("❌ ফরম্যাট: /sentdata [OldID] [NewID]");

  const statusMsg = await ctx.reply(`🔄 ট্রান্সফার শুরু... এটি সময় নিতে পারে।`);
  const vids = await db.collection('videos').get();
  let s = 0, f = 0;

  for (const doc of vids.docs) {
    const data = doc.data();
    const old = data.backups.find(b => b.channel_id === oldID);
    if (old) {
      try {
        const sent = await ctx.telegram.copyMessage(newID, oldID, old.message_id);
        const newBackups = [...data.backups, { channel_id: newID, message_id: sent.message_id }];
        await doc.ref.update({ backups: newBackups });
        s++;
      } catch (e) { f++; }
      // প্রতিটি ফাইলের মাঝে ১.৫ সেকেন্ডের বিরতি
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `✅ কাজ শেষ!\n🚀 সফল: ${s}\n❌ ব্যর্থ: ${f}`);
});

// ৭. অন্যান্য কমান্ড
bot.command('mydata', async (ctx) => {
  const vids = await db.collection('videos').where('uploader_id', '==', ctx.from.id).get();
  let list = `📂 আপনার ফাইল:\n`;
  vids.forEach(d => list += `${d.data().slug}\n`);
  ctx.reply(list || "কোনো ফাইল নেই।");
});

module.exports = async (req, res) => {
  if (req.method === 'POST') await bot.handleUpdate(req.body);
  res.status(200).send('OK');
};
