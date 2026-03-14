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

// ২. ডাটাবেস থেকে সব ক্লাউড চ্যানেল আইডি আনা
async function getCloudChannels() {
  const settings = await db.collection('settings').doc('cloud_config').get();
  return settings.exists ? settings.data().channels || [] : [];
}

// ৩. ফাইল হ্যান্ডলার: মিডিয়া আসলেই সব চ্যানেলে কপি হবে
bot.on(['video', 'document', 'photo', 'animation', 'audio', 'video_note'], async (ctx) => {
  const waitMsg = await ctx.reply("⚡ ফাইল প্রসেসিং এবং ক্লাউড ব্যাকআপ হচ্ছে...");
  
  try {
    const cloudChannels = await getCloudChannels();
    if (cloudChannels.length === 0) return ctx.reply("❌ কোনো ক্লাউড চ্যানেল সেট করা নেই।");

    let backupRecords = [];
    for (const channelId of cloudChannels) {
      try {
        const sentMsg = await ctx.telegram.copyMessage(channelId, ctx.chat.id, ctx.message.message_id, { caption: "" });
        backupRecords.push({ channel_id: channelId, message_id: sentMsg.message_id });
      } catch (err) {
        console.error(`Error to ${channelId}:`, err.message);
      }
    }

    if (backupRecords.length === 0) throw new Error("ব্যাকআপ ব্যর্থ হয়েছে।");

    const slug = `file${generateRandomSlug(10)}`;
    await db.collection('videos').doc(slug).set({
      slug,
      backups: backupRecords,
      uploader_id: ctx.from.id,
      created_at: new Date().toISOString()
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ ফাইল সেভ হয়েছে!\n\n🔗 লিঙ্ক: https://t.me/${(await ctx.telegram.getMe()).username}?start=${slug}`);
  } catch (e) {
    ctx.reply("❌ ত্রুটি: নিশ্চিত করুন বট সব চ্যানেলে এডমিন আছে।");
  }
});

// ৪. /start কমান্ড: স্মার্ট রিকভারি
bot.start(async (ctx) => {
  const startParam = ctx.startPayload;
  if (startParam && startParam.startsWith('file')) {
    const doc = await db.collection('videos').doc(startParam).get();
    if (!doc.exists) return ctx.reply("❌ ফাইলটি পাওয়া যায়নি।");
    
    const backups = doc.data().backups;
    for (const b of backups) {
      try {
        await ctx.telegram.copyMessage(ctx.chat.id, b.channel_id, b.message_id);
        return; 
      } catch (e) { continue; }
    }
    ctx.reply("❌ সব ব্যাকআপ চ্যানেল থেকে ফাইলটি মুছে গেছে।");
  } else {
    ctx.reply(`স্বাগতম! আপনার ফাইল শেয়ার করতে সেন্ড করুন।\n\nCommands:\n/start\n/mydata`);
  }
});

// ৫. ক্লাউড চ্যানেল ম্যানেজমেন্ট
bot.command('addcloud', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const id = ctx.message.text.split(' ')[1];
  const doc = db.collection('settings').doc('cloud_config');
  const snap = await doc.get();
  let list = snap.exists ? snap.data().channels : [];
  if (!list.includes(id)) { list.push(id); await doc.set({ channels: list }); }
  ctx.reply("✅ চ্যানেল যুক্ত হয়েছে।");
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

// ৬. ডেটা ট্রান্সফার কমান্ড: /sentdata [OldID] [NewID]
bot.command('sentdata', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const args = ctx.message.text.split(' ');
  const oldID = args[1];
  const newID = args[2];
  
  const status = await ctx.reply("🔄 ট্রান্সফার শুরু...");
  const vids = await db.collection('videos').get();
  let s = 0, f = 0;

  for (const doc of vids.docs) {
    const data = doc.data();
    const old = data.backups.find(b => b.channel_id === oldID);
    if (old) {
      try {
        const sent = await ctx.telegram.copyMessage(newID, oldID, old.message_id);
        await doc.ref.update({ backups: [...data.backups, { channel_id: newID, message_id: sent.message_id }] });
        s++;
      } catch (e) { f++; }
      await new Promise(r => setTimeout(r, 600));
    }
  }
  ctx.editMessageText(`✅ সম্পন্ন! সফল: ${s}, ব্যর্থ: ${f}`);
});

// ৭. অন্যান্য
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
