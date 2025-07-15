require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { sendToGoogleApps } = require('./googleAppsBridge');

const app = express();

// Stripe exige raw pour les webhooks
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));
app.use(express.json());

// 🔁 Route de création de paiement
app.post('/start-payment', async (req, res) => {
  try {
    const data = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseInt(data.tarif) * 100, // 💰 en centimes
      currency: 'eur',
      receipt_email: data.email,
      metadata: {
        nom: data.nom,
        prenom: data.prenom,
        email: data.email
      }
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("💥 Erreur Stripe:", err.message);
    res.status(500).send("Erreur lors de la création du paiement.");
  }
});

// ⚡️ Webhook Stripe avec sécurité
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("🚨 Signature Stripe invalide :", err.message);
    return res.status(400).send(`Signature invalide`);
  }

  // 🎯 Traitement du paiement réussi
  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;

    const userData = {
      nom: intent.metadata.nom,
      prenom: intent.metadata.prenom,
      email: intent.metadata.email,
      tarif: intent.amount / 100,
      statut_paiement: "Confirmé"
    };

    await sendToGoogleApps(userData);
    console.log(`✅ Paiement confirmé pour ${userData.email}`);
    res.sendStatus(200);
  } else {
    res.status(400).send("Événement non géré.");
  }
});

// ✅ Lancement du serveur
app.listen(3000, () => {
  console.log("🚀 Serveur lancé sur http://localhost:3000");
});
