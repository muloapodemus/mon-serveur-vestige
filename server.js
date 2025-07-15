require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { sendToGoogleApps } = require('./googleAppsBridge');

const app = express();
app.use(bodyParser.json());

// 🔁 Route de création de paiement
app.post('/start-payment', async (req, res) => {
  try {
    const data = req.body;

    // Créer le paiement
    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseInt(data.tarif) * 100, // 💰 Stripe utilise des centimes
      currency: 'eur',
      receipt_email: data.email,
      metadata: { nom: data.nom, prenom: data.prenom, email: data.email }
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Erreur Stripe:", err.message);
    res.status(500).send("Erreur lors de la création du paiement.");
  }
});

// ⚡️ Webhook Stripe
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  let event;

  try {
    event = JSON.parse(req.body);
  } catch (err) {
    console.error("Webhook non valide");
    return res.status(400).send(`Erreur: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;

    // 📨 Construire les infos à envoyer à Apps Script
    const userData = {
      nom: intent.metadata.nom,
      prenom: intent.metadata.prenom,
      email: intent.metadata.email,
      tarif: intent.amount / 100,
      statut_paiement: "Confirmé"
    };

    // 📤 Envoi vers Google Apps Script
    await sendToGoogleApps(userData);
    console.log("Inscription envoyée à Google Apps Script");

    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

app.listen(3000, () => console.log("✅ Serveur lancé sur http://localhost:3000"));
