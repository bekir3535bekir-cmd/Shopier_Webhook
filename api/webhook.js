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

    // TERCÜMAN: Eğer veri eski usul gelmişse onu objeye çevir
    let payload = req.body;
    if (typeof payload === 'string') {
        const params = new URLSearchParams(payload);
        payload = Object.fromEntries(params);
    }
    
    if (!payload.res || !payload.hash) {
        console.error("Parametre eksik:", payload);
        return res.status(400).send('missing parameter');
    }

    // HASHLAMA (Garantili PHP Mantığı)
    const dataString = payload.res + API_USER;
    const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');

    if (generatedHash !== payload.hash) {
        console.error("Güvenlik: Hash uyuşmadı!");
        return res.status(401).send('Geçersiz Güvenlik İmzası');
    }

    let arrayResult;
    try {
        const jsonString = Buffer.from(payload.res, 'base64').toString('utf8');
        arrayResult = JSON.parse(jsonString);
    } catch (e) {
        return res.status(400).send('Bozuk Veri');
    }

    const buyerEmail = arrayResult.email;

    try {
        const userRecord = await admin.auth().getUserByEmail(buyerEmail);
        await admin.auth().updateUser(userRecord.uid, {
            photoURL: 'https://shopier.pro/unlimited'
        });
        console.log(`BİNGO! SUCCESS: ${buyerEmail}`);
    } catch (error) {
        console.log(`Kullanıcı henüz kayıtlı değil ama ödeme OK: ${buyerEmail}`);
    }

    // Shopier'in beklediği sihirli kelime
    res.status(200).send('success');
}
