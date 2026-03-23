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

const getRawBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
});

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Not Allowed');

    try {
        const API_USER = process.env.SHOPIER_API_USER;
        const API_SECRET = process.env.SHOPIER_API_SECRET;

        const rawBody = await getRawBody(req);

        // MULTIPART PARSER: res ve hash degerlerini ham metin icinden ceker
        const extractField = (name) => {
            const regex = new RegExp(`name="${name}"[\\r\\n\\t\\s]+([^\\r\\n-]+)`, 'i');
            const match = rawBody.match(regex);
            return match ? match[1].trim() : null;
        };

        let shopierRes = extractField('res');
        let shopierHash = extractField('hash');

        // Alternatif olarak standart form-urlencoded denemesi
        if (!shopierRes) {
            const params = new URLSearchParams(rawBody);
            shopierRes = params.get('res');
            shopierHash = params.get('hash');
        }

        if (!shopierRes || !shopierHash) {
            console.error("Hata: Veri ayiklanamadi. Ham Veri:", rawBody.substring(0, 100));
            return res.status(400).send('Data extraction failed');
        }

        const dataString = shopierRes + API_USER;
        const generatedHash = crypto.createHmac('sha256', API_SECRET).update(dataString).digest('hex');

        if (generatedHash !== shopierHash) {
            return res.status(401).send('Hash mismatch');
        }

        const jsonString = Buffer.from(shopierRes, 'base64').toString('utf8');
        const arrayResult = JSON.parse(jsonString);

        const buyerEmail = arrayResult.email;
        const productName = (arrayResult.productlist || "").toLowerCase();

        const user = await admin.auth().getUserByEmail(buyerEmail);
        
        let durationDays = 30; 
        let tag = "1m";

        if (productName.includes("6 ay")) { durationDays = 180; tag = "6m"; }
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
        console.error("Sistem Hatasi:", error.message);
        return res.status(200).send('success'); // Shopier'i mutlu et
    }
}

export const config = {
    api: { bodyParser: false },
};
