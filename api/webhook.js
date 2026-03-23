const crypto = require('crypto');
const admin = require('firebase-admin');

// Firebase Başlatma (Hata vermemesi için korumalı)
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
        });
    }
} catch (e) {
    console.error("Firebase başlatma hatası:", e);
}

module.exports = async (req, res) => {
    // Sadece POST destekliyoruz
    if (req.method !== 'POST') return res.status(200).send('Webhook is alive!');

    const API_USER = process.env.SHOPIER_API_USER;
    const API_SECRET = process.env.SHOPIER_API_SECRET;

    // SHOPİER VERİ PARSER (Garantili Mod)
    let payload = req.body;
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
        try {
            const params = new URLSearchParams(payload.toString());
            payload = Object.fromEntries(params);
        } catch (e) {
            console.error("Parser Hatası:", e);
        }
    }

    if (!payload.res || !payload.hash) {
        return res.status(200).send('missing parameters');
    }

    // GÜVENLİK KONTROLÜ (Hash Doğrulama)
    const dataString = payload.res + API_USER;
    const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');

    if (generatedHash !== payload.hash) {
        console.error("Güvenlik: Hashler tutmuyor!");
        return res.status(200).send('hash mismatch');
    }

    // VERİYİ ÇÖZ
    let arrayResult;
    try {
        const jsonString = Buffer.from(payload.res, 'base64').toString('utf8');
        arrayResult = JSON.parse(jsonString);
    } catch (e) {
        return res.status(200).send('json error');
    }

    const buyerEmail = arrayResult.email;

    // FIREBASE PRO GÜNCELLEME
    try {
        const userRecord = await admin.auth().getUserByEmail(buyerEmail);
        await admin.auth().updateUser(userRecord.uid, {
            photoURL: 'https://shopier.pro/unlimited'
        });
        console.log(`BAŞARILI: ${buyerEmail} artık PRO!`);
    } catch (error) {
        console.log(`Bilgi: ${buyerEmail} henüz üye değil veya hata oluştu.`);
    }

    // Shopier'in beklediği onay
    res.status(200).send('success');
};
