const crypto = require('crypto');
const admin = require('firebase-admin');

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
} catch (e) { console.log("Init hatası"); }

module.exports = async (req, res) => {
    const replySuccess = () => res.status(200).send('success');

    try {
        if (req.method !== 'POST') return res.send('Connected');

        let rawBody = '';
        await new Promise((resolve) => {
            req.on('data', chunk => rawBody += chunk);
            req.on('end', resolve);
        });

        const params = new URLSearchParams(rawBody);
        const payload = Object.fromEntries(params);

        if (!payload || !payload.res) return replySuccess();

        const API_USER = process.env.SHOPIER_API_USER;
        const API_SECRET = process.env.SHOPIER_API_SECRET;

        const dataString = payload.res + API_USER;
        const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');

        if (generatedHash !== payload.hash) return replySuccess();

        const arrayResult = JSON.parse(Buffer.from(payload.res, 'base64').toString('utf8'));
        const buyerEmail = arrayResult.email;
        const productName = arrayResult.productlist || "";

        // SÜRE VE TİP BELİRLE
        let daysToAdd = 30;
        let pType = '1m';
        if (productName.includes("6 Ay")) { daysToAdd = 180; pType = '6m'; }
        if (productName.includes("Yıllık") || productName.includes("12 Ay")) { daysToAdd = 365; pType = '1y'; }

        // BİTİŞ TARİHİ
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + daysToAdd);
        const expiryString = expiryDate.toISOString().split('T')[0];

        try {
            const userRecord = await admin.auth().getUserByEmail(buyerEmail);
            // Örnek: https://shopier.pro/expiry/2026-04-23/1m
            await admin.auth().updateUser(userRecord.uid, {
                photoURL: `https://shopier.pro/expiry/${expiryString}/${pType}`
            });
            console.log(`ZAMANLI PRO (${pType}): ${buyerEmail}`);
        } catch (err) { console.log("Hata: " + buyerEmail); }

        return replySuccess();

    } catch (err) { return replySuccess(); }
};
