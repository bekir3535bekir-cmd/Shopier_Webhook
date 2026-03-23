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

// VERİ VAKUMU (Body Parser)
const getRawBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', err => reject(err));
    });
};

module.exports = async (req, res) => {
    try {
        if (req.method !== 'POST') return res.status(200).send('Webhook is alive!');

        // Veriyi vakumla çek ve objeye çevir
        const rawBody = await getRawBody(req);
        const params = new URLSearchParams(rawBody);
        const payload = Object.fromEntries(params);

        if (!payload || !payload.res || !payload.hash) {
            console.log("Eksik veri yakalandı, ama Shopier'e çaktırma.");
            return res.status(200).send('success');
        }

        const API_USER = process.env.SHOPIER_API_USER;
        const API_SECRET = process.env.SHOPIER_API_SECRET;

        // Hash Kontrolü
        const dataString = payload.res + API_USER;
        const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');

        if (generatedHash !== payload.hash) {
            console.error("Güvenlik: Hash uyuşmadı");
            return res.status(200).send('success');
        }

        // Müşteri Bilgisini Çöz
        const jsonString = Buffer.from(payload.res, 'base64').toString('utf8');
        const arrayResult = JSON.parse(jsonString);
        const buyerEmail = arrayResult.email;

        // Firebase Pro Yap
        try {
            const userRecord = await admin.auth().getUserByEmail(buyerEmail);
            await admin.auth().updateUser(userRecord.uid, {
                photoURL: 'https://shopier.pro/unlimited'
            });
            console.log(`İŞLEM OK: ${buyerEmail} artık SINIRSIZ!`);
        } catch (err) {
            console.log(`Firebase Hatası (Üye olmayabilir): ${buyerEmail}`);
        }

        // Shopier'e her şey yolunda de
        res.status(200).send('success');

    } catch (err) {
        console.error("Sistem Hatası:", err.message);
        res.status(200).send('success');
    }
};
