const fetch = require('node-fetch');

async function sendToGoogleApps(userData) {
  try {
    const response = await fetch(process.env.GAS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData)
    });

    const result = await response.text();
    console.log("Réponse du script:", result);
  } catch (err) {
    console.error("Erreur envoi vers Google Apps:", err.message);
  }
}

module.exports = { sendToGoogleApps };
