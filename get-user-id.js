require('dotenv').config();

const TOKEN = process.env.MAX_TOKEN;

async function getUpdates(marker) {
  const url = `https://platform-api.max.ru/updates?timeout=30${marker ? `&marker=${marker}` : ''}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': TOKEN,
    },
  });
  return response.json();
}

async function main() {
  console.log('🔍 Ожидание подключений к боту...');
  console.log('Отправьте любое сообщение боту @id263215151577_1_bot\n');
  
  let marker;
  
  while (true) {
    try {
      const result = await getUpdates(marker);
      
      if (result.updates && result.updates.length > 0) {
        for (const update of result.updates) {
          console.log('\n📥 Новое событие:', update.update_type);
          
          if (update.user) {
            console.log('👤 User ID:', update.user.user_id);
            console.log('👤 Name:', update.user.name);
            console.log('👤 Username:', update.user.username);
          }
          
          if (update.message) {
            console.log('💬 Message:', update.message.body?.text);
            console.log('💬 Chat ID:', update.message.recipient?.chat_id);
          }
          
          if (update.callback) {
            console.log('🔘 Callback:', update.callback.payload);
          }
        }
      }
      
      if (result.marker) {
        marker = result.marker;
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

main();
