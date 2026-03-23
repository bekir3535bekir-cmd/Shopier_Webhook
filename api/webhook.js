const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    let pk = process.env.FIREBASE_PRIVATE_KEY || "";
    if (pk.startsWith('"') && pk.endsWith('"')) pk = pk.substring(1, pk.length - 1);
    pk = pk.replace(/\\n/g, '\n');

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: pk,
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

        const extractField = (name) => {
            const regex = new RegExp(`name="${name}"[\\r\\n\\t\\s]+([^\\r\\n-]+)`, 'i');
            const match = rawBody.match(regex);
            return match ? match[1].trim() : null;
        };

        let shopierRes = extractField('res') || new URLSearchParams(rawBody).get('res');
        let shopierHash = extractField('hash') || new URLSearchParams(rawBody).get('hash');

        if (!shopierRes) return res.status(400).send('No Data');

        const generatedHash = crypto.createHmac('sha256', API_SECRET).update(shopierRes + API_USER).digest('hex');
        if (generatedHash !== shopierHash) return res.status(401).send('Hash Error');

        const arrayResult = JSON.parse(Buffer.from(shopierRes, 'base64').toString('utf8'));
        const buyerEmail = arrayResult.email;
        const productName = (arrayResult.productlist || "").toLowerCase();

        const user = await admin.auth().getUserByEmail(buyerEmail);
        
        let durationDays = 30; let tag = "1m";
        if (productName.includes("6 ay")) { durationDays = 180; tag = "6m"; }
        else if (productName.includes("1 yıl") || productName.includes("yıllık")) { durationDays = 365; tag = "1y"; }
        else if (productName.includes("sınırsız")) { durationDays = 9999; tag = "unlimited"; }

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + durationDays);
        const expiryString = expiryDate.toISOString().split('T')[0];

        let finalPhotoUrl = tag === "unlimited" ? "https://shopier.pro/unlimited" : `https://shopier.pro/expiry/${expiryString}/${tag}`;

        await admin.auth().updateUser(user.uid, { photoURL: finalPhotoUrl });
        return res.status(200).send('success');
    } catch (error) {
        console.error("Sistem Hatasi:", error.message);
        return res.status(200).send('success');
    }
}

export const config = { api: { bodyParser: false } };
