import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Stripe from "stripe";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Clés à placer dans les variables Render (voir étape 2)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwcLOrEI12szj4NK9np0Tbve1u5RBhp7RouKEldIC1sRy8PcmMqKR3kg_3FKVwoZsIAmg/exec";
const stripe = Stripe(STRIPE_SECRET_KEY);

// Webhook Stripe (raw body obligatoire)
app.post("/webhook-stripe", bodyParser.raw({type: "application/json"}), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const user = JSON.parse(session.metadata.userData);
      const course = JSON.parse(session.metadata.courseData);

      // Construction du récapitulatif
      const recap = {
        Style: course.style,
        Date: course.date,
        Horaire: course.time,
        Professeur: course.teacher,
        Niveau: course.level,
        Tarif: course.price
      };
      const params = new URLSearchParams({
        nom: user.nom,
        prenom: user.prenom,
        age: user.age,
        email: user.email,
        telephone: user.telephone,
        ville: user.ville,
        premier_cours: user.premier_cours || "Non",
        recapitulatif: JSON.stringify(recap)
      });

      // Envoi à Google Apps Script
      const r = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: params.toString()
      });
      const txt = await r.text();
      console.log("Envoi à Apps Script OK:", txt);
    } catch (e) {
      console.error("Erreur lors de l'envoi à Apps Script:", e);
    }
  }

  res.status(200).send();
});

// Route pour les inscriptions gratuites (ou 1er cours gratuit)
app.post("/register-free", async (req, res) => {
  const user = req.body;

  const recap = {
    Style: user.course.style,
    Date: user.course.date,
    Horaire: user.course.time,
    Professeur: user.course.teacher,
    Niveau: user.course.level,
    Tarif: user.course.price
  };

  const params = new URLSearchParams({
    nom: user.nom,
    prenom: user.prenom,
    age: user.age,
    email: user.email,
    telephone: user.telephone,
    ville: user.ville,
    premier_cours: user.premier_cours || "Non",
    recapitulatif: JSON.stringify(recap)
  });

  try {
    const r = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: params.toString()
    });
    const txt = await r.text();
    res.json({success: true, msg: txt});
  } catch (e) {
    res.status(500).json({success: false, error: e.toString()});
  }
});

// Création de la session Stripe pour paiement
app.post("/create-checkout-session", async (req, res) => {
  const user = req.body;
  const amount = Math.round(Number(user.amount) * 100);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: `Cours: ${user.course.style} - ${user.course.date} (${user.course.time})`
          },
          unit_amount: amount
        },
        quantity: 1
      }],
      mode: "payment",
      customer_email: user.email,
      success_url: "https://ton-site.com/success", // à personnaliser
      cancel_url: "https://ton-site.com/cancel",   // à personnaliser
      metadata: {
        userData: JSON.stringify({
          nom: user.nom,
          prenom: user.prenom,
          age: user.age,
          email: user.email,
          telephone: user.telephone,
          ville: user.ville,
          premier_cours: user.premier_cours || "Non"
        }),
        courseData: JSON.stringify(user.course)
      }
    });

    res.json({id: session.id});
  } catch (e) {
    res.status(500).json({error: e.toString()});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur port ${PORT}`));