const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const API_USER = process.env.SHOPIER_API_USER;
    const API_SECRET = process.env.SHOPIER_API_SECRET;

    // Vercel body'yi parse edemezse veya form-encoded ise manuel yakala
    const payload = req.body || {};
    const shopierRes = payload.res;
    const shopierHash = payload.hash;

    if (!shopierRes || !shopierHash) {
        console.error("Hata: Shopier'den eksik veri geldi (res veya hash yok).");
        return res.status(400).send('Missing parameter');
    }

    const dataString = shopierRes + API_USER;
    const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');

    if (generatedHash !== shopierHash) {
        console.error("Guvenlik Uyarisi: Gecersiz Hash!");
        return res.status(401).send('Invalid Hash');
    }

    let arrayResult;
    try {
        const jsonString = Buffer.from(shopierRes, 'base64').toString('utf8');
        arrayResult = JSON.parse(jsonString);
    } catch (e) { 
        console.error("Base64 cozme hatasi:", e);
        return res.status(400).send('Bad Data'); 
    }

    const buyerEmail = arrayResult.email;
    const productName = (arrayResult.productlist || "").toLowerCase();

    try {
        const user = await admin.auth().getUserByEmail(buyerEmail);
        
        // Varsayılan 1 Ay (30 Gün)
        let durationDays = 30; 
        let tag = "1m";

        // Ürün adına göre hesapla
        if (productName.includes("6 ay")) {
            durationDays = 180;
            tag = "6m";
        } else if (productName.includes("1 yıl") || productName.includes("yıllık")) {
            durationDays = 365;
            tag = "1y";
        } else if (productName.includes("sınırsız")) {
            durationDays = 9999;
            tag = "unlimited";
        }

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + durationDays);
        const expiryString = expiryDate.toISOString().split('T')[0];

        // Foto URL içine bilgiyi damgala (Eklenti buradan okur)
        // Ornek URL: https://shopier.pro/expiry/2024-05-24/1m
        let finalPhotoUrl = `https://shopier.pro/expiry/${expiryString}/${tag}`;
        if (tag === "unlimited") finalPhotoUrl = "https://shopier.pro/unlimited";

        await admin.auth().updateUser(user.uid, { photoURL: finalPhotoUrl });
        console.log(`BASARILI: ${buyerEmail} on ${tag} paketi aktif edildi.`);
    } catch (error) { 
        console.error(`Hata: ${buyerEmail} kullanicisi Firebase'de bulunamadi.`); 
    }

    // Shopier'e basarili yanıt dön
    res.status(200).send('success');
}
