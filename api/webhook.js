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
    const payload = req.body;
    if (!payload.res || !payload.hash) return res.status(400).send('Missing parameter');
    const dataString = payload.res + API_USER;
    const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');
    if (generatedHash !== payload.hash) return res.status(401).send('Invalid Hash');
    let arrayResult;
    try {
        const jsonString = Buffer.from(payload.res, 'base64').toString('utf8');
        arrayResult = JSON.parse(jsonString);
    } catch (e) { return res.status(400).send('Bad Data'); }
    const buyerEmail = arrayResult.email;
    const productName = (arrayResult.productlist || "").toLowerCase();
    try {
        const user = await admin.auth().getUserByEmail(buyerEmail);
        let durationDays = 30; // Varsayilan 1 Ay
        let tag = "1m";
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
        // Ornek: https://shopier.pro/expiry/2024-04-24/1m
        let finalPhotoUrl = `https://shopier.pro/expiry/${expiryString}/${tag}`;
        if (tag === "unlimited") finalPhotoUrl = "https://shopier.pro/unlimited";
        await admin.auth().updateUser(user.uid, { photoURL: finalPhotoUrl });
        console.log(`BASARILI: ${buyerEmail} kullanicisi ${tag} olarak guncellendi.`);
    } catch (error) { console.error(`Hata: ${buyerEmail} bulunamadi.`, error); }
    res.status(200).send('success');
}
