// lib/db-events.js
import createSubscriber from "pg-listen";


const subscriber = createSubscriber({ connectionString: process.env.DATABASE_URL || ''});

// Головна функція для ініціалізації
export async function initDatabaseListeners() {
  subscriber.events.on("error", (error) => {
    console.error("Fatal database connection error:", error);
    process.exit(1);
  });

  await subscriber.connect();

  // Реєструємо всі канали, які нам потрібні
  const channels = ["load_updates", "tender_updates", "user_updates"];
  
  for (const channel of channels) {
    await subscriber.listenTo(channel);
  }

  console.log("Listening to PG notifications...");
}

export { subscriber };