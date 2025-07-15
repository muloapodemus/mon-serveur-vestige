require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { sendToGoogleApps } = require('./googleAppsBridge');

const app = express();

// Stripe exige raw pour les webhooks
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));
app.use(express.json());

// 🎯 Route de création de session Stripe Checkout
app.post('/start-checkout', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Inscription Vestige Live Studio',
            },
            unit_amount: parseInt(req.body.tarif) * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        nom: req.body.nom,
        prenom: req.body.prenom,
        email: req.body.email,
        tarif: req.body.tarif
      },
      customer_email: req.body.email,
      success_url: 'https://tonsite.com/succes',
      cancel_url: 'https://tonsite.com/annule',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('💥 Erreur Checkout:', err.message);
    res.status(500).send('Erreur lors de la création de la session');
  }
});

// ⚡️ Webhook Stripe sécurisé
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
    return res.status(400).send("Signature invalide");
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const userData = {
      nom: session.metadata.nom,
      prenom: session.metadata.prenom,
      email: session.metadata.email,
      tarif: session.metadata.tarif,
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
