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

// Ham veriyi (raw body) okuma fonksiyonu
const getRawBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', err => reject(err));
    });
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const API_USER = process.env.SHOPIER_API_USER;
        const API_SECRET = process.env.SHOPIER_API_SECRET;

        // Vercel body-parser kapali oldugu icin veriyi sifirdan okuyoruz
        const rawBody = await getRawBody(req);
        const body = Object.fromEntries(new URLSearchParams(rawBody));

        const shopierRes = body.res;
        const shopierHash = body.hash;

        if (!shopierRes || !shopierHash) {
            console.error("Hata: Raw Body bos geldi veya res/hash yok. Gelen:", rawBody);
            return res.status(400).send('Missing parameter');
        }

        const dataString = shopierRes + API_USER;
        const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');

        if (generatedHash !== shopierHash) {
            return res.status(401).send('Invalid Hash');
        }

        const jsonString = Buffer.from(shopierRes, 'base64').toString('utf8');
        const arrayResult = JSON.parse(jsonString);

        const buyerEmail = arrayResult.email;
        const productName = (arrayResult.productlist || "").toLowerCase();

        const user = await admin.auth().getUserByEmail(buyerEmail);
        
        // Lisans Sureleri
        let durationDays = 7; 
        let tag = "trial";

        if (productName.includes("1 ay")) { durationDays = 30; tag = "1m"; }
        else if (productName.includes("6 ay")) { durationDays = 180; tag = "6m"; }
        else if (productName.includes("1 yıl") || productName.includes("yıllık")) { durationDays = 365; tag = "1y"; }
        else if (productName.includes("sınırsız")) { durationDays = 9999; tag = "unlimited"; }

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + durationDays);
        const expiryString = expiryDate.toISOString().split('T')[0];

        let finalPhotoUrl = `https://shopier.pro/expiry/${expiryString}/${tag}`;
        if (tag === "unlimited") finalPhotoUrl = "https://shopier.pro/unlimited";

        await admin.auth().updateUser(user.uid, { photoURL: finalPhotoUrl });
        
        return res.status(200).send('success');
    } catch (error) {
        console.error("Hata Detayi:", error.message);
        return res.status(200).send('success');
    }
}

// KRITIK AYAR: Vercel'in otomatik body parser'ini kapatiyoruz ki manuel okuyabilelim
export const config = {
    api: {
        bodyParser: false,
    },
};
