// test.js
const url = "https://d132nmj5ubutr8.cloudfront.net/api/split/checkout"; // 🔧 Ajusta tu endpoint

async function testConnection() {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-token"
      },
      body: JSON.stringify({ ping: true }),
    });

    console.log("✅ Status:", response.status);
    console.log("✅ Headers:");
    for (const [key, value] of response.headers) {
      console.log(`  ${key}: ${value}`);
    }

    const text = await response.text();
    console.log("✅ Body:", text);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

testConnection();
