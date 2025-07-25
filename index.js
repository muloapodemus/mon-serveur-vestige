import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Stripe from "stripe";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Configuration Stripe
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzquuMWFN6R_Z4B9OKfTFgWSKBW3zeJTFZqgpjcInP9l3t7Q6u58v8HH1EuKls2qbvATA/exec";
const stripe = new Stripe(STRIPE_SECRET_KEY);

// Routes pour les cours (existantes)
app.post("/register-free", async (req, res) => {
  try {
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
      type: "cours",
      nom: user.nom,
      prenom: user.prenom,
      age: user.age,
      email: user.email,
      telephone: user.telephone,
      ville: user.ville,
      premier_cours: user.premier_cours || "Non",
      recapitulatif: JSON.stringify(recap)
    });

    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: params.toString()
    });

    res.json({ success: true, data: await response.text() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const user = req.body;
    const amount = Math.round(Number(user.amount) * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: `Cours: ${user.course.style} - ${user.course.date} ${user.course.time}`
          },
          unit_amount: amount
        },
        quantity: 1
      }],
      mode: "payment",
      customer_email: user.email,
      success_url: "https://vestige-officiel.com/success",
      cancel_url: "https://vestige-officiel.com/cancel",
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

    res.json({ id: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Nouvelle route pour les dons
app.post("/create-donation-session", async (req, res) => {
  try {
    const { amount, name, email, message } = req.body;
    const amountInCents = Math.round(Number(amount) * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: "Don à Vestige",
            description: message || "Merci pour votre soutien !"
          },
          unit_amount: amountInCents
        },
        quantity: 1
      }],
      mode: "payment",
      customer_email: email,
      metadata: {
        donor_name: name,
        donor_email: email,
        custom_message: message || "",
        type: "don" // Pour identification facile dans le webhook
      },
      success_url: "https://vestige-officiel.com/merci-don",
      cancel_url: "https://vestige-officiel.com/annulation-don"
    });

    res.json({ id: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook unifié pour cours et dons
app.post("/webhook-stripe", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("⚠️ Erreur de signature webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const isDon = session.metadata.type === "don";

    try {
      if (isDon) {
        // Traitement des dons
        const params = new URLSearchParams({
          type: "don",
          montant: `${session.amount_total / 100}€`,
          donateur: session.metadata.donor_name || "Anonyme",
          email: session.customer_email,
          message: session.metadata.custom_message || "",
          date: new Date().toISOString()
        });

        await fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString()
        });
        console.log("💰 Don enregistré dans Google Sheets");
      } else {
        // Traitement des cours (existant)
        const user = JSON.parse(session.metadata.userData);
        const course = JSON.parse(session.metadata.courseData);

        const params = new URLSearchParams({
          type: "cours",
          nom: user.nom,
          prenom: user.prenom,
          age: user.age,
          email: user.email,
          telephone: user.telephone,
          ville: user.ville,
          premier_cours: user.premier_cours || "Non",
          recapitulatif: JSON.stringify({
            Style: course.style,
            Date: course.date,
            Horaire: course.time,
            Professeur: course.teacher,
            Niveau: course.level,
            Tarif: course.price
          })
        });

        await fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString()
        });
        console.log("🎓 Cours enregistré dans Google Sheets");
      }
    } catch (error) {
      console.error("Erreur lors de l'enregistrement:", error);
    }
  }

  res.status(200).send("Webhook traité");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur lancé sur le port ${PORT}`));
